// 모든 미션 프로그램을 clang++ 와 교육용 시뮬레이터로 실행해 결과를 비교한다(개발용, clang++ 필요).
// 사용: node scripts/crosscheck.mjs [장 번호...]   예) node scripts/crosscheck.mjs 3 5
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const Sim = require('../src/cppsim.js');
const M = require('../src/missions.js');
M.loadAllChapters();

const only = process.argv.slice(2).map(Number).filter(Boolean);
const MAX_COMBOS = 200;
const root = mkdtempSync(join(tmpdir(), 'crosscheck-'));
let seq = 0;

function combos(blanks) {
  let out = [{}];
  for (const key of Object.keys(blanks)) {
    out = out.flatMap((c) => blanks[key].map((_, i) => ({ ...c, [key]: i })));
    if (out.length > MAX_COMBOS) return out.slice(0, MAX_COMBOS);
  }
  return out;
}

function clang(source, input, files) {
  const dir = join(root, `p${seq++}`);
  mkdirSync(dir);
  writeFileSync(join(dir, 'main.cpp'), source);
  for (const [name, text] of Object.entries(files || {})) writeFileSync(join(dir, name), text);
  const c = spawnSync('clang++', ['-std=c++17', '-w', '-o', 'prog', 'main.cpp'], { cwd: dir, encoding: 'utf8' });
  if (c.status !== 0) {
    return { stage: /undefined symbols|linker command failed|undefined reference/i.test(c.stderr) ? 'link' : 'compile', detail: c.stderr.split('\n').find((l) => /error/.test(l)) || '' };
  }
  const r = spawnSync(join(dir, 'prog'), [], { cwd: dir, input: input || '', encoding: 'utf8', timeout: 5000 });
  const outFiles = {};
  for (const f of readdirSync(dir)) if (!['main.cpp', 'prog'].includes(f)) outFiles[f] = readFileSync(join(dir, f), 'utf8');
  return { stage: 'run', output: r.stdout, exit: r.status, signal: r.signal, stderr: r.stderr, files: outFiles };
}

function sim(source, input, files) {
  const r = Sim.run(source, { input: input || '', files: files || {} });
  return r;
}

const report = { programs: 0, mismatches: [], skipped: 0 };

function compare(where, source, test) {
  report.programs++;
  const a = clang(source, test.input, test.files);
  const b = sim(source, test.input, test.files);
  const simStage = b.stage === 'done' ? 'run' : b.stage === 'runtime' ? 'run' : b.stage;
  const bad = (why) => report.mismatches.push({ where, test: test.label && (test.label.ko || test.label), why, clang: a.stage === 'run' ? { output: a.output, exit: a.exit, signal: a.signal } : a, sim: { stage: b.stage, output: b.output, error: b.error && { code: b.error.code, kind: b.error.kind, line: b.error.line } } });
  if (a.stage !== simStage) { bad(`stage clang=${a.stage} sim=${b.stage}`); return; }
  if (a.stage !== 'run') return;
  // 정의되지 않은 동작·진단으로 멈춘 경우는 출력 비교 대상이 아니다
  if (b.error && ['ub', 'input'].includes(b.error.kind)) { report.skipped++; return; }
  if (b.error && b.error.code === 'uncaughtException') {
    if (a.exit === 0 && !a.signal) bad('sim: uncaught exception, clang exited normally');
    else if (!a.output.startsWith(b.output)) bad('output before exception differs');
    return;
  }
  if (b.error) { bad(`sim runtime error ${b.error.code}`); return; }
  if (/0x[0-9a-f]+/i.test(a.output)) { report.skipped++; return; }
  if (a.output !== b.output) { bad('output differs'); return; }
  for (const [name, text] of Object.entries(a.files || {})) {
    if (test.files && test.files[name] === text) continue;
    if ((b.files || {})[name] !== text) bad(`file ${name} differs`);
  }
}

for (const m of M.getMissions('ko')) {
  const ch = Number(m.id.split('-')[0]);
  if (only.length && !only.includes(ch)) continue;
  if (m.predict && m.predict.program) compare(`${m.id} predict`, m.predict.program, { label: 'predict' });
  if (m.kind === 'blanks') {
    for (const v of m.variants) {
      for (const c of combos(v.blanks)) {
        for (const t of v.tests || [{ label: 'base' }]) {
          compare(`${m.id}/${v.id} ${JSON.stringify(c)}`, M.buildBlankSource(v, c, t.params), t);
        }
      }
    }
  } else if (m.kind === 'editor') {
    for (const [label, src] of [['reference', m.reference], ['starter', m.starter]]) {
      for (const t of m.tests) compare(`${m.id} ${label}`, src, t);
    }
  }
}

rmSync(root, { recursive: true, force: true });
console.log(`programs ${report.programs}, mismatches ${report.mismatches.length}, skipped (UB/pointer output) ${report.skipped}`);
for (const x of report.mismatches) console.log(JSON.stringify(x));
process.exitCode = report.mismatches.length ? 1 : 0;
