import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
require('../src/missions/ch07.js');
const Sim = require('../src/cppsim.js');
const missions = lang => M.getMissions(lang).filter(m => m.id.startsWith('7-'));
const correct = variant => Object.fromEntries(Object.keys(variant.blanks).map(key => [key, 0]));
const run = (variant, selection, fixture, lang = 'ko') => {
  M.setLang(lang);
  const source = M.buildBlankSource(variant, selection, fixture.params);
  const result = Sim.run(source, { input: fixture.input || '', lang });
  return { source, result, verdict: variant.check(result, fixture, M.h) };
};

test('chapter 7 correct choices work in both languages for every fixture', () => {
  const ko = missions('ko'); const en = missions('en');
  assert.equal(ko.length, 4); assert.equal(en.length, 4);
  const hintTargets = [[6, '{relation}'], [8, '{member}'], [4, '{virtual}'], [10, '{implementation}']];
  for (let i = 0; i < ko.length; i++) {
    const mission = ko[i]; const translated = en[i];
    const variant = mission.variants[0]; const english = translated.variants[0];
    assert.equal(mission.id, `7-${i + 1}`);
    assert.doesNotMatch(JSON.stringify(translated), /[가-힣]/u);
    assert.ok(mission.tools.length >= 2 && mission.tools.length <= 4);
    const [line, token] = hintTargets[i];
    assert.ok(variant.template.split('\n')[line - 1].includes(token));
    assert.ok(mission.hints.some(h => h.includes(`${line}번 줄`)));
    for (const fixture of variant.tests) {
      const a = run(variant, correct(variant), fixture);
      const b = run(english, correct(english), fixture, 'en');
      assert.equal(a.source.replace(/\/\/.*$/gm, ''), b.source.replace(/\/\/.*$/gm, ''));
      assert.ok(a.result.ok, JSON.stringify(a.result.error));
      assert.ok(a.verdict.pass, JSON.stringify(a.verdict));
      assert.ok(b.result.ok, JSON.stringify(b.result.error));
      assert.ok(b.verdict.pass, JSON.stringify(b.verdict));
    }
  }
});

test('each misconception card is rejected with its classification or compile error', () => {
  for (const mission of missions('ko')) {
    const variant = mission.variants[0];
    for (const [key, options] of Object.entries(variant.blanks)) {
      for (let index = 1; index < options.length; index++) {
        const option = options[index];
        assert.ok(option.why && option.errorType);
        let rejected = false;
        for (const fixture of variant.tests) {
          const { result, verdict } = run(variant, { ...correct(variant), [key]: index }, fixture);
          if (!result.ok) {
            assert.equal(result.stage, 'compile', `${mission.id} ${key}`);
            if (mission.id === '7-4') assert.equal(result.error.code, 'abstractInstantiation');
            rejected = true;
          } else if (!verdict.pass) {
            assert.equal(verdict.errorType, option.errorType);
            rejected = true;
          }
        }
        assert.ok(rejected, `${mission.id} ${key} option ${index} unexpectedly passed`);
      }
    }
  }
});

test('dispatch distinguishes static and dynamic calls and pointer spellings', () => {
  const variant = missions('ko')[2].variants[0];
  const fixture = variant.tests[0];
  const dynamic = run(variant, correct(variant), fixture);
  const fixed = run(variant, { ...correct(variant), virtual: 1 }, fixture);
  assert.equal(dynamic.result.output.trim(), '7 7');
  assert.equal(fixed.result.output.trim(), '1 1');
  for (const [result, isVirtual] of [[dynamic.result, true], [fixed.result, false]]) {
    const events = result.steps.flatMap(step => step.events || []).filter(event => event.type === 'dispatch' && event.method === 'work');
    assert.equal(events.length, 2);
    assert.ok(events.every(event => event.static === 'Robot' && event.dynamic === 'RepairRobot' && event.virtual === isVirtual));
  }
});

test('both an abstract base and an incomplete derived class cannot be instantiated', () => {
  const variant = missions('ko')[3].variants[0];
  for (const selection of [{ ...correct(variant), object: 1 }, { ...correct(variant), implementation: 1 }]) {
    const { result } = run(variant, selection, variant.tests[0]);
    assert.equal(result.stage, 'compile');
    assert.equal(result.error.code, 'abstractInstantiation');
  }
});
