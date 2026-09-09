/** Real Project inputs for simulateDetailed, constructed independently of its
 * scheduler/allocator. Browser-safe module for packages/detailed-verification/index.ts. No Node APIs. */
import type {Project,StationId} from '../contracts/index.ts';
import {engineeringProject} from '../engineering/index.ts';
import {defaultDetailedConfig,defaultPassenger} from '../detailed-model/defaults.ts';
import {detailedReadiness} from '../detailed-model/readiness.ts';
import {makeNode} from '../../plugins/equipment/index.ts';
import {defaultExtendedFinance} from '../extended-finance/index.ts';
import {defaultPhysicalConfig} from '../physical-models/schema.ts';
import {detailedTopology} from '../detailed-model/topology.ts';

const node=(p:Project,type:string,id:string,station:StationId,params:Record<string,number>={})=>p.topology.nodes.push(makeNode(type,id,station,0,0,params));
const edge=(p:Project,source:string,target:string)=>p.topology.edges.push({id:`${source}>${target}`,source,target,enabled:true});
function base(days:number,id:string):Project{
 const p=engineeringProject();p.name=id;p.mode='CONSTRAINED';p.strategy='IMMEDIATE';p.horizonDays=days;p.equipmentSchedule=[];
 p.services=Array.from({length:days},(_,day)=>p.services.filter(r=>r.day===0).map(r=>({...r,day,swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0,gridPrice:1,swapFee:0,chargeFee:0,swapTotalRaw:1,chargeTotalRaw:1}))).flat();
 for(const s of ['A','B'] as const)p.station[s]={batteries:1,capacityKWh:100,readySOC:1,returnSOC:.4,bays:1,swapMinutes:7.5,guns:2,gunKW:200,chargePoolKW:1000,batteryChargeKW:60,auxiliaryKW:0};
 p.engineering!.pcsSlotsPerSite=0;p.efficiency={mode:'ASSEMBLY',sst:1,transformer:1,pcs:1,charger:1,sstSource:1,pcsSource:1};
 p.topology={nodes:[],edges:[]};p.detailed=defaultDetailedConfig(p);const c=p.detailed;
 c.physics=[];c.loads=[];c.storage=[];c.solar=[];c.backup=[];c.topology={sharedDD:false,sharingMode:'SIMULTANEOUS',pcsRatingKW:1600,busTies:[]};
 c.service={useHourlyTruckDemand:false,truckSlotOverrides:[],passenger:[],profiles:[],swapArrivals:[],chargeArrivals:[]};
 c.dispatch={priority:'BATTERY_FIRST',sourcePolicy:'SOURCE_ORDER',chargeBelow:.7,reserveReadyPacks:0,forecastMinutes:0,gridLimits:[],communicationOutages:[],fallback:'IMMEDIATE'};
 c.finance=defaultExtendedFinance([]);
 c.assumptions=[{id,status:'USER_CONFIRMED',note:'受控合成驗證；非設備商數據或真實電价。所有未啟用物理模組為明示理想假設。'}];
 return p;
}
function gun(p:Project,id:string,station:StationId,kw:number,parent:string){node(p,'gun',id,station,{kw,amps:1000,voltage:1000,vehicleVoltage:800});edge(p,parent,id);}
function job(p:Project,id:string,station:StationId,atMinute:number,energyKWh:number,allowedGunIds:string[]){p.detailed!.service.chargeArrivals.push({id,station,atMinute,unitPrice:1,gunsRequired:1,energyKWh,profileId:null,initialSOC:null,targetSOC:null,temperatureC:null,temperatureSchedule:[],allowedGunIds});}
function finalize(p:Project){p.detailed!.finance=defaultExtendedFinance(p.topology.nodes);const issues=detailedReadiness(p);if(issues.length)throw Error(JSON.stringify(issues));return p;}

export function v04Project():Project{
 const p=base(3,'V04_PROJECT_SHARED_DD_TIE_3D');p.efficiency.sst=.98;p.efficiency.charger=.95;
 node(p,'grid','A-grid','A',{kva:1000,pf:1});node(p,'sst','A-sst','A',{kw:200});node(p,'bus','A-bus-sst','A',{voltage:800,amps:1000});
 node(p,'charger','A-dd','A',{kw:100});node(p,'rack','A-rack-0','A',{kw:60});
 node(p,'dc-switch','A-bus-coupler','A',{kw:200});node(p,'bus','B-bus-pcs','B',{voltage:800,amps:1000});node(p,'charger','B-dd','B',{kw:40});node(p,'rack','B-rack-0','B',{kw:60});
 for(const [a,b]of[['A-grid','A-sst'],['A-sst','A-bus-sst'],['A-bus-sst','A-dd'],['A-dd','A-rack-0'],['A-bus-sst','A-bus-coupler'],['A-bus-coupler','B-bus-pcs'],['B-bus-pcs','B-dd'],['B-dd','B-rack-0']])edge(p,a,b);
 gun(p,'A-external-gun','A',80,'A-dd');gun(p,'B-external-gun','B',40,'B-dd');
 for(let day=0;day<3;day++){
  p.detailed!.service.swapArrivals.push({id:`swap-${day}`,fleetId:'A-truck',atMinute:day*1440,returnSOC:.4,unitPrice:1,returnedPack:null});
  job(p,`a-charge-${day}`,'A',day*1440+7.5,80,['A-external-gun']);job(p,`b-charge-${day}`,'B',day*1440+7.5,40,['B-external-gun']);
 }
 p.equipmentSchedule=[{atMinute:1440,equipmentId:'A-bus-coupler',enabled:false},{atMinute:1507.5,equipmentId:'A-bus-coupler',enabled:true}];
 return finalize(p);
}

