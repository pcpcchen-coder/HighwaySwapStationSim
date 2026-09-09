import type {Project,Equipment} from '../contracts/index.ts';
import type {NetworkPolicy} from '../detailed-network/index.ts';
import {equipmentEfficiency} from '../equipment-efficiency/index.ts';
import {outputCapacity} from '../electrical-engine/index.ts';
import {equipmentRegistry} from '../../plugins/equipment/index.ts';
import {cableForOutput,converterForOutput,transformerForOutput,compensate,interpolate} from '../physical-models/index.ts';
export interface PolicyState {caps:Map<string,number>;temperatures:Map<string,number>;slotEta:Map<string,number>;sourcePrices:Map<string,number>;lastOutput:Map<string,number>;minutesSinceLast:number;dynamicVoltages?:Map<string,number>;}
export function physicsPolicy(p:Project,state:PolicyState):NetworkPolicy & {reading:(n:Equipment,out:number)=>{inputKW:number;currentA:number;voltageV:number;reactiveKvar:number;withinLimits:boolean};standby:(n:Equipment)=>number}{
 const byId=new Map(p.detailed!.physics.map(m=>[m.nodeId,m]));
 const reading=(n:Equipment,out:number)=>{
  const m=byId.get(n.id),compOwner=n.type==='transformer'?p.topology.nodes.find(x=>x.type==='compensation'&&x.station===n.station&&x.enabled&&byId.get(x.id)?.compensation.enabled):undefined,compModel=compOwner?byId.get(compOwner.id):m,voltage=state.dynamicVoltages?.get(n.id)??equipmentRegistry.get(n.type).ports(n).find(p=>p.direction==='input')?.voltage??equipmentRegistry.get(n.type).ports(n)[0]?.voltage??800;
  if(!n.enabled)return {inputKW:0,currentA:0,voltageV:0,reactiveKvar:0,withinLimits:true};
  const domain=equipmentRegistry.get(n.type).ports(n)[0]?.domain??'DC',pf=compModel?.loadPowerFactor??m?.loadPowerFactor??n.params.pf??1;
  let input=out/(state.slotEta.get(n.id)??n.params.eta??equipmentEfficiency(p,n)),q=domain==='AC'?out*Math.sqrt(Math.max(0,1-pf*pf))/pf:0,within=true;
  let active=out;if(compModel?.compensation.enabled&&n.type==='transformer'){const comp=compensate(compModel.compensation,out,q);q=comp.reactiveKvar;active=comp.activeKW;input=active/(n.params.eta??equipmentEfficiency(p,n));}
  if(m?.transformer.enabled){const flow=transformerForOutput({...m.transformer,windingTemperatureC:state.temperatures.get(n.id)??m.transformer.windingTemperatureC},active,q);input=flow.inputKW;q=flow.inputKvar;within=flow.withinLimits;}
  if(m?.curve.enabled){const flow=converterForOutput(m.curve,active,state.temperatures.get(n.id)??m.temperatureC!);input=flow.inputKW;within=flow.withinLimits;}
  if(m?.cable.enabled){const thermal=m.thermal.enabled?interpolate(m.thermal.ampacityByAmbientC,m.ambientC!):1;
   const flow=cableForOutput({...m.cable,conductorTemperatureC:state.temperatures.get(n.id)??m.cable.conductorTemperatureC,ampacityDerating:m.cable.ampacityDerating!*thermal},out);
   return {inputKW:flow.inputKW,currentA:flow.currentA,voltageV:flow.receivingVoltageV,reactiveKvar:flow.inputKvar,withinLimits:flow.withinLimits&&(m.currentLimitA===null||flow.currentA<=m.currentLimitA+1e-8)};
  }
  const current=domain==='AC'?Math.hypot(input,q)*1000/(Math.sqrt(3)*voltage):input*1000/voltage;
  if(m?.currentLimitA!==null&&m?.currentLimitA!==undefined)within&&=current<=m.currentLimitA+1e-8;
  if(n.type==='transformer'&&compModel?.compensation.enabled)within&&=Math.hypot(input,q)<=n.params.kva+1e-8;
  return {inputKW:input,currentA:current,voltageV:voltage,reactiveKvar:q,withinLimits:within};
 };
 return {
  reading,
  standby:n=>reading(n,0).inputKW,
  inputForOutput:(n,out)=>reading(n,out).inputKW,
  capacity:n=>{
   const m=byId.get(n.id),hasComp=m?.compensation.enabled||p.topology.nodes.some(x=>x.type==='compensation'&&x.station===n.station&&x.enabled&&byId.get(x.id)?.compensation.enabled);let limit=(n.type==='transformer'&&(m?.transformer.enabled||hasComp))?n.params.kva:n.type==='gun'&&state.dynamicVoltages?.has(n.id)?Math.min(n.params.kw,n.params.amps*state.dynamicVoltages.get(n.id)!/1000):outputCapacity(p,n);
   if(state.caps.has(n.id))limit=Math.min(limit,state.caps.get(n.id)!);
   if(m?.rampKWPerMinute!==null&&m?.rampKWPerMinute!==undefined)limit=Math.min(limit,(state.lastOutput.get(n.id)??0)+m.rampKWPerMinute*state.minutesSinceLast);
   return Math.max(0,limit);
  },
  inputCapacity:n=>{const m=byId.get(n.id),hasComp=p.topology.nodes.some(x=>x.type==='compensation'&&x.station===n.station&&x.enabled&&byId.get(x.id)?.compensation.enabled);return n.type==='transformer'?n.params.kva*(m?.transformer.enabled||m?.compensation.enabled||hasComp?1:n.params.pf):Infinity;},
  withinLimits:(n,out)=>reading(n,out).withinLimits,
  sourceRank:n=>p.detailed!.dispatch.sourcePolicy==='LOWEST_PRICE'?(state.sourcePrices.get(n.id)??0):n.type==='pv-source'?-3:n.type==='storage-source'||n.type==='ups-source'?-2:0,
 };
}
