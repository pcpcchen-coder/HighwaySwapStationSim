import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject } from '../packages/reference/index.ts';
import { engineeringProject, physicalProjection } from '../packages/engineering/index.ts';
import { simulate, replay } from '../packages/station-engine/index.ts';
import { flowView, integrateSignal, sampleAt } from '../packages/power-trace/index.ts';
import { verificationCases } from '../packages/verification/cases.ts';
import type { RunResult } from '../packages/contracts/index.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<=1e-6,`${a} != ${b}`);
function blank(){const p=defaultProject();p.mode='CONSTRAINED';for(const s of ['A','B'] as const)Object.assign(p.station[s],{auxiliaryKW:0,guns:1,gunKW:480,chargePoolKW:480});for(const row of p.services)Object.assign(row,{swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0});return p;}
const value=(r:RunResult,t:number,id:string,mode:'power'|'energy'='power')=>flowView(r,t,mode).nodes.find(n=>n.id===id)!;

test('480 kW for 0.125 minutes delivers exactly 1 kWh, then the timeline shows zero',()=>{
 const p=blank();Object.assign(p.services.find(r=>r.station==='A'&&r.hour===0)!,{chargeCount:1,chargeKWh:1});const r=simulate(p);
 assert.equal(value(r,0,'A-charger').terminal,480);assert.equal(value(r,.1249999,'A-charger').terminal,480);assert.equal(value(r,.125,'A-charger').terminal,0);
 near(value(r,0,'A-charger','energy').terminal,1);
 const s=r.powerTrace!.nodes.find(n=>n.nodeId==='A-charger')!.samples;near(integrateSignal(s,4,0,60,1440),1);
 assert.equal(flowView(r,.05,'power').to,.125);assert.equal(flowView(r,.125,'power').from,.125);
});

test('sub-microsecond closing event and zero-load off/on changes remain selectable',()=>{
 const p=blank(),off=1440-5e-8;p.equipmentSchedule=[{atMinute:3,equipmentId:'A-grid',enabled:false},{atMinute:10,equipmentId:'A-grid',enabled:true},{atMinute:off,equipmentId:'A-grid',enabled:false}];const r=simulate(p);
 assert.equal(value(r,3-1e-8,'A-grid').status,'idle');assert.equal(value(r,3,'A-grid').status,'off');assert.equal(value(r,10,'A-grid').status,'idle');assert.equal(value(r,off,'A-grid').status,'off');assert.equal(value(r,1440,'A-grid').status,'off');
 assert.equal(flowView(r,1440,'power').from,off);assert.equal(flowView(r,1440,'energy').from,1380);assert.equal(flowView(r,-1,'power').minute,0);assert.equal(flowView(r,Infinity,'power').minute,0);
 assert.equal(value(r,4,'A-grid','energy').status,'mixed');assert.ok(r.powerTrace!.eventMinutes.includes(off));
});

test('unserved terminal demand is distinct from zero demand and from auxiliary interlocks',()=>{
 const p=blank();Object.assign(p.services.find(r=>r.station==='A'&&r.hour===0)!,{chargeCount:1,chargeKWh:1});p.topology.nodes.find(n=>n.id==='A-grid')!.enabled=false;const r=simulate(p);
 assert.equal(value(r,0,'A-charger').requested,480);assert.equal(value(r,0,'A-charger').terminal,0);assert.equal(value(r,0,'A-charger').status,'limited');
});

test('transformer outages close SST auxiliary interlocks at exact event boundaries',()=>{
 const p=physicalProjection(engineeringProject());p.equipmentSchedule=[{atMinute:3,equipmentId:'B-transformer',enabled:false},{atMinute:10,equipmentId:'B-transformer',enabled:true}];p.topology.nodes.find(n=>n.id==='A-compensation')!.enabled=false;const r=simulate(p);
 assert.equal(value(r,3,'B-transformer').status,'off');assert.equal(value(r,3,'B-sst-0').status,'interlock');assert.equal(value(r,3,'B-sst-0').output,0);assert.notEqual(value(r,10,'B-sst-0').status,'interlock');assert.equal(value(r,3,'B-sst-aux').status,'shortfall');assert.equal(value(r,3,'B-sst-0','energy').status,'mixed');
 assert.equal(value(r,3,'A-compensation').status,'off');assert.ok(flowView(r,3,'power').edges.filter(e=>e.target==='A-compensation').every(e=>e.off));
});

