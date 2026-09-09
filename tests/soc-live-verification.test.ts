import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateDetailed} from '../packages/detailed-model/engine.ts';
import {compareSocLive,socCaseOptions,socCaseProject,socCaseJSON,socComparisonJSON} from '../packages/soc-verification/checks.ts';
import type {RunResult} from '../packages/contracts/index.ts';
const cache=new Map<string,RunResult>();
function run(id='linear_taper'){if(!cache.has(id))cache.set(id,simulateDetailed(socCaseProject(id)));return cache.get(id)!;}

test('three SOC cases compare their fresh engine results to the independent oracle',()=>{
 for(const c of socCaseOptions()){const result=run(c.id),report=compareSocLive(result);assert.equal(report.state,'MATCHED');assert.equal(report.inputMatches,true);assert.equal(report.allPassed,true);assert.ok(report.passed>300);assert.equal(report.failed,0);assert.equal(report.unavailable,0);assert.ok(report.checks.some(r=>r.unit==='SOC'&&r.group==='cursor'));}
});

test('modified complete input never inherits a fixed SOC case pass',()=>{
 const result=structuredClone(run());result.parameterSnapshot.detailed!.service.truckSlotOverrides[0].slot.chargeEfficiency=.95;
 const report=compareSocLive(result);assert.equal(report.state,'INPUT_MISMATCH');assert.equal(report.inputMatches,false);assert.equal(report.allPassed,false);assert.equal(report.checks.length,0);
});

test('missing SOC trace cannot be replaced by the final battery snapshot',()=>{
 const result=structuredClone(run());delete result.detailedResult!.batteryTrace;
 const report=compareSocLive(result);assert.equal(report.state,'MISSING_TRACE');assert.equal(report.inputMatches,true);assert.equal(report.allPassed,false);assert.equal(report.passed,0);
});

test('trace corruption and missing electrical trace are visible failures or unavailable checks',()=>{
 const altered=structuredClone(run());altered.detailedResult!.batteryTrace!.slots.find(s=>s.slotId==='A-rack-0')!.intervals[0].energyKWh-=1;
 const failed=compareSocLive(altered);assert.equal(failed.allPassed,false);assert.ok(failed.failed>0);
 const missing=structuredClone(run());delete missing.powerTrace;const unavailable=compareSocLive(missing);
 assert.equal(unavailable.state,'MATCHED');assert.equal(unavailable.allPassed,false);assert.ok(unavailable.unavailable>0);
});

test('case JSON is isolated and key order does not affect full-input matching',()=>{
 const project=socCaseProject('linear_taper');project.name='changed';assert.notEqual(socCaseProject('linear_taper').name,'changed');
 assert.deepEqual(JSON.parse(socCaseJSON('linear_taper')),socCaseProject('linear_taper'));
 const result=structuredClone(run());result.parameterSnapshot=Object.fromEntries(Object.entries(result.parameterSnapshot).reverse()) as typeof result.parameterSnapshot;
 assert.equal(compareSocLive(result).allPassed,true);
 const report=JSON.parse(socComparisonJSON(result));assert.deepEqual(report.parameterSnapshot,result.parameterSnapshot);assert.equal(report.format,'HighwaySwapSim.SocLiveVerification');assert.equal(report.allPassed,true);
});

test('no-result, legacy mode and missing detailed ledger never report success',()=>{
 assert.equal(compareSocLive(null).state,'NO_RESULT');assert.equal(compareSocLive(null).allPassed,false);
 const legacy=structuredClone(run());legacy.mode='SOURCE_REPLAY';assert.equal(compareSocLive(legacy).state,'MODE_MISMATCH');
 const missing=structuredClone(run());delete missing.detailedResult;assert.equal(compareSocLive(missing).state,'MISSING_DETAIL');assert.equal(compareSocLive(missing).allPassed,false);
 assert.throws(()=>socCaseProject('unknown'),/UNKNOWN_SOC_VERIFICATION_CASE/);
});
