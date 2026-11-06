import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
const Sim = require('../src/cppsim.js');
require('../src/missions/ch09.js');
const missions = lang => M.getMissions(lang).filter(m => m.id.startsWith('9-'));
const correct = v => Object.fromEntries(Object.keys(v.blanks).map(key => [key, 0]));
function run(v, choices, fixture, lang = 'ko') {
  M.setLang(lang);
  const result = Sim.run(M.buildBlankSource(v, choices, fixture.params), { lang, input: fixture.input || '' });
  return { result, verdict: v.check(result, fixture, M.h) };
}
const cell = (r, path) => M.h.cell(r, path);
const num = (r, path) => Number(cell(r, path)?.shown);

test('chapter 9 missions are bilingual and pass all scenarios', () => {
  const ko = missions('ko'), en = missions('en');
  assert.equal(ko.length, 4);
  assert.equal(en.length, 4);
  for (let i = 0; i < ko.length; i++) {
    const a = ko[i], b = en[i], v = a.variants[0];
    assert.equal(a.id, b.id);
    assert.equal(a.hints.length, 4);
    assert.ok(a.tools.length >= 2 && a.tools.length <= 4);
    assert.ok(a.lecture.quotes.length >= 2);
    assert.doesNotMatch(JSON.stringify(b), /[\uac00-\ud7af]/);
    assert.equal(v.template.replace(/\/\/.*$/gm, ''), b.variants[0].template.replace(/\/\/.*$/gm, ''));
    for (const lang of ['ko', 'en']) {
      const variant = missions(lang)[i].variants[0];
      for (const fixture of variant.tests) {
        const { result, verdict } = run(variant, correct(variant), fixture, lang);
        assert.equal(verdict.pass, true, `${a.id} ${fixture.label}: ${JSON.stringify(result.error)} ${verdict.message}`);
      }
    }
  }
});

test('all wrong cards expose their misconception on at least one fixture', () => {
  for (const m of missions('ko')) {
    const v = m.variants[0];
    for (const [key, choices] of Object.entries(v.blanks)) {
      for (let i = 1; i < choices.length; i++) {
        assert.ok(choices[i].why && choices[i].errorType);
        const trials = v.tests.map(fixture => run(v, { ...correct(v), [key]: i }, fixture));
        const failed = trials.find(({ verdict }) => !verdict.pass);
        assert.ok(failed, `${m.id}: ${key}[${i}] should fail`);
        if (m.id === '9-1' && key === 'call' && i === 1) {
          assert.equal(failed.result.error?.code, 'templateDeduction');
        } else if (failed.result.ok) {
          assert.equal(failed.verdict.errorType, choices[i].errorType, `${m.id}: ${key}[${i}]`);
        } else {
          assert.equal(failed.result.error?.kind, 'compile', `${m.id}: ${key}[${i}]`);
        }
      }
    }
  }
});

test('hint line references identify the relevant code', () => {
  const expected = [
    [[4, 'return {rule}'], [9, 'sum(a, b)'], [10, '{call}']],
    [[12, 'Box<{type}>'], [13, 'second({value})']],
    [[7, 'parts.{insert}'], [12, 'parts.find({search})'], [14, '{sort}'], [15, 'binary_search']],
    [[6, '{op}'], [7, '{sum}']],
  ];
  missions('ko').forEach((m, index) => {
    const lines = m.variants[0].template.split('\n');
    for (const [line, fragment] of expected[index]) assert.ok(lines[line - 1].includes(fragment), `${m.id} line ${line}`);
  });
});

test('template calls and typed boxes preserve values and types', () => {
  const calculator = missions('ko')[0].variants[0];
  const r = run(calculator, correct(calculator), calculator.tests[0]).result;
  assert.equal(num(r, 'whole'), 8);
  assert.equal(num(r, 'decimal'), 4.75);
  const box = missions('ko')[1].variants[0];
  const b = run(box, correct(box), box.tests[0]).result;
  assert.equal(cell(b, 'first.value')?.type, 'int');
  assert.equal(cell(b, 'second.value')?.type, 'double');
  assert.equal(num(b, 'second.value'), 5.5);
});

test('set deduplicates and array sorting precedes binary search', () => {
  const v = missions('ko')[2].variants[0];
  for (const fixture of v.tests) {
    const r = run(v, correct(v), fixture).result;
    const { a, b } = fixture.params;
    assert.equal(num(r, 'total'), a === b ? a : a + b);
    assert.equal(num(r, 'found'), 1);
    assert.equal(num(r, 'searched'), 1);
    assert.equal(num(r, 'values[0]'), Math.min(a, b));
    assert.equal(num(r, 'values[1]'), Math.max(a, b));
    assert.equal(M.h.numbersIn(r.output)[0], a === b ? 1 : 2);
  }
});

test('operator+ leaves inputs intact and combines the actual operands', () => {
  const v = missions('ko')[3].variants[0];
  for (const fixture of v.tests) {
    const r = run(v, correct(v), fixture).result;
    assert.equal(num(r, 'left.parts'), fixture.params.a);
    assert.equal(num(r, 'right.parts'), fixture.params.b);
    assert.equal(num(r, 'total.parts'), fixture.params.a + fixture.params.b);
  }
});

test('fixed base answers do not pass changed scenarios', () => {
  for (const m of missions('ko')) {
    const v = m.variants[0], base = v.tests[0], changed = v.tests[1];
    const source = M.buildBlankSource(v, correct(v), base.params);
    M.setLang('ko');
    const result = Sim.run(source, { lang: 'ko' });
    assert.equal(v.check(result, changed, M.h).pass, false, m.id);
  }
});
