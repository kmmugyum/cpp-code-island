import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('nested control flow follows the compiler and traces conditions', () => {
  const source = readFileSync(new URL('./corpus/control.cpp', import.meta.url), 'utf8');
  const result = Sim.run(source, { lang: 'en' });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.output, '11 1\n'); // clang++ -std=c++17
  assert.ok(result.steps.some(s => s.events.some(e => e.type === 'branch' && e.taken)));
  assert.ok(result.steps.some(s => s.events.some(e => e.type === 'loop' && !e.cond)));
  assert.ok(result.steps.every(s => s.mem && s.mem.frames[0].fn === 'main'));
});

test('short-circuiting avoids reading an uninitialized variable', () => {
  const result = Sim.run('int main() { int x; if (false && x) x = 1; return 0; }', { lang: 'en' });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.steps.find(s => s.kind === 'if').reads, []);
});

test('switch selects a case and falls through until break', () => {
  const source = readFileSync(new URL('./corpus/switch.cpp', import.meta.url), 'utf8');
  const result = Sim.run(source, { lang: 'en' });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.output, '5\n'); // clang++ -std=c++17
  assert.deepEqual(result.steps.filter(s => s.kind === 'case').map(s => s.events[0].label), [98, 99]);
});
