import type { Project, Equipment } from '../contracts/index.ts';
import type { DetailedConfig, NodePhysics, Passenger } from './contracts.ts';
import { defaultPhysicalConfig as physical } from '../physical-models/schema.ts';
import { defaultExtendedFinance } from '../extended-finance/contracts.ts';
import { defaultTopologyOptions } from '../detailed-network/topology.ts';

export function defaultNodePhysics(nodeId:string):NodePhysics {
 return {nodeId,temperatureC:null,ambientC:null,cable:physical('cable'),thermal:physical('thermal'),curve:physical('converter'),transformer:physical('transformer'),compensation:physical('compensation'),loadPowerFactor:null,protection:physical('protection'),faultSchedule:[],currentLimitA:null,rampKWPerMinute:null};
}
export function defaultPassenger(station:'A'|'B'):Passenger {
 return {station,enabled:false,slots:14,swapSeconds:99,bays:null,capacityKWh:null,soh:null,initialSOC:null,readySOC:null,returnSOC:null,batteryChargeKW:null,batteryEfficiency:null,chargerEfficiency:null,dcVoltageV:null,auxIdleKW:null,auxActiveKW:null,slotOverrides:[],arrivals:[]};
}
export function defaultDetailedConfig(p:Project):DetailedConfig {
 const physics=p.topology.nodes.filter(n=>['sst','pcs','charger','transformer','mv-cable','dc-cable','mv-switch','dc-switch','compensation'].includes(n.type)).map(n=>{
  const model=defaultNodePhysics(n.id);
  if(n.type.endsWith('cable')){model.cable.domain=n.type==='mv-cable'?'AC3':'DC';model.cable.lengthM=n.params.length??null;model.cable.sendingVoltageV=n.type==='mv-cable'?10000:800;}
  return model;
 });
 const c=p.engineering;
 return {version:1,topology:defaultTopologyOptions(),physics,
  storage:(['A','B'] as const).flatMap(station=>(['ESS','UPS'] as const).map(kind=>({id:`${station}-${kind.toLowerCase()}`,station,kind,connectionNodeId:kind==='ESS'?`${station}-feed-pcs`:`${station}-lv`,config:physical('storage'),initialSOC:null,initialSOH:null,policy:{...physical('storagePolicy'),mode:kind==='UPS'?'RESERVE':'SELF_CONSUMPTION'}}))),
  solar:(['A','B'] as const).map(station=>({id:`${station}-pv`,station,connectionNodeId:`${station}-feed-pcs`,config:physical('pv'),export:{enabled:false,gridSourceId:`${station}-grid`,connectionNodeId:`${station}-feed-pcs`,converterKW:null,efficiency:null,unitPrice:null},profile:[{atMinute:0,irradianceWm2:null,cellTemperatureC:null}]})),
  backup:(['A','B'] as const).map(station=>({id:`${station}-ats`,station,normalNodeId:`${station}-lv`,backupNodeId:`${station}-ups-out`,loadNodeIds:[`${station}-swap-bay`,`${station}-sst-aux`],config:physical('ats'),inverterKW:null,inverterEfficiency:null})),
  loads:(['A','B'] as const).flatMap(s=>[
   {nodeId:`${s}-passenger`,idleKW:(c?.passengerChargerKW??500)+(c?.passengerAuxKW??50),perActiveJobKW:0,hourlyKW:Array(24).fill(((c?.passengerChargerKW??500)+(c?.passengerAuxKW??50))*(c?.passengerLoadFactor??.5)),perEnabledSST:false},
   {nodeId:`${s}-swap-bay`,idleKW:p.station[s].auxiliaryKW*(c?.truckAuxLoadFactor??.5),perActiveJobKW:0,hourlyKW:null,perEnabledSST:false},
   {nodeId:`${s}-sst-aux`,idleKW:10,perActiveJobKW:0,hourlyKW:null,perEnabledSST:true},
  ]),
  service:{useHourlyTruckDemand:true,truckSlotOverrides:[],passenger:[defaultPassenger('A'),defaultPassenger('B')],profiles:[],swapArrivals:[],chargeArrivals:[]},
  dispatch:{priority:'BATTERY_FIRST',sourcePolicy:'LOWEST_PRICE',chargeBelow:.7,reserveReadyPacks:2,forecastMinutes:60,gridLimits:[],communicationOutages:[],fallback:'IMMEDIATE'},construction:[],
  finance:defaultExtendedFinance(p.topology.nodes),
  assumptions:[
   {id:'DD-MATRIX',status:'ASSUMPTION',note:'按原圖 PCS 倉1–2、SST 倉3–8；2/6台DD共用組。預設回充與外槍互斥；可改同時共享，矩陣需設備方確認。'},
   {id:'RATING-BOUNDARY',status:'SOURCE_TRANSCRIBED',note:'原圖PCS1600kW；560kW/DD與480kW/槍採輸出額定。之後2000kW方案可在設備參數修改。'},
   {id:'MODEL-BOUNDARY',status:'ASSUMPTION',note:'能量級準靜態模型；分支電壓/無功、定時保護與切換事件依明定參數計算，不作現場短路保護或暫態穩定認證。'},
  ]};
}
export function syncCostInventory(config:DetailedConfig,nodes:Equipment[]):DetailedConfig {
 const next=structuredClone(config),known=new Set(next.finance.assets.flatMap(a=>a.equipmentId?[a.equipmentId]:[]));
 next.finance.assets.push(...defaultExtendedFinance(nodes.filter(n=>!known.has(n.id))).assets);
 const pools=new Set(next.finance.inventory.pools.map(x=>x.poolId));for(const poolId of ['A-truck','B-truck',...next.storage.filter(s=>s.config.enabled).map(s=>s.id),...next.service.passenger.filter(s=>s.enabled).map(s=>`${s.station}-passenger`)])if(!pools.has(poolId))next.finance.inventory.pools.push({poolId,openingValue:null,additionalConversionCost:null});
 return next;
}
