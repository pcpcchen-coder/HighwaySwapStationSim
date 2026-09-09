import type {AllocatedPower,BatteryInspection} from '../service-fleet/contracts.ts';
import {socAtEnergy} from '../service-fleet/battery-energy.ts';

export type BatteryStatus='charging'|'ready'|'swapping'|'waiting-power'|'disabled';
export interface BatteryInterval extends BatteryInspection {
 fromMinute:number;toMinute:number;inputKW:number;storedKW:number;status:BatteryStatus;
}
export interface BatteryTrace {version:1;endMinute:number;slots:{slotId:string;sink:string;intervals:BatteryInterval[]}[];}
export interface BatteryView extends BatteryInterval {atMinute:number;}
/** Stores constant-power intervals, never interpolates across a pack exchange.
 * Compression merges only continuous energy evolution with identical identity,
 * limits and status. SOC is obtained by inverting the pack's energy/SOC map. */
export function createBatteryTrace(endMinute:number):BatteryTrace{return {version:1,endMinute,slots:[]};}
export function recordBatteryTrace(trace:BatteryTrace,states:BatteryInspection[],fromMinute:number,toMinute:number,power:AllocatedPower,eta:Map<string,number>):void{
 for(const state of states){
  const inputKW=power[`battery:${state.fleetId}:${state.slotId}`]??0,storedKW=inputKW*(eta.get(state.sink)??1);
  const status:BatteryStatus=state.reserved?'swapping':!state.enabled?'disabled':state.remainingKWh<=1e-8?'ready':inputKW>1e-8?'charging':'waiting-power';
  const row:BatteryInterval={...state,fromMinute,toMinute,inputKW,storedKW,status};
  let slot=trace.slots.find(s=>s.slotId===state.slotId);if(!slot){slot={slotId:state.slotId,sink:state.sink,intervals:[]};trace.slots.push(slot);}
  const last=slot.intervals.at(-1);
  const stable=(x:BatteryInterval)=>JSON.stringify({...x,fromMinute:0,toMinute:0,energyKWh:0,soc:0,remainingKWh:0});
  if(last&&fromMinute<toMinute&&last.toMinute===fromMinute&&stable(last)===stable(row)&&Math.abs(last.energyKWh+last.storedKW*(fromMinute-last.fromMinute)/60-row.energyKWh)<1e-7)last.toMinute=toMinute;
  else slot.intervals.push(structuredClone(row));
 }
}
/** Right-continuous endpoint state: a swap completing exactly at the cursor has
 * already returned its low-SOC pack. Cumulative views use this same endpoint SOC. */
export function batteryStateAt(trace:BatteryTrace|undefined,sinkOrSlotId:string,minute:number):BatteryView|null{
 if(!trace||!Number.isFinite(minute)||minute<0||minute>trace.endMinute)return null;
 const rows=trace.slots.find(s=>s.sink===sinkOrSlotId||s.slotId===sinkOrSlotId)?.intervals;if(!rows?.length)return null;
 let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>>1;if(rows[mid].fromMinute<=minute)lo=mid+1;else hi=mid;}
 const row=rows[lo-1];if(!row||minute>row.toMinute)return null;
 const energyKWh=row.energyKWh+row.storedKW*(minute-row.fromMinute)/60;
 return {...row,atMinute:minute,energyKWh,soc:socAtEnergy(row.capacityKWh,row.soh,energyKWh,row.energySOC),remainingKWh:Math.max(0,row.targetEnergyKWh-energyKWh)};
}
/** Readable export contains both endpoints for every constant-power interval. */
export function batteryTraceRows(trace:BatteryTrace|undefined):Record<string,unknown>[] {
 return trace?.slots.flatMap(slot=>slot.intervals.map(r=>({...r,endEnergyKWh:r.energyKWh+r.storedKW*(r.toMinute-r.fromMinute)/60,endSOC:socAtEnergy(r.capacityKWh,r.soh,r.energyKWh+r.storedKW*(r.toMinute-r.fromMinute)/60,r.energySOC)})))??[];
}
/** Curve points are separate worksheet rows, never an oversized Excel cell. */
export function batteryWorkbookRows(trace:BatteryTrace|undefined):{intervals:Record<string,unknown>[];curves:Record<string,unknown>[]} {
 const ids=new Map<string,string>(),curves:Record<string,unknown>[]=[];
 const intervals=batteryTraceRows(trace).map(({energySOC,...row})=>{
  const points=energySOC as BatteryInspection['energySOC'];let curveId:string|null=null;
  if(points){const key=JSON.stringify(points);curveId=ids.get(key)??`curve-${ids.size+1}`;if(!ids.has(key)){ids.set(key,curveId);for(const point of points)curves.push({curveId,...point});}}
  return {...row,energySOCModel:points?'PIECEWISE':'LINEAR',energySOCCurveId:curveId};
 });return {intervals,curves};
}
