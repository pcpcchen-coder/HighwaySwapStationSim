import type { Project, Topology, StationId } from '../contracts/index.ts';
import { makeNode } from '../../plugins/equipment/index.ts';

export interface TopologyOptions {
 /** Absent preserves historical saved designs. */
 architecture?: 'SINGLE_BUS';
 sharedDD: boolean;
 sharingMode: 'SIMULTANEOUS' | 'EXCLUSIVE';
 pcsRatingKW: number;
 /** Explicit installed terminals, independent of how many DDs feed the group.
  * Missing on old files means the legacy ceil(DD / 2) preset. */
 swapTerminalCounts?: { pcs: number; sst: number };
 busTies: { station: StationId; enabled: boolean; direction: 'SST_TO_PCS' | 'PCS_TO_SST'; kw: number | null }[];
}
export function defaultTopologyOptions(): TopologyOptions {
 return { sharedDD:true, sharingMode:'EXCLUSIVE', pcsRatingKW:1600, busTies:(['A','B'] as const).map(station=>({station,enabled:false,direction:'SST_TO_PCS',kw:null})) };
}
/** Rack numbering starts with the configured PCS count, then SST. DD outputs
 * share a finite pool; adding guns does not add upstream power. */
export function augmentTopology(project: Project, base: Topology, options: TopologyOptions): Topology {
 const topology=structuredClone(base),{nodes,edges}=topology;
 const add=(s:StationId,type:string,id:string,name:string,x:number,y:number,params:Record<string,number>)=>{
  if(nodes.some(n=>n.id===id))return;
  const n=makeNode(type,id,s,x,y,params);n.name=name;nodes.push(n);
 };
 const link=(source:string,target:string,enabled=true)=>{const id=`${source}>${target}`;if(!edges.some(e=>e.id===id))edges.push({id,source,target,enabled});};
 for(const s of ['A','B'] as const){
  const offset=s==='A'?20:1260,st=project.station[s],pcs=project.engineering?.pcsSlotsPerSite??2;
  const converter=nodes.find(n=>n.id===`${s}-pcs`);if(converter)converter.params.kw=options.pcsRatingKW;
  for(let i=0;i<st.batteries;i++){
   const id=`${s}-dd-${i}`,n=nodes.find(n=>n.id===id);if(!n)continue;
   n.name=options.architecture==='SINGLE_BUS'?`${i<pcs?'AC/DC':'DC/DC'} 充電機 ${i+1}`:`DD ${i+1} · ${i<pcs?'PCS':'SST'}`;
   for(const e of edges)if(e.target===id&&(e.source===`${s}-feed-pcs`||e.source===`${s}-feed-sst`))e.source=`${s}-feed-${i<pcs?'pcs':'sst'}`;
  }
  if(options.sharedDD)for(const kind of ['pcs','sst'] as const){
   const indices=Array.from({length:st.batteries},(_,i)=>i).filter(i=>kind==='pcs'?i<pcs:i>=pcs);
   if(!indices.length)continue;
   const group=`${s}-dd-group-${kind}`,x=offset+(kind==='pcs'?0:420),y=1630;
   const label=options.architecture==='SINGLE_BUS'?(kind==='pcs'?'AC':'DC'):kind.toUpperCase();
   add(s,'sharing-group',group,`${label} 換電／外充共享組`,x,y,{kw:indices.length*st.batteryChargeKW});
   for(const i of indices){
    const direct=edges.findIndex(e=>e.source===`${s}-dd-${i}`&&e.target===`${s}-rack-${i}`);if(direct>=0)edges.splice(direct,1);
    link(`${s}-dd-${i}`,group);link(group,`${s}-rack-${i}`);
   }
   for(let i=0;i<(options.swapTerminalCounts?.[kind]??Math.ceil(indices.length/2));i++){
    const terminal=`${s}-swap-terminal-${kind}-${i}`;
    add(s,'terminal',terminal,`換電站雙槍終端 ${label} ${i+1}`,x+(i%2)*210,y+120+Math.floor(i/2)*220,{kw:960});link(group,terminal);
    for(let j=0;j<2;j++){const gun=`${s}-swap-gun-${kind}-${i*2+j}`;
     add(s,'gun',gun,`換電站外接槍 ${label} ${i*2+j+1}`,x+(i%2)*210+j*95,y+205+Math.floor(i/2)*220,{kw:st.gunKW,vehicleVoltage:project.engineering?.packVoltage??637.56});link(terminal,gun);
    }
   }
  }
  const tie=options.busTies.find(t=>t.station===s);
  if(tie&&options.architecture!=='SINGLE_BUS'){const id=`${s}-bus-coupler`;add(s,'dc-switch',id,'同側 DC 母聯（受控方向）',offset+1030,965,{kw:tie.kw??0});nodes.find(n=>n.id===id)!.enabled=tie.enabled;
   const from=tie.direction==='SST_TO_PCS'?'sst':'pcs',to=from==='sst'?'pcs':'sst';link(`${s}-bus-${from}`,id,tie.enabled);link(id,`${s}-feed-${to}`,tie.enabled);
  }
 }
 // IDs remain stable and independent from any rewired endpoint text.
 return topology;
}
