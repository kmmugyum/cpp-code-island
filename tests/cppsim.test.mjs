import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Sim = require('../src/cppsim.js');

const prog = (body, { std = true, include = true } = {}) => [
  include ? '#include <iostream>' : '',
  std ? 'using namespace std;' : '',
  'int main() {',
  ...body,
  '}',
].join('\n');

test('int / int truncates, mixed division is double, doubles print like printf %g', () => {
  const r = Sim.run(prog(["cout << 5 / 2 << ' ' << 5 / 2.0 << ' ' << -7 / 2 << ' ' << 7 % 3 << ' ' << 1 / 3.0 << ' ' << 1000000.0 << ' ' << 2.0;"]));
  assert.equal(r.output, '2 2.5 -3 1 0.333333 1e+06 2');
});

test('left-to-right evaluation: integer division happens before * 1.0', () => {
  const r = Sim.run(prog(['int t = 5;', 'int n = 2;', 'cout << t / n * 1.0 << " " << 1.0 * t / n;']));
  assert.equal(r.output, '2 2.5');
});

test('a compile error anywhere means no line runs', () => {
  const r = Sim.run(prog(['cout << "A";', 'int x = 1', 'cout << x;']));
  assert.equal(r.ok, false);
  assert.equal(r.error.kind, 'compile');
  assert.equal(r.error.line, 5);
  assert.equal(r.steps.length, 0);
  assert.equal(r.output, '');
});

test('main with another name compiles but fails at link', () => {
  const r = Sim.run('#include <iostream>\nint Main() {\n    std::cout << "x";\n}');
  assert.equal(r.stage, 'link');
  assert.equal(r.error.kind, 'link');
});

test('bare cout needs using namespace std; std::cout does not; both need <iostream>', () => {
  assert.equal(Sim.run(prog(['cout << 1;'], { std: false })).error.kind, 'compile');
  assert.equal(Sim.run(prog(['std::cout << 1;'], { std: false })).output, '1');
  assert.match(Sim.run(prog(['std::cout << 1;'], { include: false, std: false })).error.message, /iostream/);
});

test('stream arrows: cin uses >>, cout uses <<', () => {
  assert.equal(Sim.run(prog(['int x;', 'cin << x;'])).error.kind, 'compile');
  assert.equal(Sim.run(prog(['cout >> 1;'])).error.kind, 'compile');
  const ok = Sim.run(prog(['int a;', 'int b;', 'cin >> a >> b;', 'cout << a - b;']), { input: '10 3' });
  assert.equal(ok.output, '7');
});

test('cin: int stops at the decimal point and leaves the rest; missing or bad input stops the checker', () => {
  const partial = Sim.run(prog(['int x;', 'cin >> x;', 'cout << x;']), { input: '2.5' });
  assert.equal(partial.output, '2');
  assert.equal(Sim.run(prog(['int x;', 'cin >> x;']), { input: '' }).error.kind, 'input');
  assert.equal(Sim.run(prog(['int x;', 'cin >> x;']), { input: 'abc' }).error.kind, 'input');
  assert.equal(Sim.run(prog(['double d;', 'cin >> d;', 'cout << d;']), { input: '2.5' }).output, '2.5');
});

test('reading an uninitialized variable is reported, never given a value', () => {
  const r = Sim.run(prog(['int x;', 'cout << x;']));
  assert.equal(r.ok, false);
  assert.equal(r.error.kind, 'ub');
  assert.equal(r.output, '');
});

test('steps say which variables a statement read, separately from what it changed', () => {
  const r = Sim.run(prog(['int usage = 35;', 'int e;', 'cin >> e;', 'e = e - usage;', 'cout << e;', 'e += 1;']), { input: '100' });
  const [declUsage, declE, cin, assign, cout, compound] = r.steps;
  assert.deepEqual([declUsage.kind, cin.kind, assign.kind, cout.kind], ['decl', 'cin', 'assign', 'cout']);
  assert.deepEqual(declE.reads, []);
  assert.deepEqual(cin.inputs, [{ name: 'e', text: '100' }]);
  assert.deepEqual(assign.reads.sort(), ['e', 'usage']);
  assert.deepEqual(assign.changed, ['e']);
  assert.deepEqual(cout.reads, ['e']);
  assert.deepEqual(cout.changed, []);
  assert.equal(cout.printed, '65');
  assert.deepEqual(compound.reads, ['e']);
});

test('integer division by zero and int overflow are runtime diagnostics', () => {
  assert.equal(Sim.run(prog(['int z = 0;', 'cout << 5 / z;'])).error.kind, 'runtime');
  assert.equal(Sim.run(prog(['int big = 2147483647;', 'big += 1;'])).error.kind, 'ub');
});

test('double stored in int truncates and says so', () => {
  const r = Sim.run(prog(['int share = 5 / 2.0;', 'cout << share;']));
  assert.equal(r.output, '2');
  assert.ok(r.steps[0].notes.some((n) => n.includes('소수점')));
});

