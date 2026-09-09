import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { SOC_VERIFICATION_IDS, socVerificationProject, hourlySohVerificationProject } from '../packages/soc-verification/index.ts';
import { compareSocLive } from '../packages/soc-verification/checks.ts';
import { verificationCases } from '../packages/verification/cases.ts';
import { simulate } from '../packages/station-engine/index.ts';
import { engineeringProject, physicalProjection } from '../packages/engineering/index.ts';
test('production worker matches the canonical model and all three multi-day verification outputs', async () => {
  const assets = await readdir(new URL('../dist/client/assets/', import.meta.url));
  const filename = assets.find(name => /^worker-.*\.js$/.test(name));
  assert.ok(filename, 'A bundled browser worker must exist');
  let message;
  globalThis.self = { postMessage(value) { message = value; } };
  try {
    await import(new URL(`../dist/client/assets/${filename}`, import.meta.url));
    const project = physicalProjection(engineeringProject());
    self.onmessage({data: {id: 42, project}});
    assert.equal(message.id, 42);
    assert.equal(message.error, undefined);
    assert.equal(message.result.mode, 'CONSTRAINED');
    assert.ok(message.result.totals.maxBalanceResidual < .01);
    assert.ok(Math.abs(message.result.totals.requestedKWh - 77801.2) < 1e-6);
    for(const fixture of verificationCases()){self.onmessage({data:{id:43,project:fixture.project}});assert.equal(message.error,undefined,fixture.id);assert.deepEqual(message.result,simulate(fixture.project),fixture.id+' full compiled/source output equivalence');}
    const custom=verificationCases()[1].project;custom.topology.nodes.find(n=>n.id==='A-transformer').params.efficiency=.9;custom.topology.nodes.find(n=>n.id==='B-charger').params.efficiency=.8;
    self.onmessage({data:{id:44,project:custom}});assert.equal(message.error,undefined);assert.deepEqual(message.result,simulate(custom),'individual efficiency survives production Worker bundling');
    for(const id of SOC_VERIFICATION_IDS){const scenario=socVerificationProject(id);self.onmessage({data:{id:45,project:scenario}});assert.equal(message.error,undefined,id);assert.deepEqual(message.result,simulate(scenario),id+' full SOC trace, events and ledgers survive Worker bundling');assert.equal(compareSocLive(message.result).allPassed,true,id+' bundled actual result matches independent oracle');}
    const conflict=hourlySohVerificationProject(410.4);self.onmessage({data:{id:46,project:conflict}});assert.equal(message.error,undefined);assert.equal(message.result.totals.unservedKWh,410.4);assert.equal(message.result.totals.completed,0);assert.equal(message.result.totals.revenue,0);
  } finally { delete globalThis.self; }
});
