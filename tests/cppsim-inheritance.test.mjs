import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

test('virtual dispatch uses dynamic type and preserves the object path', () => {
  const source = readFileSync(new URL('./corpus/virtual.cpp', import.meta.url), 'utf8');
  const r = Sim.run(source, { lang: 'en' });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.output, '7 7\n'); // clang++ -std=c++17
  const dispatch = r.steps.flatMap(s => s.events).find(e => e.type === 'dispatch');
  assert.deepEqual([dispatch.static, dispatch.dynamic, dispatch.virtual, dispatch.object], ['Robot', 'RepairRobot', true, 'a']);
  assert.deepEqual(r.steps.find(s => s.kind === 'construct').mem.frames[0].vars.find(c => c.name === 'a').bases, ['Robot']);
});

test('abstract classes cannot be instantiated', () => {
  const r = Sim.run('class Robot { public: virtual int work() = 0; }; int main() { Robot r; }', { lang: 'en' });
  assert.equal(r.error.code, 'abstractInstantiation');
  assert.deepEqual(r.steps, []);
});
