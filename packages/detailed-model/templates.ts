import type {Project} from '../contracts/index.ts';
import type {DetailedConfig} from './contracts.ts';
import type {BatterySlotConfig} from '../service-fleet/contracts.ts';
import {compileTruckSlots,compilePassengerSlots} from './services.ts';
import {defaultNodePhysics,defaultPassenger} from './defaults.ts';
import {defaultPhysicalConfig} from '../physical-models/schema.ts';
import {defaultExtendedFinance} from '../extended-finance/contracts.ts';
import {parseDetailedDraft} from './schema.ts';
export type ConfigPath=(string|number)[];
export interface AddedDetailedTemplate {config:DetailedConfig;focusPath:string;message:string;added:number;}
const textPath=(path:ConfigPath)=>path.reduce<string>((s,k)=>typeof k==='number'?`${s}[${k}]`:`${s}${s?'.':''}${k}`,'');
const keyPath=(path:ConfigPath)=>path.map(k=>typeof k==='number'?'*':k).join('.');
function at(root:unknown,path:ConfigPath):unknown{return path.reduce<unknown>((v,k)=>(v as Record<string,unknown>)?.[String(k)],root);}
function replace(config:DetailedConfig,path:ConfigPath,value:unknown):DetailedConfig{const next=structuredClone(config);let target:Record<string,unknown>=next as unknown as Record<string,unknown>;for(const k of path.slice(0,-1))target=target[String(k)] as Record<string,unknown>;target[String(path.at(-1))]=value;return next;}
function stringIds(config:DetailedConfig){const found=new Set<string>();const walk=(v:unknown)=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')for(const [k,value]of Object.entries(v)){if(['id','nodeId','sourceId','poolId','equipmentId'].includes(k)&&typeof value==='string')found.add(value);walk(value);}};walk(config);return found;}
const supported=new Set(['physics','storage','solar','backup','loads','service.passenger','service.profiles','service.swapArrivals','service.chargeArrivals','service.truckSlotOverrides','service.passenger.*.slotOverrides','service.passenger.*.arrivals','construction','finance.assets','finance.opex','finance.investment.operatingMonths','finance.inventory.pools','finance.meters','finance.meters.*.monthlyPF','dispatch.gridLimits','assumptions','solar.*.profile','physics.*.faultSchedule','physics.*.curve.points','physics.*.thermal.ampacityByAmbientC','service.profiles.*.bands','service.truckSlotOverrides.*.slot.chargeBands','service.passenger.*.slotOverrides.*.slot.chargeBands','service.truckSlotOverrides.*.slot.battery.energySOC','service.passenger.*.slotOverrides.*.slot.battery.energySOC','service.swapArrivals.*.returnedPack.energySOC']);
export const hasDetailedTemplate=(path:ConfigPath)=>supported.has(keyPath(path));
/** Inserts schema scaffolding only. All unknown engineering/price quantities
 * remain null; IDs, enum choices and event/curve coordinates are editable UI defaults.
 * Existing rows and every other collection are preserved. */
export function appendDetailedTemplate(project:Project,config:DetailedConfig,path:ConfigPath):AddedDetailedTemplate{
 const key=keyPath(path);if(!supported.has(key))throw Error('此集合尚無快捷模板，可使用 JSON 結構編輯。');
 const current=at(config,path);if(current!==null&&!Array.isArray(current))throw Error('只能對陣列或待填曲線新增項目。');
 const list=structuredClone((current??[]) as unknown[]),ids=stringIds(config),id=(prefix:string)=>{let i=1;while(ids.has(`${prefix}-${i}`))i++;const value=`${prefix}-${i}`;ids.add(value);return value;};
 const station='A' as const,pendingEquipment=()=>id('待指定設備'),availableNode=(used:string[],types?:string[])=>project.topology.nodes.find(n=>!used.includes(n.id)&&(!types||types.includes(n.type)))?.id??pendingEquipment();
 let item:unknown,message='已新增欄位骨架。未知數值保留待填；請設定實際數值後再啟用。',added=1,index=list.length;
 const blankBattery=(prefix:string,family:string)=>({id:id(prefix),family,capacityKWh:null,soh:null,initialSOC:null,energySOC:null});
 const makeSlot=(rackId:string,family:string)=>({enabled:false,slot:{id:rackId,sink:rackId,battery:blankBattery(`${rackId}-battery`,family),chargeKW:null,chargeEfficiency:null,chargeBands:null}});
 switch(key){
  case 'physics':item=defaultNodePhysics(availableNode(config.physics.map(m=>m.nodeId)));break;
  case 'storage':item={id:id('A-ess'),station,kind:'ESS',connectionNodeId:'A-feed-pcs',config:defaultPhysicalConfig('storage'),initialSOC:null,initialSOH:null,policy:defaultPhysicalConfig('storagePolicy')};break;
  case 'solar':item={id:id('A-pv'),station,connectionNodeId:'A-feed-pcs',config:defaultPhysicalConfig('pv'),export:{enabled:false,gridSourceId:'A-grid',connectionNodeId:'A-feed-pcs',converterKW:null,efficiency:null,unitPrice:null},profile:[{atMinute:0,irradianceWm2:null,cellTemperatureC:null}]};break;
  case 'backup':item={id:id('A-ats'),station,normalNodeId:'A-lv',backupNodeId:'A-ups-out',loadNodeIds:[],config:defaultPhysicalConfig('ats'),inverterKW:null,inverterEfficiency:null};break;
  case 'loads':item={nodeId:availableNode(config.loads.map(n=>n.nodeId),['ac-load','swap-bay','passenger','rack']),idleKW:null,perActiveJobKW:null,hourlyKW:null,perEnabledSST:false};message='已新增負載欄位。請選擇實際節點並填入負載；此集合沒有啟用開關，必要值待填時會阻擋測算。';break;
  case 'service.passenger':{const s=(['A','B'] as const).find(s=>!config.service.passenger.some(p=>p.station===s));if(!s)throw Error('A、B 兩區已有乘用車設定，請編輯既有項目。');item=defaultPassenger(s);break;}
  case 'service.profiles':item={id:id('vehicle-profile'),enabled:false,capacityKWh:null,soh:null,chargeEfficiency:null,bands:null,temperatureBands:null};break;
  case 'service.swapArrivals':item={id:id('swap-arrival'),fleetId:'A-truck',atMinute:0,returnSOC:null,unitPrice:null,returnedPack:null,requestedKWh:null,minReturnSOC:null};message='已新增換電事件骨架；第0分鐘是可編輯時間欄初值。請填售價與實際到站時間；指定回站SOC，或保持回站SOC為null並填絕對換電需求與最低回站SOC。兩種需求模式只能擇一。';break;
  case 'service.chargeArrivals':item={id:id('charge-arrival'),station,atMinute:0,unitPrice:null,gunsRequired:1,energyKWh:null,profileId:null,initialSOC:null,targetSOC:null,temperatureC:null,temperatureSchedule:[],allowedGunIds:null};message='已新增直接充電事件骨架；請填實際時間、售價與需求，或指定車端曲線。時間0／單槍是可編輯的操作初值。';break;
  case 'service.truckSlotOverrides':{const used=config.service.truckSlotOverrides.map(x=>x.slot.id),rack=project.topology.nodes.find(n=>n.type==='rack'&&!used.includes(n.id));if(!rack)throw Error('目前全部重卡倉位已有覆寫，請編輯既有項目或先新增倉位。');item=makeSlot(rack.id,`truck-${rack.station}`);break;}
  case 'service.passenger.*.slotOverrides':{const pc=config.service.passenger[Number(path[2])],used=pc.slotOverrides.map(x=>x.slot.id),rack=Array.from({length:pc.slots},(_,i)=>`${pc.station}-passenger-rack-${i}`).find(id=>!used.includes(id));if(!rack)throw Error('此乘用車站全部倉位已有覆寫，請編輯既有項目。');item=makeSlot(rack,`CATL-${pc.station}`);break;}
  case 'service.passenger.*.arrivals':item={id:id('passenger-arrival'),atMinute:0,count:0,returnSOC:null,unitPrice:null};message='已新增乘用車事件骨架。車數先為0，因此尚不產生到站事件；請填實際時間、車數、SOC與售價。';break;
  case 'construction':item={atMinute:0,equipmentId:pendingEquipment(),enabled:false,params:{}};message='已新增施工排程骨架。請先填實際設備ID與時間；enabled表示該時刻的設備開／關狀態，並非整筆排程的啟用開關。未指定設備會阻擋執行。';break;
  case 'finance.assets':{const name='新資產（待填）',asset=defaultExtendedFinance([{id:id('asset'),name,type:'other'}]).assets[0];item={...asset,id:id('cost'),equipmentId:null,quantity:null};break;}
  case 'finance.opex':item={id:id('opex'),name:'新費用（待填）',basis:'CALENDAR_MONTH',rate:null,startMonth:1,endMonth:0,escalationAnnual:null};message='已新增費用骨架；金額待填。計價基準／起始月1／結束月0（無排定終點）為可編輯初值。';break;
  case 'finance.investment.operatingMonths':{let month=1;const used=new Set(config.finance.investment.operatingMonths.map(m=>m.month));while(used.has(month))month++;item={month,calendarDays:null,operatingDays:null,revenue:null,energyPurchases:null,energyExpense:null,basicAndAdjustmentCharges:null,deliveredKWh:null};break;}
  case 'finance.inventory.pools':item={poolId:id('待指定存貨池'),openingValue:null,additionalConversionCost:null};break;
  case 'finance.meters':{const source=project.topology.nodes.find(n=>n.type==='grid'&&!config.finance.meters.some(m=>m.sourceId===n.id));if(!source)throw Error('目前每個電網來源已有合約設定，請編輯既有項目或先新增電網來源。');item=defaultExtendedFinance([source]).meters[0];break;}
  case 'finance.meters.*.monthlyPF':{const values=list as {month:string}[],start=config.finance.calendar.startDate?.slice(0,7);if(!start)throw Error('請先填入營運開始日期，才能建立實際帳期的功率因數欄位。');let year=Number(start.slice(0,4)),month=Number(start.slice(5,7));while(values.some(v=>v.month===`${year}-${String(month).padStart(2,'0')}`)){month++;if(month===13){month=1;year++;}}item={month:`${year}-${String(month).padStart(2,'0')}`,powerFactor:null};message='已依目前营運開始日期新增帳期欄位，功率因數保留待填。';break;}
  case 'dispatch.gridLimits':item={sourceId:availableNode(config.dispatch.gridLimits.map(g=>g.sourceId),['grid']),kw:null};break;
  case 'assumptions':item={id:id('assumption'),status:'ASSUMPTION',note:'待填來源、定義與確認依據'};break;
  case 'solar.*.profile':item={atMinute:list.length?Math.max(...(list as {atMinute:number}[]).map(r=>r.atMinute))+1:0,irradianceWm2:null,cellTemperatureC:null};message='已新增光伏時序待填項。時間欄先接續1分鐘，請改為實際資料時間。';break;
  case 'physics.*.faultSchedule':item={fromMinute:0,toMinute:1,currentA:null};message='已新增故障事件骨架；0–1分鐘僅為可編輯事件區間，請填實際時間與故障電流。';break;
  case 'physics.*.curve.points':{
   if(!list.length){list.push({x:0,y:null},{x:1,y:null});added=2;index=0;}else{const points=list as {x:number|null;y:number|null}[];let position=points.findIndex((p,i)=>i>0&&p.x!==null&&points[i-1].x!==null&&p.x>points[i-1].x!);if(position>=0){const x=(points[position-1].x!+points[position].x!)/2;list.splice(position,0,{x,y:null});index=position;}else list.push({x:null,y:null});}
   message='已建立效率曲線座標骨架（負載比例0–1）；效率值待填，不以100%代填。已有曲線新增點時，橫坐標先取相鄰區間中點，可再修改。';break;
  }
  case 'physics.*.thermal.ampacityByAmbientC':if(!list.length){list.push({x:null,y:null},{x:null,y:null});added=2;index=0;}else list.push({x:null,y:null});message='已新增溫度／載流量降額曲線待填點；溫度與降額均未假定。';break;
  case 'service.truckSlotOverrides.*.slot.battery.energySOC':
  case 'service.passenger.*.slotOverrides.*.slot.battery.energySOC':
  case 'service.swapArrivals.*.returnedPack.energySOC':{
   if(!list.length){list.push({soc:0,energyFraction:null},{soc:1,energyFraction:null});added=2;index=0;}else{const points=list as {soc:number;energyFraction:number|null}[];const position=points.findIndex((p,i)=>i>0&&p.soc>points[i-1].soc);if(position<0)throw Error('請先在0–1之間建立遞增SOC座標，再新增內插點。');const soc=(points[position-1].soc+points[position].soc)/2;list.splice(position,0,{soc,energyFraction:null});index=position;}
   message='已新增SOC／儲能比例對照待填點；比例以容量×SOH為基準，曲線須從(0,0)到(1,1)且嚴格遞增。中間點應填入量測或確認資料，系統以分段線性對照計算SOC。';break;
  }
  case 'service.truckSlotOverrides.*.slot.chargeBands':
  case 'service.passenger.*.slotOverrides.*.slot.chargeBands':
  case 'service.profiles.*.bands':item={fromSOC:0,toSOC:1,voltageV:null,maxKW:null,maxCurrentA:null};message='已新增SOC分段0–1骨架；電壓、功率及電流待填。已有其他分段時，請調整起訖避免重疊，再啟用曲線。';break;
 }
 if(item!==undefined)list.push(item);
 const next=parseDetailedDraft(replace(config,path,list));
 return {config:next,focusPath:textPath([...path,index]),message,added};
}

/** Materialize the current inherited per-slot values only after an explicit UI action.
 * Preserve prior overrides (including disabled drafts) and all unrelated parameters.
 * Null curves keep the existing constant-power / linear-energy assumptions. */
export function prepareBatterySlotParameters(project:Project,config:DetailedConfig):AddedDetailedTemplate{
 const next=structuredClone(config),source={...project,detailed:next};let added=0;
 const expose=(slot:BatterySlotConfig)=>{if(slot.chargeBands===undefined)slot.chargeBands=null;if(slot.battery.energySOC===undefined)slot.battery.energySOC=null;};
 const materialize=(slots:BatterySlotConfig[],overrides:{enabled:boolean;slot:BatterySlotConfig}[])=>{
  for(const override of overrides)expose(override.slot);
  for(const slot of slots)if(!overrides.some(o=>o.slot.id===slot.id)){const copy=structuredClone(slot);expose(copy);overrides.push({enabled:true,slot:copy});added++;}
 };
 for(const station of ['A','B'] as const)materialize(compileTruckSlots(source,station),next.service.truckSlotOverrides);
 for(const passenger of next.service.passenger)materialize(compilePassengerSlots(passenger),passenger.slotOverrides);
 return {config:parseDetailedDraft(next),focusPath:'service.truckSlotOverrides',added,message:`已準備逐艙SOC／回充參數，新增${added}個繼承值覆寫；既有覆寫與啟用狀態保留。曲線null沿用固定回充功率及線性SOC／儲能假設，沒有代填實測曲線。新增覆寫會固定目前單艙數值，之後站級參數變更時請一併調整覆寫，或停用覆寫恢復繼承。`};
}
