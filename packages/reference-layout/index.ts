import type { Equipment, Topology } from '../contracts/index.ts';

/** Presentation only. Never add/remove nodes, edges, ratings or enabled states. */
export const REFERENCE_WIDTH=6800, NODE_WIDTH=250, NODE_HEIGHT=148;
export function referenceLayout(topology:Topology):Equipment[]{
 const positions=new Map<string,{x:number;y:number}>();
 const put=(s:string,id:string,x:number,y:number)=>positions.set(`${s}-${id}`,{x:s==='B'?REFERENCE_WIDTH-NODE_WIDTH-x:x,y});
 for(const s of ['A','B']){
  const fixed:Record<string,[number,number]>={grid:[900,80],incoming:[600,280],meter:[900,280],'out-transformer':[900,460],'out-sst':[1500,280],'sst-cable':[1500,460],transformer:[900,640],lv:[900,820],compensation:[600,820],pcs:[450,1000],passenger:[80,1800],'swap-bay':[900,1600],'sst-aux':[1200,820],'bus-sst':[1500,1200],'bus-pcs':[450,1420],'feed-sst':[2250,1200],'feed-pcs':[2250,1420],'bus-coupler':[1100,1320],stack:[2250,1800],ats:[2100,820]};
  for(const [id,[x,y]]of Object.entries(fixed))put(s,id,x,y);
  for(let i=0;i<2;i++){put(s,`load-switch-${i}`,1500+i*300,640);put(s,`sst-${i}`,1500+i*300,820);put(s,`terminal-${i}`,2100+i*300,2000);}
  for(let i=0;i<4;i++)put(s,`gun-${i}`,2100+i%2*300,2200+Math.floor(i/2)*180);
  // The screenshot places PCS bays 1–2 outward and SST bays 3–8 inward.
  for(const n of topology.nodes.filter(n=>n.station===s)){
   const m=n.id.match(/-(dd|rack)-(\d+)$/);if(!m)continue;
   const i=Number(m[2]),x=i<2?450+i*300:1150+(i-2)%3*300,y=(m[1]==='dd'?1800:2380)+(i<2?0:Math.floor((i-2)/3)*180);put(s,`${m[1]}-${i}`,x,y);
  }
  for(const kind of ['pcs','sst']){
   put(s,`dd-group-${kind}`,kind==='pcs'?600:1450,2180);
   const terminals=topology.nodes.filter(n=>n.id.startsWith(`${s}-swap-terminal-${kind}-`));
   for(const n of terminals){const i=Number(n.id.split('-').at(-1));put(s,`swap-terminal-${kind}-${i}`,kind==='pcs'?600:1150+i%3*300,2780+Math.floor(i/3)*560);}
   for(const n of topology.nodes.filter(n=>n.id.startsWith(`${s}-swap-gun-${kind}-`))){const i=Number(n.id.split('-').at(-1)),term=Math.floor(i/2);put(s,`swap-gun-${kind}-${i}`,kind==='pcs'?450+i%2*300:1150+term%3*300,2980+(kind==='pcs'?0:i%2*180)+Math.floor(term/3)*560);}
  }
  const optional:Record<string,[number,number]>={'ups-source':[2100,460],'ups-out':[2400,460],'ups-in':[2100,640],'ups-sink':[2400,640],'ats-inverter':[2400,820],'ess-source':[2800,1800],'ess-out':[3100,1800],'ess-in':[2800,2000],'ess-sink':[3100,2000],'pv-source':[2800,2380],'pv-mppt':[3100,2380],'pv-export-converter':[2800,2580],'pv-export':[3100,2580],'passenger-aux':[80,2000],'passenger-charger':[80,2200]};
  for(const [id,[x,y]]of Object.entries(optional))put(s,id,x,y);
  for(const n of topology.nodes.filter(n=>n.id.startsWith(`${s}-passenger-rack-`))){const i=Number(n.id.split('-').at(-1));put(s,`passenger-rack-${i}`,80,2400+i*180);}
 }
 // Each directional cable stays an individual node. Parallel lanes are not merged.
 for(const [id,x,y]of [['A-tie-sst',2800,1200],['B-tie-sst',3650,1200],['A-tie-pcs',2800,1420],['B-tie-pcs',3650,1420]] as const)positions.set(id,{x,y});
 const extra={A:0,B:0};
 const bottom=Math.max(3420,...[...positions.values()].map(p=>p.y+NODE_HEIGHT+80));
 return topology.nodes.map(n=>{let p=positions.get(n.id);if(!p){const i=extra[n.station]++;p={x:(n.station==='A'?80:REFERENCE_WIDTH/2+80)+(i%9)*300,y:bottom+Math.floor(i/9)*200};}return {...n,...p};});
}

