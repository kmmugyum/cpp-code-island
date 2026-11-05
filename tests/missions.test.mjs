import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Sim = require('../src/cppsim.js');
const M = require('../src/missions.js');

const byId = (id) => M.MISSIONS.find((m) => m.id === id);

// 모든 선택 조합을 돌려 통과하는 조합만 돌려준다
function passingCombos(variant, check) {
  const keys = Object.keys(variant.blanks);
  const combos = [{}];
  for (const k of keys) {
    const next = [];
    for (const c of combos) variant.blanks[k].forEach((_, i) => next.push({ ...c, [k]: i }));
    combos.splice(0, combos.length, ...next);
  }
  return combos.filter((c) => check(c)).map((c) => Object.fromEntries(keys.map((k) => [k, variant.blanks[k][c[k]].code])));
}

test('1-1: only the full build order passes; the first wrong slot is reported', () => {
  const m = byId('1-1');
  const answer = m.cards.map((c) => c.id);
  assert.equal(M.checkOrder(answer).pass, true);
  const swapped = ['source', 'compiler', 'pre', 'object', 'linker', 'exe', 'os'];
  const r = M.checkOrder(swapped);
  assert.equal(r.pass, false);
  assert.equal(r.correctPrefix, 1);
  assert.equal(r.wrongIndex, 1);
  assert.equal(M.checkOrder(answer.slice(0, 3)).pass, false);
  assert.equal(m.quiz.every((q) => q.options.filter((o) => o.ok).length === 1), true);
});

test('1-2: READY is sent only by main + cout + ;  — Main is a link error, not a compile error', () => {
  const [base, apply] = byId('1-2').variants;
  const run = (v, c) => Sim.run(M.buildBlankSource(v, c));
  assert.deepEqual(passingCombos(base, (c) => M.checkSignal(base, run(base, c)).pass), [{ fn: 'main', stream: 'cout', end: ';' }]);
  assert.equal(run(base, { fn: 1, stream: 0, end: 0 }).error.kind, 'link');
  assert.equal(M.checkSignal(base, run(base, { fn: 0, stream: 0, end: 2 })).errorType, 'semicolon');
  assert.equal(M.checkSignal(base, run(base, { fn: 0, stream: 1, end: 0 })).errorType, 'direction');
  assert.deepEqual(passingCombos(apply, (c) => M.checkSignal(apply, run(apply, c)).pass), [{ ns: 'using namespace std;', op: '<<' }]);
  assert.equal(M.checkSignal(apply, run(apply, { ns: 1, op: 0 })).errorType, 'namespace');
});

test('1-3: only a double share computed from robots passes every generator/robot input', () => {
  const v = byId('1-3').variants[0];
  const passes = (c, t) => M.checkShare(t, Sim.run(M.buildBlankSource(v, c, t.params))).pass;
  const all = passingCombos(v, (c) => v.tests.every((t) => passes(c, t)));
  assert.deepEqual(all, [{ type: 'double', expr: '1.0 * total / robots' }, { type: 'double', expr: 'total * 1.0 / robots' }]);
  // total / 2.0 passes the base input only — the apply check must expose it
  const hard = { type: 1, expr: 1 };
  assert.equal(passes(hard, v.tests[0]), true);
  assert.equal(passes(hard, v.tests[2]), false);
  // the prediction answers come from the simulator, not a hard-coded key
  const p = byId('1-3').predict;
  assert.deepEqual(p.answersFrom(Sim.run(p.program)), ['2', '2.5']);
});

test('1-4: starter code does not compile; reference passes every input; a printed constant is caught', () => {
  const m = byId('1-4');
  assert.equal(Sim.run(m.starter, { input: '100' }).error.kind, 'compile');
  for (const t of m.tests) assert.equal(M.checkBase(t, Sim.run(m.reference, { input: t.input })).pass, true, t.label);

  const hard = m.reference.replace("cout << \"LEFT: \" << energy << '\\n';", 'cout << 65;');
  assert.notEqual(hard, m.reference);
  const verdicts = m.tests.map((t) => M.checkBase(t, Sim.run(hard, { input: t.input })));
  assert.equal(verdicts[0].pass, true);
  const failures = verdicts.filter((v) => !v.pass);
  assert.equal(failures.length, m.tests.length - 1);
  assert.equal(M.diagnoseApply(failures), 'hardcode');

  const silent = m.reference.replace("cout << \"LEFT: \" << energy << '\\n';", '');
  assert.equal(M.checkBase(m.tests[0], Sim.run(silent, { input: '100' })).errorType, 'noOutput');
});

test('starter hints point at the lines that actually fail', () => {
  const m = byId('1-4');
  const lines = m.starter.split('\n');
  assert.match(lines[7], /cin << energy/);
  assert.match(lines[8], /energy = energy - usage\s/);
  assert.equal(Sim.run(m.starter).error.line, 8);
});
