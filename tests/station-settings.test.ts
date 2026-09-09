import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStationSOC, socWindowPreview } from '../packages/station-settings/index.ts';
import { engineeringProject, physicalProjection } from '../packages/engineering/index.ts';
import { verificationCases } from '../packages/verification/cases.ts';
import { simulate } from '../packages/station-engine/index.ts';
import { parseProject } from '../packages/schemas/index.ts';
import { exportEquipmentJSON, importEquipmentProfile } from '../packages/equipment-profile/index.ts';
import { exportServiceCSV, importServiceProfile } from '../packages/service-profile/index.ts';
import { exportWorkbook, importWorkbook } from '../packages/io/index.ts';
import { flowView } from '../packages/power-trace/index.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('SOC apply updates all selected-station days and preserves custom equipment, row order and unrelated inputs',()=>{
 const p=physicalProjection(engineeringProject());p.horizonDays=3;
 const first=p.services;p.services=Array.from({length:3},(_,day)=>first.map(r=>({...r,day}))).flat().reverse();
 p.topology.nodes[0].name='自訂接入';p.topology.nodes[0].x=999;
 p.topology.nodes.find(n=>n.id==='A-sst-0')!.params.efficiency=.91;
 p.topology.edges[0].enabled=false;p.equipmentSchedule=[{atMinute:120,equipmentId:'B-sst-0',enabled:false}];
 const before=structuredClone(p),next=applyStationSOC(p,'A',.2,.8);
 near(socWindowPreview(p,'A',.2,.8).energyKWh,307.8);
 assert.equal(next.topology,p.topology);assert.equal(next.station.B,p.station.B);
 assert.equal(next.equipmentSchedule,p.equipmentSchedule);assert.equal(next.efficiency,p.efficiency);
 assert.equal(next.finance,p.finance);assert.equal(next.sources,p.sources);assert.equal(next.name,p.name);assert.equal(next.mode,p.mode);
 next.services.forEach((r,i)=>{const source=p.services[i];
  if(r.station==='A'){near(r.swapKWh,r.swapCount*307.8);assert.deepEqual({...r,swapKWh:source.swapKWh},source);}
  else assert.equal(r,source);
 });
 assert.deepEqual(p,before);
});

test('SOC bounds reject invalid atomic updates; zero-to-full and decimal percentages remain valid',()=>{
 const p=physicalProjection(engineeringProject()),before=structuredClone(p);
 for(const [lower,upper] of [[0,0],[1,1],[.8,.2],[-.1,.8],[.2,1.01],[NaN,1],[0,Infinity],[null,1],[0,null]] as [number,number][]){
  assert.throws(()=>applyStationSOC(p,'A',lower,upper));assert.deepEqual(p,before);
 }
 near(socWindowPreview(p,'A',0,1).energyKWh,513);
 near(socWindowPreview(p,'A',.205,.8025).energyKWh,306.5175);
 parseProject(applyStationSOC(p,'A',0,1));
 for(const capacityKWh of [0,5001,NaN,Infinity])assert.throws(()=>applyStationSOC({...p,station:{...p.station,A:{...p.station.A,capacityKWh}}},'A',.2,.8));
 const bad=structuredClone(p);bad.services.at(-2)!.swapCount=-1;const original=structuredClone(bad);
 const station=bad.services.at(-2)!.station;assert.throws(()=>applyStationSOC(bad,station,.2,.8));assert.deepEqual(bad,original);
});

test('three-day asymmetric SOC matches independent energy, source-hour billing, inventory and saved settings',()=>{
 let p=verificationCases()[0].project;
 p.station.A.capacityKWh=513;p.station.B.capacityKWh=513;
 p=applyStationSOC(applyStationSOC(p,'A',.2,.8),'B',.3,.8);
 const r=simulate(p),grid=1692.9/(.98*.95);
 near(r.totals.deliveredKWh,1692.9);near(r.totals.gridKWh,grid);near(r.totals.lossKWh,125.4673469387755);
 near(r.totals.initialStoredKWh,820.8);near(r.totals.finalStoredKWh,820.8);
 assert.equal(r.totals.completed,6);near(r.totals.unservedKWh,0);
 // Independent source-hour settlement: A/day 23.50+5*26.85+7.55=165.30;
 // B/day 23.50+4*26.85+6.85=137.75. Do not round total kWh*tariff once.
 assert.equal(r.totals.revenue,1354.32);assert.equal(r.totals.gridCost,909.15);
 assert.ok(r.totals.maxBalanceResidual<1e-6);
 assert.ok(!r.diagnostics.some(d=>d.code==='SWAP_ENERGY_MISMATCH'));
 const full=flowView(r,4320,'cumulative',0);near(full.grid,grid);near(full.terminal,1692.9);near(full.loss,grid-1692.9);
 const json=parseProject(JSON.parse(JSON.stringify(p))),xlsx=importWorkbook(exportWorkbook(p,r));
 assert.deepEqual(json,p);assert.deepEqual(xlsx,p);assert.deepEqual(simulate(xlsx),r);
 const target=verificationCases()[0].project;
 const equipment=importEquipmentProfile(target,exportEquipmentJSON(p),'json').project;
 assert.equal(equipment.services,target.services);assert.deepEqual(equipment.station,p.station);
 // Explicit same-value apply repairs imported equipment/demand mismatch.
 const synced=applyStationSOC(applyStationSOC(equipment,'A',.2,.8),'B',.3,.8);
 assert.deepEqual(synced,p);assert.deepEqual(simulate(synced),r);
 const demand=importServiceProfile(p,exportServiceCSV(p),'csv','replace').project;
 assert.deepEqual(demand,p);
});