export function referenceGroups(nodes:Equipment[]){
 const groups:{id:string;name:string;x:number;y:number;w:number;h:number;color:string}[]=[];
 const add=(id:string,name:string,test:(n:Equipment)=>boolean,color:string)=>{const a=nodes.filter(test);if(!a.length)return;const x=Math.min(...a.map(n=>n.x))-28,y=Math.min(...a.map(n=>n.y))-75;groups.push({id,name,x,y,w:Math.max(...a.map(n=>n.x+NODE_WIDTH))-x+28,h:Math.max(...a.map(n=>n.y+NODE_HEIGHT))-y+28,color});};
 for(const s of ['A','B']){
  add(`${s}-swap`,`${s} 重卡換電站 · DD／電池艙／外接槍`,n=>n.station===s&&(/-(dd-\d|rack-\d|dd-group|swap-terminal|swap-gun)/.test(n.id)||n.id===`${s}-swap-bay`),'#16834b');
  add(`${s}-super`,`${s} 獨立超充堆 · 終端／充電槍`,n=>n.station===s&&/-(stack|terminal-\d|gun-\d)$/.test(n.id),'#8053b6');
  add(`${s}-passenger`,`${s} CATL 巧克力換電站`,n=>n.station===s&&/-passenger/.test(n.id),'#64748b');
  add(`${s}-backup`,`${s} UPS／ATS 備援（依設定啟用）`,n=>n.station===s&&/-(ups-|ats)/.test(n.id),'#8053b6');
 }
 add('renewables','可擴展儲能／光伏 · 各端口依設定啟用',n=>/-(ess-|pv-)/.test(n.id),'#8053b6');
 return groups;
}

/** Orthogonal wires shared by both screens; every path comes from a real edge. */
export function referenceWire(a:Equipment,b:Equipment){
 const w=NODE_WIDTH,h=NODE_HEIGHT;
 const horizontal=Math.abs(a.y-b.y)<h,forward=b.x>a.x;
 const ax=horizontal?a.x+(forward?w:0):a.x+w/2,ay=horizontal?a.y+h/2:a.y+(b.y>a.y?h:0);
 const bx=horizontal?b.x+(forward?0:w):b.x+w/2,by=horizontal?b.y+h/2:b.y+(b.y>a.y?0:h);
 // The MV cross-service feeder is routed above the converter cabinets.
 if(a.id==='A-meter'&&b.id==='B-out-sst')return {path:`M${a.x+w},${a.y+30} V220 H${b.x+w/2} V${b.y}`,x:(a.x+b.x)/2,y:210};
 // Keep opposing DC interties on separate lanes; crossing is not a junction.
 const tie=/-tie-(sst|pcs)$/.test(a.id)?a:/-tie-(sst|pcs)$/.test(b.id)?b:null;
 const lane=tie?(tie.id.startsWith('A-')?36:112):h/2;
 const path=horizontal?`M${ax},${a.y+lane} H${(ax+bx)/2} V${b.y+lane} H${bx}`:`M${ax},${ay} V${(ay+by)/2} H${bx} V${by}`;
 return {path,x:(ax+bx)/2,y:horizontal?a.y+lane-10:(ay+by)/2-8};
}
