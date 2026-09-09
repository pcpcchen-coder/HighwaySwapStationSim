import type {Project} from '../contracts/index.ts';
import {parseDetailedDraft} from './schema.ts';
import {validatePhysicalReady} from '../physical-models/schema.ts';
import {equipmentRegistry} from '../../plugins/equipment/index.ts';
import {supportsEfficiency} from '../equipment-efficiency/index.ts';
import {compileFleet} from './services.ts';
import {validateFleetConfig} from '../service-fleet/index.ts';
export interface ReadinessIssue {path:string;message:string;}
/** Missing data are stored in drafts and surfaced by path before simulation. */
export function detailedReadiness(p:Project):ReadinessIssue[]{
 if(!p.detailed)return[];const issues:ReadinessIssue[]=[];
 try{parseDetailedDraft(p.detailed);}catch(e){return[{path:'detailed',message:String(e)}];}
 const c=p.detailed,known=(v:unknown,path:string)=>{if(v===null||v===undefined)issues.push({path,message:'啟用中的模型缺少必要數值'});},exists=(id:string)=>{if(!p.topology.nodes.some(n=>n.id===id))issues.push({path:id,message:'設備不存在；請套用並重建拓撲'});};
 for(const m of c.physics){if(!p.topology.nodes.some(n=>n.id===m.nodeId)&&![m.cable,m.curve,m.transformer,m.thermal,m.compensation,m.protection].some(x=>x.enabled)&&m.currentLimitA===null&&m.rampKWPerMinute===null&&!m.faultSchedule.length)continue;exists(m.nodeId);const node=p.topology.nodes.find(n=>n.id===m.nodeId);if(m.transformer.enabled&&node?.type!=='transformer')issues.push({path:m.nodeId,message:'箱變模型只能用於箱變設備'});if(m.compensation.enabled&&!['transformer','compensation'].includes(node?.type??''))issues.push({path:m.nodeId,message:'補償須指定箱變或同站補償櫃；櫃模型作用於該站箱變'});if(m.cable.enabled&&(m.curve.enabled||m.transformer.enabled||m.compensation.enabled))issues.push({path:m.nodeId,message:'線纜阻抗模型不得同時套用轉換／補償模型'});for(const [key,kind] of [['cable','cable'],['thermal','thermal'],['curve','converter'],['transformer','transformer'],['compensation','compensation'],['protection','protection']] as const)for(const i of validatePhysicalReady(kind,m[key]))issues.push({path:`${m.nodeId}.${i.field}`,message:i.message});
  if(m.thermal.enabled){known(m.temperatureC,`${m.nodeId}.temperatureC`);known(m.ambientC,`${m.nodeId}.ambientC`);}
  if(m.curve.enabled)known(m.temperatureC,`${m.nodeId}.temperatureC`);
  if(m.loadPowerFactor!==null&&m.loadPowerFactor<=0)issues.push({path:m.nodeId,message:'負載功率因數必須大於0'});
  if(m.transformer.enabled||m.compensation.enabled)known(m.loadPowerFactor,`${m.nodeId}.loadPowerFactor`);
  if(m.compensation.enabled&&node?.type==='transformer'&&c.physics.some(other=>other.compensation.enabled&&p.topology.nodes.some(n=>n.id===other.nodeId&&n.type==='compensation'&&n.station===node.station)))issues.push({path:m.nodeId,message:'同一箱變只可啟用一套補償參數'});
  if(m.curve.enabled&&m.transformer.enabled)issues.push({path:m.nodeId,message:'箱變損耗模型與效率曲線互斥，不得重複套用'});
  for(const f of m.faultSchedule){known(f.currentA,`${m.nodeId}.fault.currentA`);if(f.toMinute<=f.fromMinute)issues.push({path:m.nodeId,message:'故障事件終點須大於起點'});}
 }
 for(const s of c.storage)if(s.config.enabled){for(const kind of ['storage','storagePolicy'] as const)for(const i of validatePhysicalReady(kind,kind==='storage'?s.config:s.policy))issues.push({path:`${s.id}.${i.field}`,message:i.message});known(s.initialSOC,`${s.id}.initialSOC`);known(s.initialSOH,`${s.id}.initialSOH`);exists(s.connectionNodeId);exists(`${s.id}-source`);if(s.initialSOC!==null&&s.config.minSOC!==null&&s.config.maxSOC!==null&&(s.initialSOC<s.config.minSOC||s.initialSOC>s.config.maxSOC))issues.push({path:s.id,message:'初始 SOC 超出儲能操作窗口'});}
 for(const s of c.solar)if(s.config.enabled){for(const i of validatePhysicalReady('pv',s.config))issues.push({path:`${s.id}.${i.field}`,message:i.message});exists(s.connectionNodeId);exists(`${s.id}-source`);if(s.profile[0]?.atMinute!==0)issues.push({path:s.id,message:'光伏時序須從第 0 分鐘起算'});for(const row of s.profile){known(row.irradianceWm2,`${s.id}.${row.atMinute}.irradiance`);known(row.cellTemperatureC,`${s.id}.${row.atMinute}.temperature`);}}
 for(const s of c.solar)if(s.config.enabled&&s.export?.enabled){exists(`${s.id}-export`);exists(s.export.connectionNodeId);known(s.export.gridSourceId,`${s.id}.export.gridSourceId`);if(s.export.gridSourceId&&!p.topology.nodes.some(n=>n.id===s.export!.gridSourceId&&n.type==='grid'))issues.push({path:s.id,message:'外售電表須指定電網接入點'});known(s.export.converterKW,`${s.id}.export.converterKW`);known(s.export.efficiency,`${s.id}.export.efficiency`);known(s.export.unitPrice,`${s.id}.export.unitPrice`);}
 for(const b of c.backup)if(b.config.enabled){for(const i of validatePhysicalReady('ats',b.config))issues.push({path:`${b.id}.${i.field}`,message:i.message});exists(b.id);exists(b.normalNodeId);exists(b.backupNodeId);b.loadNodeIds.forEach(exists);if(p.topology.nodes.some(n=>n.id===`${b.id}-inverter`)){known(b.inverterKW,`${b.id}.inverterKW`);known(b.inverterEfficiency,`${b.id}.inverterEfficiency`);}}
 for(const tie of c.topology.busTies)if(tie.enabled)known(tie.kw,`${tie.station}.busTie.kw`);
 for(const load of c.loads){exists(load.nodeId);known(load.idleKW,`${load.nodeId}.idleKW`);known(load.perActiveJobKW,`${load.nodeId}.perActiveJobKW`);if(load.hourlyKW){if(load.hourlyKW.length!==24&&load.hourlyKW.length!==24*p.horizonDays)issues.push({path:load.nodeId,message:'負載時序須為24小時重複或全期每小時一值'});load.hourlyKW.forEach((v,i)=>known(v,`${load.nodeId}.hourlyKW.${i}`));}}
 // These converters share one efficiency with their owning state model. A
 // topology-only construction event cannot mutate that state model's contract.
 const ownedEta=new Map<string,number|null>();
 for(const s of c.storage)if(s.config.enabled){ownedEta.set(`${s.id}-in`,s.config.chargeEfficiency);ownedEta.set(`${s.id}-out`,s.config.dischargeEfficiency);}
 for(const s of c.solar)if(s.config.enabled){ownedEta.set(`${s.id}-mppt`,s.config.mpptEfficiency);if(s.export?.enabled)ownedEta.set(`${s.id}-export-converter`,s.export.efficiency);}
 for(const pc of c.service.passenger)if(pc.enabled)ownedEta.set(`${pc.station}-passenger-charger`,pc.chargerEfficiency);
 for(const b of c.backup)if(b.config.enabled)ownedEta.set(`${b.id}-inverter`,b.inverterEfficiency);
 for(const event of c.construction){if(ownedEta.has(event.equipmentId)&&Object.hasOwn(event.params,'eta')){const expected=ownedEta.get(event.equipmentId);if(expected===null||expected===undefined||Math.abs(event.params.eta-expected)>1e-10)issues.push({path:`construction.${event.equipmentId}.params.eta`,message:'施工事件不可單獨變更儲能／光伏／乘用車／備援模型的轉換效率；請修改所屬模型並重建拓撲後另行測算'});}const node=p.topology.nodes.find(n=>n.id===event.equipmentId);if(!node){issues.push({path:event.equipmentId,message:'施工事件設備不存在'});continue;}const allowed=new Set(equipmentRegistry.get(node.type).parameters.map(p=>p.key));if(supportsEfficiency(node.type))allowed.add('efficiency');for(const key of Object.keys(event.params))if(!allowed.has(key))issues.push({path:`${event.equipmentId}.params.${key}`,message:'施工事件不可覆寫未實作的參數'});}
 for(const g of c.dispatch.gridLimits){exists(g.sourceId);known(g.kw,`${g.sourceId}.gridLimit`);const node=p.topology.nodes.find(n=>n.id===g.sourceId);if(node&&node.type!=='grid')issues.push({path:`dispatch.gridLimits.${g.sourceId}`,message:'電網限額只能指定電網接入點；設備限額請設定該設備功率或物理限制'});}
 if(p.strategy==='TOU'){known(c.dispatch.chargeBelow,'dispatch.chargeBelow');known(c.dispatch.reserveReadyPacks,'dispatch.reserveReadyPacks');known(c.dispatch.forecastMinutes,'dispatch.forecastMinutes');}

 const matchEta=(nodeId:string,eta:number|null)=>{const node=p.topology.nodes.find(n=>n.id===nodeId);if(node&&eta!==null&&Math.abs(node.params.eta-eta)>1e-10)issues.push({path:nodeId,message:'轉換效率與完整模型設定不同；請套用並重建設備連接，或同步兩處效率後再測算'});};
 for(const s of c.storage)if(s.config.enabled){matchEta(`${s.id}-in`,s.config.chargeEfficiency);matchEta(`${s.id}-out`,s.config.dischargeEfficiency);}
 for(const s of c.solar)if(s.config.enabled){matchEta(`${s.id}-mppt`,s.config.mpptEfficiency);if(s.export?.enabled)matchEta(`${s.id}-export-converter`,s.export.efficiency);}
 for(const pc of c.service.passenger)if(pc.enabled)matchEta(`${pc.station}-passenger-charger`,pc.chargerEfficiency);
 for(const b of c.backup)if(b.config.enabled)matchEta(`${b.id}-inverter`,b.inverterEfficiency);
 try{const fleet=compileFleet(p);validateFleetConfig(fleet);
  // Reserve actual service sinks, including user-overridden slot connections.
  // Equipment type alone is insufficient: an unrelated rack may be a test load.
  const serviceSinks=new Set([...fleet.swaps.filter(f=>f.enabled).flatMap(f=>f.slots.map(s=>s.sink)),...fleet.guns.map(g=>g.sink)]);
  for(const pc of c.service.passenger)if(pc.enabled)serviceSinks.add(`${pc.station}-passenger-aux`);
  for(const load of c.loads)if(serviceSinks.has(load.nodeId))issues.push({path:`loads.${load.nodeId}`,message:'自訂輔助負載不可重用電池倉、充電槍或自動乘用車站用電端點；請建立獨立負載節點'});
 }catch(e){issues.push({path:'service',message:e instanceof Error?e.message:String(e)});}
 return issues;
}
