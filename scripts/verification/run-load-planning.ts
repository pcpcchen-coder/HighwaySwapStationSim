import fs from 'node:fs';
import assert from 'node:assert/strict';
import {completeProject} from '../../packages/detailed-model/project.ts';
import {simulate} from '../../packages/station-engine/index.ts';
import {capacityProject,capacitySummary,projectTenYears,LOAD_LEVELS,type CapacityRuns} from '../../packages/load-planning/index.ts';
const expected=JSON.parse(fs.readFileSync('data/verification/load-planning-expected.json','utf8'));
const p=completeProject(),actual=projectTenYears(p),tolerance=1e-6;let checks=0,maxAbsoluteError=0;
for(let i=0;i<10;i++)for(const [key,value] of Object.entries(expected.rows[i])){
 const a=(actual.rows[i] as unknown as Record<string,unknown>)[key];checks++;
 if(key==='load'||key==='year'){assert.equal(a,value);continue;}
 const error=Math.abs(Number(a)-Number(value));maxAbsoluteError=Math.max(maxAbsoluteError,error);assert.ok(Number.isFinite(error)&&error<tolerance,`${i} ${key}: ${a} != ${value}`);
}
const runs:CapacityRuns={};
for(const level of LOAD_LEVELS)runs[level]=simulate(capacityProject(p,level));
const report={status:'passed',method:expected.method,tolerance,checks,maxAbsoluteError,capacity:Object.fromEntries(LOAD_LEVELS.map(l=>[l,capacitySummary(runs[l]!)])),annual:projectTenYears(p,runs)};
const output='docs/evidence/2026-09-18/load-planning-verification.json';fs.mkdirSync('docs/evidence/2026-09-18',{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks,maxAbsoluteError,tolerance,capacity:report.capacity,output}));
