import { Registry } from '../../packages/sim-kernel/index.ts';
import type { Equipment, Port } from '../../packages/contracts/index.ts';
export interface Parameter {
    key: string;
    label: string;
    unit: string;
    min: number;
    max: number;
    default: number;
}
export interface EquipmentPlugin {
    type: string;
    label: string;
    parameters: Parameter[];
    ports: (node: Equipment) => Port[];
    capacity: (node: Equipment) => number;
}
const param = (key: string, label: string, unit: string, value: number, min = 0, max = 100000): Parameter => ({ key, label, unit, min, max, default: value });
const port = (id: string, domain: 'AC' | 'DC', voltage: number, direction: 'input' | 'output'): Port => ({ id, domain, voltage, tolerance: 0.06, direction });
export const equipmentRegistry = new Registry<EquipmentPlugin>();
equipmentRegistry.register({ type: 'grid', label: '電網接入', parameters: [param('kva', '接入容量', 'kVA', 6000), param('pf', '功率因數', '', .95, .1, 1)], ports: () => [port('out', 'AC', 10000, 'output')], capacity: n => n.params.kva * n.params.pf });
equipmentRegistry.register({ type: 'sst', label: 'SST', parameters: [param('kw', '額定輸出', 'kW', 1680)], ports: () => [port('in', 'AC', 10000, 'input'), port('out', 'DC', 800, 'output')], capacity: n => n.params.kw });
equipmentRegistry.register({ type: 'transformer', label: '箱式變壓器', parameters: [param('kva', '容量', 'kVA', 2500), param('pf', '功率因數', '', .95, .1, 1)], ports: () => [port('in', 'AC', 10000, 'input'), port('out', 'AC', 400, 'output')], capacity: n => n.params.kva * n.params.pf });
equipmentRegistry.register({ type: 'pcs', label: 'PCS', parameters: [param('kw', '額定輸出', 'kW', 1600)], ports: () => [port('in', 'AC', 380, 'input'), port('out', 'DC', 800, 'output')], capacity: n => n.params.kw });
equipmentRegistry.register({ type: 'bus', label: 'DC 母線', parameters: [param('voltage', '母線電壓', 'V', 800, 100, 1500), param('amps', '電流上限', 'A', 6000)], ports: n => [port('in', 'DC', n.params.voltage, 'input'), port('out', 'DC', n.params.voltage, 'output')], capacity: n => n.params.voltage * n.params.amps / 1000 });
equipmentRegistry.register({ type: 'charger', label: 'DD 共享充電', parameters: [param('kw', '共享輸出', 'kW', 4480)], ports: () => [port('in', 'DC', 800, 'input'), port('out', 'DC', 800, 'output')], capacity: n => n.params.kw });
export function makeNode(type: string, id: string, station: 'A' | 'B', x: number, y: number, params: Record<string, number> = {}): Equipment { const plugin = equipmentRegistry.get(type); return { id, type, name: plugin.label, station, x, y, enabled: true, params: { ...Object.fromEntries(plugin.parameters.map(p => [p.key, p.default])), ...params } }; }
