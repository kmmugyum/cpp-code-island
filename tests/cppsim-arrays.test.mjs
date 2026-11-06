import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('two-dimensional arrays use element paths and partial initialization', () => {
  const source = readFileSync(new URL('./corpus/arrays.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '11 98 0\n'); // clang++ -std=c++17
  const step = r.steps.find(s => s.changed.includes('grid[1][2]'));
  assert.deepEqual(step.delta['grid[1][2]'], { from: '0', to: '7' });
  assert.equal(step.mem.frames[0].vars.find(c => c.name === 'grid').elems[1].elems[2].value, 7);
});

test('out-of-bounds array access is diagnosed without inventing a value', () => {
  const r = Sim.run('int main() { int a[2] = {1, 2}; int x = a[2]; }', { lang: 'en' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'indexOutOfBounds');
  assert.equal(r.error.path, 'a');
  assert.equal(r.error.index, 2);
  assert.equal(r.error.size, 2);
  assert.equal(r.output, '');
});

test('character classification scans to the terminator', () => {
  const source = readFileSync(new URL('./corpus/characters.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '2\n'); // clang++ -std=c++17
  assert.ok(r.steps.some(s => s.reads.includes('signal[2]')));
});

test('array parameters refer to caller storage and globals retain their paths', () => {
  const source = readFileSync(new URL('./corpus/array-params.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '10\n'); // clang++ -std=c++17
  assert.ok(r.steps.some(s => s.reads.includes('data[1]')));
  assert.ok(r.steps.some(s => s.reads.includes('::bonus')));
});
