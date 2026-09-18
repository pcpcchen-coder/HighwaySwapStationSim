import {mkdirSync,writeFileSync} from 'node:fs';
import {singleBusProject} from '../../packages/detailed-model/single-bus-project.ts';
import {simulateDetailed} from '../../packages/detailed-model/engine.ts';
import {capacityCases,capacityProject,planningDaySummary,singleBusTenYears,type CapacityRuns} from '../../packages/load-planning/index.ts';
const project=singleBusProject(),runs:CapacityRuns={};
for(const level of capacityCases(project)){
 const run=simulateDetailed(capacityProject(project,level));
 if(run.totals.maxBalanceResidual>1e-6)throw Error(`${level}: energy balance failed`);
 runs[level]=run;console.log(level,planningDaySummary(run));
}
const estimate=singleBusTenYears(project,runs);
if(estimate.rows.some(r=>r.status!=='ready'))throw Error('Default annual rows unavailable');
const summaries=Object.fromEntries(Object.entries(runs).map(([level,run])=>[level,planningDaySummary(run!)]));
mkdirSync('artifacts/single-bus',{recursive:true});
writeFileSync('artifacts/single-bus/report.json',JSON.stringify({project,summaries,estimate},null,2));
console.log(estimate.totals);
