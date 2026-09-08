import type { Project, RunResult, HourResult, Transaction, StationId, ServiceRow } from '../contracts/index.ts';
import { EventQueue, SeededRandom, SimulationClock } from '../sim-kernel/index.ts';
import { allocatePower } from '../electrical-engine/index.ts';
import { bill } from '../economics-engine/index.ts';
import { validateTopology, sourceDiagnostics } from '../topology-engine/index.ts';
import { parseProject } from '../schemas/index.ts';
const ids: StationId[] = ['A', 'B'];
export const ENGINE_VERSION = '0.1.0';
const blank = (row: ServiceRow): HourResult => ({ hour: row.hour, station: row.station, requestedKWh: row.swapKWh + row.chargeKWh, deliveredKWh: 0, swapCount: 0, chargeCount: 0, gridKWh: 0, lossKWh: 0, auxiliaryKWh: 0, revenue: 0, gridCost: 0, ready: 0, queue: 0, storedKWh: 0, balanceResidual: 0, peakKW: 0 });
function finish(p: Project, hours: HourResult[], transactions: Transaction[], initialStoredKWh: number, finalStoredKWh: number, diagnostics: RunResult['diagnostics']): RunResult {
    const sum = (key: keyof HourResult) => hours.reduce((a, h) => a + Number(h[key]), 0);
    const deliveredKWh = sum('deliveredKWh'), requestedKWh = sum('requestedKWh');
    return { engineVersion: ENGINE_VERSION, parameterSnapshot: structuredClone(p), mode: p.mode, hours, transactions, diagnostics, totals: { deliveredKWh, requestedKWh, gridKWh: sum('gridKWh'), lossKWh: sum('lossKWh'), revenue: sum('revenue'), gridCost: sum('gridCost'), completed: sum('swapCount') + sum('chargeCount'), unservedKWh: Math.max(0, requestedKWh - deliveredKWh), initialStoredKWh, finalStoredKWh, maxBalanceResidual: Math.max(...hours.map(h => Math.abs(h.balanceResidual))) } };
}
export function replay(input: Project): RunResult { const p = parseProject(input); p.mode = 'SOURCE_REPLAY'; const hours = p.services.map(r => ({ ...blank(r), deliveredKWh: r.swapKWh + r.chargeKWh, swapCount: r.swapCount, chargeCount: r.chargeCount, revenue: bill(r, 'swap', r.swapKWh, p.billing) + bill(r, 'charge', r.chargeKWh, p.billing) })); return finish(p, hours, [], 0, 0, sourceDiagnostics(p)); }
interface Battery {
    energy: number;
    reserved: boolean;
}
interface Station {
    batteries: Battery[];
    swapQueue: Transaction[];
    chargeQueue: Transaction[];
    charging: Transaction[];
    busy: number;
}
type Event = {
    kind: 'arrival';
    job: Transaction;
} | {
    kind: 'swap-complete';
    job: Transaction;
    battery: Battery;
};
export function simulate(input: Project): RunResult {
    const p = parseProject(input);
    if (p.mode === 'SOURCE_REPLAY')
        return replay(p);
    const diagnostics = [...validateTopology(p.topology), ...sourceDiagnostics(p)];
    if (diagnostics.some(d => d.severity === 'error'))
        throw Error(diagnostics.filter(d => d.severity === 'error').map(d => d.message).join('\n'));
    for (const s of ids)
        if (!p.topology.nodes.some(n => n.id === `${s}-charger` && n.type === 'charger'))
            throw Error(`Missing station sink: ${s}-charger`);
    const rows = new Map(p.services.map(r => [`${r.station}:${r.hour}`, r]));
    const hours = p.services.map(blank);
    const hourly = new Map(hours.map(h => [`${h.station}:${h.hour}`, h]));
    const getHour = (s: StationId, t: number) => hourly.get(`${s}:${Math.min(23, Math.floor(t / 60))}`)!;
    const getRate = (s: StationId, t: number) => rows.get(`${s}:${Math.min(23, Math.floor(t / 60))}`)!;
    const makeState = (s: StationId): Station => ({ batteries: Array.from({ length: p.station[s].batteries }, () => ({ energy: p.station[s].capacityKWh * p.station[s].readySOC, reserved: false })), swapQueue: [], chargeQueue: [], charging: [], busy: 0 });
    const states: Record<StationId, Station> = { A: makeState('A'), B: makeState('B') };
    const stored = (s: StationId) => states[s].batteries.reduce((a, b) => a + b.energy, 0);
    const initial = Object.fromEntries(ids.map(s => [s, stored(s)])) as Record<StationId, number>;
    const ready = (s: StationId) => states[s].batteries.filter(b => !b.reserved && b.energy >= p.station[s].capacityKWh * p.station[s].readySOC - 1e-8).length;
    const queue = new EventQueue<Event>(), random = new SeededRandom(p.seed), clock = new SimulationClock();
    const transactions: Transaction[] = [];
    for (const r of p.services)
        for (const kind of ['swap', 'charge'] as const) {
            const count = kind === 'swap' ? r.swapCount : r.chargeCount;
            const energy = kind === 'swap' ? r.swapKWh : r.chargeKWh;
            for (let i = 0; i < count; i++) {
                const arrival = r.hour * 60 + (p.arrival === 'SEEDED' ? random.next() * 60 : i * 60 / count);
                const job: Transaction = { id: `${r.station}-${r.hour}-${kind}-${i}`, station: r.station, kind, arrival, start: null, completion: null, requestedKWh: energy / count, deliveredKWh: 0 };
                transactions.push(job);
                queue.schedule(arrival, { kind: 'arrival', job });
            }
        }
    for (const s of ids) {
        const physical = p.station[s].capacityKWh * (p.station[s].readySOC - p.station[s].returnSOC);
        if (transactions.some(t => t.station === s && t.kind === 'swap' && Math.abs(t.requestedKWh - physical) > 1e-6))
            diagnostics.push({ code: 'SWAP_ENERGY_MISMATCH', severity: 'warning', message: `${s} 換電請求與電池SOC窗口 ${physical.toFixed(2)}kWh 不符，無法配對的請求將保留排隊。` });
    }
    const process = (time: number) => { for (const event of queue.takeThrough(time)) {
        const e = event.payload, s = e.job.station, st = states[s], h = getHour(s, Math.max(0, time - 1e-9));
        if (e.kind === 'arrival') {
            (e.job.kind === 'swap' ? st.swapQueue : st.chargeQueue).push(e.job);
        }
        else {
            e.battery.energy = p.station[s].capacityKWh * p.station[s].returnSOC;
            e.battery.reserved = false;
            st.busy--;
            e.job.completion = time;
            e.job.deliveredKWh = e.job.requestedKWh;
            h.swapCount++;
            h.deliveredKWh += e.job.deliveredKWh;
            h.revenue += bill(getRate(s, Math.max(0, time - 1e-9)), 'swap', e.job.deliveredKWh, p.billing);
        }
    } };
    while (clock.now < 1440 - 1e-9) {
        const t = clock.now;
        process(t);
        for (const s of ids) {
            const st = states[s], c = p.station[s];
            while (st.busy < c.bays && st.swapQueue.length) {
                const job = st.swapQueue[0];
                if (Math.abs(job.requestedKWh - c.capacityKWh * (c.readySOC - c.returnSOC)) > 1e-6)
                    break;
                const b = st.batteries.find(b => !b.reserved && b.energy >= c.capacityKWh * c.readySOC - 1e-8);
                if (!b)
                    break;
                st.swapQueue.shift();
                b.reserved = true;
                st.busy++;
                job.start = t;
                queue.schedule(t + c.swapMinutes, { kind: 'swap-complete', job, battery: b });
            }
            while (st.charging.length < c.guns && st.chargeQueue.length) {
                const job = st.chargeQueue.shift()!;
                job.start = t;
                st.charging.push(job);
            }
        }
        const next = Math.min(1440, Math.floor(t + 1e-8) + 1, queue.nextTime());
        const dt = (next - t) / 60;
        if (dt <= 0)
            throw Error('Scheduler failed to advance');
        const demands = ids.map(s => { const st = states[s], c = p.station[s]; const canCharge = p.strategy === 'IMMEDIATE' || getRate(s, t).gridPrice < .7 || ready(s) < Math.max(2, c.bays * 2); const batteries = st.batteries.map(b => !b.reserved && canCharge ? Math.min(c.batteryChargeKW, Math.max(0, c.capacityKWh * c.readySOC - b.energy) / dt) : 0); const ev = st.charging.map(j => Math.min(c.gunKW, Math.max(0, j.requestedKWh - j.deliveredKWh) / dt)); const evTotal = ev.reduce((a, b) => a + b, 0); const factor = evTotal > 0 ? Math.min(1, c.chargePoolKW / evTotal) : 0; return { s, batteries, ev: ev.map(v => v * factor), kw: batteries.reduce((a, b) => a + b, 0) + evTotal * factor }; });
        const allocations = allocatePower(p, [...ids.map(s => ({ sink: `${s}-grid`, kw: p.station[s].auxiliaryKW })), ...demands.map(d => ({ sink: `${d.s}-charger`, kw: d.kw }))]);
        for (const [i, d] of demands.entries()) {
            const s = d.s, st = states[s], h = getHour(s, t), a = allocations[i + 2], aux = allocations[i];
            h.gridKWh += (a.grid + aux.grid) * dt;
            h.lossKWh += (a.loss + aux.loss) * dt;
            h.auxiliaryKWh += aux.delivered * dt;
            h.peakKW = Math.max(h.peakKW, a.grid + aux.grid);
            for (const item of [a, aux])
                for (const [source, kw] of Object.entries(item.sourceImport)) {
                    const sourceStation = p.topology.nodes.find(n => n.id === source)!.station;
                    h.gridCost += kw * dt * getRate(sourceStation, t).gridPrice;
                }
            const fraction = d.kw > 0 ? a.delivered / d.kw : 0;
            st.batteries.forEach((b, index) => b.energy += d.batteries[index] * fraction * dt);
            st.charging.forEach((job, index) => { const energy = d.ev[index] * fraction * dt; job.deliveredKWh += energy; h.deliveredKWh += energy; h.revenue += bill(getRate(s, t), 'charge', energy, p.billing); if (job.deliveredKWh >= job.requestedKWh - 1e-8) {
                job.completion = next;
                h.chargeCount++;
            } });
            st.charging = st.charging.filter(j => j.completion === null);
            h.ready = ready(s);
            h.queue = st.swapQueue.length + st.chargeQueue.length;
            h.storedKWh = stored(s);
        }
        clock.advance(next);
        if (Math.abs(next / 60 - Math.round(next / 60)) < 1e-9) {
            process(next);
            for (const s of ids) {
                const h = getHour(s, next - 1e-9);
                h.storedKWh = stored(s);
                h.ready = ready(s);
                h.queue = states[s].swapQueue.length + states[s].chargeQueue.length;
            }
        }
    }
    process(1440);
    for (const s of ids) {
        let before = initial[s];
        for (let hour = 0; hour < 24; hour++) {
            const h = hourly.get(`${s}:${hour}`)!;
            h.balanceResidual = h.gridKWh - h.lossKWh - h.auxiliaryKWh - h.deliveredKWh - (h.storedKWh - before);
            before = h.storedKWh;
            if (Math.abs(h.balanceResidual) > .01)
                diagnostics.push({ code: 'ENERGY_BALANCE', severity: 'error', message: `${s} ${hour}時能量殘差 ${h.balanceResidual.toFixed(4)} kWh` });
        }
    }
    const result = finish(p, hours, transactions, initial.A + initial.B, stored('A') + stored('B'), diagnostics);
    if (result.totals.finalStoredKWh < result.totals.initialStoredKWh - .01)
        result.diagnostics.push({ code: 'ENDING_INVENTORY', severity: 'warning', message: `期末電池能源較期初少 ${(result.totals.initialStoredKWh - result.totals.finalStoredKWh).toFixed(1)} kWh；不能直接把本日現金餘額當長期可持續利潤。` });
    return result;
}
