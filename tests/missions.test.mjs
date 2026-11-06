import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Sim = require('../src/cppsim.js');
const M = require('../src/missions.js');
M.loadAllChapters();

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
  assert.equal(m.check(answer, null, M.h).pass, true);
  const swapped = ['source', 'compiler', 'pre', 'object', 'linker', 'exe', 'os'];
  const r = m.check(swapped, null, M.h);
  assert.equal(r.pass, false);
  assert.equal(r.correctPrefix, 1);
  assert.equal(r.wrongIndex, 1);
  assert.equal(m.check(answer.slice(0, 3), null, M.h).pass, false);
  assert.equal(m.quiz.every((q) => q.options.filter((o) => o.ok).length === 1), true);
});

test('1-2: READY is sent only by main + cout + ;  — Main is a link error, not a compile error', () => {
  const [base, apply] = byId('1-2').variants;
  const run = (v, c) => Sim.run(M.buildBlankSource(v, c));
  assert.deepEqual(passingCombos(base, (c) => base.check(run(base, c), base.tests[0], M.h).pass), [{ fn: 'main', stream: 'cout', end: ';' }]);
  assert.equal(run(base, { fn: 1, stream: 0, end: 0 }).error.kind, 'link');
  assert.equal(M.checkSignal(base, run(base, { fn: 0, stream: 0, end: 2 })).errorType, 'semicolon');
  assert.equal(M.checkSignal(base, run(base, { fn: 0, stream: 1, end: 0 })).errorType, 'direction');
  assert.deepEqual(passingCombos(apply, (c) => apply.check(run(apply, c), apply.tests[0], M.h).pass), [{ ns: 'using namespace std;', op: '<<' }]);
  assert.equal(M.checkSignal(apply, run(apply, { ns: 1, op: 0 })).errorType, 'namespace');
});

test('1-3: only a double share computed from robots passes every generator/robot input', () => {
  const v = byId('1-3').variants[0];
  const passes = (c, t) => v.check(Sim.run(M.buildBlankSource(v, c, t.params)), t, M.h).pass;
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
  for (const t of m.tests) assert.equal(m.check(Sim.run(m.reference, { input: t.input }), t, M.h).pass, true, t.label);

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

test('localized mission code differs only in comments, with the same line numbers', () => {
  const ko = M.getMissions('ko').filter(m => m.id.startsWith('1-'));
  const en = M.getMissions('en').filter(m => m.id.startsWith('1-'));
  assert.equal(M.getMissions('ko'), M.MISSIONS);
  assert.equal(M.getMissions('en'), M.getMissions('en'));
  const compare = (left, right) => {
    const a = left.split('\n');
    const b = right.split('\n');
    assert.equal(a.length, b.length);
    assert.deepEqual(a.map((line) => line.replace(/\/\/.*$/, '')), b.map((line) => line.replace(/\/\/.*$/, '')));
  };
  ko.forEach((mission, i) => {
    for (const key of ['starter', 'reference']) {
      if (mission[key] !== undefined) compare(mission[key], en[i][key]);
    }
    (mission.variants || []).forEach((variant, j) => compare(variant.template, en[i].variants[j].template));
  });
});

test('English mission data contains no Korean text', () => {
  const walk = (value, path = 'missions') => {
    if (typeof value === 'string') assert.doesNotMatch(value, /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/, path);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  walk(M.getMissions('en').filter(m => m.id.startsWith('1-')));
});

test('English base reference passes all inputs and marks exactly lines 8 and 9', () => {
  const mission = M.getMissions('en').find((m) => m.id === '1-4');
  const marked = mission.starter.split('\n').flatMap((line, i) => line.includes(mission.fixMark) ? [i + 1] : []);
  assert.deepEqual(marked, [8, 9]);
  for (const t of mission.tests) assert.equal(M.checkBase(t, Sim.run(mission.reference, { input: t.input, lang: 'en' })).pass, true, t.label);
});

test('simulator error classification uses stable codes rather than message text', () => {
  const groups = {
    name: ['linkNoMain', 'caseMismatch', 'undeclared', 'undeclaredVar', 'cinUndeclared', 'unknownIoName', 'notInStd'],
    namespace: ['nameNeedsStd', 'endlNeedsStd'],
    semicolon: ['missingSemicolon', 'colonInsteadOfSemicolon', 'semicolonBefore'],
    direction: ['wrongArrowCout', 'wrongArrowCin', 'singleArrow', 'streamNeedsArrow', 'streamParen'],
    input: ['inputMissing', 'inputBad'],
    uninit: ['uninitRead', 'uninitCompound'],
  };
  for (const [type, codes] of Object.entries(groups)) {
    for (const code of codes) assert.equal(M.classifySimError({ code, message: 'unrelated', kind: 'compile' }), type, code);
  }
  assert.equal(M.classifySimError({ code: 'other', kind: 'link', message: "';'" }), 'syntax');
});

test('checker messages follow the selected language', () => {
  try {
    M.setLang('en');
    assert.match(M.checkOrder([]).message, /empty/);
    const mission = M.getMissions('en')[1];
    assert.match(M.checkSignal(mission.variants[0], { ok: true, output: 'READY' }).message, /screen/);
    M.setLang('ko');
    assert.match(M.checkOrder([]).message, /빈 칸/);
  } finally {
    M.setLang('ko');
  }
});

test('blank substitutions also resolve parameters inside selected code', () => {
  const variant = { template: 'int value = {choice};', blanks: { choice: [{ code: '{start} + 1' }] } };
  assert.equal(M.buildBlankSource(variant, { choice: 0 }, { start: 4 }), 'int value = 4 + 1;');
});

test('registry resolves languages, orders chapters and invalidates the mission cache', () => {
  const before = M.getMissions('en');
  M.registerChapter({ no: 99, zone: { ko: '시험', en: 'Test' }, missions: [
    { id: '99-1', title: { ko: '확인', en: 'Check' }, check: () => ({ pass: true }) },
  ], errorTypes: { example: { ko: '예', en: 'Example' } }, codeErrorTypes: { exampleCode: 'example' } });
  const after = M.getMissions('en');
  assert.notEqual(after, before);
  assert.equal(after.at(-1).title, 'Check');
  assert.equal(after.at(-1).check().pass, true);
  assert.equal(M.getErrorTypes('en').example, 'Example');
  assert.equal(M.classifySimError({ code: 'exampleCode' }), 'example');
  assert.equal(M.getChapters('en').length, 10);
});
