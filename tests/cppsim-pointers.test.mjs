import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('pointer arithmetic writes through to the array element', () => {
  const source = readFileSync(new URL('./corpus/pointers.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '9 9\n'); // clang++ -std=c++17
  const write = r.steps.find(s => s.changed.includes('values[1]'));
  assert.deepEqual(write.delta['values[1]'], { from: '5', to: '9' });
  assert.equal(r.steps.find(s => s.changed.includes('p')).mem.frames[0].vars.find(c => c.name === 'p').target, 'values[0]');
});

test('null dereference stops execution', () => {
  const r = Sim.run('int main() { int* p = nullptr; int x = *p; }', { lang: 'en' });
  assert.equal(r.error.kind, 'ub');
  assert.equal(r.error.code, 'nullDeref');
});
