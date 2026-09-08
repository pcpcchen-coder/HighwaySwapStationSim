// Copy to tests/physical-regressions.test.mjs and run from repository root:
// node --test tests/physical-regressions.test.mjs
// Audit use: run this scratch file with cwd set to the repository root.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=process.env.AUDIT_PROJECT_ROOT??process.cwd();
const fromRepo=path=>import(pathToFileURL(resolve(repo,path)).href);
const {defaultProject,presetTopology}=await fromRepo('packages/reference/index.ts');
const {engineeringProject,physicalProjection}=await fromRepo('packages/engineering/index.ts');
const {simulate}=await fromRepo('packages/station-engine/index.ts');
const {allocatePower}=await fromRepo('packages/electrical-engine/index.ts');
const {validateTopology}=await fromRepo('packages/topology-engine/index.ts');
const {makeNode}=await fromRepo('plugins/equipment/index.ts');
const near=(actual,expected,tolerance=1e-6)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
function blank(p=defaultProject()){
 p.mode='CONSTRAINED';
 for(const s of ['A','B'])Object.assign(p.station[s],{auxiliaryKW:0,guns:1,gunKW:480,chargePoolKW:480});
 for(const r of p.services)Object.assign(r,{swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0,gridPrice:0,swapFee:1,chargeFee:1});
 return p;
}
const row=(p,hour,station='A',day=0)=>p.services.find(r=>r.station===station&&r.day===day&&r.hour===hour);
const sum=(items,key)=>items.reduce((total,item)=>total+item[key],0);

test('charging completion is an exact event, including a queued 1 kWh backlog',()=>{
 for(const count of [1,1000]){
  const p=blank();Object.assign(row(p,0),{chargeCount:count,chargeKWh:count});
  const r=simulate(p);near(r.transactions[0].completion,.125);near(r.transactions.at(-1).completion,count*.125);
  near(r.totals.deliveredKWh,count);near(r.hours.find(h=>h.station==='A'&&h.hour===0).deliveredKWh,Math.min(count,480));
 }
});

test('battery readiness triggers a swap at its exact threshold',()=>{
 const p=blank();Object.assign(p.station.A,{batteries:1,capacityKWh:100,readySOC:1,returnSOC:0,batteryChargeKW:30});
 Object.assign(row(p,0),{swapCount:2,swapKWh:200});const r=simulate(p);
 near(r.transactions[1].start,207.5);near(r.transactions[1].completion,215);
});

test('hour boundary uses half-open event counts and arrival-locked prices',()=>{
 const p=blank();p.station.A.swapMinutes=60;Object.assign(row(p,0),{swapCount:1,swapKWh:410});row(p,1).swapFee=2;
 const r=simulate(p);near(r.transactions[0].completion,60);near(r.totals.revenue,410);
 assert.equal(r.hours.find(h=>h.station==='A'&&h.hour===0).swapCount,0);
 assert.equal(r.hours.find(h=>h.station==='A'&&h.hour===1).swapCount,1);assert.ok(r.totals.maxBalanceResidual<1e-6);
});

test('an incompatible swap cannot permanently block a compatible request',()=>{
 const p=blank();Object.assign(row(p,0),{swapCount:1,swapKWh:409});Object.assign(row(p,1),{swapCount:1,swapKWh:410});
 const r=simulate(p);assert.equal(r.transactions[0].completion,null);near(r.transactions[1].start,60);near(r.transactions[1].completion,67.5);
});

test('a swap pauses while its auxiliary source is unavailable',()=>{
 const p=blank();p.station.A.auxiliaryKW=10;Object.assign(row(p,0),{swapCount:1,swapKWh:410});
 p.equipmentSchedule=[{atMinute:3,equipmentId:'A-grid',enabled:false},{atMinute:10,equipmentId:'A-grid',enabled:true}];
 const r=simulate(p);near(r.transactions[0].completion,14.5);assert.ok(r.diagnostics.some(d=>d.code==='AUX_SHORTFALL'));
});

