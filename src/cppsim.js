/*
 * CppSim — 1장(Lecture 1) 범위만 지원하는 교육용 C++ 시뮬레이터.
 * 실제 컴파일러가 아니다. 지원 범위:
 *   #include <iostream>, using namespace std;, int main() { ... }
 *   int/double/char/bool 변수 선언·초기화·대입(=, +=, -=, *=, /=, %=), ++/--
 *   + - * / % 와 괄호, cout <<, cin >>, endl, return
 * 실행 결과는 줄 단위 기록(steps)으로 돌려주며 화면의 실행 줄·출력·변수 표가 모두 이 기록을 쓴다.
 */
(function (global) {
  'use strict';

  const INT_MIN = -2147483648;
  const INT_MAX = 2147483647;
  const TYPE_NAMES = ['int', 'double', 'char', 'bool'];
  const KNOWN_HEADERS = ['iostream'];
  const OPERATORS = ['<<', '>>', '::', '+=', '-=', '*=', '/=', '%=', '++', '--',
    '+', '-', '*', '/', '%', '=', '(', ')', '{', '}', ';', ',', '<', '>', ':'];

  class SimError extends Error {
    // kind: compile | link | runtime | ub | input | unsupported
    constructor(kind, line, message) {
      super(message);
      this.kind = kind;
      this.line = line;
    }
  }

  const compileError = (line, msg) => new SimError('compile', line, msg);

  // ---------------------------------------------------------------- tokenizer

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    let line = 1;
    let lineStart = true;
    const n = src.length;

    const push = (t, v, extra) => tokens.push(Object.assign({ t, v, line }, extra));

    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; lineStart = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const startLine = line;
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') line++;
          i++;
        }
        if (i >= n) throw compileError(startLine, '/* 로 시작한 주석이 */ 로 닫히지 않았습니다.');
        i += 2;
        continue;
      }
      if (c === '#') {
        if (!lineStart) throw compileError(line, '# 전처리 명령은 줄의 맨 앞에 와야 합니다.');
        let j = i;
        while (j < n && src[j] !== '\n') j++;
        push('pp', src.slice(i, j).trim());
        i = j;
        continue;
      }
      lineStart = false;

      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        const text = m[0];
        const isDouble = text.includes('.') || /[eE]/.test(text);
        if (/[A-Za-z_]/.test(src[i + text.length] || '')) {
          throw compileError(line, `'${text}${src[i + text.length]}…' — 이름은 숫자로 시작할 수 없습니다.`);
        }
        push('num', Number(text), { isDouble, text });
        i += text.length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
        push('id', m[0]);
        i += m[0].length;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        let value = '';
        while (j < n && src[j] !== '"') {
          if (src[j] === '\n') throw compileError(line, '문자열 "…" 이 같은 줄에서 닫히지 않았습니다.');
          if (src[j] === '\\') {
            value += unescape(src[j + 1], line);
            j += 2;
          } else {
            value += src[j];
            j++;
          }
        }
        if (j >= n) throw compileError(line, '문자열 "…" 이 닫히지 않았습니다.');
        push('str', value, { text: src.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
      if (c === "'") {
        let j = i + 1;
        let value;
        const escaped = src[j] === '\\';
        if (escaped) { value = unescape(src[j + 1], line); j += 2; } else { value = src[j]; j += 1; }
        if (src[j] !== "'" || value === undefined || (!escaped && (value === "'" || value === '\n'))) {
          throw compileError(line, "문자 리터럴은 '를 하나의 문자로 감싸야 합니다. 예: 'a', '\\n'");
        }
        push('chr', value.charCodeAt(0), { text: src.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
      const op = OPERATORS.find((o) => src.startsWith(o, i));
      if (op) {
        push('op', op);
        i += op.length;
        continue;
      }
      throw compileError(line, `알 수 없는 기호 '${c}' 입니다.`);
    }
    tokens.push({ t: 'eof', v: '', line });
    return tokens;
  }

  function unescape(ch, line) {
    const map = { n: '\n', t: '\t', '\\': '\\', '"': '"', "'": "'", '0': '\0', a: '\x07', b: '\b', r: '\r', f: '\f' };
    if (!(ch in map)) throw compileError(line, `알 수 없는 이스케이프 시퀀스 '\\${ch}' 입니다.`);
    return map[ch];
  }

  // ---------------------------------------------------------------- parser

  function parse(src) {
    const tokens = tokenize(src);
    let p = 0;
    const scope = new Map(); // name -> { type, line }
    let hasIostream = false;
    let usingStd = false;
    let mainName = null;
    let mainLine = 0;

    const peek = (k = 0) => tokens[p + k];
    const next = () => tokens[p++];
    const isOp = (tok, v) => tok.t === 'op' && tok.v === v;
    const prevLine = () => (p > 0 ? tokens[p - 1].line : 1);
    const show = (tok) => (tok.t === 'eof' ? '파일 끝' : `'${tok.text || tok.v}'`);

    function expectOp(v, what) {
      const tok = peek();
      if (isOp(tok, v)) return next();
      throw compileError(tok.line, `${what || `'${v}'`} 가 필요한데 ${show(tok)} 가 왔습니다.`);
    }

    function expectSemicolon() {
      const tok = peek();
      if (isOp(tok, ';')) return next();
      if (tok.line !== prevLine() || tok.t === 'eof' || isOp(tok, '}')) {
        throw compileError(prevLine(), "문장 끝에 ';' 가 없습니다. 문장은 ; 로 끝나야 합니다.");
      }
      if (isOp(tok, ':')) throw compileError(tok.line, "문장은 ':' 가 아니라 ';' 로 끝납니다.");
      throw compileError(tok.line, `${show(tok)} 앞에 ';' 가 필요합니다.`);
    }

    // ---- top level
    while (peek().t === 'pp' || (peek().t === 'id' && peek().v === 'using')) {
      const tok = next();
      if (tok.t === 'pp') {
        const m = /^#\s*include\s*<\s*([A-Za-z_.]+)\s*>$/.exec(tok.v);
        if (!m) {
          if (/^#\s*include/.test(tok.v)) throw compileError(tok.line, '#include 는 #include <iostream> 처럼 꺾쇠로 헤더 이름을 감쌉니다.');
          throw new SimError('unsupported', tok.line, '이 시뮬레이터는 #include 외의 전처리 명령을 지원하지 않습니다.');
        }
        if (!KNOWN_HEADERS.includes(m[1])) {
          throw compileError(tok.line, `헤더 <${m[1]}> 를 찾을 수 없습니다. 1장에서는 <iostream> 을 씁니다.`);
        }
        hasIostream = true;
      } else {
        const ns = next();
        if (!(ns.t === 'id' && ns.v === 'namespace')) throw compileError(ns.line, "using 다음에는 namespace 가 옵니다: using namespace std;");
        const name = next();
        if (!(name.t === 'id' && name.v === 'std')) throw compileError(name.line, 'using namespace 다음에 std 를 씁니다.');
        expectSemicolon();
        usingStd = true;
      }
    }

    // ---- int main() {
    const retType = next();
    if (retType.t !== 'id' || !TYPE_NAMES.concat('void').includes(retType.v)) {
      throw compileError(retType.line, `함수 정의는 반환 타입으로 시작합니다. 'int main() {' 이 필요한데 ${show(retType)} 가 왔습니다.`);
    }
    const fn = next();
    if (fn.t !== 'id') throw compileError(fn.line, `함수 이름이 필요한데 ${show(fn)} 가 왔습니다.`);
    if (retType.v !== 'int' && fn.v === 'main') throw compileError(retType.line, "main 함수는 int 를 반환해야 합니다: 'int main()'");
    mainName = fn.v;
    mainLine = fn.line;
    expectOp('(');
    expectOp(')');
    expectOp('{', "함수 본문을 여는 '{'");

    const body = [];
    while (!isOp(peek(), '}')) {
      if (peek().t === 'eof') throw compileError(prevLine(), "main 함수 본문을 닫는 '}' 가 없습니다.");
      body.push(statement());
    }
    const close = next();
    if (peek().t !== 'eof') {
      throw new SimError('unsupported', peek().line, '이 시뮬레이터는 main 함수 하나만 있는 프로그램을 실행합니다.');
    }

    return { body, mainName, mainLine, endLine: close.line };

    // ---- statements
    function statement() {
      const tok = peek();
      const line = tok.line;
      if (isOp(tok, ';')) { next(); return { kind: 'empty', line }; }
      if (isOp(tok, '{')) throw new SimError('unsupported', line, '블록 { } 은 2장부터 다룹니다. 이 시뮬레이터는 아직 지원하지 않습니다.');
      if (tok.t === 'id' && TYPE_NAMES.includes(tok.v)) return declaration();
      if (tok.t === 'id' && tok.v === 'return') {
        next();
        const expr = expression();
        expectSemicolon();
        return { kind: 'return', line, expr };
      }
      if (tok.t === 'id' && ['if', 'else', 'while', 'for', 'do', 'switch'].includes(tok.v)) {
        throw new SimError('unsupported', line, `'${tok.v}' 는 2장(Flow of Control)에서 배웁니다. 1장 시뮬레이터는 지원하지 않습니다.`);
      }
      const stream = streamName();
      if (stream) return streamStatement(stream, line);
      if (isOp(tok, '++') || isOp(tok, '--')) {
        next();
        const target = lvalue();
        expectSemicolon();
        return { kind: 'assign', line, name: target, op: tok.v === '++' ? '+=' : '-=', expr: lit('int', 1, line) };
      }
      if (tok.t === 'id' && peek(1).t === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '++', '--'].includes(peek(1).v)) {
        const target = lvalue();
        const op = next().v;
        if (op === '++' || op === '--') {
          expectSemicolon();
          return { kind: 'assign', line, name: target, op: op === '++' ? '+=' : '-=', expr: lit('int', 1, line) };
        }
        const expr = expression();
        checkAssignable(scope.get(target).type, expr, line, op);
        expectSemicolon();
        return { kind: 'assign', line, name: target, op, expr };
      }
      const expr = expression();
      expectSemicolon();
      return { kind: 'expr', line, expr };
    }

    function declaration() {
      const typeTok = next();
      const type = typeTok.v;
      const decls = [];
      for (;;) {
        const nameTok = next();
        if (nameTok.t !== 'id') throw compileError(nameTok.line, `${type} 다음에는 변수 이름이 와야 하는데 ${show(nameTok)} 가 왔습니다.`);
        if (TYPE_NAMES.includes(nameTok.v) || ['return', 'using', 'namespace', 'main'].includes(nameTok.v)) {
          throw compileError(nameTok.line, `'${nameTok.v}' 는 변수 이름으로 쓸 수 없습니다.`);
        }
        if (scope.has(nameTok.v)) {
          throw compileError(nameTok.line, `변수 '${nameTok.v}' 는 ${scope.get(nameTok.v).line}번 줄에서 이미 선언했습니다. 값을 바꾸려면 타입 없이 '${nameTok.v} = …;' 로 씁니다.`);
        }
        let init = null;
        if (isOp(peek(), '=')) {
          next();
          init = expression();
          checkAssignable(type, init, nameTok.line, '=');
        }
        scope.set(nameTok.v, { type, line: nameTok.line });
        decls.push({ name: nameTok.v, init });
        if (isOp(peek(), ',')) { next(); continue; }
        break;
      }
      expectSemicolon();
      return { kind: 'decl', line: typeTok.line, type, decls };
    }

    function streamName() {
      const tok = peek();
      if (tok.t !== 'id') return null;
      if (tok.v === 'std' && isOp(peek(1), '::') && peek(2).t === 'id' && ['cout', 'cin'].includes(peek(2).v)) {
        requireIostream(peek(2));
        p += 3;
        return tokens[p - 1].v;
      }
      if (tok.v === 'cout' || tok.v === 'cin') {
        if (scope.has(tok.v)) return null;
        requireIostream(tok);
        if (!usingStd) {
          throw compileError(tok.line, `'${tok.v}' 라는 이름을 찾을 수 없습니다. std::${tok.v} 로 쓰거나 위에 using namespace std; 를 추가하세요.`);
        }
        p += 1;
        return tok.v;
      }
      if (['print', 'printf', 'Cout', 'COUT', 'Cin', 'output', 'input'].includes(tok.v) && !scope.has(tok.v)) {
        throw compileError(tok.line, `'${tok.v}' 라는 이름은 선언되지 않았습니다. 화면 출력은 cout, 입력은 cin 입니다 (대소문자 구분).`);
      }
      if (tok.v === 'std' && isOp(peek(1), '::') && peek(2).t === 'id') {
        throw compileError(peek(2).line, `std 안에 '${peek(2).v}' 라는 이름이 없습니다. 출력은 std::cout, 입력은 std::cin 입니다.`);
      }
      return null;
    }

    function requireIostream(tok) {
      if (!hasIostream) {
        throw compileError(tok.line, `'${tok.v}' 는 <iostream> 에 들어 있습니다. 맨 위에 #include <iostream> 이 필요합니다.`);
      }
    }

    function streamStatement(stream, line) {
      const want = stream === 'cout' ? '<<' : '>>';
      const wrong = stream === 'cout' ? '>>' : '<<';
      const items = [];
      if (!(peek().t === 'op' && (peek().v === '<<' || peek().v === '>>'))) {
        if (isOp(peek(), '<') || isOp(peek(), '>')) {
          throw compileError(peek().line, `${stream} 다음에는 화살표 두 개 '${want}' 를 씁니다. '${peek().v}' 하나는 비교 연산자입니다.`);
        }
        if (isOp(peek(), '(')) {
          throw compileError(peek().line, `${stream} 은 함수처럼 괄호로 부르지 않습니다. ${stream} ${want} 값; 형태로 씁니다.`);
        }
        throw compileError(peek().line, `${stream} 다음에 '${want}' 가 필요합니다.`);
      }
      while (peek().t === 'op' && (peek().v === '<<' || peek().v === '>>')) {
        const opTok = next();
        if (opTok.v === wrong) {
          throw compileError(opTok.line, stream === 'cout'
            ? "cout 은 출력입니다. 데이터가 화면(cout) 쪽으로 흐르도록 '<<' 를 씁니다."
            : "cin 은 입력입니다. 데이터가 키보드(cin)에서 변수로 흐르도록 '>>' 를 씁니다.");
        }
        if (stream === 'cout') {
          items.push(streamOperand());
        } else {
          const tok = peek();
          if (tok.t !== 'id' || !scope.has(tok.v)) {
            if (tok.t === 'id') throw compileError(tok.line, `변수 '${tok.v}' 를 선언하지 않았습니다. cin 으로 읽기 전에 먼저 선언하세요.`);
            throw compileError(tok.line, `cin >> 다음에는 값을 담을 변수 이름이 와야 하는데 ${show(tok)} 가 왔습니다.`);
          }
          items.push(lvalue());
        }
      }
      expectSemicolon();
      return { kind: stream, line, items };
    }

    function streamOperand() {
      const tok = peek();
      if (tok.t === 'id' && (tok.v === 'endl' || (tok.v === 'std' && peek(2) && peek(2).v === 'endl'))) {
        if (tok.v === 'std') { p += 3; } else {
          if (!usingStd && !scope.has('endl')) throw compileError(tok.line, "'endl' 이름을 찾을 수 없습니다. std::endl 로 쓰거나 using namespace std; 를 추가하세요.");
          p += 1;
        }
        return { kind: 'endl', type: 'endl', line: tok.line };
      }
      return additive();
    }

    function lvalue() {
      const tok = next();
      if (tok.t !== 'id') throw compileError(tok.line, `값을 저장할 변수 이름이 필요한데 ${show(tok)} 가 왔습니다.`);
      if (!scope.has(tok.v)) throw compileError(tok.line, `변수 '${tok.v}' 를 선언하지 않았습니다. 예: int ${tok.v};`);
      return tok.v;
    }

    function checkAssignable(type, expr, line, op) {
      if (expr.type === 'string') {
        throw compileError(line, `문자열 "…" 은 ${type} 변수에 넣을 수 없습니다.`);
      }
      if (expr.type === 'endl') throw compileError(line, 'endl 은 cout 출력에서만 씁니다.');
      if (op === '%=' && (type === 'double' || expr.type === 'double')) {
        throw compileError(line, '% 나머지 연산은 정수끼리만 할 수 있습니다.');
      }
    }

    // ---- expressions: additive > multiplicative > unary > primary
    function expression() { return additive(); }

    function additive() {
      let left = multiplicative();
      while (isOp(peek(), '+') || isOp(peek(), '-')) {
        const op = next().v;
        const right = multiplicative();
        left = binary(op, left, right);
      }
      return left;
    }

    function multiplicative() {
      let left = unary();
      while (isOp(peek(), '*') || isOp(peek(), '/') || isOp(peek(), '%')) {
        const op = next().v;
        const right = unary();
        left = binary(op, left, right);
      }
      return left;
    }

    function unary() {
      if (isOp(peek(), '-') || isOp(peek(), '+')) {
        const opTok = next();
        const operand = unary();
        if (operand.type === 'string') throw new SimError('unsupported', opTok.line, '문자열에 부호를 붙이는 계산은 지원하지 않습니다.');
        return { kind: 'unary', op: opTok.v, operand, type: operand.type === 'double' ? 'double' : 'int', line: opTok.line };
      }
      return primary();
    }

    function primary() {
      const tok = next();
      if (tok.t === 'num') {
        if (!tok.isDouble && tok.v > INT_MAX) throw new SimError('unsupported', tok.line, 'int 범위를 넘는 정수 리터럴은 지원하지 않습니다.');
        return lit(tok.isDouble ? 'double' : 'int', tok.v, tok.line, tok.text);
      }
      if (tok.t === 'str') return { kind: 'lit', type: 'string', value: tok.v, text: tok.text, line: tok.line };
      if (tok.t === 'chr') return { kind: 'lit', type: 'char', value: tok.v, text: tok.text, line: tok.line };
      if (tok.t === 'id') {
        if (tok.v === 'true' || tok.v === 'false') return lit('bool', tok.v === 'true' ? 1 : 0, tok.line, tok.v);
        if (scope.has(tok.v)) return { kind: 'var', name: tok.v, type: scope.get(tok.v).type, line: tok.line };
        if (tok.v === 'endl') throw compileError(tok.line, 'endl 은 cout << 다음에만 씁니다.');
        if (tok.v === 'cout' || tok.v === 'cin') throw compileError(tok.line, `${tok.v} 는 문장 맨 앞에서 ${tok.v === 'cout' ? '<<' : '>>'} 와 함께 씁니다.`);
        const similar = [...scope.keys()].find((k) => k.toLowerCase() === tok.v.toLowerCase());
        if (similar) throw compileError(tok.line, `'${tok.v}' 는 선언되지 않았습니다. 대소문자가 다른 '${similar}' 를 뜻했나요? C++ 는 대소문자를 구분합니다.`);
        throw compileError(tok.line, `'${tok.v}' 는 선언되지 않은 이름입니다. 사용하기 전에 선언하세요.`);
      }
      if (isOp(tok, '(')) {
        const inner = expression();
        expectOp(')', "닫는 괄호 ')'");
        return inner;
      }
      if (tok.t === 'eof' || isOp(tok, ';')) throw compileError(tok.t === 'eof' ? prevLine() : tok.line, '값(식)이 와야 할 자리가 비어 있습니다.');
      throw compileError(tok.line, `값(식)이 와야 할 자리에 ${show(tok)} 가 왔습니다.`);
    }

    function binary(op, left, right) {
      const line = left.line;
      if (left.type === 'string' || right.type === 'string') {
        throw new SimError('unsupported', line, '1장 시뮬레이터는 문자열 "…" 로 계산하는 식을 지원하지 않습니다. 문자열은 cout 으로 출력만 합니다.');
      }
      if (op === '%' && (left.type === 'double' || right.type === 'double')) {
        throw compileError(line, '% 나머지 연산은 정수끼리만 할 수 있습니다. 실수(double)에는 쓸 수 없습니다.');
      }
      const type = left.type === 'double' || right.type === 'double' ? 'double' : 'int';
      return { kind: 'bin', op, left, right, type, line };
    }

    function lit(type, value, line, text) {
      return { kind: 'lit', type, value, text: text || String(value), line };
    }
  }

  // ---------------------------------------------------------------- runtime

  function formatDouble(v) {
    if (Number.isNaN(v)) return 'nan';
    if (!Number.isFinite(v)) return v > 0 ? 'inf' : '-inf';
    if (v === 0) return Object.is(v, -0) ? '-0' : '0';
    // printf("%g") 와 같은 규칙: 유효숫자 6자리, 지수가 -5 미만이거나 6 이상이면 지수 표기
    const [mant, expText] = v.toExponential(5).split('e');
    const exp = Number(expText);
    if (exp < -4 || exp >= 6) {
      const m = mant.replace(/\.?0+$/, '');
      return `${m}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
    }
    return v.toFixed(5 - exp).replace(/\.?0+$/, '');
  }

  function formatValue(type, value) {
    if (value === undefined) return '?';
    if (type === 'double') return formatDouble(value);
    if (type === 'char') return String.fromCharCode(value);
    return String(value);
  }

  function run(source, options) {
    const opts = Object.assign({ input: '', maxSteps: 500 }, options);
    const result = { stage: 'compile', ok: false, error: null, steps: [], output: '', vars: [], exitCode: null };
    let program;
    try {
      program = parse(source);
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = { kind: e.kind, line: e.line, message: e.message };
      return result;
    }
    if (program.mainName !== 'main') {
      result.stage = 'link';
      const caseHint = program.mainName.toLowerCase() === 'main' ? ` '${program.mainName}' 와 'main' 은 대소문자가 달라 다른 이름입니다.` : '';
      result.error = {
        kind: 'link',
        line: program.mainLine,
        message: `링크 오류: 프로그램이 시작할 함수 'main' 을 찾지 못했습니다.${caseHint} 컴파일은 통과했지만 링커가 실행 파일을 만들 수 없습니다.`,
      };
      return result;
    }

    result.stage = 'runtime';
    const vars = new Map(); // name -> { type, value }
    const order = [];
    let output = '';
    const input = { text: String(opts.input), pos: 0 };

    const snapshot = () => order.map((name) => {
      const v = vars.get(name);
      return { name, type: v.type, value: v.value, shown: formatValue(v.type, v.value) };
    });

    const toType = (type, value) => {
      if (type === 'int') return Math.trunc(value);
      if (type === 'char') return ((Math.trunc(value) % 256) + 256) % 256;
      if (type === 'bool') return value !== 0 ? 1 : 0;
      return value;
    };

    function checkInt(value, line) {
      if (value < INT_MIN || value > INT_MAX) {
        throw new SimError('ub', line, `int 가 담을 수 있는 범위(${INT_MIN} ~ ${INT_MAX})를 넘었습니다. 실제 C++에서는 정의되지 않은 동작이라 결과를 믿을 수 없습니다.`);
      }
      return value;
    }

    let reads = new Set(); // 현재 문장이 값을 읽은 변수

    function evaluate(expr) {
      switch (expr.kind) {
        case 'lit': return expr.value;
        case 'var': {
          const v = vars.get(expr.name);
          reads.add(expr.name);
          if (v.value === undefined) {
            throw new SimError('ub', expr.line, `변수 '${expr.name}' 에 값을 넣기 전에 읽었습니다. 실제 C++에서는 어떤 값이 나올지 정해져 있지 않습니다(정의되지 않은 동작).`);
          }
          return v.value;
        }
        case 'unary': {
          const val = evaluate(expr.operand);
          const out = expr.op === '-' ? -val : val;
          return expr.type === 'int' ? checkInt(out, expr.line) : out;
        }
        case 'bin': {
          const a = evaluate(expr.left);
          const b = evaluate(expr.right);
          if (expr.type === 'int') {
            if ((expr.op === '/' || expr.op === '%') && b === 0) {
              throw new SimError('runtime', expr.line, '정수를 0 으로 나눴습니다. 실제 C++에서는 프로그램이 비정상 종료되거나 결과를 알 수 없습니다.');
            }
            let out;
            switch (expr.op) {
              case '+': out = a + b; break;
              case '-': out = a - b; break;
              case '*': out = a * b; break;
              case '/': out = Math.trunc(a / b); break;
              default: out = a % b;
            }
            return checkInt(out, expr.line);
          }
          switch (expr.op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            default: return a / b;
          }
        }
        default:
          throw new Error(`unknown expr ${expr.kind}`);
      }
    }

    function conversionNote(targetType, valueType, value) {
      if (targetType === 'int' && valueType === 'double') {
        return `double 값 ${formatDouble(value)} 을 int 변수에 넣으면서 소수점 아래를 버렸습니다.`;
      }
      return null;
    }

    function readFromInput(type, name, line) {
      const rest = input.text.slice(input.pos);
      const ws = /^\s*/.exec(rest)[0].length;
      if (ws === rest.length) {
        throw new SimError('input', line, `cin 이 '${name}' 에 넣을 값을 기다리는데 입력이 더 없습니다. 입력 칸에 값을 넣으세요.`);
      }
      const body = rest.slice(ws);
      const pattern = type === 'double' ? /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/
        : type === 'char' ? /^\S/
          : type === 'bool' ? /^[01]/
            : /^[+-]?\d+/;
      const m = pattern.exec(body);
      if (!m) {
        const word = /^\S+/.exec(body)[0];
        throw new SimError('input', line, `'${word}' 는 ${type} 로 읽을 수 없습니다. 실제 C++에서는 cin 이 실패 상태가 되고 '${name}' 에 0 이 들어간 뒤 이후 입력도 읽지 않습니다.`);
      }
      input.pos += ws + m[0].length;
      let value = type === 'char' ? m[0].charCodeAt(0) : Number(m[0]);
      if (type === 'int') value = checkInt(value, line);
      const leftover = /^\S+/.exec(body.slice(m[0].length));
      return { value, text: m[0], leftover: leftover ? leftover[0] : null };
    }

    let steps = 0;
    try {
      for (const stmt of program.body) {
        if (stmt.kind === 'empty') continue;
        if (++steps > opts.maxSteps) throw new SimError('runtime', stmt.line, '실행 단계가 너무 많아 학습 검사기가 멈췄습니다.');
        const before = snapshot();
        const outBefore = output;
        const notes = [];
        const changed = [];
        const inputs = [];
        reads = new Set();
        let done = false;

        switch (stmt.kind) {
          case 'decl':
            for (const d of stmt.decls) {
              let value;
              if (d.init) {
                const raw = evaluate(d.init);
                const note = conversionNote(stmt.type, d.init.type, raw);
                if (note) notes.push(note);
                value = toType(stmt.type, raw);
                notes.push(`${d.name} 을(를) 만들고 ${formatValue(stmt.type, value)} 로 초기화했습니다.`);
              } else {
                notes.push(`${d.name} 을(를) 만들었습니다. 아직 값을 넣지 않았습니다(초기화 안 됨).`);
              }
              vars.set(d.name, { type: stmt.type, value });
              order.push(d.name);
              changed.push(d.name);
            }
            break;
          case 'assign': {
            const target = vars.get(stmt.name);
            const rhs = evaluate(stmt.expr);
            const resultType = stmt.op === '=' ? stmt.expr.type
              : (target.type === 'double' || stmt.expr.type === 'double' ? 'double' : 'int');
            let raw = rhs;
            if (stmt.op !== '=') {
              reads.add(stmt.name);
              if (target.value === undefined) {
                throw new SimError('ub', stmt.line, `변수 '${stmt.name}' 에 값을 넣기 전에 ${stmt.op} 로 읽었습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.`);
              }
              raw = evaluate({
                kind: 'bin', op: stmt.op[0], type: resultType, line: stmt.line,
                left: { kind: 'lit', value: target.value }, right: { kind: 'lit', value: rhs },
              });
            }
            const note = conversionNote(target.type, resultType, raw);
            if (note) notes.push(note);
            const oldShown = formatValue(target.type, target.value);
            target.value = toType(target.type, raw);
            notes.push(`${stmt.name}: ${oldShown} → ${formatValue(target.type, target.value)}`);
            changed.push(stmt.name);
            break;
          }
          case 'cout': {
            let piece = '';
            for (const item of stmt.items) {
              if (item.kind === 'endl') { piece += '\n'; continue; }
              piece += formatValue(item.type, evaluate(item));
            }
            output += piece;
            notes.push(`화면에 ${JSON.stringify(piece)} 를 출력했습니다. 변수 값은 바뀌지 않습니다.`);
            break;
          }
          case 'cin':
            for (const name of stmt.items) {
              const target = vars.get(name);
              const read = readFromInput(target.type, name, stmt.line);
              target.value = toType(target.type, read.value);
              changed.push(name);
              inputs.push({ name, text: read.text });
              notes.push(`입력에서 ${read.text} 을(를) 읽어 ${name} 에 넣었습니다.`);
              if (read.leftover && target.type === 'int' && /^\./.test(read.leftover)) {
                notes.push(`int 변수라 '${read.leftover}' 부분은 읽지 않고 입력에 남겨 두었습니다.`);
              }
            }
            break;
          case 'expr': {
            const v = evaluate(stmt.expr);
            notes.push(`식의 값 ${formatValue(stmt.expr.type, v)} 을 계산했지만 어디에도 저장하거나 출력하지 않았습니다.`);
            break;
          }
          case 'return': {
            const v = toType('int', evaluate(stmt.expr));
            result.exitCode = v;
            notes.push(v === 0 ? 'main 이 0 을 돌려주며 끝났습니다(정상 종료).' : `main 이 ${v} 를 돌려주며 끝났습니다(0 이 아니면 보통 오류를 뜻함).`);
            done = true;
            break;
          }
          default:
            throw new Error(`unknown stmt ${stmt.kind}`);
        }
        result.steps.push({
          line: stmt.line, kind: stmt.kind, before, after: snapshot(), outBefore, outAfter: output,
          printed: output.slice(outBefore.length), notes, changed, reads: [...reads], inputs,
        });
        if (done) break;
      }
      if (result.exitCode === null) {
        result.exitCode = 0;
        result.steps.push({
          line: program.endLine, kind: 'end', before: snapshot(), after: snapshot(), outBefore: output, outAfter: output,
          printed: '', notes: ["main 의 '}' 에 도달해 끝났습니다. main 은 return 이 없으면 0 을 돌려줍니다."], changed: [], reads: [], inputs: [],
        });
      }
      result.ok = true;
      result.stage = 'done';
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = { kind: e.kind, line: e.line, message: e.message, reads: [...reads] };
    }
    result.output = output;
    result.vars = snapshot();
    return result;
  }

  const api = { run, formatDouble, SimError };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.CppSim = api;
})(this);
