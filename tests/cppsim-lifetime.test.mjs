import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('block-local objects are destroyed in reverse order at the closing brace', () => {
  const source = readFileSync(new URL('./corpus/destructors.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '2 1 3\n'); // clang++ -std=c++17
  const destructs = r.steps.filter(s => s.kind === 'destruct');
  assert.deepEqual(destructs.map(s => s.events[0].path), ['b', 'a']);
  assert.deepEqual(destructs.map(s => s.line), [13, 13]);
});