test('complete supply outage cannot power mechanical service or consume its stored inventory',()=>{
 const p=physicalProjection(engineeringProject());p.topology.edges.forEach(e=>e.enabled=false);
 const r=simulate(p);near(r.totals.deliveredKWh,0);near(r.totals.revenue,0);near(r.totals.gridKWh,0);
 near(r.totals.finalStoredKWh,r.totals.initialStoredKWh);assert.equal(r.totals.completed,0);
});

test('a failed B transformer stops B swaps and B SSTs that need its auxiliary supply',()=>{
 const p=physicalProjection(engineeringProject());p.topology.nodes.find(n=>n.id==='B-transformer').enabled=false;
 const r=simulate(p);near(sum(r.hours.filter(h=>h.station==='B'),'swapCount'),0);
 near(sum(r.componentEnergy.filter(n=>n.nodeId.startsWith('B-sst-')&&!n.nodeId.endsWith('aux')),'outputKWh'),0);
});

test('actual source meters and independent edge sums reconcile component ledgers',()=>{
 const p=physicalProjection(engineeringProject());p.topology.nodes.find(n=>n.id==='B-grid').enabled=false;
 const r=simulate(p);near(sum(r.sourceMeters.filter(m=>m.sourceId==='B-grid'),'importKWh'),0);
 near(sum(r.sourceMeters,'importKWh'),r.totals.gridKWh);near(sum(r.componentEnergy,'lossKWh'),r.totals.lossKWh);
 near(sum(r.sourceMeters,'cost'),r.totals.gridCost,1e-6);
 for(const n of r.componentEnergy){
  const edges=r.edgeEnergy.filter(e=>e.day===n.day&&e.hour===n.hour);
  near(n.inputKWh,n.outputKWh+n.lossKWh);near(n.outputKWh,sum(edges.filter(e=>e.source===n.nodeId),'kWh')+n.terminalKWh);
  if(p.topology.nodes.find(v=>v.id===n.nodeId).type!=='grid')near(n.inputKWh,sum(edges.filter(e=>e.target===n.nodeId),'kWh'));
  assert.ok(n.peakOutputKW<=n.capacityKW+1e-6);assert.ok(n.maxBalanceResidual<1e-6);
 }
});

test('guns share stack capacity while respecting vehicle voltage times current',()=>{
 const p=engineeringProject();
 const atNominal=allocatePower(p,[0,1,2,3].map(i=>({sink:`A-gun-${i}`,kw:480})));
 assert.ok(atNominal.every(a=>a.delivered<=382.536+1e-6));assert.ok(sum(atNominal,'delivered')<=1440+1e-6);
 p.topology.nodes.filter(n=>n.type==='gun').forEach(n=>n.params.vehicleVoltage=800);
 near(sum(allocatePower(p,[0,1,2,3].map(i=>({sink:`A-gun-${i}`,kw:480}))),'delivered'),1440);
 p.topology.nodes.find(n=>n.id==='A-gun-0').params.vehicleVoltage=1001;
 near(allocatePower(p,[{sink:'A-gun-0',kw:480}])[0].delivered,0);
});

test('AC paralleling and direct bus-to-rack paths are rejected by preflight',()=>{
 const ac=defaultProject();ac.topology.edges.push({id:'bad-AC',source:'B-grid',target:'A-sst',enabled:true});
 assert.ok(validateTopology(ac.topology).some(d=>d.code==='UNSUPPORTED_AC_PARALLEL'));
 const dc=engineeringProject();dc.topology.edges.push({id:'bad-DC',source:'A-feed-sst',target:'A-rack-0',enabled:true});
 assert.ok(validateTopology(dc.topology).some(d=>d.code==='MISSING_DD_STAGE'));
});