test('% on double is a compile error (lecture 1 p.6)', () => {
  assert.equal(Sim.run(prog(['double d = 5.0;', 'cout << d % 2;'])).error.kind, 'compile');
});

test('undeclared and redeclared names are compile errors; case matters', () => {
  assert.match(Sim.run(prog(['int energy = 1;', 'cout << Energy;'])).error.message, /energy/);
  assert.equal(Sim.run(prog(['int a = 1;', 'int a = 2;'])).error.kind, 'compile');
});

test('each step records exactly the output it added and the variables it changed', () => {
  const r = Sim.run(prog(['int e;', 'cin >> e;', 'e = e - 35;', "cout << e << '\\n';", 'return 0;']), { input: '100' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.steps.map((s) => s.line), [4, 5, 6, 7, 8]);
  for (const s of r.steps) assert.ok(s.outAfter.startsWith(s.outBefore));
  assert.deepEqual(r.steps.map((s) => s.changed), [['e'], ['e'], ['e'], [], []]);
  assert.equal(r.steps[2].before[0].value, 100);
  assert.equal(r.steps[2].after[0].value, 65);
  assert.equal(r.steps[3].outAfter, '65\n');
  assert.equal(r.exitCode, 0);
});

test('control flow from later lectures is marked unsupported, not as a C++ error', () => {
  assert.equal(Sim.run(prog(['int x = 1;', 'if (x) x = 2;'])).error.kind, 'unsupported');
});

test('diagnostic codes are stable and messages follow the requested language', () => {
  const source = prog(['int energy = 2;', 'cout << Energy;']);
  const ko = Sim.run(source, { lang: 'ko' }).error;
  const en = Sim.run(source, { lang: 'en' }).error;
  assert.equal(ko.code, 'caseMismatch');
  assert.equal(en.code, ko.code);
  assert.equal(en.line, ko.line);
  assert.notEqual(en.message, ko.message);
  assert.doesNotMatch(en.message, /[가-힣]/);
  Sim.setLang('en');
  try {
    assert.equal(Sim.getLang(), 'en');
    assert.equal(Sim.run(source).error.message, en.message);
    assert.equal(Sim.run(source, { lang: 'ko' }).error.message, ko.message);
    assert.equal(Sim.getLang(), 'en');
  } finally {
    Sim.setLang('ko');
  }
});

test('English execution notes are localized', () => {
  const result = Sim.run(prog(['int x;', 'cin >> x;', 'x = x + 1;', 'cout << x;']), { lang: 'en', input: '2.5' });
  assert.equal(result.ok, true);
  assert.ok(result.steps.flatMap((step) => step.notes).length > 0);
  for (const note of result.steps.flatMap((step) => step.notes)) {
    assert.doesNotMatch(note, /[가-힣]/);
  }
});

test('diagnostic codes identify representative errors', () => {
  const cases = [
    ['linkNoMain', 'int Main() {}'],
    ['missingSemicolon', prog(['int x = 1'])],
    ['colonInsteadOfSemicolon', prog(['int x = 1:'])],
    ['semicolonBefore', prog(['int x = 1 int y;'])],
    ['nameNeedsStd', prog(['cout << 1;'], { std: false })],
    ['endlNeedsStd', prog(['std::cout << endl;'], { std: false })],
    ['wrongArrowCin', prog(['int x;', 'cin << x;'])],
    ['wrongArrowCout', prog(['cout >> 1;'])],
    ['singleArrow', prog(['cout < 1;'])],
    ['streamNeedsArrow', prog(['cout 1;'])],
    ['streamParen', prog(['cout(1);'])],
    ['cinUndeclared', prog(['cin >> x;'])],
    ['unknownIoName', prog(['print;'])],
    ['notInStd', prog(['std::foo;'])],
    ['undeclaredVar', prog(['x = 1;'])],
    ['undeclared', prog(['cout << x;'])],
    ['caseMismatch', prog(['int energy = 1;', 'cout << Energy;'])],
    ['uninitRead', prog(['int x;', 'cout << x;'])],
    ['uninitCompound', prog(['int x;', 'x += 1;'])],
    ['inputMissing', prog(['int x;', 'cin >> x;'])],
    ['inputBad', prog(['int x;', 'cin >> x;']), { input: 'bad' }],
    ['needIostream', prog(['cout << 1;'], { include: false })],
    ['intDivZero', prog(['cout << 1 / 0;'])],
    ['intOverflow', prog(['int x = 2147483647;', 'x += 1;'])],
    ['percentDouble', prog(['cout << 1.0 % 2;'])],
    ['percentDouble', prog(['double x = 1.0;', 'x %= 2;'])],
  ];
  for (const [code, source, options] of cases) {
    const ko = Sim.run(source, { ...options, lang: 'ko' });
    const en = Sim.run(source, { ...options, lang: 'en' });
    assert.equal(ko.error?.code, code, source);
    assert.equal(en.error?.code, code, source);
    assert.equal(en.error.line, ko.error.line, source);
    assert.notEqual(en.error.message, ko.error.message, source);
    assert.doesNotMatch(en.error.message, /[가-힣]/, source);
  }
});