test('unrecorded legacy and replay results cannot be mistaken for simulated zero',()=>{
 const p=blank(),r=simulate(p);assert.equal(flowView(r,10,'power').available,true);assert.equal(value(r,10,'A-grid').input,0);assert.equal(value(r,10,'A-grid').status,'idle');
 delete r.powerTrace;assert.equal(flowView(r,10,'power').available,false);assert.equal(flowView(r,10,'energy').available,true);assert.equal(value(r,10,'A-grid','energy').status,'unknown');assert.equal(flowView(replay(p),10,'energy').available,false);
 assert.equal(sampleAt([[3,4]],2),undefined);
});

// Independent rectangle sums distribute each raw event interval into every
// intersected hour, without calling the viewer's integration implementation.
function audit(r:RunResult){const trace=r.powerTrace!,hours=r.parameterSnapshot.horizonDays*24;let maxDelta=0,checks=0;
 const check=(a:number,b:number)=>{maxDelta=Math.max(maxDelta,Math.abs(a-b));near(a,b);checks++;};
 function hourly(samples:number[][],column:number){const totals=Array(hours).fill(0);samples.forEach((s,i)=>{const end=samples[i+1]?.[0]??trace.endMinute;for(let h=Math.floor(s[0]/60);h<Math.ceil(end/60);h++)totals[h]+=s[column]*(Math.min(end,(h+1)*60)-Math.max(s[0],h*60))/60;});return totals;}
 for(const signal of trace.nodes){const rows=new Map(r.componentEnergy.filter(n=>n.nodeId===signal.nodeId).map(n=>[n.day*24+n.hour,n]));for(const [i,key] of (['inputKWh','outputKWh','lossKWh','terminalKWh'] as const).entries()){const totals=hourly(signal.samples,i+1);totals.forEach((v,h)=>check(v,rows.get(h)?.[key]??0));}
  if(r.parameterSnapshot.topology.nodes.find(n=>n.id===signal.nodeId)!.type==='grid'){const totals=hourly(signal.samples,1);for(let h=0;h<hours;h++)check(totals[h],r.sourceMeters.find(m=>m.sourceId===signal.nodeId&&m.day*24+m.hour===h)?.importKWh??0);}
 }
 for(const signal of trace.edges){const totals=hourly(signal.samples,1),rows=new Map(r.edgeEnergy.filter(e=>e.edgeId===signal.edgeId).map(e=>[e.day*24+e.hour,e.kWh]));totals.forEach((v,h)=>check(v,rows.get(h)??0));}
 for(const t of trace.eventMinutes){const view=flowView(r,t,'power');check(view.maxResidual,0);for(const n of view.nodes)assert.ok(n.output<=n.capacityKW+1e-6);}
 return {checks,maxDelta,events:trace.eventMinutes.length,bytes:Buffer.byteLength(JSON.stringify(trace))};
}
test('all three independent multi-day cases reconcile every node, edge and physical source hour to raw power traces',t=>{
 for(const c of verificationCases()){const r=simulate(c.project),report=audit(r);t.diagnostic(`${c.id}: ${JSON.stringify(report)}`);if(c.id==='V03_OUTAGE_CROSSSITE_5D'){const v=flowView(r,4330,'power');assert.ok(v.edges.some(e=>e.source==='A-tie'&&e.target==='B-bus'&&e.value>0));assert.equal(v.nodes.find(n=>n.id==='A-grid')!.input,v.grid);}}
});
test('complete 92-node/96-edge three-day case retains every signal and reconciles all hourly ledgers',t=>{
 const p=physicalProjection(engineeringProject());p.horizonDays=3;const first=p.services.filter(r=>r.day===0);p.services=Array.from({length:3},(_,day)=>first.map(r=>({...r,day}))).flat();const r=simulate(p);
 assert.equal(r.powerTrace!.nodes.length,92);assert.equal(r.powerTrace!.edges.length,96);assert.ok(r.powerTrace!.nodes.every(n=>n.samples[0][0]===0));assert.ok(r.powerTrace!.edges.every(e=>e.samples[0][0]===0));
 const report=audit(r);assert.ok(report.bytes<10_000_000,'Lossless signal compression should keep this fixed three-day fixture below 10 MB');t.diagnostic(`COMPLETE_3D: ${JSON.stringify(report)}`);
 auditCumulative(r);
});

