import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('array allocation and matching deletion record heap events', () => {
  const source = readFileSync(new URL('./corpus/heap.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '11\n'); // clang++ -std=c++17
  assert.deepEqual(r.leaks, []);
  assert.ok(r.steps.some(s => s.events.some(e => e.type === 'alloc' && e.id === '@1')));
  assert.ok(r.steps.some(s => s.changed.includes('@1[1]')));
  assert.ok(r.steps.some(s => s.events.some(e => e.type === 'free' && e.array)));
});

test('leaks and invalid heap operations are distinguished', () => {
  const leak = Sim.run('int main() { int* p = new int(7); }', { lang: 'en' });
  assert.equal(leak.leaks.length, 1);
  assert.equal(leak.leaks[0].id, '@1');
  const twice = Sim.run('int main() { int* p = new int; delete p; delete p; }', { lang: 'en' });
  assert.equal(twice.error.code, 'doubleFree');
  const after = Sim.run('int main() { int* p = new int(1); delete p; int x = *p; }', { lang: 'en' });
  assert.equal(after.error.code, 'useAfterFree');
  const mismatch = Sim.run('int main() { int* p = new int[2]; delete p; }', { lang: 'en' });
  assert.equal(mismatch.error.code, 'deleteMismatch');
});
