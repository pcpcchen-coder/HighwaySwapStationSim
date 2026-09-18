import test from 'node:test';
import assert from 'node:assert/strict';
import {completeProject} from '../packages/detailed-model/project.ts';
import {compileFleet} from '../packages/detailed-model/services.ts';
import {simulate} from '../packages/station-engine/index.ts';
import {parseProject} from '../packages/schemas/index.ts';
import {applyStationSOC} from '../packages/station-settings/index.ts';
import {exportServiceCSV,exportServiceJSON,importServiceProfile} from '../packages/service-profile/index.ts';
import {exportWorkbook,importWorkbook,unzipStored} from '../packages/io/index.ts';
import {flowView} from '../packages/power-trace/index.ts';
import {evaluateExtendedFinance} from '../packages/extended-finance/index.ts';
import {applyLoadPreset,captureLoadProfile,capacityProject,capacityMatches,capacitySummary,defaultLoadPlan,demandBranch,demandSummary,LOAD_LEVELS,matchesLoadProfile,planningCSV,projectTenYears,type CapacityRuns} from '../packages/load-planning/index.ts';
const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-6,`${a} != ${b}`);
// Independently transcribed right-hand source summaries: [total swap, AC swap, DC swap, DC swap kWh, AC swap kWh].
const golden={high:{A:[71,17,54,22140,6970],B:[67,18,49,20090,7380]},medium:{A:[51,15,36,14760,6150],B:[52,16,36,14760,6560]},low:{A:[35,15,20,8200,6150],B:[34,15,19,7790,6150]}};
const base=completeProject();
const runs:CapacityRuns={};

test('all 144 source rows reconcile station counts, AC/DC subsets and daily energy to screenshot totals',()=>{
 const plan=defaultLoadPlan();
 for(const level of LOAD_LEVELS)for(const station of ['A','B'] as const){
  const rows=plan.profiles[level].filter(r=>r.station===station),d=demandSummary(rows),g=golden[level][station];
  assert.equal(rows.length,24);assert.deepEqual([d.total.swapCount,d.ac.swapCount,d.dc.swapCount,d.dc.swapKWh,d.ac.swapKWh],g);
  near(d.total.chargeCount,34);near(d.total.chargeKWh,12020);near(d.ac.chargeCount,station==='A'?3:5);near(d.ac.chargeKWh,station==='A'?1230:2050);
  near(d.dc.chargeCount,station==='A'?31:29);near(d.dc.chargeKWh,station==='A'?10790:9970);
  for(const r of rows){near(r.swapKWh,r.swapCount*410);near(r.chargeKWh,r.chargeCount*(r.hour<16?410:250));assert.equal(r.idleRaw,null);}
 }
 assert.deepEqual(LOAD_LEVELS.map(l=>demandSummary(plan.profiles[l]).total.energyKWh),[80620,66270,52330]);
 assert.deepEqual(LOAD_LEVELS.map(l=>demandSummary(plan.profiles[l]).dc.energyKWh),[62990,50280,36750]);
});

test('preset loading preserves physical equipment, charging terminal counts, manual events and independent day rows',()=>{
 const p={...base,horizonDays:3};p.topology=structuredClone(p.topology);p.topology.nodes[0].name='Custom source';
 const next=applyLoadPreset(p,'medium');parseProject(next);assert.equal(next.topology,p.topology);assert.equal(next.station,p.station);assert.equal(next.equipmentSchedule,p.equipmentSchedule);assert.equal(next.detailed!.service.swapArrivals,p.detailed!.service.swapArrivals);assert.equal(next.services.length,144);
 for(const station of ['A','B']){assert.equal(next.topology.nodes.filter(n=>n.id.startsWith(`${station}-swap-terminal-`)).length,3);assert.equal(next.topology.nodes.filter(n=>n.id.startsWith(`${station}-swap-gun-`)).length,6);}
 assert.equal(next.mode,'CONSTRAINED');assert.equal(next.detailed!.service.useHourlyTruckDemand,true);assert.ok(matchesLoadProfile(next,'medium',2));
 next.services[0].ac!.swapKWh=1200;assert.equal(next.services[48].ac!.swapKWh,1230);assert.equal(next.loadPlan!.profiles.medium[0].ac!.swapKWh,1230);
});