test('scheduled activation cannot bypass AC-parallel validation',()=>{
 const p=blank();p.topology.edges.push({id:'second-AC-grid',source:'B-grid',target:'A-sst',enabled:true});
 p.topology.nodes.find(n=>n.id==='B-grid').enabled=false;p.equipmentSchedule=[{atMinute:10,equipmentId:'B-grid',enabled:true}];
 Object.assign(row(p,1),{chargeCount:1,chargeKWh:100});assert.deepEqual(validateTopology(p.topology),[]);
 assert.throws(()=>simulate(p),/AC|並聯|TOPOLOGY/);
});

test('scheduled activation cannot create an unchecked DD bypass',()=>{
 const p=physicalProjection(engineeringProject());for(const r of p.services)Object.assign(r,{swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0});
 Object.assign(row(p,0),{swapCount:1,swapKWh:410.4});const sw=makeNode('dc-switch','A-bypass','A',0,0,{kw:560});sw.enabled=false;p.topology.nodes.push(sw);
 p.topology.edges.push({id:'bypass1',source:'A-feed-sst',target:sw.id,enabled:true},{id:'bypass2',source:sw.id,target:'A-rack-0',enabled:true});
 p.topology.nodes.find(n=>n.id==='A-dd-0').enabled=false;p.equipmentSchedule=[{atMinute:10,equipmentId:sw.id,enabled:true}];
 assert.deepEqual(validateTopology(p.topology),[]);assert.throws(()=>simulate(p),/DD|充電機|TOPOLOGY/);
});

test('a 65-route topology does not silently ignore its only live capacity',()=>{
 const p=engineeringProject();p.topology={nodes:[makeNode('grid','grid','A',0,0,{kva:100,pf:1}),makeNode('sst','sst','A',0,0,{kw:100})],edges:[]};
 for(let i=0;i<65;i++){p.topology.nodes.push(makeNode('mv-switch',`branch-${i}`,'A',0,0,{kw:i===64?100:0}));p.topology.edges.push({id:`in-${i}`,source:'grid',target:`branch-${i}`,enabled:true},{id:`out-${i}`,source:`branch-${i}`,target:'sst',enabled:true});}
 near(allocatePower(p,[{sink:'sst',kw:98}])[0].delivered,98);p.topology.edges.reverse();near(allocatePower(p,[{sink:'sst',kw:98}])[0].delivered,98);
});

test('SOURCE_CHAIN retains an SST rated-output boundary',()=>{
 const p=defaultProject();const r=allocatePower(p,[{sink:'A-charger',kw:2000}])[0];near(r.delivered,1680*.974);
 near(r.nodeFlows.find(n=>n.nodeId==='A-sst').outputKW,1680);near(r.grid,r.delivered/p.efficiency.sstSource);
});

test('one transformer shares its input kVA limit across AC auxiliary and DC conversion paths',()=>{
 for(const mode of ['ASSEMBLY','SOURCE_CHAIN']){
  const p=defaultProject();p.efficiency.mode=mode;if(mode==='SOURCE_CHAIN')p.efficiency.pcsSource=.8;
  p.topology=presetTopology(1,'pcs');p.topology.nodes.find(n=>n.id==='A-transformer').params={kva:100,pf:1};
  p.topology.nodes.push(makeNode('ac-load','A-aux','A',0,0,{kw:10}));p.topology.edges.push({id:'tx-aux',source:'A-transformer',target:'A-aux',enabled:true});
  const a=allocatePower(p,[{sink:'A-aux',kw:10},{sink:'A-charger',kw:1000}]);
  const tx=a.flatMap(x=>x.nodeFlows).filter(n=>n.nodeId==='A-transformer');near(sum(tx,'inputKW'),100);
  const chain=mode==='SOURCE_CHAIN'?p.efficiency.pcsSource:p.efficiency.transformer*p.efficiency.pcs*p.efficiency.charger;
  near(a[1].delivered,(100-10/p.efficiency.transformer)*chain);
 }
});
