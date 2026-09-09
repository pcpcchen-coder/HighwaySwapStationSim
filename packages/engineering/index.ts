import { detailedTopology } from '../detailed-model/topology.ts';
import type { Project, Topology, StationId, Equipment, EngineeringConfig } from '../contracts/index.ts';
import { defaultProject } from '../reference/index.ts';
import { makeNode } from '../../plugins/equipment/index.ts';
export const CATL_SOURCE = 'https://www.catl.com/brand/servicebrand/';
export const truckPacks = [
 {kWh:400.61,ah:324,current:'300 A × 2',voltage:618.24,minV:480,maxV:700.8},
 {kWh:513,ah:268,current:'300 A × 2',voltage:637.56,minV:495,maxV:722.7},
 {kWh:528.13,ah:268,current:'300 A × 2 / 400 A × 2',voltage:656.88,minV:510,maxV:744.6},
 {kWh:600.92,ah:324,current:'300 A × 2 / 450 A × 2',voltage:618.24,minV:480,maxV:700.8},
 {kWh:704.17,ah:268,current:'268 A × 4 / 536 A × 2',voltage:656.88,minV:510,maxV:744.6},
 {kWh:801.23,ah:324,current:'300 A × 4 / 600 A × 2',voltage:618.24,minV:480,maxV:700.8},
];
export const engineeringDefaults = ():EngineeringConfig => ({profile:'SUPPLEMENT_513',pcsSlotsPerSite:2,intertie:true,simultaneity:.6,packVoltage:637.56,passengerSlots:14,passengerSwapSeconds:99,passengerChargerKW:500,passengerAuxKW:50,passengerLoadFactor:.5,truckAuxLoadFactor:.5});
/** Source capacity worksheet. All powers at their stated boundary, not an EMS time series. */
export function capacityCase(p:Project) {
 const c=p.engineering??engineeringDefaults(), station=p.station.A, energy=station.capacityKWh*(station.readySOC-station.returnSOC);
 const transformer=p.topology.nodes.find(n=>n.id==='A-transformer')!, pcs=p.topology.nodes.find(n=>n.id==='A-pcs')!;
 const kva=transformer?.params.kva??2500,pf=transformer?.params.pf??.99;
 const transformerOutput=kva*pf*p.efficiency.transformer;
 const ac=c.passengerChargerKW+c.passengerAuxKW+station.auxiliaryKW+p.phase*10;
 const pcsInput=Math.max(0,transformerOutput-ac), pcsOutput=Math.min(pcs?.params.kw??2000,pcsInput*p.efficiency.pcs);
 const ddInput=energy/p.efficiency.charger;
 const residuals=[0,1,2,3].map(slots=>({slots,ddInput:slots*ddInput,residual:Math.max(0,pcsOutput-slots*ddInput),configured:Math.max(0,pcsOutput-slots*ddInput)/c.simultaneity}));
 const totalStack=p.station.A.chargePoolKW+p.station.B.chargePoolKW;
 const combinedResidual=2*Math.max(0,pcsOutput-c.pcsSlotsPerSite*ddInput);
 return {energy,ddInput,hourlyBattery:8*energy,hourlyDD:8*ddInput,twoSST:3360,sstDeficit:8*ddInput-3360,sustainableSST:3360*p.efficiency.charger/energy,transformerOutput,ac,pcsInput,pcsOutput,residuals,totalStack,combinedResidual,
  concurrency:[.6,.7,.8,.9,1].map(factor=>({factor,request:totalStack*factor,available:combinedResidual*p.efficiency.charger,deficit:Math.max(0,totalStack*factor-combinedResidual*p.efficiency.charger)})),
  gunLimit:Math.min(station.gunKW,c.packVoltage*600/1000),
  allocationRows:[0,1,2,3].map(n=>({sstSlots:16-2*n,pcsSlots:2*n,sourceSST:8,sourcePCS:2*n,sourceTotal:8+2*n,energyUpper:Math.min(16,3360*p.phase*p.efficiency.charger/energy+2*n)}))};
}
/** Detailed physical equipment. SST sources share bus 1; PCS sources share bus 2 through feeder branches.
 * Cross links connect source bus to opposite feeder, never short independent AC grids.
 */
