import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { defaultProject } from '../packages/reference/index.ts';
test('production simulation worker executes a canonical request', async () => {
  const assets = await readdir(new URL('../dist/client/assets/', import.meta.url));
  const filename = assets.find(name => /^worker-.*\.js$/.test(name));
  assert.ok(filename, 'A bundled browser worker must exist');
  let message;
  globalThis.self = { postMessage(value) { message = value; } };
  try {
    await import(new URL(`../dist/client/assets/${filename}`, import.meta.url));
    const project = defaultProject(); project.mode = 'CONSTRAINED';
    self.onmessage({data: {id: 42, project}});
    assert.equal(message.id, 42);
    assert.equal(message.error, undefined);
    assert.equal(message.result.mode, 'CONSTRAINED');
    assert.ok(message.result.totals.maxBalanceResidual < .01);
    assert.equal(message.result.totals.requestedKWh, 77750);
  } finally { delete globalThis.self; }
});
