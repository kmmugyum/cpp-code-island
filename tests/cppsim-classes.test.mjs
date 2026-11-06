import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('method calls act on the selected object only', () => {
  const source = readFileSync(new URL('./corpus/classes.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '50 70\n'); // clang++ -std=c++17
  const step = r.steps.find(s => s.fn === 'Robot::charge' && s.changed.includes('a.energy'));
  assert.ok(step);
  assert.deepEqual(step.delta['a.energy'], { from: '30', to: '50' });
  assert.ok(r.steps.some(s => s.events.some(e => e.type === 'call' && e.object === 'a' && e.fn === 'Robot::charge')));
});

test('private field access fails before execution', () => {
  const source = 'class Robot { private: int energy; }; int main() { Robot a; a.energy = 1; }';
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.error.code, 'privateAccess');
  assert.deepEqual(r.steps, []);
});
