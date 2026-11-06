import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
require('../src/missions/ch05.js');
const Sim = require('../src/cppsim.js');
const missions = lang => M.getMissions(lang).filter(m => m.id.startsWith('5-'));
const correct = variant => Object.fromEntries(Object.keys(variant.blanks).map(key => [key, 0]));
const execute = (variant, choices, fixture, lang) => {
  M.setLang(lang);
  const source = M.buildBlankSource(variant, choices, fixture.params);
  const result = Sim.run(source, { input: fixture.input || '', lang });
  return { source, result, verdict: variant.check(result, fixture, M.h) };
};
const stripComments = source => source.replace(/\/\/.*$/gm, '');

test('all four pointer missions pass every fixture in both languages', () => {
  const ko = missions('ko'), en = missions('en');
  assert.deepEqual(ko.map(m => m.id), ['5-1', '5-2', '5-3', '5-4']);
  assert.equal(en.length, 4);
  for (let i = 0; i < ko.length; i++) {
    const mission = ko[i], english = en[i];
    assert.doesNotMatch(JSON.stringify(english), /[가-힣]/u);
    assert.ok(mission.tools.length >= 2 && mission.tools.length <= 4);
    const variant = mission.variants[0], translated = english.variants[0];
    for (let j = 0; j < variant.tests.length; j++) {
      const a = execute(variant, correct(variant), variant.tests[j], 'ko');
      const b = execute(translated, correct(translated), translated.tests[j], 'en');
      assert.equal(stripComments(a.source), stripComments(b.source), mission.id);
      assert.ok(a.result.ok, `${mission.id}: ${JSON.stringify(a.result.error)}`);
      assert.ok(a.verdict.pass, `${mission.id}: ${JSON.stringify(a.verdict)}`);
      assert.ok(b.result.ok, `${mission.id}: ${JSON.stringify(b.result.error)}`);
      assert.ok(b.verdict.pass, `${mission.id}: ${JSON.stringify(b.verdict)}`);
    }
  }
});

test('each wrong card fails its intended test without grading undefined output', () => {
  for (const mission of missions('ko')) {
    const variant = mission.variants[0];
    for (const [key, options] of Object.entries(variant.blanks)) {
      for (let i = 1; i < options.length; i++) {
        assert.ok(options[i].why && options[i].errorType);
        let observed = false;
        for (const fixture of variant.tests) {
          const { result, verdict } = execute(variant, { ...correct(variant), [key]: i }, fixture, 'ko');
          if (!result.ok) {
            observed = true;
            assert.ok(result.error.kind === 'compile' || result.error.code === 'nullDeref', `${mission.id} ${key}: ${JSON.stringify(result.error)}`);
          } else if (!verdict.pass) {
            observed = true;
            assert.equal(verdict.errorType, options[i].errorType, `${mission.id} ${key} ${i}`);
          }
        }
        assert.ok(observed, `${mission.id} ${key} option ${i} unexpectedly passed`);
      }
    }
  }
});

test('hint line citations identify the promised code', () => {
  const targets = [
    [[4, '{link}'], [5, '{read}']],
    [[6, '{action}'], [7, '{read}']],
    [[7, '{target}'], [9, '{guard}'], [10, '*selected']],
    [[4, 'ptr = cells'], [5, '{advance}'], [6, '{read}']],
  ];
  missions('ko').forEach((mission, i) => {
    const lines = mission.variants[0].template.split('\n');
    for (const [line, token] of targets[i]) {
      assert.ok(lines[line - 1].includes(token), `${mission.id} line ${line}`);
      assert.ok(mission.hints.some(h => new RegExp(`(?:${line}줄|${line}~\\d+줄|\\d+~${line}줄)`).test(h)), `${mission.id} hint line ${line}`);
    }
  });
});

test('shared pointer prediction describes the base repair', () => {
  const mission = missions('ko')[1];
  assert.deepEqual(mission.predict.answersFrom({}), ['40']);
  const variant = mission.variants[0];
  const { result } = execute(variant, correct(variant), variant.tests[0], 'ko');
  const battery = M.h.cell(result, 'battery');
  const reading = M.h.cell(result, 'reading');
  assert.equal(Number(battery.value ?? battery.shown), 40);
  assert.equal(Number(reading.value ?? reading.shown), 40);
  assert.ok(M.h.steps(result).some(step => (step.changed || []).includes('battery')));
});
