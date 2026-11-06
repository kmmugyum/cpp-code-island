import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
const Sim = require('../src/cppsim.js');
M.loadAllChapters();
M.setLang('en');
const english = M.getMissions('en').filter(m => m.id.startsWith('3-'));
const korean = M.getMissions('ko').filter(m => m.id.startsWith('3-'));
const correct = v => Object.fromEntries(Object.keys(v.blanks).map(k => [k, 0]));
function run(m, selections, sample) {
  const v = m.variants[0];
  const source = M.buildBlankSource(v, selections, sample.params);
  const result = Sim.run(source, { input: sample.input, lang: 'en' });
  return { result, verdict: v.check(result, sample, M.h) };
}
function noHangul(value) {
  if (typeof value === 'string') assert.doesNotMatch(value, /[\uac00-\ud7a3\u1100-\u11ff]/u);
  else if (Array.isArray(value)) value.forEach(noHangul);
  else if (value && typeof value === 'object') Object.values(value).forEach(noHangul);
}

test('chapter 3 content and translations preserve code and targeted hint lines', () => {
  assert.deepEqual(english.map(m => m.id), ['3-1', '3-2', '3-3', '3-4']);
  noHangul(english);
  const targets = {
    '3-1': { 6: 'return {calc}', 13: 'repairCost(a)', 14: 'repairCost({argument})' },
    '3-2': { 6: '{body}', 13: 'int remaining = {use}', 14: 'cout << remaining' },
    '3-3': { 4: '{declaration}', 9: 'adjust(value)', 14: 'int adjust(int value)', 17: 'return {returned}' },
    '3-4': { 4: 'void charge({param})', 6: 'energy += {amount}', 12: 'charge(energy)', 13: 'cout << energy' },
  };
  for (let i = 0; i < english.length; i++) {
    const m = english[i], v = m.variants[0], ko = korean[i].variants[0];
    assert.equal(m.hints.length, 4);
    assert.ok(m.tools.length >= 2);
    assert.equal(v.template.replace(/\/\/[^\n]*/g, ''), ko.template.replace(/\/\/[^\n]*/g, ''));
    const lines = v.template.split('\n');
    for (const [line, text] of Object.entries(targets[m.id])) assert.ok(lines[Number(line) - 1].includes(text), `${m.id}:${line}`);
    for (const hint of m.hints) for (const match of hint.matchAll(/lines? (\d+)(?:[–-](\d+))?/g)) {
      assert.ok(targets[m.id][match[1]], `${m.id}: ${hint}`);
      if (match[2]) assert.ok(targets[m.id][match[2]], `${m.id}: ${hint}`);
    }
  }
});

test('correct choices meet every test through the registered mission API', () => {
  for (const m of english) for (const sample of m.variants[0].tests) {
    const { result, verdict } = run(m, correct(m.variants[0]), sample);
    assert.equal(verdict.pass, true, `${m.id}: ${JSON.stringify({ sample, result, verdict })}`);
  }
});

test('each wrong card exposes its named misconception or declaration diagnostic', () => {
  for (const m of english) {
    const v = m.variants[0];
    for (const [key, cards] of Object.entries(v.blanks)) for (let index = 1; index < cards.length; index++) {
      const card = cards[index];
      assert.ok(card.why && card.errorType, `${m.id} ${key} ${index}`);
      const { result, verdict } = run(m, { ...correct(v), [key]: index }, v.tests[0]);
      assert.equal(verdict.pass, false, `${m.id} ${key} ${index}`);
      assert.equal(verdict.errorType, card.errorType, `${m.id} ${key} ${index}: ${JSON.stringify(result.error)}`);
      if (m.id === '3-3' && key === 'declaration') {
        assert.equal(result.error.code, index === 1 ? 'undeclaredFunction' : 'undefinedFunction');
        assert.equal(result.stage, index === 1 ? 'compile' : 'link');
      } else assert.equal(result.ok, true, `${m.id} ${key} ${index}`);
    }
  }
});

test('value parameter prediction contrasts copy and caller; reference updates caller', () => {
  const m = english.find(m => m.id === '3-4');
  const prediction = Sim.run(m.predict.program, { lang: 'en' });
  assert.equal(prediction.ok, true);
  assert.deepEqual(m.predict.answersFrom(prediction), ['50', '30']);
  const { result } = run(m, correct(m.variants[0]), m.variants[0].tests[0]);
  assert.equal(Number(M.h.cell(result, 'energy').shown), 50);
  assert.ok(result.steps.some(step => step.changed?.includes('energy')));
});

test('return and scope are observed in caller cells rather than output alone', () => {
  const second = english.find(m => m.id === '3-2');
  const third = english.find(m => m.id === '3-3');
  const returned = run(second, correct(second.variants[0]), second.variants[0].tests[0]).result;
  assert.equal(Number(M.h.cell(returned, 'remaining').shown), 22);
  const scoped = run(third, correct(third.variants[0]), third.variants[0].tests[0]).result;
  assert.equal(Number(M.h.cell(scoped, 'value').shown), 5);
  assert.equal(Number(M.h.cell(scoped, 'result').shown), 7);
});
