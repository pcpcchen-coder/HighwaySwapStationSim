import {referenceLayout,referenceWire,NODE_WIDTH as W,NODE_HEIGHT as H} from '../packages/reference-layout/index.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {singleBusProject} from '../packages/detailed-model/single-bus-project.ts';
import {singleBusCapacity} from '../packages/engineering/single-bus-capacity.ts';
import {allocateDetailedPower} from '../packages/detailed-network/index.ts';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';
import {compileFleet} from '../packages/detailed-model/services.ts';
import {sampleAt} from '../packages/power-trace/index.ts';
import {capacityProject,capacityCases,capacityMatches,planningDaySummary,singleBusTenYears,planningCSV,type CapacityRuns} from '../packages/load-planning/index.ts';
import {exportWorkbook,importWorkbook,unzipStored} from '../packages/io/index.ts';
import {exportEquipmentCSV,importEquipmentProfile} from '../packages/equipment-profile/index.ts';
import {parseProject} from '../packages/schemas/index.ts';
import {validateTopology} from '../packages/topology-engine/index.ts';
const near=(a:number,b:number,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const blank=()=>{const p=singleBusProject();p.services=p.services.map(r=>({...r,swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0,ac:{swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0}}));return p;};

test('single bus owns exactly the confirmed first-phase equipment and transformer-fed AC/DC paths',()=>{
 const p=parseProject(singleBusProject()),n=p.topology.nodes,s=singleBusCapacity(p);
 assert.equal(p.phase,1);assert.equal(s.sstKW,3360);assert.equal(n.filter(n=>n.type==='acdc'&&n.enabled).length,6);assert.equal(n.filter(n=>n.type==='charger').length,10);
 assert.equal(n.filter(n=>n.type==='rack').length,16);assert.equal(n.filter(n=>n.type==='terminal').length,6);assert.equal(s.gunCount,12);
 assert.equal(n.filter(n=>n.type==='pcs'||n.type==='charge-stack').length,0);assert.equal(n.some(n=>n.id.includes('bus-pcs')),false);
 assert.deepEqual(validateTopology(p.topology).filter(d=>d.severity==='error'),[]);
 const layout=referenceLayout(p.topology);for(let i=0;i<layout.length;i++)for(let j=i+1;j<layout.length;j++){const a=layout[i],b=layout[j];assert.ok(!(a.x<b.x+W&&a.x+W>b.x&&a.y<b.y+H&&a.y+H>b.y),`${a.id} overlaps ${b.id}`);}
 for(const e of p.topology.edges)assert.doesNotMatch(referenceWire(layout.find(n=>n.id===e.source)!,layout.find(n=>n.id===e.target)!).path,/NaN|undefined/);
 for(const site of ['A','B'])for(let i=0;i<3;i++){assert.equal(n.find(n=>n.id===`${site}-dd-${i}`)!.params.eta,.9535);assert.ok(p.topology.edges.some(e=>e.source===`${site}-lv`&&e.target===`${site}-dd-${i}`));}
 near(s.sites[0].acInputKW,1680/.9535);near(s.sites[0].transformerOutputKW,2500*.99*.98);near(s.sites[0].acPathEfficiency!,.98*.9535);
});

test('AC/DC conversion occurs once; edited efficiency changes purchases and survives JSON/CSV',()=>{
 const p=singleBusProject(),a=allocateDetailedPower(p,[{sink:'A-rack-0',kw:560}])[0];near(a.delivered,560);near(a.grid,560/(.9535*.98));near(a.loss,560/(.9535*.98)-560);
 p.topology.nodes.find(n=>n.id==='A-dd-0')!.params.eta=.9;
 const b=allocateDetailedPower(p,[{sink:'A-rack-0',kw:560}])[0];near(b.grid,560/(.9*.98));assert.ok(b.grid>a.grid);
 const json=parseProject(JSON.parse(JSON.stringify(p)));const csv=importEquipmentProfile(singleBusProject(),exportEquipmentCSV(p),'csv').project;
 for(const q of [json,csv])near(allocateDetailedPower(q,[{sink:'A-rack-0',kw:560}])[0].grid,b.grid);
});

test('public DC bus shares either SST without duplicating capacity or connecting the B grid to SST',()=>{
 for(const disabled of ['A','B']){const p=singleBusProject();p.topology.nodes.find(n=>n.id===`${disabled}-sst-0`)!.enabled=false;
  const a=allocateDetailedPower(p,Array.from({length:5},(_,i)=>({sink:`${disabled}-rack-${i+3}`,kw:560})));
  near(a.reduce((v,a)=>v+a.delivered,0),1680*.974);near(a.reduce((v,a)=>v+(a.sourceImport['B-grid']??0),0),0);
  near(a.reduce((v,a)=>v+a.grid,0),1680/.98);
 }
 const p=singleBusProject(),a=allocateDetailedPower(p,['A','B'].flatMap(s=>Array.from({length:5},(_,i)=>({sink:`${s}-rack-${i+3}`,kw:560}))));
 near(a.reduce((v,a)=>v+a.delivered,0),3360*.974);near(a.reduce((v,a)=>v+a.grid,0),3360/.98);
});

test('guns exclude the complete AC group while the separate DC group continues replenishment',()=>{
 const p=blank(),slots=compileFleet(p).swaps.flatMap(f=>f.slots).filter(s=>s.sink==='A-rack-0'||s.sink==='A-rack-3');
 p.detailed!.service.truckSlotOverrides=slots.map(slot=>({enabled:true,slot:{...slot,battery:{...slot.battery,initialSOC:.2}}}));
 const gun=p.topology.nodes.find(n=>n.type==='gun'&&n.id.startsWith('A-swap-gun-pcs'))!;
 assert.ok(gun);
 p.detailed!.service.chargeArrivals=[{id:'priority',station:'A',atMinute:0,unitPrice:1,gunsRequired:1,energyKWh:200,profileId:null,initialSOC:null,targetSOC:null,temperatureC:null,temperatureSchedule:[],allowedGunIds:[gun.id]}];
 const r=simulateDetailed(p),trace=r.powerTrace!;const power=(id:string,t:number)=>sampleAt(trace.nodes.find(n=>n.nodeId===id)!.samples,t)![2];
 near(power(gun.id,1),382.536);for(let i=0;i<3;i++)near(power(`A-rack-${i}`,1),0);assert.ok(power('A-rack-3',1)>0);assert.ok(power('A-rack-0',40)>0);near(r.totals.deliveredKWh,200);assert.ok(r.totals.maxBalanceResidual<1e-6);
});

test('no auxiliary reserve gives guns first claim and interlocks an unsupported SST',()=>{
 const p=blank();p.detailed!.dispatch.gridLimits=[{sourceId:'A-grid',kw:200},{sourceId:'B-grid',kw:0}];
 // Remove other auxiliary loads, leaving the SST's necessary 10 kW supply.
 p.detailed!.loads=p.detailed!.loads.filter(l=>l.nodeId.endsWith('sst-aux'));
 const gun=p.topology.nodes.find(n=>n.type==='gun'&&n.id.startsWith('A-swap-gun-pcs'))!;
 p.detailed!.service.chargeArrivals=[{id:'starvation',station:'A',atMinute:0,unitPrice:1,gunsRequired:1,energyKWh:100,profileId:null,initialSOC:null,targetSOC:null,temperatureC:null,temperatureSchedule:[],allowedGunIds:[gun.id]}];
 const r=simulateDetailed(p),trace=r.powerTrace!;
 near(sampleAt(trace.nodes.find(n=>n.nodeId===gun.id)!.samples,1)![2],200*.98*.9535);
 for(const id of ['A-sst-0','B-sst-0'])near(sampleAt(trace.nodes.find(n=>n.nodeId===id)!.samples,1)![2],0);
 assert.ok(r.totals.maxBalanceResidual<1e-6);
});

test('three-day stock draw is excluded from annual energy sales; background electricity is not scaled away',()=>{
 const p=blank();
 // Exactly one 100 kWh DC swap per day, no recharge: sales are entirely opening stock.
 for(const n of p.topology.nodes)if(n.type==='charger')n.enabled=false;
 const rows=structuredClone(p.services);const row=rows.find(r=>r.station==='A'&&r.hour===6)!;row.swapCount=1;row.swapKWh=100;
 for(const l of ['high','medium','low'] as const)p.loadPlan!.profiles[l]=structuredClone(rows);
 for(const year of p.loadPlan!.years){year.operatingDays=100;year.demandFactor=.5;}
 const runs:CapacityRuns={};for(const l of capacityCases(p))runs[l]=simulateDetailed(capacityProject(p,l));
 const v=planningDaySummary(runs.low!);near(v.raw.deliveredKWh,300);near(v.stockConsumedKWh,100);near(v.deliveredKWh,0);near(v.revenue,0);
 const estimate=singleBusTenYears(p,runs);for(const y of estimate.rows){assert.equal(y.status,'ready');near(y.demandKWh,5000);near(y.deliveredKWh!,0);near(y.unservedKWh!,5000);near(y.gridKWh!,18857.1428571429*100,1e-5);}
 assert.ok(planningCSV(p,runs).includes('stockConsumedKWh'));assert.ok(planningCSV(p,runs).includes('5000'));
 const bytes=exportWorkbook(runs.low!.parameterSnapshot,runs.low!,runs),restored=importWorkbook(bytes);assert.equal(restored.detailed!.topology.architecture,'SINGLE_BUS');assert.equal(restored.horizonDays,3);
 const files=unzipStored(bytes);assert.ok(files['xl/workbook.xml'].includes('Capacity_Checks'));assert.ok(Object.values(files).some(s=>s.includes('stockConsumedKWh')));
 p.topology.nodes.find(n=>n.id==='A-dd-0')!.params.eta=.9;assert.equal(capacityMatches(p,'low',runs.low),false);assert.equal(singleBusTenYears(p,runs).rows[0].gridKWh,null);
});