test('cumulative partial-minute selection integrates real power and excludes the closing event from its peak',()=>{
 const p=blank();Object.assign(p.services.find(r=>r.station==='A'&&r.hour===0)!,{chargeCount:1,chargeKWh:1});const r=simulate(p);
 const node=(from:number,to:number)=>flowView(r,to,'cumulative',from).nodes.find(n=>n.id==='A-charger')!;
 near(node(0,.125).terminal,1);near(node(.025,.1).terminal,.6);assert.equal(node(.025,.1).peakKW,480);
 near(node(.125,60).terminal,0);assert.equal(node(.125,60).peakKW,0);assert.equal(node(0,.125).status,'flow');
 const v=flowView(r,.1,'cumulative',.025);assert.equal(v.unit,'kWh');assert.equal(v.mode,'cumulative');assert.equal(v.from,.025);assert.equal(v.to,.1);near(v.maxResidual,0);
});

test('cumulative midnight selection with an outage matches independent rectangular energy areas',()=>{
 const p=verificationCases()[1].project;p.equipmentSchedule=[{atMinute:1438,equipmentId:'A-grid',enabled:false},{atMinute:1442,equipmentId:'A-grid',enabled:true}];const r=simulate(p),v=flowView(r,1445,'cumulative',1435);
 // A: six powered minutes, B: ten. Each 10 kW AC load sees transformer eta=.98.
 near(v.terminal,10*(6+10)/60);near(v.grid,10*(6+10)/60/.98);near(v.loss,10*(6+10)/60*(1/.98-1));near(v.maxResidual,0);
 const a=v.nodes.find(n=>n.id==='A-grid')!;assert.equal(a.status,'mixed');near(a.input,1/.98);near(a.peakKW,10/.98);
 const outageOnly=flowView(r,1442,'cumulative',1438).nodes.find(n=>n.id==='A-grid')!;assert.equal(outageOnly.status,'off');assert.equal(outageOnly.peakKW,0);assert.equal(outageOnly.input,0);
});

function auditCumulative(r:RunResult){const end=r.parameterSnapshot.horizonDays*1440,full=flowView(r,end,'cumulative');
 near(full.grid,r.sourceMeters.reduce((sum,m)=>sum+m.importKWh,0));near(full.loss,r.totals.lossKWh);near(full.maxResidual,0);
 for(const n of full.nodes){const rows=r.componentEnergy.filter(row=>row.nodeId===n.id);for(const [column,key] of ([['input','inputKWh'],['output','outputKWh'],['loss','lossKWh'],['terminal','terminalKWh']] as const))near(n[column],rows.reduce((sum,row)=>sum+row[key],0));}
 for(const e of full.edges)near(e.value,r.edgeEnergy.filter(row=>row.edgeId===e.id).reduce((sum,row)=>sum+row.kWh,0));
 // Arbitrary fractional, cross-day cut; conservation and additivity must hold
 // for all four node streams and every line, not just a headline total.
 const a=13.25,b=1481.7,c=end-.5,left=flowView(r,b,'cumulative',a),right=flowView(r,c,'cumulative',b),whole=flowView(r,c,'cumulative',a);
 whole.nodes.forEach((n,i)=>{for(const key of ['input','output','loss','terminal'] as const)near(n[key],left.nodes[i][key]+right.nodes[i][key]);});
 whole.edges.forEach((e,i)=>near(e.value,left.edges[i].value+right.edges[i].value));near(whole.maxResidual,0);
}

test('cumulative multi-day totals match all ledgers and do not double count cross-site transfers or swap stock',()=>{
 for(const c of verificationCases()){const r=simulate(c.project);auditCumulative(r);if(c.id==='V03_OUTAGE_CROSSSITE_5D'){const v=flowView(r,c.project.horizonDays*1440,'cumulative');near(v.terminal,887.5);near(v.grid,953.2760472610097);assert.ok(v.edges.some(e=>e.source==='A-tie'&&e.value>0));assert.ok(v.nodes.reduce((sum,n)=>sum+n.output,0)>v.terminal);}}
});

test('cumulative range normalization gives empty ranges zero energy and does not invent traces for old or replay results',()=>{
 const p=blank();Object.assign(p.services.find(r=>r.station==='A'&&r.hour===0)!,{chargeCount:1,chargeKWh:1});const r=simulate(p);
 for(const [start,end] of [[.05,.05],[20,10],[NaN,NaN]]){const v=flowView(r,end,'cumulative',start);assert.equal(v.from,v.to);assert.equal(v.grid,0);assert.equal(v.loss,0);assert.equal(v.terminal,0);assert.ok(v.nodes.every(n=>n.peakKW===0&&n.status==='empty'));}
 const all=flowView(r,1e9,'cumulative',-100);assert.equal(all.from,0);assert.equal(all.to,1440);near(all.terminal,1);
 delete r.powerTrace;assert.equal(flowView(r,60,'cumulative').available,false);assert.equal(flowView(replay(p),60,'cumulative').available,false);
});
