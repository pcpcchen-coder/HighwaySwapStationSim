import type {RunResult} from '../contracts/index.ts';
import {batteryStateAt} from '../battery-trace/index.ts';

/** Remove opening-stock consumption from an energy-throughput estimate. This
 * is a planning approximation, not proof of stable queues or a feasible annual
 * service schedule. The physical run itself is never altered. */
export function inventoryAdjustment(r:RunResult,branchOf:(sink:string)=>'ac'|'dc'|null){
 const trace=r.detailedResult?.batteryTrace,end=r.parameterSnapshot.horizonDays*1440;
 const delta={ac:0,dc:0,other:0},sales={ac:0,dc:0},revenue={ac:0,dc:0};
 let complete=!!trace;
 for(const slot of trace?.slots??[]){
  const opening=batteryStateAt(trace,slot.slotId,0),closing=batteryStateAt(trace,slot.slotId,end);
  if(!opening||!closing){complete=false;continue;}
  const branch=branchOf(slot.sink)??'other';delta[branch]+=closing.energyKWh-opening.energyKWh;
 }
 for(const e of r.detailedResult?.serviceEvents??[]){
  if(e.kind!=='swap-complete'||!e.slotId||!e.jobId?.startsWith('hourly-'))continue;
  const branch=branchOf(e.slotId);if(branch){sales[branch]+=e.deliveredKWh;revenue[branch]+=e.revenueDelta;}
 }
 const removed={ac:Math.max(0,-delta.ac),dc:Math.max(0,-delta.dc)};
 // With competing manual swaps, do not attribute their stock consumption to
 // profile sales. Such cases require a dedicated continuous-operation model.
 const manualSwaps=(r.detailedResult?.serviceEvents??[]).some(e=>e.kind==='swap-complete'&&!e.jobId?.startsWith('hourly-'));
 const valid=complete&&delta.other>=-.01&&removed.ac<=sales.ac+.01&&removed.dc<=sales.dc+.01&&(!manualSwaps||removed.ac+removed.dc<.01);
 const revenueRemoved=(['ac','dc'] as const).reduce((v,b)=>v+(sales[b]?removed[b]*revenue[b]/sales[b]:0),0);
 return {valid,delta,removed,removedKWh:removed.ac+removed.dc,revenueRemoved};
}
