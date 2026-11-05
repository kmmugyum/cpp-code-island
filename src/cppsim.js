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

  const messages = {
    ko: {
      unclosedComment: p => '/* 로 시작한 주석이 */ 로 닫히지 않았습니다.',
      preprocessorPosition: p => '# 전처리 명령은 줄의 맨 앞에 와야 합니다.',
      numberName: p => `'${p[0]}${p[1]}…' — 이름은 숫자로 시작할 수 없습니다.`,
      stringNewline: p => '문자열 "…" 이 같은 줄에서 닫히지 않았습니다.',
      unclosedString: p => '문자열 "…" 이 닫히지 않았습니다.',
      badCharLiteral: p => "문자 리터럴은 '를 하나의 문자로 감싸야 합니다. 예: 'a', '\\n'",
      unknownSymbol: p => `알 수 없는 기호 '${p[0]}' 입니다.`,
      unknownEscape: p => `알 수 없는 이스케이프 시퀀스 '\\${p[0]}' 입니다.`,
      expectedToken: p => `${p[0]} 가 필요한데 ${p[1]} 가 왔습니다.`,
      missingSemicolon: p => "문장 끝에 ';' 가 없습니다. 문장은 ; 로 끝나야 합니다.",
      colonInsteadOfSemicolon: p => "문장은 ':' 가 아니라 ';' 로 끝납니다.",
      semicolonBefore: p => `${p[0]} 앞에 ';' 가 필요합니다.`,
      badInclude: p => '#include 는 #include <iostream> 처럼 꺾쇠로 헤더 이름을 감쌉니다.',
      unsupportedPreprocessor: p => '이 시뮬레이터는 #include 외의 전처리 명령을 지원하지 않습니다.',
      unknownHeader: p => `헤더 <${p[0]}> 를 찾을 수 없습니다. 1장에서는 <iostream> 을 씁니다.`,
      expectedNamespace: p => "using 다음에는 namespace 가 옵니다: using namespace std;",
      expectedStd: p => 'using namespace 다음에 std 를 씁니다.',
      expectedFunction: p => `함수 정의는 반환 타입으로 시작합니다. 'int main() {' 이 필요한데 ${p[0]} 가 왔습니다.`,
      expectedFunctionName: p => `함수 이름이 필요한데 ${p[0]} 가 왔습니다.`,
      mainReturnType: p => "main 함수는 int 를 반환해야 합니다: 'int main()'",
      unclosedMain: p => "main 함수 본문을 닫는 '}' 가 없습니다.",
      multipleFunctions: p => '이 시뮬레이터는 main 함수 하나만 있는 프로그램을 실행합니다.',
      unsupportedBlock: p => '블록 { } 은 2장부터 다룹니다. 이 시뮬레이터는 아직 지원하지 않습니다.',
      unsupportedControl: p => `'${p[0]}' 는 2장(Flow of Control)에서 배웁니다. 1장 시뮬레이터는 지원하지 않습니다.`,
      expectedVariableName: p => `${p[0]} 다음에는 변수 이름이 와야 하는데 ${p[1]} 가 왔습니다.`,
      invalidVariableName: p => `'${p[0]}' 는 변수 이름으로 쓸 수 없습니다.`,
      redeclaration: p => `변수 '${p[0]}' 는 ${p[1]}번 줄에서 이미 선언했습니다. 값을 바꾸려면 타입 없이 '${p[2]} = …;' 로 씁니다.`,
      nameNeedsStd: p => `'${p[0]}' 라는 이름을 찾을 수 없습니다. std::${p[1]} 로 쓰거나 위에 using namespace std; 를 추가하세요.`,
      unknownIoName: p => `'${p[0]}' 라는 이름은 선언되지 않았습니다. 화면 출력은 cout, 입력은 cin 입니다 (대소문자 구분).`,
      notInStd: p => `std 안에 '${p[0]}' 라는 이름이 없습니다. 출력은 std::cout, 입력은 std::cin 입니다.`,
      needIostream: p => `'${p[0]}' 는 <iostream> 에 들어 있습니다. 맨 위에 #include <iostream> 이 필요합니다.`,
      singleArrow: p => `${p[0]} 다음에는 화살표 두 개 '${p[1]}' 를 씁니다. '${p[2]}' 하나는 비교 연산자입니다.`,
      streamParen: p => `${p[0]} 은 함수처럼 괄호로 부르지 않습니다. ${p[1]} ${p[2]} 값; 형태로 씁니다.`,
      streamNeedsArrow: p => `${p[0]} 다음에 '${p[1]}' 가 필요합니다.`,
      cinUndeclared: p => `변수 '${p[0]}' 를 선언하지 않았습니다. cin 으로 읽기 전에 먼저 선언하세요.`,
      cinNeedsVariable: p => `cin >> 다음에는 값을 담을 변수 이름이 와야 하는데 ${p[0]} 가 왔습니다.`,
      endlNeedsStd: p => "'endl' 이름을 찾을 수 없습니다. std::endl 로 쓰거나 using namespace std; 를 추가하세요.",
      expectedLvalue: p => `값을 저장할 변수 이름이 필요한데 ${p[0]} 가 왔습니다.`,
      undeclaredVar: p => `변수 '${p[0]}' 를 선언하지 않았습니다. 예: int ${p[1]};`,
      stringAssignment: p => `문자열 "…" 은 ${p[0]} 변수에 넣을 수 없습니다.`,
      endlAssignment: p => 'endl 은 cout 출력에서만 씁니다.',
      percentDouble: p => p[0] ? '% 나머지 연산은 정수끼리만 할 수 있습니다. 실수(double)에는 쓸 수 없습니다.' : '% 나머지 연산은 정수끼리만 할 수 있습니다.',
      unsupportedStringSign: p => '문자열에 부호를 붙이는 계산은 지원하지 않습니다.',
      integerLiteralRange: p => 'int 범위를 넘는 정수 리터럴은 지원하지 않습니다.',
      endlPosition: p => 'endl 은 cout << 다음에만 씁니다.',
      streamPosition: p => `${p[0]} 는 문장 맨 앞에서 ${p[1]} 와 함께 씁니다.`,
      caseMismatch: p => `'${p[0]}' 는 선언되지 않았습니다. 대소문자가 다른 '${p[1]}' 를 뜻했나요? C++ 는 대소문자를 구분합니다.`,
      undeclared: p => `'${p[0]}' 는 선언되지 않은 이름입니다. 사용하기 전에 선언하세요.`,
      missingExpression: p => '값(식)이 와야 할 자리가 비어 있습니다.',
      unexpectedExpression: p => `값(식)이 와야 할 자리에 ${p[0]} 가 왔습니다.`,
      unsupportedStringMath: p => '1장 시뮬레이터는 문자열 "…" 로 계산하는 식을 지원하지 않습니다. 문자열은 cout 으로 출력만 합니다.',
      intOverflow: p => `int 가 담을 수 있는 범위(${p[0]} ~ ${p[1]})를 넘었습니다. 실제 C++에서는 정의되지 않은 동작이라 결과를 믿을 수 없습니다.`,
      uninitRead: p => `변수 '${p[0]}' 에 값을 넣기 전에 읽었습니다. 실제 C++에서는 어떤 값이 나올지 정해져 있지 않습니다(정의되지 않은 동작).`,
      intDivZero: p => '정수를 0 으로 나눴습니다. 실제 C++에서는 프로그램이 비정상 종료되거나 결과를 알 수 없습니다.',
      inputMissing: p => `cin 이 '${p[0]}' 에 넣을 값을 기다리는데 입력이 더 없습니다. 입력 칸에 값을 넣으세요.`,
      inputBad: p => `'${p[0]}' 는 ${p[1]} 로 읽을 수 없습니다. 실제 C++에서는 cin 이 실패 상태가 되고 '${p[2]}' 에 0 이 들어간 뒤 이후 입력도 읽지 않습니다.`,
      stepLimit: p => '실행 단계가 너무 많아 학습 검사기가 멈췄습니다.',
      uninitCompound: p => `변수 '${p[0]}' 에 값을 넣기 전에 ${p[1]} 로 읽었습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.`,
      noteConversion: p => `double 값 ${p[0]} 을 int 변수에 넣으면서 소수점 아래를 버렸습니다.`,
      noteDeclInit: p => `${p[0]} 을(를) 만들고 ${p[1]} 로 초기화했습니다.`,
      noteDecl: p => `${p[0]} 을(를) 만들었습니다. 아직 값을 넣지 않았습니다(초기화 안 됨).`,
      notePrint: p => `화면에 ${p[0]} 를 출력했습니다. 변수 값은 바뀌지 않습니다.`,
      noteRead: p => `입력에서 ${p[0]} 을(를) 읽어 ${p[1]} 에 넣었습니다.`,
      noteLeftover: p => `int 변수라 '${p[0]}' 부분은 읽지 않고 입력에 남겨 두었습니다.`,
      noteExpr: p => `식의 값 ${p[0]} 을 계산했지만 어디에도 저장하거나 출력하지 않았습니다.`,
      wrongArrowCout: p => "cout 은 출력입니다. 데이터가 화면(cout) 쪽으로 흐르도록 '<<' 를 씁니다.",
      wrongArrowCin: p => "cin 은 입력입니다. 데이터가 키보드(cin)에서 변수로 흐르도록 '>'>' 를 씁니다.",
      linkNoMain: p => `링크 오류: 프로그램이 시작할 함수 'main' 을 찾지 못했습니다.${p[0] ? ` '${p[1]}' 와 'main' 은 대소문자가 달라 다른 이름입니다.` : ''} 컴파일은 통과했지만 링커가 실행 파일을 만들 수 없습니다.`,
      noteReturnZero: p => 'main 이 0 을 돌려주며 끝났습니다(정상 종료).',
      noteReturn: p => `main 이 ${p[0]} 를 돌려주며 끝났습니다(0 이 아니면 보통 오류를 뜻함).`,
      noteEnd: p => "main 의 '}' 에 도달해 끝났습니다. main 은 return 이 없으면 0 을 돌려줍니다.",
      endOfFile: p => '파일 끝',
      openFunctionBody: p => "함수 본문을 여는 '{'",
      closingParen: p => "닫는 괄호 ')'"
    },
    en: {
      unclosedComment: p => `Close the /* comment with */.`,
      preprocessorPosition: p => `Preprocessor directives must start at the beginning of a line.`,
      numberName: p => `Names cannot start with a number: ${p[0]}${p[1]}.`,
      stringNewline: p => `Close the string on the same line.`,
      unclosedString: p => `Close the string with a double quote.`,
      badCharLiteral: p => `A character literal must contain one character, such as 'a' or '\\n'.`,
      unknownSymbol: p => `Unknown symbol '${p[0]}'.`,
      unknownEscape: p => `Unknown escape sequence: ${p[0]}.`,
      expectedToken: p => `Expected ${p[0]}, but found ${p[1]}.`,
      missingSemicolon: p => `A statement must end with ';'.`,
      colonInsteadOfSemicolon: p => `End the statement with ';', not ':'.`,
      semicolonBefore: p => `Expected ';' before ${p[0]}.`,
      badInclude: p => `Write the header in angle brackets: #include <iostream>.`,
      unsupportedPreprocessor: p => `Only #include directives are supported.`,
      unknownHeader: p => `Header <${p[0]}> was not found. Use <iostream> in chapter 1.`,
      expectedNamespace: p => `Write using namespace std;.`,
      expectedStd: p => `Write std after using namespace.`,
      expectedFunction: p => `A function starts with its return type. Expected int main(), but found ${p[0]}.`,
      expectedFunctionName: p => `Expected a function name, but found ${p[0]}.`,
      mainReturnType: p => `main must return int: int main().`,
      unclosedMain: p => `The closing '}' for main is missing.`,
      multipleFunctions: p => `This simulator supports only one function, main.`,
      unsupportedBlock: p => `Blocks are covered in chapter 2 and are not yet supported.`,
      unsupportedControl: p => `'${p[0]}' is covered in chapter 2 and is not supported here.`,
      expectedVariableName: p => `Expected a variable name after ${p[0]}, but found ${p[1]}.`,
      invalidVariableName: p => `'${p[0]}' cannot be used as a variable name.`,
      redeclaration: p => `'${p[0]}' was already declared on line ${p[1]}. To change it, assign without repeating the type.`,
      nameNeedsStd: p => `Cannot find '${p[0]}'. Use std::${p[1]} or add using namespace std;.`,
      unknownIoName: p => `'${p[0]}' is not declared. Use cout for output and cin for input; names are case-sensitive.`,
      notInStd: p => `'${p[0]}' is not in std. Use std::cout or std::cin.`,
      needIostream: p => `'${p[0]}' requires #include <iostream> at the top of the program.`,
      singleArrow: p => `Use '${p[1]}' after ${p[0]}; a single '${p[2]}' is a comparison operator.`,
      streamParen: p => `Do not call ${p[0]} like a function. Write ${p[1]} ${p[2]} value;.`,
      streamNeedsArrow: p => `Expected '${p[1]}' after ${p[0]}.`,
      cinUndeclared: p => `Declare '${p[0]}' before reading into it with cin.`,
      cinNeedsVariable: p => `Expected a variable name after cin >>, but found ${p[0]}.`,
      endlNeedsStd: p => `Use std::endl or add using namespace std;.`,
      expectedLvalue: p => `Expected a variable to store the value, but found ${p[0]}.`,
      undeclaredVar: p => `Variable '${p[0]}' is not declared. Try int ${p[1]};.`,
      stringAssignment: p => `A string cannot be assigned to a ${p[0]} variable.`,
      endlAssignment: p => `Use endl only with cout.`,
      percentDouble: p => p[0] ? `The % operator requires integers, not double values.` : `The % operator requires integers.`,
      unsupportedStringSign: p => `A string cannot have a unary sign here.`,
      integerLiteralRange: p => `Integer literals outside the int range are not supported.`,
      endlPosition: p => `Use endl after cout <<.`,
      streamPosition: p => `Use ${p[0]} at the start of a statement with ${p[1]}.`,
      caseMismatch: p => `'${p[0]}' is not declared. Did you mean '${p[1]}'? C++ names are case-sensitive.`,
      undeclared: p => `'${p[0]}' is not declared. Declare it before use.`,
      missingExpression: p => `Expected a value or expression.`,
      unexpectedExpression: p => `Expected a value or expression, but found ${p[0]}.`,
      unsupportedStringMath: p => `String calculations are not supported. Use strings only for cout output.`,
      intOverflow: p => `The result is outside the int range (${p[0]} to ${p[1]}). Signed overflow is undefined behavior in C++.`,
      uninitRead: p => `'${p[0]}' was read before it was initialized. This is undefined behavior in C++.`,
      intDivZero: p => `Division by zero with integers has undefined behavior in C++.`,
      inputMissing: p => `cin needs a value for '${p[0]}', but no input remains. Enter a value.`,
      inputBad: p => `Cannot read '${p[0]}' as ${p[1]}. In C++, cin fails, stores 0 in '${p[2]}', and stops reading.`,
      stepLimit: p => `The simulator stopped because there were too many steps.`,
      uninitCompound: p => `'${p[0]}' was read by ${p[1]} before initialization. This is undefined behavior in C++.`,
      noteConversion: p => `Converting double ${p[0]} to int discards the fractional part.`,
      noteDeclInit: p => `Created ${p[0]} and initialized it to ${p[1]}.`,
      noteDecl: p => `Created ${p[0]} without initializing it.`,
      notePrint: p => `Printed ${p[0]}. Variable values did not change.`,
      noteRead: p => `Read ${p[0]} from input into ${p[1]}.`,
      noteLeftover: p => `The int read left '${p[0]}' in the input.`,
      noteExpr: p => `Calculated ${p[0]}, but did not store or print it.`,
      wrongArrowCout: p => `Use << to send output to cout.`,
      wrongArrowCin: p => `Use >> to read input from cin.`,
      linkNoMain: p => `Link error: could not find the starting function 'main'.${p[0] ? ` '${p[1]}' differs from 'main' in capitalization.` : ''} Compilation succeeded, but linking failed.`,
      noteReturnZero: p => `main returned 0 and finished successfully.`,
      noteReturn: p => `main returned ${p[0]}. A nonzero return value usually means an error.`,
      noteEnd: p => `Reached the end of main. Without a return statement, main returns 0.`,
      endOfFile: p => `end of file`,
      openFunctionBody: p => `the opening '{' of the function body`,
      closingParen: p => `the closing ')'`
    }
  };

  let lang = 'ko';
  let activeLang = 'ko';
  function setLang(value) {
    if (value === 'ko' || value === 'en') lang = activeLang = value;
  }
  function getLang() { return lang; }
  function message(code, params) { return messages[activeLang][code](params || []); }

  class SimError extends Error {
    // kind: compile | link | runtime | ub | input | unsupported
    constructor(kind, line, code, params) {
      super(message(code, params));
      this.kind = kind;
      this.line = line;
      this.code = code;
    }
  }

  const compileError = (line, code, params) => new SimError('compile', line, code, params);

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
        if (i >= n) throw compileError(startLine, 'unclosedComment', []);
        i += 2;
        continue;
      }
      if (c === '#') {
        if (!lineStart) throw compileError(line, 'preprocessorPosition', []);
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
          throw compileError(line, 'numberName', [text, src[i + text.length]]);
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
          if (src[j] === '\n') throw compileError(line, 'stringNewline', []);
          if (src[j] === '\\') {
            value += unescape(src[j + 1], line);
            j += 2;
          } else {
            value += src[j];
            j++;
          }
        }
        if (j >= n) throw compileError(line, 'unclosedString', []);
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
          throw compileError(line, 'badCharLiteral', []);
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
      throw compileError(line, 'unknownSymbol', [c]);
    }
    tokens.push({ t: 'eof', v: '', line });
    return tokens;
  }

  function unescape(ch, line) {
    const map = { n: '\n', t: '\t', '\\': '\\', '"': '"', "'": "'", '0': '\0', a: '\x07', b: '\b', r: '\r', f: '\f' };
    if (!(ch in map)) throw compileError(line, 'unknownEscape', [ch]);
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
    const show = (tok) => (tok.t === 'eof' ? message('endOfFile') : `'${tok.text || tok.v}'`);

    function expectOp(v, what) {
      const tok = peek();
      if (isOp(tok, v)) return next();
      throw compileError(tok.line, 'expectedToken', [what || `'${v}'`, show(tok)]);
    }

    function expectSemicolon() {
      const tok = peek();
      if (isOp(tok, ';')) return next();
      if (tok.line !== prevLine() || tok.t === 'eof' || isOp(tok, '}')) {
        throw compileError(prevLine(), 'missingSemicolon', []);
      }
      if (isOp(tok, ':')) throw compileError(tok.line, 'colonInsteadOfSemicolon', []);
      throw compileError(tok.line, 'semicolonBefore', [show(tok)]);
    }

    // ---- top level
    while (peek().t === 'pp' || (peek().t === 'id' && peek().v === 'using')) {
      const tok = next();
      if (tok.t === 'pp') {
        const m = /^#\s*include\s*<\s*([A-Za-z_.]+)\s*>$/.exec(tok.v);
        if (!m) {
          if (/^#\s*include/.test(tok.v)) throw compileError(tok.line, 'badInclude', []);
          throw new SimError('unsupported', tok.line, 'unsupportedPreprocessor', []);
        }
        if (!KNOWN_HEADERS.includes(m[1])) {
          throw compileError(tok.line, 'unknownHeader', [m[1]]);
        }
        hasIostream = true;
      } else {
        const ns = next();
        if (!(ns.t === 'id' && ns.v === 'namespace')) throw compileError(ns.line, 'expectedNamespace', []);
        const name = next();
        if (!(name.t === 'id' && name.v === 'std')) throw compileError(name.line, 'expectedStd', []);
        expectSemicolon();
        usingStd = true;
      }
    }

    // ---- int main() {
    const retType = next();
    if (retType.t !== 'id' || !TYPE_NAMES.concat('void').includes(retType.v)) {
      throw compileError(retType.line, 'expectedFunction', [show(retType)]);
    }
    const fn = next();
    if (fn.t !== 'id') throw compileError(fn.line, 'expectedFunctionName', [show(fn)]);
    if (retType.v !== 'int' && fn.v === 'main') throw compileError(retType.line, 'mainReturnType', []);
    mainName = fn.v;
    mainLine = fn.line;
    expectOp('(');
    expectOp(')');
    expectOp('{', message('openFunctionBody'));

    const body = [];
    while (!isOp(peek(), '}')) {
      if (peek().t === 'eof') throw compileError(prevLine(), 'unclosedMain', []);
      body.push(statement());
    }
    const close = next();
    if (peek().t !== 'eof') {
      throw new SimError('unsupported', peek().line, 'multipleFunctions', []);
    }

    return { body, mainName, mainLine, endLine: close.line };

    // ---- statements
    function statement() {
      const tok = peek();
      const line = tok.line;
      if (isOp(tok, ';')) { next(); return { kind: 'empty', line }; }
      if (isOp(tok, '{')) throw new SimError('unsupported', line, 'unsupportedBlock', []);
      if (tok.t === 'id' && TYPE_NAMES.includes(tok.v)) return declaration();
      if (tok.t === 'id' && tok.v === 'return') {
        next();
        const expr = expression();
        expectSemicolon();
        return { kind: 'return', line, expr };
      }
      if (tok.t === 'id' && ['if', 'else', 'while', 'for', 'do', 'switch'].includes(tok.v)) {
        throw new SimError('unsupported', line, 'unsupportedControl', [tok.v]);
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
        if (nameTok.t !== 'id') throw compileError(nameTok.line, 'expectedVariableName', [type, show(nameTok)]);
        if (TYPE_NAMES.includes(nameTok.v) || ['return', 'using', 'namespace', 'main'].includes(nameTok.v)) {
          throw compileError(nameTok.line, 'invalidVariableName', [nameTok.v]);
        }
        if (scope.has(nameTok.v)) {
          throw compileError(nameTok.line, 'redeclaration', [nameTok.v, scope.get(nameTok.v).line, nameTok.v]);
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
          throw compileError(tok.line, 'nameNeedsStd', [tok.v, tok.v]);
        }
        p += 1;
        return tok.v;
      }
      if (['print', 'printf', 'Cout', 'COUT', 'Cin', 'output', 'input'].includes(tok.v) && !scope.has(tok.v)) {
        throw compileError(tok.line, 'unknownIoName', [tok.v]);
      }
      if (tok.v === 'std' && isOp(peek(1), '::') && peek(2).t === 'id') {
        throw compileError(peek(2).line, 'notInStd', [peek(2).v]);
      }
      return null;
    }

    function requireIostream(tok) {
      if (!hasIostream) {
        throw compileError(tok.line, 'needIostream', [tok.v]);
      }
    }

    function streamStatement(stream, line) {
      const want = stream === 'cout' ? '<<' : '>>';
      const wrong = stream === 'cout' ? '>>' : '<<';
      const items = [];
      if (!(peek().t === 'op' && (peek().v === '<<' || peek().v === '>>'))) {
        if (isOp(peek(), '<') || isOp(peek(), '>')) {
          throw compileError(peek().line, 'singleArrow', [stream, want, peek().v]);
        }
        if (isOp(peek(), '(')) {
          throw compileError(peek().line, 'streamParen', [stream, stream, want]);
        }
        throw compileError(peek().line, 'streamNeedsArrow', [stream, want]);
      }
      while (peek().t === 'op' && (peek().v === '<<' || peek().v === '>>')) {
        const opTok = next();
        if (opTok.v === wrong) {
          throw compileError(opTok.line, stream === 'cout' ? 'wrongArrowCout' : 'wrongArrowCin');


        }
        if (stream === 'cout') {
          items.push(streamOperand());
        } else {
          const tok = peek();
          if (tok.t !== 'id' || !scope.has(tok.v)) {
            if (tok.t === 'id') throw compileError(tok.line, 'cinUndeclared', [tok.v]);
            throw compileError(tok.line, 'cinNeedsVariable', [show(tok)]);
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
          if (!usingStd && !scope.has('endl')) throw compileError(tok.line, 'endlNeedsStd', []);
          p += 1;
        }
        return { kind: 'endl', type: 'endl', line: tok.line };
      }
      return additive();
    }

    function lvalue() {
      const tok = next();
      if (tok.t !== 'id') throw compileError(tok.line, 'expectedLvalue', [show(tok)]);
      if (!scope.has(tok.v)) throw compileError(tok.line, 'undeclaredVar', [tok.v, tok.v]);
      return tok.v;
    }

    function checkAssignable(type, expr, line, op) {
      if (expr.type === 'string') {
        throw compileError(line, 'stringAssignment', [type]);
      }
      if (expr.type === 'endl') throw compileError(line, 'endlAssignment', []);
      if (op === '%=' && (type === 'double' || expr.type === 'double')) {
        throw compileError(line, 'percentDouble', [false]);
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
        if (operand.type === 'string') throw new SimError('unsupported', opTok.line, 'unsupportedStringSign', []);
        return { kind: 'unary', op: opTok.v, operand, type: operand.type === 'double' ? 'double' : 'int', line: opTok.line };
      }
      return primary();
    }

    function primary() {
      const tok = next();
      if (tok.t === 'num') {
        if (!tok.isDouble && tok.v > INT_MAX) throw new SimError('unsupported', tok.line, 'integerLiteralRange', []);
        return lit(tok.isDouble ? 'double' : 'int', tok.v, tok.line, tok.text);
      }
      if (tok.t === 'str') return { kind: 'lit', type: 'string', value: tok.v, text: tok.text, line: tok.line };
      if (tok.t === 'chr') return { kind: 'lit', type: 'char', value: tok.v, text: tok.text, line: tok.line };
      if (tok.t === 'id') {
        if (tok.v === 'true' || tok.v === 'false') return lit('bool', tok.v === 'true' ? 1 : 0, tok.line, tok.v);
        if (scope.has(tok.v)) return { kind: 'var', name: tok.v, type: scope.get(tok.v).type, line: tok.line };
        if (tok.v === 'endl') throw compileError(tok.line, 'endlPosition', []);
        if (tok.v === 'cout' || tok.v === 'cin') throw compileError(tok.line, 'streamPosition', [tok.v, tok.v === 'cout' ? '<<' : '>>']);
        const similar = [...scope.keys()].find((k) => k.toLowerCase() === tok.v.toLowerCase());
        if (similar) throw compileError(tok.line, 'caseMismatch', [tok.v, similar]);
        throw compileError(tok.line, 'undeclared', [tok.v]);
      }
      if (isOp(tok, '(')) {
        const inner = expression();
        expectOp(')', message('closingParen'));
        return inner;
      }
      if (tok.t === 'eof' || isOp(tok, ';')) throw compileError(tok.t === 'eof' ? prevLine() : tok.line, 'missingExpression', []);
      throw compileError(tok.line, 'unexpectedExpression', [show(tok)]);
    }

    function binary(op, left, right) {
      const line = left.line;
      if (left.type === 'string' || right.type === 'string') {
        throw new SimError('unsupported', line, 'unsupportedStringMath', []);
      }
      if (op === '%' && (left.type === 'double' || right.type === 'double')) {
        throw compileError(line, 'percentDouble', [true]);
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
    const previous = activeLang;
    activeLang = options && (options.lang === 'ko' || options.lang === 'en') ? options.lang : lang;
    try { return runInternal(source, options); } finally { activeLang = previous; }
  }

  function runInternal(source, options) {
    const opts = Object.assign({ input: '', maxSteps: 500 }, options);
    const result = { stage: 'compile', ok: false, error: null, steps: [], output: '', vars: [], exitCode: null };
    let program;
    try {
      program = parse(source);
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = { kind: e.kind, line: e.line, code: e.code, message: e.message };
      return result;
    }
    if (program.mainName !== 'main') {
      result.stage = 'link';
      const caseHint = program.mainName.toLowerCase() === 'main';
      result.error = {
        kind: 'link',
        line: program.mainLine,
        code: 'linkNoMain',
        message: message('linkNoMain', [caseHint, program.mainName]),
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
        throw new SimError('ub', line, 'intOverflow', [INT_MIN, INT_MAX]);
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
            throw new SimError('ub', expr.line, 'uninitRead', [expr.name]);
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
              throw new SimError('runtime', expr.line, 'intDivZero', []);
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
        return message('noteConversion', [formatDouble(value)]);
      }
      return null;
    }

    function readFromInput(type, name, line) {
      const rest = input.text.slice(input.pos);
      const ws = /^\s*/.exec(rest)[0].length;
      if (ws === rest.length) {
        throw new SimError('input', line, 'inputMissing', [name]);
      }
      const body = rest.slice(ws);
      const pattern = type === 'double' ? /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/
        : type === 'char' ? /^\S/
          : type === 'bool' ? /^[01]/
            : /^[+-]?\d+/;
      const m = pattern.exec(body);
      if (!m) {
        const word = /^\S+/.exec(body)[0];
        throw new SimError('input', line, 'inputBad', [word, type, name]);
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
        if (++steps > opts.maxSteps) throw new SimError('runtime', stmt.line, 'stepLimit', []);
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
                notes.push(message('noteDeclInit', [d.name, formatValue(stmt.type, value)]));
              } else {
                notes.push(message('noteDecl', [d.name]));
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
                throw new SimError('ub', stmt.line, 'uninitCompound', [stmt.name, stmt.op]);
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
            notes.push(message('notePrint', [JSON.stringify(piece)]));
            break;
          }
          case 'cin':
            for (const name of stmt.items) {
              const target = vars.get(name);
              const read = readFromInput(target.type, name, stmt.line);
              target.value = toType(target.type, read.value);
              changed.push(name);
              inputs.push({ name, text: read.text });
              notes.push(message('noteRead', [read.text, name]));
              if (read.leftover && target.type === 'int' && /^\./.test(read.leftover)) {
                notes.push(message('noteLeftover', [read.leftover]));
              }
            }
            break;
          case 'expr': {
            const v = evaluate(stmt.expr);
            notes.push(message('noteExpr', [formatValue(stmt.expr.type, v)]));
            break;
          }
          case 'return': {
            const v = toType('int', evaluate(stmt.expr));
            result.exitCode = v;
            notes.push(v === 0 ? message('noteReturnZero') : message('noteReturn', [v]));
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
          printed: '', notes: [message('noteEnd')], changed: [], reads: [], inputs: [],
        });
      }
      result.ok = true;
      result.stage = 'done';
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = { kind: e.kind, line: e.line, code: e.code, message: e.message, reads: [...reads] };
    }
    result.output = output;
    result.vars = snapshot();
    return result;
  }

  const api = { run, formatDouble, SimError, setLang, getLang };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.CppSim = api;
})(this);
