import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
require('../src/missions/ch08.js');
const Sim = require('../src/cppsim.js');
const missions = lang => M.getMissions(lang).filter(m => m.id.startsWith('8-'));
const correct = v => Object.fromEntries(Object.keys(v.blanks).map(key => [key, 0]));
const events = (result, type) => result.steps.flatMap(s => s.events || []).filter(e => e.type === type);
function run(v, choices, fixture, lang = 'ko') {
  M.setLang(lang);
  const source = M.buildBlankSource(v, choices, fixture.params);
  const result = Sim.run(source, { input: fixture.input || '', lang });
  return { source, result, verdict: v.check(result, fixture, M.h) };
}

test('all memory missions pass every input in both languages', () => {
  const ko = missions('ko'), en = missions('en');
  assert.equal(ko.length, 4);
  assert.equal(en.length, 4);
  const anchors = [[[7, '{store}'], [15, '{read}']], [[7, '{allocate}'], [11, '{release}']], [[8, '{sum}'], [9, '{release}']], [[8, '{copyData}'], [16, '{makeCopy}']]];
  for (let i = 0; i < 4; i++) {
    const m = ko[i], e = en[i], v = m.variants[0], ev = e.variants[0];
    assert.equal(m.id, `8-${i + 1}`);
    assert.doesNotMatch(JSON.stringify(e), /[가-힣]/u);
    assert.ok(m.tools.length >= 2 && m.tools.length <= 4);
    assert.equal(m.hints.length, 4);
    for (const [line, text] of anchors[i]) assert.ok(v.template.split('\n')[line - 1].includes(text));
    for (let j = 0; j < v.tests.length; j++) {
      const a = run(v, correct(v), v.tests[j]), b = run(ev, correct(ev), ev.tests[j], 'en');
      assert.equal(a.source.replace(/\/\/.*$/gm, ''), b.source.replace(/\/\/.*$/gm, ''));
      assert.ok(a.result.ok, `${m.id}: ${JSON.stringify(a.result.error)}`);
      assert.ok(a.verdict.pass, `${m.id}: ${JSON.stringify(a.verdict)}`);
      assert.ok(b.verdict.pass, `${m.id}: ${JSON.stringify(b.verdict)}`);
    }
  }
});

test('every wrong card fails a fixture for its stated reason', () => {
  for (const m of missions('ko')) {
    const v = m.variants[0], base = correct(v);
    for (const [key, options] of Object.entries(v.blanks)) {
      for (let i = 1; i < options.length; i++) {
        const option = options[i];
        assert.ok(option.why && option.errorType);
        let detected = false;
        for (const fixture of v.tests) {
          const { result, verdict } = run(v, { ...base, [key]: i }, fixture);
          if (!verdict.pass) {
            detected = true;
            if (['doubleFree', 'useAfterFree', 'deleteMismatch'].includes(option.errorType)) {
              assert.equal(result.error?.code, option.errorType, `${m.id} ${key} ${i}`);
            } else {
              assert.ok(result.ok, `${m.id} ${key} ${i}: ${JSON.stringify(result.error)}`);
              assert.equal(verdict.errorType, option.errorType, `${m.id} ${key} ${i}`);
            }
          }
        }
        assert.ok(detected, `${m.id} ${key} ${i} was not detected`);
      }
    }
  }
});

test('scope exit destroys r before the outer output', () => {
  const v = missions('ko')[0].variants[0], { result } = run(v, correct(v), v.tests[0]);
  assert.deepEqual(M.numbersIn(result.output), [4, 0, 1]);
  assert.ok(events(result, 'construct').some(e => e.path === 'r'));
  assert.ok(events(result, 'destruct').some(e => e.path === 'r'));
});

test('loan survives inner scope, and a forgotten release is a leak rather than an error', () => {
  const v = missions('ko')[1].variants[0];
  const good = run(v, correct(v), v.tests[0]).result;
  const alloc = events(good, 'alloc'), freed = events(good, 'free');
  assert.equal(alloc.length, 1);
  assert.equal(freed.length, 1);
  assert.equal(alloc[0].id, freed[0].id);
  const bad = run(v, { ...correct(v), release: 1 }, v.tests[0]);
  assert.ok(bad.result.ok);
  assert.equal(bad.result.leaks.length, 1);
  assert.equal(bad.verdict.errorType, 'memoryLeak');
});

test('array diagnostics distinguish leaks, double free, dangling reads and mismatched delete', () => {
  const v = missions('ko')[2].variants[0];
  for (const [choice, code] of [[2, 'doubleFree'], [3, 'useAfterFree'], [4, 'deleteMismatch']]) {
    const { result } = run(v, { ...correct(v), release: choice }, v.tests[0]);
    assert.equal(result.error?.code, code);
  }
  const leak = run(v, { ...correct(v), release: 1 }, v.tests[0]).result;
  assert.ok(leak.ok);
  assert.equal(leak.leaks.length, 1);
  const good = run(v, correct(v), v.tests[0]).result;
  assert.ok(events(good, 'free').some(e => e.array));
});

test('deep copy has two allocations, a copy construction and two distinct frees', () => {
  const v = missions('ko')[3].variants[0], { result } = run(v, correct(v), v.tests[1]);
  assert.deepEqual(M.numbersIn(result.output), [9, 10, 9]);
  assert.equal(new Set(events(result, 'alloc').map(e => e.id)).size, 2);
  assert.equal(new Set(events(result, 'free').map(e => e.id)).size, 2);
  assert.ok(events(result, 'construct').some(e => e.path === 'b' && e.how === 'copy'));
  assert.ok(events(result, 'destruct').some(e => e.path === 'a'));
  assert.ok(events(result, 'destruct').some(e => e.path === 'b'));
  assert.equal(result.leaks.length, 0);
});
