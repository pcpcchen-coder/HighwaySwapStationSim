import {parseFleetDraft} from './validation.ts';
import type {AllocatedPower,BatterySpec,BatteryState,ChargeArrival,ChargeBand,FleetConfig,FleetTotals,PowerRequest,RuntimeAvailability,ServiceEvent,ServiceSnapshot,ServiceTransaction,SwapArrival,SwapFleetConfig,VehicleChargeProfile} from './contracts.ts';
export * from './contracts.ts';
const EPS=1e-8;
const need=(v:number|null|undefined,path:string,min=0,max=Infinity):number=>{if(v===null||v===undefined||!Number.isFinite(v)||v<min||v>max)throw Error(`MISSING_OR_INVALID:${path}`);return v;};
const ratio=(v:number|null|undefined,path:string)=>need(v,path,Number.EPSILON,1);
function batteryCheck(b:BatterySpec,path:string,initial=true){if(!b.id||!b.family)throw Error(`MISSING_ID:${path}`);ratio(b.soh,`${path}.soh`);need(b.capacityKWh,`${path}.capacityKWh`,Number.EPSILON,5000);if(initial)need(b.initialSOC,`${path}.initialSOC`,0,1);}
/** Matches the existing 6-decimal / half-up-to-cent contract; integration can inject the production invoiceCents. */
export function serviceInvoiceCents(energy:number,price:number):number {
 need(energy,'invoice.energy',0,1e9);need(price,'invoice.price',0,1e6);
 const e=BigInt(Math.floor(energy*1e6+.5)),p=BigInt(Math.floor(price*1e6+.5));
 const cents=(e*p+5000000000n)/10000000000n;
 if(cents>1000000000000n)throw Error('MONEY_RANGE');return Number(cents);
}
export function validateFleetConfig(c:FleetConfig):void {
 const unique=(values:string[],kind:string)=>{if(values.some(v=>!v)||new Set(values).size!==values.length)throw Error(`DUPLICATE_OR_EMPTY:${kind}`);};
 unique(c.swaps.map(f=>f.id),'fleet');unique(c.guns.map(g=>g.id),'gun');unique(c.profiles.map(p=>p.id),'profile');
 unique([...c.swapArrivals,...c.chargeArrivals].map(j=>j.id),'job');
 unique(c.swaps.filter(f=>f.enabled).flatMap(f=>f.slots.map(s=>s.id)),'slot');
 unique(c.swaps.filter(f=>f.enabled).flatMap(f=>f.slots.map(s=>s.battery.id)),'battery');
 for(const f of c.swaps)if(f.enabled){
  need(f.bays,`${f.id}.bays`,1,100);if(!Number.isInteger(f.bays))throw Error(`INTEGER:${f.id}.bays`);
  need(f.swapMinutes,`${f.id}.swapMinutes`,Number.EPSILON);ratio(f.readySOC,`${f.id}.readySOC`);
  if(!f.slots.length)throw Error(`MISSING:${f.id}.slots`);
  for(const s of f.slots){if(!s.sink)throw Error(`MISSING:${s.id}.sink`);batteryCheck(s.battery,s.id);need(s.chargeKW,`${s.id}.chargeKW`,0);ratio(s.chargeEfficiency,`${s.id}.chargeEfficiency`);if(s.battery.initialSOC!>f.readySOC!+EPS)throw Error(`INITIAL_ABOVE_READY:${s.id}`);}
 }
 for(const p of c.profiles)if(p.enabled){
  need(p.capacityKWh,`${p.id}.capacityKWh`,Number.EPSILON,5000);ratio(p.soh,`${p.id}.soh`);ratio(p.chargeEfficiency,`${p.id}.chargeEfficiency`);
  if(!p.bands?.length)throw Error(`MISSING:${p.id}.bands`);
  let end=0;for(const b of p.bands){if(Math.abs(b.fromSOC-end)>EPS||b.toSOC<=b.fromSOC||b.toSOC>1)throw Error(`CURVE_COVERAGE:${p.id}`);need(b.voltageV,`${p.id}.voltage`,Number.EPSILON,2000);need(b.maxKW,`${p.id}.maxKW`);need(b.maxCurrentA,`${p.id}.maxCurrentA`);end=b.toSOC;}if(Math.abs(end-1)>EPS)throw Error(`CURVE_COVERAGE:${p.id}`);
  if(p.temperatureBands!==null){if(!p.temperatureBands.length)throw Error(`MISSING:${p.id}.temperatureBands`);let end=-Infinity;for(const b of p.temperatureBands){need(b.minC,`${p.id}.temperature.min`,-273.15);need(b.maxC,`${p.id}.temperature.max`,-273.15);need(b.multiplier,`${p.id}.temperature.multiplier`,0,1);if(b.minC<end||b.maxC<=b.minC)throw Error(`TEMPERATURE_OVERLAP:${p.id}`);end=b.maxC;}}
 }
 for(const g of c.guns){if(!g.sink||!g.terminal)throw Error(`MISSING:${g.id}.mapping`);need(g.maxKW,`${g.id}.maxKW`);need(g.maxCurrentA,`${g.id}.maxCurrentA`);need(g.maxVoltageV,`${g.id}.maxVoltageV`,Number.EPSILON);}
 for(const a of c.swapArrivals){
  const f=c.swaps.find(f=>f.id===a.fleetId);if(!f?.enabled)throw Error(`DISABLED_OR_MISSING_FLEET:${a.fleetId}`);
  need(a.atMinute,`${a.id}.atMinute`);need(a.unitPrice,`${a.id}.unitPrice`);need(a.returnSOC,`${a.id}.returnSOC`,0,f.readySOC!);
  if(a.returnedPack){batteryCheck(a.returnedPack,`${a.id}.returnedPack`,false);if(a.returnedPack.initialSOC!==null&&Math.abs(a.returnedPack.initialSOC-a.returnSOC!)>EPS)throw Error(`RETURN_SOC_CONFLICT:${a.id}`);}
 }
 for(const a of c.chargeArrivals){
  need(a.atMinute,`${a.id}.atMinute`);need(a.unitPrice,`${a.id}.unitPrice`);if(a.gunsRequired!==1&&a.gunsRequired!==2)throw Error(`GUN_COUNT:${a.id}`);
  if(a.profileId!==null){const p=c.profiles.find(p=>p.id===a.profileId);if(!p?.enabled)throw Error(`DISABLED_OR_MISSING_PROFILE:${a.profileId}`);need(a.initialSOC,`${a.id}.initialSOC`,0,1);need(a.targetSOC,`${a.id}.targetSOC`,0,1);if(a.targetSOC!<=a.initialSOC!)throw Error(`SOC_ORDER:${a.id}`);if(a.energyKWh!==null)throw Error(`TWO_ENERGY_TRUTHS:${a.id}`);if(p.temperatureBands!==null)need(a.temperatureC,`${a.id}.temperatureC`,-273.15);}
  else {need(a.energyKWh,`${a.id}.energyKWh`,Number.EPSILON);if(a.initialSOC!==null||a.targetSOC!==null)throw Error(`SOC_WITHOUT_PROFILE:${a.id}`);}
  if(a.allowedGunIds!==null){unique(a.allowedGunIds,`${a.id}.allowedGunIds`);if(a.allowedGunIds.some(id=>!c.guns.some(g=>g.id===id&&g.station===a.station)))throw Error(`UNKNOWN_GUN:${a.id}`);}
  let prev=a.atMinute;for(const e of a.temperatureSchedule){need(e.atMinute,`${a.id}.temperature.atMinute`,a.atMinute);need(e.temperatureC,`${a.id}.temperatureC`,-273.15);if(e.atMinute<prev)throw Error(`TEMPERATURE_ORDER:${a.id}`);prev=e.atMinute;}
 }
}
interface SlotRuntime {fleet:SwapFleetConfig; slotIndex:number; state:BatteryState;}
interface SwapRuntime {arrival:SwapArrival; transaction:ServiceTransaction; slot:SlotRuntime; remainingMinutes:number;}
interface ChargeRuntime {arrival:ChargeArrival; transaction:ServiceTransaction; storedKWh:number; targetKWh:number;}
/** A service-only event engine. All allocations must come from one shared electrical allocator. */
export class ServiceFleet {
 readonly config:FleetConfig;
 private now=0;private availability:RuntimeAvailability={};private slots:SlotRuntime[]=[];
 private pendingSwap:SwapArrival[];private pendingCharge:ChargeArrival[];private swapQueue:SwapArrival[]=[];private chargeQueue:ChargeArrival[]=[];
 private swapping:SwapRuntime[]=[];private charging:ChargeRuntime[]=[];private transactions:ServiceTransaction[]=[];private log:ServiceEvent[]=[];
 private initialStoredKWh=0;
 private invoiceCents:(energy:number,price:number)=>number;
 constructor(input:FleetConfig,invoiceCents:(energy:number,price:number)=>number=serviceInvoiceCents){
  this.invoiceCents=invoiceCents;input=parseFleetDraft(input);validateFleetConfig(input);this.config=structuredClone(input);this.pendingSwap=[...this.config.swapArrivals].sort((a,b)=>a.atMinute-b.atMinute);this.pendingCharge=[...this.config.chargeArrivals].sort((a,b)=>a.atMinute-b.atMinute);
  for(const f of this.config.swaps)if(f.enabled)f.slots.forEach((s,slotIndex)=>{const b=s.battery;this.slots.push({fleet:f,slotIndex,state:{slotId:s.id,sink:s.sink,batteryId:b.id,family:b.family,capacityKWh:b.capacityKWh!,soh:b.soh!,energyKWh:b.capacityKWh!*b.soh!*b.initialSOC!,reserved:false}});});
  this.initialStoredKWh=this.slots.reduce((a,s)=>a+s.state.energyKWh,0);
 }
 private enabled(sink:string){return !this.availability.disabledSinks?.includes(sink);}
 private operating(fleetId:string){return !this.availability.pausedFleetIds?.includes(fleetId);}
 private transaction(id:string){return this.transactions.find(t=>t.id===id)!;}
 private makeTransaction(id:string,station:'A'|'B',kind:ServiceTransaction['kind'],arrival:number,price:number,requested:number|null){const t:ServiceTransaction={id,station,kind,arrival,start:null,completion:null,requestedKWh:requested,deliveredKWh:0,storedVehicleKWh:0,unitPrice:price,revenue:0,gunIds:[]};this.transactions.push(t);return t;}
 private recognized(t:ServiceTransaction,energy:number){t.deliveredKWh+=energy;const revenue=this.invoiceCents(t.deliveredKWh,t.unitPrice)/100,delta=revenue-t.revenue;t.revenue=revenue;return delta;}
 private profile(a:ChargeArrival):VehicleChargeProfile|undefined{return this.config.profiles.find(p=>p.id===a.profileId);}
 private soc(j:ChargeRuntime){const p=this.profile(j.arrival)!;return j.storedKWh/(p.capacityKWh!*p.soh!);}
 private band(j:ChargeRuntime):{[K in keyof ChargeBand]:NonNullable<ChargeBand[K]>}|undefined{const p=this.profile(j.arrival);if(!p)return;const soc=this.soc(j);return (p.bands!.find(b=>soc>=b.fromSOC-EPS&&soc<b.toSOC-EPS)??p.bands!.at(-1)) as {[K in keyof ChargeBand]:NonNullable<ChargeBand[K]>};}
 private temperatureMultiplier(j:ChargeRuntime){const p=this.profile(j.arrival);if(!p?.temperatureBands)return 1;let temp=j.arrival.temperatureC!;for(const e of j.arrival.temperatureSchedule)if(e.atMinute<=this.now+EPS)temp=e.temperatureC;const b=p.temperatureBands.find((b,i)=>temp>=b.minC&&(temp<b.maxC||(i===p.temperatureBands!.length-1&&temp===b.maxC)));if(!b)throw Error(`TEMPERATURE_OUTSIDE_PROFILE:${j.arrival.id}:${temp}`);return b.multiplier;}
 private emit(e:ServiceEvent){this.log.push(e);}
 /** Process all zero-duration events at the current clock. Call after every advance and availability change. */
 activate(atMinute=this.now,availability:RuntimeAvailability=this.availability):ServiceEvent[]{
  if(Math.abs(atMinute-this.now)>EPS)throw Error('ACTIVATE_CLOCK_MISMATCH');const from=this.log.length;this.availability=structuredClone(availability);
  for(const active of this.swapping.filter(a=>a.remainingMinutes<=EPS)){
   const b=active.slot.state,j=active.arrival,t=active.transaction,outgoing=b.energyKWh,pack=j.returnedPack;
   const capacity=pack?.capacityKWh??b.capacityKWh,soh=pack?.soh??b.soh,incoming=capacity*soh*j.returnSOC!,delivered=outgoing-incoming;
   if(delivered<-EPS)throw Error(`NEGATIVE_SWAP_TRANSFER:${j.id}`);
   t.outgoingBatteryId=b.batteryId;t.incomingBatteryId=pack?.id??`${j.id}:returned`;t.completion=this.now;
   const revenueDelta=this.recognized(t,Math.max(0,delivered));
   Object.assign(b,{batteryId:t.incomingBatteryId,family:pack?.family??b.family,capacityKWh:capacity,soh,energyKWh:incoming,reserved:false});
   this.emit({atMinute:this.now,station:t.station,kind:'swap-complete',serviceKind:t.kind,jobId:j.id,slotId:b.slotId,outgoingKWh:outgoing,returnedKWh:incoming,deliveredKWh:delivered,terminalKWh:0,batteryLossKWh:0,storedChangeKWh:incoming-outgoing,revenueDelta});
  }
  this.swapping=this.swapping.filter(a=>a.remainingMinutes>EPS);
  for(const active of this.charging.filter(a=>a.transaction.deliveredKWh>=a.transaction.requestedKWh!-EPS)){active.transaction.completion=this.now;this.emit({atMinute:this.now,station:active.transaction.station,kind:'charge-complete',serviceKind:'direct-charge',jobId:active.arrival.id,terminalKWh:0,batteryLossKWh:0,storedChangeKWh:0,outgoingKWh:0,returnedKWh:0,deliveredKWh:0,revenueDelta:0});}
  this.charging=this.charging.filter(a=>a.transaction.completion===null);
  while(this.pendingSwap[0]?.atMinute<=this.now+EPS){const a=this.pendingSwap.shift()!,f=this.config.swaps.find(f=>f.id===a.fleetId)!;this.makeTransaction(a.id,f.station,f.kind,a.atMinute,a.unitPrice!,null);this.swapQueue.push(a);}
  while(this.pendingCharge[0]?.atMinute<=this.now+EPS){const a=this.pendingCharge.shift()!,p=this.profile(a),requested=p?p.capacityKWh!*p.soh!*(a.targetSOC!-a.initialSOC!)/p.chargeEfficiency!:a.energyKWh!;this.makeTransaction(a.id,a.station,'direct-charge',a.atMinute,a.unitPrice!,requested);this.chargeQueue.push(a);}
  for(const f of this.config.swaps.filter(f=>f.enabled&&this.operating(f.id)))while(this.swapping.filter(a=>a.slot.fleet.id===f.id).length<f.bays!){
   let selected:{index:number;slot:SlotRuntime}|undefined;
   for(let i=0;i<this.swapQueue.length;i++){const a=this.swapQueue[i];if(a.fleetId!==f.id)continue;const slot=this.slots.find(s=>s.fleet.id===f.id&&!s.state.reserved&&this.enabled(s.state.sink)&&s.state.energyKWh>=s.state.capacityKWh*s.state.soh*f.readySOC!-EPS&&(!a.returnedPack||a.returnedPack.family===s.state.family)&&s.state.energyKWh+EPS>=(a.returnedPack?.capacityKWh??s.state.capacityKWh)*(a.returnedPack?.soh??s.state.soh)*a.returnSOC!);if(slot){selected={index:i,slot};break;}}
   if(!selected)break;const a=this.swapQueue.splice(selected.index,1)[0],t=this.transaction(a.id),b=selected.slot.state;const incoming=(a.returnedPack?.capacityKWh??b.capacityKWh)*(a.returnedPack?.soh??b.soh)*a.returnSOC!;
   t.requestedKWh=b.energyKWh-incoming;t.start=this.now;b.reserved=true;this.swapping.push({arrival:a,transaction:t,slot:selected.slot,remainingMinutes:f.swapMinutes!});
  }
  for(let qi=0;qi<this.chargeQueue.length;){const a=this.chargeQueue[qi],used=new Set(this.charging.flatMap(j=>j.transaction.gunIds));const profile=this.profile(a),requiredVoltage=profile?Math.max(...profile.bands!.filter(b=>b.fromSOC<a.targetSOC!&&b.toSOC>a.initialSOC!).map(b=>b.voltageV!)):0;const free=this.config.guns.filter(g=>g.enabled&&this.enabled(g.sink)&&g.station===a.station&&!used.has(g.id)&&(a.allowedGunIds===null||a.allowedGunIds.includes(g.id))&&g.maxVoltageV>=requiredVoltage);
   const choice=a.gunsRequired===1?free.slice(0,1):free.map(g=>free.filter(h=>h.terminal===g.terminal).slice(0,2)).find(gs=>gs.length===2)??[];
   if(choice.length<a.gunsRequired){qi++;continue;}this.chargeQueue.splice(qi,1);const t=this.transaction(a.id),p=this.profile(a);t.start=this.now;t.gunIds=choice.map(g=>g.id);this.charging.push({arrival:a,transaction:t,storedKWh:p?p.capacityKWh!*p.soh!*a.initialSOC!:0,targetKWh:p?p.capacityKWh!*p.soh!*a.targetSOC!:a.energyKWh!});
  }
  return structuredClone(this.log.slice(from));
 }
 powerRequests():PowerRequest[]{
  const requests:PowerRequest[]=[];
  for(const s of this.slots){const b=s.state,config=s.fleet.slots[s.slotIndex];if(!b.reserved&&this.enabled(b.sink)&&b.energyKWh<b.capacityKWh*b.soh*s.fleet.readySOC!-EPS)requests.push({id:`battery:${s.fleet.id}:${b.slotId}`,sink:b.sink,kw:config.chargeKW!,station:s.fleet.station,kind:'battery',serviceKind:s.fleet.kind,fleetId:s.fleet.id,batteryId:b.batteryId,slotId:b.slotId});}
  for(const j of this.charging){const p=this.profile(j.arrival),band=this.band(j),multiplier=this.temperatureMultiplier(j);const guns=j.transaction.gunIds.map(id=>this.config.guns.find(g=>g.id===id)!);const caps=guns.map(g=>!this.enabled(g.sink)?0:band?(band.voltageV>g.maxVoltageV?0:Math.min(g.maxKW,g.maxCurrentA*band.voltageV/1000)):g.maxKW);
   const sum=caps.reduce((a,b)=>a+b,0),cap=band?Math.min(band.maxKW,band.maxCurrentA*band.voltageV/1000)*multiplier:sum,factor=sum?Math.min(1,cap/sum):0;
   guns.forEach((g,i)=>requests.push({id:`gun:${j.arrival.id}:${g.id}`,sink:g.sink,kw:caps[i]*factor,station:j.arrival.station,kind:'gun',serviceKind:'direct-charge',jobId:j.arrival.id,...(band?{voltageV:band.voltageV}:{})}));
  }
  return requests;
 }
 nextEventMinute(power:AllocatedPower,ceiling=Infinity):number {
  let next=Math.min(ceiling,this.pendingSwap[0]?.atMinute??Infinity,this.pendingCharge[0]?.atMinute??Infinity);
  for(const a of this.swapping)if(this.operating(a.slot.fleet.id))next=Math.min(next,this.now+a.remainingMinutes);
  for(const s of this.slots){const q=power[`battery:${s.fleet.id}:${s.state.slotId}`]??0;if(q>EPS){const eta=s.fleet.slots[s.slotIndex].chargeEfficiency!,remaining=s.state.capacityKWh*s.state.soh*s.fleet.readySOC!-s.state.energyKWh;next=Math.min(next,this.now+60*remaining/(q*eta));}}
  for(const j of this.charging){const q=j.transaction.gunIds.reduce((v,id)=>v+(power[`gun:${j.arrival.id}:${id}`]??0),0),p=this.profile(j.arrival);for(const e of j.arrival.temperatureSchedule)if(e.atMinute>this.now+EPS)next=Math.min(next,e.atMinute);
   if(q>EPS){next=Math.min(next,this.now+60*(j.transaction.requestedKWh!-j.transaction.deliveredKWh)/q);if(p){const band=this.band(j)!;next=Math.min(next,this.now+60*(p.capacityKWh!*p.soh!*Math.min(band.toSOC,j.arrival.targetSOC!)-j.storedKWh)/(q*p.chargeEfficiency!));}}
  }
  return next;
 }
 /** Integrate constant accepted power only to the next physical or scheduled service event. */
 advance(toMinute:number,power:AllocatedPower):ServiceEvent[]{
  need(toMinute,'toMinute',this.now);const requests=this.powerRequests(),known=new Map(requests.map(r=>[r.id,r]));
  for(const [id,q] of Object.entries(power)){need(q,`allocation.${id}`);const r=known.get(id);if(!r||q>r.kw+EPS)throw Error(`ALLOCATION_EXCEEDS_REQUEST:${id}`);}
  const next=this.nextEventMinute(power,toMinute);if(toMinute>next+EPS)throw Error(`ADVANCE_CROSSES_EVENT:${next}`);if(toMinute<=this.now+EPS)return[];
  const start=this.log.length,dt=(toMinute-this.now)/60;
  for(const s of this.slots){const key=`battery:${s.fleet.id}:${s.state.slotId}`,terminal=(power[key]??0)*dt;if(terminal<=0)continue;const stored=terminal*s.fleet.slots[s.slotIndex].chargeEfficiency!,loss=terminal-stored;s.state.energyKWh+=stored;this.emit({atMinute:this.now,toMinute,station:s.fleet.station,kind:'battery-charge',serviceKind:s.fleet.kind,batteryId:s.state.batteryId,slotId:s.state.slotId,sink:s.state.sink,terminalKWh:terminal,batteryLossKWh:loss,storedChangeKWh:stored,outgoingKWh:0,returnedKWh:0,deliveredKWh:0,revenueDelta:0});}
  for(const j of this.charging){const profile=this.profile(j.arrival);for(const gunId of j.transaction.gunIds){const terminal=(power[`gun:${j.arrival.id}:${gunId}`]??0)*dt;if(terminal<=0)continue;const stored=terminal*(profile?.chargeEfficiency??1),loss=terminal-stored;j.storedKWh+=stored;j.transaction.storedVehicleKWh+=stored;const revenueDelta=this.recognized(j.transaction,terminal);this.emit({atMinute:this.now,toMinute,station:j.transaction.station,kind:'charge-energy',serviceKind:'direct-charge',jobId:j.arrival.id,sink:this.config.guns.find(g=>g.id===gunId)!.sink,terminalKWh:terminal,batteryLossKWh:loss,storedChangeKWh:0,outgoingKWh:0,returnedKWh:0,deliveredKWh:terminal,revenueDelta});}}
  for(const a of this.swapping)if(this.operating(a.slot.fleet.id))a.remainingMinutes=Math.max(0,a.remainingMinutes-(toMinute-this.now));
  this.now=toMinute;return structuredClone(this.log.slice(start));
 }
 /** Small event-loop state: no transaction or ledger cloning. */
 stationState(station:'A'|'B'):{storedKWh:number;ready:number;queue:number;activeSwaps:number;activeCharges:number}{
  const slots=this.slots.filter(s=>s.fleet.station===station);
  return {storedKWh:slots.reduce((v,s)=>v+s.state.energyKWh,0),ready:slots.filter(s=>!s.state.reserved&&this.enabled(s.state.sink)&&s.state.energyKWh>=s.state.capacityKWh*s.state.soh*s.fleet.readySOC!-EPS).length,queue:this.swapQueue.filter(a=>this.config.swaps.find(f=>f.id===a.fleetId)!.station===station).length+this.chargeQueue.filter(a=>a.station===station).length,activeSwaps:this.swapping.filter(a=>a.slot.fleet.station===station).length,activeCharges:this.charging.filter(a=>a.arrival.station===station).length};
 }
 activeFleetSwaps(fleetId:string):number{return this.swapping.filter(a=>a.slot.fleet.id===fleetId).length;}
 /** Connector-to-stored efficiency keyed by physical slot sink. */
 slotEtaMap():Record<string,number>{return Object.fromEntries(this.slots.map(s=>[s.state.sink,s.fleet.slots[s.slotIndex].chargeEfficiency!]));}
 events():ServiceEvent[]{return structuredClone(this.log);}
 snapshot():ServiceSnapshot {
  const sum=(select:(e:ServiceEvent)=>number)=>this.log.reduce((v,e)=>v+select(e),0),finalStoredKWh=this.slots.reduce((v,s)=>v+s.state.energyKWh,0);
  const batteryTerminalKWh=sum(e=>e.kind==='battery-charge'?e.terminalKWh:0),batteryLossKWh=sum(e=>e.kind==='battery-charge'?e.batteryLossKWh:0),outgoingKWh=sum(e=>e.outgoingKWh),returnedKWh=sum(e=>e.returnedKWh),directTerminalKWh=sum(e=>e.kind==='charge-energy'?e.terminalKWh:0),directBatteryLossKWh=sum(e=>e.kind==='charge-energy'?e.batteryLossKWh:0);
  const totals:FleetTotals={initialStoredKWh:this.initialStoredKWh,finalStoredKWh,batteryTerminalKWh,batteryLossKWh,outgoingKWh,returnedKWh,swapDeliveredKWh:outgoingKWh-returnedKWh,directTerminalKWh,directStoredKWh:directTerminalKWh-directBatteryLossKWh,directBatteryLossKWh,revenue:this.transactions.reduce((v,t)=>v+Math.round(t.revenue*100),0)/100,completed:this.transactions.filter(t=>t.completion!==null).length,inventoryResidualKWh:this.initialStoredKWh+batteryTerminalKWh-batteryLossKWh+returnedKWh-outgoingKWh-finalStoredKWh};
  return {atMinute:this.now,batteries:structuredClone(this.slots.map(s=>s.state)),transactions:structuredClone(this.transactions),totals};
 }
}