test('compiled AC/DC jobs use one physical fleet and only the selected branch slots and shared guns',()=>{
 for(const level of LOAD_LEVELS){const p=capacityProject(base,level),f=compileFleet(p),d=demandSummary(p.services);
  assert.equal(f.swaps.filter(s=>s.kind==='truck-swap').length,2);
  const energies={ac:0,dc:0},counts={ac:0,dc:0};
  for(const job of f.swapArrivals.filter(a=>a.id.startsWith('hourly-'))){assert.ok(job.allowedSlotIds?.length);const branch=demandBranch(p,job.allowedSlotIds![0])!;assert.ok(job.allowedSlotIds!.every(id=>demandBranch(p,id)===branch));energies[branch]+=job.requestedKWh!;counts[branch]++;}
  near(energies.ac,d.ac.swapKWh);near(energies.dc,d.dc.swapKWh);near(counts.ac,d.ac.swapCount);near(counts.dc,d.dc.swapCount);
  const charging={ac:0,dc:0};for(const job of f.chargeArrivals.filter(a=>a.id.startsWith('hourly-'))){assert.ok(job.allowedGunIds?.length);assert.ok(job.allowedGunIds!.every(id=>id.includes('-swap-gun-')));const branch=demandBranch(p,job.allowedGunIds![0])!;assert.ok(job.allowedGunIds!.every(id=>demandBranch(p,id)===branch));charging[branch]+=job.energyKWh!;}
  near(charging.ac,d.ac.chargeKWh);near(charging.dc,d.dc.chargeKWh);
 }
});

test('annual factors reproduce source SST sales while changed representative days update only matching years',()=>{
 const p=capacityProject(base,'low'),first=projectTenYears(p);const sales=[7716300,11243700,14771200,...Array(7).fill(18298600)];
 first.rows.forEach((r,i)=>near(r.dcSalesKWh,sales[i]));
 p.services[0].swapKWh+=410;p.services[0].swapCount++;assert.ok(!matchesLoadProfile(p,'low',0));assert.deepEqual(projectTenYears(p),first);
 const changed=captureLoadProfile(p,'low',0),next=projectTenYears(changed);near(next.rows[0].dcSalesKWh-first.rows[0].dcSalesKWh,410*first.rows[0].equivalentDays);for(let i=1;i<10;i++){const {cumulativeBenefitCNY:a,...ar}=next.rows[i],{cumulativeBenefitCNY:b,...br}=first.rows[i];assert.deepEqual(ar,br);near(a-b,next.rows[0].benefitCNY-first.rows[0].benefitCNY);}
 near(next.rows[0].acSalesKWh,first.rows[0].acSalesKWh);assert.ok(matchesLoadProfile(changed,'low',0));
});

test('annual financial boundary allows zero activity and negative efficiency benefit without applying physical efficiencies twice',()=>{
 const p=structuredClone(base);p.loadPlan!.years[0].operatingDays=0;p.loadPlan!.years[1].traditionalEfficiency=.96;p.loadPlan!.years[1].sstEfficiency=.9;
 const a=projectTenYears(p);near(a.rows[0].totalSalesKWh,0);near(a.rows[0].savedKWh,0);assert.ok(a.rows[1].benefitCNY<0);
 const q=structuredClone(p);q.efficiency.sst=.8;q.topology.nodes.find(n=>n.id==='A-sst-0')!.params.efficiency=.8;assert.deepEqual(projectTenYears(q),a);
 q.loadPlan!.energyValueCnyPerKWh=1.34;near(projectTenYears(q).totals.benefitCNY,a.totals.benefitCNY*2);
 assert.match(planningCSV(p),/capacityLimitedBenefitCNY/);
});

test('invalid AC subsets and malformed annual plans are rejected; CSV and JSON retain branches',()=>{
 const p=capacityProject(base,'high');
 for(const [format,text] of [['csv',exportServiceCSV(p)],['json',exportServiceJSON(p)]] as const)assert.deepEqual(importServiceProfile(p,text,format,'replace').project,p);
 const mixed=structuredClone(p);delete mixed.services[0].ac;assert.deepEqual(importServiceProfile(mixed,exportServiceCSV(mixed),'csv','replace').project,mixed);
 for(const change of [{swapCount:9},{swapKWh:3281},{swapCount:0,swapKWh:1},{swapCount:8,swapKWh:1230}]){const bad=structuredClone(p);Object.assign(bad.services[0].ac!,change);assert.throws(()=>parseProject(bad));}
 const missing=structuredClone(p);delete missing.detailed;assert.throws(()=>parseProject(missing));
 const duplicate=structuredClone(p);duplicate.loadPlan!.years[1].year=2027;assert.throws(()=>parseProject(duplicate));
 const version=JSON.parse(exportServiceJSON(p));version.version='2';assert.throws(()=>importServiceProfile(p,JSON.stringify(version),'json'));
 const badCSV=exportServiceCSV(p).replace('3,1230,0,0','3,,0,0');assert.throws(()=>importServiceProfile(p,badCSV,'csv'));
});

