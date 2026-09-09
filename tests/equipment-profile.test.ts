import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentEfficiency } from '../packages/equipment-efficiency/index.ts';
import { exportEquipmentCSV,exportEquipmentJSON,importEquipmentProfile,setEquipmentEfficiency } from '../packages/equipment-profile/index.ts';
import { allocatePower,outputCapacity } from '../packages/electrical-engine/index.ts';
import { verificationCases } from '../packages/verification/cases.ts';
import { engineeringProject } from '../packages/engineering/index.ts';
import { simulate } from '../packages/station-engine/index.ts';
import { parseProject } from '../packages/schemas/index.ts';
import { exportWorkbook,importWorkbook } from '../packages/io/index.ts';
import { flowView } from '../packages/power-trace/index.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const csv=(...lines:string[])=>'equipmentId,type,field,value\n'+lines.join('\n');

test('per-device conversion overrides affect only their own branch; absent values follow defaults',()=>{
 let p=verificationCases()[0].project;p.efficiency.sst=1;p.efficiency.charger=.5;p=setEquipmentEfficiency(p,'A-sst',.8);
 let a=allocatePower(p,[{sink:'A-charger',kw:20},{sink:'B-charger',kw:20}]);near(a[0].grid,50);near(a[1].grid,40);
 p.efficiency.sst=.9;a=allocatePower(p,[{sink:'A-charger',kw:20},{sink:'B-charger',kw:20}]);near(a[0].grid,50);near(a[1].grid,20/.5/.9);
 p=setEquipmentEfficiency(p,'A-sst',null);assert.equal(Object.hasOwn(p.topology.nodes.find(n=>n.id==='A-sst')!.params,'efficiency'),false);near(allocatePower(p,[{sink:'A-charger',kw:20}])[0].grid,20/.5/.9);
});

test('an output-rated SST keeps its nameplate output when efficiency decreases',()=>{
 let p=verificationCases()[0].project;p.efficiency.charger=.5;p=setEquipmentEfficiency(p,'A-sst',.8);
 const a=allocatePower(p,[{sink:'A-charger',kw:200}])[0],sst=a.nodeFlows.find(n=>n.nodeId==='A-sst')!;
 near(a.delivered,50);near(sst.inputKW,125);near(sst.outputKW,100);near(sst.lossKW,25);near(a.grid,125);
});

test('shared transformer input rating and individual efficiencies agree at every branch boundary',()=>{
 let p=verificationCases()[1].project;const tx=p.topology.nodes.find(n=>n.id==='A-transformer')!;tx.params.kva=100;tx.params.pf=.9;
 p.topology.nodes.find(n=>n.id==='A-aux')!.params.kw=20;
 p=setEquipmentEfficiency(p,tx.id,.8);p=setEquipmentEfficiency(p,'A-pcs',.75);p=setEquipmentEfficiency(p,'A-charger',.5);
 const a=allocatePower(p,[{sink:'A-aux',kw:12},{sink:'A-charger',kw:200}]);near(outputCapacity(p,p.topology.nodes.find(n=>n.id===tx.id)!),72);
 const flows=a.flatMap(x=>x.nodeFlows),sum=(id:string,key:'inputKW'|'outputKW')=>flows.filter(n=>n.nodeId===id).reduce((s,n)=>s+n[key],0);
 near(sum(tx.id,'inputKW'),90);near(sum(tx.id,'outputKW'),72);near(sum('A-pcs','inputKW'),60);near(sum('A-pcs','outputKW'),45);near(a[1].delivered,22.5);near(a.reduce((s,n)=>s+n.grid,0),90);near(a.reduce((s,n)=>s+n.loss,0),55.5);
});

test('full equipment JSON and editable CSV preserve exact values, topology order, inheritance and schedules',()=>{
 let p=engineeringProject();p=setEquipmentEfficiency(p,'A-sst-0',.98);p.topology.nodes[0].name='中文, "額定"\n接入';p.equipmentSchedule=[{equipmentId:'B-sst-0',atMinute:60,enabled:false}];
 for(const format of ['csv','json'] as const){const data=format==='csv'?exportEquipmentCSV(p):exportEquipmentJSON(p);assert.deepEqual(importEquipmentProfile(p,data,format).project,p);}
 const data=JSON.parse(exportEquipmentJSON(p));const target=engineeringProject();target.services[0].gridPrice=.123;target.finance.capex=12345;target.arrival='SEEDED';target.seed=99;
 const imported=importEquipmentProfile(target,JSON.stringify(data),'json').project;assert.equal(imported.services,target.services);assert.equal(imported.finance,target.finance);assert.equal(imported.seed,99);assert.deepEqual(imported.equipmentSchedule,p.equipmentSchedule);assert.deepEqual(imported.topology,p.topology);
 imported.efficiency.sst=.9;near(equipmentEfficiency(imported,imported.topology.nodes.find(n=>n.id==='A-sst-0')!),.98);near(equipmentEfficiency(imported,imported.topology.nodes.find(n=>n.id==='B-sst-0')!),.9);
 const partial=importEquipmentProfile(p,csv('B-sst-0,sst,params.kw,1500','A-sst-0,sst,params.efficiency,'),'csv').project;
 assert.deepEqual(partial.topology.nodes.map(n=>n.id),p.topology.nodes.map(n=>n.id));assert.equal(partial.topology.edges,p.topology.edges);assert.equal(partial.topology.nodes.find(n=>n.id==='B-sst-0')!.params.kw,1500);assert.equal(partial.topology.nodes.find(n=>n.id==='A-sst-0')!.params.efficiency,undefined);
});