export function engineeringTopology(p:Project):Topology {
 const c=p.engineering??engineeringDefaults(); const nodes:Equipment[]=[],edges:Topology['edges']=[];
 const add=(s:StationId,type:string,id:string,x:number,y:number,name:string,params:Record<string,number>={},enabled=true)=>{const n=makeNode(type,`${s}-${id}`,s,x+(s==='B'?1240:20),y,params);n.name=name;n.enabled=enabled;nodes.push(n);return n.id;};
 const link=(source:string,target:string,enabled=true)=>edges.push({id:`${source}>${target}`,source,target,enabled});
 for(const s of ['A','B'] as const){
  const st=p.station[s];
  add(s,'grid','grid',0,60,'10 kV 電力接入',{kva:s==='A'?(p.phase===1?6000:9500):2500,pf:.99});
  add(s,'mv-switch','incoming',210,60,'進線櫃');add(s,'meter','meter',420,60,'計量櫃');
  link(`${s}-grid`,`${s}-incoming`);link(`${s}-incoming`,`${s}-meter`);
  add(s,'mv-switch','out-sst',0,165,'SST 出線櫃',{kw:1750*p.phase*.99});
  add(s,'mv-switch','out-transformer',630,165,'箱變出線櫃',{kw:2475});link(`${s}-meter`,`${s}-out-transformer`);
  if(s==='A')link('A-meter','A-out-sst');
  add(s,'mv-cable','sst-cable',0,260,s==='B'?'跨區 AC 10 kV · 150 m':'站內 SST 饋線',{kva:1750*p.phase,length:s==='B'?150:0});
  link(`${s}-out-sst`,`${s}-sst-cable`);
  add(s,'transformer','transformer',630,260,'箱變 10 / 0.4 kV',{kva:2500,pf:.99,outputEfficiency:p.efficiency.transformer});link(`${s}-out-transformer`,`${s}-transformer`);
  for(let i=0;i<2;i++){add(s,'mv-switch',`load-switch-${i}`,i*210,365,`SST 負荷開關 ${i+1}`,{},i<p.phase);add(s,'sst',`sst-${i}`,i*210,455,`SST ${i+1}${i>=p.phase?' · 預留':''}`,{kw:1680},i<p.phase);link(`${s}-sst-cable`,`${s}-load-switch-${i}`);link(`${s}-load-switch-${i}`,`${s}-sst-${i}`);}
  add(s,'lv-bus','lv',630,365,'低壓饋線 AC 400 V',{kw:2500});link(`${s}-transformer`,`${s}-lv`);
  add(s,'compensation','compensation',840,365,'功率補償櫃');link(`${s}-lv`,`${s}-compensation`);
  add(s,'passenger','passenger',840,465,'CATL 巧克力換電站',{kw:c.passengerChargerKW+c.passengerAuxKW,slots:c.passengerSlots,swapSeconds:c.passengerSwapSeconds});link(`${s}-lv`,`${s}-passenger`);
  add(s,'swap-bay','swap-bay',840,565,'重卡換電工位',{kw:st.auxiliaryKW});link(`${s}-lv`,`${s}-swap-bay`);
  add(s,'ac-load','sst-aux',840,655,'SST / UPS 運行負載',{kw:10*p.phase});link(`${s}-lv`,`${s}-sst-aux`);
  add(s,'pcs','pcs',630,465,'PCS AC 400 / DC 800',{kw:2000});link(`${s}-lv`,`${s}-pcs`);
  add(s,'bus','bus-sst',0,565,'DC 800 V 母線 1');add(s,'bus','bus-pcs',420,565,'DC 800 V 母線 2');link(`${s}-pcs`,`${s}-bus-pcs`);
  for(let i=0;i<2;i++)link(`${s}-sst-${i}`,`${s}-bus-sst`);
  add(s,'dc-switch','feed-sst',0,680,'母線 1 · 分段饋線');add(s,'dc-switch','feed-pcs',420,680,'母線 2 · 分段饋線');link(`${s}-bus-sst`,`${s}-feed-sst`);link(`${s}-bus-pcs`,`${s}-feed-pcs`);
  for(let i=0;i<st.batteries;i++){const col=i%4,row=Math.floor(i/4),x=col*210;const pcs=i>=st.batteries-c.pcsSlotsPerSite;
   add(s,'charger',`dd-${i}`,x,800+row*185,`DD ${i+1} · ${pcs?'PCS':'SST'}`,{kw:st.batteryChargeKW});
   add(s,'rack',`rack-${i}`,x,885+row*185,`電池倉 ${i+1}`,{kw:st.batteryChargeKW,kWh:st.capacityKWh});link(`${s}-${pcs?'feed-pcs':'feed-sst'}`,`${s}-dd-${i}`);link(`${s}-dd-${i}`,`${s}-rack-${i}`);
  }
  const end=850+Math.ceil(st.batteries/4)*185;
  add(s,'charger','stack',210,end,'DD 超充堆',{kw:st.chargePoolKW});link(`${s}-feed-pcs`,`${s}-stack`);
  for(let i=0;i<Math.ceil(st.guns/2);i++){add(s,'terminal',`terminal-${i}`,(i%2)*420,end+105+Math.floor(i/2)*210,`液冷雙槍終端 ${i+1}`,{kw:960});link(`${s}-stack`,`${s}-terminal-${i}`);}
  for(let i=0;i<st.guns;i++){add(s,'gun',`gun-${i}`,(i%4)*210,end+210+Math.floor(i/4)*210,`充電槍 ${i+1}`,{kw:st.gunKW,vehicleVoltage:c.packVoltage});link(`${s}-terminal-${Math.floor(i/2)}`,`${s}-gun-${i}`);}
 }
 // A metering feeds B SST independently of grid B.
 link('A-meter','B-out-sst');
 for(const [s,t] of [['A','B'],['B','A']] as const)for(const kind of ['sst','pcs']){add(s,'dc-cable',`tie-${kind}`,1030,kind==='sst'?710:810,`跨站母聯 ${kind==='sst'?'1':'2'}`,{length:150},c.intertie);link(`${s}-bus-${kind}`,`${s}-tie-${kind}`,c.intertie);link(`${s}-tie-${kind}`,`${t}-feed-${kind}`,c.intertie);}
 return p.detailed?detailedTopology(p,{nodes,edges}):{nodes,edges};
}
export function engineeringProject():Project {
 const p=defaultProject();p.name='513 kWh · 完整雙站設備案例';p.engineering=engineeringDefaults();
 p.efficiency={...p.efficiency,mode:'ASSEMBLY',sst:.98,transformer:.98,pcs:.98,charger:.974};
 for(const s of ['A','B'] as const)p.station[s]={batteries:8,capacityKWh:513,readySOC:1,returnSOC:.2,bays:1,swapMinutes:7.5,guns:4,gunKW:480,chargePoolKW:1440,batteryChargeKW:560,auxiliaryKW:200};
 // Keep original 410 kWh source replay immutable until user explicitly loads the physical projection.
 p.topology=engineeringTopology(p);p.sources.push({id:'SRC-SUPPLEMENT-01..06',status:'SOURCE_TRANSCRIBED',note:'513 kWh、8倉、560 kW/DD、2×1440 kW；0.6為裝機同動率，不增加供電'},{id:'CATL-CHOCO-OFFICIAL',status:'OFFICIAL',note:CATL_SOURCE+'；14–30倉、99秒；500+50 kW為附件配置，非CATL官方額定'});return p;
}
export function physicalProjection(p:Project):Project {const next=structuredClone(p);next.mode='CONSTRAINED';next.name=`${p.station.A.capacityKWh} kWh · SOC 補電投影`;for(const row of next.services){const st=next.station[row.station];row.swapKWh=row.swapCount*st.capacityKWh*(st.readySOC-st.returnSOC);}next.sources.push({id:'DERIVED-SOC-PROJECTION',status:'DERIVED',note:'保留原始車次/充電kWh；僅按目前SOC窗口重新計算換電需求'});return next;}
