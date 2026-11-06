import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../src/missions.js');
M.loadAllChapters();
const Sim = require('../src/cppsim.js');
M.setLang('en');
const missions = M.getMissions('en').filter(m => m.id.startsWith('4-'));

function run(v, choices, sample) {
  const source = M.buildBlankSource(v, choices, sample.params);
  const result = Sim.run(source, { input: sample.input, lang: 'en' });
  return { result, verdict: v.check(result, sample, M.h) };
}
function visitEnglish(value) {
  if (typeof value === 'string') assert.doesNotMatch(value, /[\u1100-\u11ff\uac00-\ud7a3]/u);
  else if (Array.isArray(value)) value.forEach(visitEnglish);
  else if (value && typeof value === 'object') Object.values(value).forEach(visitEnglish);
}

test('warehouse missions have bilingual, consistent code and specific hints', () => {
  assert.equal(missions.length, 4);
  const korean = M.getMissions('ko').filter(m => m.id.startsWith('4-'));
  const targets = {
    '4-1': { 4: 'int parts[4]', 6: 'parts[{index}]', 7: 'cout << {show}' },
    '4-2': { 7: 'for (int i = 0; {condition}', 8: 'total += {item}' },
    '4-3': { 4: 'int grid[2][3]', 7: 'grid[{row}][{col}]', 8: 'grid[1][2]' },
    '4-4': { 5: 'char signal[8]', 6: 'signal[0]', 9: 'while (signal[i] {end})', 10: '{classify}(signal[i])' },
  };
  const strip = s => s.replace(/\/\/[^\n]*/g, '');
  for (let i = 0; i < missions.length; i++) {
    const mission = missions[i], variant = mission.variants[0];
    visitEnglish(mission);
    assert.equal(strip(variant.template), strip(korean[i].variants[0].template));
    assert.equal(mission.hints.length, 4);
    assert.ok(mission.tools.length >= 2 && mission.tools.length <= 4);
    for (const [line, text] of Object.entries(targets[mission.id])) {
      assert.ok(variant.template.split('\n')[Number(line) - 1].includes(text), `${mission.id} line ${line}`);
    }
    for (const hint of mission.hints) {
      for (const match of hint.matchAll(/lines? (\d+)(?:[–-](\d+))?/g)) {
        assert.ok(Number(match[1]) <= variant.template.split('\n').length);
        if (match[2]) assert.ok(Number(match[2]) <= variant.template.split('\n').length);
      }
    }
  }
});

test('correct cards handle every inventory, grid and signal input', () => {
  for (const mission of missions) {
    const v = mission.variants[0];
    const choices = Object.fromEntries(Object.keys(v.blanks).map(k => [k, 0]));
    for (const sample of v.tests) {
      const { result, verdict } = run(v, choices, sample);
      assert.equal(result.ok, true, `${mission.id} ${sample.input}: ${JSON.stringify(result.error)}`);
      assert.equal(verdict.pass, true, `${mission.id} ${sample.input}: ${JSON.stringify(verdict)}`);
    }
  }
});

test('each misconception card fails on a revealing input with its classification', () => {
  const expected = {
    '4-1': { index: ['index', 'index'], show: ['index'] },
    '4-2': { condition: ['arrayBoundary', 'arrayBoundary'], item: ['index'] },
    '4-3': { row: ['rowColumn'], col: ['rowColumn', 'rowColumn'] },
    '4-4': { end: ['charEnd', 'charEnd'], classify: ['characterKind'] },
  };
  for (const mission of missions) {
    const v = mission.variants[0];
    const correct = Object.fromEntries(Object.keys(v.blanks).map(k => [k, 0]));
    for (const [key, cards] of Object.entries(v.blanks)) {
      for (let i = 1; i < cards.length; i++) {
        const card = cards[i];
        assert.equal(card.errorType, expected[mission.id][key][i - 1]);
        assert.ok(card.why);
        const attempts = v.tests.map(sample => run(v, { ...correct, [key]: i }, sample));
        assert.ok(attempts.some(a => !a.verdict.pass), `${mission.id} ${key}=${card.code}`);
        if (mission.id === '4-2' && card.code === 'i <= 4') {
          for (const { result, verdict } of attempts) {
            assert.equal(result.error?.kind, 'ub');
            assert.equal(result.error?.code, 'indexOutOfBounds');
            assert.equal(verdict.errorType, 'arrayBoundary');
          }
        }
      }
    }
  }
});

test('third-slot prediction uses zero-based indexing', () => {
  assert.deepEqual(missions[0].predict.answersFrom({}), ['9']);
});
