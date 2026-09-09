import type {RunResult} from '../contracts/index.ts';
import type {FlowView} from '../power-trace/index.ts';
import type {StorageLedger} from '../detailed-model/contracts.ts';
import type {ServiceEvent} from '../service-fleet/contracts.ts';
export interface StorageWindowRow {
 id:string;station:'A'|'B';kind:'ESS'|'UPS';initialStoredKWh:number;finalStoredKWh:number;
 input:number;output:number;conversionLoss:number;selfDischarge:number;capacitySpillKWh:number;
 passiveLoss:number;delta:number;balanceResidual:number;
}
export interface OperatingWindow {
 available:boolean;reason?:string;swapDeliveredKWh:number;directDeliveredKWh:number;swapBatteryDeltaKWh:number;
 auxiliaryKWh:number;balanceResidualKWh:number;swapEndpointPolicy:string;
}
export interface FlowBoundary {
 available:boolean;unit:'kW'|'kWh';from:number;to:number;grid:number;pv:number;externalInput:number;
 storageWithdrawal:number;storageCharge:number;export:number;serviceTerminal:number;networkLoss:number;
 selfDischarge:number;capacitySpillKWh:number;passiveLoss:number;storageDelta:number;
 totalLoss:number;networkResidual:number;externalResidual:number|null;
 pvAvailable:number;pvCurtailed:number;storage:StorageWindowRow[];operating:OperatingWindow|null;
 issues:string[];storageEndpointPolicy:string;
}
const metadata=(row:StorageLedger)=>row as StorageLedger&{initialStoredKWh?:number;inputKW?:number;outputKW?:number;selfDischargeKWh?:number;capacitySpillKWh?:number};
/** Exact E(t) for the saved constant-input interval, before its closing capacity spill. */
function rowModel(row:StorageLedger,chargeEfficiency:number,dischargeEfficiency:number,lambda:number){
 const m=metadata(row),hours=(row.toMinute-row.fromMinute)/60;if(!(hours>0))throw Error(`STORAGE_INTERVAL:${row.id}`);
 const initial=m.initialStoredKWh??row.storedKWh-row.deltaKWh,inputKW=m.inputKW??row.inputKWh/hours,outputKW=m.outputKW??row.outputKWh/hours,q=inputKW*chargeEfficiency-outputKW/dischargeEfficiency;
 if(![initial,inputKW,outputKW,q,lambda].every(Number.isFinite)||lambda<0)throw Error(`STORAGE_METADATA:${row.id}`);
 const energyAt=(elapsed:number)=>lambda===0?initial+q*elapsed:initial*Math.exp(-lambda*elapsed)+q*(-Math.expm1(-lambda*elapsed))/lambda;
 const spill=m.capacitySpillKWh??Math.max(0,energyAt(hours)-row.storedKWh);
 return {hours,initial,inputKW,outputKW,q,energyAt,spill};
}
/** Storage accounting endpoints are post-event: closing spill belongs to the
 * preceding interval. Continuous power is [from,to); closing adjustments are
 * (from,to]. Both are differences of one cumulative function and are additive. */
