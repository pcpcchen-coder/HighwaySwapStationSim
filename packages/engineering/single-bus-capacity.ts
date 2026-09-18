import type {Project} from '../contracts/index.ts';
import {equipmentEfficiency} from '../equipment-efficiency/index.ts';
import {outputCapacity} from '../electrical-engine/index.ts';

/** Nameplate check, not a claim of simultaneous service or a dispatch result. */
export function singleBusCapacity(p:Project){
 const active=p.topology.nodes.filter(n=>n.enabled);
 const sites=(['A','B'] as const).map(station=>{
  const nodes=active.filter(n=>n.station===station),ac=nodes.filter(n=>n.type==='acdc'&&/-dd-\d+$/.test(n.id)),dc=nodes.filter(n=>n.type==='charger'&&/-dd-\d+$/.test(n.id));
  const transformer=nodes.find(n=>n.id===`${station}-transformer`),sst=nodes.filter(n=>n.type==='sst');
  const sum=(items:typeof nodes)=>items.reduce((v,n)=>v+outputCapacity(p,n),0);
  const acOutputKW=sum(ac),acInputKW=ac.reduce((v,n)=>v+outputCapacity(p,n)/equipmentEfficiency(p,n),0);
  const transformerOutputKW=transformer?outputCapacity(p,transformer):0;
  const auxNameplateKW=nodes.filter(n=>[`${station}-passenger`,`${station}-swap-bay`,`${station}-sst-aux`].includes(n.id)).reduce((v,n)=>v+outputCapacity(p,n),0);
  const acdcEfficiency=acInputKW?acOutputKW/acInputKW:null;
  const transformerEfficiency=transformer?equipmentEfficiency(p,transformer):null;
  const acPathEfficiency=acdcEfficiency!==null&&transformerEfficiency!==null?acdcEfficiency*transformerEfficiency:null;
  return {station,sstCount:sst.length,sstKW:sum(sst),acCount:ac.length,dcCount:dc.length,acOutputKW,acInputKW,dcOutputKW:sum(dc),transformerOutputKW,auxNameplateKW,fullLoadMarginKW:transformerOutputKW-acInputKW-auxNameplateKW,acdcEfficiency,acPathEfficiency,
   rackCount:nodes.filter(n=>n.type==='rack').length,terminalCount:nodes.filter(n=>n.type==='terminal').length,gunCount:nodes.filter(n=>n.type==='gun').length,
   gunNameplateKW:nodes.filter(n=>n.type==='gun').reduce((v,n)=>v+n.params.kw,0),gunUsableKW:sum(nodes.filter(n=>n.type==='gun'))};
 });
 return {sites,sstKW:sites.reduce((v,s)=>v+s.sstKW,0),acOutputKW:sites.reduce((v,s)=>v+s.acOutputKW,0),dcOutputKW:sites.reduce((v,s)=>v+s.dcOutputKW,0),gunCount:sites.reduce((v,s)=>v+s.gunCount,0)};
}
