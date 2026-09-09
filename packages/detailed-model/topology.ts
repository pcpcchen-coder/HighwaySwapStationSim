import type { Project,Topology,StationId } from '../contracts/index.ts';
import { augmentTopology } from '../detailed-network/topology.ts';
import { makeNode,equipmentRegistry } from '../../plugins/equipment/index.ts';

/** Materialize physical ports. This is an explicit design operation, never a
 * simulation-time rewrite of a user's edited topology. */
export function detailedTopology(p:Project,base:Topology):Topology{
 if(!p.detailed)return base;
 const c=p.detailed,t=augmentTopology(p,base,c.topology),{nodes,edges}=t;
 const add=(type:string,id:string,station:StationId,name:string,x:number,y:number,params:Record<string,number>,enabled:boolean)=>{const n=makeNode(type,id,station,x,y,params);n.name=name;n.enabled=enabled;nodes.push(n);};
 const link=(source:string,target:string)=>edges.push({id:`${source}>${target}`,source,target,enabled:true});
 for(const passenger of c.service.passenger){
  const s=passenger.station,body=nodes.find(n=>n.id===`${s}-passenger`);if(!body||!passenger.enabled)continue;
  body.type='passenger-station';body.name='CATL 巧克力站 · 完整營運';
  const x=body.x,y=2250,v=passenger.dcVoltageV??800;
  add('ac-load',`${s}-passenger-aux`,s,'乘用車站用電',x,y,{kw:Math.max(p.engineering?.passengerAuxKW??50,passenger.auxIdleKW??0)+(passenger.auxActiveKW??0)},true);link(body.id,`${s}-passenger-aux`);
  add('acdc',`${s}-passenger-charger`,s,'乘用車 AC/DC 充電',x,y+100,{kw:p.engineering?.passengerChargerKW??500,eta:passenger.chargerEfficiency??1,outputVoltage:v},true);link(body.id,`${s}-passenger-charger`);
  for(let i=0;i<passenger.slots;i++){const id=`${s}-passenger-rack-${i}`;add('passenger-rack',id,s,`巧克力電池倉 ${i+1}`,x+(i%3)*200,y+210+Math.floor(i/3)*100,{kw:passenger.batteryChargeKW??0,voltage:v},true);link(`${s}-passenger-charger`,id);}
 }
 for(const [i,store]of c.storage.entries()){
  const cfg=store.config,s=store.station,x=(s==='A'?20:1260)+(store.kind==='ESS'?0:420),y=3700+i%2*360;
  add(store.kind==='ESS'?'storage-source':'ups-source',`${store.id}-source`,s,`${store.kind} 儲存能源放電端`,x,y,{kw:cfg.dischargeEfficiency?((cfg.dischargeKW??0)/cfg.dischargeEfficiency):0},cfg.enabled);
  add(store.kind==='ESS'?'storage-converter':'dcac',`${store.id}-out`,s,`${store.kind} 放電轉換`,x+210,y,{kw:cfg.dischargeKW??0,eta:cfg.dischargeEfficiency??1},cfg.enabled);link(`${store.id}-source`,`${store.id}-out`);
  if(store.kind==='ESS')link(`${store.id}-out`,store.connectionNodeId);
  add(store.kind==='ESS'?'storage-converter':'acdc',`${store.id}-in`,s,`${store.kind} 充電轉換`,x,y+110,{kw:(cfg.chargeKW??0)*(cfg.chargeEfficiency??1),eta:cfg.chargeEfficiency??1},cfg.enabled);link(store.connectionNodeId,`${store.id}-in`);
  add('storage-sink',`${store.id}-sink`,s,`${store.kind} 儲存能源充電端`,x+210,y+110,{kw:(cfg.chargeKW??0)*(cfg.chargeEfficiency??1)},cfg.enabled);link(`${store.id}-in`,`${store.id}-sink`);
 }
 for(const solar of c.solar){const s=solar.station,x=s==='A'?20:1260,y=4550,cfg=solar.config;
  add('pv-source',`${solar.id}-source`,s,'光伏可用直流發電',x,y,{kw:cfg.stcKW??0},cfg.enabled);
  add('mppt',`${solar.id}-mppt`,s,'MPPT 轉換',x+210,y,{kw:cfg.mpptOutputKW??0,eta:cfg.mpptEfficiency??1},cfg.enabled);link(`${solar.id}-source`,`${solar.id}-mppt`);link(`${solar.id}-mppt`,solar.connectionNodeId);
  if(solar.export){const e=solar.export;add('export-converter',`${solar.id}-export-converter`,s,'光伏併網逆變／升壓',x,y+110,{kw:e.converterKW??0,eta:e.efficiency??1},cfg.enabled&&e.enabled);link(e.connectionNodeId,`${solar.id}-export-converter`);add('grid-export',`${solar.id}-export`,s,'外售電量表',x+210,y+110,{kw:cfg.exportLimitKW??0},cfg.enabled&&e.enabled);link(`${solar.id}-export-converter`,`${solar.id}-export`);}
 }
 for(const backup of c.backup){const s=backup.station,x=(s==='A'?20:1260)+840,y=4250;
  add('ats',backup.id,s,'ATS · 先斷後接',x,y,{kw:backup.inverterKW??10000},backup.config.enabled);
  const source=nodes.find(n=>n.id===backup.backupNodeId),domain=source?equipmentRegistry.get(source.type).ports(source).find(p=>p.direction==='output')?.domain:'DC';
  if(domain==='DC'){add('dcac',`${backup.id}-inverter`,s,'DC/AC 備援',x,y-110,{kw:backup.inverterKW??0,eta:backup.inverterEfficiency??1},backup.config.enabled);link(backup.backupNodeId,`${backup.id}-inverter`);link(`${backup.id}-inverter`,backup.id);}else link(backup.backupNodeId,backup.id);
  link(backup.normalNodeId,backup.id);
  if(backup.config.enabled)for(const load of backup.loadNodeIds){for(let i=edges.length-1;i>=0;i--)if(edges[i].target===load)edges.splice(i,1);link(backup.id,load);}
 }
 return t;
}
