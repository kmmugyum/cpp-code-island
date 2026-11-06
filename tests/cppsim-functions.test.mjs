import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('recursive calls and reference parameters affect the caller', () => {
  const source = readFileSync(new URL('./corpus/functions.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '9\n'); // clang++ -std=c++17
  assert.ok(r.steps.some(s => s.fn === 'add' && s.changed.includes('x')));
  assert.ok(r.steps.some(s => s.mem.frames.some(f => f.key === 'factorial#2')));
});

test('declaration before use and definition at link time are required', () => {
  const undeclared = Sim.run('int main() { return f(1); } int f(int x) { return x; }', { lang: 'en' });
  assert.equal(undeclared.error.code, 'undeclaredFunction');
  const undefinedFn = Sim.run('int f(int x); int main() { return f(1); }', { lang: 'en' });
  assert.equal(undefinedFn.stage, 'link');
  assert.equal(undefinedFn.error.code, 'undefinedFunction');
});