test('equipment imports reject invalid batches, unsupported efficiencies and unsafe scheduled wiring without mutation',()=>{
 const p=engineeringProject(),original=structuredClone(p);
 const bad=['A-sst-0,sst,params.efficiency,0','A-sst-0,sst,params.efficiency,98','A-sst-0,sst,params.efficiency,NaN','A-sst-0,sst,params.efficiency,Infinity','A-sst-0,sst,params.kw,','A-sst-0,sst,params.kw,=500','A-sst-0,sst,params.kw,-1','A-sst-0,pcs,params.kw,100','missing,sst,params.kw,100','A-bus-sst,bus,params.efficiency,.9','A-sst-0,sst,params.misspelled,1','A-sst-0,sst,enabled,yes'];
 for(const line of bad){assert.throws(()=>importEquipmentProfile(p,csv('A-sst-0,sst,params.kw,1234',line),'csv'));assert.deepEqual(p,original);}
 assert.throws(()=>importEquipmentProfile(p,csv('A-sst-0,sst,params.kw,1','A-sst-0,sst,params.kw,2'),'csv'),/重複/);
 const saved=JSON.parse(exportEquipmentJSON(p));saved.settings.topology.nodes.find((n:{id:string})=>n.id==='A-sst-0').params.efficiency=.9;saved.settings.efficiency.mode='SOURCE_CHAIN';assert.throws(()=>importEquipmentProfile(p,JSON.stringify(saved),'json'));
 const scheduled=JSON.parse(exportEquipmentJSON(p));scheduled.settings.topology.edges.push({id:'bad-ac',source:'B-meter',target:'A-out-transformer',enabled:true});assert.throws(()=>importEquipmentProfile(p,JSON.stringify(scheduled),'json'),/並聯/);
 scheduled.settings.topology.edges.pop();scheduled.settings.equipmentSchedule=[{equipmentId:'A-sst-0',atMinute:1440,enabled:false}];assert.throws(()=>importEquipmentProfile(p,JSON.stringify(scheduled),'json'));
 for(const efficiency of [0,-.1,1.1,NaN,Infinity]){const q=structuredClone(p);q.topology.nodes.find(n=>n.id==='A-sst-0')!.params.efficiency=efficiency;assert.throws(()=>parseProject(q));}
 assert.deepEqual(p,original);
});

test('individual efficiency changes propagate to multi-day physical ledgers, energy trace and saved XLSX',()=>{
 let p=verificationCases()[1].project;p=setEquipmentEfficiency(p,'A-transformer',.9);p=setEquipmentEfficiency(p,'B-charger',.8);
 const result=simulate(p);const expectedGrid=960/.9+400/(.9*.96*.95)+960/.98+400/(.98*.96*.8);near(result.totals.gridKWh,expectedGrid);near(result.totals.deliveredKWh,800);near(result.totals.lossKWh,expectedGrid-1920-800);
 const restored=importEquipmentProfile(verificationCases()[1].project,exportEquipmentJSON(p),'json').project;assert.deepEqual(simulate(restored),result);assert.deepEqual(importWorkbook(exportWorkbook(p,result)),p);
 const full=flowView(result,p.horizonDays*1440,'cumulative',0);near(full.grid,expectedGrid);near(full.loss,expectedGrid-2720);near(full.terminal,2720);const tx=result.componentEnergy.filter(n=>n.nodeId==='A-transformer');assert.ok(tx.every(n=>n.capacityKW===900));near(tx.reduce((s,n)=>s+n.lossKWh,0),(960+400/(.96*.95))*(1/.9-1));
});

test('configuration import rejects dropped or misspelled settings and impossible source calibration; names roundtrip safely',()=>{
 const p=engineeringProject(),text=exportEquipmentJSON(p);
 for(const mutate of [(d:any)=>delete d.settings.engineering,(d:any)=>d.settings.efficiency.chager=.5,(d:any)=>d.settings.station.A.capcityKWh=999,(d:any)=>d.settings.topology.nodes[0].params.efficency=.9,(d:any)=>d.settings.topology.edges[0].enabeld=false,(d:any)=>d.settings.topology.nodes[0].name='   ']){const data=JSON.parse(text);mutate(data);assert.throws(()=>importEquipmentProfile(p,JSON.stringify(data),'json'));}
 const legacy=verificationCases()[0].project;legacy.efficiency.mode='SOURCE_CHAIN';legacy.efficiency.sstSource=1;legacy.efficiency.charger=.5;assert.throws(()=>exportEquipmentJSON(legacy),/不相容/);
 for(const name of ['=SUM(1,2)',"'literal",'+1','@record','-value','中文, "設備"\nA']){const q=structuredClone(p);q.topology.nodes[0].name=name;const file=exportEquipmentCSV(q);assert.deepEqual(importEquipmentProfile(q,file,'csv').project,q);if(/^[=+@-]/.test(name))assert.ok(file.includes("'"+name));}
});