function storageWindow(result:RunResult,view:FlowView):{rows:StorageWindowRow[];issues:string[]}{
 const rows:StorageWindowRow[]=[],issues:string[]=[],detail=result.detailedResult,p=result.parameterSnapshot,horizon=p.horizonDays*1440;
 if(!detail||!p.detailed)return {rows,issues};
 for(const store of p.detailed.storage.filter(s=>s.config.enabled)){
  const ledger=detail.storage.filter(r=>r.id===store.id).sort((a,b)=>a.fromMinute-b.fromMinute),etaC=store.config.chargeEfficiency,etaD=store.config.dischargeEfficiency,lambda=store.config.selfDischargePerHour;
  if(!ledger.length||etaC===null||etaD===null||lambda===null){issues.push(`${store.id} 缺少儲能帳本或已保存的效率／自放電係數`);continue;}
  try{
   const models=ledger.map(row=>rowModel(row,etaC,etaD,lambda));
   const stateAt=(minute:number)=>{
    const ending=ledger.findIndex(r=>r.toMinute===minute);if(ending>=0)return ledger[ending].storedKWh;
    const i=ledger.findIndex(r=>r.fromMinute<=minute&&minute<r.toMinute);if(i>=0)return models[i].energyAt(Math.max(0,(minute-ledger[i].fromMinute)/60));
    if(minute===ledger[0].fromMinute)return models[0].initial;
    throw Error(`STORAGE_TIME_GAP:${store.id}:${minute}`);
   };
   if(view.mode==='power'){
    const minute=view.minute,index=ledger.findIndex(r=>r.fromMinute<=minute&&(minute<r.toMinute||minute===horizon&&r.toMinute===horizon));if(index<0)throw Error(`STORAGE_POWER_TIME:${store.id}`);
    const row=ledger[index],model=models[index],energy=model.energyAt(Math.max(0,Math.min(model.hours,(minute-row.fromMinute)/60))),self=lambda*energy,conversion=model.inputKW*(1-etaC)+model.outputKW*(1/etaD-1),delta=model.q-self;
    rows.push({id:store.id,station:store.station,kind:store.kind,initialStoredKWh:energy,finalStoredKWh:energy,input:model.inputKW,output:model.outputKW,conversionLoss:conversion,selfDischarge:self,capacitySpillKWh:minute<horizon?ledger.reduce((v,r,i)=>v+(r.toMinute===minute?models[i].spill:0),0):0,passiveLoss:self,delta,balanceResidual:model.inputKW-model.outputKW-conversion-self-delta});
   }else{
    const from=view.from,to=view.to;let input=0,output=0,self=0,spill=0;
    if(to>from)for(let i=0;i<ledger.length;i++){const row=ledger[i],model=models[i],a=Math.max(from,row.fromMinute),b=Math.min(to,row.toMinute);
     if(b>a){const u=(a-row.fromMinute)/60,v=(b-row.fromMinute)/60,dt=v-u;input+=model.inputKW*dt;output+=model.outputKW*dt;self+=Math.max(0,model.energyAt(u)+model.q*dt-model.energyAt(v));}
     if(row.toMinute>from&&row.toMinute<=to)spill+=model.spill;
    }
    const initial=stateAt(from),final=stateAt(to),delta=final-initial,conversion=input*(1-etaC)+output*(1/etaD-1),passive=self+spill;
    rows.push({id:store.id,station:store.station,kind:store.kind,initialStoredKWh:initial,finalStoredKWh:final,input,output,conversionLoss:conversion,selfDischarge:self,capacitySpillKWh:spill,passiveLoss:passive,delta,balanceResidual:input-output-conversion-passive-delta});
   }
  }catch(e){issues.push(e instanceof Error?e.message:String(e));}
 }
 return {rows,issues};
}
function integrateService(events:ServiceEvent[],from:number,to:number,horizon:number):{available:boolean;swap:number;direct:number;delta:number;reason?:string}{
 let swap=0,direct=0,delta=0;if(to<=from)return {available:true,swap,direct,delta};
 for(const event of events){
  if(event.kind==='swap-complete'){
   const included=event.atMinute>=from&&event.atMinute<to||to===horizon&&event.atMinute===horizon&&from<to;
   if(included){swap+=event.deliveredKWh;delta+=event.storedChangeKWh;}continue;
  }
  if(event.kind!=='battery-charge'&&event.kind!=='charge-energy')continue;
  const end=(event as ServiceEvent&{toMinute?:number}).toMinute;
  if(end===undefined){if(event.atMinute>=to)continue;return {available:false,swap,direct,delta,reason:'舊服務帳缺少區間終點，無法精確拆分任意時間窗；請重新測算。'};}
  const a=Math.max(from,event.atMinute),b=Math.min(to,end);if(b<=a)continue;
  const fraction=(b-a)/(end-event.atMinute);if(event.kind==='battery-charge')delta+=event.storedChangeKWh*fraction;else direct+=event.deliveredKWh*fraction;
 }
 return {available:true,swap,direct,delta};
}
/** Site boundary measured at the graph's generation and terminal ports.
 * Storage source/sink ports remain visible in the graph but cancel internally. */
