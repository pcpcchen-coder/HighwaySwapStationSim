import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { engineeringProject, physicalProjection } from '../packages/engineering/index.ts';
test('production simulation worker executes a canonical request', async () => {
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
  } finally { delete globalThis.self; }
});
