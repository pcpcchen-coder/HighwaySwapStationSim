import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDetailedLive,detailedCaseOptions,detailedCaseProject,detailedCaseJSON,detailedComparisonJSON} from '../packages/detailed-verification/checks.ts';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';

test('live verification reports actual execution for all three detailed cases, including unmet UPS load',()=>{
 for(const option of detailedCaseOptions()){
  const p=detailedCaseProject(option.id),r=simulateDetailed(p),report=compareDetailedLive(r);
  assert.equal(report.state,'MATCHED');assert.equal(report.inputMatches,true);assert.equal(report.allPassed,true);assert.equal(report.failed,0);assert.equal(report.unavailable,0);assert.ok(report.checks.length>=12);
  if(option.short==='V05'){const unmet=report.checks.find(r=>r.id==='ups-unmet')!;assert.equal(unmet.status,'passed');assert.ok(Math.abs(unmet.actual!-8)<1e-6);}
  const exported=JSON.parse(detailedComparisonJSON(r));assert.equal(exported.allPassed,true);assert.deepEqual(exported.parameterSnapshot,r.parameterSnapshot);assert.deepEqual(JSON.parse(detailedCaseJSON(option.id)),p);
 }
});

test('live verification cannot inherit a pass after changing inputs or corrupting a numeric result',()=>{
 const id=detailedCaseOptions()[0].id,p=detailedCaseProject(id),r=simulateDetailed(p);
 const bad=structuredClone(r);bad.totals.gridKWh+=.001;const failed=compareDetailedLive(bad);assert.equal(failed.allPassed,false);assert.equal(failed.checks.find(row=>row.id==='grid')!.status,'failed');
 const unknown=structuredClone(r);unknown.totals.gridKWh=NaN;assert.equal(compareDetailedLive(unknown).checks.find(row=>row.id==='grid')!.status,'unavailable');
 const changed=structuredClone(r);changed.parameterSnapshot.efficiency.sst=.97;assert.equal(compareDetailedLive(changed).state,'INPUT_MISMATCH');assert.equal(compareDetailedLive(changed).allPassed,false);
 // Reordering object properties preserves identity; array order is not erased.
 const reordered=structuredClone(r);reordered.parameterSnapshot=Object.fromEntries(Object.entries(reordered.parameterSnapshot).reverse()) as typeof p;assert.equal(compareDetailedLive(reordered).allPassed,true);
 const changedOrder=structuredClone(r);changedOrder.parameterSnapshot.services.reverse();assert.equal(compareDetailedLive(changedOrder).state,'INPUT_MISMATCH');
 const report=compareDetailedLive(null);assert.equal(report.state,'NO_RESULT');assert.equal(report.allPassed,false);assert.equal(report.passed,0);
});

test('case exports are detached copies and unavailable detailed traces do not masquerade as zero',()=>{
 const option=detailedCaseOptions()[1],p=detailedCaseProject(option.id),r=simulateDetailed(p);
 p.name='locally changed';assert.notEqual(detailedCaseProject(option.id).name,p.name);
 delete r.powerTrace;const report=compareDetailedLive(r);assert.equal(report.inputMatches,true);assert.equal(report.allPassed,false);assert.equal(report.checks.find(row=>row.id==='ups-unmet')!.status,'unavailable');
 delete r.detailedResult;assert.equal(compareDetailedLive(r).state,'MISSING_DETAIL');assert.throws(()=>detailedCaseProject('unknown'),/UNKNOWN/);
});