export function flowBoundary(result:RunResult,view:FlowView):FlowBoundary{
 const p=result.parameterSnapshot,types=new Map(p.topology.nodes.map(n=>[n.id,n.type])),sum=(pick:(id:string)=>boolean,field:'input'|'terminal')=>view.nodes.reduce((v,n)=>v+(pick(n.id)?n[field]:0),0);
 const grid=sum(id=>types.get(id)==='grid','input'),pv=sum(id=>types.get(id)==='pv-source','input'),withdraw=sum(id=>['storage-source','ups-source'].includes(types.get(id)??''),'input'),charge=sum(id=>types.get(id)==='storage-sink','terminal'),exported=sum(id=>types.get(id)==='grid-export','terminal');
 const external=grid+pv,serviceTerminal=view.terminal-charge-exported,networkResidual=external+withdraw-view.loss-view.terminal,stores=storageWindow(result,view),total=(key:keyof StorageWindowRow)=>stores.rows.reduce((v,r)=>v+Number(r[key]),0);
 const self=total('selfDischarge'),spill=total('capacitySpillKWh'),passive=total('passiveLoss'),delta=total('delta'),issues=[...stores.issues];
 const expectedStores=p.detailed?.storage.filter(s=>s.config.enabled).length??0,complete=stores.rows.length===expectedStores&&issues.length===0;
 let available=0,curtailed=0;for(const row of result.detailedResult?.pv??[]){const hours=(row.toMinute-row.fromMinute)/60;if(hours<=0)continue;
  if(view.mode==='power'){if(row.fromMinute<=view.minute&&(view.minute<row.toMinute||view.minute===p.horizonDays*1440&&row.toMinute===view.minute)){available+=row.availableKWh/hours;curtailed+=row.curtailedKWh/hours;}}
  else{const a=Math.max(view.from,row.fromMinute),b=Math.min(view.to,row.toMinute);if(b>a){const ratio=(b-a)/(row.toMinute-row.fromMinute);available+=row.availableKWh*ratio;curtailed+=row.curtailedKWh*ratio;}}
 }
 const auxiliaryIds=new Set(p.detailed?.loads.map(l=>l.nodeId)??[]);for(const pc of p.detailed?.service.passenger??[])if(pc.enabled)auxiliaryIds.add(`${pc.station}-passenger-aux`);
 const aux=sum(id=>auxiliaryIds.has(id)||['ac-load','swap-bay','passenger'].includes(types.get(id)??''),'terminal');
 let operating:OperatingWindow|null=null;
 if(view.mode!=='power'&&result.detailedResult){const e=integrateService(result.detailedResult.serviceEvents,view.from,view.to,p.horizonDays*1440);operating={available:e.available&&complete,reason:e.reason,swapDeliveredKWh:e.swap,directDeliveredKWh:e.direct,swapBatteryDeltaKWh:e.delta,auxiliaryKWh:aux,balanceResidualKWh:external-exported-view.loss-passive-aux-e.direct-e.swap-e.delta-delta,swapEndpointPolicy:'換電完成事件採 from ≤ t < to；模擬期末完成另歸最後關帳區間。'};}
 return {available:view.available&&complete,unit:view.unit,from:view.from,to:view.to,grid,pv,externalInput:external,storageWithdrawal:withdraw,storageCharge:charge,export:exported,serviceTerminal,networkLoss:view.loss,selfDischarge:self,capacitySpillKWh:spill,passiveLoss:passive,storageDelta:delta,totalLoss:view.loss+passive,networkResidual,externalResidual:complete?external-exported-serviceTerminal-view.loss-passive-delta:null,pvAvailable:available,pvCurtailed:curtailed,storage:stores.rows,operating,issues,storageEndpointPolicy:'連續功率採 [from,to)；儲能端點為步末調整後庫存，容量衰減溢出損失採 from < t ≤ to，計入前一區間。'};
}
