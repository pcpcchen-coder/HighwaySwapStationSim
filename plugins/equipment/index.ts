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
equipmentRegistry.register({ type: 'transformer', label: '箱式變壓器', parameters: [param('kva', '容量', 'kVA', 2500), param('pf', '功率因數', '', .95, .1, 1)], ports: () => [port('in', 'AC', 10000, 'input'), port('out', 'AC', 400, 'output')], capacity: n => n.params.kva * n.params.pf * (n.params.outputEfficiency ?? 1) });
equipmentRegistry.register({ type: 'pcs', label: 'PCS', parameters: [param('kw', '額定輸出', 'kW', 1600)], ports: () => [port('in', 'AC', 380, 'input'), port('out', 'DC', 800, 'output')], capacity: n => n.params.kw });
equipmentRegistry.register({ type: 'bus', label: 'DC 母線', parameters: [param('voltage', '母線電壓', 'V', 800, 100, 1500), param('amps', '電流上限', 'A', 6000)], ports: n => [port('in', 'DC', n.params.voltage, 'input'), port('out', 'DC', n.params.voltage, 'output')], capacity: n => n.params.voltage * n.params.amps / 1000 });
equipmentRegistry.register({ type: 'charger', label: 'DD 共享充電', parameters: [param('kw', '共享輸出', 'kW', 4480)], ports: () => [port('in', 'DC', 800, 'input'), port('out', 'DC', 800, 'output')], capacity: n => n.params.kw });
export function makeNode(type: string, id: string, station: 'A' | 'B', x: number, y: number, params: Record<string, number> = {}): Equipment { const plugin = equipmentRegistry.get(type); return { id, type, name: plugin.label, station, x, y, enabled: true, params: { ...Object.fromEntries(plugin.parameters.map(p => [p.key, p.default])), ...params } }; }

// Switching / metering nodes are ideal capacity constraints; no invented protection dynamics.
for (const [type, label, voltage, domain] of [
    ['mv-switch','10 kV 開關櫃',10000,'AC'], ['meter','10 kV 計量櫃',10000,'AC'],
    ['lv-bus','低壓饋線櫃',400,'AC'], ['ac-load','交流站用負載',400,'AC'],
    ['passenger','CATL 巧克力站',400,'AC'], ['terminal','雙槍終端',800,'DC'],
    ['rack','電池倉',800,'DC'], ['dc-switch','直流開關',800,'DC'], ['passenger-station','CATL 乘用車站供電',400,'AC'],
] as const) equipmentRegistry.register({type,label,parameters:[param('kw','功率上限','kW',10000)],
    ports:()=>['ac-load','passenger','rack'].includes(type)?[port('in',domain,voltage,'input')]:[port('in',domain,voltage,'input'),port('out',domain,voltage,'output')],capacity:n=>n.params.kw});
equipmentRegistry.register({type:'gun',label:'液冷充電槍',parameters:[param('kw','額定功率','kW',480),param('amps','最大電流','A',600),param('voltage','額定電壓上限','V',1000),param('vehicleVoltage','車端電壓','V',637.56)],ports:()=>[port('in','DC',800,'input')],capacity:n=>n.params.vehicleVoltage>n.params.voltage?0:Math.min(n.params.kw,n.params.amps*n.params.vehicleVoltage/1000)});
equipmentRegistry.register({type:'swap-bay',label:'重卡換電工位',parameters:[param('kw','站用上限','kW',200)],ports:()=>[port('in','AC',400,'input')],capacity:n=>n.params.kw});
equipmentRegistry.register({type:'compensation',label:'功率補償櫃',parameters:[param('kvar','補償額定（待確認）','kvar',0)],ports:()=>[port('in','AC',400,'input')],capacity:()=>0});
equipmentRegistry.register({type:'mv-cable',label:'10 kV 跨站線纜',parameters:[param('kva','支路容量','kVA',1750),param('pf','功率因數','',.99,.1,1),param('length','長度','m',150)],ports:()=>[port('in','AC',10000,'input'),port('out','AC',10000,'output')],capacity:n=>n.params.kva*n.params.pf});
equipmentRegistry.register({type:'dc-cable',label:'800 V 跨站母線',parameters:[param('kw','傳輸功率上限（假設）','kW',4000),param('length','長度','m',150)],ports:()=>[port('in','DC',800,'input'),port('out','DC',800,'output')],capacity:n=>n.params.kw});

// Detailed energy model uses separate charge/discharge ports for a physical
// store. They never manufacture a second inventory or charge simultaneously.
for (const [type,label,domain,voltage,source] of [
 ['pv-source','光伏直流來源','DC',800,true],
 ['storage-source','ESS 放電端','DC',800,true],
 ['ups-source','UPS 電池放電端','DC',800,true],
 ['grid-export','售回電網計量端','AC',10000,false],
 ['storage-sink','儲能充電端','DC',800,false],
 ['sharing-group','DD 共用功率組','DC',800,false],
 ['ats','ATS 隔離輸出','AC',400,false],
] as const) equipmentRegistry.register({type,label,parameters:[param('kw','功率上限','kW',0)],ports:()=>source?[port('out',domain,voltage,'output')]:['storage-sink','grid-export'].includes(type)?[port('in',domain,voltage,'input')]:[port('in',domain,voltage,'input'),port('out',domain,voltage,'output')],capacity:n=>n.params.kw});
for (const [type,label,inputDomain,inputV,outputDomain,outputV] of [
 ['mppt','光伏 MPPT','DC',800,'DC',800],
 ['storage-converter','儲能 DC/DC','DC',800,'DC',800],
 ['dcac','DC/AC 備援逆變器','DC',800,'AC',400],
 ['acdc','AC/DC 充電器','AC',400,'DC',800],
 ['export-converter','隔離併網轉換器','DC',800,'AC',10000],
] as const) equipmentRegistry.register({type,label,parameters:[param('kw','額定輸出','kW',0),param('eta','轉換效率','ratio',1,.001,1),param('inputVoltage','輸入電壓','V',inputV,1,20000),param('outputVoltage','輸出電壓','V',outputV,1,20000)],ports:n=>[port('in',inputDomain,n.params.inputVoltage??inputV,'input'),port('out',outputDomain,n.params.outputVoltage??outputV,'output')],capacity:n=>n.params.kw});
equipmentRegistry.register({type:'passenger-rack',label:'巧克力電池倉',parameters:[param('kw','補電功率','kW',0),param('voltage','直流電壓','V',800,1,1500)],ports:n=>[port('in','DC',n.params.voltage,'input')],capacity:n=>n.params.kw});
