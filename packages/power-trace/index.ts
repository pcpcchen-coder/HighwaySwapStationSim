import type { Project, PowerTrace, PowerNodeSample, PowerEdgeSample, RunResult } from '../contracts/index.ts';
import { outputCapacity } from '../electrical-engine/index.ts';
import { equipmentRegistry } from '../../plugins/equipment/index.ts';

type NodeStep={input:number;output:number;loss:number;terminal:number};
export function createPowerTrace(p:Project):PowerTrace{return {version:1,endMinute:p.horizonDays*1440,eventMinutes:[],nodes:p.topology.nodes.map(n=>({nodeId:n.id,samples:[]})),edges:p.topology.edges.map(e=>({edgeId:e.id,samples:[]}))};}
/** Per-signal lossless run-length compression; zero signals are explicitly recorded. */
export function recordPowerTrace(trace:PowerTrace,p:Project,t:number,nodes:Map<string,NodeStep>,edges:Map<string,number>,demand:Map<string,number>,blocked:Set<string>,shortfall:Set<string>){
 let changed=false;
 trace.nodes.forEach((signal,i)=>{const node=p.topology.nodes[i],flow=nodes.get(node.id),status=!node.enabled?1:blocked.has(node.id)?2:shortfall.has(node.id)?3:0;
  const next:PowerNodeSample=[t,flow?.input??0,flow?.output??0,flow?.loss??0,flow?.terminal??0,demand.get(node.id)??0,status],last=signal.samples.at(-1);
  if(!last||next.some((v,k)=>k>0&&v!==last[k])){signal.samples.push(next);changed=true;}
 });
 trace.edges.forEach(signal=>{const next:PowerEdgeSample=[t,edges.get(signal.edgeId)??0],last=signal.samples.at(-1);if(!last||next[1]!==last[1]){signal.samples.push(next);changed=true;}});
 if(changed)trace.eventMinutes.push(t);
}
export function sampleAt<T extends number[]>(samples:T[],minute:number):T|undefined {
 let lo=0,hi=samples.length-1,found=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(samples[mid][0]<=minute){found=mid;lo=mid+1;}else hi=mid-1;}return found<0?undefined:samples[found];
}
/** Intersection integration; compressed signals may span many tariff hours. */
export function integrateSignal(samples:number[][],column:number,from:number,to:number,endMinute:number){let energy=0;for(let i=0;i<samples.length;i++){const start=Math.max(from,samples[i][0]),end=Math.min(to,samples[i+1]?.[0]??endMinute);if(end>start)energy+=samples[i][column]*(end-start)/60;}return energy;}

