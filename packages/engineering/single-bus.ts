import type {Equipment, Project, StationId, Topology} from '../contracts/index.ts';
import {makeNode} from '../../plugins/equipment/index.ts';

export const ACDC_DEFAULT_EFFICIENCY = 0.9535;
export const isSingleBus = (p:Project) => p.detailed?.topology.architecture === 'SINGLE_BUS';

/** First-phase physical inventory. Two source collectors and two destination
 * feeders represent ONE shared DC network without introducing directed cycles.
 * Each source retains its own SST capacity; there is no PCS-backed DC network.
 */
export function singleBusBase(p:Project):Topology {
 const nodes:Equipment[]=[],edges:Topology['edges']=[],c=p.engineering!;
 const add=(s:StationId,type:string,id:string,name:string,params:Record<string,number>={})=>{
  const node=makeNode(type,`${s}-${id}`,s,0,0,params);node.name=name;nodes.push(node);
 };
 const link=(source:string,target:string)=>edges.push({id:`${source}>${target}`,source,target,enabled:true});
 for(const s of ['A','B'] as const){
  const st=p.station[s];
  add(s,'grid','grid','10 kV 電力接入',{kva:s==='A'?6000:2500,pf:.99});
  add(s,'mv-switch','incoming','進線櫃');add(s,'meter','meter','計量櫃');
  link(`${s}-grid`,`${s}-incoming`);link(`${s}-incoming`,`${s}-meter`);
  add(s,'mv-switch','out-transformer','箱變出線櫃',{kw:2475});
  add(s,'transformer','transformer','箱變 10 / 0.4 kV',{kva:2500,pf:.99,outputEfficiency:p.efficiency.transformer});
  add(s,'lv-bus','lv','AC 400 V 饋線',{kw:2500});
  link(`${s}-meter`,`${s}-out-transformer`);link(`${s}-out-transformer`,`${s}-transformer`);link(`${s}-transformer`,`${s}-lv`);
  add(s,'mv-switch','out-sst','SST 出線櫃',{kw:1750*.99});
  add(s,'mv-cable','sst-cable',s==='B'?'A 區供電 · 跨區 AC 10 kV':'站內 SST 饋線',{kva:1750,length:s==='B'?150:0});
  add(s,'mv-switch','load-switch-0','SST 負荷開關');add(s,'sst','sst-0','SST · 第一期',{kw:1680});
  link('A-meter',`${s}-out-sst`);link(`${s}-out-sst`,`${s}-sst-cable`);link(`${s}-sst-cable`,`${s}-load-switch-0`);link(`${s}-load-switch-0`,`${s}-sst-0`);
  add(s,'bus','bus-sst',`公共 DC 800 V · ${s} 側電源端`);
  add(s,'bus','feed-sst',`公共 DC 800 V · ${s} 側用電端`);
  link(`${s}-sst-0`,`${s}-bus-sst`);link(`${s}-bus-sst`,`${s}-feed-sst`);
  add(s,'passenger','passenger','CATL 巧克力換電站',{kw:c.passengerChargerKW+c.passengerAuxKW});
  add(s,'swap-bay','swap-bay','重卡換電站輔助負載',{kw:st.auxiliaryKW});
  add(s,'ac-load','sst-aux','SST 運行負載',{kw:10});
  for(const id of ['passenger','swap-bay','sst-aux'])link(`${s}-lv`,`${s}-${id}`);
  for(let i=0;i<st.batteries;i++){
   const ac=i<c.pcsSlotsPerSite;
   add(s,ac?'acdc':'charger',`dd-${i}`,`${ac?'AC/DC':'DC/DC'} 充電機 ${i+1}`,{kw:st.batteryChargeKW,...(ac?{eta:ACDC_DEFAULT_EFFICIENCY}:{})});
   add(s,'rack',`rack-${i}`,`電池倉 ${i+1} · ${ac?'AC':'DC'}`,{kw:st.batteryChargeKW,kWh:st.capacityKWh});
   link(`${s}-${ac?'lv':'feed-sst'}`,`${s}-dd-${i}`);link(`${s}-dd-${i}`,`${s}-rack-${i}`);
  }
 }
 // Directional accounting paths; their common upstream SST ledger prevents
 // double counting. The policy derives each transfer limit from live SSTs.
 for(const [s,t] of [['A','B'],['B','A']] as const){
  add(s,'dc-cable','tie-sst',`${s} → ${t} 公共母線支援`,{kw:1680,length:150});
  const node=nodes.at(-1)!;node.enabled=c.intertie;
  link(`${s}-bus-sst`,`${s}-tie-sst`);link(`${s}-tie-sst`,`${t}-feed-sst`);
 }
 return {nodes,edges};
}
