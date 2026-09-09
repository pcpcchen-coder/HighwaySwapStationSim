import type {Project,RunResult,HourResult,ComponentEnergy,EdgeEnergy,SourceMeter,StationId,Equipment} from '../contracts/index.ts';
import type {DetailedResult,StorageLedger} from './contracts.ts';
import {parseProject} from '../schemas/index.ts';
import {detailedReadiness} from './readiness.ts';
import {compileFleet} from './services.ts';
import {ServiceFleet,type PowerRequest,type ServiceEvent} from '../service-fleet/index.ts';
import {allocateDetailedPower,sourceTypes} from '../detailed-network/index.ts';
import {physicsPolicy,type PolicyState} from './policy.ts';
import {createBatteryTrace,recordBatteryTrace} from '../battery-trace/index.ts';
import {energyAtSOC} from '../service-fleet/battery-energy.ts';
import {createPowerTrace,recordPowerTrace} from '../power-trace/index.ts';
import {validateTopology} from '../topology-engine/index.ts';
import {invoiceCents,apportionCents,sumMoney} from '../money/index.ts';
import {pvAvailable,storageDispatch,storageBoundaryHours,storageStep,thermalStep,protectionStep,atsAt,type StorageState,type ProtectionState,type AtsState} from '../physical-models/index.ts';
import {weightedInventory} from '../extended-finance/index.ts';
const EPS=1e-8,stations=['A','B'] as const;
interface Request {id:string;sink:string;kw:number;station:StationId;kind:'aux'|'battery'|'gun'|'store'|'standby'|'export';pool?:string;service?:PowerRequest;absorbedAsLoss?:boolean;}
type Flow={input:number;output:number;loss:number;terminal:number};
function reachable(p:Project,start:string,target:string){const seen=new Set<string>();function visit(id:string):boolean{if(!p.topology.nodes.find(n=>n.id===id)?.enabled)return false;if(id===target)return true;if(seen.has(id))return false;seen.add(id);return p.topology.edges.filter(e=>e.enabled&&e.source===id).some(e=>visit(e.target));}return visit(start);}
function hasSupply(p:Project,target:string,caps:Map<string,number>){return p.topology.nodes.some(n=>sourceTypes.has(n.type)&&n.enabled&&(caps.get(n.id)??n.params.kw??n.params.kva??0)>EPS&&reachable(p,n.id,target));}

/** Detailed, deterministic energy-level event simulation. The legacy branch is
 * preserved for historical snapshots and independent regression fixtures. */
