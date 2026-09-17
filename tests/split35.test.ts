import test from 'node:test';
import assert from 'node:assert/strict';
import {completeProject} from '../packages/detailed-model/project.ts';
import {engineeringTopology} from '../packages/engineering/index.ts';
import {allocateDetailedPower} from '../packages/detailed-network/index.ts';
import {parseProject} from '../packages/schemas/index.ts';
import {exportDetailedCSV,importDetailedProfile} from '../packages/detailed-profile/index.ts';
import {exportEquipmentJSON,importEquipmentProfile} from '../packages/equipment-profile/index.ts';
import {exportWorkbook,importWorkbook} from '../packages/io/index.ts';
import {compileFleet} from '../packages/detailed-model/services.ts';
import {replay} from '../packages/station-engine/index.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('complete preset changes both banks to 3:5 with 1 PCS + 2 SST dual-gun terminals per side and no unrelated changes',()=>{
 const p=completeProject();assert.equal(p.engineering!.pcsSlotsPerSite,3);
 assert.equal(p.topology.nodes.length,142);assert.equal(p.topology.edges.length,160);
 const old=structuredClone(p);old.engineering!.pcsSlotsPerSite=2;delete old.detailed!.topology.swapTerminalCounts;old.topology=engineeringTopology(old);
 for(const s of ['A','B']){
  for(const [kind,count] of [['pcs',3],['sst',5]] as const){
   assert.equal(p.topology.edges.filter(e=>e.source===`${s}-feed-${kind}`&&e.target.match(/-dd-\d+$/)).length,count);
   assert.equal(p.topology.nodes.find(n=>n.id===`${s}-dd-group-${kind}`)!.params.kw,count*560);
  }
  for(let i=0;i<8;i++)assert.ok(p.topology.edges.some(e=>e.source===`${s}-dd-group-${i<3?'pcs':'sst'}`&&e.target===`${s}-rack-${i}`));
 }
 const removed=(id:string)=>/-(swap-terminal-sst-2|swap-gun-sst-[45])$/.test(id);
 assert.deepEqual(p.topology.nodes.map(n=>n.id),old.topology.nodes.filter(n=>!removed(n.id)).map(n=>n.id));
 assert.equal(old.topology.nodes.filter(n=>removed(n.id)).length,6);
 for(const n of p.topology.nodes){const before=old.topology.nodes.find(x=>x.id===n.id)!;
  if(/-dd-2$/.test(n.id))assert.deepEqual({...n,name:before.name},before);
  else if(/-dd-group-/.test(n.id))assert.deepEqual({...n,params:before.params},before);
  else assert.deepEqual(n,before);
 }
 const relevant=(e:{source:string;target:string})=>/-dd-2$/.test(e.source)||/-dd-2$/.test(e.target)||/-rack-2$/.test(e.target);
 const endpoints=(edges:typeof p.topology.edges)=>edges.filter(e=>!relevant(e)&&!removed(e.source)&&!removed(e.target)).map(({id,...e})=>e);
 assert.deepEqual(endpoints(p.topology.edges),endpoints(old.topology.edges));
 for(const s of ['A','B']){
  assert.equal(p.topology.nodes.filter(n=>n.id.startsWith(`${s}-swap-terminal-pcs-`)).length,1);
  assert.equal(p.topology.nodes.filter(n=>n.id.startsWith(`${s}-swap-terminal-sst-`)).length,2);
  assert.equal(p.topology.nodes.filter(n=>n.id.startsWith(`${s}-swap-gun-`)).length,6);
 }
 assert.ok(compileFleet(p).guns.every(g=>!removed(g.id)));
 assert.equal(compileFleet(p).guns.length,20);
 // No implicit terminal growth when rebuilding or switching the editable ratio.
 assert.deepEqual(engineeringTopology(p),p.topology);
 const back=structuredClone(p);back.engineering!.pcsSlotsPerSite=2;
 assert.equal(engineeringTopology(back).nodes.filter(n=>n.type==='gun').length,20);
});

test('3:5 power follows the new buses and independent conversion arithmetic at 100 kW per rack',()=>{
 const p=completeProject();
 const flows=allocateDetailedPower(p,p.topology.nodes.filter(n=>n.type==='rack').map(n=>({sink:n.id,kw:100})));
 near(flows.reduce((s,f)=>s+f.delivered,0),1600);
 const output=(id:string)=>flows.flatMap(f=>f.nodeFlows).filter(f=>f.nodeId===id).reduce((s,f)=>s+f.outputKW,0);
 for(const s of ['A','B']){near(output(`${s}-feed-pcs`),300/.974);near(output(`${s}-feed-sst`),500/.974);}
 const expected=1000/.974/.98+600/.974/.98/.98;
 near(flows.reduce((s,f)=>s+f.grid,0),expected);
 near(flows.reduce((s,f)=>s+f.loss,0),expected-1600);
 // The same fixed-power interval is 7.5 min = 0.125 h.
 near(flows.reduce((s,f)=>s+f.delivered*.125,0),200);
});

test('3:5 and fixed terminal inventory survive JSON, detailed CSV, equipment JSON and XLSX',()=>{
 const p=completeProject();assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))),p);
 assert.deepEqual(importDetailedProfile(p,exportDetailedCSV(p),'csv'),p);
 assert.deepEqual(importEquipmentProfile(p,exportEquipmentJSON(p),'json').project,p);
 const result=replay(p);assert.deepEqual(importWorkbook(exportWorkbook(result.parameterSnapshot,result)),result.parameterSnapshot);
 const invalid=structuredClone(p);invalid.detailed!.topology.swapTerminalCounts!.pcs=1.5;assert.throws(()=>parseProject(invalid));
});


test('six shared guns per side consume only actual PCS/SST power and removed guns have no paths',()=>{
 const p=completeProject(),guns=p.topology.nodes.filter(n=>n.id.includes('-swap-gun-'));
 const flows=allocateDetailedPower(p,guns.map(n=>({sink:n.id,kw:100})));
 assert.equal(guns.length,12);near(flows.reduce((s,f)=>s+f.delivered,0),1200);
 const power=(id:string)=>flows.flatMap(f=>f.nodeFlows).filter(f=>f.nodeId===id).reduce((s,f)=>s+f.outputKW,0);
 for(const s of ['A','B']){near(power(`${s}-feed-pcs`),200/.974);near(power(`${s}-feed-sst`),400/.974);}
 const expected=800/.974/.98+400/.974/.98/.98;
 near(flows.reduce((s,f)=>s+f.grid,0),expected);near(flows.reduce((s,f)=>s+f.loss,0),expected-1200);
 const missing=allocateDetailedPower(p,[{sink:'A-swap-gun-sst-4',kw:100},{sink:'B-swap-gun-sst-5',kw:100}]);
 assert.ok(missing.every(f=>f.delivered===0));
});
