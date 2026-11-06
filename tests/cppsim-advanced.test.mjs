import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const Sim = createRequire(import.meta.url)('../src/cppsim.js');

const source = readFileSync(new URL('./corpus/advanced.cpp', import.meta.url), 'utf8');

test('templates, set, sort, operators, string, files, exceptions match clang++', () => {
  const r = Sim.run(source, { lang: 'en' });
  // clang++ -std=c++17 prints exactly this before aborting on the uncaught exception
  assert.equal(r.output, '7 2\n42\n1 3 5 3\n291\nB7\nrobot-7 7 rob 5\n2\ntoo big\n');
  assert.equal(r.error.code, 'uncaughtException');
  assert.equal(r.error.kind, 'runtime');
  assert.equal(r.files['log.txt'], 'line1\nline2\n');
  const events = r.steps.flatMap(s => s.events);
  assert.ok(events.some(e => e.type === 'throw' && e.exception === 'std::runtime_error' && e.what === 'too big'));
  assert.ok(events.some(e => e.type === 'catch' && e.what === 'too big'));
  assert.ok(events.some(e => e.type === 'file' && e.op === 'write' && e.name === 'log.txt'));
  assert.ok(events.some(e => e.type === 'file' && e.op === 'read'));
});

test('sort on set iterators and conflicting template deduction are compile errors', () => {
  const a = Sim.run('#include <set>\n#include <algorithm>\nusing namespace std;\nint main() { set<int> s; sort(s.begin(), s.end()); }');
  assert.equal(a.error.code, 'noMatchingFunction');
  const b = Sim.run('template <typename T> T mx(T a, T b) { return a; }\nint main() { mx(1, 2.5); }');
  assert.equal(b.error.code, 'templateDeduction');
});

test('const member rules and shallow copy double delete are diagnosed', () => {
  const c = Sim.run('class R { int e; public: R() { e = 0; } void set() { e = 1; } int get() const { e = 2; return e; } };\nint main() { R r; }');
  assert.equal(c.error.code, 'constViolation');
  const d = Sim.run(`class R { public: int* p; R() { p = new int(1); } ~R() { delete p; } };
int main() { R a; R b = a; }`);
  assert.equal(d.error.code, 'doubleFree');
});

test('a 3000-step program with arrays and objects runs quickly', () => {
  const t = Date.now();
  const r = Sim.run(`class C { public: int n; C() { n = 0; } void add(int k) { n += k; } };
int main() { int a[10]; for (int i = 0; i < 10; i++) a[i] = i; C c; for (int i = 0; i < 700; i++) c.add(a[i % 10]); }`, { maxSteps: 20000 });
  assert.equal(r.ok, true);
  assert.ok(r.steps.length > 2000);
  assert.ok(Date.now() - t < 1500);
});