export function v06Project():Project{
 const p=base(5,'V06_PROJECT_PASSENGER_TARIFF_5D');
 for(const s of ['A','B'] as const){
  node(p,'grid',`${s}-grid`,s,{kva:1000,pf:1});node(p,'transformer',`${s}-transformer`,s,{kva:1000,pf:1});node(p,'lv-bus',`${s}-lv`,s,{kw:1000});node(p,'acdc',`${s}-acdc`,s,{kw:1000,eta:1});node(p,'charger',`${s}-dd`,s,{kw:1000});node(p,'bus',`${s}-bus`,s,{voltage:800,amps:2000});node(p,'rack',`${s}-rack-0`,s,{kw:60});
  for(const [a,b]of[[`${s}-grid`,`${s}-transformer`],[`${s}-transformer`,`${s}-lv`],[`${s}-lv`,`${s}-acdc`],[`${s}-acdc`,`${s}-dd`],[`${s}-dd`,`${s}-bus`],[`${s}-bus`,`${s}-rack-0`]])edge(p,a,b);
 }
 node(p,'ac-load','A-passenger-aux','A',{kw:0});edge(p,'A-lv','A-passenger-aux');
 const passenger=defaultPassenger('A');Object.assign(passenger,{enabled:true,slots:14,swapSeconds:450,bays:1,capacityKWh:100,soh:1,initialSOC:1,readySOC:1,returnSOC:0,batteryChargeKW:50,batteryEfficiency:1,chargerEfficiency:1,dcVoltageV:800,auxIdleKW:0,auxActiveKW:0});
 for(let i=0;i<14;i++){node(p,'passenger-rack',`A-passenger-rack-${i}`,'A',{kw:50,voltage:800});edge(p,'A-bus',`A-passenger-rack-${i}`);}
 p.detailed!.service.passenger=[passenger];
 for(const [id,s,kw]of[['A-100','A',100],['A-200','A',200],['B-80','B',80],['B-40','B',40]] as const)gun(p,id,s,kw,`${s}-bus`);
 for(let day=0;day<5;day++){
  passenger.arrivals.push({id:`passenger-${day}`,atMinute:day*1440+540,count:1,returnSOC:0,unitPrice:1});
  for(const [id,s,t,e]of[['A-100','A',15,25],['A-200','A',30,50],['B-80','B',15,20],['B-40','B',30,10]] as const)job(p,`${day}-${id}`,s,day*1440+t,e,[id]);
 }
 for(const r of p.services){r.gridPrice=r.station==='A'?.5:.8;r.swapTotalRaw=r.chargeTotalRaw=1;}
 finalize(p);const f=p.detailed!.finance;Object.assign(f.calendar,{startDate:'2026-01-30',utcOffsetMinutes:480,partialMonthPolicy:'PRORATE_OBSERVED'});
 for(const m of f.meters)Object.assign(m,{basicMode:m.sourceId==='A-grid'?'CAPACITY_KVA':'MAX_15MIN_KW',capacityKVA:1000,basicRatePerMonth:m.sourceId==='A-grid'?2:3,excessDemandRatePerKWMonth:0,pfMethod:'NONE'});
 return p;
}

