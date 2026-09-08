import prices from '../../data/reference/august-price-profile.json' with { type: 'json' };
import services from '../../data/reference/august-service-profile.json' with { type: 'json' };
import { makeNode } from '../../plugins/equipment/index.ts';
import type { Project, ServiceRow, StationId, Topology } from '../contracts/index.ts';
export function referenceRows(): ServiceRow[] { return (['A', 'B'] as const).flatMap(station => services.map((raw, index) => { const row = raw as Record<string, number | null>, price = prices[index] as Record<string, number | string>; return { hour: index, station, swapCount: row[`${station}_swap_count`]!, swapKWh: row[`${station}_swap_kWh`]!, chargeCount: row[`${station}_charge_count`]!, chargeKWh: row[`${station}_charge_kWh`]!, idleRaw: row[`${station}_idle_raw`], gridPrice: Number(price.grid_purchase_CNY_per_kWh), swapFee: Number(price[`${station}_swap_fee`]), chargeFee: Number(price[`${station}_charge_fee`]), swapTotalRaw: Number(price[`${station}_swap_total_raw`]), chargeTotalRaw: Number(price[`${station}_charge_total_raw`]) }; })); }
export function presetTopology(phase: 1 | 2 = 1, path: 'sst' | 'pcs' | 'hybrid' = 'sst'): Topology { const nodes = []; const edges = []; for (const [index, s] of (['A', 'B'] as const).entries()) {
    const x = 80 + index * 540;
    nodes.push(makeNode('grid', `${s}-grid`, s, x, 50, { kva: s === 'A' ? (phase === 1 ? 6000 : 9500) : 2500 }), makeNode('sst', `${s}-sst`, s, x, 155, { kw: 1680 * phase }), makeNode('transformer', `${s}-transformer`, s, x + 235, 50), makeNode('pcs', `${s}-pcs`, s, x + 235, 155), makeNode('bus', `${s}-bus`, s, x + 80, 265), makeNode('charger', `${s}-charger`, s, x + 80, 370));
    for (const [a, b, enabled] of [[`${s === 'B' ? 'A' : s}-grid`, `${s}-sst`, path !== 'pcs'], [`${s}-grid`, `${s}-transformer`, path !== 'sst'], [`${s}-transformer`, `${s}-pcs`, path !== 'sst'], [`${s}-sst`, `${s}-bus`, path !== 'pcs'], [`${s}-pcs`, `${s}-bus`, path !== 'sst'], [`${s}-bus`, `${s}-charger`, true]] as [
        string,
        string,
        boolean
    ][])
        edges.push({ id: `${a}-${b}`, source: a, target: b, enabled });
} return { nodes, edges }; }
export function defaultProject(): Project { const station = () => ({ batteries: 24, capacityKWh: 500, readySOC: .95, returnSOC: .13, bays: 1, swapMinutes: 7.5, guns: 4, gunKW: 480, chargePoolKW: 1440, batteryChargeKW: 280, auxiliaryKW: 10 }); return { schemaVersion: '1.2', name: '八月・雙服務區基準', seed: 12345, phase: 1, mode: 'SOURCE_REPLAY', strategy: 'IMMEDIATE', arrival: 'SCHEDULED', topology: presetTopology(), services: referenceRows(), station: { A: station(), B: station() }, efficiency: { mode: 'SOURCE_CHAIN', sst: .9812, transformer: .975, pcs: .98, charger: .974, sstSource: .9557, pcsSource: .9307 }, billing: 'EXACT_COMPONENTS', finance: { capex: null, fixedDaily: null, variablePerKWh: 0, discountRate: .08, years: 10, rampMonths: 24, startLoad: .2, operatingDaysPerYear: 365 }, sources: [{ id: 'SRC-POWER-01', status: 'SOURCE_TRANSCRIBED', note: '一期/二期供電圖；工作版拓撲為明示簡化' }, { id: 'SRC-EFF-01', status: 'SOURCE_TRANSCRIBED', note: '加權效率，無負載曲線' }, { id: 'SRC-SCENE-01', status: 'CONFLICT', note: 'A充電合計差1次/2050kWh' }, { id: 'SRC-FIN-01', status: 'ASSUMPTION', note: '15000kWh/日、0.30服務費僅為訪談參考' }] }; }
export const sourceFooter: Record<StationId, {
    swap: number;
    swapKWh: number;
    charge: number;
    chargeKWh: number;
}> = { A: { swap: 67, swapKWh: 27470, charge: 35, chargeKWh: 12430 }, B: { swap: 61, swapKWh: 25010, charge: 31, chargeKWh: 10790 } };
