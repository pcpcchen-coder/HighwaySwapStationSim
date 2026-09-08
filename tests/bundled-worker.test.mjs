import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
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
  } finally { delete globalThis.self; }
});
