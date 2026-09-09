import test from 'node:test';
import assert from 'node:assert/strict';
import type {Project} from '../packages/contracts/index.ts';
import {v04Project,v05Project,v06Project,pvExportGoldenProject} from '../packages/detailed-verification/index.ts';
import {compileFleet} from '../packages/detailed-model/services.ts';
import {detailedReadiness} from '../packages/detailed-model/readiness.ts';
import {exportDetailedJSON,exportDetailedCSV,importDetailedProfile} from '../packages/detailed-profile/index.ts';
const load=(p:Project,nodeId:string)=>p.detailed!.loads.push({nodeId,idleKW:1,perActiveJobKW:0,hourlyKW:null,perEnabledSST:false});
const hasIssue=(p:Project,path:string)=>assert.ok(detailedReadiness(p).some(i=>i.path.includes(path)),JSON.stringify(detailedReadiness(p)));

test('custom auxiliary loads cannot share actual fleet sinks or automatic passenger auxiliary endpoint',()=>{
 for(const [factory,id]of [[v04Project,'A-rack-0'],[v04Project,'A-external-gun'],[v06Project,'A-passenger-rack-0'],[v06Project,'A-passenger-aux']] as const){const p=factory();load(p,id);hasIssue(p,`loads.${id}`);}
 const p=v04Project(),slot=structuredClone(compileFleet(p).swaps[0].slots[0]);slot.sink='A-external-gun';p.detailed!.service.truckSlotOverrides=[{enabled:true,slot}];load(p,slot.sink);hasIssue(p,`loads.${slot.sink}`);
 // This rack is not owned by a fleet; controlled auxiliary fixtures remain valid.
 assert.deepEqual(detailedReadiness(v05Project()),[]);
});

test('gridLimits reserves the grid boundary and never silently targets DD, bus, PV, or storage',()=>{
 for(const id of ['A-pv-dd','A-pv-bus','A-pv-source','A-ess-source']){const p=v05Project();p.detailed!.dispatch.gridLimits=[{sourceId:id,kw:0}];hasIssue(p,`gridLimits.${id}`);}
 const valid=v05Project();valid.detailed!.dispatch.gridLimits=[{sourceId:'A-grid',kw:0}];assert.deepEqual(detailedReadiness(valid),[]);
});

test('construction rejects state-model efficiency drift but permits same efficiency, switches, and independent converter edits',()=>{
 const cases=[['A-ess-in',.8],['A-ess-out',.7],['A-ups-in',.9],['A-ups-out',.9],['A-pv-mppt',.8]] as const;
 for(const [id,eta]of cases){const p=v05Project();p.detailed!.construction=[{atMinute:720,equipmentId:id,enabled:true,params:{eta}}];hasIssue(p,`construction.${id}.params.eta`);}
 const solar=pvExportGoldenProject();solar.detailed!.construction=[{atMinute:720,equipmentId:'A-pv-export-converter',enabled:true,params:{eta:.7}}];hasIssue(solar,'construction.A-pv-export-converter.params.eta');
 const unchanged=v05Project();unchanged.detailed!.construction=[{atMinute:720,equipmentId:'A-ess-in',enabled:true,params:{eta:.9,kw:40}},{atMinute:750,equipmentId:'A-ess-out',enabled:false,params:{}}];assert.deepEqual(detailedReadiness(unchanged),[]);
 const independent=v06Project();independent.detailed!.construction=[{atMinute:720,equipmentId:'A-acdc',enabled:true,params:{eta:.9}}];assert.deepEqual(detailedReadiness(independent),[]);
});

test('JSON/CSV keep unresolved editable drafts without allowing boundary errors to become runnable',()=>{
 const p=v05Project();p.detailed!.dispatch.gridLimits=[{sourceId:'A-ess-source',kw:null}];load(p,'A-rack-0');p.detailed!.construction=[{atMinute:720,equipmentId:'A-ess-in',enabled:true,params:{eta:.8}}];
 const before=structuredClone(p);
 for(const format of ['json','csv'] as const){const text=format==='json'?exportDetailedJSON(p):exportDetailedCSV(p),restored=importDetailedProfile(p,text,format);assert.deepEqual(restored,p);assert.deepEqual(p,before);assert.equal(restored.detailed!.dispatch.gridLimits[0].kw,null);hasIssue(restored,'loads.A-rack-0');hasIssue(restored,'gridLimits.A-ess-source');hasIssue(restored,'construction.A-ess-in.params.eta');}
});