export type FlowMode='power'|'energy';
export interface FlowNode {
 id:string;input:number;output:number;loss:number;terminal:number;requested:number|null;capacityKW:number;peakKW:number;
 status:'off'|'interlock'|'shortfall'|'mixed'|'limited'|'idle'|'flow'|'unmodeled'|'unknown';
 incoming:number;outgoing:number;conversionResidual:number;branchResidual:number;connectionResidual:number;
}
export interface FlowEdge {id:string;source:string;target:string;value:number;domain:'AC'|'DC';off:boolean;}
export interface FlowView {available:boolean;mode:FlowMode;unit:'kW'|'kWh';minute:number;from:number;to:number;nodes:FlowNode[];edges:FlowEdge[];grid:number;loss:number;terminal:number;maxResidual:number;}
export function flowView(result:RunResult,minute:number,mode:FlowMode):FlowView {
 const p=result.parameterSnapshot,horizon=p.horizonDays*1440,t=Math.max(0,Math.min(Number.isFinite(minute)?minute:0,horizon)),probe=t,trace=result.powerTrace;
 const hour=Math.min(Math.floor(probe/60),horizon/60-1),day=Math.floor(hour/24),hourInDay=hour%24;
 const available=result.mode==='CONSTRAINED'&&(mode==='energy'||!!trace&&probe<=trace.endMinute);
 const stateIndex=trace?sampleIndex(trace.eventMinutes,probe):-1;
 const from=mode==='energy'?hour*60:trace?.eventMinutes[stateIndex]??0,to=mode==='energy'?(hour+1)*60:trace?.eventMinutes[stateIndex+1]??trace?.endMinute??horizon;
 const nodeSignals=new Map(trace?.nodes.map(n=>[n.nodeId,n.samples])??[]),edgeSignals=new Map(trace?.edges.map(e=>[e.edgeId,e.samples])??[]);
 const nodeHour=new Map(mode==='energy'?result.componentEnergy.filter(n=>n.day===day&&n.hour===hourInDay).map(n=>[n.nodeId,n]):[]),edgeHour=new Map(mode==='energy'?result.edgeEnergy.filter(e=>e.day===day&&e.hour===hourInDay).map(e=>[e.edgeId,e]):[]);
 const nodes:FlowNode[]=p.topology.nodes.map(n=>{const signal=nodeSignals.get(n.id),sample=signal&&sampleAt(signal,probe),h=nodeHour.get(n.id);const power=mode==='power';
  const input=power?sample?.[1]??0:h?.inputKWh??0,output=power?sample?.[2]??0:h?.outputKWh??0,loss=power?sample?.[3]??0:h?.lossKWh??0,terminal=power?sample?.[4]??0:h?.terminalKWh??0;
  let code=sample?.[6]??(n.enabled?0:1),mixed=false;
  if(!power&&signal){const statuses=new Set([sampleAt(signal,from)?.[6]??0,...signal.filter(s=>s[0]>from&&s[0]<to).map(s=>s[6])]);mixed=statuses.size>1;code=[...statuses][0];}
  const status:FlowNode['status']=!available||!signal?'unknown':mixed?'mixed':code===1?'off':code===2?'interlock':code===3?'shortfall':n.type==='compensation'?'unmodeled':power&&sample&&sample[5]>terminal+1e-6?'limited':output>0?'flow':'idle';
  return {id:n.id,input,output,loss,terminal,requested:power&&sample?sample[5]:null,capacityKW:outputCapacity(p,n),peakKW:power?output:h?.peakOutputKW??0,status,incoming:0,outgoing:0,conversionResidual:input-output-loss,branchResidual:0,connectionResidual:0};
 });
 const byNode=new Map(nodes.map(n=>[n.id,n]));
 const edges=p.topology.edges.map(e=>{const source=p.topology.nodes.find(n=>n.id===e.source),flow=mode==='power'?sampleAt(edgeSignals.get(e.id)??[],probe)?.[1]??0:edgeHour.get(e.id)?.kWh??0;
  const domain=source?equipmentRegistry.get(source.type).ports(source).find(port=>port.direction==='output')?.domain??'DC':'DC';
  const edge={id:e.id,source:e.source,target:e.target,value:flow,domain,off:!e.enabled||['off','interlock'].includes(byNode.get(e.source)?.status??'')||['off','interlock'].includes(byNode.get(e.target)?.status??'')};
  const a=byNode.get(e.source),b=byNode.get(e.target);if(a)a.outgoing+=flow;if(b)b.incoming+=flow;return edge;
 });
 let grid=0,loss=0,terminal=0,maxResidual=0;
 nodes.forEach((n,i)=>{n.branchResidual=n.output-n.outgoing-n.terminal;n.connectionResidual=p.topology.nodes[i].type==='grid'?0:n.input-n.incoming;if(p.topology.nodes[i].type==='grid')grid+=n.input;loss+=n.loss;terminal+=n.terminal;maxResidual=Math.max(maxResidual,Math.abs(n.conversionResidual),Math.abs(n.branchResidual),Math.abs(n.connectionResidual));});
 maxResidual=Math.max(maxResidual,Math.abs(grid-loss-terminal));
 return {available,mode,unit:mode==='power'?'kW':'kWh',minute:t,from,to,nodes,edges,grid,loss,terminal,maxResidual};
}
function sampleIndex(times:number[],time:number){let lo=0,hi=times.length-1,result=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(times[mid]<=time){result=mid;lo=mid+1;}else hi=mid-1;}return result;}
