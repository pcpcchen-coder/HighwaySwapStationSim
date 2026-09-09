/** Synthetic controlled three-day regression projects. Curves are test data,
 * not manufacturer specifications. Legacy verification fixtures stay untouched. */
import type {Project} from '../contracts/index.ts';
import {v04Project} from '../detailed-verification/index.ts';
import {compileFleet} from '../detailed-model/services.ts';
import type {ChargeBand,EnergySOCPoint} from '../service-fleet/contracts.ts';

export type SocVerificationId='linear_taper'|'nonlinear_taper'|'nonlinear_curtailed_outage';
export const SOC_VERIFICATION_IDS:SocVerificationId[]=['linear_taper','nonlinear_taper','nonlinear_curtailed_outage'];
export const SYNTHETIC_ENERGY_SOC:EnergySOCPoint[]=[{soc:0,energyFraction:0},{soc:.5,energyFraction:.4},{soc:1,energyFraction:1}];
export const SYNTHETIC_CHARGE_BANDS:ChargeBand[]=[
 {fromSOC:0,toSOC:.8,voltageV:800,maxKW:560,maxCurrentA:1000},
 {fromSOC:.8,toSOC:.9,voltageV:800,maxKW:280,maxCurrentA:1000},
 {fromSOC:.9,toSOC:1,voltageV:800,maxKW:140,maxCurrentA:1000}
];
export function socVerificationProject(id:SocVerificationId):Project {
 const p=v04Project();p.name=`SOC regression / ${id} / 3 days`;p.equipmentSchedule=[];
 for(const s of ['A','B'] as const)Object.assign(p.station[s],{capacityKWh:513,returnSOC:.2,readySOC:1,batteryChargeKW:560});
 p.efficiency.sst=.98;p.efficiency.charger=.974;
 const set=(nodeId:string,params:Record<string,number>)=>Object.assign(p.topology.nodes.find(n=>n.id===nodeId)!.params,params);
 set('A-grid',{kva:3000});set('A-sst',{kw:2000});set('A-dd',{kw:560});set('A-rack-0',{kw:560});
 p.detailed!.service.swapArrivals=Array.from({length:3},(_,day)=>({id:`swap-${day}`,fleetId:'A-truck',atMinute:day*1440,returnSOC:.2,unitPrice:1,returnedPack:null}));
 p.detailed!.service.chargeArrivals=[];
 const slot=compileFleet(p).swaps[0].slots[0];slot.chargeEfficiency=.96;slot.chargeBands=structuredClone(SYNTHETIC_CHARGE_BANDS);
 slot.battery.id='initial';slot.battery.energySOC=id==='linear_taper'?null:structuredClone(SYNTHETIC_ENERGY_SOC);
 p.detailed!.service.truckSlotOverrides=[{enabled:true,slot}];
 if(id==='nonlinear_curtailed_outage')p.detailed!.construction=Array.from({length:3},(_,day)=>[
  {atMinute:day*1440+20,equipmentId:'A-dd',enabled:true,params:{kw:280}},
  {atMinute:day*1440+35,equipmentId:'A-dd',enabled:false,params:{kw:560}},
  {atMinute:day*1440+42,equipmentId:'A-dd',enabled:true,params:{kw:560}}
 ]).flat();
 p.detailed!.assumptions=[{id:`SOC_${id}`,status:'USER_CONFIRMED',note:'合成驗證：513 kWh、SOH 1、電池吸收效率 96%、SST 98%、DD 97.4%；SOC 分段功率與能量映射均為測試假設，非 CATL 或設備商實測曲線。'}];
 return p;
}

/** Hourly absolute energy must survive a per-slot SOH override unchanged. */
export function hourlySohVerificationProject(requestedKWh=300):Project {
 const p=socVerificationProject('linear_taper');p.horizonDays=1;p.services=p.services.filter(r=>r.day===0);
 p.detailed!.service.useHourlyTruckDemand=true;p.detailed!.service.swapArrivals=[];
 const slot=p.detailed!.service.truckSlotOverrides[0].slot;slot.battery.soh=.8;slot.chargeBands=null;
 const row=p.services.find(r=>r.station==='A'&&r.hour===0)!;row.swapCount=1;row.swapKWh=requestedKWh;
 return p;
}