export function v05Project():Project{
 const p=base(4,'V05_PROJECT_PV_ESS_UPS_4D');
 node(p,'grid','A-grid','A',{kva:1000,pf:1});node(p,'transformer','A-transformer','A',{kva:1000,pf:1});node(p,'lv-bus','A-lv','A',{kw:1000});node(p,'lv-bus','A-normal','A',{kw:1000});node(p,'ac-load','A-backup-load','A',{kw:8});
 edge(p,'A-grid','A-transformer');edge(p,'A-transformer','A-lv');edge(p,'A-lv','A-normal');edge(p,'A-normal','A-backup-load');
 node(p,'bus','A-pv-bus','A',{voltage:800,amps:1000});node(p,'charger','A-pv-dd','A',{kw:100});node(p,'rack','A-pv-load','A',{kw:40});edge(p,'A-pv-bus','A-pv-dd');edge(p,'A-pv-dd','A-pv-load');
 for(const s of ['A','B'] as const){node(p,'rack',`${s}-rack-0`,s,{kw:60});edge(p,'A-pv-dd',`${s}-rack-0`);}
 const essConfig={...defaultPhysicalConfig('storage'),enabled:true,capacityKWh:100,minSOC:.1,maxSOC:1,chargeKW:50,dischargeKW:36,chargeEfficiency:.9,dischargeEfficiency:.8,selfDischargePerHour:0,calendarFadePerDay:0,cycleFadePerEquivalentCycle:0};
 p.detailed!.storage=[{id:'A-ess',station:'A',kind:'ESS',connectionNodeId:'A-pv-bus',config:essConfig,initialSOC:.5,initialSOH:1,policy:{mode:'SELF_CONSUMPTION',chargeBelow:null,dischargeAbove:null,reserveSOC:.1,manualKW:null}},{id:'A-ups',station:'A',kind:'UPS',connectionNodeId:'A-lv',config:{...essConfig,capacityKWh:20,minSOC:.5,chargeKW:12.5,dischargeKW:8,chargeEfficiency:.8},initialSOC:1,initialSOH:1,policy:{mode:'TOU',chargeBelow:.1,dischargeAbove:2,reserveSOC:.5,manualKW:null}}];
 p.detailed!.solar=[{id:'A-pv',station:'A',connectionNodeId:'A-pv-bus',config:{enabled:true,stcKW:120,referenceIrradianceWm2:1000,referenceCellC:25,temperatureCoefficientPerC:0,dcDerating:1,mpptEfficiency:.9,mpptOutputKW:108,exportLimitKW:0},profile:[]}];
 p.detailed!.backup=[{id:'A-ats',station:'A',loadNodeIds:['A-backup-load'],normalNodeId:'A-normal',backupNodeId:'A-ups-out',config:{enabled:true,preferred:'normal',failDelayHours:0,transferDeadHours:0,returnDelayHours:0,automaticReturn:true},inverterKW:8,inverterEfficiency:1}];
 const main=Array(96).fill(0),ups=Array(96).fill(0);
 for(let day=0;day<4;day++){
  for(const [t,g]of[[0,0],[720,1000],[780,0]])p.detailed!.solar[0].profile.push({atMinute:day*1440+t,irradianceWm2:g,cellTemperatureC:25});
  main[day*24+12]=40;main[day*24+18]=36;ups[day*24+18]=8;if(day===2)ups[day*24+19]=8;
  p.equipmentSchedule.push({atMinute:day*1440+1080,equipmentId:'A-normal',enabled:false},{atMinute:day*1440+(day===2?1200:1140),equipmentId:'A-normal',enabled:true});
 }
 p.detailed!.loads=[{nodeId:'A-pv-load',idleKW:0,perActiveJobKW:0,hourlyKW:main,perEnabledSST:false},{nodeId:'A-backup-load',idleKW:0,perActiveJobKW:0,hourlyKW:ups,perEnabledSST:false}];
 for(const r of p.services)r.gridPrice=r.hour===21?0:r.hour===18||r.hour===19?3:1;
 p.topology=detailedTopology(p,p.topology);
 return finalize(p);
}

export function detailedVerificationProjects(){return [{id:'V04_PROJECT_SHARED_DD_TIE_3D',project:v04Project()},{id:'V05_PROJECT_PV_ESS_UPS_4D',project:v05Project()},{id:'V06_PROJECT_PASSENGER_TARIFF_5D',project:v06Project()}];}

/** One-hour independent export golden: local load40; MPPT90%; export AC48
 * through80% inverter. Raw PV used=(40+48/.8)/.9=111.111...kWh.
 * Grid remains connected but may never feed the PV-only export transaction. */
export function pvExportGoldenProject():Project{
 const p=base(1,'GOLDEN_PV_EXPORT_1D');
 node(p,'grid','A-grid','A',{kva:1000,pf:1});node(p,'sst','A-sst','A',{kw:1000});node(p,'bus','A-pv-bus','A',{voltage:800,amps:2000});node(p,'charger','A-pv-dd','A',{kw:1000});node(p,'rack','A-local-load','A',{kw:40});
 for(const [a,b]of[['A-grid','A-sst'],['A-sst','A-pv-bus'],['A-pv-bus','A-pv-dd'],['A-pv-dd','A-local-load']])edge(p,a,b);
 for(const s of ['A','B'] as const){node(p,'rack',`${s}-rack-0`,s,{kw:60});edge(p,'A-pv-dd',`${s}-rack-0`);}
 p.detailed!.loads=[{nodeId:'A-local-load',idleKW:0,perActiveJobKW:0,hourlyKW:Array.from({length:24},(_,hour)=>hour===12?40:0),perEnabledSST:false}];
 p.detailed!.solar=[{id:'A-pv',station:'A',connectionNodeId:'A-pv-bus',config:{enabled:true,stcKW:120,referenceIrradianceWm2:1000,referenceCellC:25,temperatureCoefficientPerC:0,dcDerating:1,mpptEfficiency:.9,mpptOutputKW:108,exportLimitKW:48},profile:[{atMinute:0,irradianceWm2:0,cellTemperatureC:25},{atMinute:720,irradianceWm2:1000,cellTemperatureC:25},{atMinute:780,irradianceWm2:0,cellTemperatureC:25}],export:{enabled:true,gridSourceId:'A-grid',connectionNodeId:'A-pv-bus',converterKW:50,efficiency:.8,unitPrice:.25}}];
 p.topology=detailedTopology(p,p.topology);return finalize(p);
}
