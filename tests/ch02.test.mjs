import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
const Sim = require('../src/cppsim.js');
M.loadAllChapters();
const missions = lang => M.getMissions(lang).filter(m => m.id.startsWith('2-'));
const source = (v, choices, sample) => M.buildBlankSource(v, choices, sample.params);
const correct = v => Object.fromEntries(Object.keys(v.blanks).map(k => [k, 0]));
const run = (v, choices, sample) => Sim.run(source(v, choices, sample), { input: sample.input, lang: 'en' });

function checkEnglish(value) {
  if (Array.isArray(value)) return value.forEach(checkEnglish);
  if (value && typeof value === 'object') {
    if (typeof value.en === 'string') assert.doesNotMatch(value.en, /[\uac00-\ud7a3\u1100-\u11ff]/u);
    Object.values(value).forEach(checkEnglish);
  }
}

test('chapter 2 has bilingual content and precise hint targets', () => {
  const ko = missions('ko');
  const en = missions('en');
  assert.equal(ko.length, 4);
  const targets = {
    '2-1': { 8: 'if (energy {op} 50)', 9: 'open = {yes}', 11: 'open = false' },
    '2-2': { 10: 'destination = 10', 11: '{stop1}', 12: 'case 2', 13: 'destination = 20', 14: '{stop2}' },
    '2-3': { 7: 'increment = {step}', 8: '{loop}' },
    '2-4': { 8: 'for (int i = {start}; i {op} count; i++)', 9: 'built++' },
  };
  for (let i = 0; i < ko.length; i++) {
    const a = ko[i], b = en[i];
    assert.equal(a.id, b.id);
    assert.equal(a.hints.length, 4);
    assert.ok(a.tools.length >= 2);
    const strip = s => s.replace(/\/\/[^\n]*/g, '');
    assert.equal(strip(a.variants[0].template), strip(b.variants[0].template));
    checkEnglish(b);
    const lines = b.variants[0].template.split('\n');
    for (const [line, code] of Object.entries(targets[b.id])) assert.ok(lines[Number(line) - 1].includes(code), `${b.id} line ${line}`);
  }
});

test('correct cards pass all tests and every wrong card exposes its misconception', () => {
  M.setLang('en');
  const types = M.getErrorTypes('en');
  for (const mission of missions('en')) {
    const v = mission.variants[0], good = correct(v);
    for (const sample of v.tests) {
      const result = run(v, good, sample);
      assert.equal(v.check(result, sample, M.h).pass, true, `${mission.id} input ${sample.input}: ${JSON.stringify(result.error)}`);
    }
    for (const [key, choices] of Object.entries(v.blanks)) {
      for (let i = 1; i < choices.length; i++) {
        const wrong = choices[i];
        assert.ok(wrong.why && types[wrong.errorType], `${mission.id} ${key} feedback`);
        const attempts = v.tests.map(sample => {
          const result = run(v, { ...good, [key]: i }, sample);
          assert.equal(result.ok, true, `${mission.id} ${key}: ${JSON.stringify(result.error)}`);
          return v.check(result, sample, M.h);
        });
        assert.ok(attempts.some(verdict => !verdict.pass), `${mission.id} ${key} choice ${i}`);
      }
    }
  }
});

test('missing break prediction follows the executed fall-through', () => {
  const mission = missions('en').find(m => m.id === '2-2');
  const result = Sim.run(mission.predict.program, { lang: 'en' });
  assert.equal(result.ok, true);
  assert.deepEqual(mission.predict.answersFrom(result), ['20']);
});
