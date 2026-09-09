import type {Project} from '../contracts/index.ts';
import type {Passenger} from './contracts.ts';
import type {FleetConfig,BatterySlotConfig} from '../service-fleet/contracts.ts';
import {SeededRandom} from '../sim-kernel/index.ts';
import {known} from '../physical-models/index.ts';

/** Materialize slot parameters without requiring unrelated service or electrical drafts to be runnable. */
export function compileTruckSlots(p:Project,s:'A'|'B'):BatterySlotConfig[]{
 const st=p.station[s],c=p.detailed!;
 const slots:BatterySlotConfig[]=Array.from({length:st.batteries},(_,i)=>{const id=`${s}-rack-${i}`,override=c.service.truckSlotOverrides.find(o=>o.enabled&&o.slot.id===id);return override?structuredClone(override.slot):{id,sink:id,battery:{id:`${id}-initial`,family:`truck-${s}`,capacityKWh:st.capacityKWh,soh:1,initialSOC:st.readySOC},chargeKW:st.batteryChargeKW,chargeEfficiency:1};});
 return slots;
}
export function compilePassengerSlots(pc:Passenger):BatterySlotConfig[]{
 const s=pc.station;
 const slots=Array.from({length:pc.slots},(_,i):BatterySlotConfig=>{const id=`${s}-passenger-rack-${i}`,override=pc.slotOverrides.find(o=>o.enabled&&o.slot.id===id);return override?structuredClone(override.slot):{id,sink:id,battery:{id:`${id}-initial`,family:`CATL-${s}`,capacityKWh:pc.capacityKWh,soh:pc.soh,initialSOC:pc.initialSOC},chargeKW:pc.batteryChargeKW,chargeEfficiency:pc.batteryEfficiency};});
 return slots;
}

/** Rebuild derived demand from the CURRENT station/SOC/hourly design without
 * replacing the user's explicit per-pack, per-vehicle, or electrical settings. */
export function compileFleet(p:Project):FleetConfig{
 const c=p.detailed!,result:FleetConfig={swaps:[],profiles:structuredClone(c.service.profiles),guns:[],swapArrivals:structuredClone(c.service.swapArrivals),chargeArrivals:structuredClone(c.service.chargeArrivals)};
 for(const s of ['A','B'] as const){const st=p.station[s];
  const slots=compileTruckSlots(p,s);
  result.swaps.push({id:`${s}-truck`,station:s,kind:'truck-swap',enabled:true,bays:st.bays,swapMinutes:st.swapMinutes,readySOC:st.readySOC,slots});
 }
 for(const n of p.topology.nodes.filter(n=>n.type==='gun')){
  const parent=p.topology.edges.find(e=>e.target===n.id)?.source??n.id;
  // The fixed-voltage energy model uses the physical gun limit; SOC profiles
  // evaluate their own voltage/current bands in ServiceFleet.
  result.guns.push({id:n.id,sink:n.id,station:n.station,terminal:parent,enabled:n.enabled,maxKW:n.params.kw,maxCurrentA:n.params.amps,maxVoltageV:n.params.voltage});
 }
 if(c.service.useHourlyTruckDemand){const rng=new SeededRandom(p.seed);let ordinal=0;
  for(const row of p.services)for(const kind of ['swap','charge'] as const){const count=kind==='swap'?row.swapCount:row.chargeCount,energy=kind==='swap'?row.swapKWh:row.chargeKWh;
   if(count>0&&energy<=0)throw Error(`逐時${kind}需求有車次但沒有電量：${row.station} D${row.day+1} ${row.hour}時`);
   for(let i=0;i<count;i++){const atMinute=row.day*1440+row.hour*60+(p.arrival==='SEEDED'?rng.next()*60:i*60/count),id=`hourly-${row.station}-${row.day}-${row.hour}-${kind}-${ordinal++}`,unitPrice=p.billing==='SOURCE_DISPLAY_PRICE'?(kind==='swap'?row.swapTotalRaw:row.chargeTotalRaw):row.gridPrice+(kind==='swap'?row.swapFee:row.chargeFee);
    if(kind==='swap'){const st=p.station[row.station];result.swapArrivals.push({id,fleetId:`${row.station}-truck`,atMinute,returnSOC:null,requestedKWh:energy/count,minReturnSOC:st.returnSOC,unitPrice,returnedPack:null});}
    else if(energy>0)result.chargeArrivals.push({id,station:row.station,atMinute,unitPrice,gunsRequired:1,energyKWh:energy/count,profileId:null,initialSOC:null,targetSOC:null,temperatureC:null,temperatureSchedule:[],allowedGunIds:null});
   }
  }
 }
 for(const pc of c.service.passenger)if(pc.enabled){const s=pc.station;
  const slots=compilePassengerSlots(pc);
  result.swaps.push({id:`${s}-passenger`,station:s,kind:'passenger-swap',enabled:true,bays:pc.bays,swapMinutes:pc.swapSeconds/60,readySOC:pc.readySOC,slots});
  for(const row of pc.arrivals)for(let i=0;i<row.count;i++)result.swapArrivals.push({id:`passenger-${row.id}-${i}`,fleetId:`${s}-passenger`,atMinute:row.atMinute,returnSOC:row.returnSOC??pc.returnSOC,unitPrice:row.unitPrice,returnedPack:null});
 }
 for(const job of [...result.swapArrivals,...result.chargeArrivals])if(job.atMinute>=p.horizonDays*1440)throw Error(`到站事件 ${job.id} 超過目前模擬期間`);
 if(result.swapArrivals.length+result.chargeArrivals.length>20000)throw Error('完整模型上限為 20,000 個到站事件');
 for(const f of result.swaps)for(const slot of f.slots)if(!p.topology.nodes.some(n=>n.id===slot.sink))throw Error(`缺少 ${slot.sink}，請套用設定並重建完整拓撲`);
 for(const pc of c.service.passenger)if(pc.enabled){known(pc.chargerEfficiency,`${pc.station}.passenger.chargerEfficiency`,.001,1);known(pc.dcVoltageV,`${pc.station}.passenger.dcVoltageV`,1,1500);known(pc.auxIdleKW,`${pc.station}.passenger.auxIdleKW`);known(pc.auxActiveKW,`${pc.station}.passenger.auxActiveKW`);}
 return result;
}