export function simulateDetailed(input:Project):RunResult{
 const p=parseProject(input),c=p.detailed!,snapshot=structuredClone(input),horizon=p.horizonDays*1440;
 const errors=detailedReadiness(p);if(errors.length)throw Error(errors.slice(0,20).map(i=>`${i.path}: ${i.message}`).join('\n'));
 if(!p.engineering||p.efficiency.mode!=='ASSEMBLY')throw Error('完整模型須有工程配置並採設備組裝效率');
 const topologyErrors=validateTopology(p.topology).filter(d=>d.severity==='error');if(topologyErrors.length)throw Error(topologyErrors.map(d=>d.message).join('\n'));
 const physics=c.physics.filter(m=>p.topology.nodes.some(n=>n.id===m.nodeId));
 const fleetConfig=compileFleet(p),fleet=new ServiceFleet(fleetConfig,invoiceCents),eta=new Map(Object.entries(fleet.slotEtaMap()));
 const trace=createPowerTrace(p),hourCount=p.horizonDays*24;
 const hours:HourResult[]=Array.from({length:hourCount},(_,h)=>stations.map(station=>({day:Math.floor(h/24),hour:h%24,station,requestedKWh:0,deliveredKWh:0,swapCount:0,chargeCount:0,gridKWh:0,lossKWh:0,auxiliaryKWh:0,revenue:0,gridCost:0,auxiliaryGridCost:0,ready:0,queue:0,storedKWh:0,balanceResidual:0,peakKW:0}))).flat();
 const hi=(t:number)=>Math.max(0,Math.min(hourCount-1,Math.floor((t+1e-9)/60))),hour=(s:StationId,t:number)=>hours[hi(t)*2+(s==='A'?0:1)];
 const rows=new Map(p.services.map(r=>[`${r.station}:${r.day*24+r.hour}`,r])),price=(s:StationId,t:number)=>rows.get(`${s}:${hi(t)}`)!.gridPrice;
 const initial={A:fleet.stationState('A').storedKWh,B:fleet.stationState('B').storedKWh};
 const detail:DetailedResult={batteryTrace:createBatteryTrace(horizon),fleet:fleet.snapshot(),serviceEvents:[],storage:[],electrical:[],pv:[],switching:[],inventory:[],exports:[],energy:{pvKWh:0,exportKWh:0,storageInitialKWh:0,storageFinalKWh:0,storageLossKWh:0,auxiliaryKWh:0,networkLossKWh:0,balanceResidualKWh:0}};
 const storeStates=new Map<string,StorageState>(),initialStores=new Map<string,number>();
 for(const s of c.storage)if(s.config.enabled){const state={energyKWh:s.config.capacityKWh!*s.initialSOH!*s.initialSOC!,soh:s.initialSOH!,equivalentCycles:0};storeStates.set(s.id,state);initialStores.set(s.id,state.energyKWh);detail.energy.storageInitialKWh+=state.energyKWh;}
 const temperatures=new Map(c.physics.map(m=>[m.nodeId,m.temperatureC??(m.transformer.enabled?m.transformer.windingTemperatureC:m.cable.conductorTemperatureC)??25]));
 const protections=new Map<string,ProtectionState>(c.physics.filter(m=>m.protection.enabled).map(m=>[m.nodeId,{closed:true,overloadHours:0,faultHours:0,healthyHours:0,trippedReason:null}]));
 const atsStates=new Map<string,AtsState>(c.backup.map(b=>[b.id,{selected:b.config.preferred,pending:null,healthySinceHours:null,unavailableSinceHours:null,deadUntilHours:null}]));
 const components=new Map<string,ComponentEnergy>(),edges=new Map<string,EdgeEnergy>(),meters=new Map<string,SourceMeter>();
 const costWeights=new Map<string,Map<string,number>>(),poolCosts=new Map<string,number>(),poolSourceEnergy=new Map<string,Map<string,number>>();
 const exportMeters=new Map<string,NonNullable<DetailedResult['exports']>[number]>(),exportEnergy=new Map<HourResult,number>();
 const sourceAssigned=new Map<HourResult,number>(),storeCharge=new Map<HourResult,number>(),passiveLoss=new Map<HourResult,number>();
 const schedule=[...p.equipmentSchedule.map(e=>({...e,params:{}})),...c.construction].sort((a,b)=>a.atMinute-b.atMinute);let cursor=0,t=0,previous=0,steps=0;
 const lastOutput=new Map<string,number>(),runningSST=new Set<string>(),overheat=new Set<string>(c.physics.filter(m=>m.thermal.enabled&&temperatures.get(m.nodeId)!>=m.thermal.maximumConductorC!).map(m=>m.nodeId));
 const diagnostics:RunResult['diagnostics']=[{code:'DETAILED_ENERGY_MODEL',severity:'warning',message:'完整能量級模型：分支電壓與定時保護按使用者參數；不等同現場暫態／短路保護認證。'}];
 const slots=fleetConfig.swaps.filter(f=>f.enabled).flatMap(f=>f.slots);
 if(slots.some(s=>!s.chargeBands))diagnostics.push({code:'BATTERY_FIXED_POWER_ASSUMPTION',severity:'warning',message:'部分電池艙未提供 SOC 分段充電曲線，採額定固定功率並受供電限制；請填入 BMS／實測曲線以評估高 SOC 回充時間。'});
 if(slots.some(s=>!s.battery.energySOC))diagnostics.push({code:'BATTERY_LINEAR_SOC_ASSUMPTION',severity:'warning',message:'部分電池未提供能量–SOC 對應曲線，採容量 × SOH × SOC 線性換算。'});
 if(slots.some(s=>s.chargeEfficiency===1))diagnostics.push({code:'BATTERY_UNITY_EFFICIENCY_ASSUMPTION',severity:'warning',message:'部分電池艙內部充電效率設定為 100%；此值不含上游充電機效率，請確認實測值。'});
 if(c.topology.sharedDD)diagnostics.push({code:'SHARING_MATRIX_ASSUMPTION',severity:'warning',message:`DD 2/6台共用矩陣採 ${c.topology.sharingMode}；請用設備規格確認可達端口。`});
 function consumeEvents(events:ServiceEvent[]){for(const e of events){const h=hour(e.station,e.atMinute);h.deliveredKWh+=e.deliveredKWh;h.revenue+=e.revenueDelta;if(e.kind==='swap-complete')h.swapCount++;if(e.kind==='charge-complete')h.chargeCount++;}}
 consumeEvents(fleet.activate(0));
 while(t<horizon-EPS){
  if(++steps>1000000)throw Error('DETAILED_STEP_LIMIT');
  let changed=false;while(cursor<schedule.length&&schedule[cursor].atMinute<=t+EPS){const e=schedule[cursor++],n=p.topology.nodes.find(n=>n.id===e.equipmentId);if(!n)throw Error(`施工事件未知設備:${e.equipmentId}`);n.enabled=e.enabled;n.params={...n.params,...e.params};changed=true;detail.switching.push({atMinute:t,id:n.id,state:n.enabled?'on':'off',reason:'scheduled'});}
  if(changed){const bad=validateTopology(p.topology).filter(d=>d.severity==='error');if(bad.length)throw Error(`SCHEDULE_TOPOLOGY:${bad.map(d=>d.message).join(';')}`);}
  const caps=new Map<string,number>(),sourcePrices=new Map<string,number>();
  for(const n of p.topology.nodes.filter(n=>n.type==='grid'))sourcePrices.set(n.id,price(n.station,t));
  for(const g of c.dispatch.gridLimits)caps.set(g.sourceId,g.kw!);
  const solarNow=new Map<string,ReturnType<typeof pvAvailable>>();
  for(const solar of c.solar)if(solar.config.enabled){const row=solar.profile.filter(r=>r.atMinute<=t+EPS).at(-1)!;const value=pvAvailable(solar.config,row.irradianceWm2,row.cellTemperatureC);solarNow.set(solar.id,value);caps.set(`${solar.id}-source`,value.availableDcKW);sourcePrices.set(`${solar.id}-source`,-1);}
  for(const s of c.storage)if(s.config.enabled){const state=storeStates.get(s.id)!;caps.set(`${s.id}-source`,state.energyKWh>s.config.capacityKWh!*state.soh*Math.max(s.config.minSOC!,s.policy.reserveSOC!)+EPS?s.config.dischargeKW!/s.config.dischargeEfficiency!:0);sourcePrices.set(`${s.id}-source`,0);}
  let network:Project={...p,topology:{nodes:p.topology.nodes.map(n=>({...n,enabled:n.enabled&&(protections.get(n.id)?.closed??true)&&!overheat.has(n.id)})),edges:p.topology.edges.map(e=>({...e}))}};
  let controlNext=Infinity;
  for(const b of c.backup)if(b.config.enabled){
   const normal=hasSupply(network,b.normalNodeId,caps),backup=hasSupply(network,b.backupNodeId,caps);let resolved=atsAt(b.config,atsStates.get(b.id)!,t/60,normal,backup);
   for(let i=0;i<4&&resolved.nextEventHour*60<=t+EPS;i++)resolved=atsAt(b.config,resolved.state,t/60,normal,backup);
   const before=atsStates.get(b.id)!;if(before.selected!==resolved.state.selected)detail.switching.push({atMinute:t,id:b.id,state:resolved.state.selected??'open',reason:'ATS'});atsStates.set(b.id,resolved.state);controlNext=Math.min(controlNext,resolved.nextEventHour*60);
   const backupInput=network.topology.nodes.some(n=>n.id===`${b.id}-inverter`)?`${b.id}-inverter`:b.backupNodeId;
   for(const e of network.topology.edges.filter(e=>e.target===b.id))e.enabled&&=resolved.state.selected==='normal'?e.source===b.normalNodeId:resolved.state.selected==='backup'?e.source===backupInput:false;
  }
  const aux:Request[]=c.loads.filter(l=>!c.service.passenger.some(pc=>pc.enabled&&l.nodeId===`${pc.station}-passenger`)).map(l=>{const n=p.topology.nodes.find(n=>n.id===l.nodeId)!,state=fleet.stationState(n.station),value=l.hourlyKW?l.hourlyKW[l.hourlyKW.length===24?hi(t)%24:hi(t)]!:l.idleKW!+l.perActiveJobKW!*state.activeSwaps;
   return{id:`aux:${l.nodeId}`,sink:l.nodeId,kw:value*(l.perEnabledSST?p.topology.nodes.filter(x=>x.station===n.station&&x.type==='sst'&&x.enabled).length:1),station:n.station,kind:'aux'};});
  for(const pc of c.service.passenger)if(pc.enabled)aux.push({id:`aux:${pc.station}-passenger-aux`,sink:`${pc.station}-passenger-aux`,station:pc.station,kind:'aux',kw:pc.auxIdleKW!+pc.auxActiveKW!*fleet.activeFleetSwaps(`${pc.station}-passenger`)});
  const fleetRequests=fleet.powerRequests();
  for(const s of c.storage)if(s.config.enabled){const state=storeStates.get(s.id)!;
   const connected= [...aux,...fleetRequests].filter(r=>reachable(network,s.connectionNodeId,r.sink)||c.backup.some(b=>b.config.enabled&&b.backupNodeId===`${s.id}-out`&&b.loadNodeIds.includes(r.sink)));
   const load=connected.reduce((v,r)=>v+r.kw,0),pv=[...solarNow].filter(([id])=>reachable(network,`${id}-mppt`,s.connectionNodeId)).reduce((v,[,a])=>v+a.availableBusKW,0);
   const grid=p.topology.nodes.some(n=>n.type==='grid'&&n.enabled&&reachable(network,n.id,s.connectionNodeId));
   let command=storageDispatch(s.config,state,s.policy,price(s.station,t),load-pv,grid);
   if(s.kind==='UPS'&&s.policy.mode==='RESERVE'&&grid&&state.energyKWh<s.config.capacityKWh!*state.soh*s.config.maxSOC!-EPS)command=s.config.chargeKW!;
   caps.set(`${s.id}-source`,command<0?-command/s.config.dischargeEfficiency!:0);
   if(command>0)aux.push({id:`store:${s.id}`,sink:`${s.id}-sink`,kw:command*s.config.chargeEfficiency!,station:s.station,kind:'store',pool:s.id});
  }
  const dynamicVoltages=new Map(fleet.powerRequests().filter(r=>r.voltageV!==undefined).map(r=>[r.sink,r.voltageV!]));
  const policyState:PolicyState={caps,temperatures,slotEta:eta,sourcePrices,lastOutput,minutesSinceLast:Math.max(0,t-previous),dynamicVoltages};
  let policy=physicsPolicy(network,policyState);
  // Standby energy is requested once at the device's input and booked as loss.
  const standby:Request[]=network.topology.nodes.filter(n=>n.enabled&&!sourceTypes.has(n.type)).flatMap(n=>{const kw=policy.standby(n);return kw>EPS?[{id:`standby:${n.id}`,sink:n.id,kw,station:n.station,kind:'standby' as const,absorbedAsLoss:true}]:[];});
  const supportRequests=[...aux.filter(r=>r.kind==='aux'),...standby];
  const supportNetwork={...network,topology:{...network.topology,nodes:network.topology.nodes.map(n=>n.type==='sst'&&!runningSST.has(n.id)?{...n,enabled:false}:n)}};
  const support=allocateDetailedPower(supportNetwork,supportRequests,physicsPolicy(supportNetwork,policyState)),blocked=new Set<string>(),paused:string[]=[];
  const shortfall=new Set<string>();supportRequests.forEach((r,i)=>{if(support[i].delivered+1e-6<r.kw){shortfall.add(r.sink);if(r.sink.endsWith('sst-aux'))for(const n of network.topology.nodes.filter(n=>n.type==='sst'&&n.station===r.station))blocked.add(n.id);if(r.sink.endsWith('swap-bay'))paused.push(`${r.station}-truck`);if(r.sink.endsWith('passenger-aux'))paused.push(`${r.station}-passenger`);if(r.kind==='standby'&&network.topology.nodes.find(n=>n.id===r.sink)?.type!=='sst')blocked.add(r.sink);}});
  for(const n of network.topology.nodes)if(n.type==='sst'){if(blocked.has(n.id)||!n.enabled)runningSST.delete(n.id);else runningSST.add(n.id);}
  network={...network,topology:{...network.topology,nodes:network.topology.nodes.map(n=>blocked.has(n.id)?{...n,enabled:false}:n)}};
  const disabled=network.topology.nodes.filter(n=>!n.enabled).map(n=>n.id);
  for(const s of stations)if(disabled.includes(`${s}-swap-bay`))paused.push(`${s}-truck`);
  consumeEvents(fleet.activate(t,{disabledSinks:disabled,pausedFleetIds:paused}));
  let flexible=fleet.powerRequests();
  const comms=c.dispatch.communicationOutages.some(e=>e.fromMinute<=t&&t<e.toMinute);
  flexible=flexible.filter(r=>{
   if(comms)return c.dispatch.fallback==='IMMEDIATE';
   if(r.kind!=='battery'||p.strategy==='IMMEDIATE')return true;
   const forecast=fleetConfig.swapArrivals.filter(j=>j.fleetId===r.fleetId&&j.atMinute>=t&&j.atMinute<t+c.dispatch.forecastMinutes!).length;
   return price(r.station,t)<c.dispatch.chargeBelow!||fleet.stationState(r.station).ready<Math.max(c.dispatch.reserveReadyPacks!,forecast);
  });
  if(c.dispatch.priority==='GUN_FIRST')flexible.sort((a,b)=>Number(a.kind==='battery')-Number(b.kind==='battery'));
  if(c.dispatch.priority==='FAIR'&&flexible.length){const offset=Math.floor(t)%flexible.length;flexible=[...flexible.slice(offset),...flexible.slice(0,offset)];}
  if(c.topology.sharingMode==='EXCLUSIVE'){
   const groups=new Map<string,'battery'|'gun'>();
   flexible=flexible.filter(r=>{const group=p.topology.nodes.find(n=>n.type==='sharing-group'&&reachable(network,n.id,r.sink));if(!group)return true;const mode=groups.get(group.id);if(mode&&mode!==r.kind)return false;groups.set(group.id,r.kind);return true;});
  }
  const requests:Request[]=[...supportRequests.filter(r=>!blocked.has(r.sink)),...flexible.map(r=>({id:r.id,sink:r.sink,kw:r.kw*(r.kind==='battery'?(eta.get(r.sink)??1):1),station:r.station,kind:r.kind,pool:r.fleetId,service:r})),...aux.filter(r=>r.kind==='store')];
  for(const solar of c.solar)if(solar.config.enabled&&solar.export?.enabled&&network.topology.nodes.find(n=>n.id===solar.export!.gridSourceId)?.enabled)requests.push({id:`export:${solar.id}`,sink:`${solar.id}-export`,kw:solar.config.exportLimitKW!,station:solar.station,kind:'export'});
  policyState.dynamicVoltages=new Map(fleet.powerRequests().filter(r=>r.voltageV!==undefined).map(r=>[r.sink,r.voltageV!]));
  policy=physicsPolicy(network,policyState);
  const routeAllowed=(path:Equipment[])=>(path.at(-1)?.type!=='grid-export'||path[0].id===path.at(-1)!.id.replace(/-export$/,'-source'))&&!(sourceTypes.has(path[0].type)&&path[0].type!=='grid'&&path[0].type!=='pv-source'&&path.at(-1)?.type==='storage-sink');
  const allocations=allocateDetailedPower(network,requests,{...policy,routeAllowed});
  const accepted:Record<string,number>={};for(let i=0;i<requests.length;i++)if(requests[i].service)accepted[requests[i].id]=allocations[i].delivered/(requests[i].kind==='battery'?(eta.get(requests[i].sink)??1):1);
  const nodeStep=new Map<string,Flow>(),edgeStep=new Map<string,number>();
  for(const a of allocations){for(const f of a.nodeFlows){const v=nodeStep.get(f.nodeId)??{input:0,output:0,loss:0,terminal:0};v.input+=f.inputKW;v.output+=f.outputKW;v.loss+=f.lossKW;v.terminal+=f.terminalKW;nodeStep.set(f.nodeId,v);}for(const e of a.edgeFlows)edgeStep.set(e.edgeId,(edgeStep.get(e.edgeId)??0)+e.kw);}
  let next=fleet.nextEventMinute(accepted,Math.min(horizon,Math.floor(t+EPS)+1,schedule[cursor]?.atMinute??Infinity,controlNext));
  for(const solar of c.solar)if(solar.config.enabled)next=Math.min(next,solar.profile.find(r=>r.atMinute>t+EPS)?.atMinute??Infinity);
  for(const e of c.dispatch.communicationOutages)for(const time of [e.fromMinute,e.toMinute])if(time>t+EPS)next=Math.min(next,time);
  for(const s of c.storage)if(s.config.enabled){const charge=nodeStep.get(`${s.id}-in`)?.input??0,discharge=nodeStep.get(`${s.id}-out`)?.output??0;next=Math.min(next,t+60*storageBoundaryHours(s.config,storeStates.get(s.id)!,charge,discharge));}
  for(const m of physics){for(const event of m.faultSchedule)for(const at of [event.fromMinute,event.toMinute])if(at>t+EPS)next=Math.min(next,at);
   const node=network.topology.nodes.find(n=>n.id===m.nodeId)!;const read=policy.reading(node,nodeStep.get(node.id)?.output??0);
   if(m.protection.enabled){const fault=m.faultSchedule.find(e=>e.fromMinute<=t&&t<e.toMinute)?.currentA??0,probe=protectionStep(m.protection,protections.get(m.nodeId)!,read.currentA,fault,0);if(probe.breakingRatingExceeded)throw Error(`短路電流超出 ${m.nodeId} 分斷額定，無法假定成功切斷`);if(probe.state.closed!==protections.get(m.nodeId)!.closed){protections.set(m.nodeId,probe.state);detail.switching.push({atMinute:t,id:m.nodeId,state:probe.state.closed?'closed':'tripped',reason:probe.state.trippedReason??'reset'});next=t;}else if(probe.nextBoundaryHours>EPS)next=Math.min(next,t+60*probe.nextBoundaryHours);}
   if(m.thermal.enabled){const temp=temperatures.get(m.nodeId)!,loss=nodeStep.get(m.nodeId)?.loss??0,target=m.ambientC!+m.thermal.thermalResistanceCPerKW!*loss,limit=m.thermal.maximumConductorC!;if(target>limit&&temp<limit){const boundary=-m.thermal.thermalResistanceCPerKW!*m.thermal.heatCapacityKWhPerC!*Math.log((limit-target)/(temp-target));if(boundary>EPS)next=Math.min(next,t+60*boundary);}}
  }
  if(next<=t+1e-10){if(++steps>1000000)throw Error('NON_ADVANCING_DETAILED_SCHEDULER');continue;}
  const dt=(next-t)/60,hidx=hi(t),day=Math.floor(hidx/24),hourNumber=hidx%24;
  for(let i=0;i<requests.length;i++){const r=requests[i],a=allocations[i],h=hour(r.station,t);sourceAssigned.set(h,(sourceAssigned.get(h)??0)+a.grid*dt);h.lossKWh+=a.loss*dt;if(r.kind==='aux')h.auxiliaryKWh+=a.delivered*dt;if(r.kind==='store')storeCharge.set(h,(storeCharge.get(h)??0)+a.delivered*dt);if(r.kind==='export'){const solar=c.solar.find(s=>r.id===`export:${s.id}`)!,key=`${hidx}:${solar.id}`,meter=exportMeters.get(key)??{day,hour:hourNumber,id:solar.id,kWh:0,unitPrice:solar.export!.unitPrice!,revenue:0};meter.kWh+=a.delivered*dt;exportMeters.set(key,meter);exportEnergy.set(h,(exportEnergy.get(h)??0)+a.delivered*dt);detail.energy.exportKWh!+=a.delivered*dt;}
   for(const [source,kw]of Object.entries(a.sourceImport)){const sourceNode=p.topology.nodes.find(n=>n.id===source)!;if(sourceNode.type==='grid'){
     h.gridKWh+=kw*dt;const key=`${hidx}:${source}`,meter=meters.get(key)??{day,hour:hourNumber,sourceId:source,importKWh:0,peakKW:0,unitPrice:price(sourceNode.station,t),cost:0};meter.importKWh+=kw*dt;meters.set(key,meter);
     const weights=costWeights.get(key)??new Map<string,number>(),consumer=JSON.stringify([r.station,r.kind==='aux'||r.kind==='standby'?'aux':'traffic',r.pool??'']);weights.set(consumer,(weights.get(consumer)??0)+kw*dt);costWeights.set(key,weights);
    }
    if(r.pool){const sources=poolSourceEnergy.get(r.pool)??new Map<string,number>();sources.set(source,(sources.get(source)??0)+kw*dt);poolSourceEnergy.set(r.pool,sources);}
   }
  }
  for(const s of stations)hour(s,t).peakKW=Math.max(hour(s,t).peakKW,allocations.reduce((sum,a,i)=>sum+(requests[i].station===s?a.grid:0),0));
  const sourcePeak=new Map<string,number>();for(const a of allocations)for(const [source,kw]of Object.entries(a.sourceImport))sourcePeak.set(source,(sourcePeak.get(source)??0)+kw);
  for(const [source,kw]of sourcePeak){const meter=meters.get(`${hidx}:${source}`);if(meter)meter.peakKW=Math.max(meter.peakKW,kw);}
  const demand=new Map<string,number>();for(const r of requests)demand.set(r.sink,(demand.get(r.sink)??0)+r.kw);
  recordPowerTrace(trace,network,t,nodeStep,edgeStep,demand,blocked,shortfall);
  recordBatteryTrace(detail.batteryTrace!,fleet.batteryStates(),t,next,accepted,eta);
  for(const [id,f]of nodeStep){const node=network.topology.nodes.find(n=>n.id===id)!,key=`${hidx}:${id}`,capacity=policy.capacity!(node),record=components.get(key)??{day,hour:hourNumber,nodeId:id,inputKWh:0,outputKWh:0,lossKWh:0,terminalKWh:0,peakOutputKW:0,capacityKW:capacity,maxBalanceResidual:0};
   const incoming=p.topology.edges.filter(e=>e.target===id).reduce((v,e)=>v+(edgeStep.get(e.id)??0),0),outgoing=p.topology.edges.filter(e=>e.source===id).reduce((v,e)=>v+(edgeStep.get(e.id)??0),0);
   const residual=Math.max(Math.abs(f.input-f.output-f.loss),Math.abs(f.output-outgoing-f.terminal),sourceTypes.has(node.type)?0:Math.abs(f.input-incoming));if(residual>1e-6||f.output>capacity+1e-6)throw Error(`DETAILED_COMPONENT_BALANCE:${id}:${residual}`);
   record.inputKWh+=f.input*dt;record.outputKWh+=f.output*dt;record.lossKWh+=f.loss*dt;record.terminalKWh+=f.terminal*dt;record.peakOutputKW=Math.max(record.peakOutputKW,f.output);record.capacityKW=Math.max(record.capacityKW,capacity);record.maxBalanceResidual=Math.max(record.maxBalanceResidual,residual*dt);components.set(key,record);lastOutput.set(id,f.output);
  }
  for(const [id,kw]of edgeStep){const edge=p.topology.edges.find(e=>e.id===id)!,key=`${hidx}:${id}`,record=edges.get(key)??{day,hour:hourNumber,edgeId:id,source:edge.source,target:edge.target,kWh:0,peakKW:0};record.kWh+=kw*dt;record.peakKW=Math.max(record.peakKW,kw);edges.set(key,record);}
  for(const solar of c.solar)if(solar.config.enabled){const available=solarNow.get(solar.id)!.availableDcKW*dt,generated=(sourcePeak.get(`${solar.id}-source`)??0)*dt;detail.pv.push({fromMinute:t,toMinute:next,id:solar.id,availableKWh:available,generatedKWh:generated,curtailedKWh:Math.max(0,available-generated)});detail.energy.pvKWh+=generated;}
  for(const s of c.storage)if(s.config.enabled){const start=storeStates.get(s.id)!,inputKW=nodeStep.get(`${s.id}-in`)?.input??0,outputKW=nodeStep.get(`${s.id}-out`)?.output??0,step=storageStep(s.config,start,inputKW,outputKW,dt);storeStates.set(s.id,step.state);
   detail.storage.push({fromMinute:t,toMinute:next,id:s.id,station:s.station,initialStoredKWh:start.energyKWh,inputKW,outputKW,selfDischargeKWh:step.selfDischargeKWh,capacitySpillKWh:step.capacitySpillKWh,inputKWh:step.inputKWh,outputKWh:step.outputKWh,lossKWh:step.lossKWh,storedKWh:step.state.energyKWh,deltaKWh:step.storageDeltaKWh,soh:step.state.soh,cycles:step.state.equivalentCycles});
   const passive=step.selfDischargeKWh+step.capacitySpillKWh;detail.energy.storageLossKWh+=passive;const h=hour(s.station,t);h.lossKWh+=passive;passiveLoss.set(h,(passiveLoss.get(h)??0)+passive);
  }
  for(const m of physics){const n=network.topology.nodes.find(n=>n.id===m.nodeId)!,f=nodeStep.get(n.id),read=policy.reading(n,f?.output??0);if(m.cable.enabled||m.transformer.enabled||m.compensation.enabled||m.protection.enabled||m.thermal.enabled)detail.electrical.push({fromMinute:t,toMinute:next,nodeId:n.id,currentA:read.currentA,voltageV:read.voltageV,reactiveKvar:read.reactiveKvar,temperatureC:temperatures.get(n.id)??null});
   if(m.thermal.enabled){const updated=thermalStep(m.thermal,temperatures.get(n.id)!,m.ambientC!,f?.loss??0,dt);temperatures.set(n.id,updated.temperatureC);if(updated.temperatureC>=m.thermal.maximumConductorC!-1e-8)overheat.add(n.id);else overheat.delete(n.id);}
   if(m.protection.enabled){const fault=m.faultSchedule.find(e=>e.fromMinute<=t&&t<e.toMinute)?.currentA??0,updated=protectionStep(m.protection,protections.get(n.id)!,read.currentA,fault,dt);if(updated.state.closed!==protections.get(n.id)!.closed)detail.switching.push({atMinute:next,id:n.id,state:updated.state.closed?'closed':'tripped',reason:updated.state.trippedReason??'reset'});protections.set(n.id,updated.state);}
  }
  consumeEvents(fleet.advance(next,accepted));
  if(Math.abs(next/60-Math.round(next/60))<1e-8)for(const s of stations){const state=fleet.stationState(s),h=hour(s,next-1e-6);h.storedKWh=state.storedKWh;h.ready=state.ready;h.queue=state.queue;}
  for(const n of network.topology.nodes)if(!nodeStep.has(n.id))lastOutput.set(n.id,0);
  previous=t;t=next;consumeEvents(fleet.activate(t,{disabledSinks:disabled,pausedFleetIds:paused}));
 }
 recordBatteryTrace(detail.batteryTrace!,fleet.batteryStates(),horizon,horizon,{},eta);
 detail.fleet=fleet.snapshot();detail.serviceEvents=fleet.events();
 for(const s of stations){const state=fleet.stationState(s),h=hour(s,horizon);h.storedKWh=state.storedKWh;h.ready=state.ready;h.queue=state.queue;}
 for(const [key,m]of meters){const cents=invoiceCents(m.importKWh,m.unitPrice);m.cost=cents/100;const weights=[...(costWeights.get(key)??new Map()).entries()].sort((a,b)=>a[0].localeCompare(b[0])),parts=apportionCents(cents,weights.map(e=>e[1]));for(let i=0;i<weights.length;i++){const [station,kind,pool]=JSON.parse(weights[i][0]) as [StationId,string,string],h=hour(station,(m.day*24+m.hour)*60);h.gridCost+=parts[i]/100;if(kind==='aux')h.auxiliaryGridCost+=parts[i]/100;if(pool)poolCosts.set(pool,(poolCosts.get(pool)??0)+parts[i]/100);}}
 for(const meter of exportMeters.values()){meter.revenue=invoiceCents(meter.kWh,meter.unitPrice)/100;hour(c.solar.find(s=>s.id===meter.id)!.station,(meter.day*24+meter.hour)*60).revenue+=meter.revenue;}detail.exports=[...exportMeters.values()];
 for(const s of stations){let before=initial[s];for(const h of hours.filter(h=>h.station===s)){h.revenue=Math.round(h.revenue*100)/100;h.gridCost=Math.round(h.gridCost*100)/100;h.auxiliaryGridCost=Math.round(h.auxiliaryGridCost*100)/100;h.balanceResidual=(sourceAssigned.get(h)??0)-h.lossKWh+(passiveLoss.get(h)??0)-h.auxiliaryKWh-h.deliveredKWh-(h.storedKWh-before)-(storeCharge.get(h)??0)-(exportEnergy.get(h)??0);before=h.storedKWh;if(Math.abs(h.balanceResidual)>1e-6)throw Error(`DETAILED_HOURLY_BALANCE:${s}:${h.day}:${h.hour}:${h.balanceResidual}`);}}
 // Period weighted energy valuation. Storage-to-storage charging is excluded by
 // routeAllowed, so upstream storage values can be determined without cycles.
 const storedUnitCost=new Map<string,number>();
 for(const s of c.storage)if(s.config.enabled){const records=detail.storage.filter(r=>r.id===s.id),opening=initialStores.get(s.id)!,inflow=records.reduce((v,r)=>v+r.inputKWh*s.config.chargeEfficiency!,0),closing=storeStates.get(s.id)!.energyKWh,flow={poolId:s.id,openingKWh:opening,inflowKWh:inflow,inflowPurchaseCost:poolCosts.get(s.id)??0,issuedKWh:Math.max(0,opening+inflow-closing),closingKWh:closing};detail.inventory.push(flow);const setting=c.finance.inventory.pools.find(x=>x.poolId===s.id);if(setting?.openingValue!==null&&setting?.openingValue!==undefined&&setting.additionalConversionCost!==null){const value=weightedInventory(flow,setting.openingValue,setting.additionalConversionCost);if(value)storedUnitCost.set(`${s.id}-source`,(setting.openingValue+flow.inflowPurchaseCost+setting.additionalConversionCost)/(opening+inflow||1));}}
 for(const f of fleetConfig.swaps.filter(f=>f.enabled)){const opening=f.slots.reduce((v,s)=>v+energyAtSOC(s.battery.capacityKWh!,s.battery.soh!,s.battery.initialSOC!,s.battery.energySOC),0),slotIds=new Set(f.slots.map(s=>s.id)),events=detail.serviceEvents.filter(e=>e.slotId&&slotIds.has(e.slotId)),inflow=events.reduce((v,e)=>v+(e.kind==='battery-charge'?e.storedChangeKWh:0),0),issued=events.reduce((v,e)=>v+e.outgoingKWh-e.returnedKWh,0),closing=detail.fleet.batteries.filter(b=>slotIds.has(b.slotId)).reduce((v,b)=>v+b.energyKWh,0);let cost=poolCosts.get(f.id)??0,internalTransferCost=0,complete=true;
  for(const [source,kWh]of poolSourceEnergy.get(f.id)??[]){const node=p.topology.nodes.find(n=>n.id===source);if(node?.type==='storage-source'||node?.type==='ups-source'){if(!storedUnitCost.has(source))complete=false;else {const transfer=kWh*storedUnitCost.get(source)!;cost+=transfer;internalTransferCost+=transfer;}}}
  if(complete)detail.inventory.push({poolId:f.id,openingKWh:opening,inflowKWh:inflow,inflowPurchaseCost:cost,internalTransferCost,issuedKWh:issued,closingKWh:closing});
 }
 for(const j of detail.fleet.transactions){const h=hour(j.station,j.arrival);h.requestedKWh+=j.requestedKWh??0;}
 const unmetAbsolute=detail.fleet.transactions.filter(j=>j.completion===null&&fleetConfig.swapArrivals.some(a=>a.id===j.id&&a.requestedKWh!==null&&a.requestedKWh!==undefined));
 if(unmetAbsolute.length)diagnostics.push({code:'UNSERVED_ABSOLUTE_SWAP_DEMAND',severity:'warning',message:`${unmetAbsolute.length} 個固定電量換電請求未完成，原始 kWh 已保留在未服務需求；請檢查有效容量、回站 SOC 下限、供電、庫存與工位。`});
 const unresolved=detail.fleet.transactions.filter(j=>j.requestedKWh===null).length;if(unresolved)diagnostics.push({code:'UNRESOLVED_SWAP_ENERGY',severity:'warning',message:`${unresolved} 個未配對換電請求尚無實際出站電池，總需求能量不完整；請同時查看未完成車次。`});
 const sum=(key:keyof HourResult)=>hours.reduce((v,h)=>v+Number(h[key]),0),delivered=sum('deliveredKWh'),grid=sum('gridKWh'),loss=sum('lossKWh'),final=fleet.stationState('A').storedKWh+fleet.stationState('B').storedKWh;
 detail.energy.storageFinalKWh=[...storeStates.values()].reduce((v,s)=>v+s.energyKWh,0);detail.energy.auxiliaryKWh=sum('auxiliaryKWh');detail.energy.networkLossKWh=loss-detail.energy.storageLossKWh;
 detail.energy.balanceResidualKWh=grid+detail.energy.pvKWh-detail.energy.exportKWh!-loss-detail.energy.auxiliaryKWh-delivered-(final-initial.A-initial.B)-(detail.energy.storageFinalKWh-detail.energy.storageInitialKWh);
 if(Math.abs(detail.energy.balanceResidualKWh)>1e-6)throw Error(`DETAILED_SITE_BALANCE:${detail.energy.balanceResidualKWh}`);
 const transactions=detail.fleet.transactions.map(j=>({id:j.id,station:j.station,kind:j.kind==='direct-charge'?'charge' as const:'swap' as const,arrival:j.arrival,start:j.start,completion:j.completion,requestedKWh:j.requestedKWh??0,deliveredKWh:j.deliveredKWh,unitPrice:j.unitPrice,revenue:j.revenue,equipmentId:j.gunIds.join('+')||j.outgoingBatteryId}));
 return {engineVersion:'0.7.0',parameterSnapshot:snapshot,mode:'CONSTRAINED',hours,transactions,diagnostics,powerTrace:trace,componentEnergy:[...components.values()],edgeEnergy:[...edges.values()],sourceMeters:[...meters.values()],detailedResult:detail,totals:{deliveredKWh:delivered,requestedKWh:sum('requestedKWh'),gridKWh:grid,lossKWh:loss,revenue:sumMoney(hours.map(h=>h.revenue)),gridCost:sumMoney(hours.map(h=>h.gridCost)),auxiliaryGridCost:sumMoney(hours.map(h=>h.auxiliaryGridCost)),completed:detail.fleet.totals.completed,unservedKWh:Math.max(0,sum('requestedKWh')-delivered),initialStoredKWh:initial.A+initial.B,finalStoredKWh:final,maxBalanceResidual:Math.max(Math.abs(detail.energy.balanceResidualKWh),...hours.map(h=>Math.abs(h.balanceResidual)))}};
}