test('SOC edits recalculate total and AC energy without changing counts, DC identity or saved representative profiles',()=>{
 const p=capacityProject(base,'medium'),next=applyStationSOC(p,'A',.2,.8);
 for(const row of next.services.filter(r=>r.station==='A')){near(row.swapKWh,row.swapCount*307.8);near(row.ac!.swapKWh,row.ac!.swapCount*307.8);}
 assert.deepEqual(next.loadPlan,p.loadPlan);assert.deepEqual(next.services.filter(r=>r.station==='B'),p.services.filter(r=>r.station==='B'));
 const stored=captureLoadProfile(next,'medium',0);assert.ok(projectTenYears(stored).rows[1].dcSalesKWh<projectTenYears(p).rows[1].dcSalesKWh);parseProject(stored);
});

test('three actual representative-day runs keep routing, service totals, inventory, flow and finance on the same snapshot',()=>{
 for(const level of LOAD_LEVELS){const p=capacityProject(base,level),r=simulate(p);runs[level]=r;const s=capacitySummary(r);assert.ok(capacityMatches(base,level,r));near(s.requestedKWh,demandSummary(p.services).total.energyKWh);near(s.deliveredKWh+s.unservedKWh,s.requestedKWh);near(s.deliveredKWh,s.acDeliveredKWh+s.dcDeliveredKWh);assert.ok(s.deliveredKWh>0&&s.completionRatio<=1+1e-8);assert.ok(r.totals.maxBalanceResidual<1e-6);
  const jobs=new Map(compileFleet(p).swapArrivals.map(j=>[j.id,j]));for(const e of r.detailedResult!.serviceEvents)if(e.kind==='swap-complete'&&e.jobId?.startsWith('hourly-'))assert.ok(jobs.get(e.jobId)!.allowedSlotIds!.includes(e.slotId!));
  const flow=flowView(r,1440,'cumulative',0);near(flow.grid,r.totals.gridKWh);near(flow.terminal,r.totals.deliveredKWh+r.detailedResult!.energy.auxiliaryKWh+r.totals.finalStoredKWh-r.totals.initialStoredKWh);
  const finance=evaluateExtendedFinance(r,p.detailed!.finance,r.detailedResult!.inventory);near(finance.billing.energyCost,r.totals.gridCost);near(finance.observed.energyContribution,r.totals.revenue-r.totals.gridCost);assert.equal(finance.observed.accountingNetProfit,null);assert.ok(finance.billing.issues.some(i=>i.path==='calendar.startDate'));
 }
 const estimate=projectTenYears(base,runs);for(const row of estimate.rows){const s=capacitySummary(runs[row.load]!);near(row.estimatedSiteGridKWh!,s.gridKWh*row.equivalentDays);near(row.estimatedSiteEnergyCostCNY!,s.gridCost*row.equivalentDays);}assert.ok(estimate.rows.every(r=>r.capacityStatus!=='not-run'&&r.capacityStatus!=='stale'));
 const r=runs.low!,bytes=exportWorkbook(r.parameterSnapshot,r);assert.deepEqual(importWorkbook(bytes),r.parameterSnapshot);const files=unzipStored(bytes);for(const name of ['Ten_Year_Design','Ten_Year_Estimate','Load_Presets','Service_AC_DC'])assert.ok(files['xl/workbook.xml'].includes(name));
});

test('capacity cache follows equipment and profile changes but not unrelated annual price edits; depletion prevents extrapolation',()=>{
 const r=runs.low!;assert.ok(r);const p=structuredClone(base);p.loadPlan!.energyValueCnyPerKWh=.8;assert.ok(capacityMatches(p,'low',r));
 p.topology.nodes.find(n=>n.id==='A-sst-0')!.params.efficiency=.91;assert.ok(!capacityMatches(p,'low',r));assert.equal(projectTenYears(p,runs).rows[0].capacityStatus,'stale');assert.equal(projectTenYears(p,runs).rows[0].estimatedDeliverableKWh,null);
 const depleted=structuredClone(r);depleted.totals.finalStoredKWh=depleted.totals.initialStoredKWh-100;const noRepeat=projectTenYears(base,{low:depleted}).rows[0];assert.equal(noRepeat.capacityStatus,'inventory-depleted');assert.equal(noRepeat.capacityLimitedBenefitCNY,null);
 const excess=structuredClone(base);excess.loadPlan!.years[0].demandFactor=1.1;assert.equal(projectTenYears(excess,runs).rows[0].capacityStatus,'exceeds-reference');
});
