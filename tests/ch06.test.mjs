import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
require('../src/missions/ch06.js');
const Sim = require('../src/cppsim.js');
const missions = lang => M.getMissions(lang).filter(m => m.id.startsWith('6-'));
const correct = v => Object.fromEntries(Object.keys(v.blanks).map(key => [key, 0]));
function run(v, selection, fixture, lang = 'ko') {
  M.setLang(lang);
  const source = M.buildBlankSource(v, selection, fixture.params);
  const result = Sim.run(source, { lang, input: fixture.input || '' });
  return { source, result, verdict: v.check(result, fixture, M.h) };
}
const number = (result, path) => Number(M.h.cell(result, path)?.shown);
const events = result => result.steps.flatMap(s => s.events || []);

test('four bilingual missions pass every fixture and have matching code', () => {
  const ko = missions('ko'), en = missions('en');
  assert.equal(ko.length, 4);
  assert.equal(en.length, 4);
  for (let i = 0; i < ko.length; i++) {
    const m = ko[i], e = en[i], v = m.variants[0], ev = e.variants[0];
    assert.equal(m.id, `6-${i + 1}`);
    assert.doesNotMatch(JSON.stringify(e), /[가-힣]/u);
    assert.ok(m.tools.length >= 2 && m.tools.length <= 4);
    assert.equal(m.hints.length, 4);
    for (let j = 0; j < v.tests.length; j++) {
      const a = run(v, correct(v), v.tests[j]);
      const b = run(ev, correct(ev), ev.tests[j], 'en');
      assert.equal(a.source.replace(/\/\/.*$/gm, ''), b.source.replace(/\/\/.*$/gm, ''));
      assert.ok(a.result.ok, `${m.id}: ${JSON.stringify(a.result.error)}`);
      assert.ok(a.verdict.pass, `${m.id}: ${JSON.stringify(a.verdict)}`);
      assert.ok(b.verdict.pass, `${m.id}: ${JSON.stringify(b.verdict)}`);
    }
    const lines = v.template.split('\n');
    const targets = [[13, '{target}.{field}'], [27, '{call}'], [13, '{copy}'], [19, '{call}']];
    const [line, fragment] = targets[i];
    assert.ok(lines[line - 1].includes(fragment));
    assert.ok(m.hints.some(hint => hint.includes(`${line}번 줄`)));
    for (const hint of m.hints) for (const match of hint.matchAll(/(\d+)(?:~(\d+))?번 줄/g)) {
      assert.ok(+match[1] <= lines.length && (!match[2] || +match[2] <= lines.length));
    }
  }
});

test('every wrong card exposes its named misconception', () => {
  for (const m of missions('ko')) {
    const v = m.variants[0], base = correct(v);
    for (const [key, options] of Object.entries(v.blanks)) {
      for (let i = 1; i < options.length; i++) {
        assert.ok(options[i].why && options[i].errorType, `${m.id} ${key} ${i}`);
        let failed = false;
        for (const fixture of v.tests) {
          const { result, verdict } = run(v, { ...base, [key]: i }, fixture);
          if (!result.ok || !verdict.pass) {
            failed = true;
            if (m.id === '6-4' && key === 'call' && i === 1) {
              assert.equal(result.stage, 'compile');
              assert.equal(result.error.code, 'privateAccess');
              assert.equal(verdict.errorType, 'access');
            } else {
              assert.ok(result.ok, JSON.stringify(result.error));
              assert.equal(verdict.errorType, options[i].errorType, `${m.id} ${key} ${i}`);
            }
          }
        }
        assert.ok(failed, `${m.id} ${key} ${i} must fail at least one fixture`);
      }
    }
  }
});

test('charge affects B only when B is selected and explains the target', () => {
  const v = missions('ko')[1].variants[0];
  const { result, verdict } = run(v, { call: 1 }, v.tests[0]);
  assert.equal(number(result, 'a.energy'), 30);
  assert.equal(number(result, 'b.energy'), 90);
  assert.ok(events(result).some(e => e.type === 'call' && /charge$/.test(e.fn) && e.object === 'b'));
  assert.match(verdict.message, /충전 기능은 맞게 골랐지만, 대상 객체가 B입니다\./);
});

test('copy construction precedes a charge on a, leaving b independent', () => {
  const v = missions('ko')[2].variants[0];
  const { result } = run(v, correct(v), v.tests[0]);
  assert.equal(number(result, 'a.energy'), 40);
  assert.equal(number(result, 'b.energy'), 30);
  const es = events(result);
  const copy = es.findIndex(e => e.type === 'construct' && e.path === 'b' && e.how === 'copy');
  const charge = es.findIndex(e => e.type === 'call' && /charge$/.test(e.fn) && e.object === 'a');
  assert.ok(copy >= 0 && charge > copy);
});

test('private access and charge rule are independent', () => {
  const v = missions('ko')[3].variants[0];
  for (const [i, expected] of [[0, 50], [1, 95], [2, 20], [3, 100]]) {
    const { result, verdict } = run(v, correct(v), v.tests[i]);
    assert.equal(number(result, 'a.energy'), expected);
    assert.equal(number(result, 'reading'), expected);
    assert.ok(verdict.pass);
    assert.ok(events(result).some(e => e.type === 'call' && /charge$/.test(e.fn) && e.object === 'a'));
  }
  const bad = run(v, { ...correct(v), call: 1 }, v.tests[0]);
  assert.equal(bad.result.error.code, 'privateAccess');
});
