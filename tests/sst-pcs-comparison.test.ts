import test from 'node:test';
import assert from 'node:assert/strict';
import {singleBusProject} from '../packages/detailed-model/single-bus-project.ts';
import {sstPcsComparison} from '../packages/load-planning/sst-pcs-comparison.ts';
import {capacityCases,capacityProject,capacityMatches,singleBusTenYears,planningCSV,type CapacityRuns} from '../packages/load-planning/index.ts';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';
import {parseProject} from '../packages/schemas/index.ts';
import {exportWorkbook,importWorkbook,unzipStored} from '../packages/io/index.ts';
const near=(a:number|null,b:number)=>assert.ok(a!==null&&Number.isFinite(a)&&Math.abs(a-b)<1e-6,`${a} != ${b}`);
const energy=(nodeId:string,inputKWh:number,outputKWh:number)=>({nodeId,inputKWh,outputKWh,lossKWh:inputKWh-outputKWh,day:0,hour:0,terminalKWh:0,peakOutputKW:0,capacityKW:0,maxBalanceResidual:0});

test('PCS replaces the SST at the DC bus, retains the same DC/DC and excludes AC/DC charging efficiency',()=>{
 const p=singleBusProject();
 // 1000 kWh grid -> 980 kWh bus -> 954.52 kWh after DC/DC.
 const run={componentEnergy:[energy('A-sst-0',1000,980),energy('A-dd-group-sst',980,954.52)]};
 const v=sstPcsComparison(p,run,954.52,.98,.67);
 near(v.sstConversionEfficiency,.95452);near(v.pcsReferenceEfficiency,.9354296);
 near(v.sstComparisonInputKWh,1000);near(v.pcsComparisonInputKWh,1020.4081632653061);near(v.conversionSavedKWh,20.4081632653061);near(v.conversionSavingCNY,13.6734693877551);
 for(const n of p.topology.nodes)if(n.type==='acdc')n.params.eta=.5;
 assert.deepEqual(sstPcsComparison(p,run,954.52,.98,.67),v);
 near(sstPcsComparison(p,run,477.26,.98,1.34).conversionSavingCNY,v.conversionSavingCNY!);
 assert.equal(sstPcsComparison(p,run,954.52,1,.67).conversionSavedKWh,0);
 const slower={componentEnergy:[energy('A-sst-0',1100,980),energy('A-dd-group-sst',980,954.52)]};
 near(sstPcsComparison(p,slower,954.52,1,.67).conversionSavingCNY,-67);
 near(sstPcsComparison(p,run,954.52,.98,0).conversionSavingCNY,0);
});

test('transformer efficiency is weighted by SST source output, including cross-area DC support',()=>{
 const p=singleBusProject();p.topology.nodes.find(n=>n.id==='A-transformer')!.params.efficiency=.9;p.topology.nodes.find(n=>n.id==='B-transformer')!.params.efficiency=.8;
 // All customer demand is on B, but A supplies 3/4 of the common DC bus.
 const run={componentEnergy:[energy('A-sst-0',750/.95,750),energy('B-sst-0',250/.98,250),energy('B-dd-group-sst',1000,970)]};
 const v=sstPcsComparison(p,run,970,.96,.5);
 near(v.pcsComparisonInputKWh,1193.576388888889);near(v.sstComparisonInputKWh,1044.5757250268528464);near(v.conversionSavingCNY,74.5003319310180217);
});

test('unsupported conversion models and missing transformer assumptions stay unavailable; zero delivery saves zero',()=>{
 const p=singleBusProject(),empty={componentEnergy:[]};
 near(sstPcsComparison(p,empty,0,.98,.67).conversionSavingCNY,0);
 assert.equal(sstPcsComparison(p,empty,100,.98,.67).conversionSavingCNY,null);
 p.detailed!.storage[0].config.enabled=true;assert.equal(sstPcsComparison(p,empty,0,.98,.67).conversionSavingCNY,null);
 p.detailed!.storage[0].config.enabled=false;
 const run={componentEnergy:[energy('A-sst-0',1000,980),energy('A-dd-group-sst',980,954.52)]};
 p.topology.nodes=p.topology.nodes.filter(n=>n.id!=='A-transformer');assert.equal(sstPcsComparison(p,run,954.52,.98,.67).conversionSavingCNY,null);
});

test('annual cumulative values, price edits, stale inputs and CSV/XLSX share one comparison with backward-compatible settings',()=>{
 const p=singleBusProject();
 // Small physical case: one 100 kWh DC gun session per profile day.
 for(const l of ['low','medium','high'] as const){p.loadPlan!.profiles[l]=p.loadPlan!.profiles[l].map(r=>({...r,swapCount:0,swapKWh:0,chargeCount:r.station==='A'&&r.hour===8?1:0,chargeKWh:r.station==='A'&&r.hour===8?100:0,ac:{swapCount:0,swapKWh:0,chargeCount:0,chargeKWh:0}}));}
 for(const y of p.loadPlan!.years){y.operatingDays=100;y.demandFactor=.5;}
 const runs:CapacityRuns={};for(const c of capacityCases(p))runs[c]=simulateDetailed(capacityProject(p,c));
 const rows=singleBusTenYears(p,runs).rows;
 const expected=(5000/.9354296-5000/.95452)*.67;
 rows.forEach((r,i)=>{assert.equal(r.status,'ready');near(r.dcDeliveredKWh,5000);near(r.conversionSavingCNY,expected);near(r.cumulativeSavingCNY,expected*(i+1));});
 p.loadPlan!.pcsReferenceEfficiency=1;parseProject(p);assert.ok(capacityMatches(p,'low',runs.low));singleBusTenYears(p,runs).rows.forEach(r=>near(r.conversionSavingCNY,0));
 p.loadPlan!.pcsReferenceEfficiency=.98;p.loadPlan!.energyValueCnyPerKWh=1.34;
 near(singleBusTenYears(p,runs).totals.conversionSavingCNY,expected*20);
 assert.equal(parseProject(singleBusProject()).loadPlan!.pcsReferenceEfficiency,undefined);
 for(const bad of [0,-.1,1.01]){const q=structuredClone(p);q.loadPlan!.pcsReferenceEfficiency=bad;assert.throws(()=>parseProject(q));}
 const csv=planningCSV(p,runs);assert.match(csv,/pcsComparisonInputKWh/);assert.match(csv,/cumulativeSavingCNY/);assert.doesNotMatch(csv,/acReferenceEfficiency/);
 // XLSX intentionally exports a measurement snapshot: resimulate the selected
 // case with the new planning settings, leaving other compatible runs intact.
 const selected=simulateDetailed(capacityProject(p,'low'));
 const bytes=exportWorkbook(selected.parameterSnapshot,selected,runs),files=unzipStored(bytes);
 assert.equal(importWorkbook(bytes).loadPlan!.pcsReferenceEfficiency,.98);
 assert.ok(Object.values(files).some(s=>s.includes('pcsComparisonInputKWh')&&s.includes('cumulativeSavingCNY')));
 p.topology.nodes.find(n=>n.id==='A-sst-0')!.params.efficiency=.9;
 assert.equal(singleBusTenYears(p,runs).rows[0].conversionSavingCNY,null);assert.equal(singleBusTenYears(p,runs).rows[9].cumulativeSavingCNY,null);
});
