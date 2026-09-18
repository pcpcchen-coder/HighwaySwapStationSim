import source from '../../data/reference/load-scenarios-2026-09-18.json' with {type:'json'};
import type {Project,RunResult,ServiceRow,StationId} from '../contracts/index.ts';
import type {LoadLevel,LoadPlan} from './contracts.ts';
import {loadPlanSchema} from './schema.ts';
export type {LoadLevel,LoadPlan} from './contracts.ts';
export const LOAD_LEVELS:LoadLevel[]=['high','medium','low'];
export const LOAD_LABELS:Record<LoadLevel,string>={high:'高負載',medium:'中負載',low:'低負載'};
export const ANNUAL_SOURCE=source.annual;
export const LOAD_SOURCE_NOTES=source.notes;
export const DEMAND_KEYS=['swapCount','swapKWh','chargeCount','chargeKWh'] as const;
export function splitDemand(r:ServiceRow){
 const total=Object.fromEntries(DEMAND_KEYS.map(k=>[k,r[k]])) as NonNullable<ServiceRow['ac']>;
 if(!r.ac)return {total,ac:null,dc:null};
 return {total,ac:{...r.ac},dc:Object.fromEntries(DEMAND_KEYS.map(k=>[k,r[k]-r.ac![k]])) as NonNullable<ServiceRow['ac']>};
}
export function demandSummary(rows:ServiceRow[]){
 const empty=()=>({swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0,energyKWh:0});
 const total=empty(),ac=empty(),dc=empty();let routed=true;
 for(const row of rows){const parts=splitDemand(row);for(const key of DEMAND_KEYS){total[key]+=row[key];if(parts.ac&&parts.dc){ac[key]+=parts.ac[key];dc[key]+=parts.dc[key];}else routed=false;}}
 for(const part of [total,ac,dc])part.energyKWh=part.swapKWh+part.chargeKWh;
 return {total,ac,dc,routed};
}
export function defaultLoadPlan():LoadPlan{
 const profiles=structuredClone(source.profiles) as LoadPlan['profiles'];
 return {version:1,activeLoad:null,profiles,energyValueCnyPerKWh:.67,years:source.annual.map(y=>({year:y.year,load:y.load as LoadLevel,operatingDays:365,demandFactor:y.soldWanKWh*10000/(demandSummary(profiles[y.load as LoadLevel]).dc.energyKWh*365),traditionalEfficiency:y.traditionalEfficiency,sstEfficiency:y.sstEfficiency}))};
}
export const loadPlanOf=(p:Project):LoadPlan=>p.loadPlan??defaultLoadPlan();
/** Source schedules replace demand and tariff rows only; installed equipment, SOC and manual events survive. */
export function applyLoadPreset(p:Project,level:LoadLevel):Project{
 if(!p.detailed||!p.engineering)throw Error('AC/DC 分流劇本需要完整物理模型，請先載入完整物理案例。');
 const plan=loadPlanSchema.parse(loadPlanOf(p));
 const services=Array.from({length:p.horizonDays},(_,day)=>plan.profiles[level].map(r=>({...structuredClone(r),day}))).flat();
 if(services.reduce((s,r)=>s+r.swapCount+r.chargeCount,0)>20000)throw Error('劇本全期車次超過20,000，請縮短天數。');
 return {...p,name:`${LOAD_LABELS[level]} · AC/DC 逐時劇本`,mode:'CONSTRAINED',services,loadPlan:{...plan,activeLoad:level},detailed:{...p.detailed,service:{...p.detailed.service,useHourlyTruckDemand:true}}};
}
export function captureLoadProfile(p:Project,level:LoadLevel,day:number):Project{
 const rows=p.services.filter(r=>r.day===day).map(r=>({...structuredClone(r),day:0}));
 const plan={...loadPlanOf(p),activeLoad:level,profiles:{...loadPlanOf(p).profiles,[level]:rows}};
 return {...p,loadPlan:loadPlanSchema.parse(plan)};
}
export function matchesLoadProfile(p:Project,level:LoadLevel,day:number){
 const canonical=(rows:ServiceRow[])=>JSON.stringify([...rows].map(r=>({...r,day:0})).sort((a,b)=>a.station.localeCompare(b.station)||a.hour-b.hour));
 return canonical(p.services.filter(r=>r.day===day))===canonical(loadPlanOf(p).profiles[level]);
}
/** Logical branch membership is resolved from actual sharing-group connections, not the requested DD count. */
export function demandBranch(p:Project,sink:string):'ac'|'dc'|null{
 const seen=new Set<string>(),found=new Set<'ac'|'dc'>();
 function visit(id:string){if(seen.has(id))return;seen.add(id);
  if(/-dd-group-pcs$/.test(id)){found.add('ac');return;}if(/-dd-group-sst$/.test(id)){found.add('dc');return;}
  for(const e of p.topology.edges.filter(e=>e.target===id))visit(e.source);
 }visit(sink);return found.size===1?[...found][0]:null;
}
export function branchEndpoints(p:Project,station:StationId,branch:'ac'|'dc',type:'rack'|'gun'){
 return p.topology.nodes.filter(n=>n.station===station&&n.type===type&&demandBranch(p,n.id)===branch).map(n=>n.id);
}
/** One representative day, preserving first-day equipment and competing loads. No ten-year event replay is implied. */
export function capacityProject(p:Project,level:LoadLevel):Project{
 const next=applyLoadPreset({...p,horizonDays:1},level);
 next.equipmentSchedule=next.equipmentSchedule.filter(e=>e.atMinute<1440);
 next.detailed=structuredClone(next.detailed!);
 next.detailed.service.swapArrivals=next.detailed.service.swapArrivals.filter(e=>e.atMinute<1440);
 next.detailed.service.chargeArrivals=next.detailed.service.chargeArrivals.filter(e=>e.atMinute<1440);
 for(const pc of next.detailed.service.passenger)pc.arrivals=pc.arrivals.filter(e=>e.atMinute<1440);
 for(const l of next.detailed.loads)if(l.hourlyKW&&l.hourlyKW.length>24)l.hourlyKW=l.hourlyKW.slice(0,24);
 return next;
}
const canonical=(value:unknown):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function capacityMatches(p:Project,level:LoadLevel,r?:RunResult):boolean{
 if(!r?.detailedResult||r.mode!=='CONSTRAINED')return false;
 try{const a=capacityProject(p,level),b=structuredClone(r.parameterSnapshot);delete a.loadPlan;delete b.loadPlan;return canonical(a)===canonical(b);}catch{return false;}
}
export function capacitySummary(r:RunResult){
 const requested=demandSummary(r.parameterSnapshot.services),delivered={ac:0,dc:0,unassigned:0};
 for(const e of r.detailedResult?.serviceEvents??[])if(e.jobId?.startsWith('hourly-')&&e.deliveredKWh>0){const sink=e.kind==='swap-complete'?e.slotId:e.sink;const branch=sink?demandBranch(r.parameterSnapshot,sink):null;delivered[branch??'unassigned']+=e.deliveredKWh;}
 const totalDelivered=delivered.ac+delivered.dc+delivered.unassigned;
 const fleetInventoryDeltaKWh=r.totals.finalStoredKWh-r.totals.initialStoredKWh,storageInventoryDeltaKWh=(r.detailedResult?.energy.storageFinalKWh??0)-(r.detailedResult?.energy.storageInitialKWh??0);
 return {requestedKWh:requested.total.energyKWh,deliveredKWh:totalDelivered,dcDeliveredKWh:delivered.dc,acDeliveredKWh:delivered.ac,unservedKWh:Math.max(0,requested.total.energyKWh-totalDelivered),completionRatio:requested.total.energyKWh?totalDelivered/requested.total.energyKWh:1,gridKWh:r.totals.gridKWh,gridCost:r.totals.gridCost,revenue:r.totals.revenue,fleetInventoryDeltaKWh,storageInventoryDeltaKWh,inventoryDeltaKWh:fleetInventoryDeltaKWh+storageInventoryDeltaKWh,inventoryRestored:fleetInventoryDeltaKWh>=-.01&&storageInventoryDeltaKWh>=-.01,peakStationKW:Math.max(0,...r.hours.map(h=>h.peakKW)),balanceResidual:r.totals.maxBalanceResidual};
}
export type CapacityRuns=Partial<Record<LoadLevel,RunResult>>;
/** Equal customer-side energy boundary. Weighted scenario efficiencies already include their stated conversion chain. */
export function projectTenYears(p:Project,runs:CapacityRuns={}){
 const plan=loadPlanSchema.parse(loadPlanOf(p));let cumulativeBenefitCNY=0;
 const rows=plan.years.map(y=>{
  const daily=demandSummary(plan.profiles[y.load]),equivalentDays=y.operatingDays*y.demandFactor;
  const dcSalesKWh=daily.dc.energyKWh*equivalentDays,acSalesKWh=daily.ac.energyKWh*equivalentDays;
  const traditionalInputKWh=dcSalesKWh/y.traditionalEfficiency,sstInputKWh=dcSalesKWh/y.sstEfficiency;
  const savedKWh=traditionalInputKWh-sstInputKWh,benefitCNY=savedKWh*plan.energyValueCnyPerKWh;cumulativeBenefitCNY+=benefitCNY;
  const ref=source.annual.find(r=>r.year===y.year),run=runs[y.load],fresh=capacityMatches(p,y.load,run);
  const capacity=fresh?capacitySummary(run!):null;
  const canExtrapolate=capacity&&capacity.inventoryRestored&&y.demandFactor<=1;
  const estimatedDeliverableKWh=canExtrapolate?capacity.deliveredKWh*equivalentDays:null;
  const capacityLimitedDcKWh=canExtrapolate?capacity.dcDeliveredKWh*equivalentDays:null;
  return {...y,equivalentDays,dcSalesKWh,acSalesKWh,totalSalesKWh:dcSalesKWh+acSalesKWh,annualSwapCount:daily.total.swapCount*equivalentDays,annualChargeCount:daily.total.chargeCount*equivalentDays,traditionalInputKWh,sstInputKWh,savedKWh,benefitCNY,cumulativeBenefitCNY,efficiencyDifferencePct:(y.sstEfficiency-y.traditionalEfficiency)*100,
   estimatedSiteGridKWh:canExtrapolate?capacity.gridKWh*equivalentDays:null,estimatedSiteEnergyCostCNY:canExtrapolate?capacity.gridCost*equivalentDays:null,
   estimatedDeliverableKWh,capacityLimitedDcKWh,estimatedUnservedKWh:canExtrapolate?capacity.unservedKWh*equivalentDays:null,
   capacityLimitedBenefitCNY:capacityLimitedDcKWh===null?null:capacityLimitedDcKWh*(1/y.traditionalEfficiency-1/y.sstEfficiency)*plan.energyValueCnyPerKWh,
   capacityStatus:capacity?(!capacity.inventoryRestored?'inventory-depleted':y.demandFactor>1?'exceeds-reference':'representative-day'):run?'stale':'not-run',
   sourceSoldKWh:ref?ref.soldWanKWh*10000:null,sourceSavedKWh:ref?ref.savedWanKWh*10000:null,sourceBenefitCNY:ref?ref.benefitWanCNY*10000:null,
   sourceSavedDeltaKWh:ref?savedKWh-ref.savedWanKWh*10000:null};
 });
 return {basis:'representative-day-planning' as const,energyUnit:'kWh',currency:'CNY',rows,totals:{dcSalesKWh:rows.reduce((s,r)=>s+r.dcSalesKWh,0),acSalesKWh:rows.reduce((s,r)=>s+r.acSalesKWh,0),totalSalesKWh:rows.reduce((s,r)=>s+r.totalSalesKWh,0),savedKWh:rows.reduce((s,r)=>s+r.savedKWh,0),benefitCNY:cumulativeBenefitCNY}};
}
export function planningCSV(p:Project,runs:CapacityRuns={}){
 const data=projectTenYears(p,runs),keys=Object.keys(data.rows[0]);
 return '\uFEFF'+[keys.join(','),...data.rows.map(r=>keys.map(k=>(r as unknown as Record<string,unknown>)[k]??'').join(','))].join('\r\n')+'\r\n';
}
