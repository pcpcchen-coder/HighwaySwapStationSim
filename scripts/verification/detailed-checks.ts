import assert from 'node:assert/strict';
import type {RunResult} from '../../packages/contracts/index.ts';
import type {DetailedRun} from '../../packages/detailed-model/contracts.ts';
import {billMeterMonths} from '../../packages/extended-finance/index.ts';
import oracleData from '../../data/verification/detailed-expected.json' with {type:'json'};
const oracle=oracleData as {cases:any[];pvExportGolden:Record<string,string>};
export function compareDetailedResult(id:string,result:RunResult){
 const r=result as DetailedRun;assert.ok(r.detailedResult,`${id}: missing detailed result`);const rows:{name:string;actual:number;expected:number;delta:number}[]=[];
 const check=(actual:number,want:unknown,name:string)=>{const expected=Number(want),delta=Math.abs(actual-expected);assert.ok(Number.isFinite(actual)&&delta<=1e-6,`${id}.${name}: ${actual} != ${want}`);rows.push({name,actual,expected,delta});};
 const fleet=r.detailedResult.fleet,energy=r.detailedResult.energy;
 check(energy.balanceResidualKWh,0,'detailedEnergyBalance');check(fleet.totals.inventoryResidualKWh,0,'fleetInventoryBalance');
 if(id.startsWith('V04')){
  const e=oracle.cases[0].expected;for(const key of ['gridKWh','lossKWh'] as const)check(r.totals[key],e[key],key);
  check(r.totals.deliveredKWh,540,'delivery');check(r.totals.revenue,540,'revenue');check(fleet.totals.completed,9,'completed');check(fleet.totals.initialStoredKWh,200,'initialStock');check(fleet.totals.finalStoredKWh,200,'finalStock');
  const byId=new Map(fleet.transactions.map(t=>[t.id,t]));for(let day=0;day<3;day++){check(byId.get(`swap-${day}`)!.completion!,day*1440+7.5,`swapCompletion${day}`);check(byId.get(`a-charge-${day}`)!.completion!,Number(e.aEVCompletionMinute[day])+7.5,`aCompletion${day}`);check(byId.get(`b-charge-${day}`)!.completion!,Number(e.bEVCompletionMinute[day])+7.5,`bCompletion${day}`);}
 }else if(id.startsWith('V05')){
  const e=oracle.cases[1].expected;check(r.totals.gridKWh,e.gridKWh,'grid');check(energy.pvKWh,e.pvHarvestedRawKWh,'pvGeneration');check(r.totals.lossKWh,e.lossKWh,'totalLoss');check(energy.auxiliaryKWh,e.terminalKWh,'auxTerminal');check(energy.storageInitialKWh,70,'storageInitial');check(energy.storageFinalKWh,70,'storageFinal');check(r.detailedResult.pv.reduce((s,x)=>s+x.curtailedKWh,0),80,'curtail');
  for(const [id,want]of[['A-ess',50],['A-ups',20]] as const){const last=r.detailedResult.storage.filter(s=>s.id===id).at(-1);assert.ok(last,`missing storage ${id}`);check(last.storedKWh,want,`${id}.final`);}
 }else{
  const e=oracle.cases[2].expected;check(r.totals.gridKWh,e.gridKWh,'grid');check(r.totals.deliveredKWh,e.deliveredKWh,'delivered');check(r.totals.revenue,e.revenue,'revenue');check(r.totals.gridCost,e.energyCharge,'sourceHourEnergyBill');check(r.totals.lossKWh,0,'loss');check(fleet.totals.initialStoredKWh,1600,'initialStock14slotsPlusTruck');check(fleet.totals.finalStoredKWh,1600,'finalStock14slotsPlusTruck');
  const swaps=fleet.transactions.filter(t=>t.kind==='passenger-swap');check(swaps.length,5,'passengerCount');swaps.forEach((t,i)=>check(t.completion!,e.passengerSwapCompletionMinutes[i],`passengerComplete${i}`));
  const bill=billMeterMonths(r,r.parameterSnapshot.detailed!.finance);assert.deepEqual(bill.issues,[]);check(bill.total!,e.estimatedInvoice,'estimatedInvoice');check(r.totals.revenue-bill.total!,e.cashContributionAfterEstimatedBill,'cashContribution');
  for(const b of bill.rows){check(b.observedMaximum15minKW!,b.sourceId==='A-grid'?200:80,`${b.sourceId}.${b.month}.15minutePeak`);assert.equal(b.trueMonthlyMaximumKnown,false);}
 }
 return {id,checks:rows.length,maxDelta:Math.max(0,...rows.map(x=>x.delta)),allPassed:true,rows};
}

export function auditLedgers(r:RunResult){
 let checks=0,maxDelta=0;
 const near=(a:number,b:number,key:string)=>{const delta=Math.abs(a-b);maxDelta=Math.max(maxDelta,delta);if(!Number.isFinite(a)||!Number.isFinite(b)||delta>1e-6)throw Error(`LEDGER:${key}:${a}!=${b}`);checks++;};
 const trace=r.powerTrace!;if(!trace)throw Error('MISSING_POWER_TRACE');
 const count=r.parameterSnapshot.horizonDays*24;
 function hours(samples:number[][],column:number){
  const totals=Array(count).fill(0);for(let i=0;i<samples.length;i++){
   const start=samples[i][0],end=samples[i+1]?.[0]??trace.endMinute;
   if(end<start)throw Error('UNSORTED_TRACE');
   for(let hour=Math.floor(start/60);hour<Math.min(count,Math.ceil(end/60));hour++){
    const overlap=Math.max(0,Math.min(end,60*(hour+1))-Math.max(start,60*hour));totals[hour]+=samples[i][column]*overlap/60;
   }
  }return totals;
 }
 for(const n of trace.nodes){
  if(n.samples[0]?.[0]!==0)throw Error(`TRACE_MISSING_ZERO:${n.nodeId}`);
  const rows=new Map(r.componentEnergy.filter(row=>row.nodeId===n.nodeId).map(row=>[row.day*24+row.hour,row]));
  for(const [index,key]of(['inputKWh','outputKWh','lossKWh','terminalKWh'] as const).entries())hours(n.samples,index+1).forEach((v,h)=>near(v,rows.get(h)?.[key]??0,`${n.nodeId}:${h}:${key}`));
  if(r.parameterSnapshot.topology.nodes.find(x=>x.id===n.nodeId)?.type==='grid'){
   const meters=new Map(r.sourceMeters.filter(m=>m.sourceId===n.nodeId).map(m=>[m.day*24+m.hour,m.importKWh]));
   hours(n.samples,1).forEach((v,h)=>near(v,meters.get(h)??0,`${n.nodeId}:${h}:sourceMeter`));
  }
 }
 for(const edge of trace.edges){const rows=new Map(r.edgeEnergy.filter(e=>e.edgeId===edge.edgeId).map(e=>[e.day*24+e.hour,e.kWh]));hours(edge.samples,1).forEach((v,h)=>near(v,rows.get(h)??0,`${edge.edgeId}:${h}:edge`));}
 near(r.sourceMeters.reduce((s,m)=>s+m.importKWh,0),r.totals.gridKWh,'totalGrid');
 near(r.hours.reduce((s,h)=>s+h.deliveredKWh,0),r.totals.deliveredKWh,'totalDelivered');
 near(r.sourceMeters.reduce((s,m)=>s+m.cost,0),r.totals.gridCost,'totalGridCost');
 return {checks,maxDelta,allPassed:true};
}

