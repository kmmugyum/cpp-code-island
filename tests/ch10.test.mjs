import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
const Sim = require('../src/cppsim.js');
require('../src/missions/ch10.js');

const get = lang => M.getMissions(lang).filter(m => m.id.startsWith('10-'));
const correct = variant => Object.fromEntries(Object.keys(variant.blanks).map(key => [key, 0]));
function run(variant, scenario, choices, lang) {
  const source = M.buildBlankSource(variant, choices, scenario.params);
  return Sim.run(source, { input: scenario.input || '', files: scenario.files || {}, lang });
}

test('chapter 10 bilingual templates, cards, scenes and cited hint lines', () => {
  const ko = get('ko'), en = get('en');
  assert.equal(ko.length, 4);
  assert.deepEqual(ko.map(m => m.id), ['10-1', '10-2', '10-3', '10-4']);
  const hintTargets = [
    [[9, '{save}'], [13, '{restore}']],
    [[8, '{word}'], [10, '{line}']],
    [[16, '{target}'], [18, '{qualifier}']],
    [[11, '{throwing}'], [15, '{handling}']],
  ];
  for (let i = 0; i < ko.length; i++) {
    const mission = ko[i];
    assert.equal(mission.hints.length, 4);
    assert.ok(mission.tools.length >= 2 && mission.tools.length <= 4);
    assert.ok(mission.lecture.quotes.length);
    assert.doesNotMatch(JSON.stringify(en[i]), /[\uac00-\ud7af]/);
    for (const [line, target] of hintTargets[i]) {
      assert.ok(mission.hints[0].includes(String(line)) || (mission.id === '10-2' && mission.hints[0].includes('8~10')));
      assert.ok(mission.variants[0].template.split('\n')[line - 1].includes(target));
    }
    for (let v = 0; v < mission.variants.length; v++) {
      assert.equal(mission.variants[v].template.replace(/\/\/.*$/gm, ''), en[i].variants[v].template.replace(/\/\/.*$/gm, ''));
      for (const choices of Object.values(mission.variants[v].blanks)) {
        for (const choice of choices.slice(1)) {
          assert.ok(choice.why && choice.errorType);
          assert.ok(M.getErrorTypes('ko')[choice.errorType]);
        }
      }
    }
  }
  assert.equal(ko[1].apply, 'variant');
  assert.equal(ko[3].apply, 'variant');
  assert.equal(M.classifySimError({ code: 'constViolation' }), 'constQuery');
});

for (const lang of ['ko', 'en']) {
  test(`chapter 10 correct cards and diagnostic alternatives (${lang})`, () => {
    M.setLang(lang);
    for (const mission of get(lang)) for (const variant of mission.variants) {
      const selected = correct(variant);
      for (const scenario of variant.tests) {
        const result = run(variant, scenario, selected, lang);
        assert.equal(variant.check(result, scenario, M.h).pass, true, `${mission.id}/${variant.id}/${scenario.label}: ${JSON.stringify(result.error)}`);
      }
      for (const [key, choices] of Object.entries(variant.blanks)) for (let i = 1; i < choices.length; i++) {
        const outcomes = variant.tests.map(scenario => {
          const result = run(variant, scenario, { ...selected, [key]: i }, lang);
          return { result, verdict: variant.check(result, scenario, M.h) };
        });
        assert.ok(outcomes.some(({ result, verdict }) => !verdict.pass && (!result.ok || verdict.errorType === choices[i].errorType)), `${mission.id}/${variant.id}: ${key} alternative ${i} should be diagnosed as ${choices[i].errorType}`);
        if (choices[i].errorType === 'constQuery') {
          assert.ok(outcomes.some(({ result }) => !result.ok && result.error.code === 'constViolation'));
        }
      }
    }
  });
}

test('archive and final operation reject hardcoded saved values', () => {
  M.setLang('en');
  const missions = get('en');
  for (const [id, variantId, from, to] of [
    ['10-1', 'base', 'cin >> power;', 'power = 8;'],
    ['10-4', 'apply', 'game.restore(saved);', 'game.restore(6);'],
  ]) {
    const variant = missions.find(m => m.id === id).variants.find(v => v.id === variantId);
    const scenario = variant.tests[1];
    const source = M.buildBlankSource(variant, correct(variant), scenario.params).replace(from, to);
    assert.equal(variant.check(Sim.run(source, { input: scenario.input, lang: 'en' }), scenario, M.h).pass, false);
  }
});

test('file and exception evidence is part of grading', () => {
  M.setLang('en');
  const missions = get('en');
  const archive = missions[0].variants[0], archiveTest = archive.tests[0];
  const stored = run(archive, archiveTest, correct(archive), 'en');
  assert.equal(stored.files['robot.txt'], '8');
  assert.equal(archive.check({ ...stored, files: {} }, archiveTest, M.h).pass, false);
  const final = missions[3].variants.find(v => v.id === 'apply'), failure = final.tests[2];
  const result = run(final, failure, correct(final), 'en');
  const allEvents = result.steps.flatMap(step => step.events || []);
  for (const kind of ['throw', 'catch']) {
    assert.ok(allEvents.some(e => e.type === kind && /^(std::)?runtime_error$/.test(e.exception) && e.what === 'bad power'));
  }
  const withoutEvents = { ...result, steps: result.steps.map(step => ({ ...step, events: (step.events || []).filter(e => e.type !== 'catch') })) };
  assert.equal(final.check(withoutEvents, failure, M.h).pass, false);
});
