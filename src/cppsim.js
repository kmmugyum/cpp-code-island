/*
 * CppSim — educational C++17-subset interpreter (MIT 6.096 chapters 1-10).
 * Not a real compiler. Pipeline: tokenize -> parse (syntax tree) -> analyze (names, types, overloads,
 * templates, access, const; every compile/link error is reported before any line runs) -> interpret
 * (frames, heap blocks with ids, virtual addresses, init flags) producing one Step per executed statement.
 *
 * API: run(source, { input, lang, maxSteps = 5000, files = {} }) -> { ok, stage, error, steps, output,
 *   exitCode, vars, files, leaks, finalMem }; setLang/getLang; formatDouble.
 *
 * Step kinds: decl construct alloc assign expr call cout cin file if loop switch case break continue return
 *   enter exit end destruct free throw catch.  ('else' is never emitted: an else branch runs as its own statements.)
 *   decl/construct/alloc = declaration (object / initialized by new); enter/exit = function entry and fall-off end;
 *   end = main's closing brace without return; file = stream I/O on an ifstream/ofstream.
 * Event types: call dispatch return construct destruct alloc free branch case loop throw catch file.
 *   alloc {id, allocatedType, count?}; throw/catch {exception, what}; dispatch {method, static, dynamic, virtual, object}.
 * Error kinds: compile link runtime ub input unsupported.
 * Error codes (existing): unclosedComment preprocessorPosition numberName stringNewline unclosedString badCharLiteral
 *   unknownSymbol unknownEscape expectedToken missingSemicolon colonInsteadOfSemicolon semicolonBefore badInclude
 *   unsupportedPreprocessor unknownHeader expectedNamespace expectedStd expectedFunction expectedFunctionName
 *   mainReturnType unclosedMain expectedVariableName invalidVariableName redeclaration nameNeedsStd unknownIoName
 *   notInStd needIostream singleArrow streamParen streamNeedsArrow cinUndeclared cinNeedsVariable endlNeedsStd
 *   expectedLvalue undeclaredVar percentDouble integerLiteralRange endlPosition streamPosition caseMismatch
 *   undeclared missingExpression unexpectedExpression intOverflow uninitRead intDivZero inputMissing inputBad
 *   stepLimit uninitCompound wrongArrowCout wrongArrowCin linkNoMain stringAssignment.
 *   (retired, never produced now: multipleFunctions unsupportedBlock unsupportedControl unsupportedStringMath
 *   unsupportedStringSign endlAssignment)
 * Error codes (new): privateAccess abstractInstantiation constViolation noSuchMember undeclaredFunction
 *   undefinedFunction(link) ambiguousCall templateDeduction refBindRvalue switchNonIntegral arraySizeNotConstant
 *   noMatchingFunction noMatchingConstructor invalidOperands unsupportedFeature(unsupported) needHeader typeMismatch
 *   caseNotConstant duplicateCase badReturn tooManyInitializers refNeedsInit badOverride
 *   runtime/ub: indexOutOfBounds nullDeref useAfterFree doubleFree deleteMismatch danglingPointer stackOverflow
 *   uncaughtException.
 */
(function (global) {
  'use strict';

  const INT_MIN = -2147483648;
  const INT_MAX = 2147483647;
  const KNOWN_HEADERS = ['iostream', 'string', 'cctype', 'cstring', 'algorithm', 'set', 'fstream', 'stdexcept'];
  const OPERATORS = ['<<', '>>', '::', '+=', '-=', '*=', '/=', '%=', '++', '--', '->',
    '<=', '>=', '==', '!=', '&&', '||',
    '+', '-', '*', '/', '%', '=', '(', ')', '{', '}', '[', ']', ';', ',', '<', '>', ':', '!', '?', '&', '.', '~'];

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
      unsupportedFeature: p => `이 학습 엔진은 '${p[0]}' 기능을 아직 지원하지 않습니다.`,
      switchNonIntegral: p => 'switch 조건에는 정수 또는 문자 값을 사용하세요.',
      undeclaredFunction: p => `'${p[0]}' 함수를 호출하기 전에 선언하세요.`,
      undefinedFunction: p => `'${p[0]}' 함수가 선언되었지만 정의되지 않았습니다.`,
      noMatchingFunction: p => `'${p[0]}' 호출에 맞는 함수가 없습니다.`,
      ambiguousCall: p => `'${p[0]}' 호출에 맞는 함수가 여러 개입니다.`,
      refBindRvalue: p => '변경 가능한 참조에는 저장된 변수를 전달하세요.',
      indexOutOfBounds: p => `'${p[0]}'의 인덱스 ${p[1]}은 범위 ${p[2]} 밖입니다. 실제 C++에서는 결과가 정해져 있지 않습니다.`,
      arraySizeNotConstant: p => '배열 크기에는 양의 정수 상수를 사용하세요.',
      nullDeref: p => '널 포인터를 역참조했습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
      invalidOperands: p => '이 연산자에 사용할 수 없는 값입니다.',
      constViolation: p => 'const로 지정한 값은 수정할 수 없습니다.',
      useAfterFree: p => '해제한 메모리를 사용했습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
      doubleFree: p => '이미 해제한 메모리를 다시 해제했습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
      deleteMismatch: p => 'new와 delete의 배열 형식이 다릅니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
      privateAccess: p => `'${p[0]}' 멤버는 이 위치에서 접근할 수 없습니다.`,
      noSuchMember: p => `'${p[0]}' 멤버가 없습니다.`,
      noMatchingConstructor: p => '인자에 맞는 생성자가 없습니다.',
      abstractInstantiation: p => '순수 가상 함수가 남은 추상 클래스는 객체로 만들 수 없습니다.',
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
      unsupportedFeature: p => `The learning engine does not support '${p[0]}' yet.`,
      switchNonIntegral: p => 'A switch condition must have an integral type.',
      undeclaredFunction: p => `Declare the function '${p[0]}' before calling it.`,
      undefinedFunction: p => `Function '${p[0]}' was declared but not defined.`,
      noMatchingFunction: p => `No matching function for '${p[0]}'.`,
      ambiguousCall: p => `The call to '${p[0]}' is ambiguous.`,
      refBindRvalue: p => `A non-const reference must bind to a variable.`,
      indexOutOfBounds: p => `Index ${p[1]} is outside '${p[0]}' (size ${p[2]}). C++ does not guarantee a result.`,
      arraySizeNotConstant: p => `An array size must be a positive integer constant.`,
      nullDeref: p => 'A null pointer was dereferenced. C++ does not guarantee a result.',
      invalidOperands: p => 'These operands cannot be used with this operator.',
      constViolation: p => 'A const value cannot be modified.',
      useAfterFree: p => 'Freed memory was accessed. C++ does not guarantee a result.',
      doubleFree: p => 'The same allocation was freed twice. C++ does not guarantee a result.',
      deleteMismatch: p => 'The array form of delete does not match new. C++ does not guarantee a result.',
      privateAccess: p => `Member '${p[0]}' is not accessible here.`,
      noSuchMember: p => `No member named '${p[0]}'.`,
      noMatchingConstructor: p => 'No matching constructor.',
      abstractInstantiation: p => 'An abstract class with a pure virtual function cannot be instantiated.',
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

  const tyName = t => (t === 'cstr' ? 'const char*' : t === 'nullptr_t' ? 'nullptr' : t === 'manip' ? 'endl' : String(t));

  Object.assign(messages.ko, {
    numberName: p => `'${p[0]}${p[1]}…' 이름은 숫자로 시작할 수 없습니다.`,
    unknownHeader: p => `헤더 <${p[0]}> 를 찾을 수 없습니다. 쓸 수 있는 헤더는 iostream, string, cctype, cstring, algorithm, set, fstream, stdexcept 입니다.`,
    needHeader: p => `'${p[0]}' 를 쓰려면 맨 위에 #include <${p[1]}> 가 필요합니다.`,
    typeMismatch: p => `${tyName(p[0])} 타입의 값을 ${tyName(p[1])} 타입으로 바꿔 넣을 수 없습니다.`,
    templateDeduction: p => `템플릿 함수 '${p[0]}' 의 타입 T 를 인자에서 하나로 정할 수 없습니다. 인자 타입을 맞추거나 ${p[0]}<타입>(…) 처럼 직접 지정하세요.`,
    caseNotConstant: p => 'case 값은 컴파일할 때 정해지는 정수 상수여야 합니다.',
    duplicateCase: p => `같은 case 값(${p[0]})이 두 번 나왔습니다.`,
    badReturn: p => `return 문이 함수의 반환 타입(${tyName(p[0])})과 맞지 않습니다. void 함수는 값을 돌려줄 수 없고, 다른 함수는 값을 돌려줘야 합니다.`,
    tooManyInitializers: p => `초기화 값이 배열 크기 ${p[0]} 보다 많습니다.`,
    refNeedsInit: p => `참조 '${p[0]}' 는 선언할 때 반드시 변수로 초기화해야 합니다.`,
    badOverride: p => `'${p[0]}' 를 override 로 표시했지만 기반 클래스에 같은 모양의 virtual 함수가 없습니다.`,
    stackOverflow: p => '함수 호출이 너무 깊어 학습 검사기가 멈췄습니다. 끝나지 않는 재귀일 수 있습니다. 실제 C++에서는 스택이 넘쳐 프로그램이 비정상 종료됩니다.',
    danglingPointer: p => '이미 사라진 변수(끝난 블록이나 함수의 지역 변수)를 가리키는 포인터를 사용했습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
    uncaughtException: p => `처리되지 않은 예외로 프로그램이 종료됩니다: ${p[0]}${p[1] ? ` (what: ${p[1]})` : ''}. try/catch 로 예외를 잡아야 합니다.`,
    abstractInstantiation: p => `'${p[0]}' 는 순수 가상 함수가 남은 추상 클래스라 객체를 만들 수 없습니다. 포인터나 참조로만 쓰거나 파생 클래스에서 모두 구현하세요.`,
    privateAccess: p => `'${p[0]}' 는 private(또는 protected) 멤버라 이 위치에서 접근할 수 없습니다. 클래스 안의 멤버 함수를 통해 쓰세요.`,
    noSuchMember: p => `'${p[0]}' 라는 멤버(또는 함수)가 이 클래스에 없습니다.`,
    noMatchingConstructor: p => `'${tyName(p[0])}' 에는 이 인자들에 맞는 생성자가 없습니다.`,
    noMatchingFunction: p => `'${p[0]}' 를 이 인자들로 호출할 수 없습니다. 인자의 개수와 타입을 확인하세요.`,
    ambiguousCall: p => `'${p[0]}' 호출에 똑같이 알맞은 함수가 둘 이상이라 하나를 고를 수 없습니다. 인자 타입을 분명히 하세요.`,
    undeclaredFunction: p => `함수 '${p[0]}' 를 호출하기 전에 선언(또는 정의)해야 합니다. 프로토타입을 위쪽에 추가하세요.`,
    undefinedFunction: p => `함수 '${p[0]}' 는 선언만 있고 정의가 없어 링크할 수 없습니다.`,
    refBindRvalue: p => `'${p[0]}' 의 참조 매개변수(T&)에는 값이 아니라 변수를 넘겨야 합니다. const T& 이면 임시 값도 받을 수 있습니다.`,
    constViolation: p => 'const 로 지정한 값은 바꿀 수 없습니다. const 객체에는 const 멤버 함수만 호출할 수 있습니다.',
    invalidOperands: p => '이 연산자는 이 타입들에 쓸 수 없습니다.',
    nullDeref: p => '널 포인터(nullptr)를 따라가 값을 읽거나 썼습니다. 실제 C++에서는 결과가 정해져 있지 않고 보통 프로그램이 비정상 종료됩니다.',
    useAfterFree: p => '이미 delete 로 해제한 메모리를 읽거나 썼습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
    doubleFree: p => '이미 해제한 메모리를 다시 delete 했습니다. 실제 C++에서는 결과가 정해져 있지 않습니다.',
    deleteMismatch: p => 'new 와 delete 의 짝이 맞지 않습니다. new[] 는 delete[] 로, new 는 delete 로 해제하고, new 로 만든 포인터만 해제하세요. 실제 C++에서는 결과가 정해져 있지 않습니다.',
    indexOutOfBounds: p => `'${p[0]}' 의 인덱스 ${p[1]} 은(는) 범위(크기 ${p[2]}) 밖입니다. 실제 C++에서는 이런 접근이 멈추지 않고 정해지지 않은 결과를 냅니다.`,
    arraySizeNotConstant: p => '배열 크기는 컴파일할 때 정해지는 양의 정수 상수여야 합니다. const int 변수나 숫자를 쓰세요.',
    unsupportedFeature: p => `이 학습 엔진은 '${p[0]}' 기능을 지원하지 않습니다.`,
    noteConversion: p => `double 값 ${p[0]} 을 int 로 바꾸면서 소수점 아래를 버렸습니다.`,
  });

  Object.assign(messages.en, {
    unknownHeader: p => `Header <${p[0]}> was not found. Supported headers: iostream, string, cctype, cstring, algorithm, set, fstream, stdexcept.`,
    needHeader: p => `Using '${p[0]}' requires #include <${p[1]}> at the top.`,
    typeMismatch: p => `Cannot convert ${tyName(p[0])} to ${tyName(p[1])}.`,
    templateDeduction: p => `Cannot deduce one type T for template function '${p[0]}' from its arguments. Make the argument types match or write ${p[0]}<type>(...).`,
    caseNotConstant: p => 'A case value must be an integer constant known at compile time.',
    duplicateCase: p => `The case value ${p[0]} appears twice.`,
    badReturn: p => `This return does not match the function's return type (${tyName(p[0])}). A void function returns no value; other functions must return one.`,
    tooManyInitializers: p => `There are more initializers than the array size ${p[0]}.`,
    refNeedsInit: p => `The reference '${p[0]}' must be initialized with a variable when it is declared.`,
    badOverride: p => `'${p[0]}' is marked override, but no base class has a virtual function with the same signature.`,
    stackOverflow: p => 'The calls are nested too deeply, so the simulator stopped. The recursion may never end. Real C++ would overflow the stack and crash.',
    danglingPointer: p => 'A pointer to a variable that no longer exists (a local of a finished block or function) was used. C++ does not guarantee a result.',
    uncaughtException: p => `The program terminates because of an uncaught exception: ${p[0]}${p[1] ? ` (what: ${p[1]})` : ''}. Catch it with try/catch.`,
    abstractInstantiation: p => `'${p[0]}' is an abstract class with a pure virtual function, so it cannot be instantiated. Use it through a pointer or reference, or implement everything in a derived class.`,
    privateAccess: p => `'${p[0]}' is a private (or protected) member and cannot be accessed here. Use a member function of the class.`,
    noSuchMember: p => `There is no member or function named '${p[0]}' in this class.`,
    noMatchingConstructor: p => `'${tyName(p[0])}' has no constructor that matches these arguments.`,
    noMatchingFunction: p => `'${p[0]}' cannot be called with these arguments. Check the number and types of the arguments.`,
    ambiguousCall: p => `The call to '${p[0]}' matches more than one function equally well. Make the argument types explicit.`,
    undeclaredFunction: p => `Declare (or define) the function '${p[0]}' before calling it. Add a prototype above.`,
    undefinedFunction: p => `Function '${p[0]}' is declared but never defined, so linking fails.`,
    refBindRvalue: p => `The reference parameter (T&) of '${p[0]}' needs a variable, not a value. A const T& can also take a temporary.`,
    constViolation: p => 'A const value cannot be modified. Only const member functions can be called on a const object.',
    invalidOperands: p => 'This operator cannot be used with these types.',
    nullDeref: p => 'A null pointer (nullptr) was dereferenced. C++ does not guarantee a result; programs usually crash.',
    useAfterFree: p => 'Memory that was already released with delete was used. C++ does not guarantee a result.',
    doubleFree: p => 'Memory that was already released was deleted again. C++ does not guarantee a result.',
    deleteMismatch: p => 'new and delete do not match. Use delete[] for new[], delete for new, and only delete pointers that came from new. C++ does not guarantee a result.',
    indexOutOfBounds: p => `Index ${p[1]} is outside '${p[0]}' (size ${p[2]}). Real C++ does not stop here; the result is undefined.`,
    arraySizeNotConstant: p => 'An array size must be a positive integer constant known at compile time. Use a number or a const int.',
    unsupportedFeature: p => `The learning engine does not support '${p[0]}'.`,
  });

  let lang = 'ko';
  let activeLang = 'ko';
  function setLang(value) {
    if (value === 'ko' || value === 'en') lang = activeLang = value;
  }
  function getLang() { return lang; }
  function message(code, params) {
    const table = messages[activeLang];
    const text = table[code];
    if (!text) throw new Error(`missing message ${code}`);
    return text(params || []);
  }
  const ko = () => activeLang === 'ko';
  /** Picks the active-language text for ad-hoc notes. */
  const tr = (koText, enText) => (activeLang === 'ko' ? koText : enText);

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
  const ubError = (line, code, params) => new SimError('ub', line, code, params);
  const unsupported = (line, what) => new SimError('unsupported', line, 'unsupportedFeature', [what]);

  // ---------------------------------------------------------------- tokenizer

  const NUMBER_RE = /(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/y;
  const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/y;

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

      if ((c >= '0' && c <= '9') || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
        NUMBER_RE.lastIndex = i;
        const m = NUMBER_RE.exec(src);
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
        IDENT_RE.lastIndex = i;
        const m = IDENT_RE.exec(src);
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
  // Builds a syntax tree with line numbers.  Names are not resolved here; the
  // checker does that.  The parser only needs to know which identifiers are
  // type names (builtin, class, enum, template parameter) to tell declarations
  // from expressions, as a real C++ parser does.

  const BUILTIN_TYPES = ['int', 'double', 'char', 'bool', 'void', 'size_t', 'auto'];
  const LIB_TYPES = ['string', 'ifstream', 'ofstream', 'istream', 'ostream', 'exception', 'runtime_error',
    'logic_error', 'invalid_argument', 'out_of_range', 'length_error', 'domain_error', 'range_error'];
  const LIB_TEMPLATES = ['set'];
  const FORBIDDEN_WORDS = ['vector', 'map', 'goto', 'union', 'friend', 'unordered_map', 'unordered_set', 'multimap',
    'multiset', 'deque', 'typedef', 'static', 'extern', 'volatile', 'mutable', 'register', 'inline', 'explicit',
    'float', 'long', 'short', 'unsigned', 'signed', 'wchar_t', 'nullptr_t', 'thread', 'shared_ptr', 'unique_ptr',
    'dynamic_cast', 'reinterpret_cast', 'const_cast', 'sizeof...', 'decltype', 'noexcept', 'concept', 'requires'];
  const UNSUPPORTED_TEMPLATES = ['list', 'stack', 'queue', 'array', 'pair', 'tuple', 'function', 'bitset', 'priority_queue'];
  const ASSIGN_OPS = ['=', '+=', '-=', '*=', '/=', '%='];
  const OPERATOR_NAMES = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '<<', '>>', '=', '+=', '-=', '[', '!', '++', '--'];

  function parse(tokens) {
    let p = 0;
    const items = [];
    const P = { items, headers: new Set(), usingStd: false, soft: null, stack: [] };
    const typeNames = new Set([...BUILTIN_TYPES, ...LIB_TYPES]);
    const templates = new Map(LIB_TEMPLATES.map(name => [name, 'class']));
    let loopDepth = 0;
    let switchDepth = 0;
    let currentClassName = null;
    let inClassBody = false;

    const peek = (k = 0) => tokens[Math.min(p + k, tokens.length - 1)];
    const next = () => tokens[p++];
    const isOp = (tok, v) => tok.t === 'op' && tok.v === v;
    const isId = (tok, v) => tok.t === 'id' && tok.v === v;
    const prevLine = () => (p > 0 ? tokens[p - 1].line : 1);
    const show = (tok) => (tok.t === 'eof' ? message('endOfFile') : `'${tok.text || tok.v}'`);

    function expectOp(v, what) {
      const tok = peek();
      if (isOp(tok, v)) return next();
      throw compileError(tok.line, 'expectedToken', [what || `'${v}'`, show(tok)]);
    }

    function soft(error) { if (!P.soft) P.soft = error; }

    // A missing ';' is recorded and parsing continues as if it were present, so
    // that the checker can still report an earlier semantic error first.
    function expectSemicolon() {
      const tok = peek();
      if (isOp(tok, ';')) return next();
      if (tok.line !== prevLine() || tok.t === 'eof' || isOp(tok, '}')) {
        soft(compileError(prevLine(), 'missingSemicolon', []));
        return null;
      }
      if (isOp(tok, ':')) {
        soft(compileError(tok.line, 'colonInsteadOfSemicolon', []));
        throw P.soft;
      }
      soft(compileError(tok.line, 'semicolonBefore', [show(tok)]));
      return null;
    }

    function checkForbidden() {
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.t !== 'id') continue;
        if (FORBIDDEN_WORDS.includes(tok.v)) throw unsupported(tok.line, tok.v);
        if (UNSUPPORTED_TEMPLATES.includes(tok.v) && isOp(tokens[i + 1], '<')) {
          throw unsupported(tok.line, tok.v);
        }
      }
    }

    // ---- top level
    function run() {
      checkForbidden();
      while (peek().t !== 'eof') topLevel();
    }

    function topLevel() {
      const tok = peek();
      if (tok.t === 'pp') {
        next();
        const m = /^#\s*include\s*<\s*([A-Za-z_.]+)\s*>$/.exec(tok.v);
        if (!m) {
          if (/^#\s*include/.test(tok.v)) throw compileError(tok.line, 'badInclude', []);
          throw new SimError('unsupported', tok.line, 'unsupportedPreprocessor', []);
        }
        if (!KNOWN_HEADERS.includes(m[1])) throw compileError(tok.line, 'unknownHeader', [m[1]]);
        P.headers.add(m[1]);
        return;
      }
      if (isId(tok, 'using')) {
        next();
        const ns = next();
        if (!(ns.t === 'id' && ns.v === 'namespace')) throw compileError(ns.line, 'expectedNamespace', []);
        const name = next();
        if (!(name.t === 'id' && name.v === 'std')) throw compileError(name.line, 'expectedStd', []);
        expectSemicolon();
        P.usingStd = true;
        return;
      }
      if (isId(tok, 'namespace')) throw unsupported(tok.line, 'namespace');
      if (isId(tok, 'template')) return templateItem();
      if (isOp(tok, ';')) { next(); return; }
      return item(null);
    }

    function templateItem() {
      const kw = next();
      expectOp('<');
      const params = [];
      for (;;) {
        const kind = next();
        if (!(kind.t === 'id' && (kind.v === 'typename' || kind.v === 'class'))) {
          throw compileError(kind.line, 'expectedToken', ["'typename'", show(kind)]);
        }
        const name = next();
        if (name.t !== 'id') throw compileError(name.line, 'expectedToken', [message('endOfFile'), show(name)]);
        params.push(name.v);
        if (isOp(peek(), ',')) { next(); continue; }
        break;
      }
      expectOp('>');
      const added = params.filter(name => !typeNames.has(name));
      added.forEach(name => typeNames.add(name));
      try {
        item({ params, line: kw.line });
      } finally {
        added.forEach(name => typeNames.delete(name));
      }
    }

    // One declaration at namespace scope: class, enum, function or variable.
    function item(tmpl) {
      const tok = peek();
      if (isId(tok, 'class') || isId(tok, 'struct')) return classItem(tmpl);
      if (isId(tok, 'enum')) return enumItem();
      // out-of-class constructor / destructor definition: Robot::Robot(...) or Robot::~Robot()
      if (tok.t === 'id' && typeNames.has(tok.v) && isOp(peek(1), '::') &&
          (isOp(peek(2), '~') || (isId(peek(2), tok.v) && isOp(peek(3), '(')))) {
        return functionItem(null, tmpl);
      }
      if (!startsType(0)) {
        throw compileError(tok.line, 'expectedFunction', [show(tok)]);
      }
      const spec = declSpec();
      return functionOrVariable(spec, tmpl);
    }

    function functionOrVariable(spec, tmpl) {
      const nameTok = peek();
      if (nameTok.t !== 'id') throw compileError(nameTok.line, 'expectedFunctionName', [show(nameTok)]);
      const isFn = isOp(peek(1), '(') || isOp(peek(1), '::') ||
        (isId(nameTok, 'operator'));
      if (isFn) return functionItem(spec, tmpl);
      if (tmpl) throw unsupported(nameTok.line, 'template variable');
      const decl = declaratorsAfter(spec, nameTok.line);
      items.push({ k: 'gvar', decl, line: nameTok.line });
      return undefined;
    }

    function classItem(tmpl) {
      const kw = next();
      const name = next();
      if (name.t !== 'id') throw compileError(name.line, 'expectedFunctionName', [show(name)]);
      const cls = { k: 'class', name: name.v, isStruct: kw.v === 'struct', base: null, members: [],
        tparams: tmpl ? tmpl.params : null, line: name.line, endLine: name.line };
      typeNames.add(name.v);
      if (tmpl) templates.set(name.v, 'class');
      if (isOp(peek(), ':')) {
        next();
        let access = cls.isStruct ? 'public' : 'private';
        if (isId(peek(), 'public') || isId(peek(), 'private') || isId(peek(), 'protected')) access = next().v;
        const base = typeSpec();
        if (!base) throw compileError(peek().line, 'expectedToken', ['base class', show(peek())]);
        if (isOp(peek(), ',')) throw unsupported(peek().line, 'multiple inheritance');
        if (access !== 'public') throw unsupported(kw.line, `${access} inheritance`);
        cls.base = base;
      }
      expectOp('{');
      items.push(tmpl ? { k: 'template', tparams: tmpl.params, item: cls, line: tmpl.line } : cls);
      const savedClass = currentClassName;
      const savedIn = inClassBody;
      currentClassName = name.v;
      inClassBody = true;
      let access = cls.isStruct ? 'public' : 'private';
      while (!isOp(peek(), '}')) {
        if (peek().t === 'eof') throw compileError(prevLine(), 'unclosedMain', []);
        if ((isId(peek(), 'public') || isId(peek(), 'private') || isId(peek(), 'protected')) && isOp(peek(1), ':')) {
          access = next().v; next(); continue;
        }
        if (isOp(peek(), ';')) { next(); continue; }
        member(cls, access);
      }
      cls.endLine = next().line;
      currentClassName = savedClass;
      inClassBody = savedIn;
      expectSemicolon();
      return undefined;
    }

    function member(cls, access) {
      const start = peek();
      if (isId(start, 'template')) throw unsupported(start.line, 'member template');
      if (isId(start, 'enum') || isId(start, 'class') || isId(start, 'struct')) throw unsupported(start.line, 'nested type');
      let isVirtual = false;
      if (isId(start, 'virtual')) { next(); isVirtual = true; }
      // destructor
      if (isOp(peek(), '~')) {
        next();
        const nm = next();
        const fn = fnHeader({ k: 'fn', name: `~${nm.v}`, line: nm.line, ret: null, isDtor: true, isVirtual, access, cls: cls.name });
        classMethodBody(cls, fn);
        return;
      }
      // constructor
      if (isId(peek(), cls.name) && isOp(peek(1), '(')) {
        const nm = next();
        const fn = fnHeader({ k: 'fn', name: nm.v, line: nm.line, ret: null, isCtor: true, access, cls: cls.name });
        classMethodBody(cls, fn);
        return;
      }
      if (!startsType(0)) throw compileError(start.line, 'expectedToken', ['member declaration', show(start)]);
      const spec = declSpec();
      const nameTok = peek();
      if (nameTok.t !== 'id') throw compileError(nameTok.line, 'expectedFunctionName', [show(nameTok)]);
      if (isId(nameTok, 'operator') || isOp(peek(1), '(')) {
        const name = functionName();
        const fn = fnHeader({ k: 'fn', name, line: nameTok.line, ret: spec, isVirtual, access, cls: cls.name });
        classMethodBody(cls, fn);
        return;
      }
      const decl = declaratorsAfter(spec, nameTok.line, true);
      for (const v of decl.vars) cls.members.push({ k: 'field', tn: decl.tn, ptr: v.ptr, ref: v.ref, dims: v.dims,
        name: v.name, init: v.init, access, line: v.line, ctorArgs: v.ctorArgs });
    }

    function classMethodBody(cls, fn) {
      cls.members.push(fn);
      parseFnTail(fn);
    }

    function functionName() {
      const tok = next();
      if (!isId(tok, 'operator')) return tok.v;
      let sym = next();
      if (isOp(sym, '(') && isOp(peek(), ')')) { next(); return 'operator()'; }
      if (isOp(sym, '[')) { expectOp(']'); return 'operator[]'; }
      if (sym.t !== 'op' || !OPERATOR_NAMES.includes(sym.v)) throw compileError(sym.line, 'expectedToken', ['operator symbol', show(sym)]);
      return `operator${sym.v}`;
    }

    // Parses "(params) [const] [override]" for a function node whose name is already consumed.
    function fnHeader(fn) {
      expectOp('(');
      fn.params = [];
      if (!isOp(peek(), ')')) {
        for (;;) {
          fn.params.push(param());
          if (isOp(peek(), ',')) { next(); continue; }
          break;
        }
      }
      if (fn.params.length === 1 && fn.params[0].tn.name === 'void' && !fn.params[0].ptr && !fn.params[0].name) fn.params = [];
      expectOp(')');
      if (isId(peek(), 'const')) { next(); fn.isConst = true; }
      if (isId(peek(), 'override')) { next(); fn.isOverride = true; }
      return fn;
    }

    function param() {
      const tok = peek();
      if (!startsType(0)) throw compileError(tok.line, 'expectedToken', ['parameter type', show(tok)]);
      const spec = declSpec();
      let ptr = spec.ptr;
      let ref = spec.ref;
      let name = '';
      let dims = null;
      if (peek().t === 'id') name = next().v;
      while (isOp(peek(), '[')) {
        next();
        dims = dims || [];
        dims.push(isOp(peek(), ']') ? null : expression());
        expectOp(']');
      }
      if (isOp(peek(), '=')) throw unsupported(peek().line, 'default argument');
      return { tn: spec.tn, ptr, ref, name, dims, line: tok.line, ptrConst: spec.ptrConst };
    }

    // After the header: either ';' (declaration), '= 0' / '= default' / '= delete', or an init list + body.
    function parseFnTail(fn) {
      if (isOp(peek(), '=')) {
        next();
        const v = next();
        if (v.t === 'num' && v.v === 0) fn.isPure = true;
        else if (isId(v, 'default')) fn.isDefault = true;
        else if (isId(v, 'delete')) fn.isDeleted = true;
        else throw compileError(v.line, 'expectedToken', ["'0'", show(v)]);
        expectSemicolon();
        return fn;
      }
      if (isOp(peek(), ';')) { next(); return fn; }
      if (fn.isCtor || fn.isCtorDef) {
        fn.init = [];
        if (isOp(peek(), ':')) {
          next();
          for (;;) {
            const nm = next();
            if (nm.t !== 'id') throw compileError(nm.line, 'expectedToken', ['member name', show(nm)]);
            let targs = null;
            if (isOp(peek(), '<')) targs = typeArgs();
            expectOp('(');
            const args = callArgs();
            fn.init.push({ name: nm.v, targs, args, line: nm.line });
            if (isOp(peek(), ',')) { next(); continue; }
            break;
          }
        }
      }
      if (!isOp(peek(), '{')) {
        const tok = peek();
        throw compileError(tok.line, 'expectedToken', [message('openFunctionBody'), show(tok)]);
      }
      const savedLoop = loopDepth, savedSwitch = switchDepth;
      loopDepth = 0; switchDepth = 0;
      const open = next();
      fn.body = { k: 'block', body: [], line: open.line, endLine: open.line };
      parseStatements(fn.body.body, fn.body);
      loopDepth = savedLoop; switchDepth = savedSwitch;
      fn.endLine = fn.body.endLine;
      return fn;
    }

    // Reads statements until the matching '}' (which is consumed).
    function parseStatements(arr, blockNode) {
      P.stack.push(arr);
      while (!isOp(peek(), '}')) {
        if (peek().t === 'eof') throw compileError(prevLine(), 'unclosedMain', []);
        const s = statement(arr);
        if (s) arr.push(s);
      }
      const close = next();
      if (blockNode) blockNode.endLine = close.line;
      P.stack.pop();
      return close.line;
    }

    function functionItem(spec, tmpl) {
      let qual = null;
      let nameTok = peek();
      let isCtorDef = false;
      let isDtor = false;
      let name;
      if (spec === null) {
        qual = next().v; next();
        if (isOp(peek(), '~')) { next(); isDtor = true; name = `~${next().v}`; }
        else { name = next().v; isCtorDef = true; }
      } else if (isOp(peek(1), '::')) {
        qual = next().v; next();
        name = functionName();
      } else {
        name = functionName();
      }
      const fn = { k: 'fn', name, line: nameTok.line, ret: spec, qual, isCtorDef, isDtor, isCtor: isCtorDef, cls: qual };
      fnHeader(fn);
      const node = tmpl ? { k: 'template', tparams: tmpl.params, item: fn, line: tmpl.line } : fn;
      if (tmpl) templates.set(name, 'fn');
      items.push(node);
      parseFnTail(fn);
      return undefined;
    }

    function enumItem() {
      const kw = next();
      if (isId(peek(), 'class') || isId(peek(), 'struct')) throw unsupported(kw.line, 'enum class');
      const name = next();
      if (name.t !== 'id') throw compileError(name.line, 'expectedToken', ['enum name', show(name)]);
      typeNames.add(name.v);
      expectOp('{');
      const consts = [];
      while (!isOp(peek(), '}')) {
        const c = next();
        if (c.t !== 'id') throw compileError(c.line, 'expectedToken', ['enumerator', show(c)]);
        let value = null;
        if (isOp(peek(), '=')) { next(); value = assignment(); }
        consts.push({ name: c.v, value, line: c.line });
        if (isOp(peek(), ',')) { next(); continue; }
        break;
      }
      expectOp('}');
      expectSemicolon();
      items.push({ k: 'enum', name: name.v, consts, line: name.line });
    }

    // ---- types
    function startsType(k) {
      const t = peek(k);
      if (t.t !== 'id') return false;
      if (t.v === 'const' || t.v === 'constexpr') return true;
      if (t.v === 'std' && isOp(peek(k + 1), '::')) {
        const n = peek(k + 2);
        return n.t === 'id' && (LIB_TYPES.includes(n.v) || templates.has(n.v));
      }
      if (typeNames.has(t.v)) return true;
      if (templates.get(t.v) === 'class' && isOp(peek(k + 1), '<')) return true;
      return false;
    }

    function typeArgs() {
      expectOp('<');
      const args = [];
      for (;;) {
        const spec = declSpec();
        args.push(spec.ptr ? Object.assign({}, spec.tn, { ptrArg: spec.ptr }) : spec.tn);
        if (isOp(peek(), ',')) { next(); continue; }
        break;
      }
      const close = peek();
      if (isOp(close, '>>')) { close.v = '>'; } else expectOp('>');
      return args;
    }

    // type-specifier: [const] [std::] name [<args>] [::iterator]
    function typeSpec() {
      const first = peek();
      let cst = false;
      if (isId(first, 'const') || isId(first, 'constexpr')) { next(); cst = true; }
      let std = false;
      if (isId(peek(), 'std') && isOp(peek(1), '::')) { next(); next(); std = true; }
      const tok = peek();
      if (tok.t !== 'id') {
        if (cst) throw compileError(tok.line, 'expectedToken', ['type name', show(tok)]);
        return null;
      }
      if (!typeNames.has(tok.v) && !(templates.get(tok.v) === 'class')) {
        if (cst || std) throw compileError(tok.line, 'expectedToken', ['type name', show(tok)]);
        return null;
      }
      next();
      const tn = { name: tok.v, targs: [], std, cst, line: tok.line, suffix: '' };
      if (templates.get(tok.v) === 'class' && isOp(peek(), '<')) tn.targs = typeArgs();
      else if (templates.get(tok.v) === 'class' && !isOp(peek(), '<') && !(inClassBody && tok.v === currentClassName)) {
        throw compileError(tok.line, 'expectedToken', ["'<'", show(peek())]);
      }
      if (isOp(peek(), '::') && isId(peek(1), 'iterator')) { next(); next(); tn.suffix = '::iterator'; }
      if (isId(peek(), 'const')) { next(); tn.cst = true; }
      return tn;
    }

    // type-specifier followed by pointer/reference marks (used for params, returns, casts, catch).
    function declSpec() {
      const tn = typeSpec();
      if (!tn) throw compileError(peek().line, 'expectedToken', ['type name', show(peek())]);
      let ptr = 0;
      let ref = false;
      let ptrConst = false;
      while (isOp(peek(), '*')) { next(); ptr++; if (isId(peek(), 'const')) { next(); ptrConst = true; } }
      if (isOp(peek(), '&')) { next(); ref = true; }
      return { tn, ptr, ref, ptrConst };
    }

    // ---- declarations
    // Parses declarators after the type has been read; the first declarator's name is the next token.
    function declaratorsAfter(spec, line, inClass) {
      const vars = [];
      let first = true;
      for (;;) {
        let ptr = first ? spec.ptr : 0;
        let ref = first ? spec.ref : false;
        let ptrConst = first ? Boolean(spec.ptrConst) : false;
        while (isOp(peek(), '*')) { next(); ptr++; if (isId(peek(), 'const')) { next(); ptrConst = true; } }
        if (isOp(peek(), '&')) { next(); ref = true; }
        first = false;
        const nameTok = next();
        if (nameTok.t !== 'id') {
          throw compileError(nameTok.line, 'expectedVariableName', [spec.tn.name, show(nameTok)]);
        }
        if (BUILTIN_TYPES.includes(nameTok.v) || ['return', 'using', 'namespace', 'main'].includes(nameTok.v)) {
          throw compileError(nameTok.line, 'invalidVariableName', [nameTok.v]);
        }
        const dims = [];
        while (isOp(peek(), '[')) {
          next();
          dims.push(isOp(peek(), ']') ? null : expression());
          expectOp(']');
        }
        let init = null;
        let ctorArgs = null;
        if (isOp(peek(), '=')) {
          next();
          init = isOp(peek(), '{') ? initList() : assignment();
        } else if (isOp(peek(), '(') && !inClass) {
          next();
          ctorArgs = callArgs();
        } else if (isOp(peek(), '{')) {
          init = initList(); init.brace = true;
        }
        vars.push({ name: nameTok.v, ptr, ref, dims, init, ctorArgs, line: nameTok.line, ptrConst });
        if (isOp(peek(), ',')) { next(); continue; }
        break;
      }
      expectSemicolon();
      return { k: 'decl', tn: spec.tn, vars, line };
    }

    function initList() {
      const open = expectOp('{');
      const items = [];
      while (!isOp(peek(), '}')) {
        items.push(isOp(peek(), '{') ? initList() : assignment());
        if (!isOp(peek(), ',')) break;
        next();
      }
      expectOp('}');
      return { k: 'initList', items, line: open.line };
    }

    function declStatement() {
      const line = peek().line;
      const spec = declSpec();
      if (peek().t !== 'id') {
        throw compileError(peek().line, 'expectedVariableName', [spec.tn.name, show(peek())]);
      }
      return declaratorsAfter(spec, line);
    }

    // ---- statements
    const UNSUPPORTED_STMT = ['typedef', 'static', 'goto'];

    function statement(sink) {
      const tok = peek();
      const line = tok.line;
      if (isOp(tok, ';')) { next(); return { k: 'empty', line }; }
      if (isOp(tok, '{')) {
        next();
        const block = { k: 'block', body: [], line, endLine: line };
        if (sink) sink.push(block);
        parseStatements(block.body, block);
        return sink ? null : block;
      }
      if (tok.t === 'id') {
        switch (tok.v) {
          case 'if': {
            next(); expectOp('('); const cond = expression(); expectOp(')');
            const yes = statement(null);
            let no = null;
            if (isId(peek(), 'else')) { next(); no = statement(null); }
            return { k: 'if', cond, yes, no, line };
          }
          case 'switch': return switchStatement();
          case 'while': {
            next(); expectOp('('); const cond = expression(); expectOp(')');
            loopDepth++; const body = statement(null); loopDepth--;
            return { k: 'loop', loopKind: 'while', cond, body, line, condLine: line };
          }
          case 'do': {
            next();
            loopDepth++; const body = statement(null); loopDepth--;
            const w = next();
            if (!isId(w, 'while')) throw compileError(w.line, 'expectedToken', ["'while'", show(w)]);
            expectOp('('); const cond = expression(); expectOp(')'); expectSemicolon();
            return { k: 'loop', loopKind: 'do', cond, body, line, condLine: w.line };
          }
          case 'for': return forStatement();
          case 'break':
          case 'continue': {
            next();
            if (!loopDepth && (tok.v === 'continue' || !switchDepth)) throw compileError(line, 'unexpectedExpression', [show(tok)]);
            expectSemicolon();
            return { k: tok.v, line };
          }
          case 'return': {
            next();
            const e = isOp(peek(), ';') ? null : expression();
            expectSemicolon();
            return { k: 'return', e, line };
          }
          case 'delete': {
            next();
            const array = isOp(peek(), '[');
            if (array) { next(); expectOp(']'); }
            const e = unary();
            expectSemicolon();
            return { k: 'delete', e, array, line };
          }
          case 'throw': {
            next();
            const e = isOp(peek(), ';') ? null : expression();
            expectSemicolon();
            return { k: 'throw', e, line };
          }
          case 'try': return tryStatement();
          case 'else': throw compileError(line, 'unexpectedExpression', [show(tok)]);
          default:
            if (UNSUPPORTED_STMT.includes(tok.v)) throw unsupported(line, tok.v);
        }
        if (startsType(0) && declAhead()) return declStatement();
      }
      return exprStatement();
    }

    // A type name starts a declaration unless it is immediately called (temporary / functional cast).
    function declAhead() {
      const save = p;
      try {
        const spec = typeSpec();
        if (!spec) return false;
        while (isOp(peek(), '*') || isOp(peek(), '&')) next();
        return peek().t === 'id';
      } finally {
        p = save;
      }
    }

    function exprStatement() {
      const line = peek().line;
      const e = expression();
      if (e.k === 'id' && (e.name === 'cout' || e.name === 'cin') && !isOp(peek(), ';') && peek().t !== 'eof') {
        const want = e.name === 'cout' ? '<<' : '>>';
        throw compileError(peek().line, 'streamNeedsArrow', [e.name, want]);
      }
      expectSemicolon();
      return { k: 'expr', e, line };
    }

    function switchStatement() {
      const kw = next();
      expectOp('('); const cond = expression(); expectOp(')');
      expectOp('{');
      const cases = [];
      switchDepth++;
      let current = null;
      P.stack.push([]);
      while (!isOp(peek(), '}')) {
        const label = peek();
        if (label.t === 'eof') throw compileError(prevLine(), 'unclosedMain', []);
        if (isId(label, 'case') || isId(label, 'default')) {
          next();
          const value = label.v === 'case' ? ternary() : null;
          expectOp(':');
          current = { line: label.line, value, body: [] };
          cases.push(current);
          continue;
        }
        if (!current) throw compileError(label.line, 'unexpectedExpression', [show(label)]);
        const s = statement(current.body);
        if (s) current.body.push(s);
      }
      P.stack.pop();
      next(); switchDepth--;
      return { k: 'switch', cond, cases, line: kw.line };
    }

    function forStatement() {
      const kw = next();
      expectOp('(');
      // range-based for:  for (decl : range)
      if (startsType(0)) {
        const save = p;
        try {
          const spec = declSpec();
          if (peek().t === 'id' && isOp(peek(1), ':')) {
            const name = next();
            next();
            const range = expression();
            expectOp(')');
            loopDepth++; const body = statement(null); loopDepth--;
            return { k: 'loop', loopKind: 'range', decl: { tn: spec.tn, ptr: spec.ptr, ref: spec.ref, name: name.v, line: name.line },
              range, body, line: kw.line, condLine: kw.line };
          }
        } catch (e) {
          if (!(e instanceof SimError)) throw e;
        }
        p = save;
      }
      let init = null;
      if (isOp(peek(), ';')) next();
      else if (startsType(0) && declAhead()) init = declStatement();
      else {
        const line = peek().line;
        const e = expression();
        expectOp(';');
        init = { k: 'expr', e, line };
      }
      let cond = null;
      if (!isOp(peek(), ';')) cond = expression();
      expectOp(';');
      let inc = null;
      if (!isOp(peek(), ')')) inc = { k: 'expr', e: expression(), line: peek().line };
      expectOp(')');
      loopDepth++; const body = statement(null); loopDepth--;
      return { k: 'loop', loopKind: 'for', init, cond, inc, body, line: kw.line, condLine: kw.line };
    }

    function tryStatement() {
      const kw = next();
      if (!isOp(peek(), '{')) throw compileError(peek().line, 'expectedToken', ["'{'", show(peek())]);
      const body = statement(null);
      const handlers = [];
      while (isId(peek(), 'catch')) {
        const c = next();
        expectOp('(');
        let h;
        if (isOp(peek(), '.')) {
          expectOp('.'); expectOp('.'); expectOp('.');
          h = { all: true, line: c.line };
        } else {
          const spec = declSpec();
          const name = peek().t === 'id' ? next().v : '';
          h = { tn: spec.tn, ptr: spec.ptr, ref: spec.ref, name, line: c.line };
        }
        expectOp(')');
        if (!isOp(peek(), '{')) throw compileError(peek().line, 'expectedToken', ["'{'", show(peek())]);
        h.body = statement(null);
        handlers.push(h);
      }
      if (!handlers.length) throw compileError(peek().line, 'expectedToken', ["'catch'", show(peek())]);
      return { k: 'try', body, handlers, line: kw.line };
    }

    // ---- expressions
    function expression() { return assignment(); }

    function assignment() {
      const left = ternary();
      const tok = peek();
      if (tok.t === 'op' && ASSIGN_OPS.includes(tok.v)) {
        next();
        const right = assignment();
        return { k: 'assign', op: tok.v, l: left, r: right, line: left.line };
      }
      return left;
    }

    function ternary() {
      const c = logicalOr();
      if (isOp(peek(), '?')) {
        next();
        const a = expression();
        expectOp(':');
        const b = assignment();
        return { k: 'cond', c, a, b, line: c.line };
      }
      return c;
    }

    function binaryLevel(ops, nextLevel) {
      return function level() {
        let left = nextLevel();
        while (peek().t === 'op' && ops.includes(peek().v)) {
          const tok = next();
          const right = nextLevel();
          left = { k: 'bin', op: tok.v, l: left, r: right, line: left.line, opLine: tok.line };
        }
        return left;
      };
    }

    const multiplicative = binaryLevel(['*', '/', '%'], () => unary());
    const additive = binaryLevel(['+', '-'], () => multiplicative());
    const shift = binaryLevel(['<<', '>>'], () => additive());
    const relational = binaryLevel(['<', '<=', '>', '>='], () => shift());
    const equality = binaryLevel(['==', '!='], () => relational());
    const logicalAnd = binaryLevel(['&&'], () => equality());
    const logicalOr = binaryLevel(['||'], () => logicalAnd());

    function unary() {
      const tok = peek();
      if (tok.t === 'op' && ['-', '+', '!', '*', '&', '++', '--'].includes(tok.v)) {
        next();
        const e = unary();
        return { k: 'un', op: tok.v, e, line: tok.line };
      }
      if (isId(tok, 'new')) return newExpr();
      if (isId(tok, 'sizeof')) {
        next();
        expectOp('(');
        let target;
        if (startsType(0)) { const spec = declSpec(); target = { tn: spec.tn, ptr: spec.ptr }; }
        else target = { e: expression() };
        expectOp(')');
        return { k: 'sizeof', target, line: tok.line };
      }
      if (isOp(tok, '(') && startsType(1)) {
        // C-style cast: (type) unary
        const save = p;
        next();
        try {
          const spec = declSpec();
          if (isOp(peek(), ')')) {
            next();
            const e = unary();
            return { k: 'cast', style: 'c', tn: spec.tn, ptr: spec.ptr, ref: spec.ref, e, line: tok.line };
          }
        } catch (e) {
          if (!(e instanceof SimError)) throw e;
        }
        p = save;
      }
      return postfix();
    }

    function newExpr() {
      const kw = next();
      const spec = declSpec();
      let count = null;
      let args = null;
      if (isOp(peek(), '[')) { next(); count = expression(); expectOp(']'); }
      else if (isOp(peek(), '(')) { next(); args = callArgs(); }
      return { k: 'new', tn: spec.tn, ptr: spec.ptr, count, args, line: kw.line };
    }

    function callArgs() {
      const args = [];
      while (!isOp(peek(), ')')) {
        args.push(assignment());
        if (!isOp(peek(), ',')) break;
        next();
      }
      expectOp(')');
      return args;
    }

    function postfix() {
      let e = primary();
      for (;;) {
        const tok = peek();
        if (isOp(tok, '(')) {
          next();
          const args = callArgs();
          e = { k: 'call', callee: e, args, line: e.line, parenLine: tok.line };
        } else if (isOp(tok, '[')) {
          next();
          const idx = expression();
          expectOp(']');
          e = { k: 'index', base: e, idx, line: e.line };
        } else if (isOp(tok, '.') || isOp(tok, '->')) {
          next();
          const name = next();
          if (name.t !== 'id') throw compileError(name.line, 'expectedToken', ['member name', show(name)]);
          e = { k: 'member', obj: e, name: name.v, arrow: tok.v === '->', line: e.line, nameLine: name.line };
        } else if (isOp(tok, '++') || isOp(tok, '--')) {
          next();
          e = { k: 'post', op: tok.v, e, line: e.line };
        } else {
          return e;
        }
      }
    }

    function primary() {
      const tok = peek();
      if (tok.t === 'num') {
        next();
        if (!tok.isDouble && tok.v > INT_MAX) throw new SimError('unsupported', tok.line, 'integerLiteralRange', []);
        return { k: 'num', ty: tok.isDouble ? 'double' : 'int', v: tok.v, text: tok.text, line: tok.line };
      }
      if (tok.t === 'str') { next(); return { k: 'str', v: tok.v, text: tok.text, line: tok.line }; }
      if (tok.t === 'chr') { next(); return { k: 'chr', v: tok.v, text: tok.text, line: tok.line }; }
      if (isOp(tok, '(')) {
        next();
        const inner = expression();
        expectOp(')', message('closingParen'));
        return { k: 'paren', e: inner, line: tok.line };
      }
      if (isOp(tok, '[')) throw unsupported(tok.line, 'lambda');
      if (tok.t === 'id') {
        if (tok.v === 'true' || tok.v === 'false') { next(); return { k: 'bool', v: tok.v === 'true' ? 1 : 0, text: tok.v, line: tok.line }; }
        if (tok.v === 'nullptr' || tok.v === 'NULL') { next(); return { k: 'nullptr', text: tok.v, line: tok.line }; }
        if (tok.v === 'this') { next(); return { k: 'this', line: tok.line }; }
        if (isId(tok, 'static_cast')) {
          next();
          expectOp('<');
          const spec = declSpec();
          const close = peek();
          if (isOp(close, '>>')) close.v = '>'; else expectOp('>');
          expectOp('(');
          const e = expression();
          expectOp(')');
          return { k: 'cast', style: 'static', tn: spec.tn, ptr: spec.ptr, ref: spec.ref, e, line: tok.line };
        }
        // functional cast / temporary object:  int(x)  Robot(5)  Box<int>(3)  string("a")
        if (startsType(0) && !isOp(peek(1), '::') &&
            (isOp(peek(1), '(') || (templates.get(tok.v) === 'class' && isOp(peek(1), '<')) || (isId(tok, 'std')))) {
          const save = p;
          try {
            const spec = typeSpec();
            if (spec && isOp(peek(), '(')) {
              next();
              const args = callArgs();
              return { k: 'ctorcall', tn: spec, args, line: tok.line };
            }
          } catch (e) {
            if (!(e instanceof SimError)) throw e;
          }
          p = save;
        }
        return idExpr();
      }
      if (tok.t === 'eof' || isOp(tok, ';')) {
        throw compileError(tok.t === 'eof' ? prevLine() : tok.line, 'missingExpression', []);
      }
      throw compileError(tok.line, 'unexpectedExpression', [show(tok)]);
    }

    function idExpr() {
      const first = next();
      let std = false;
      let name = first.v;
      const scope = [];
      if (first.v === 'std' && isOp(peek(), '::')) {
        next();
        const n = next();
        if (n.t !== 'id') throw compileError(n.line, 'unexpectedExpression', [show(n)]);
        std = true;
        name = n.v;
      }
      while (isOp(peek(), '::')) {
        next();
        scope.push(name);
        const n = next();
        if (isOp(n, '~')) { name = `~${next().v}`; continue; }
        if (n.t !== 'id') throw compileError(n.line, 'unexpectedExpression', [show(n)]);
        name = n.v;
      }
      const node = { k: 'id', name, scope, std, line: first.line };
      if (templates.get(name) === 'fn' && isOp(peek(), '<')) node.targs = typeArgs();
      return node;
    }

    try {
      run();
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      P.error = P.soft || e;
      return P;
    }
    P.error = P.soft;
    return P;
  }

  // ---------------------------------------------------------------- type helpers
  // A type is a plain string: 'int', 'Robot', 'int*', 'int[3]', 'int[2][3]', 'int[3]*' (pointer to row),
  // 'set<int>', 'set<int>::iterator', 'string', 'cstr' (string literal), 'ostream', ...

  const SCALARS = new Set(['int', 'double', 'char', 'bool', 'size_t']);
  const EXCEPTION_PARENTS = { exception: null, runtime_error: 'exception', logic_error: 'exception',
    invalid_argument: 'logic_error', out_of_range: 'logic_error', length_error: 'logic_error',
    domain_error: 'logic_error', range_error: 'runtime_error' };
  const NEEDS_STDEXCEPT = ['runtime_error', 'logic_error', 'invalid_argument', 'out_of_range', 'length_error', 'domain_error', 'range_error'];
  const STD_ALWAYS_OK = new Set(['size_t', 'isalpha', 'isdigit', 'isupper', 'islower', 'isspace', 'toupper', 'tolower',
    'strlen', 'strcpy', 'strcat', 'strcmp']);
  const STD_NAMES = new Set(['cout', 'cin', 'endl', 'string', 'set', 'sort', 'find', 'binary_search', 'reverse', 'rotate',
    'getline', 'ifstream', 'ofstream', 'istream', 'ostream', 'exception', ...Object.keys(EXCEPTION_PARENTS),
    ...STD_ALWAYS_OK]);
  const ALGORITHMS = ['sort', 'find', 'binary_search', 'reverse', 'rotate'];
  const CTYPE_FNS = ['isalpha', 'isdigit', 'isupper', 'islower', 'isspace', 'toupper', 'tolower'];
  const CSTRING_FNS = ['strlen', 'strcpy', 'strcat', 'strcmp'];

  function sigOf(params) { return params.map(p => `${p.ty}${p.ref ? '&' : ''}${p.cst ? 'c' : ''}`).join(','); }
  const isPtrTy = t => t.endsWith('*');
  const pointeeTy = t => t.slice(0, -1);
  const isArrTy = t => t.endsWith(']');
  function arrParts(t) {
    const m = /^([^[]*)\[(\d*)\](.*)$/.exec(t);
    return { elem: m[1] + m[3], n: m[2] === '' ? null : Number(m[2]) };
  }
  const decayTy = t => (isArrTy(t) ? `${arrParts(t).elem}*` : t);
  const isSetTy = t => /^set<.*>$/.test(t);
  const isIterTy = t => /^set<.*>::iterator$/.test(t);
  const setElemTy = t => /^set<(.*)>(::iterator)?$/.exec(t)[1];
  const isOutStream = t => t === 'ostream' || t === 'ofstream';
  const isInStream = t => t === 'istream' || t === 'ifstream';
  const isStreamTy = t => isOutStream(t) || isInStream(t);
  const isFileStream = t => t === 'ifstream' || t === 'ofstream';

  // ---------------------------------------------------------------- semantic analysis
  // analyze() walks the syntax tree in source order, resolving names, types,
  // overloads, templates, access and const rules.  Every error is raised here,
  // before any line runs.  The tree is annotated in place for the interpreter.

  function analyze(P) {
    const headers = P.headers;
    const usingStd = P.usingStd;
    const classes = new Map();
    const enums = new Map();
    const enumConsts = new Map();
    const funcs = new Map();
    const fnTemplates = new Map();
    const classTemplates = new Map();
    const instCache = new Map();
    const globalsMap = new Map();
    const globalList = [];
    const callList = [];
    let pending = [];
    let cur = null;
    const program = { classes, funcs, globals: globalList, main: null, calls: callList, mainLine: 1, endLine: 1,
      entryName: null, entryLine: 1, functionNames: [] };

    const fail = (line, code, params) => { throw compileError(line, code, params || []); };
    const hasHeader = h => headers.has(h);

    // ---- built-in exception classes
    function registerExceptionClasses() {
      for (const [name, parent] of Object.entries(EXCEPTION_PARENTS)) {
        const info = { name, display: name, builtin: true, node: null, base: null, bases: [], fields: new Map(),
          methods: new Map(), ctors: [], dtor: null, isStruct: false, fieldOrder: [], virtualMethods: [], userCtors: true,
          abstract: false };
        if (parent) {
          const base = classes.get(parent);
          info.base = base;
          info.bases = [parent, ...base.bases];
        }
        info.fields.set('__what', { name: '__what', ty: 'string', access: 'private', owner: 'exception', hidden: true });
        info.fieldOrder = [...(info.base ? info.base.fieldOrder : []), ...(info.base ? [] : ['__what'])];
        if (!info.base) info.fieldOrder = ['__what'];
        if (info.base) for (const [k, v] of info.base.fields) if (!info.fields.has(k)) info.fields.set(k, v);
        const ctorParam = { ty: 'string', ref: true, cst: true, name: 's' };
        info.ctors.push({ name: name, display: `${name}::${name}`, cls: info, params: [ctorParam], retTy: 'void', isCtor: true,
          builtin: 'exceptionCtor', access: 'public', node: null, body: null });
        if (name === 'exception') {
          info.ctors.push({ name, display: 'exception::exception', cls: info, params: [], retTy: 'void', isCtor: true,
            builtin: 'exceptionCtor', access: 'public', node: null, body: null });
        }
        info.methods.set('what', [{ name: 'what', display: `${name}::what`, cls: info, params: [], retTy: 'cstr', isConst: true,
          virtual: true, builtin: 'what', access: 'public', node: null, body: null }]);
        classes.set(name, info);
      }
    }
    registerExceptionClasses();

    // ---- lookups
    const isEnumTy = t => enums.has(t);
    const isNumTy = t => SCALARS.has(t) || isEnumTy(t);
    const isIntegralTy = t => (SCALARS.has(t) && t !== 'double') || isEnumTy(t);
    const isClassTy = t => classes.has(t);
    const classOf = t => classes.get(t);
    const isObjectTy = t => classes.has(t) || t === 'string' || isSetTy(t) || isStreamTy(t);

    function derivesFrom(cls, baseName) {
      return cls.name === baseName || cls.bases.includes(baseName);
    }

    function lookupField(cls, name) { return cls.fields.get(name); }

    // methods named `name` visible from cls: the nearest class that declares the name hides the rest
    function lookupMethods(cls, name) {
      for (let c = cls; c; c = c.base) {
        const own = c.methods.get(name);
        if (own && own.length) return own;
      }
      return null;
    }

    function needHeader(line, name, header) {
      if (!hasHeader(header)) fail(line, 'needHeader', [name, header]);
    }

    function stdGate(line, name, qualified) {
      if (!qualified && !usingStd && !STD_ALWAYS_OK.has(name)) {
        if (name === 'endl') fail(line, 'endlNeedsStd');
        fail(line, 'nameNeedsStd', [name, name]);
      }
    }

    // ---- type resolution
    function resolveBase(tn) {
      const name = tn.name;
      const line = tn.line;
      if (cur && cur.tsub && Object.prototype.hasOwnProperty.call(cur.tsub, name)) {
        return cur.tsub[name] + (tn.suffix || '');
      }
      let t;
      if (SCALARS.has(name) || name === 'void' || name === 'auto') {
        t = name;
      } else if (name === 'string') {
        if (!hasHeader('iostream') && !hasHeader('string')) needHeader(line, 'string', 'string');
        stdGate(line, name, tn.std);
        t = 'string';
      } else if (name === 'set') {
        needHeader(line, 'set', 'set');
        stdGate(line, name, tn.std);
        if (tn.targs.length !== 1) fail(line, 'expectedToken', ["'<'", message('endOfFile')]);
        const arg = typeFromNode(tn.targs[0]);
        if (!['int', 'char', 'double', 'string', 'bool'].includes(arg)) fail(line, 'invalidOperands');
        t = `set<${arg}>${tn.suffix || ''}`;
      } else if (name === 'ifstream' || name === 'ofstream') {
        needHeader(line, name, 'fstream');
        stdGate(line, name, tn.std);
        t = name;
      } else if (name === 'istream' || name === 'ostream') {
        if (!hasHeader('iostream') && !hasHeader('fstream')) needHeader(line, name, 'iostream');
        stdGate(line, name, tn.std);
        t = name;
      } else if (Object.prototype.hasOwnProperty.call(EXCEPTION_PARENTS, name)) {
        if (NEEDS_STDEXCEPT.includes(name)) needHeader(line, name, 'stdexcept');
        stdGate(line, name, tn.std);
        t = name;
      } else if (classTemplates.has(name)) {
        if (!tn.targs.length) fail(line, 'expectedToken', ["'<'", message('endOfFile')]);
        t = instantiateClass(name, tn.targs.map(typeFromNode), line).name;
      } else if (classes.has(name)) {
        t = name;
      } else if (enums.has(name)) {
        t = name;
      } else {
        fail(line, 'undeclared', [name]);
      }
      return t;
    }

    function typeFromNode(tn) {
      return resolveBase(tn) + '*'.repeat(tn.ptrArg || 0);
    }

    function fullType(tn, ptr, dims) {
      let t = resolveBase(tn) + '*'.repeat(ptr || 0);
      if (dims) for (const d of dims) t += `[${d === null || d === undefined ? '' : d}]`;
      return t;
    }

    // ---- constant evaluation (array sizes, case labels, enum values)
    function constEval(n) {
      switch (n.k) {
        case 'num': return n.v;
        case 'chr': return n.v;
        case 'bool': return n.v;
        case 'const': return n.v;
        case 'var': return n.sym && n.sym.constVal !== undefined ? n.sym.constVal : undefined;
        case 'conv': return n.how === 'arith' ? constConvert(n.ty, constEval(n.e)) : undefined;
        case 'un': {
          const v = constEval(n.e);
          if (v === undefined) return undefined;
          if (n.op === '-') return -v;
          if (n.op === '+') return v;
          if (n.op === '!') return Number(!v);
          return undefined;
        }
        case 'bin': {
          const a = constEval(n.l);
          const b = constEval(n.r);
          if (a === undefined || b === undefined) return undefined;
          const intResult = n.ty !== 'double';
          switch (n.op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': return b === 0 ? undefined : (intResult ? Math.trunc(a / b) : a / b);
            case '%': return b === 0 ? undefined : a % b;
            case '<': return Number(a < b);
            case '>': return Number(a > b);
            case '<=': return Number(a <= b);
            case '>=': return Number(a >= b);
            case '==': return Number(a === b);
            case '!=': return Number(a !== b);
            case '&&': return Number(Boolean(a && b));
            case '||': return Number(Boolean(a || b));
            default: return undefined;
          }
        }
        case 'sizeof': return n.size;
        case 'cast': return constEval(n.e);
        default: return undefined;
      }
    }
    function constConvert(ty, v) {
      if (v === undefined) return undefined;
      if (ty === 'int' || ty === 'size_t') return Math.trunc(v);
      if (ty === 'bool') return v ? 1 : 0;
      if (ty === 'char') return ((Math.trunc(v) % 256) + 256) % 256;
      return v;
    }

    // sizes used by sizeof (LP64)
    function sizeOfType(t) {
      if (t === 'char' || t === 'bool') return 1;
      if (t === 'int') return 4;
      if (t === 'double' || t === 'size_t' || isPtrTy(t)) return 8;
      if (isEnumTy(t)) return 4;
      if (t === 'string') return 24;
      if (isArrTy(t)) {
        const { elem, n } = arrParts(t);
        return (n || 0) * sizeOfType(elem);
      }
      const cls = classes.get(t);
      if (cls) {
        let total = 0;
        let align = 1;
        for (const name of cls.fieldOrder) {
          const f = cls.fields.get(name);
          const s = sizeOfType(f.ty);
          const a = Math.min(8, Math.max(1, f.ty === 'string' ? 8 : isArrTy(f.ty) ? sizeOfType(arrParts(f.ty).elem) : s));
          total = Math.ceil(total / a) * a + s;
          align = Math.max(align, a);
        }
        if (cls.hasVirtual) { total += 8; align = 8; }
        return Math.max(1, Math.ceil(total / align) * align);
      }
      return 8;
    }

    // ---- scopes and variables
    function pushScope() { cur.scopes.push(new Map()); }
    function popScope() { cur.scopes.pop(); }
    function declareVar(name, props, line) {
      const scope = cur.scopes[cur.scopes.length - 1];
      if (scope.has(name)) fail(line, 'redeclaration', [name, scope.get(name).line, name]);
      const sym = Object.assign({ name, line, slot: cur.nslots++, local: true }, props);
      scope.set(name, sym);
      return sym;
    }
    function lookupVar(name) {
      if (cur) {
        for (let i = cur.scopes.length - 1; i >= 0; i--) {
          const v = cur.scopes[i].get(name);
          if (v) return v;
        }
      }
      return globalsMap.get(name) || null;
    }

    // ---- class declaration
    function newClassInfo(name, node, display) {
      return { name, display: display || name, node, builtin: false, base: null, bases: [], fields: new Map(), methods: new Map(),
        ctors: [], dtor: null, isStruct: node ? node.isStruct : false, fieldOrder: [], abstract: false, hasVirtual: false,
        userCtors: false, fieldDecls: [], tsub: null };
    }

    function makeParams(nodes, line) {
      return nodes.map(pn => {
        let ty = resolveBase(pn.tn) + '*'.repeat(pn.ptr);
        let cst = pn.tn.cst;
        let pcst = false;
        if (pn.dims) {
          ty = `${ty}*`; // T a[] / T a[N] decays to a pointer
          pcst = pn.tn.cst;
          cst = false;
        } else if (pn.ptr) {
          pcst = pn.tn.cst;
          cst = Boolean(pn.ptrConst);
        }
        if (ty === 'void') fail(pn.line, 'invalidVariableName', ['void']);
        return { ty, ref: pn.ref, cst: pn.ref ? cst : (pn.ptr ? Boolean(pn.ptrConst) : pn.tn.cst), name: pn.name, pcst, line: pn.line, isArrayParam: Boolean(pn.dims) };
      });
    }

    function declareClass(node, tsub, instName) {
      const display = instName || node.name;
      const info = newClassInfo(display, node, display);
      info.tsub = tsub || null;
      if (classes.has(display)) fail(node.line, 'redeclaration', [node.name, classes.get(display).node ? classes.get(display).node.line : 1, node.name]);
      classes.set(display, info);
      const savedCur = cur;
      cur = { tsub: tsub || null, scopes: [new Map()], nslots: 0, cls: null, fi: null };
      try {
        if (node.base) {
          const baseTy = typeFromNode(node.base);
          const base = classes.get(baseTy);
          if (!base) fail(node.line, 'undeclared', [node.base.name]);
          info.base = base;
          info.bases = [base.name, ...base.bases];
          info.fieldOrder = base.fieldOrder.slice();
          for (const [k, v] of base.fields) info.fields.set(k, v);
          info.hasVirtual = base.hasVirtual;
        }
        for (const m of node.members) {
          if (m.k === 'field') {
            if (m.ref) throw unsupported(m.line, 'reference member');
            const dims = m.dims.map(d => {
              if (d === null) fail(m.line, 'arraySizeNotConstant');
              const v = constEvalLate(d);
              if (v === undefined || !Number.isInteger(v) || v <= 0) fail(m.line, 'arraySizeNotConstant');
              return v;
            });
            const ty = fullType(m.tn, m.ptr, dims);
            if (ty === 'void') fail(m.line, 'invalidVariableName', ['void']);
            if (info.fields.has(m.name) && info.fields.get(m.name).owner === info.name) {
              fail(m.line, 'redeclaration', [m.name, info.fields.get(m.name).line, m.name]);
            }
            const f = { name: m.name, ty, access: m.access, owner: info.name, line: m.line, initNode: m.init, cst: m.tn.cst && !m.ptr,
              pcst: m.ptr ? m.tn.cst : false, dims };
            info.fields.set(m.name, f);
            info.fieldOrder.push(m.name);
            info.fieldDecls.push(f);
          } else if (m.k === 'fn') {
            declareMethod(info, m);
          }
        }
      } finally {
        cur = savedCur;
      }
      // abstract if any pure virtual remains unimplemented
      const finals = new Map();
      for (let c = info; c; c = c.base) {
        for (const list of c.methods.values()) for (const fi of list) {
          if (!fi.virtual || fi.isCtor || fi.isDtor) continue;
          const key = `${fi.name}(${sigOf(fi.params)})`;
          if (!finals.has(key)) finals.set(key, fi);
        }
      }
      info.abstract = [...finals.values()].some(fi => fi.pure);
      if (info.methods.size) for (const list of info.methods.values()) for (const fi of list) if (fi.virtual) info.hasVirtual = true;
      if (info.dtor && info.dtor.virtual) info.hasVirtual = true;
      return info;
    }

    // evaluates a size expression outside any function (field array sizes)
    function constEvalLate(d) {
      const saved = cur;
      cur = cur || { tsub: null, scopes: [new Map()], nslots: 0, cls: null, fi: null };
      try { return constEval(cxv(d)); } finally { cur = saved; }
    }

    function declareMethod(info, m) {
      const savedCur = cur;
      cur = { tsub: info.tsub, scopes: [new Map()], nslots: 0, cls: info, fi: null };
      let retTy = 'void';
      let retRef = false;
      let params;
      try {
        params = makeParams(m.params, m.line);
        if (m.ret) {
          retTy = resolveBase(m.ret.tn) + '*'.repeat(m.ret.ptr);
          retRef = m.ret.ref;
        }
      } finally {
        cur = savedCur;
      }
      const display = `${info.display}::${m.name}`;
      const fi = { name: m.name, display, cls: info, params, retTy, retRef, retCst: Boolean(m.ret && m.ret.tn.cst),
        isConst: Boolean(m.isConst), isCtor: Boolean(m.isCtor), isDtor: Boolean(m.isDtor), access: m.access, node: m, body: null,
        virtual: Boolean(m.isVirtual), pure: Boolean(m.isPure), override: Boolean(m.isOverride), isDefault: Boolean(m.isDefault),
        isDeleted: Boolean(m.isDeleted), tsub: info.tsub, line: m.line };
      m.fi = fi;
      if (fi.isCtor) {
        if (info.ctors.some(c => sigOf(c.params) === sigOf(fi.params))) fail(m.line, 'redeclaration', [m.name, m.line, m.name]);
        info.ctors.push(fi);
        if (!fi.isDefault) info.userCtors = true;
      } else if (fi.isDtor) {
        info.dtor = fi;
      } else {
        // overriding: a method with the same signature as a base virtual is virtual too
        const inherited = info.base ? lookupMethods(info.base, m.name) : null;
        let overridden = null;
        if (inherited) overridden = inherited.find(b => sigOf(b.params) === sigOf(fi.params));
        if (overridden && overridden.virtual) fi.virtual = true;
        if (fi.override && !(overridden && overridden.virtual)) fail(m.line, 'badOverride', [m.name]);
        const list = info.methods.get(m.name) || [];
        if (list.some(o => sigOf(o.params) === sigOf(fi.params))) fail(m.line, 'redeclaration', [m.name, m.line, m.name]);
        list.push(fi);
        info.methods.set(m.name, list);
      }
      if (m.body) fi.body = m.body;
      return fi;
    }

    // ---- templates
    function cloneNode(node) { return JSON.parse(JSON.stringify(node)); }

    function instantiateClass(name, targs, line) {
      const inst = `${name}<${targs.join(',')}>`;
      if (instCache.has(inst)) return instCache.get(inst);
      const tmpl = classTemplates.get(name);
      if (targs.length !== tmpl.tparams.length) fail(line, 'templateDeduction', [name]);
      const tsub = {};
      tmpl.tparams.forEach((tp, i) => { tsub[tp] = targs[i]; });
      tsub[name] = inst;
      const node = cloneNode(tmpl.item);
      const info = declareClass(node, tsub, inst);
      info.templateName = name;
      instCache.set(inst, info);
      pending.push(() => checkClassBodies(info));
      return info;
    }

    // deduces template parameters from argument types; returns the instantiated FnInfo
    function instantiateFn(tmpl, explicit, argNodes, line, name) {
      const node = tmpl.item;
      const tsub = {};
      explicit.forEach((t, i) => { if (i < tmpl.tparams.length) tsub[tmpl.tparams[i]] = t; });
      const bind = (tp, ty) => {
        if (tmpl.tparams.indexOf(tp) < explicit.length) return true;
        if (tsub[tp] !== undefined && tsub[tp] !== ty) return false;
        tsub[tp] = ty;
        return true;
      };
      if (node.params.length !== argNodes.length) return null;
      for (let i = 0; i < node.params.length; i++) {
        const pn = node.params[i];
        let a = argNodes[i].ty;
        if (a === 'cstr' && !pn.ref) a = 'char*';
        if (a === 'cstr') a = 'cstr';
        if (a === 'nullptr_t') continue;
        if (pn.dims) {
          if (isArrTy(a)) a = arrParts(a).elem + '*';
          if (!isPtrTy(a)) return null;
          if (tmpl.tparams.includes(pn.tn.name) && !bind(pn.tn.name, pointeeTy(a))) return 'conflict';
          continue;
        }
        if (!pn.ref) a = decayTy(a);
        if (tmpl.tparams.includes(pn.tn.name)) {
          let t = a;
          for (let s = 0; s < pn.ptr; s++) { if (!isPtrTy(t)) return null; t = pointeeTy(t); }
          if (!bind(pn.tn.name, t)) return 'conflict';
        } else if (pn.tn.targs && pn.tn.targs.length) {
          const m = /^([^<]+)<(.*)>$/.exec(a);
          if (!m || m[1] !== pn.tn.name) return null;
          const inner = pn.tn.targs[0];
          if (tmpl.tparams.includes(inner.name) && !bind(inner.name, m[2])) return 'conflict';
        }
      }
      for (const tp of tmpl.tparams) if (tsub[tp] === undefined) return 'undeduced';
      const key = `${name}<${tmpl.tparams.map(tp => tsub[tp]).join(',')}>`;
      if (instCache.has(key)) return instCache.get(key);
      const clone = cloneNode(node);
      const savedCur = cur;
      cur = { tsub, scopes: [new Map()], nslots: 0, cls: null, fi: null };
      let params;
      let retTy;
      let retRef;
      try {
        params = makeParams(clone.params, clone.line);
        retTy = resolveBase(clone.ret.tn) + '*'.repeat(clone.ret.ptr);
        retRef = clone.ret.ref;
      } finally {
        cur = savedCur;
      }
      const fi = { name, display: name, cls: null, params, retTy, retRef, node: clone, body: clone.body, tsub,
        isTemplateInst: true, line: clone.line, templateKey: key };
      instCache.set(key, fi);
      pending.push(() => checkFnBody(fi));
      return fi;
    }

    function drainPending() {
      while (pending.length) {
        const todo = pending;
        pending = [];
        for (const job of todo) job();
      }
    }

    // ---- conversions ------------------------------------------------------------
    // convInfo ranks an implicit conversion: 0 exact, 1 promotion, 2 conversion, 3 user-defined.
    function convInfo(from, to, e) {
      if (from === to) return { rank: 0, how: 'same' };
      if (from === 'manip' || to === 'manip') return null;
      const fromNum = isNumTy(from);
      const toNum = isNumTy(to);
      if (fromNum && toNum) {
        if (isEnumTy(to)) return null;
        if (isEnumTy(from)) return { rank: to === 'int' ? 1 : 2, how: 'arith' };
        if ((from === 'char' || from === 'bool') && to === 'int') return { rank: 1, how: 'arith' };
        return { rank: 2, how: 'arith' };
      }
      if (to === 'bool' && (isPtrTy(from) || from === 'nullptr_t' || isArrTy(from))) return { rank: 2, how: 'truth' };
      if (isArrTy(from) && isPtrTy(to)) {
        const dec = decayTy(from);
        if (dec === to) return { rank: 0, how: 'a2p' };
        const pc = convInfo(dec, to, null);
        return pc ? { rank: Math.max(1, pc.rank), how: 'a2p', then: pc } : null;
      }
      if (isPtrTy(to)) {
        if (from === 'nullptr_t') return { rank: 2, how: 'null' };
        if (from === 'int' && e && e.k === 'num' && e.v === 0) return { rank: 2, how: 'null' };
        if (from === 'cstr' && (to === 'char*')) return { rank: 0, how: 'cstr2p' };
        if (isPtrTy(from)) {
          const f = classes.get(pointeeTy(from));
          const t = classes.get(pointeeTy(to));
          if (f && t && f.bases.includes(t.name)) return { rank: 2, how: 'upcast' };
        }
        return null;
      }
      if (to === 'string') {
        if (from === 'cstr') return { rank: 3, how: 'cstr2s' };
        return null;
      }
      const toCls = classes.get(to);
      if (toCls) {
        const fromCls = classes.get(from);
        if (fromCls && fromCls.bases.includes(to)) return { rank: 2, how: 'upcast' };
        if (!fromCls && !toCls.builtin) {
          // converting constructor with one parameter
          for (const c of toCls.ctors) {
            if (c.params.length !== 1 || c.isDefault) continue;
            const pc = convInfo(from, c.params[0].ty, e);
            if (pc && pc.rank <= 2) return { rank: 3, how: 'ctor', ctor: c };
          }
        }
        if (toCls.builtin && (from === 'string' || from === 'cstr')) return { rank: 3, how: 'ctor', ctor: toCls.ctors[0] };
        return null;
      }
      if (to === 'ostream' && from === 'ofstream') return { rank: 2, how: 'upcast' };
      if (to === 'istream' && from === 'ifstream') return { rank: 2, how: 'upcast' };
      return null;
    }

    function wrapConv(e, ci, to) {
      if (ci.how === 'same') return e;
      if (ci.how === 'a2p' && ci.then) {
        return { k: 'conv', how: ci.then.how, e: { k: 'conv', how: 'a2p', e, ty: decayTy(e.ty), from: e.ty, lv: false, line: e.line }, ty: to, from: decayTy(e.ty), lv: false, line: e.line };
      }
      return { k: 'conv', how: ci.how, e, ty: to, from: e.ty, lv: false, line: e.line, ctor: ci.ctor, cst: false };
    }

    function coerce(e, to, o) {
      o = o || {};
      const line = o.line === undefined ? e.line : o.line;
      const from = e.ty;
      if (from === 'manip') fail(line, 'endlPosition');
      if (to === 'void') fail(line, 'typeMismatch', [from, to]);
      if (isStreamTy(from) && isNumTy(to)) fail(line, 'streamPosition', [e.name || (isOutStream(from) ? 'cout' : 'cin'), isOutStream(from) ? '<<' : '>>']);
      if (from === 'void') fail(line, 'typeMismatch', [from, to]);
      const ci = convInfo(from, to, e);
      if (!ci) {
        if (from === 'cstr' && isNumTy(to)) fail(line, 'stringAssignment', [to]);
        fail(line, 'typeMismatch', [from, to]);
      }
      if (isPtrTy(to) && e.pc && !o.toPcst && ci.how !== 'null') fail(line, 'constViolation');
      if (ci.how === 'ctor' && ci.ctor && !ci.ctor.builtin) {
        const cls = classes.get(to);
        if (cls.abstract) fail(line, 'abstractInstantiation', [to]);
        return { k: 'ctorcall', cls, ctor: ci.ctor, args: [coerce(e, ci.ctor.params[0].ty, { line })], ty: to, lv: false, line, how: 'param' };
      }
      if (ci.how === 'ctor') return { k: 'ctorcall', cls: classes.get(to), ctor: ci.ctor, args: [coerce(e, 'string', { line })], ty: to, lv: false, line, how: 'param' };
      return wrapConv(e, ci, to);
    }

    // implicit conversion of an expression to a boolean condition
    function truthy(e0, checked) {
      const e = checked ? e0 : cxv(e0);
      const t = e.ty;
      if (t === 'bool') return e;
      if (isNumTy(t)) return { k: 'conv', how: 'truth', e, ty: 'bool', from: t, lv: false, line: e.line };
      if (isPtrTy(t) || t === 'nullptr_t') return { k: 'conv', how: 'truth', e, ty: 'bool', from: t, lv: false, line: e.line };
      if (isArrTy(t)) return { k: 'conv', how: 'truth', e: { k: 'conv', how: 'a2p', e, ty: decayTy(t), from: t, lv: false, line: e.line }, ty: 'bool', from: decayTy(t), lv: false, line: e.line };
      if (isStreamTy(t) || (e.k === 'bcall' && isStreamTy(t))) { markSoft(e); return { k: 'conv', how: 'streamOk', e, ty: 'bool', from: t, lv: false, line: e.line }; }
      if (e.k === 'ctorcall' || isClassTy(t) || t === 'string') fail(e.line, 'typeMismatch', [t, 'bool']);
      fail(e.line, 'typeMismatch', [t, 'bool']);
      return e;
    }

    // stream reads used as conditions fail softly (failbit) instead of stopping the learner's program
    function markSoft(e) {
      if (!e) return;
      if (e.sk === 'in' || e.k === 'bcall') e.soft = true;
      if (e.k === 'bin' && e.sk === 'in') markSoft(e.l);
      if (e.k === 'un' && e.op === '!') markSoft(e.e);
      if (e.k === 'conv') markSoft(e.e);
    }

    // ---- overload resolution -------------------------------------------------------
    function argRanks(cand, args) {
      if (cand.params.length !== args.length) return { fail: 'arity' };
      const ranks = [];
      for (let i = 0; i < args.length; i++) {
        const p = cand.params[i];
        const a = args[i];
        if (a.ty === 'manip' || a.ty === 'void') return { fail: 'conv' };
        if (p.ref) {
          let ci = convInfo(a.ty, p.ty, a);
          if (!ci) return { fail: 'conv' };
          if (!p.cst) {
            if (!a.lv) return { fail: 'rvalue' };
            if (a.cst) return { fail: 'const' };
            if (ci.how !== 'same' && ci.how !== 'upcast') return { fail: 'rvalue' };
          }
          ranks.push(ci.rank);
        } else {
          const ci = convInfo(a.ty, p.ty, a);
          if (!ci) return { fail: 'conv' };
          if (isPtrTy(p.ty) && a.pc && !p.pcst && ci.how !== 'null') return { fail: 'const' };
          ranks.push(ci.rank);
        }
      }
      return { ranks };
    }

    function dominated(a, b) { // true if b is at least as good everywhere and better somewhere
      let better = false;
      for (let i = 0; i < a.length; i++) {
        if (b[i] > a[i]) return false;
        if (b[i] < a[i]) better = true;
      }
      return better;
    }

    // returns { fi } | { error: 'none'|'rvalue'|'ambiguous' }
    function pickBest(cands, args, extra) {
      const viable = [];
      const reasons = [];
      for (const c of cands) {
        const r = argRanks(c, args);
        if (r.fail) { reasons.push(r.fail); continue; }
        if (extra && !extra(c)) { reasons.push('const'); continue; }
        viable.push({ c, ranks: r.ranks });
      }
      if (!viable.length) {
        const arityOk = reasons.filter(r => r !== 'arity');
        if (arityOk.length && arityOk.every(r => r === 'rvalue')) return { error: 'rvalue' };
        if (arityOk.length && arityOk.every(r => r === 'const')) return { error: 'const' };
        return { error: 'none' };
      }
      let best = viable.filter(v => !viable.some(w => w !== v && dominated(v.ranks, w.ranks)));
      if (best.length > 1) {
        const nonTemplate = best.filter(v => !v.c.isTemplateInst);
        if (nonTemplate.length === 1) best = nonTemplate;
      }
      if (best.length !== 1) return { error: 'ambiguous' };
      return { fi: best[0].c };
    }

    function bindArgs(fi, args, line) {
      return args.map((a, i) => {
        const p = fi.params[i];
        if (p.ref) {
          if (convInfo(a.ty, p.ty, a).how === 'same' || !p.cst) {
            if (a.ty === p.ty) return a;
            return { k: 'conv', how: 'upcast', e: a, ty: p.ty, from: a.ty, lv: a.lv, cst: a.cst, line: a.line };
          }
          // const T& bound to a converted temporary
          return coerce(a, p.ty, { line });
        }
        return coerce(a, p.ty, { line, toPcst: p.pcst });
      });
    }

    function callError(name, kind, line, ctor) {
      if (ctor) fail(line, 'noMatchingConstructor', [name]);
      if (kind === 'rvalue') fail(line, 'refBindRvalue', [name]);
      if (kind === 'const') fail(line, 'constViolation');
      if (kind === 'ambiguous') fail(line, 'ambiguousCall', [name]);
      fail(line, 'noMatchingFunction', [name]);
    }

    function noteCall(fi, line) { if (!fi.builtin) callList.push({ fn: fi, line }); }

    // ---- access ------------------------------------------------------------------
    function accessible(member, ownerName) {
      if (member.access === 'public') return true;
      if (!cur || !cur.cls) return false;
      if (cur.cls.name === ownerName) return true;
      if (member.access === 'protected' && derivesFrom(cur.cls, ownerName)) return true;
      return false;
    }
    function checkAccess(member, ownerName, name, line) {
      if (!accessible(member, ownerName)) fail(line, 'privateAccess', [name]);
    }

    // ---- object construction checks --------------------------------------------------
    // Finds the constructor used for `Cls name(args)` / `new Cls(args)` / `Cls(args)`.
    function resolveCtor(cls, args, line) {
      if (cls.abstract) fail(line, 'abstractInstantiation', [cls.name]);
      if (cls.builtin) {
        const r = pickBest(cls.ctors, args);
        if (!r.fi) fail(line, 'noMatchingConstructor', [cls.name]);
        return { fi: r.fi, args: bindArgs(r.fi, args, line), how: 'param' };
      }
      // implicit copy constructor candidate
      const copyParam = { ty: cls.name, ref: true, cst: true, name: 'other' };
      const cands = cls.ctors.filter(c => !c.isDeleted).slice();
      const hasUserCopy = cls.ctors.some(c => c.params.length === 1 && c.params[0].ty === cls.name && c.params[0].ref);
      const implicitCopy = { name: cls.name, display: `${cls.display}::${cls.name}`, cls, params: [copyParam], isCtor: true, implicit: true, retTy: 'void' };
      if (!hasUserCopy) cands.push(implicitCopy);
      if (!cls.userCtors) cands.push({ name: cls.name, display: `${cls.display}::${cls.name}`, cls, params: [], isCtor: true, implicit: true, retTy: 'void', implicitDefault: true });
      const r = pickBest(cands, args);
      if (!r.fi) {
        if (r.error === 'ambiguous') fail(line, 'ambiguousCall', [cls.name]);
        fail(line, 'noMatchingConstructor', [cls.name]);
      }
      const fi = r.fi;
      const isCopy = fi.params.length === 1 && fi.params[0].ty === cls.name && fi.params[0].ref;
      if (fi.isDeleted) fail(line, 'noMatchingConstructor', [cls.name]);
      if (fi.access && fi.access !== 'public' && !(cur && cur.cls && cur.cls.name === cls.name)) fail(line, 'privateAccess', [cls.name]);
      if (!fi.implicit) noteCall(fi, line);
      return { fi, args: bindArgs(fi, args, line), how: isCopy ? 'copy' : (args.length ? 'param' : 'default') };
    }

    // ---- expressions ----------------------------------------------------------------
    function cxv(e, opt) {
      const r = cx(e, opt);
      if (r.ty === 'manip') fail(r.line, 'endlPosition');
      return r;
    }

    function showNode(e) {
      if (e.text) return `'${e.text}'`;
      if (e.name) return `'${e.name}'`;
      return "'…'";
    }

    function undeclaredName(e, asLvalue) {
      const name = e.name;
      if (asLvalue) fail(e.line, 'undeclaredVar', [name, name]);
      const names = [];
      if (cur) for (const scope of cur.scopes) for (const k of scope.keys()) names.push(k);
      for (const k of globalsMap.keys()) names.push(k);
      if (cur && cur.cls) for (const k of cur.cls.fields.keys()) names.push(k);
      const similar = names.find(k => k.toLowerCase() === name.toLowerCase());
      if (similar) fail(e.line, 'caseMismatch', [name, similar]);
      fail(e.line, 'undeclared', [name]);
    }

    function cxId(e, opt) {
      const name = e.name;
      // qualified names
      if (e.scope.length) {
        const q = e.scope[e.scope.length - 1];
        if (q === 'string' && name === 'npos') return { k: 'num', ty: 'size_t', v: -1, npos: true, lv: false, line: e.line, text: 'npos' };
        if (q === 'std') fail(e.line, 'undeclared', [name]);
        if (classes.has(q) && cur && cur.cls) {
          // Base::member inside a method
          const f = classes.get(q).fields.get(name);
          if (f) return fieldAccessImplicit(e, f);
        }
        fail(e.line, 'undeclared', [`${q}::${name}`]);
      }
      if (e.std && !STD_NAMES.has(name)) fail(e.line, 'notInStd', [name]);
      const sym = lookupVar(name);
      if (sym) {
        const node = { k: 'var', sym, name, ty: sym.ty, lv: true, cst: sym.cst, pc: sym.pcst, line: e.line };
        if (sym.constVal !== undefined && !sym.ref) node.constVal = sym.constVal;
        return node;
      }
      if (cur && cur.cls) {
        const f = cur.cls.fields.get(name);
        if (f) return fieldAccessImplicit(e, f);
      }
      if (enumConsts.has(name)) {
        const c = enumConsts.get(name);
        return { k: 'const', v: c.value, ty: c.ty, lv: false, line: e.line, text: name };
      }
      if (name === 'endl') {
        stdGate(e.line, 'endl', e.std);
        return { k: 'endl', ty: 'manip', lv: false, line: e.line };
      }
      if (name === 'cout' || name === 'cin') {
        if (!hasHeader('iostream')) fail(e.line, 'needIostream', [name]);
        stdGate(e.line, name, e.std);
        return { k: 'stream', which: name, name, ty: name === 'cout' ? 'ostream' : 'istream', lv: true, line: e.line };
      }
      if (e.std) fail(e.line, 'notInStd', [name]);
      if (funcs.has(name) || fnTemplates.has(name) || ALGORITHMS.includes(name) || CTYPE_FNS.includes(name)) {
        throw unsupported(e.line, 'function pointer');
      }
      if (!opt || !opt.noIoHint) {
        if (opt && opt.stmtStart && ['print', 'printf', 'Cout', 'COUT', 'Cin', 'output', 'input'].includes(name)) fail(e.line, 'unknownIoName', [name]);
      }
      return undeclaredName(e, opt && opt.lvalue);
    }

    function fieldAccessImplicit(e, f) {
      if (!cur.fi || cur.fi.isStaticLike) fail(e.line, 'undeclared', [e.name]);
      checkAccess(f, f.owner, f.name, e.line);
      const thisNode = { k: 'this', ty: `${cur.cls.name}*`, implicit: true, line: e.line, pc: cur.fi.isConst };
      const constObj = Boolean(cur.fi.isConst);
      return { k: 'field', obj: thisNode, arrow: true, field: f, name: f.name, ty: f.ty, lv: true,
        cst: constObj || f.cst, pc: f.pcst, line: e.line, implicit: true };
    }

    function arithResult(a, b) {
      if (a === 'double' || b === 'double') return 'double';
      if (a === 'size_t' || b === 'size_t') return 'size_t';
      return 'int';
    }

    function needArith(e, line) {
      if (!isNumTy(e.ty)) fail(line, 'invalidOperands');
    }

    function toValueNode(e) { // arrays decay when used as values
      if (isArrTy(e.ty)) return { k: 'conv', how: 'a2p', e, ty: decayTy(e.ty), from: e.ty, lv: false, line: e.line, pc: e.cst };
      return e;
    }

    function cx(e, opt) {
      switch (e.k) {
        case 'paren': { const r = cx(e.e, opt); return r; }
        case 'num': return { k: 'num', ty: e.ty, v: e.v, text: e.text, lv: false, line: e.line };
        case 'chr': return { k: 'num', ty: 'char', v: e.v, text: e.text, lv: false, line: e.line };
        case 'bool': return { k: 'num', ty: 'bool', v: e.v, text: e.text, lv: false, line: e.line };
        case 'str': return { k: 'str', v: e.v, ty: 'cstr', text: e.text, lv: false, line: e.line };
        case 'nullptr': return { k: 'nullptr', ty: 'nullptr_t', lv: false, line: e.line, text: e.text };
        case 'this': {
          if (!cur || !cur.cls || !cur.fi || cur.fi.isStaticLike) fail(e.line, 'unexpectedExpression', ["'this'"]);
          return { k: 'this', ty: `${cur.cls.name}*`, lv: false, line: e.line, pc: cur.fi.isConst };
        }
        case 'id': return cxId(e, opt);
        case 'un': return cxUnary(e);
        case 'post': return cxIncDec(e, true);
        case 'bin': return cxBinary(e);
        case 'assign': return cxAssign(e);
        case 'cond': return cxCond(e);
        case 'call': return cxCall(e, opt);
        case 'member': return cxMember(e);
        case 'index': return cxIndex(e);
        case 'cast': return cxCast(e);
        case 'ctorcall': return cxCtorCall(e);
        case 'new': return cxNew(e);
        case 'sizeof': return cxSizeof(e);
        case 'initList': fail(e.line, 'unexpectedExpression', ["'{'"]); return e;
        default: throw new Error(`unknown expression ${e.k}`);
      }
    }

    function cxUnary(e) {
      const op = e.op;
      if (op === '++' || op === '--') return cxIncDec(e, false);
      if (op === '&') {
        const t = cxv(e.e, { lvalue: true });
        if (!t.lv) fail(e.line, 'expectedLvalue', [showNode(e.e)]);
        return { k: 'un', op: '&', e: t, ty: `${t.ty}*`, lv: false, pc: Boolean(t.cst), line: e.line };
      }
      if (op === '*') {
        const t = toValueNode(cxv(e.e));
        if (isIterTy(t.ty)) return { k: 'un', op: 'iter*', e: t, ty: setElemTy(t.ty), lv: true, cst: true, line: e.line };
        if (!isPtrTy(t.ty)) fail(e.line, 'invalidOperands');
        const inner = pointeeTy(t.ty);
        if (inner === 'void') fail(e.line, 'invalidOperands');
        return { k: 'un', op: '*', e: t, ty: inner, lv: true, cst: Boolean(t.pc), pc: false, line: e.line };
      }
      const t = cxv(e.e);
      if (op === '!') return { k: 'un', op: '!', e: truthy(t, true), ty: 'bool', lv: false, line: e.line };
      if (!isNumTy(t.ty)) fail(e.line, 'invalidOperands');
      const ty = t.ty === 'double' ? 'double' : (t.ty === 'size_t' ? 'size_t' : 'int');
      return { k: 'un', op, e: t, ty, lv: false, line: e.line };
    }

    function cxIncDec(e, post) {
      const t = cxv(e.e, { lvalue: true });
      if (!t.lv) fail(e.line, 'expectedLvalue', [showNode(e.e)]);
      if (t.cst) fail(e.line, 'constViolation');
      if (!(isNumTy(t.ty) && t.ty !== 'bool' && !isEnumTy(t.ty)) && !isPtrTy(t.ty) && !isIterTy(t.ty)) fail(e.line, 'invalidOperands');
      return { k: post ? 'post' : 'pre', op: e.op, e: t, ty: t.ty, lv: !post, line: e.line, sk: 'assign' };
    }

    function cxCond(e) {
      const c = truthy(e.c);
      let a = toValueNode(cxv(e.a));
      let b = toValueNode(cxv(e.b));
      let ty;
      if (a.ty === b.ty) ty = a.ty;
      else if (isNumTy(a.ty) && isNumTy(b.ty)) ty = arithResult(a.ty, b.ty) === 'int' && (a.ty === 'char' && b.ty === 'char') ? 'char' : arithResult(a.ty, b.ty);
      else if ((a.ty === 'cstr' && b.ty === 'string') || (a.ty === 'string' && b.ty === 'cstr')) ty = 'string';
      else if (isPtrTy(a.ty) && (b.ty === 'nullptr_t' || (b.k === 'num' && b.v === 0))) ty = a.ty;
      else if (isPtrTy(b.ty) && (a.ty === 'nullptr_t' || (a.k === 'num' && a.v === 0))) ty = b.ty;
      else fail(e.line, 'typeMismatch', [a.ty, b.ty]);
      if (ty !== a.ty) a = coerce(a, ty);
      if (ty !== b.ty) b = coerce(b, ty);
      return { k: 'cond', c, a, b, ty, lv: a.lv && b.lv && a.ty === b.ty && isObjectTy(ty), line: e.line };
    }

    function cxIndex(e) {
      const base = cxv(e.base);
      const idx = cxv(e.idx);
      if (!isIntegralTy(idx.ty) || isEnumTy(idx.ty) && false) fail(e.line, 'invalidOperands');
      if (base.ty === 'string') return { k: 'index', base, idx, ty: 'char', lv: true, cst: base.cst, strIndex: true, line: e.line };
      if (isArrTy(base.ty)) {
        const { elem } = arrParts(base.ty);
        return { k: 'index', base, idx, ty: elem, lv: true, cst: base.cst, pc: false, line: e.line, arr: true };
      }
      if (isPtrTy(base.ty)) {
        const elem = pointeeTy(base.ty);
        if (elem === 'void') fail(e.line, 'invalidOperands');
        return { k: 'index', base, idx, ty: elem, lv: true, cst: Boolean(base.pc), line: e.line };
      }
      const ops = classes.get(base.ty) && lookupMethods(classes.get(base.ty), 'operator[]');
      if (ops) return userOperator(e, 'operator[]', base, [idx]);
      fail(e.line, 'invalidOperands');
      return e;
    }

    function cxSizeof(e) {
      let ty;
      if (e.target.tn) ty = fullType(e.target.tn, e.target.ptr, null);
      else ty = cxv(e.target.e).ty;
      if (ty === 'cstr') ty = 'char*';
      return { k: 'num', ty: 'size_t', v: sizeOfType(ty), lv: false, line: e.line, text: 'sizeof', size: sizeOfType(ty) };
    }

    function cxCast(e) {
      const to = fullType(e.tn, e.ptr, null);
      const src = toValueNode(cxv(e.e));
      const from = src.ty;
      let ok = false;
      if (isNumTy(to) && isNumTy(from)) ok = true;
      else if (isEnumTy(to) && isIntegralTy(from)) ok = true;
      else if (isPtrTy(to) && isPtrTy(from)) {
        const f = classes.get(pointeeTy(from));
        const t = classes.get(pointeeTy(to));
        ok = e.style === 'c' || (f && t && (f.bases.includes(t.name) || t.bases.includes(f.name))) || from === to;
      } else if (to === from) ok = true;
      else if (to === 'bool' && (isPtrTy(from))) ok = true;
      else if (to === 'string' && from === 'cstr') ok = true;
      else ok = false;
      if (!ok) fail(e.line, 'invalidOperands');
      const how = isNumTy(to) && isNumTy(from) ? 'arith' : (to === 'string' ? 'cstr2s' : (isPtrTy(to) && from !== to ? 'ptrcast' : 'same'));
      if (how === 'same') return Object.assign({}, src, { line: e.line });
      return { k: 'conv', how, e: src, ty: to, from, lv: false, line: e.line, explicit: true, pc: isPtrTy(to) ? src.pc : false };
    }

    function cxCtorCall(e) {
      const tn = e.tn;
      const to = fullType(tn, 0, null);
      const args = e.args.map(a => cxv(a));
      if (isNumTy(to) && !isEnumTy(to)) {
        if (args.length !== 1) fail(e.line, 'invalidOperands');
        const a = toValueNode(args[0]);
        if (!isNumTy(a.ty)) fail(e.line, 'invalidOperands');
        return { k: 'conv', how: 'arith', e: a, ty: to, from: a.ty, lv: false, line: e.line, explicit: true };
      }
      if (isEnumTy(to)) {
        const a = args[0];
        return { k: 'conv', how: 'arith', e: a, ty: to, from: a.ty, lv: false, line: e.line, explicit: true };
      }
      if (to === 'string') {
        if (args.length === 0) return { k: 'conv', how: 'cstr2s', e: { k: 'str', v: '', ty: 'cstr', lv: false, line: e.line }, ty: 'string', from: 'cstr', lv: false, line: e.line };
        if (args.length === 1 && (args[0].ty === 'string' || args[0].ty === 'cstr')) return coerce(args[0], 'string');
        fail(e.line, 'noMatchingConstructor', ['string']);
      }
      if (isSetTy(to)) {
        if (args.length) fail(e.line, 'noMatchingConstructor', [to]);
        return { k: 'newset', ty: to, lv: false, line: e.line };
      }
      const cls = classes.get(to);
      if (!cls) fail(e.line, 'noMatchingConstructor', [to]);
      const r = resolveCtor(cls, args, e.line);
      return { k: 'ctorcall', cls, ctor: r.fi, args: r.args, how: r.how, ty: to, lv: false, line: e.line };
    }

    function cxNew(e) {
      const base = resolveBase(e.tn);
      const ty = base + '*'.repeat(e.ptr);
      const node = { k: 'new', allocTy: ty, ty: `${ty}*`, lv: false, line: e.line, pc: false };
      if (e.count) {
        const n = cxv(e.count);
        if (!isIntegralTy(n.ty)) fail(e.line, 'invalidOperands');
        node.count = coerce(n, 'int');
        const cls = classes.get(ty);
        if (cls) {
          if (cls.abstract) fail(e.line, 'abstractInstantiation', [ty]);
          const r = resolveCtor(cls, [], e.line);
          node.ctor = r.fi;
          node.ctorArgs = r.args;
        }
        return node;
      }
      const args = (e.args || []).map(a => cxv(a));
      const cls = classes.get(ty);
      if (cls) {
        const r = resolveCtor(cls, args, e.line);
        node.ctor = r.fi;
        node.ctorArgs = r.args;
        node.how = r.how;
      } else if (isObjectTy(ty)) {
        if (ty === 'string') node.init = args.length ? coerce(args[0], 'string') : null;
        else if (args.length) fail(e.line, 'noMatchingConstructor', [ty]);
      } else if (args.length) {
        if (args.length !== 1) fail(e.line, 'invalidOperands');
        node.init = coerce(toValueNode(args[0]), ty);
        node.zeroInit = false;
      } else if (e.args) {
        node.zeroInit = true;
      }
      return node;
    }

    // ---- binary operators ----------------------------------------------------------
    function userOperator(e, opName, left, rightArgs) {
      const lcls = classes.get(left.ty);
      const args = rightArgs;
      if (lcls) {
        const methods = lookupMethods(lcls, opName);
        if (methods) {
          const r = pickBest(methods, args, c => !left.cst || c.isConst);
          if (r.fi) {
            checkAccess(r.fi, r.fi.cls.name, opName, e.line);
            noteCall(r.fi, e.line);
            return { k: 'call', fn: r.fi, args: bindArgs(r.fi, args, e.line), recv: left, arrow: false, virt: r.fi.virtual, ty: r.fi.retTy, lv: r.fi.retRef, cst: r.fi.retCst, line: e.line, staticCls: lcls.name };
          }
        }
      }
      const free = funcs.get(opName);
      if (free) {
        const all = [left, ...args];
        const r = pickBest(free, all);
        if (r.fi) {
          noteCall(r.fi, e.line);
          return { k: 'call', fn: r.fi, args: bindArgs(r.fi, all, e.line), recv: null, virt: false, ty: r.fi.retTy, lv: r.fi.retRef, cst: r.fi.retCst, line: e.line };
        }
      }
      return null;
    }

    function cxBinary(e) {
      const op = e.op;
      // stream insertion / extraction
      if (op === '<<' || op === '>>') {
        const l = cx(e.l);
        if (isStreamTy(l.ty)) return cxStreamOp(e, l);
        if (l.ty === 'manip') fail(e.line, 'endlPosition');
        const r = cxv(e.r);
        const user = userOperator(e, `operator${op}`, l, [r]);
        if (user) return user;
        fail(e.line, 'invalidOperands');
      }
      const l0 = cx(e.l);
      if (isStreamTy(l0.ty) && (op === '<' || op === '>') && l0.k === 'stream') {
        fail(e.line, 'singleArrow', [l0.name, l0.name === 'cout' ? '<<' : '>>', op]);
      }
      if (l0.ty === 'manip') fail(e.line, 'endlPosition');
      const l = toValueNode(l0);
      if (op === '&&' || op === '||') {
        const lt = truthy(l, true);
        const rt = truthy(e.r);
        return { k: 'bin', op, l: lt, r: rt, ty: 'bool', lv: false, line: e.line, sk: 'logic' };
      }
      const r = toValueNode(cxv(e.r));
      const lt = l.ty;
      const rt = r.ty;
      // user-defined operators
      if (isClassTy(lt) || isClassTy(rt)) {
        const user = userOperator(e, `operator${op}`, l, [r]);
        if (user) return user;
        if (op === '!=' && isClassTy(lt)) {
          const eq = userOperator(e, 'operator==', l, [r]);
          if (eq) return { k: 'un', op: '!', e: eq, ty: 'bool', lv: false, line: e.line };
        }
        fail(e.line, 'invalidOperands');
      }
      const cmp = ['==', '!=', '<', '>', '<=', '>='].includes(op);
      if (cmp) return cxCompare(e, op, l, r);
      // arithmetic
      if (isNumTy(lt) && isNumTy(rt)) {
        if (op === '%' && (lt === 'double' || rt === 'double')) fail(e.line, 'percentDouble', [true]);
        const ty = arithResult(lt, rt);
        return { k: 'bin', op, l: coerceArith(l, ty), r: coerceArith(r, ty), ty, lv: false, line: e.line, sk: 'arith', opLine: e.opLine };
      }
      if (lt === 'string' && (op === '+') && (rt === 'string' || rt === 'cstr' || rt === 'char')) {
        return { k: 'bin', op: '+', l, r: rt === 'char' ? { k: 'conv', how: 'char2s', e: r, ty: 'string', from: 'char', lv: false, line: r.line } : coerce(r, 'string'), ty: 'string', lv: false, line: e.line, sk: 'strcat' };
      }
      if (rt === 'string' && op === '+' && (lt === 'cstr' || lt === 'char')) {
        return { k: 'bin', op: '+', l: lt === 'char' ? { k: 'conv', how: 'char2s', e: l, ty: 'string', from: 'char', lv: false, line: l.line } : coerce(l, 'string'), r, ty: 'string', lv: false, line: e.line, sk: 'strcat' };
      }
      if (isPtrTy(lt) && isIntegralTy(rt) && (op === '+' || op === '-')) {
        return { k: 'bin', op, l, r: coerce(r, 'int'), ty: lt, lv: false, pc: l.pc, line: e.line, sk: 'ptr' };
      }
      if (isPtrTy(rt) && isIntegralTy(lt) && op === '+') {
        return { k: 'bin', op, l: coerce(l, 'int'), r, ty: rt, lv: false, pc: r.pc, line: e.line, sk: 'ptrL' };
      }
      if (isPtrTy(lt) && isPtrTy(rt) && op === '-' && lt === rt) {
        return { k: 'bin', op, l, r, ty: 'int', lv: false, line: e.line, sk: 'ptrdiff' };
      }
      if (lt === 'cstr' || rt === 'cstr') fail(e.line, 'invalidOperands');
      fail(e.line, 'invalidOperands');
      return e;
    }

    function coerceArith(n, ty) {
      if (n.ty === ty) return n;
      // integral promotion to int for char/bool/enum and balance to the common type
      return { k: 'conv', how: 'arith', e: n, ty, from: n.ty, lv: false, line: n.line, implicitArith: true };
    }

    function cxCompare(e, op, l, r) {
      const lt = l.ty;
      const rt = r.ty;
      if (isNumTy(lt) && isNumTy(rt)) {
        if ((isEnumTy(lt) || isEnumTy(rt)) && lt !== rt && !(isEnumTy(lt) && !isEnumTy(rt)) && !(isEnumTy(rt) && !isEnumTy(lt))) fail(e.line, 'invalidOperands');
        const ty = arithResult(isEnumTy(lt) ? 'int' : lt, isEnumTy(rt) ? 'int' : rt);
        return { k: 'bin', op, l: coerceArith(l, ty), r: coerceArith(r, ty), ty: 'bool', cmpTy: ty, lv: false, line: e.line, sk: 'arith' };
      }
      const strLike = t => t === 'string' || t === 'cstr';
      if (strLike(lt) && strLike(rt) && (lt === 'string' || rt === 'string')) {
        return { k: 'bin', op, l: coerce(l, 'string'), r: coerce(r, 'string'), ty: 'bool', lv: false, line: e.line, sk: 'str' };
      }
      if (isPtrTy(lt) || isPtrTy(rt) || lt === 'nullptr_t' || rt === 'nullptr_t') {
        let ll = l;
        let rr = r;
        if (lt !== rt) {
          if (isPtrTy(lt) && (rt === 'nullptr_t' || (r.k === 'num' && r.v === 0))) rr = coerce(r, lt);
          else if (isPtrTy(rt) && (lt === 'nullptr_t' || (l.k === 'num' && l.v === 0))) ll = coerce(l, rt);
          else {
            const lc = classes.get(isPtrTy(lt) ? pointeeTy(lt) : '');
            const rc = classes.get(isPtrTy(rt) ? pointeeTy(rt) : '');
            if (lc && rc && lc.bases.includes(rc.name)) ll = coerce(l, rt);
            else if (lc && rc && rc.bases.includes(lc.name)) rr = coerce(r, lt);
            else if (!(lt === 'nullptr_t' && rt === 'nullptr_t')) fail(e.line, 'invalidOperands');
          }
        }
        return { k: 'bin', op, l: ll, r: rr, ty: 'bool', lv: false, line: e.line, sk: 'ptrcmp' };
      }
      if (isIterTy(lt) && lt === rt && (op === '==' || op === '!=')) {
        return { k: 'bin', op, l, r, ty: 'bool', lv: false, line: e.line, sk: 'itercmp' };
      }
      fail(e.line, 'invalidOperands');
      return e;
    }

    // cout << ...   cin >> ...
    function cxStreamOp(e, l) {
      const op = e.op;
      const lt = l.ty;
      if (op === '<<') {
        if (isInStream(lt)) fail(e.line, 'wrongArrowCin');
        const r = cx(e.r);
        if (r.ty === 'manip') return { k: 'bin', op, sk: 'out', l, r, rty: 'manip', ty: lt, lv: true, line: e.line };
        const rv = toValueNode(r);
        const t = rv.ty;
        if (isNumTy(t) || t === 'cstr' || t === 'string' || isPtrTy(t) || t === 'nullptr_t') {
          if (t === 'void') fail(e.line, 'invalidOperands');
          return { k: 'bin', op, sk: 'out', l, r: rv, rty: t, ty: lt, lv: true, line: e.line };
        }
        const user = userOperator(e, 'operator<<', l, [rv]);
        if (user) return user;
        if (isStreamTy(t)) fail(e.line, 'streamPosition', [r.name || 'cout', '<<']);
        fail(e.line, 'invalidOperands');
      }
      if (isOutStream(lt)) fail(e.line, 'wrongArrowCout');
      // input
      if (e.r.k === 'id' && !e.r.scope.length) {
        if (!lookupVar(e.r.name) && !(cur && cur.cls && cur.cls.fields.has(e.r.name)) && !enumConsts.has(e.r.name)) {
          fail(e.r.line, 'cinUndeclared', [e.r.name]);
        }
      }
      const r = cxv(e.r, { lvalue: true });
      if (!r.lv) fail(e.r.line, 'cinNeedsVariable', [showNode(e.r)]);
      if (r.cst) fail(e.line, 'constViolation');
      if (!(isNumTy(r.ty) || r.ty === 'string') || isEnumTy(r.ty)) {
        const user = userOperator(e, 'operator>>', l, [r]);
        if (user) return user;
        fail(e.line, 'invalidOperands');
      }
      return { k: 'bin', op, sk: 'in', l, r, rty: r.ty, ty: lt, lv: true, line: e.line };
    }

    // ---- assignment ----------------------------------------------------------------
    function cxAssign(e) {
      const l = cxv(e.l, { lvalue: true, stmtStart: false });
      if (!l.lv) fail(e.line, 'expectedLvalue', [showNode(e.l)]);
      if (l.cst) fail(e.line, 'constViolation');
      const op = e.op;
      const lt = l.ty;
      if (isArrTy(lt)) fail(e.line, 'invalidOperands');
      const r0 = cx(e.r);
      if (r0.ty === 'manip') fail(r0.line, 'endlPosition');
      const r = toValueNode(r0);
      if (op === '=') {
        if (isClassTy(lt)) {
          const cls = classes.get(lt);
          const rcls = classes.get(r.ty);
          const methods = lookupMethods(cls, 'operator=');
          if (methods) {
            const res = pickBest(methods, [r]);
            if (res.fi && !res.fi.isDeleted) {
              checkAccess(res.fi, res.fi.cls.name, 'operator=', e.line);
              noteCall(res.fi, e.line);
              return { k: 'call', fn: res.fi, args: bindArgs(res.fi, [r], e.line), recv: l, arrow: false, ty: res.fi.retTy, lv: res.fi.retRef, line: e.line, sk: 'assign' };
            }
            if (res.fi && res.fi.isDeleted) fail(e.line, 'noMatchingFunction', ['operator=']);
          }
          if (!(rcls && (rcls === cls || rcls.bases.includes(cls.name)))) {
            const rr = coerce(r, lt, { line: e.line });
            return { k: 'assign', op, l, r: rr, ty: lt, lv: true, line: e.line, kind: 'object', sk: 'assign' };
          }
          return { k: 'assign', op, l, r, ty: lt, lv: true, line: e.line, kind: 'object', cls, sk: 'assign' };
        }
        const rr = coerce(r, lt, { line: e.line, toPcst: l.pc });
        return { k: 'assign', op, l, r: rr, ty: lt, lv: true, line: e.line, kind: isObjectTy(lt) ? lt === 'string' ? 'string' : 'object' : 'scalar', sk: 'assign' };
      }
      // compound assignment
      const bop = op[0];
      if (lt === 'string' && op === '+=') {
        const rr = r.ty === 'char' ? { k: 'conv', how: 'char2s', e: r, ty: 'string', from: 'char', lv: false, line: r.line } : coerce(r, 'string');
        return { k: 'assign', op, l, r: rr, ty: lt, lv: true, line: e.line, kind: 'strcat', sk: 'assign' };
      }
      if (isPtrTy(lt) && (op === '+=' || op === '-=') && isIntegralTy(r.ty)) {
        return { k: 'assign', op, l, r: coerce(r, 'int'), ty: lt, lv: true, line: e.line, kind: 'ptr', sk: 'assign' };
      }
      if (isClassTy(lt)) {
        const user = userOperator(e, `operator${op}`, l, [r]);
        if (user) return user;
        fail(e.line, 'invalidOperands');
      }
      if (!isNumTy(lt) || !isNumTy(r.ty) || isEnumTy(lt)) fail(e.line, 'invalidOperands');
      if (op === '%=' && (lt === 'double' || r.ty === 'double')) fail(e.line, 'percentDouble', [false]);
      const common = arithResult(lt === 'bool' ? 'int' : lt, r.ty);
      return { k: 'assign', op, bop, l, r: coerceArith(r, common), ty: lt, common, lv: true, line: e.line, kind: 'compound', sk: 'assign' };
    }

    // ---- member access -------------------------------------------------------------
    function cxMember(e) {
      const obj0 = cxv(e.obj);
      let obj = obj0;
      let cls;
      let arrow = e.arrow;
      if (arrow) {
        if (!isPtrTy(obj.ty)) fail(e.line, 'invalidOperands');
        cls = classes.get(pointeeTy(obj.ty));
      } else {
        cls = classes.get(obj.ty);
      }
      if (!cls) {
        // builtin object types (string, set, streams) have only methods, handled in calls
        fail(e.nameLine || e.line, 'noSuchMember', [e.name]);
      }
      const f = cls.fields.get(e.name);
      if (!f || f.hidden) fail(e.nameLine || e.line, 'noSuchMember', [e.name]);
      checkAccess(f, f.owner, e.name, e.nameLine || e.line);
      const constObj = arrow ? Boolean(obj.pc) : Boolean(obj.cst);
      return { k: 'field', obj, arrow, field: f, name: f.name, ty: f.ty, lv: arrow ? true : obj.lv, cst: constObj || f.cst, pc: f.pcst, line: e.line };
    }

    // ---- calls ----------------------------------------------------------------------
    function cxCall(e, opt) {
      const callee = e.callee;
      if (callee.k === 'paren') throw unsupported(e.line, 'function pointer');
      if (callee.k === 'member') return cxMethodCall(e, callee);
      if (callee.k !== 'id') throw unsupported(e.line, 'function call');
      return cxFreeCall(e, callee, opt);
    }

    function cxArgs(list) { return list.map(a => cxv(a)); }

    function cxFreeCall(e, callee, opt) {
      const name = callee.name;
      // cout(...) / cin(...)
      if ((name === 'cout' || name === 'cin') && !lookupVar(name) && !callee.scope.length) {
        cxId(callee, opt);
        fail(e.line, 'streamParen', [name, name, name === 'cout' ? '<<' : '>>']);
      }
      const args = cxArgs(e.args);
      const line = e.line;
      let cands = null;
      let implicitThis = false;
      let qualifiedCls = null;
      if (callee.scope.length) {
        const q = callee.scope[callee.scope.length - 1];
        const cls = classes.get(q);
        if (cls && cur && cur.cls) {
          const methods = lookupMethods(cls, name);
          if (!methods) fail(line, 'noSuchMember', [name]);
          cands = methods;
          implicitThis = true;
          qualifiedCls = cls;
        } else {
          fail(line, 'undeclaredFunction', [`${q}::${name}`]);
        }
      } else if (cur && cur.cls && lookupMethods(cur.cls, name)) {
        cands = lookupMethods(cur.cls, name);
        implicitThis = true;
      }
      if (!cands) {
        const user = funcs.get(name) || [];
        const tmpls = fnTemplates.get(name) || [];
        if (!user.length && !tmpls.length) {
          const b = builtinFreeCall(e, callee, args);
          if (b) return b;
          const known = [...funcs.keys()].find(k => k.toLowerCase() === name.toLowerCase());
          if (known) fail(line, 'caseMismatch', [name, known]);
          fail(line, 'undeclaredFunction', [name]);
        }
        cands = user.slice();
        let templateProblem = null;
        const explicit = callee.targs ? callee.targs.map(t => typeFromNode(t)) : [];
        for (const tmpl of tmpls) {
          const inst = instantiateFn(tmpl, explicit, args, line, name);
          if (inst && inst !== 'conflict' && inst !== 'undeduced') cands.push(inst);
          else if (inst) templateProblem = inst;
        }
        if (callee.targs && !tmpls.length) fail(line, 'undeclaredFunction', [name]);
        const r = pickBest(cands, args);
        if (!r.fi) {
          if (templateProblem && !user.length) fail(line, 'templateDeduction', [name]);
          if (templateProblem && r.error === 'none') fail(line, 'templateDeduction', [name]);
          callError(name, r.error, line);
        }
        return finishCall(e, r.fi, args, null, false, false, null);
      }
      const constCtx = Boolean(cur.fi && cur.fi.isConst);
      const r = pickBest(cands, args, c => !constCtx || c.isConst);
      if (!r.fi) callError(name, r.error, line);
      const fi = r.fi;
      if (!accessible(fi, fi.cls.name)) fail(line, 'privateAccess', [name]);
      const thisNode = { k: 'this', ty: `${cur.cls.name}*`, implicit: true, line, pc: constCtx };
      return finishCall(e, fi, args, thisNode, true, Boolean(qualifiedCls), qualifiedCls);
    }

    function finishCall(e, fi, args, recv, arrow, qualified, staticCls) {
      noteCall(fi, e.line);
      if (fi.isDeleted) fail(e.line, 'noMatchingFunction', [fi.name]);
      const bound = bindArgs(fi, args, e.line);
      return { k: 'call', fn: fi, args: bound, recv, arrow, virt: Boolean(fi.virtual && !qualified && recv), ty: fi.retTy,
        lv: Boolean(fi.retRef), cst: fi.retCst, line: e.line, staticCls: staticCls ? staticCls.name : (fi.cls ? fi.cls.name : null), sk: 'call' };
    }

    function cxMethodCall(e, callee) {
      const obj = cxv(callee.obj);
      const arrow = callee.arrow;
      let objTy = obj.ty;
      if (arrow) {
        if (!isPtrTy(objTy)) fail(e.line, 'invalidOperands');
        objTy = pointeeTy(objTy);
      }
      const name = callee.name;
      const args = cxArgs(e.args);
      const cls = classes.get(objTy);
      const constObj = arrow ? Boolean(obj.pc) : Boolean(obj.cst);
      if (cls) {
        const methods = lookupMethods(cls, name);
        if (!methods) fail(callee.nameLine || e.line, 'noSuchMember', [name]);
        const r = pickBest(methods, args, c => !constObj || c.isConst);
        if (!r.fi) callError(name, r.error, e.line);
        const fi = r.fi;
        checkAccess(fi, fi.cls.name, name, callee.nameLine || e.line);
        noteCall(fi, e.line);
        const bound = bindArgs(fi, args, e.line);
        return { k: 'call', fn: fi, args: bound, recv: obj, arrow, virt: Boolean(fi.virtual), ty: fi.retTy, lv: Boolean(fi.retRef),
          cst: fi.retCst, line: e.line, staticCls: cls.name, sk: 'call' };
      }
      if (arrow && !isObjectTy(objTy)) fail(e.line, 'invalidOperands');
      const b = builtinMethod(e, callee, obj, arrow, objTy, name, args, constObj);
      if (b) return b;
      fail(callee.nameLine || e.line, 'noSuchMember', [name]);
      return e;
    }

    function bmethod(e, obj, arrow, name, args, ty, extra) {
      return Object.assign({ k: 'bmethod', obj, arrow, name, args, ty, lv: false, line: e.line, sk: 'call' }, extra || {});
    }

    function argCount(e, args, min, max, name) {
      if (args.length < min || args.length > max) fail(e.line, 'noMatchingFunction', [name]);
    }

    function builtinMethod(e, callee, obj, arrow, objTy, name, args, constObj) {
      const L = e.line;
      if (objTy === 'string') {
        switch (name) {
          case 'size': case 'length': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], 'size_t');
          case 'empty': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], 'bool');
          case 'c_str': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], 'cstr');
          case 'clear': argCount(e, args, 0, 0, name); if (constObj) fail(L, 'constViolation'); return bmethod(e, obj, arrow, name, [], 'void');
          case 'push_back': argCount(e, args, 1, 1, name); if (constObj) fail(L, 'constViolation'); return bmethod(e, obj, arrow, name, [coerce(args[0], 'char')], 'void');
          case 'substr': argCount(e, args, 1, 2, name); return bmethod(e, obj, arrow, name, args.map(a => coerce(a, 'int')), 'string');
          case 'at': argCount(e, args, 1, 1, name); return bmethod(e, obj, arrow, name, [coerce(args[0], 'int')], 'char', { lv: true, cst: constObj });
          case 'find': {
            argCount(e, args, 1, 2, name);
            const a0 = args[0].ty === 'char' ? args[0] : coerce(args[0], 'string');
            return bmethod(e, obj, arrow, name, [a0, ...(args[1] ? [coerce(args[1], 'int')] : [])], 'size_t');
          }
          default: return null;
        }
      }
      if (isSetTy(objTy)) {
        const elem = setElemTy(objTy);
        const it = `${objTy}::iterator`;
        switch (name) {
          case 'size': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], 'size_t');
          case 'empty': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], 'bool');
          case 'clear': argCount(e, args, 0, 0, name); if (constObj) fail(L, 'constViolation'); return bmethod(e, obj, arrow, name, [], 'void');
          case 'begin': case 'end': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], it);
          case 'count': argCount(e, args, 1, 1, name); return bmethod(e, obj, arrow, name, [coerce(args[0], elem)], 'size_t');
          case 'find': argCount(e, args, 1, 1, name); return bmethod(e, obj, arrow, name, [coerce(args[0], elem)], it);
          case 'insert': argCount(e, args, 1, 1, name); if (constObj) fail(L, 'constViolation'); return bmethod(e, obj, arrow, name, [coerce(args[0], elem)], 'void');
          case 'erase':
            argCount(e, args, 1, 1, name);
            if (constObj) fail(L, 'constViolation');
            if (args[0].ty === it) return bmethod(e, obj, arrow, name, [args[0]], it, { byIter: true });
            return bmethod(e, obj, arrow, name, [coerce(args[0], elem)], 'size_t');
          default: return null;
        }
      }
      if (isStreamTy(objTy)) {
        const file = isFileStream(objTy);
        switch (name) {
          case 'open':
            if (!file) return null;
            argCount(e, args, 1, 1, name);
            return bmethod(e, obj, arrow, name, [args[0].ty === 'string' ? args[0] : coerce(args[0], 'string')], 'void');
          case 'close': case 'is_open': case 'flush':
            if (!file && name !== 'flush') return null;
            argCount(e, args, 0, 0, name);
            return bmethod(e, obj, arrow, name, [], name === 'is_open' ? 'bool' : 'void');
          case 'eof': case 'fail': case 'good':
            if (!isInStream(objTy) && name === 'eof') return null;
            argCount(e, args, 0, 0, name);
            return bmethod(e, obj, arrow, name, [], 'bool');
          case 'clear': argCount(e, args, 0, 0, name); return bmethod(e, obj, arrow, name, [], 'void');
          case 'ignore':
            if (!isInStream(objTy)) return null;
            argCount(e, args, 0, 2, name);
            return bmethod(e, obj, arrow, name, args.map((a, i) => coerce(a, i === 0 ? 'int' : 'char')), 'void', { sk: 'in' });
          case 'get':
            if (!isInStream(objTy)) return null;
            argCount(e, args, 0, 0, name);
            return bmethod(e, obj, arrow, name, [], 'int', { sk: 'in' });
          default: return null;
        }
      }
      return null;
    }

    function builtinFreeCall(e, callee, args) {
      const name = callee.name;
      const L = e.line;
      const qualified = callee.std;
      if (CTYPE_FNS.includes(name)) {
        if (args.length !== 1 || !isNumTy(args[0].ty)) callError(name, 'none', L);
        return { k: 'bcall', name, args: [coerce(args[0], 'int')], ty: 'int', lv: false, line: L, sk: 'call' };
      }
      if (CSTRING_FNS.includes(name)) {
        const want = name === 'strlen' ? 1 : 2;
        if (args.length !== want) callError(name, 'none', L);
        const cstrs = args.map(a => {
          const t = toValueNode(a);
          if (!(t.ty === 'cstr' || t.ty === 'char*')) callError(name, 'none', L);
          return t;
        });
        if ((name === 'strcpy' || name === 'strcat') && (cstrs[0].ty === 'cstr' || cstrs[0].pc)) fail(L, 'constViolation');
        const ty = name === 'strlen' ? 'size_t' : (name === 'strcmp' ? 'int' : 'char*');
        return { k: 'bcall', name, args: cstrs, ty, lv: false, line: L, sk: 'call' };
      }
      if (name === 'getline') {
        if (!hasHeader('iostream') && !hasHeader('string') && !hasHeader('fstream')) needHeader(L, name, 'string');
        stdGate(L, name, qualified);
        if (args.length < 2 || args.length > 3 || !isInStream(args[0].ty) || args[1].ty !== 'string' || !args[1].lv) callError(name, 'none', L);
        if (args[1].cst) fail(L, 'constViolation');
        return { k: 'bcall', name, args: [args[0], args[1], ...(args[2] ? [coerce(args[2], 'char')] : [])], ty: args[0].ty, lv: true, line: L, sk: 'in' };
      }
      if (ALGORITHMS.includes(name)) {
        needHeader(L, name, 'algorithm');
        stdGate(L, name, qualified);
        const want = { sort: 2, reverse: 2, find: 3, binary_search: 3, rotate: 3 }[name];
        if (args.length !== want) callError(name, 'none', L);
        const rng = args.slice(0, name === 'rotate' ? 3 : 2).map(toValueNode);
        const it = rng[0].ty;
        if (!(isPtrTy(it) || isIterTy(it))) callError(name, 'none', L);
        if (rng.some(r => r.ty !== it)) callError(name, 'none', L);
        if (isIterTy(it) && !(name === 'find' || name === 'binary_search')) callError(name, 'none', L);
        const elem = isIterTy(it) ? setElemTy(it) : pointeeTy(it);
        if (!isNumTy(elem) && elem !== 'string') callError(name, 'none', L);
        if (isPtrTy(it) && rng[0].pc && (name === 'sort' || name === 'reverse' || name === 'rotate')) fail(L, 'constViolation');
        const call = { k: 'bcall', name, args: rng, line: L, lv: false, sk: 'call', elemTy: elem };
        if (name === 'find' || name === 'binary_search') call.args.push(coerce(args[2], elem));
        call.ty = name === 'sort' || name === 'reverse' ? 'void' : (name === 'binary_search' ? 'bool' : it);
        return call;
      }
      return null;
    }

    // ---- statements --------------------------------------------------------------------
    function rootStream(n) {
      for (;;) {
        if (n.k === 'bin' && (n.sk === 'out' || n.sk === 'in')) { n = n.l; continue; }
        if (n.k === 'call' && n.fn && n.fn.name.startsWith('operator') && n.args.length) { n = n.args[0].k === 'conv' ? n.args[0].e : n.args[0]; continue; }
        if (n.k === 'bcall' && n.name === 'getline') { n = n.args[0]; continue; }
        if (n.k === 'conv') { n = n.e; continue; }
        return n;
      }
    }

    function stmtKind(n) {
      if (n.k === 'stream') return n.which === 'cout' ? 'cout' : 'cin';
      if ((n.k === 'bin' && (n.sk === 'out' || n.sk === 'in')) || (n.k === 'bcall' && n.name === 'getline') ||
          (n.k === 'call' && n.fn && /^operator(<<|>>)$/.test(n.fn.name)) || (n.k === 'bmethod' && n.sk === 'in')) {
        const root = n.k === 'bmethod' ? n.obj : rootStream(n);
        if (root.k === 'stream') return root.which === 'cout' ? 'cout' : 'cin';
        return 'file';
      }
      if (n.sk === 'assign') return 'assign';
      if (n.k === 'call' || n.k === 'bcall' || n.k === 'bmethod') return 'call';
      return 'expr';
    }

    function cxStmtExpr(e) {
      const n = cx(e, { stmtStart: true });
      if (n.k === 'stream') fail(e.line, 'streamNeedsArrow', [n.name, n.name === 'cout' ? '<<' : '>>']);
      if (n.ty === 'manip') fail(e.line, 'endlPosition');
      return n;
    }

    function inScope(fn) { pushScope(); try { return fn(); } finally { popScope(); } }

    function cs(s) {
      switch (s.k) {
        case 'empty': return;
        case 'block': inScope(() => s.body.forEach(cs)); return;
        case 'decl': checkDecl(s, false); return;
        case 'expr':
          s.e = cxStmtExpr(s.e);
          s.sk = stmtKind(s.e);
          return;
        case 'if':
          s.cond = truthy(s.cond);
          inScope(() => cs(s.yes));
          if (s.no) inScope(() => cs(s.no));
          return;
        case 'loop': checkLoop(s); return;
        case 'switch': checkSwitch(s); return;
        case 'return': checkReturn(s); return;
        case 'break': case 'continue': return;
        case 'delete': {
          const e = toValueNode(cxv(s.e));
          if (!isPtrTy(e.ty)) fail(s.line, 'invalidOperands');
          if (e.pc) fail(s.line, 'constViolation');
          s.e = e;
          s.cls = classes.get(pointeeTy(e.ty)) || null;
          s.sk = 'free';
          return;
        }
        case 'throw': {
          if (s.e) {
            const v = toValueNode(cxv(s.e));
            if (v.ty === 'void') fail(s.line, 'invalidOperands');
            s.e = v;
          } else if (!cur.inCatch) {
            fail(s.line, 'unexpectedExpression', ["'throw'"]);
          }
          return;
        }
        case 'try': checkTry(s); return;
        default: throw new Error(`unknown statement ${s.k}`);
      }
    }

    function checkLoop(s) {
      pushScope();
      try {
        if (s.loopKind === 'range') {
          const range = cxv(s.range);
          let elem;
          let cst = false;
          if (isArrTy(range.ty)) { elem = arrParts(range.ty).elem; cst = Boolean(range.cst); }
          else if (isSetTy(range.ty)) { elem = setElemTy(range.ty); cst = true; }
          else if (range.ty === 'string') { elem = 'char'; cst = Boolean(range.cst); }
          else fail(s.line, 'invalidOperands');
          const d = s.decl;
          let ty;
          if (d.tn.name === 'auto') ty = elem;
          else {
            ty = resolveBase(d.tn) + '*'.repeat(d.ptr);
            if (!d.ref && convInfo(elem, ty, null) === null) fail(s.line, 'typeMismatch', [elem, ty]);
            if (d.ref && ty !== elem) fail(s.line, 'typeMismatch', [elem, ty]);
          }
          if (d.ref && cst && !d.tn.cst) fail(s.line, 'constViolation');
          s.range = range;
          s.elemTy = elem;
          s.sym = declareVar(d.name, { ty, ref: d.ref, cst: d.tn.cst || false, pcst: false, isRangeVar: true }, d.line);
          s.varTy = ty;
          s.varConv = !d.ref && ty !== elem ? convInfo(elem, ty, null) : null;
        } else {
          if (s.init) cs(s.init);
          if (s.cond) s.cond = truthy(s.cond);
          if (s.inc) { s.inc.e = cxStmtExpr(s.inc.e); s.inc.sk = stmtKind(s.inc.e); }
        }
        inScope(() => cs(s.body));
      } finally {
        popScope();
      }
    }

    function checkSwitch(s) {
      const cond = cxv(s.cond);
      if (!isIntegralTy(cond.ty)) fail(s.line, 'switchNonIntegral', []);
      s.cond = cond.ty === 'int' ? cond : { k: 'conv', how: 'arith', e: cond, ty: 'int', from: cond.ty, lv: false, line: cond.line };
      const seen = new Set();
      let hasDefault = false;
      pushScope();
      try {
        for (const c of s.cases) {
          if (c.value) {
            const v = cxv(c.value);
            const val = constEval(v);
            if (val === undefined) fail(c.line, 'caseNotConstant', []);
            if (!isIntegralTy(v.ty)) fail(c.line, 'switchNonIntegral', []);
            if (seen.has(val)) fail(c.line, 'duplicateCase', [val]);
            seen.add(val);
            c.val = val;
            c.value = v;
          } else {
            if (hasDefault) fail(c.line, 'duplicateCase', ['default']);
            hasDefault = true;
          }
          c.body.forEach(cs);
        }
      } finally {
        popScope();
      }
    }

    function checkReturn(s) {
      const fi = cur.fi;
      const retTy = fi ? fi.retTy : 'void';
      const isVoid = retTy === 'void' || (fi && (fi.isCtor || fi.isDtor));
      if (isVoid) {
        if (s.e) fail(s.line, 'badReturn', [retTy]);
        return;
      }
      if (!s.e) fail(s.line, 'badReturn', [retTy]);
      const v = cx(s.e);
      if (v.ty === 'manip') fail(s.line, 'endlPosition');
      const value = toValueNode(v);
      if (fi.retRef) {
        if (!value.lv && !fi.retCst) fail(s.line, 'refBindRvalue', [fi.name]);
        s.e = value.ty === retTy ? value : coerce(value, retTy);
      } else {
        s.e = coerce(value, retTy, { line: s.line });
      }
    }

    function checkTry(s) {
      inScope(() => cs(s.body));
      let sawAll = false;
      for (const h of s.handlers) {
        if (sawAll) fail(h.line, 'unexpectedExpression', ["'catch'"]);
        pushScope();
        try {
          if (h.all) { h.ty = null; sawAll = true; } else {
            h.ty = resolveBase(h.tn) + '*'.repeat(h.ptr);
            if (!h.name) h.slot = -1;
            else h.sym = declareVar(h.name, { ty: h.ty, ref: h.ref, cst: h.tn.cst, pcst: false, isCatch: true }, h.line);
            h.slot = h.sym ? h.sym.slot : -1;
            // a handler for a base class makes later handlers for its derived classes unreachable
          }
          cur.inCatch = (cur.inCatch || 0) + 1;
          cs(h.body);
          cur.inCatch--;
        } finally {
          popScope();
        }
      }
    }

    // ---- declarations ---------------------------------------------------------------------
    function canDefault(cls) {
      if (cls.builtin) return cls.ctors.some(c => c.params.length === 0);
      if (cls.abstract) return false;
      if (cls.userCtors) return cls.ctors.some(c => c.params.length === 0 && !c.isDeleted);
      if (cls.base && !canDefault(cls.base)) return false;
      for (const name of cls.fieldOrder) {
        const f = cls.fields.get(name);
        if (f.owner !== cls.name) continue;
        const fc = classes.get(f.ty);
        if (fc && !f.initNode && !canDefault(fc)) return false;
      }
      return true;
    }

    function listInit(init, ty, line) {
      // returns a normalized node tree: { k:'list', ty, items:[...] }
      if (isArrTy(ty)) {
        const { elem, n } = arrParts(ty);
        if (init.k !== 'initList') {
          if (elem === 'char' && init.k === 'str') return { k: 'strinit', ty, v: init.v, line };
          fail(line, 'typeMismatch', ['…', ty]);
        }
        if (n !== null && init.items.length > n) fail(line, 'tooManyInitializers', [n]);
        return { k: 'list', ty, elem, items: init.items.map(it => (isArrTy(elem) ? listInit(it, elem, line) : listItem(it, elem, line))), line };
      }
      fail(line, 'typeMismatch', ['{…}', ty]);
      return null;
    }
    function listItem(it, elem, line) {
      if (it.k === 'initList') fail(line, 'typeMismatch', ['{…}', elem]);
      const v = toValueNode(cxv(it));
      if (classes.has(elem)) return coerce(v, elem, { line });
      return coerce(v, elem, { line });
    }

    function checkDecl(s, isGlobal) {
      let hasObject = false;
      let hasAlloc = false;
      for (const v of s.vars) {
        const info = declOne(s, v, isGlobal);
        if (info.object) hasObject = true;
        if (v.initNode && v.initNode.k === 'new') hasAlloc = true;
      }
      s.sk = hasObject ? 'construct' : (hasAlloc ? 'alloc' : 'decl');
    }

    function declOne(s, v, isGlobal) {
      const tn = s.tn;
      const line = v.line;
      let base = tn.name === 'auto' ? 'auto' : resolveBase(tn);
      if (base === 'void' && !v.ptr) fail(line, 'invalidVariableName', ['void']);
      const result = { object: false };
      // array dimensions
      const dims = [];
      for (let i = 0; i < v.dims.length; i++) {
        const d = v.dims[i];
        if (d === null) {
          if (i !== 0 || v.init === null) fail(line, 'arraySizeNotConstant');
          dims.push(null);
          continue;
        }
        const node = cxv(d);
        const val = constEval(node);
        if (val === undefined || !Number.isInteger(val) || val <= 0 || !isIntegralTy(node.ty)) fail(line, 'arraySizeNotConstant');
        dims.push(val);
      }
      let ptrTy = base + '*'.repeat(v.ptr);
      let init = null;
      let sym;
      let ty = ptrTy;
      const isConstObj = v.ptr ? Boolean(v.ptrConst) : tn.cst;
      const pcst = v.ptr ? tn.cst : false;
      if (base === 'auto') {
        if (v.init === null || v.init.k === 'initList') fail(line, 'typeMismatch', ['auto', 'auto']);
        const e = cx(v.init);
        if (e.ty === 'manip') fail(line, 'endlPosition');
        let t = e.ty === 'cstr' ? 'char*' : decayTy(e.ty);
        ty = t + '*'.repeat(v.ptr);
        v.initNode = e.ty === ty || (e.ty === 'cstr' && ty === 'char*') ? (e.ty === 'cstr' ? coerce(e, 'char*') : e) : coerce(toValueNode(e), ty);
        if (v.ref && v.initNode.ty !== e.ty) v.initNode = e;
        v.autoPc = e.pc || e.ty === 'cstr';
        init = v.initNode;
        if (v.ref && !e.lv && !tn.cst) fail(line, 'refBindRvalue', [v.name]);
        const objInfo = classes.get(ty);
        if (objInfo && !v.ref) { v.object = true; result.object = true; v.cls = objInfo; v.initKind = e.lv ? 'copy' : 'elide'; v.initCopyCtor = resolveCtor(objInfo, [e], line); }
        sym = finishSym(v, ty, isConstObj, pcst || v.autoPc, isGlobal, line);
        v.ty = ty;
        v.mode = v.ref ? 'ref' : (objInfo ? 'object' : (ty === 'string' ? 'string' : (isSetTy(ty) ? 'set' : (isPtrTy(ty) ? 'pointer' : 'scalar'))));
        v.sym = sym;
        return result;
      }
      if (dims.length) {
        ty = ptrTy + dims.map(d => `[${d === null ? '' : d}]`).join('');
      }
      const isArray = dims.length > 0;
      v.mode = 'scalar';
      if (v.ref) {
        v.mode = 'ref';
        if (!v.init && !v.ctorArgs) fail(line, 'refNeedsInit', [v.name]);
        const e = cx(v.init || v.ctorArgs[0]);
        if (e.ty === 'manip') fail(line, 'endlPosition');
        const conv = e.ty === ty ? e : coerce(e, ty, { line });
        if (!e.lv || e.ty !== ty) {
          if (!tn.cst) fail(line, 'refBindRvalue', [v.name]);
        }
        if (e.cst && !tn.cst) fail(line, 'constViolation');
        v.initNode = e.ty === ty ? e : conv;
        v.refDirect = e.ty === ty && e.lv;
        sym = finishSym(v, ty, tn.cst, pcst, isGlobal, line);
        v.ty = ty; v.sym = sym;
        return result;
      }
      const cls = classes.get(ty);
      // ---- initialization
      if (isArray) {
        v.mode = 'array';
        const elemBase = base + '*'.repeat(v.ptr);
        let n0 = dims[0];
        if (v.init) {
          if (v.init.k === 'str' && dims.length === 1 && elemBase === 'char') {
            if (n0 === null) { n0 = v.init.v.length + 1; dims[0] = n0; }
            if (v.init.v.length + 1 > n0) fail(line, 'tooManyInitializers', [n0]);
            ty = `char[${n0}]`;
            v.initNode = { k: 'strinit', ty, v: v.init.v, line };
          } else if (v.init.k === 'initList') {
            if (n0 === null) { n0 = v.init.items.length; if (!n0) fail(line, 'arraySizeNotConstant'); dims[0] = n0; }
            ty = ptrTy + dims.map(d => `[${d}]`).join('');
            v.initNode = listInit(v.init, ty, line);
          } else {
            fail(line, 'typeMismatch', ['…', ty]);
          }
        } else {
          const ec = classes.get(elemBase);
          if (ec) {
            v.elemCtor = resolveCtor(ec, [], line);
            v.elemCls = ec;
            result.object = true;
          }
          if (isConstObj) fail(line, 'constViolation');
        }
        v.dimsN = dims;
        sym = finishSym(v, ty, isConstObj, pcst, isGlobal, line);
        v.ty = ty; v.sym = sym;
        return result;
      }
      if (cls) {
        v.mode = 'object';
        v.object = true;
        result.object = true;
        v.cls = cls;
        let args;
        if (v.ctorArgs) args = cxArgs(v.ctorArgs);
        else if (v.init && v.init.k === 'initList') args = v.init.items.map(it => { if (it.k === 'initList') fail(line, 'typeMismatch', ['{…}', ty]); return cxv(it); });
        else if (v.init) args = [cxv(v.init)];
        else args = [];
        if (!v.ctorArgs && v.init && v.init.k !== 'initList') {
          // copy-initialization from a prvalue of the same class elides the copy
          const a = args[0];
          if (a.ty === ty && !a.lv) { v.initKind = 'elide'; v.initNode = a; }
        }
        if (!v.initNode) {
          v.ctor = resolveCtor(cls, args, line);
          v.initKind = v.ctor.how;
        }
        if (isConstObj && !args.length && !cls.userCtors) { /* const object default-initialized: fine for classes with user ctor */ }
        sym = finishSym(v, ty, isConstObj, pcst, isGlobal, line);
        v.ty = ty; v.sym = sym;
        return result;
      }
      if (ty === 'string') {
        v.mode = 'string';
        const args = v.ctorArgs ? cxArgs(v.ctorArgs) : (v.init ? [cxv(v.init)] : []);
        if (args.length > 1) fail(line, 'noMatchingConstructor', ['string']);
        if (args.length) v.initNode = coerce(args[0], 'string', { line });
        else if (isConstObj) fail(line, 'constViolation');
        sym = finishSym(v, ty, isConstObj, pcst, isGlobal, line);
        v.ty = ty; v.sym = sym;
        return result;
      }
      if (isSetTy(ty)) {
        v.mode = 'set';
        if (v.init && v.init.k === 'initList') {
          const elem = setElemTy(ty);
          v.listItems = v.init.items.map(it => listItem(it, elem, line));
        } else if (v.init || v.ctorArgs) {
          const a = cxv(v.init || v.ctorArgs[0]);
          if (a.ty !== ty) fail(line, 'typeMismatch', [a.ty, ty]);
          v.initNode = a;
        }
        sym = finishSym(v, ty, isConstObj, pcst, isGlobal, line);
        v.ty = ty; v.sym = sym;
        return result;
      }
      if (isStreamTy(ty)) {
        v.mode = 'stream';
        if (!isFileStream(ty)) fail(line, 'noMatchingConstructor', [ty]);
        const args = v.ctorArgs ? cxArgs(v.ctorArgs) : [];
        if (v.init) fail(line, 'noMatchingConstructor', [ty]);
        if (args.length > 1) fail(line, 'noMatchingConstructor', [ty]);
        if (args.length) v.fileArg = coerce(args[0], 'string', { line });
        result.object = false;
        sym = finishSym(v, ty, isConstObj, pcst, isGlobal, line);
        v.ty = ty; v.sym = sym;
        return result;
      }
      // scalar or pointer
      v.mode = isPtrTy(ty) ? 'pointer' : 'scalar';
      let e = null;
      if (v.init && v.init.k === 'initList') {
        if (v.init.items.length !== 1 || v.init.items[0].k === 'initList') fail(line, 'typeMismatch', ['{…}', ty]);
        e = cx(v.init.items[0]);
      } else if (v.init) e = cx(v.init);
      else if (v.ctorArgs) {
        if (v.ctorArgs.length !== 1) fail(line, 'invalidOperands');
        e = cx(v.ctorArgs[0]);
      }
      if (e) {
        if (e.ty === 'manip') fail(e.line, 'endlPosition');
        v.initNode = coerce(toValueNode(e), ty, { line, toPcst: pcst });
        if (v.mode === 'scalar' && ty !== 'void' && e.ty === 'cstr') fail(line, 'stringAssignment', [ty]);
      } else if (isConstObj) {
        fail(line, 'constViolation');
      }
      sym = finishSym(v, ty, isConstObj, pcst, isGlobal, line);
      if (isConstObj && v.initNode && isNumTy(ty)) {
        const cv = constEval(v.initNode);
        if (cv !== undefined) sym.constVal = constConvert(ty, cv);
      }
      v.ty = ty; v.sym = sym;
      return result;
    }

    function finishSym(v, ty, cst, pcst, isGlobal, line) {
      const props = { ty, ref: v.ref, cst, pcst };
      if (isGlobal) {
        if (globalsMap.has(v.name)) fail(line, 'redeclaration', [v.name, globalsMap.get(v.name).line, v.name]);
        const sym = Object.assign({ name: v.name, line, global: true }, props);
        globalsMap.set(v.name, sym);
        return sym;
      }
      return declareVar(v.name, props, line);
    }

    // ---- function and class bodies ---------------------------------------------------------
    function fieldDefault(cls, f, entry, fi, line) {
      const fcls = classes.get(f.ty);
      const out = { f, mode: 'none' };
      if (isArrTy(f.ty)) {
        if (entry) fail(entry.line, 'noSuchMember', [f.name]);
        const ec = classes.get(arrParts(f.ty).elem);
        if (ec) out.elemCtor = resolveCtor(ec, [], line);
        return out;
      }
      if (fcls) {
        if (entry) {
          out.mode = 'ctor';
          out.r = resolveCtor(fcls, cxArgs(entry.args), entry.line);
        } else if (f.initNode) {
          out.mode = 'nsdmi';
        } else {
          if (!canDefault(fcls)) fail(line, 'noMatchingConstructor', [fcls.name]);
          out.mode = 'ctor';
          out.r = resolveCtor(fcls, [], line);
        }
        return out;
      }
      if (entry) {
        const args = cxArgs(entry.args);
        if (f.ty === 'string' || isSetTy(f.ty)) {
          if (args.length > 1) fail(entry.line, 'noMatchingConstructor', [f.ty]);
          if (args.length) { out.mode = 'expr'; out.expr = coerce(toValueNode(args[0]), f.ty, { line: entry.line }); }
          return out;
        }
        if (args.length !== 1) fail(entry.line, 'invalidOperands');
        out.mode = 'expr';
        out.expr = coerce(toValueNode(args[0]), f.ty, { line: entry.line, toPcst: f.pcst });
        return out;
      }
      if (f.initNode) out.mode = 'nsdmi';
      return out;
    }

    function buildPlan(cls, entries, fi, line) {
      const plan = { base: null, fields: [] };
      const used = new Set();
      if (cls.base) {
        const entry = entries.find(en => en.name === cls.base.name || en.name === cls.base.templateName ||
          (cls.base.node && en.name === cls.base.node.name));
        if (entry) {
          used.add(entry);
          plan.base = resolveCtor(cls.base, cxArgs(entry.args), entry.line);
        } else {
          if (!canDefault(cls.base)) fail(line, 'noMatchingConstructor', [cls.base.name]);
          plan.base = resolveCtor(cls.base, [], line);
        }
      }
      for (const f of cls.fieldDecls) {
        const entry = entries.find(en => en.name === f.name);
        if (entry) used.add(entry);
        plan.fields.push(fieldDefault(cls, f, entry, fi, line));
      }
      for (const en of entries) {
        if (!used.has(en)) fail(en.line, 'noSuchMember', [en.name]);
      }
      return plan;
    }

    function checkFnBody(fi) {
      if (!fi.body) return;
      const saved = cur;
      cur = { fi, cls: fi.cls || null, scopes: [new Map()], nslots: 0, tsub: fi.tsub || null, inCatch: 0 };
      try {
        fi.params.forEach((p, i) => {
          const name = p.name || `$arg${i}`;
          const sym = declareVar(name, { ty: p.ty, ref: p.ref, cst: p.cst, pcst: p.pcst, isParam: true }, p.line || fi.line);
          p.slot = sym.slot;
        });
        if (fi.isCtor && !fi.builtin) fi.plan = buildPlan(fi.cls, (fi.node && fi.node.init) || [], fi, fi.line);
        for (const st of fi.body.body) cs(st);
      } finally {
        fi.nslots = cur.nslots;
        cur = saved;
      }
    }

    function checkClassBodies(info) {
      const saved = cur;
      cur = { fi: { isConst: false, isNsdmi: true, retTy: 'void', params: [] }, cls: info, scopes: [new Map()], nslots: 0, tsub: info.tsub, inCatch: 0 };
      try {
        for (const f of info.fieldDecls) {
          if (f.initNode) {
            const e = f.initNode.k === 'initList' ? null : cxv(f.initNode);
            if (!e) fail(f.line, 'typeMismatch', ['{…}', f.ty]);
            f.init = coerce(toValueNode(e), f.ty, { line: f.line, toPcst: f.pcst });
          }
        }
        if (!info.userCtors) {
          if (info.base && !canDefault(info.base)) info.implicitDefaultBroken = true;
          else info.implicitPlan = buildPlan(info, [], null, info.node ? info.node.line : 1);
        }
      } finally {
        cur = saved;
      }
      const list = [];
      for (const m of info.ctors) list.push(m);
      if (info.dtor) list.push(info.dtor);
      for (const ms of info.methods.values()) for (const m of ms) list.push(m);
      for (const m of list) if (m.body && m.cls === info) checkFnBody(m);
    }

    function defineMethod(node) {
      const cls = classes.get(node.qual);
      if (!cls) fail(node.line, 'undeclared', [node.qual]);
      if (cls.builtin) fail(node.line, 'noSuchMember', [node.name]);
      const saved = cur;
      cur = { tsub: cls.tsub, scopes: [new Map()], nslots: 0, cls, fi: null };
      let params;
      try { params = makeParams(node.params, node.line); } finally { cur = saved; }
      let target = null;
      if (node.isDtor) target = cls.dtor;
      else if (node.isCtorDef) target = cls.ctors.find(c => sigOf(c.params) === sigOf(params));
      else {
        const list = cls.methods.get(node.name) || [];
        target = list.find(m => sigOf(m.params) === sigOf(params) && m.isConst === Boolean(node.isConst));
      }
      if (!target || target.cls !== cls) fail(node.line, 'noSuchMember', [node.name]);
      if (target.body) fail(node.line, 'redeclaration', [node.name, target.line, node.name]);
      target.body = node.body;
      target.node = node;
      node.fi = target;
      // parameter names come from the definition
      target.params.forEach((p, i) => { p.name = params[i].name; p.line = params[i].line; });
      if (node.body) checkFnBody(target);
    }

    function declareFunction(node) {
      if (node.qual) return defineMethod(node);
      const saved = cur;
      cur = { tsub: null, scopes: [new Map()], nslots: 0, cls: null, fi: null };
      let params;
      let retTy;
      try {
        params = makeParams(node.params, node.line);
        retTy = resolveBase(node.ret.tn) + '*'.repeat(node.ret.ptr);
      } finally { cur = saved; }
      const name = node.name;
      if (name === 'main') {
        if (retTy !== 'int') fail(node.ret.tn.line, 'mainReturnType', []);
        if (params.length) throw unsupported(node.line, 'main arguments');
      }
      const list = funcs.get(name) || [];
      let fi = list.find(f => sigOf(f.params) === sigOf(params));
      if (fi && fi.body && node.body) fail(node.line, 'redeclaration', [name, fi.line, name]);
      if (!fi) {
        fi = { name, display: name, cls: null, params, retTy, retRef: node.ret.ref, retCst: node.ret.tn.cst, node, body: null, line: node.line };
        list.push(fi);
        funcs.set(name, list);
        program.functionNames.push(name);
      }
      node.fi = fi;
      if (node.body) {
        fi.body = node.body;
        fi.node = node;
        fi.params = params;
        fi.line = node.line;
        if (name === 'main') { program.main = fi; program.mainLine = node.line; program.endLine = node.body.endLine; }
        checkFnBody(fi);
      }
    }

    function declareEnum(it) {
      if (enums.has(it.name) || classes.has(it.name)) fail(it.line, 'redeclaration', [it.name, it.line, it.name]);
      enums.set(it.name, { name: it.name, consts: [] });
      const saved = cur;
      cur = { tsub: null, scopes: [new Map()], nslots: 0, cls: null, fi: null };
      try {
        let next = 0;
        for (const c of it.consts) {
          if (c.value) {
            const n = cxv(c.value);
            const v = constEval(n);
            if (v === undefined || !Number.isInteger(v)) fail(c.line, 'caseNotConstant', []);
            next = v;
          }
          if (enumConsts.has(c.name) || globalsMap.has(c.name)) fail(c.line, 'redeclaration', [c.name, c.line, c.name]);
          enumConsts.set(c.name, { ty: it.name, value: next });
          enums.get(it.name).consts.push({ name: c.name, value: next });
          next++;
        }
      } finally { cur = saved; }
    }

    function processItem(it) {
      switch (it.k) {
        case 'enum': declareEnum(it); break;
        case 'class': {
          const info = declareClass(it, null, null);
          checkClassBodies(info);
          break;
        }
        case 'template': {
          const inner = it.item;
          if (inner.k === 'class') classTemplates.set(inner.name, { tparams: it.tparams, item: inner });
          else {
            const list = fnTemplates.get(inner.name) || [];
            list.push({ tparams: it.tparams, item: inner });
            fnTemplates.set(inner.name, list);
          }
          break;
        }
        case 'fn': declareFunction(it); break;
        case 'gvar': {
          const saved = cur;
          cur = { tsub: null, scopes: [new Map()], nslots: 0, cls: null, fi: null };
          try {
            checkDecl(it.decl, true);
            globalList.push(it.decl);
          } finally { cur = saved; }
          break;
        }
        default: throw new Error(`unknown item ${it.k}`);
      }
    }

    // run -------------------------------------------------------------------------------
    program.sizeOf = sizeOfType;
    program.enums = enums;
    const result = { program, error: null };
    try {
      for (const it of P.items) {
        processItem(it);
        drainPending();
      }
      drainPending();
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = e;
      return result;
    }
    return result;
  }

  // ---------------------------------------------------------------- runtime values
  // Values: numbers (int/double/char/bool/size_t/enum), JS strings (std::string and string literals),
  // pointers {arr, i} (null = nullptr), set iterators {set, i}, and cells for objects, arrays, sets and streams.

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

  function formatSize(v) {
    return v < 0 ? (BigInt(2) ** BigInt(64) + BigInt(v)).toString() : String(v);
  }

  function formatValue(type, value) {
    if (value === undefined) return '?';
    if (type === 'double') return formatDouble(value);
    if (type === 'char') return String.fromCharCode(value);
    if (type === 'size_t') return formatSize(value);
    return String(value);
  }

  function showChar(code) {
    if (code === 0) return '\\0';
    if (code === 10) return '\\n';
    if (code === 9) return '\\t';
    if (code === 13) return '\\r';
    return String.fromCharCode(code);
  }

  const toType = (type, value) => {
    if (type === 'int') return Math.trunc(value);
    if (type === 'char') return ((Math.trunc(value) % 256) + 256) % 256;
    if (type === 'bool') return value ? 1 : 0;
    if (type === 'size_t') return Math.trunc(value);
    if (type === 'double') return value;
    return value;
  };

  function compareValues(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  // ---------------------------------------------------------------- interpreter
  function execute(program, opts, result) {
    const classes = program.classes;
    const maxSteps = opts.maxSteps;
    const sizeOf = program.sizeOf;
    const files = result.files;
    let output = '';
    let stepCount = 0;
    let addr = 0x1000;
    let heapAddr = 0x50000000;
    const heap = [];
    const frames = [];
    const globalCells = new Map();
    let cur = null; // collector of the statement being executed
    let frame = null;
    let caught = [];
    const BREAK = { t: 'break' };
    const CONTINUE = { t: 'continue' };
    const RETURN = { t: 'return' };

    class CppThrow {
      constructor(cell, ty, line) {
        this.cell = cell; this.ty = ty; this.line = line; this.pendingStep = false;
      }
    }

    const cin = { ty: 'istream', path: 'cin', a: 0x200, st: { text: String(opts.input), pos: 0, eof: false, fail: false, open: true, isCin: true } };
    const cout = { ty: 'ostream', path: 'cout', a: 0x210, st: { isCout: true } };

    // ---- collectors and steps
    function newCollector() {
      return { changed: new Map(), reads: new Set(), events: [], notes: [], inputs: [], printed: '', outBefore: output, before: null, fileEvents: new Set() };
    }

    function tick(line) {
      if (++stepCount > maxSteps) throw new SimError('runtime', line, 'stepLimit', []);
    }

    function note(ko, en) { cur.notes.push(tr(ko, en)); }
    function readPath(path) { if (cur) cur.reads.add(path); }

    function align(a, s) { return s > 1 ? Math.ceil(a / s) * s : a; }
    function nextAddr(size, inHeap) {
      if (inHeap) { heapAddr = align(heapAddr, Math.min(size, 8)); const a = heapAddr; heapAddr += Math.max(size, 1); return a; }
      addr = align(addr, Math.min(size, 8));
      const a = addr;
      addr += Math.max(size, 1);
      return a;
    }

    // ---- cells
    function makeCell(ty, path, nm, inHeap) {
      const c = { ty, path };
      if (nm) c.nm = nm;
      if (isArrTy(ty)) {
        const { elem, n } = arrParts(ty);
        c.a = nextAddr(1, inHeap);
        c.elems = [];
        for (let i = 0; i < n; i++) {
          const child = makeCell(elem, `${path}[${i}]`, undefined, inHeap);
          child.seq = c.elems; child.idx = i;
          c.elems.push(child);
        }
        return c;
      }
      const cls = classes.get(ty);
      if (cls) {
        c.a = nextAddr(1, inHeap);
        c.cn = ty;
        c.fields = new Map();
        for (const name of cls.fieldOrder) {
          const f = cls.fields.get(name);
          const fc = makeCell(f.ty, `${path}.${name}`, name, inHeap);
          fc.access = f.access;
          fc.hidden = f.hidden;
          c.fields.set(name, fc);
        }
        return c;
      }
      if (ty === 'string') { c.v = ''; c.a = nextAddr(24, inHeap); return c; }
      if (isSetTy(ty)) { c.items = []; c.a = nextAddr(24, inHeap); return c; }
      if (isStreamTy(ty)) {
        c.st = { text: '', pos: 0, eof: false, fail: false, open: false, buf: '', file: null };
        c.a = nextAddr(16, inHeap);
        return c;
      }
      c.a = nextAddr(sizeOf(ty), inHeap);
      return c; // v undefined = uninitialized
    }

    function repath(c, path) {
      c.path = path;
      if (c.elems) c.elems.forEach((e, i) => repath(e, `${path}[${i}]`));
      if (c.fields) for (const [k, f] of c.fields) repath(f, `${path}.${k}`);
    }

    function markDead(c) {
      c.dead = true;
      if (c.elems) c.elems.forEach(markDead);
      if (c.fields) for (const f of c.fields.values()) markDead(f);
    }

    function zeroFill(c) {
      if (c.elems) { c.elems.forEach(zeroFill); return; }
      if (c.fields) { for (const f of c.fields.values()) zeroFill(f); return; }
      if (c.v === undefined && !c.items && !c.st) c.v = isPtrTy(c.ty) ? null : 0;
    }

    function ptrTo(cell) {
      return cell.seq ? { arr: cell.seq, i: cell.idx } : { arr: [cell], i: 0 };
    }

    // ---- display
    function shownScalar(ty, v) {
      if (v === undefined) return '?';
      if (v === null) return 'nullptr';
      if (isPtrTy(ty)) { const t = v.arr[v.i]; return t ? `0x${t.a.toString(16)}` : '0x?'; }
      if (isIterTy(ty)) return v.i >= v.set.items.length ? 'end()' : `*${shownItem(v.set.items[v.i], setElemTy(ty))}`;
      if (ty === 'char') return showChar(v);
      if (ty === 'double') return formatDouble(v);
      if (ty === 'size_t') return formatSize(v);
      return String(v);
    }
    function shownItem(v, ty) { return ty === 'string' ? JSON.stringify(v) : shownScalar(ty, v); }

    function shownCell(c) {
      if (c.fields) {
        if (c.cn in EXCEPTION_PARENTS) return `${c.cn}{${JSON.stringify(c.fields.get('__what').v)}}`;
        return `${c.cn}{${[...c.fields.values()].map(shownCell).join(', ')}}`;
      }
      if (c.elems) {
        if (arrParts(c.ty).elem === 'char') {
          let s = '';
          for (const e of c.elems) { if (e.v === 0 || e.v === undefined) break; s += String.fromCharCode(e.v); }
          return JSON.stringify(s);
        }
        return `{${c.elems.map(shownCell).join(', ')}}`;
      }
      if (c.items) return `{${c.items.map(it => shownItem(it, setElemTy(c.ty))).join(', ')}}`;
      if (c.st) return c.ty;
      if (c.ty === 'string') return JSON.stringify(c.v);
      return shownScalar(c.ty, c.v);
    }

    function cellKind(c) {
      if (c.fields) return 'object';
      if (c.elems) return 'array';
      if (c.items) return 'set';
      if (c.st) return 'stream';
      if (c.ty === 'string') return 'string';
      if (isPtrTy(c.ty)) return 'pointer';
      if (isEnumTy2(c.ty)) return 'enum';
      if (isIterTy(c.ty)) return 'pointer';
      return 'scalar';
    }
    const isEnumTy2 = t => program.enums.has(t);

    function addrHex(c) { return `0x${c.a.toString(16)}`; }

    function snapCell(c, name, ref) {
      const kind = ref ? 'ref' : cellKind(c);
      const out = { name, path: c.path, type: c.ty, kind, shown: shownCell(c), init: cellInit(c), addr: addrHex(c) };
      if (kind === 'scalar' || kind === 'enum') out.value = c.v;
      else if (kind === 'string') out.value = c.v;
      else if (kind === 'pointer' && !ref) out.value = c.v === undefined ? undefined : shownCell(c);
      else if (ref) out.value = c.fields || c.elems || c.items || c.st ? undefined : (c.ty === 'string' || !isPtrTy(c.ty) ? c.v : shownCell(c));
      if (ref) out.target = c.path;
      if (c.fields) {
        out.class = c.cn;
        const cls = classes.get(c.cn);
        out.bases = cls ? cls.bases.slice() : [];
        out.fields = [...c.fields.entries()].filter(([, f]) => !f.hidden).map(([k, f]) => Object.assign(snapCell(f, k), { access: f.access }));
        if (c.freed) out.freed = true;
      }
      if (c.elems) out.elems = c.elems.map((e, i) => snapCell(e, `[${i}]`));
      if (c.items) out.elems = c.items.map((v, i) => ({ name: `[${i}]`, path: `${c.path}[${i}]`, type: setElemTy(c.ty), kind: 'scalar', shown: shownItem(v, setElemTy(c.ty)), value: v, init: true, addr: addrHex(c) }));
      if (kind === 'pointer' && !ref && c.v !== undefined) {
        if (c.v === null) out.target = null;
        else if (isPtrTy(c.ty)) {
          const t = c.v.arr[c.v.i];
          out.target = t ? t.path : null;
          out.dangling = Boolean(t && ((t.blk && t.blk.freed) || t.dead)) || !t;
        }
      }
      if (c.st && c.st.file !== undefined) out.open = Boolean(c.st.open);
      return out;
    }

    function cellInit(c) {
      if (c.fields) return true;
      if (c.elems) return c.elems.every(cellInit);
      if (c.items || c.st) return true;
      return c.v !== undefined;
    }

    function liveVars(fr) {
      const seen = new Set();
      const out = [];
      for (let i = fr.live.length - 1; i >= 0; i--) {
        const e = fr.live[i];
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        out.push(e);
      }
      return out.reverse();
    }

    function frameCells(fr) {
      return liveVars(fr).map(e => (e.ref ? refCell(e, fr) : snapCell(e.cell, e.name)));
    }

    function refCell(e, fr) {
      const s = snapCell(e.cell, e.name, true);
      s.path = `${fr.prefix}${e.name}`;
      return s;
    }

    function snapshotMem(line) {
      if (frame) frame.line = line;
      return {
        frames: frames.map(fr => ({ key: fr.key, fn: fr.display, line: fr.line, vars: frameCells(fr) })),
        heap: heap.map(b => ({ id: b.id, type: b.ty, array: b.array, freed: b.freed, line: b.line, cell: snapCell(b.cell, b.id) })),
        globals: [...globalCells.entries()].map(([name, c]) => snapCell(c, name)),
        files: Object.assign({}, files),
      };
    }

    // flat cells of the current frame (compat with the chapter-1 trace format)
    function flatFrame() {
      return frame ? frameCells(frame) : [];
    }

    function emitStep(kind, line, extra) {
      const c = cur;
      const changed = [...c.changed.keys()];
      const delta = {};
      for (const [p, d] of c.changed) delta[p] = { from: d.from, to: d.to };
      const step = {
        line, kind, fn: frame.display, depth: frames.length - 1, notes: c.notes, printed: c.printed,
        outBefore: c.outBefore, outAfter: output, inputs: c.inputs, changed, reads: [...c.reads], delta, events: c.events,
        mem: snapshotMem(line), before: c.before || [], after: flatFrame(),
      };
      if (extra) Object.assign(step, extra);
      result.steps.push(step);
      return step;
    }

    function recordWrite(cell, from, to) {
      const e = cur.changed.get(cell.path);
      if (e) e.to = to; else cur.changed.set(cell.path, { from, to });
    }

    // writes a scalar-ish value (number, string, pointer, iterator) into a cell and records the change
    function writeCell(cell, value) {
      const from = shownCell(cell);
      cell.v = value;
      recordWrite(cell, from, shownCell(cell));
    }

    function recordCreated(cell) {
      const walk = (c) => {
        if (c.fields) { for (const f of c.fields.values()) walk(f); return; }
        if (c.elems) { c.elems.forEach(walk); return; }
        recordWrite(c, null, shownCell(c));
      };
      walk(cell);
    }

    // ---- diagnostics
    function checkInt(value, line) {
      if (value < INT_MIN || value > INT_MAX) throw ubError(line, 'intOverflow', [INT_MIN, INT_MAX]);
      return value;
    }

    function readCell(c, line, name) {
      readPath(c.path);
      if (c.v === undefined) throw ubError(line, 'uninitRead', [name || c.nm || c.path]);
      return c.v;
    }

    // ---- pointers
    function arrName(arr) {
      const first = arr[0];
      if (!first) return 'pointer';
      return first.path.replace(/\[\d+\]$/, '');
    }
    function oobError(line, path, index, size) {
      const e = ubError(line, 'indexOutOfBounds', [path, index, size]);
      e.path = path; e.index = index; e.size = size;
      return e;
    }
    function ptrCell(p, line) {
      if (p === null || p === undefined) throw ubError(line, 'nullDeref', []);
      const c = p.arr[p.i];
      if (!c) throw oobError(line, arrName(p.arr), p.i, p.arr.length);
      if (c.blk && c.blk.freed) throw ubError(line, 'useAfterFree', []);
      if (c.dead) throw ubError(line, 'danglingPointer', []);
      return c;
    }
    function samePtr(a, b) {
      if (a === null || b === null) return a === b;
      const ca = a.arr[a.i];
      const cb = b.arr[b.i];
      if (ca && cb) return ca === cb;
      return a.arr === b.arr && a.i === b.i;
    }

    function varCell(sym) {
      if (sym.global) return globalCells.get(sym.name);
      return frame.slots[sym.slot];
    }

    const lvOrEv = n => (n.lv ? lv(n) : ev(n));
    function objectOf(n, line) { // the object cell designated by n (pointer deref when n.arrow)
      return n.arrow ? ptrCell(ev(n.obj), line) : lvOrEv(n.obj);
    }

    // reads the value out of a cell (objects, arrays, sets and streams are their own value)
    function loadCell(c, line, name) {
      if (c.fields || c.elems || c.items || c.st) { readPath(c.path); return c; }
      return readCell(c, line, name);
    }

    function intArith(op, a, b, line) {
      switch (op) {
        case '+': return checkInt(a + b, line);
        case '-': return checkInt(a - b, line);
        case '*': return checkInt(a * b, line);
        case '/': if (b === 0) throw new SimError('runtime', line, 'intDivZero', []); return checkInt(Math.trunc(a / b), line);
        default: if (b === 0) throw new SimError('runtime', line, 'intDivZero', []); return checkInt(a % b, line);
      }
    }

    function arith(op, a, b, ty, line) {
      if (ty === 'int') return intArith(op, a, b, line);
      if (ty === 'size_t') {
        switch (op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new SimError('runtime', line, 'intDivZero', []); return Math.trunc(a / b);
          default: if (b === 0) throw new SimError('runtime', line, 'intDivZero', []); return a % b;
        }
      }
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        default: return a / b;
      }
    }

    function compare(op, a, b) {
      switch (op) {
        case '==': return Number(a === b);
        case '!=': return Number(a !== b);
        case '<': return Number(a < b);
        case '<=': return Number(a <= b);
        case '>': return Number(a > b);
        default: return Number(a >= b);
      }
    }

    // ---- indexing
    function indexCell(n) {
      const base = n.base;
      if (n.strIndex) {
        const sc = lvOrEv(base);
        const idx = ev(n.idx);
        const s = typeof sc === 'string' ? sc : sc.v;
        const path = typeof sc === 'string' ? 'string' : sc.path;
        if (typeof sc !== 'string') readPath(sc.path);
        if (idx < 0 || idx > s.length || (idx === s.length && n.lv && typeof sc !== 'string' && false)) throw oobError(n.line, path, idx, s.length);
        const proxy = {
          ty: 'char', path, nm: path, a: (sc.a || 0) + idx, strProxy: true,
          get v() { return idx < sc.v.length ? sc.v.charCodeAt(idx) : 0; },
          set v(x) { if (idx >= sc.v.length) return; sc.v = sc.v.slice(0, idx) + String.fromCharCode(x) + sc.v.slice(idx + 1); },
        };
        if (typeof sc === 'string') return { ty: 'char', path, v: idx < s.length ? s.charCodeAt(idx) : 0, a: 0 };
        return proxy;
      }
      if (n.arr) {
        const arr = lvOrEv(base);
        const idx = ev(n.idx);
        if (!Number.isInteger(idx) || idx < 0 || idx >= arr.elems.length) throw oobError(n.line, arr.path, idx, arr.elems.length);
        return arr.elems[idx];
      }
      const p = ev(base);
      const idx = ev(n.idx);
      if (p === null) throw ubError(n.line, 'nullDeref', []);
      return ptrCell({ arr: p.arr, i: p.i + idx }, n.line);
    }

    // ---- lvalues
    function lv(n) {
      switch (n.k) {
        case 'var': return varCell(n.sym);
        case 'cell': return n.cell;
        case 'field': {
          const o = objectOf(n, n.line);
          return o.fields.get(n.name);
        }
        case 'index': return indexCell(n);
        case 'un':
          if (n.op === '*') return ptrCell(ev(n.e), n.line);
          if (n.op === 'iter*') {
            const it = ev(n.e);
            if (it.i >= it.set.items.length || it.i < 0) throw oobError(n.line, it.set.path, it.i, it.set.items.length);
            return { ty: n.ty, path: `${it.set.path}[${it.i}]`, v: it.set.items[it.i], a: it.set.a, constItem: true };
          }
          break;
        case 'assign': return evalAssign(n);
        case 'pre': evalIncDec(n); return n._cell;
        case 'cond': return truthValue(ev(n.c)) ? lv(n.a) : lv(n.b);
        case 'call': return callNode(n);
        case 'conv': return lv(n.e);
        case 'stream': return n.which === 'cout' ? cout : cin;
        case 'bin':
          if (n.sk === 'out' || n.sk === 'in') return evalBin(n);
          break;
        case 'bcall': return builtinCall(n);
        case 'bmethod':
          if (n.name === 'at') {
            const o = n.arrow ? ptrCell(ev(n.obj), n.line) : lvOrEv(n.obj);
            const idx = ev(n.args[0]);
            if (idx >= o.v.length || idx < 0) throwLib('out_of_range', 'basic_string', n.line);
            return indexCell({ strIndex: true, base: { k: 'cell', cell: o, lv: true }, idx: { k: 'num', v: idx, ty: 'int' }, line: n.line, lv: true });
          }
          break;
        default: break;
      }
      throw new Error(`not an lvalue: ${n.k}`);
    }

    const truthValue = v => (v !== 0 && v !== null && v !== undefined && v !== false);

    // ---- strings, formatting
    function readCString(p, line) {
      if (p === null) throw ubError(line, 'nullDeref', []);
      let s = '';
      for (let i = p.i; ; i++) {
        const c = p.arr[i];
        if (!c) throw oobError(line, arrName(p.arr), i, p.arr.length);
        readPath(c.path);
        if (c.v === undefined) throw ubError(line, 'uninitRead', [c.path]);
        if (c.v === 0) break;
        s += String.fromCharCode(c.v);
      }
      return s;
    }

    function outText(ty, v, line) {
      if (ty === 'cstr' || ty === 'string') return v;
      if (ty === 'char') return String.fromCharCode(v);
      if (ty === 'double') return formatDouble(v);
      if (ty === 'size_t') return formatSize(v);
      if (isNumTy2(ty)) return String(v);
      if (ty === 'char*') return readCString(v, line);
      if (isPtrTy(ty) || ty === 'nullptr_t') {
        if (v === null) return '0x0';
        const t = v.arr[v.i];
        return t ? `0x${t.a.toString(16)}` : '0x?';
      }
      return String(v);
    }
    const isNumTy2 = t => SCALARS.has(t) || program.enums.has(t);

    function emitOut(stream, text) {
      if (stream.st.isCout) {
        output += text;
        cur.printed += text;
        return;
      }
      const st = stream.st;
      if (!st.open) { st.fail = true; return; }
      st.buf += text;
      if (!cur.fileEvents.has(`w:${st.file}`)) {
        cur.fileEvents.add(`w:${st.file}`);
        cur.events.push({ type: 'file', op: 'write', name: st.file });
      }
    }

    function flushStream(st) {
      if (st.buf) { files[st.file] = (files[st.file] || '') + st.buf; st.buf = ''; }
    }
    function closeStream(sc, line) {
      const st = sc.st;
      if (!st.open) return;
      if (sc.ty === 'ofstream') flushStream(st);
      st.open = false;
      if (cur) cur.events.push({ type: 'file', op: 'close', name: st.file });
    }
    function openStream(sc, name, line) {
      const st = sc.st;
      if (st.open) { st.fail = true; return; }
      st.file = name;
      st.eof = false; st.fail = false;
      if (sc.ty === 'ofstream') {
        files[name] = '';
        st.open = true; st.buf = '';
        if (cur) cur.events.push({ type: 'file', op: 'open', name });
      } else if (Object.prototype.hasOwnProperty.call(files, name)) {
        st.text = files[name]; st.pos = 0; st.open = true;
        if (cur) cur.events.push({ type: 'file', op: 'open', name });
      } else {
        st.open = false; st.fail = true;
      }
    }

    // ---- extraction
    const TOKEN_RE = { int: /^[+-]?\d+/, double: /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/, char: /^\S/, bool: /^[01]/, string: /^\S+/, size_t: /^\d+/ };
    function extract(sc, ty, line, soft, name) {
      const st = sc.st;
      if (!st.open && !st.isCin) { st.fail = true; return null; }
      if (st.fail) return null;
      while (st.pos < st.text.length && /\s/.test(st.text[st.pos])) st.pos++;
      if (st.pos >= st.text.length) {
        st.eof = true; st.fail = true;
        if (st.isCin && !soft) throw new SimError('input', line, 'inputMissing', [name]);
        return null;
      }
      const body = st.text.slice(st.pos);
      const key = isNumTy2(ty) && !SCALARS.has(ty) ? 'int' : ty;
      const m = TOKEN_RE[key].exec(body);
      if (!m) {
        st.fail = true;
        if (st.isCin && !soft) {
          const word = /^\S+/.exec(body)[0];
          throw new SimError('input', line, 'inputBad', [word, ty, name]);
        }
        return { failed: true, value: key === 'string' ? '' : 0 };
      }
      st.pos += m[0].length;
      if (st.pos >= st.text.length) st.eof = true;
      let value = key === 'char' ? m[0].charCodeAt(0) : (key === 'string' ? m[0] : Number(m[0]));
      if (key === 'int') value = checkInt(value, line);
      const leftover = /^\S+/.exec(st.text.slice(st.pos));
      return { value, text: m[0], leftover: leftover ? leftover[0] : null };
    }

    function getlineFrom(sc, delim, line, soft, name) {
      const st = sc.st;
      if (!st.open && !st.isCin) { st.fail = true; return null; }
      if (st.fail) return null;
      if (st.pos >= st.text.length) {
        st.eof = true; st.fail = true;
        if (st.isCin && !soft) throw new SimError('input', line, 'inputMissing', [name]);
        return { text: '' , failed: true };
      }
      const end = st.text.indexOf(delim, st.pos);
      let text;
      if (end < 0) { text = st.text.slice(st.pos); st.pos = st.text.length; st.eof = true; }
      else { text = st.text.slice(st.pos, end); st.pos = end + 1; }
      return { text };
    }

    function notifyRead(sc) {
      if (sc.st.isCin) return;
      if (!cur.fileEvents.has(`r:${sc.st.file}`)) {
        cur.fileEvents.add(`r:${sc.st.file}`);
        cur.events.push({ type: 'file', op: 'read', name: sc.st.file });
      }
    }

    // ---- sets
    function setInsert(set, value) {
      const items = set.items;
      let lo = 0;
      let hi = items.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (items[mid] < value) lo = mid + 1; else hi = mid;
      }
      if (lo < items.length && items[lo] === value) return false;
      items.splice(lo, 0, value);
      return true;
    }
    function setFind(set, value) {
      const items = set.items;
      let lo = 0;
      let hi = items.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (items[mid] < value) lo = mid + 1; else hi = mid;
      }
      return lo < items.length && items[lo] === value ? lo : -1;
    }

    // ---- throwing from library code
    function makeExceptionCell(name, what) {
      const c = makeCell(name, '<exception>');
      c.fields.get('__what').v = what;
      c.cn = name;
      return c;
    }
    function throwLib(name, what, line) {
      const t = new CppThrow(makeExceptionCell(name, what), name, line);
      t.pendingStep = true;
      throw t;
    }

    // ---- built-in function calls
    function builtinCall(n) {
      const line = n.line;
      const a = n.args;
      switch (n.name) {
        case 'isalpha': case 'isdigit': case 'isupper': case 'islower': case 'isspace': case 'toupper': case 'tolower': {
          const c = ev(a[0]);
          const upper = c >= 65 && c <= 90;
          const lower = c >= 97 && c <= 122;
          switch (n.name) {
            case 'isalpha': return upper || lower ? 1024 : 0;
            case 'isdigit': return c >= 48 && c <= 57 ? 2048 : 0;
            case 'isupper': return upper ? 256 : 0;
            case 'islower': return lower ? 512 : 0;
            case 'isspace': return c === 32 || (c >= 9 && c <= 13) ? 8192 : 0;
            case 'toupper': return lower ? c - 32 : c;
            default: return upper ? c + 32 : c;
          }
        }
        case 'strlen': return readCStringValue(a[0], line).length;
        case 'strcmp': {
          const x = readCStringValue(a[0], line);
          const y = readCStringValue(a[1], line);
          return x < y ? -1 : (x > y ? 1 : 0);
        }
        case 'strcpy': case 'strcat': {
          const dst = ev(a[0]);
          const src = readCStringValue(a[1], line);
          let at = dst.i;
          if (n.name === 'strcat') at = dst.i + readCString(dst, line).length;
          const chars = src + '\0';
          for (let k = 0; k < chars.length; k++) {
            const c = dst.arr[at + k];
            if (!c) throw oobError(line, arrName(dst.arr), at + k, dst.arr.length);
            writeCell(c, chars.charCodeAt(k));
          }
          return dst;
        }
        case 'getline': return doGetline(n);
        case 'sort': case 'reverse': case 'rotate': case 'find': case 'binary_search': return doAlgorithm(n);
        default: throw new Error(`unknown builtin ${n.name}`);
      }
    }

    function readCStringValue(argNode, line) {
      const v = ev(argNode);
      if (typeof v === 'string') return v;
      return readCString(v, line);
    }

    function rangeCells(first, last, line) {
      if (first === null || last === null || first.arr !== last.arr) throw ubError(line, 'invalidOperands', []);
      const out = [];
      for (let i = first.i; i < last.i; i++) {
        const c = first.arr[i];
        if (!c) throw oobError(line, arrName(first.arr), i, first.arr.length);
        readPath(c.path);
        if (c.v === undefined) throw ubError(line, 'uninitRead', [c.path]);
        out.push(c);
      }
      return out;
    }

    function doAlgorithm(n) {
      const line = n.line;
      const a = n.args;
      const first = ev(a[0]);
      const last = ev(a[1]);
      if (isIterTy(a[0].ty)) {
        const val = ev(a[2]);
        const set = first.set;
        let found = last.i;
        for (let i = first.i; i < last.i; i++) if (set.items[i] === val) { found = i; break; }
        if (n.name === 'find') return { set, i: found };
        return found !== last.i;
      }
      const cells = rangeCells(first, last, line);
      const values = cells.map(c => c.v);
      const store = (next) => { cells.forEach((c, i) => { if (c.v !== next[i]) writeCell(c, next[i]); }); };
      switch (n.name) {
        case 'sort': store(values.slice().sort(compareValues)); return undefined;
        case 'reverse': store(values.slice().reverse()); return undefined;
        case 'rotate': {
          const mid = ev(a[2]);
          const k = mid.i - first.i;
          store([...values.slice(k), ...values.slice(0, k)]);
          return first;
        }
        case 'find': {
          const val = ev(a[2]);
          const idx = values.indexOf(val);
          return { arr: first.arr, i: first.i + (idx < 0 ? values.length : idx) };
        }
        default: { // binary_search, same algorithm as lower_bound + equality test
          const val = ev(a[2]);
          let lo = 0;
          let hi = values.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (values[mid] < val) lo = mid + 1; else hi = mid;
          }
          return Number(lo < values.length && !(val < values[lo]));
        }
      }
    }

    function doGetline(n) {
      const line = n.line;
      const sc = ev(n.args[0]);
      const target = lv(n.args[1]);
      const delim = n.args[2] ? String.fromCharCode(ev(n.args[2])) : '\n';
      const r = getlineFrom(sc, delim, line, n.soft, target.nm || target.path);
      notifyRead(sc);
      if (r) {
        const from = shownCell(target);
        target.v = r.text;
        recordWrite(target, from, shownCell(target));
        if (!r.failed) cur.inputs.push({ name: target.nm || target.path, path: target.path, text: r.text });
        note(`입력에서 한 줄을 읽어 ${target.path} 에 넣었습니다.`, `Read a line from the input into ${target.path}.`);
      }
      return sc;
    }

    // ---- builtin methods
    function doBMethod(n) {
      const line = n.line;
      const o = n.arrow ? ptrCell(ev(n.obj), line) : lvOrEv(n.obj);
      const oty = n.arrow ? pointeeTy(n.obj.ty) : n.obj.ty;
      const args = n.args;
      const isStr = typeof o === 'string';
      const sv = () => { if (!isStr) readPath(o.path); return isStr ? o : o.v; };
      switch (n.name) {
        case 'size': case 'length':
          if (oty === 'string') return sv().length;
          readPath(o.path); return o.items.length;
        case 'empty':
          if (oty === 'string') return Number(sv().length === 0);
          readPath(o.path); return Number(o.items.length === 0);
        case 'c_str': return sv();
        case 'clear':
          if (o.st) { o.st.fail = false; o.st.eof = false; return undefined; }
          if (o.items) { const from = shownCell(o); o.items = []; recordWrite(o, from, shownCell(o)); return undefined; }
          { const from = shownCell(o); o.v = ''; recordWrite(o, from, shownCell(o)); }
          return undefined;
        case 'push_back': { const from = shownCell(o); o.v += String.fromCharCode(ev(args[0])); recordWrite(o, from, shownCell(o)); return undefined; }
        case 'substr': {
          const s = sv();
          const pos = ev(args[0]);
          const len = args[1] ? ev(args[1]) : s.length;
          if (pos > s.length || pos < 0) throwLib('out_of_range', 'basic_string', line);
          return s.substr(pos, len < 0 ? s.length : len);
        }
        case 'at': {
          const s = sv();
          const idx = ev(args[0]);
          if (idx >= s.length || idx < 0) throwLib('out_of_range', 'basic_string', line);
          return indexCell({ strIndex: true, base: { k: 'cell', cell: o, lv: true }, idx: { k: 'num', v: idx, ty: 'int' }, line, lv: true }).v;
        }
        case 'find': {
          const s = sv();
          const needle = args[0].ty === 'char' ? String.fromCharCode(ev(args[0])) : ev(args[0]);
          const from = args[1] ? ev(args[1]) : 0;
          const at = s.indexOf(needle, from);
          return at < 0 ? -1 : at;
        }
        // sets
        case 'insert': { const from = shownCell(o); const added = setInsert(o, ev(args[0])); if (added) recordWrite(o, from, shownCell(o)); return undefined; }
        case 'erase': {
          const from = shownCell(o);
          if (n.byIter) {
            const it = ev(args[0]);
            if (it.i >= o.items.length) throw oobError(line, o.path, it.i, o.items.length);
            o.items.splice(it.i, 1);
            recordWrite(o, from, shownCell(o));
            return { set: o, i: it.i };
          }
          const idx = setFind(o, ev(args[0]));
          if (idx < 0) return 0;
          o.items.splice(idx, 1);
          recordWrite(o, from, shownCell(o));
          return 1;
        }
        case 'count': readPath(o.path); return setFind(o, ev(args[0])) >= 0 ? 1 : 0;
        case 'find_set': return undefined;
        case 'begin': readPath(o.path); return { set: o, i: 0 };
        case 'end': readPath(o.path); return { set: o, i: o.items.length };
        // streams
        case 'open': openStream(o, ev(args[0]), line); return undefined;
        case 'close': closeStream(o, line); return undefined;
        case 'is_open': return Number(o.st.open);
        case 'flush': if (o.ty === 'ofstream') flushStream(o.st); return undefined;
        case 'eof': return Number(o.st.eof);
        case 'fail': return Number(o.st.fail);
        case 'good': return Number(!o.st.fail && !o.st.eof);
        case 'ignore': {
          const st = o.st;
          const count = args[0] ? ev(args[0]) : 1;
          const delim = args[1] ? String.fromCharCode(ev(args[1])) : null;
          for (let k = 0; k < count; k++) {
            if (st.pos >= st.text.length) { st.eof = true; break; }
            const ch = st.text[st.pos++];
            if (delim !== null && ch === delim) break;
          }
          return undefined;
        }
        case 'get': {
          const st = o.st;
          if (st.pos >= st.text.length) { st.eof = true; st.fail = true; return -1; }
          return st.text.charCodeAt(st.pos++);
        }
        default: throw new Error(`unknown method ${n.name}`);
      }
    }

    // set.find(x) shares the name with string.find
    function bmethodDispatch(n) {
      if (n.name === 'find' && isSetTy(n.obj.ty.replace(/\*$/, ''))) {
        const o = n.arrow ? ptrCell(ev(n.obj), n.line) : lvOrEv(n.obj);
        readPath(o.path);
        const idx = setFind(o, ev(n.args[0]));
        return { set: o, i: idx < 0 ? o.items.length : idx };
      }
      return doBMethod(n);
    }

    // ---- expressions
    function evalIncDec(n) {
      const cell = lv(n.e);
      n._cell = cell;
      const ty = n.e.ty;
      const dir = n.op === '++' ? 1 : -1;
      const old = readCell(cell, n.line, cell.nm);
      let next;
      if (isIterTy(ty)) next = { set: old.set, i: old.i + dir };
      else if (isPtrTy(ty)) next = { arr: old.arr, i: old.i + dir };
      else if (ty === 'int') next = checkInt(old + dir, n.line);
      else if (ty === 'char') next = toType('char', old + dir);
      else next = old + dir;
      writeCell(cell, next);
      note(`${cell.path}: ${shownScalar(ty, old)} → ${shownScalar(ty, next)}`, `${cell.path}: ${shownScalar(ty, old)} → ${shownScalar(ty, next)}`);
      return old;
    }

    function convNote(from, to, value) {
      if (to === 'int' && from === 'double') cur.notes.push(message('noteConversion', [formatDouble(value)]));
    }

    function evalAssign(n) {
      const cellFor = () => lv(n.l);
      switch (n.kind) {
        case 'scalar': {
          const v = ev(n.r);
          const cell = cellFor();
          writeCell(cell, v);
          const shown = shownCell(cell);
          cur.notes.push(`${cell.path}: ${cur.changed.get(cell.path).from} → ${shown}`);
          return cell;
        }
        case 'string': {
          const v = ev(n.r);
          const cell = cellFor();
          writeCell(cell, v);
          cur.notes.push(`${cell.path}: ${cur.changed.get(cell.path).from} → ${shownCell(cell)}`);
          return cell;
        }
        case 'strcat': {
          const v = ev(n.r);
          const cell = cellFor();
          writeCell(cell, readCell(cell, n.line) + v);
          return cell;
        }
        case 'ptr': {
          const k = ev(n.r);
          const cell = cellFor();
          const p = readCell(cell, n.line);
          writeCell(cell, { arr: p.arr, i: p.i + (n.op === '+=' ? k : -k) });
          return cell;
        }
        case 'object': {
          const src = lvOrEv(n.r);
          const dst = cellFor();
          assignObject(dst, src, n.line, n.r.lv === false);
          return dst;
        }
        case 'compound': {
          const b = ev(n.r);
          const cell = cellFor();
          readPath(cell.path);
          if (cell.v === undefined) throw ubError(n.line, 'uninitCompound', [cell.nm || cell.path, n.op]);
          const result = arith(n.bop, cell.v, b, n.common, n.line);
          const stored = toType(n.ty, result);
          if (n.ty === 'int' && n.common === 'double') convNote('double', 'int', result);
          const from = shownCell(cell);
          writeCell(cell, stored);
          cur.notes.push(`${cell.path}: ${from} → ${shownCell(cell)}`);
          return cell;
        }
        default: throw new Error(`assign kind ${n.kind}`);
      }
    }

    function evalBin(n) {
      switch (n.sk) {
        case 'logic': {
          const a = truthValue(ev(n.l));
          if (n.op === '&&') return a ? Number(truthValue(ev(n.r))) : 0;
          return a ? 1 : Number(truthValue(ev(n.r)));
        }
        case 'arith': {
          const a = ev(n.l);
          const b = ev(n.r);
          if (n.ty === 'bool') return compare(n.op, a, b);
          return arith(n.op, a, b, n.ty, n.line);
        }
        case 'str': {
          const a = ev(n.l);
          const b = ev(n.r);
          return compare(n.op, a, b);
        }
        case 'strcat': return ev(n.l) + ev(n.r);
        case 'ptr': {
          const p = ev(n.l);
          const k = ev(n.r);
          if (p === null) return k === 0 ? null : { arr: [], i: k };
          return { arr: p.arr, i: p.i + (n.op === '+' ? k : -k) };
        }
        case 'ptrL': {
          const k = ev(n.l);
          const p = ev(n.r);
          return { arr: p.arr, i: p.i + k };
        }
        case 'ptrdiff': {
          const a = ev(n.l);
          const b = ev(n.r);
          if (a.arr !== b.arr) throw ubError(n.line, 'invalidOperands', []);
          return a.i - b.i;
        }
        case 'ptrcmp': {
          const a = ev(n.l);
          const b = ev(n.r);
          if (n.op === '==') return Number(samePtr(a, b));
          if (n.op === '!=') return Number(!samePtr(a, b));
          if (a === null || b === null || a.arr !== b.arr) throw ubError(n.line, 'invalidOperands', []);
          return compare(n.op, a.i, b.i);
        }
        case 'itercmp': {
          const a = ev(n.l);
          const b = ev(n.r);
          const same = a.set === b.set && a.i === b.i;
          return Number(n.op === '==' ? same : !same);
        }
        case 'out': return evalOut(n);
        case 'in': return evalIn(n);
        default: throw new Error(`bin ${n.sk}`);
      }
    }

    function evalOut(n) {
      const sc = ev(n.l);
      if (n.rty === 'manip') {
        emitOut(sc, '\n');
        if (sc.ty === 'ofstream') flushStream(sc.st);
        return sc;
      }
      const v = ev(n.r);
      const t = n.rty;
      emitOut(sc, outText(t, v, n.line));
      return sc;
    }

    function evalIn(n) {
      const sc = ev(n.l);
      const target = lv(n.r);
      const name = target.nm || target.path;
      const r = extract(sc, target.ty, n.line, n.soft, name);
      notifyRead(sc);
      if (r) {
        const stored = r.failed ? 0 : r.value;
        if (!(r.failed && target.ty === 'string')) writeCell(target, target.ty === 'string' ? r.value : toType(target.ty, stored));
        if (!r.failed) {
          cur.inputs.push({ name, path: target.path, text: r.text });
          cur.notes.push(message('noteRead', [r.text, target.path]));
          if (r.leftover && target.ty === 'int' && /^\./.test(r.leftover)) cur.notes.push(message('noteLeftover', [r.leftover]));
        }
      }
      return sc;
    }

    function ev(n) {
      switch (n.k) {
        case 'num': case 'const': return n.v;
        case 'cell': return n.cell;
        case 'str': return n.v;
        case 'nullptr': return null;
        case 'this': return ptrTo(frame.thisCell);
        case 'var': {
          const c = varCell(n.sym);
          if (c.elems) { readPath(c.path); return c; }
          return loadCell(c, n.line, n.name);
        }
        case 'field': {
          const o = objectOf(n, n.line);
          return loadCell(o.fields.get(n.name), n.line, n.name);
        }
        case 'index': return loadCell(indexCell(n), n.line);
        case 'un': return evalUnary(n);
        case 'pre': evalIncDec(n); return n._cell.v;
        case 'post': return evalIncDec(n);
        case 'bin': return evalBin(n);
        case 'assign': { const c = evalAssign(n); return c.v === undefined ? c : loadCellNoCheck(c); }
        case 'cond': return truthValue(ev(n.c)) ? ev(n.a) : ev(n.b);
        case 'call': { const r = callNode(n); return n.lv && !isObjectTy2(n.ty) ? loadCell(r, n.line) : r; }
        case 'bcall': return builtinCall(n);
        case 'bmethod': return bmethodDispatch(n);
        case 'conv': return evalConv(n);
        case 'ctorcall': return evalCtorCall(n);
        case 'new': return evalNew(n);
        case 'newset': return makeCell(n.ty, '<tmp>');
        case 'stream': return n.which === 'cout' ? cout : cin;
        case 'endl': return undefined;
        default: throw new Error(`cannot evaluate ${n.k}`);
      }
    }
    function loadCellNoCheck(c) { return c.fields || c.elems || c.items || c.st ? c : c.v; }

    function evalUnary(n) {
      switch (n.op) {
        case '-': { const v = ev(n.e); return n.ty === 'int' ? checkInt(-v, n.line) : -v; }
        case '+': return ev(n.e);
        case '!': return Number(!truthValue(ev(n.e)));
        case '&': return ptrTo(lv(n.e));
        case '*': return loadCell(ptrCell(ev(n.e), n.line), n.line);
        case 'iter*': {
          const it = ev(n.e);
          if (it.i >= it.set.items.length || it.i < 0) throw oobError(n.line, it.set.path, it.i, it.set.items.length);
          readPath(it.set.path);
          return it.set.items[it.i];
        }
        default: throw new Error(`unary ${n.op}`);
      }
    }

    function evalConv(n) {
      switch (n.how) {
        case 'arith': {
          const v = ev(n.e);
          if (n.ty === 'int' && n.from === 'double') convNote('double', 'int', v);
          return toType(n.ty, v);
        }
        case 'truth': return Number(truthValue(ev(n.e)));
        case 'streamOk': { const sc = ev(n.e); return Number(!sc.st.fail); }
        case 'a2p': {
          const c = lvOrEv(n.e);
          readPath(c.path);
          return { arr: c.elems, i: 0 };
        }
        case 'null': return null;
        case 'upcast': case 'ptrcast': case 'same': {
          if (classes.has(n.ty) && !n.lv) return sliceCopy(lvOrEv(n.e), n.ty);
          return ev(n.e);
        }
        case 'cstr2s': return ev(n.e);
        case 'char2s': return String.fromCharCode(ev(n.e));
        case 'cstr2p': return cstrPointer(n.e);
        default: throw new Error(`conv ${n.how}`);
      }
    }

    const literalCells = new Map();
    function cstrPointer(node) {
      let c = literalCells.get(node);
      if (!c) {
        const text = node.v + '\0';
        c = makeCell(`char[${text.length}]`, '<literal>');
        c.elems.forEach((e, i) => { e.v = text.charCodeAt(i); });
        literalCells.set(node, c);
      }
      return { arr: c.elems, i: 0 };
    }

    function sliceCopy(src, ty) {
      const dst = makeCell(ty, '<tmp>');
      const cls = classes.get(ty);
      for (const name of cls.fieldOrder) copyInto(dst.fields.get(name), src.fields.get(name), false);
      dst.cn = ty;
      return dst;
    }

    // raw value copy between cells of the same type (no steps)
    function copyInto(dst, src, record) {
      if (src.fields) {
        for (const [k, f] of src.fields) if (dst.fields.has(k)) copyInto(dst.fields.get(k), f, record);
        return;
      }
      if (src.elems) { src.elems.forEach((e, i) => copyInto(dst.elems[i], e, record)); return; }
      if (src.items) { dst.items = src.items.slice(); return; }
      if (src.st) return;
      if (record) { if (src.v !== undefined) writeCell(dst, src.v); else dst.v = undefined; } else dst.v = src.v;
    }

    // ---- frames
    function newFrame(fi, display, key, thisCell) {
      return { fi, display, key, prefix: key === 'main' ? '' : (key === '::' ? '::' : `${key}::`), slots: new Array(fi.nslots || 0), live: [],
        thisCell, line: fi.line || 1, ret: undefined, returned: false, isMain: false, ownedParams: [] };
    }

    function bindVar(sym, name, cell, own, isRef) {
      if (sym.global) { globalCells.set(name, cell); return; }
      frame.slots[sym.slot] = cell;
      frame.live.push({ name, cell, own, ref: Boolean(isRef) });
    }

    // ---- one step per executed statement
    function stepped(line, kind, body) {
      tick(line);
      const saved = cur;
      const c = newCollector();
      c.before = flatFrame();
      cur = c;
      try {
        const r = body();
        emitStep(typeof kind === 'function' ? kind() : kind, line);
        return r;
      } catch (e) {
        if (e instanceof SimError && e.reads === undefined) e.reads = [...c.reads];
        if (e instanceof CppThrow && e.pendingStep) {
          e.pendingStep = false;
          c.events.push({ type: 'throw', exception: excName(e.ty), what: excWhat(e) });
          note(`예외 ${excName(e.ty)} 가 던져졌습니다.`, `An exception of type ${excName(e.ty)} was thrown.`);
          emitStep('throw', line);
        }
        throw e;
      } finally {
        cur = saved;
      }
    }

    function excName(ty) {
      if (Object.prototype.hasOwnProperty.call(EXCEPTION_PARENTS, ty)) return `std::${ty}`;
      if (ty === 'cstr') return 'const char*';
      return ty;
    }
    function excWhat(t) {
      const c = t.cell;
      if (c && c.fields) {
        const w = c.fields.get('__what');
        if (w) return w.v;
        // user class deriving from an exception class keeps the message in its base part
        return '';
      }
      return c ? shownCell(c) : '';
    }

    // ---- scopes
    let flowLine = 0;
    function execBlock(stmts, endLine, hook) {
      const mark = frame.live.length;
      let flow;
      try {
        for (let i = 0; i < stmts.length; i++) {
          flow = exec(stmts[i]);
          if (flow) break;
        }
      } catch (e) {
        if (e instanceof CppThrow) unwindTo(mark, e.line);
        throw e;
      }
      if (hook) hook();
      unwindTo(mark, flow ? flowLine : endLine);
      return flow;
    }

    function execBody(s) {
      if (s.k === 'block') return exec(s);
      return execBlock([s], s.line);
    }

    function unwindTo(mark, line) {
      const fr = frame;
      for (let i = fr.live.length - 1; i >= mark; i--) {
        const e = fr.live[i];
        if (e.own && !e.moved) destroyLocal(e.cell, line);
      }
      fr.live.length = mark;
    }

    function destroyLocal(cell, line) {
      if (cell.fields) destroyObject(cell, line);
      else if (cell.elems && cell.elems.length && cell.elems[0].fields) {
        for (let i = cell.elems.length - 1; i >= 0; i--) destroyObject(cell.elems[i], line);
      } else if (cell.st && cell.st.open && cell.st.file !== undefined) {
        closeStream(cell, line);
      }
      markDead(cell);
    }

    // ---- objects: construction and destruction
    function findCopyCtor(cls) {
      return cls.ctors.find(c => c.params.length === 1 && c.params[0].ty === cls.name && c.params[0].ref && !c.isDefault && !c.isDeleted) || null;
    }

    function prepareArgs(fi, nodes) {
      return nodes.map((a, i) => {
        const p = fi.params[i];
        if (p.ref) {
          if (a.lv) return { ref: true, cell: lv(a) };
          const v = ev(a);
          if (v !== null && typeof v === 'object' && (v.fields || v.elems || v.items || v.st)) return { ref: true, cell: v };
          const tmp = makeCell(p.ty, '<tmp>');
          tmp.v = v;
          return { ref: true, cell: tmp };
        }
        if (classes.has(p.ty)) {
          if (a.lv) return { copyFrom: lv(a), cls: classes.get(p.ty) };
          return { adopt: ev(a) };
        }
        if (isSetTy(p.ty)) { const src = lvOrEv(a); return { copyFrom: src, cls: null }; }
        return { value: ev(a) };
      });
    }

    // runs the constructor chosen by the checker on an already allocated cell
    function constructObject(cell, cls, r, line) {
      cell.cn = cls.name;
      const fi = r.fi;
      if (fi.builtin === 'exceptionCtor') {
        const arg = r.args.length ? ev(r.args[0]) : '';
        cell.fields.get('__what').v = arg;
        return;
      }
      if (fi.implicit) {
        if (fi.implicitDefault) { runPlan(cell, cls, cls.implicitPlan, line); return; }
        const src = lvOrEv(r.args[0]);
        copyConstruct(cell, src, cls, line);
        return;
      }
      invoke(fi, cell, prepareArgs(fi, r.args), line, { ctor: true });
    }

    function copyConstruct(dst, src, cls, line) {
      dst.cn = cls.name;
      const user = findCopyCtor(cls);
      if (user) {
        invoke(user, dst, [{ ref: true, cell: src }], line, { ctor: true });
        return;
      }
      readPath(src.path);
      if (cls.base && !cls.builtin) memberCopy(dst, src, cls.base, line);
      for (const f of cls.fieldDecls) copyField(dst.fields.get(f.name), src.fields.get(f.name), line);
      if (cls.builtin) copyInto(dst, src, false);
      dst.cn = cls.name;
    }
    function memberCopy(dst, src, cls, line) {
      if (cls.base) memberCopy(dst, src, cls.base, line);
      for (const f of cls.fieldDecls) copyField(dst.fields.get(f.name), src.fields.get(f.name), line);
    }
    function copyField(d, s, line) {
      if (d.fields) {
        const fcls = classes.get(s.cn);
        const user = fcls && findCopyCtor(fcls);
        if (user) { copyConstruct(d, s, fcls, line); return; }
        copyInto(d, s, false);
        return;
      }
      copyInto(d, s, false);
    }

    function constructSub(fc, fcls, r, line) {
      stepped(line, 'construct', () => {
        constructObject(fc, fcls, r, line);
        cur.events.push({ type: 'construct', path: fc.path, class: fcls.name, how: r.how });
        recordCreated(fc);
        note(`${fc.path} 객체를 만들었습니다.`, `Constructed ${fc.path}.`);
      });
    }

    function constructPart(cell, cls, r, line) {
      cell.cn = cls.name;
      constructObject(cell, cls, r, line);
    }

    // base-class construction and member initialization (runs inside the constructor's frame)
    function runPlan(cell, cls, plan, line) {
      if (cls.base && plan && plan.base) constructPart(cell, cls.base, plan.base, line);
      cell.cn = cls.name;
      if (!plan) return;
      for (const entry of plan.fields) {
        const f = entry.f;
        const fc = cell.fields.get(f.name);
        switch (entry.mode) {
          case 'ctor': constructSub(fc, classes.get(f.ty), entry.r, f.line || line); break;
          case 'expr': {
            const expr = entry.expr;
            stepped(expr.line || line, 'assign', () => { initFieldValue(fc, ev(expr)); note(`${fc.path}: ? → ${shownCell(fc)}`, `${fc.path}: ? → ${shownCell(fc)}`); });
            break;
          }
          case 'nsdmi':
            stepped(f.line || line, 'assign', () => { initFieldValue(fc, ev(f.init)); note(`${fc.path}: ? → ${shownCell(fc)}`, `${fc.path}: ? → ${shownCell(fc)}`); });
            break;
          default:
            if (entry.elemCtor) fc.elems.forEach(e => constructObject(e, classes.get(e.ty), entry.elemCtor, line));
            break;
        }
      }
    }

    function initFieldValue(fc, v) {
      if (fc.fields || fc.elems) { copyInto(fc, v, false); recordCreated(fc); return; }
      if (fc.items) { fc.items = v.items.slice(); recordWrite(fc, null, shownCell(fc)); return; }
      fc.v = v;
      recordWrite(fc, null, shownCell(fc));
    }

    function findOverride(dynName, fi0) {
      const key = sigOf(fi0.params);
      for (let c = classes.get(dynName); c; c = c.base) {
        const list = c.methods.get(fi0.name);
        const m = list && list.find(x => sigOf(x.params) === key);
        if (m) return m;
      }
      return fi0;
    }

    function runDtorChain(cell, cls, line) {
      cell.cn = cls.name;
      if (cls.dtor && cls.dtor.body) invoke(cls.dtor, cell, [], line, { dtor: true });
      for (let i = cls.fieldDecls.length - 1; i >= 0; i--) {
        const fc = cell.fields.get(cls.fieldDecls[i].name);
        if (fc.fields) destroyObject(fc, line);
        else if (fc.elems && fc.elems.length && fc.elems[0].fields) for (let k = fc.elems.length - 1; k >= 0; k--) destroyObject(fc.elems[k], line);
        else if (fc.st && fc.st.open) closeStream(fc, line);
      }
      if (cls.base) runDtorChain(cell, cls.base, line);
    }

    function destroyObject(cell, line, asClass) {
      const cls = classes.get(asClass || cell.cn);
      if (!cls) return;
      const dynName = cell.cn;
      stepped(line, 'destruct', () => {
        runDtorChain(cell, cls, line);
        cur.events.push({ type: 'destruct', path: cell.path, class: cls.name });
        note(`${cell.path} 객체의 수명이 끝났습니다.`, `${cell.path} was destroyed.`);
      });
      cell.cn = dynName;
    }

    function assignObject(dst, src, line, fromTemp) {
      const cls = classes.get(dst.cn);
      if (dst === src) return;
      readPath(src.path);
      const copyFields = (c, d, s) => {
        if (c.base) copyFields(c.base, d, s);
        for (const f of c.fieldDecls) assignField(d.fields.get(f.name), s.fields.get(f.name), line);
      };
      if (cls.builtin) { copyInto(dst, src, true); return; }
      copyFields(cls, dst, src);
    }
    function assignField(d, s, line) {
      if (d.fields) {
        const fcls = classes.get(d.cn);
        const ops = fcls && lookupMethodsRt(fcls, 'operator=');
        const op = ops && ops.find(m => m.params.length === 1 && m.params[0].ty === fcls.name);
        if (op && op.body) { invoke(op, d, [{ ref: true, cell: s }], line, {}); return; }
        assignObject(d, s, line);
        return;
      }
      if (d.elems) { d.elems.forEach((e, i) => assignField(e, s.elems[i], line)); return; }
      if (d.items) { const from = shownCell(d); d.items = s.items.slice(); recordWrite(d, from, shownCell(d)); return; }
      if (s.v === undefined) { d.v = undefined; return; }
      writeCell(d, s.v);
    }
    function lookupMethodsRt(cls, name) {
      for (let c = cls; c; c = c.base) { const own = c.methods.get(name); if (own && own.length) return own; }
      return null;
    }

    // ---- function invocation
    function invoke(fi, recv, argSpecs, line, meta) {
      meta = meta || {};
      if (fi.builtin === 'what') return recv.fields.get('__what').v;
      if (frames.length > 200) throw new SimError('runtime', line, 'stackOverflow', []);
      const display = fi.display;
      let same = 0;
      for (const f of frames) if (f.display === display) same++;
      const key = same ? `${display}#${same + 1}` : display;
      const callerFrame = frame;
      const callerCur = cur;
      const fr = newFrame(fi, display, key, recv);
      fr.isMain = Boolean(meta.isMain);
      frames.push(fr);
      frame = fr;
      let finished = false;
      try {
        const c = newCollector();
        cur = c;
        // bind parameters
        const eventArgs = [];
        fi.params.forEach((p, i) => {
          const spec = argSpecs[i];
          const name = p.name || `$arg${i}`;
          let cell;
          if (spec.ref) {
            cell = spec.cell;
            frame.slots[p.slot] = cell;
            frame.live.push({ name, cell, own: false, ref: true });
            eventArgs.push({ name, shown: shownCell(cell), byRef: true, target: cell.path });
            return;
          }
          const path = `${fr.prefix}${name}`;
          if (spec.adopt) {
            cell = spec.adopt;
            repath(cell, path);
          } else if (spec.copyFrom) {
            cell = makeCell(p.ty, path, name);
            if (spec.cls) {
              copyConstruct(cell, spec.copyFrom, spec.cls, line);
              recordCreated(cell);
              c.events.push({ type: 'construct', path, class: spec.cls.name, how: 'copy' });
            } else { copyInto(cell, spec.copyFrom, false); recordCreated(cell); }
          } else {
            cell = makeCell(p.ty, path, name);
            cell.v = spec.value;
            recordWrite(cell, null, shownCell(cell));
          }
          if (cell.fields && !spec.copyFrom) recordCreated(cell);
          frame.slots[p.slot] = cell;
          frame.live.push({ name, cell, own: false, ref: false });
          fr.ownedParams.push(cell);
          eventArgs.push({ name, shown: shownCell(cell), byRef: false });
        });
        if (!meta.isMain) {
          if (meta.dispatch) c.events.push(meta.dispatch);
          c.events.push({ type: 'call', fn: display, ...(recv ? { object: recv.path } : {}), args: eventArgs });
          note(`${display} 함수를 호출했습니다.`, `Entered ${display}.`);
          tick(fi.line);
          c.before = [];
          emitStep('enter', fi.line);
        }
        cur = null;
        if (fi.isCtor && !fi.builtin) runPlan(recv, fi.cls, fi.plan, fi.line);
        const hook = fr.isMain ? () => { result.vars = flatFrame(); result.finalMem = snapshotMem(frame.line); } : null;
        execBlock(fi.body.body, fi.body.endLine, hook);
        if (!fr.returned && !meta.isMain && (fi.retTy === 'void' || fi.isCtor || fi.isDtor)) {
          tick(fi.body.endLine);
          const cc = newCollector();
          cc.before = flatFrame();
          cur = cc;
          cc.events.push({ type: 'return', fn: display });
          note(`${display} 함수가 끝났습니다.`, `${display} finished.`);
          emitStep('exit', fi.body.endLine);
          cur = null;
        }
        if (!fr.returned && meta.isMain) {
          const cc = newCollector();
          cc.before = result.vars;
          cur = cc;
          cc.notes.push(message('noteEnd'));
          emitStep('end', fi.body.endLine, { after: result.vars });
          cur = null;
          result.exitCode = 0;
        }
        for (let k = fr.ownedParams.length - 1; k >= 0; k--) {
          const pc = fr.ownedParams[k];
          if (pc.fields && !pc.moved) destroyObject(pc, fi.body.endLine);
          markDead(pc);
        }
        finished = true;
        return fr.ret;
      } finally {
        if (!finished) fr.ownedParams.forEach(markDead);
        frames.pop();
        frame = callerFrame;
        cur = callerCur;
      }
    }

    function callNode(n) {
      const line = n.line;
      let recv = null;
      if (n.recv) recv = n.arrow ? ptrCell(ev(n.recv), line) : lvOrEv(n.recv);
      let fi = n.fn;
      let dispatch = null;
      if (recv && !fi.isCtor) {
        const isVirtual = Boolean(fi.virtual && n.virt);
        if (isVirtual) fi = findOverride(recv.cn, fi);
        dispatch = { type: 'dispatch', method: n.fn.name, static: n.staticCls, dynamic: recv.cn, virtual: isVirtual, object: recv.path };
      }
      if (fi.builtin === 'what') { readPath(recv.path); return recv.fields.get('__what').v; }
      const args = prepareArgs(fi, n.args);
      return invoke(fi, recv, args, line, { dispatch });
    }

    function evalCtorCall(n) {
      const cell = makeCell(n.ty, '<tmp>');
      constructObject(cell, n.cls, { fi: n.ctor, args: n.args, how: n.how }, n.line);
      return cell;
    }

    function evalNew(n) {
      const line = n.line;
      const id = `@${heap.length + 1}`;
      const ty = n.allocTy;
      if (n.count) {
        const count = ev(n.count);
        if (!Number.isInteger(count) || count < 0) throw new SimError('runtime', line, 'invalidOperands', []);
        const cell = makeCell(`${ty}[${count}]`, id, undefined, true);
        const block = { id, ty, array: true, freed: false, line, cell };
        cell.blk = block;
        cell.elems.blk = block;
        cell.elems.forEach(e => { e.blk = block; });
        heap.push(block);
        cur.events.push({ type: 'alloc', id, allocatedType: ty, count });
        if (n.ctor) cell.elems.forEach(e => { constructObject(e, classes.get(ty), { fi: n.ctor, args: n.ctorArgs, how: 'default' }, line); });
        return { arr: cell.elems, i: 0 };
      }
      const cell = makeCell(ty, id, undefined, true);
      const block = { id, ty, array: false, freed: false, line, cell };
      cell.blk = block;
      heap.push(block);
      cur.events.push({ type: 'alloc', id, allocatedType: ty });
      if (n.ctor) {
        constructObject(cell, classes.get(ty), { fi: n.ctor, args: n.ctorArgs, how: n.how }, line);
        recordCreated(cell);
        cur.events.push({ type: 'construct', path: id, class: ty, how: n.how });
      } else if (n.init) {
        const v = ev(n.init);
        if (ty === 'string') cell.v = v; else cell.v = v;
        recordWrite(cell, null, shownCell(cell));
      } else if (n.zeroInit) {
        zeroFill(cell);
        recordWrite(cell, null, shownCell(cell));
      } else {
        recordWrite(cell, null, shownCell(cell));
      }
      return { arr: [cell], i: 0 };
    }

    // ---- statements
    function exec(s) {
      switch (s.k) {
        case 'empty': return undefined;
        case 'block': return execBlock(s.body, s.endLine);
        case 'decl': stepped(s.line, s.sk, () => execDecl(s)); return undefined;
        case 'expr': return execExprStmt(s);
        case 'if': {
          let taken = false;
          stepped(s.line, 'if', () => {
            taken = truthValue(ev(s.cond));
            cur.events.push({ type: 'branch', taken });
            note(taken ? '조건: 참' : '조건: 거짓', `Condition: ${taken ? 'true' : 'false'}`);
          });
          const branch = taken ? s.yes : s.no;
          return branch ? execBody(branch) : undefined;
        }
        case 'loop': return execLoop(s);
        case 'switch': return execSwitch(s);
        case 'break': stepped(s.line, 'break', () => note('반복(또는 switch)을 끝냅니다.', 'Exit the loop or switch.')); flowLine = s.line; return BREAK;
        case 'continue': stepped(s.line, 'continue', () => note('다음 반복으로 넘어갑니다.', 'Continue to the next iteration.')); flowLine = s.line; return CONTINUE;
        case 'return': return execReturn(s);
        case 'delete': stepped(s.line, 'free', () => execDelete(s)); return undefined;
        case 'throw': return execThrow(s);
        case 'try': return execTry(s);
        default: throw new Error(`unknown statement ${s.k}`);
      }
    }

    function execExprStmt(s) {
      stepped(s.line, s.sk, () => {
        const v = ev(s.e);
        if (s.sk === 'cout') note0(message('notePrint', [JSON.stringify(cur.printed)]));
        else if (s.sk === 'expr') note0(message('noteExpr', [shownScalar(s.e.ty, v)]));
        if (v && typeof v === 'object' && v.fields && !s.e.lv && s.e.k !== 'stream') destroyObject(v, s.line);
      });
      return undefined;
    }
    function note0(text) { cur.notes.push(text); }

    function initArrayFrom(cell, init, line) {
      if (init.k === 'strinit') {
        const chars = init.v;
        cell.elems.forEach((e, i) => { e.v = i < chars.length ? chars.charCodeAt(i) : 0; });
        return;
      }
      cell.elems.forEach((e, i) => {
        const item = init.items[i];
        if (item === undefined) { zeroFill(e); return; }
        if (e.elems) initArrayFrom(e, item, line);
        else if (e.fields) {
          const v = ev(item);
          copyInto(e, v, false);
        } else e.v = ev(item);
      });
    }

    function execDecl(s) {
      for (const v of s.vars) {
        const sym = v.sym;
        const name = v.name;
        const path = sym.global ? `::${name}` : `${frame.prefix}${name}`;
        switch (v.mode) {
          case 'ref': {
            let target;
            if (v.refDirect) target = lv(v.initNode);
            else {
              const val = ev(v.initNode);
              if (val && typeof val === 'object' && (val.fields || val.elems || val.items)) target = val;
              else { target = makeCell(v.ty, path, name); target.v = val; }
            }
            bindVar(sym, name, target, false, true);
            note(`${name} 은(는) ${target.path} 의 다른 이름(참조)입니다.`, `${name} is another name (reference) for ${target.path}.`);
            readPath(target.path);
            break;
          }
          case 'scalar': case 'pointer': {
            const cell = makeCell(v.ty, path, name);
            if (v.initNode) {
              const raw = ev(v.initNode);
              cell.v = raw;
              recordWrite(cell, null, shownCell(cell));
              cur.notes.push(message('noteDeclInit', [name, shownScalar(v.ty, raw)]));
            } else if (sym.global) {
              cell.v = isPtrTy(v.ty) ? null : 0;
              recordWrite(cell, null, shownCell(cell));
            } else {
              recordWrite(cell, null, '?');
              cur.notes.push(message('noteDecl', [name]));
            }
            bindVar(sym, name, cell, true);
            break;
          }
          case 'string': {
            const cell = makeCell('string', path, name);
            if (v.initNode) cell.v = ev(v.initNode);
            recordWrite(cell, null, shownCell(cell));
            bindVar(sym, name, cell, true);
            note(`${name} 문자열을 만들었습니다.`, `Created the string ${name}.`);
            break;
          }
          case 'set': {
            const cell = makeCell(v.ty, path, name);
            if (v.listItems) for (const it of v.listItems) setInsert(cell, ev(it));
            else if (v.initNode) cell.items = lvOrEv(v.initNode).items.slice();
            recordWrite(cell, null, shownCell(cell));
            bindVar(sym, name, cell, true);
            note(`${name} 집합을 만들었습니다.`, `Created the set ${name}.`);
            break;
          }
          case 'stream': {
            const cell = makeCell(v.ty, path, name);
            bindVar(sym, name, cell, true);
            if (v.fileArg) openStream(cell, ev(v.fileArg), s.line);
            recordWrite(cell, null, v.ty);
            note(`${name} 파일 스트림을 만들었습니다.`, `Created the file stream ${name}.`);
            break;
          }
          case 'array': {
            const cell = makeCell(v.ty, path, name);
            if (v.initNode) initArrayFrom(cell, v.initNode, s.line);
            else if (sym.global) zeroFill(cell);
            bindVar(sym, name, cell, true);
            if (v.elemCtor) {
              cell.elems.forEach(e => constructObject(e, v.elemCls, v.elemCtor, s.line));
              recordCreated(cell);
            } else {
              recordWrite(cell, null, shownCell(cell));
            }
            cur.notes.push(message('noteDecl', [name]));
            break;
          }
          case 'object': {
            let cell;
            if (v.initKind === 'elide') {
              cell = ev(v.initNode);
              repath(cell, path);
              cell.nm = name;
              bindVar(sym, name, cell, true);
              recordCreated(cell);
            } else {
              cell = makeCell(v.ty, path, name);
              if (sym.global) cell.a = cell.a;
              bindVar(sym, name, cell, true);
              constructObject(cell, v.cls, v.ctor, s.line);
              recordCreated(cell);
            }
            cur.events.push({ type: 'construct', path, class: v.cls.name, how: v.initKind === 'elide' ? 'copy' : v.initKind });
            note(`${path} 객체를 만들었습니다.`, `Constructed ${path}.`);
            break;
          }
          default: throw new Error(`decl mode ${v.mode}`);
        }
      }
    }

    function execReturn(s) {
      const fr = frame;
      const fi = fr.fi;
      stepped(s.line, 'return', () => {
        let shown;
        if (s.e) {
          if (fi.retRef) {
            const cell = lv(s.e);
            fr.ret = cell;
            shown = shownCell(cell);
          } else if (classes.has(fi.retTy) || isSetTy(fi.retTy)) {
            const src = lvOrEv(s.e);
            if (!s.e.lv) fr.ret = src;
            else {
              const local = fr.live.find(e => e.cell === src && e.own);
              if (local) { local.moved = true; fr.ret = src; }
              else {
                const copy = makeCell(fi.retTy, '<tmp>');
                if (classes.has(fi.retTy)) copyConstruct(copy, src, classes.get(fi.retTy), s.line); else copyInto(copy, src, false);
                fr.ret = copy;
              }
            }
            shown = shownCell(fr.ret);
          } else {
            fr.ret = ev(s.e);
            shown = shownScalar(fi.retTy, fr.ret);
          }
        }
        fr.returned = true;
        if (fr.isMain) {
          result.exitCode = fr.ret === undefined ? 0 : toType('int', fr.ret);
          note0(result.exitCode === 0 ? message('noteReturnZero') : message('noteReturn', [result.exitCode]));
        } else {
          cur.events.push({ type: 'return', fn: fr.display, ...(shown === undefined ? {} : { value: shown }) });
          note(`${fr.display} 함수가 ${shown === undefined ? '' : `${shown} 을(를) `}돌려주며 끝납니다.`, `${fr.display} returns${shown === undefined ? '' : ` ${shown}`}.`);
        }
      });
      flowLine = s.line;
      return RETURN;
    }

    function execLoop(s) {
      const mark = frame.live.length;
      let flow;
      try {
        flow = runLoop(s);
      } catch (e) {
        if (e instanceof CppThrow) unwindTo(mark, e.line);
        throw e;
      }
      unwindTo(mark, s.line);
      return flow;
    }

    function runLoop(s) {
      let iteration = 0;
      if (s.loopKind === 'range') return runRange(s);
      if (s.loopKind === 'for' && s.init) exec(s.init);
      for (;;) {
        if (s.loopKind !== 'do' || iteration > 0) {
          let ok = true;
          stepped(s.condLine, 'loop', () => {
            ok = s.cond ? truthValue(ev(s.cond)) : true;
            cur.events.push({ type: 'loop', cond: ok, iteration });
            note(ok ? `반복 ${iteration + 1}번째: 조건이 참입니다.` : '조건이 거짓이라 반복을 끝냅니다.', ok ? `Iteration ${iteration + 1}: the condition is true.` : 'The condition is false, so the loop ends.');
          });
          if (!ok) return undefined;
        }
        const flow = execBody(s.body);
        if (flow === BREAK) return undefined;
        if (flow === RETURN) return flow;
        if (s.loopKind === 'for' && s.inc) {
          stepped(s.line, s.inc.sk, () => { ev(s.inc.e); });
        }
        iteration++;
      }
    }

    function runRange(s) {
      const src = lvOrEv(s.range);
      readPath(src.path);
      const count = () => (src.elems ? src.elems.length : (src.items ? src.items.length : src.v.length));
      for (let iteration = 0; ; iteration++) {
        let ok = true;
        stepped(s.condLine, 'loop', () => {
          ok = iteration < count();
          cur.events.push({ type: 'loop', cond: ok, iteration });
          if (ok) {
            const d = s.sym;
            let cell;
            if (s.decl.ref) {
              cell = src.elems ? src.elems[iteration] : null;
              if (!cell) throw new Error('range reference');
              frame.slots[d.slot] = cell;
              frame.live.push({ name: d.name, cell, own: false, ref: true });
            } else {
              const path = `${frame.prefix}${d.name}`;
              cell = makeCell(s.varTy, path, d.name);
              const elemCell = src.elems ? src.elems[iteration] : null;
              let val;
              if (src.elems) { readPath(elemCell.path); val = elemCell.v; if (elemCell.fields) copyInto(cell, elemCell, false); }
              else if (src.items) val = src.items[iteration];
              else val = src.v.charCodeAt(iteration);
              if (!cell.fields) cell.v = s.varConv && s.varConv.how === 'arith' ? toType(s.varTy, val) : val;
              recordWrite(cell, null, shownCell(cell));
              frame.slots[d.slot] = cell;
              frame.live.push({ name: d.name, cell, own: true, ref: false });
            }
            note(`${s.decl.name} = ${shownCell(cell)}`, `${s.decl.name} = ${shownCell(cell)}`);
          } else note('더 가져올 원소가 없어 반복을 끝냅니다.', 'No elements are left, so the loop ends.');
        });
        if (!ok) return undefined;
        const mark = frame.live.length - 1;
        let flow;
        try {
          flow = execBody(s.body);
        } catch (e) {
          if (e instanceof CppThrow) unwindTo(mark, e.line);
          throw e;
        }
        unwindTo(mark, flow ? flowLine : s.line);
        if (flow === BREAK) return undefined;
        if (flow === RETURN) return flow;
      }
    }

    function execSwitch(s) {
      let value;
      stepped(s.line, 'switch', () => {
        value = ev(s.cond);
        note(`선택 값: ${value}`, `Switch value: ${value}`);
      });
      let index = s.cases.findIndex(c => c.value && c.val === value);
      if (index < 0) index = s.cases.findIndex(c => !c.value);
      if (index < 0) return undefined;
      const mark = frame.live.length;
      let flow;
      try {
        for (; index < s.cases.length && !flow; index++) {
          const c = s.cases[index];
          stepped(c.line, 'case', () => {
            const label = c.value ? c.val : 'default';
            cur.events.push({ type: 'case', value, label });
            note(`분기: ${label}`, `Case: ${label}`);
          });
          for (const st of c.body) {
            flow = exec(st);
            if (flow) break;
          }
        }
      } catch (e) {
        if (e instanceof CppThrow) unwindTo(mark, e.line);
        throw e;
      }
      unwindTo(mark, flow ? flowLine : s.line);
      if (flow === BREAK) return undefined;
      return flow;
    }

    function execDelete(s) {
      const line = s.line;
      const p = ev(s.e);
      if (p === null) { note('nullptr 을 delete 했습니다. 아무 일도 일어나지 않습니다.', 'Deleting nullptr does nothing.'); return; }
      let block = p.arr.blk;
      const isArrayBlock = Boolean(block);
      if (!block && p.arr.length === 1) block = p.arr[0].blk;
      if (!block) throw ubError(line, 'deleteMismatch', []);
      if (block.freed) throw ubError(line, 'doubleFree', []);
      if (isArrayBlock !== s.array || (isArrayBlock && p.i !== 0)) throw ubError(line, 'deleteMismatch', []);
      if (classes.has(block.ty)) {
        const objs = isArrayBlock ? block.cell.elems : [block.cell];
        for (let i = objs.length - 1; i >= 0; i--) {
          const o = objs[i];
          const staticCls = s.cls;
          const virtualDtor = (() => { for (let c = staticCls; c; c = c.base) if (c.dtor && c.dtor.virtual) return true; return false; })();
          destroyObject(o, line, virtualDtor || isArrayBlock || !staticCls ? o.cn : staticCls.name);
        }
      }
      block.freed = true;
      cur.events.push({ type: 'free', id: block.id, array: block.array });
      note(`${block.id} 할당을 해제했습니다.`, `Freed allocation ${block.id}.`);
    }

    function execThrow(s) {
      let t;
      stepped(s.line, 'throw', () => {
        if (s.e) {
          const src = s.e.ty === 'cstr' ? null : lvOrEv(s.e);
          let cell;
          const ty = s.e.ty;
          if (classes.has(ty)) {
            if (s.e.lv) { cell = makeCell(ty, '<exception>'); copyConstruct(cell, src, classes.get(ty), s.line); }
            else cell = src;
            cell.cn = src.cn;
          } else if (ty === 'cstr') {
            cell = makeCell('cstr', '<exception>');
            cell.v = s.e.v !== undefined ? s.e.v : ev(s.e);
          } else {
            cell = makeCell(ty, '<exception>');
            cell.v = ty === 'string' || !isObjectTy2(ty) ? (typeof src === 'object' && src !== null && !src.arr && !src.set ? src.v : src) : undefined;
          }
          repath(cell, '<exception>');
          t = new CppThrow(cell, ty, s.line);
        } else {
          t = caught[caught.length - 1];
        }
        cur.events.push({ type: 'throw', exception: excName(t.ty), what: excWhat(t) });
        note(`예외 ${excName(t.ty)} 를 던집니다.`, `Throwing ${excName(t.ty)}.`);
      });
      flowLine = s.line;
      throw t;
    }
    const isObjectTy2 = t => classes.has(t) || t === 'string' || isSetTy(t);

    function handlerMatches(h, t) {
      if (h.all) return true;
      const ty = t.ty;
      if (h.ty === ty) return true;
      if (ty === 'cstr' && (h.ty === 'char*')) return true;
      const cls = classes.get(ty);
      if (cls && cls.bases.includes(h.ty)) return true;
      return false;
    }

    function execTry(s) {
      const mark = frame.live.length;
      let flow;
      try {
        flow = execBody(s.body);
      } catch (e) {
        if (!(e instanceof CppThrow)) throw e;
        unwindTo(mark, e.line);
        const h = s.handlers.find(x => handlerMatches(x, e));
        if (!h) throw e;
        caught.push(e);
        const hmark = frame.live.length;
        try {
          stepped(h.line, 'catch', () => {
            cur.events.push({ type: 'catch', exception: excName(e.ty), what: excWhat(e) });
            if (h.slot >= 0 && h.sym) {
              const name = h.sym.name;
              let cell;
              if (h.ref) { cell = e.cell; frame.slots[h.slot] = cell; frame.live.push({ name, cell, own: false, ref: true }); }
              else {
                cell = makeCell(h.ty, `${frame.prefix}${name}`, name);
                if (classes.has(h.ty)) copyConstruct(cell, e.cell, classes.get(h.ty), h.line); else cell.v = e.cell.v;
                recordCreated(cell);
                frame.slots[h.slot] = cell;
                frame.live.push({ name, cell, own: true, ref: false });
              }
            }
            note(`${excName(e.ty)} 예외를 잡았습니다.`, `Caught ${excName(e.ty)}.`);
          });
          flow = execBody(h.body);
        } catch (e2) {
          if (e2 instanceof CppThrow) unwindTo(hmark, e2.line);
          throw e2;
        } finally {
          caught.pop();
        }
        unwindTo(hmark, flow ? flowLine : h.line);
      }
      return flow;
    }

    // ---- program driver
    let finishedNormally = false;
    try {
      // global variables are initialized before main starts (no steps are recorded for them)
      const globalFrame = { display: 'main', key: 'main', prefix: '', slots: [], live: [], line: 1, fi: { nslots: 0 } };
      frames.push(globalFrame);
      frame = globalFrame;
      cur = newCollector();
      for (const decl of program.globals) execDecl(decl);
      frames.pop();
      frame = null;
      cur = null;
      const mainFi = program.main;
      invoke(mainFi, null, [], mainFi.line, { isMain: true });
      finishedNormally = true;
    } catch (e) {
      if (e instanceof CppThrow) {
        const err = new SimError('runtime', e.line, 'uncaughtException', [excName(e.ty), excWhat(e)]);
        err.reads = [];
        throw err;
      }
      throw e;
    } finally {
      result.output = output;
      if (!finishedNormally) result.vars = frames.length ? frameCells(frames[0]) : [];
      result.leaks = heap.filter(b => !b.freed).map(b => ({ id: b.id, type: b.ty, line: b.line }));
    }
  }

  // ---------------------------------------------------------------- public API
  function run(source, options) {
    const previous = activeLang;
    activeLang = options && (options.lang === 'ko' || options.lang === 'en') ? options.lang : lang;
    try { return runInternal(source, options); } finally { activeLang = previous; }
  }

  function errorInfo(e) {
    const info = { kind: e.kind, line: e.line, code: e.code, message: e.message };
    if (e.reads) info.reads = e.reads;
    if (e.path !== undefined) { info.path = e.path; info.index = e.index; info.size = e.size; }
    return info;
  }

  function runInternal(source, options) {
    const opts = Object.assign({ input: '', maxSteps: 5000, files: {} }, options);
    const result = { stage: 'compile', ok: false, error: null, steps: [], output: '', vars: [], exitCode: null,
      files: Object.assign({}, opts.files), leaks: [] };
    let tokens;
    try {
      tokens = tokenize(String(source));
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = errorInfo(e);
      return result;
    }
    let parsed;
    try {
      parsed = parse(tokens);
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = errorInfo(e);
      return result;
    }
    const analysis = analyze(parsed);
    let err = parsed.error;
    if (analysis.error && (!err || analysis.error.line <= err.line)) err = analysis.error;
    if (err) {
      result.error = errorInfo(err);
      return result;
    }
    const program = analysis.program;
    if (!parsed.items.length) {
      result.error = errorInfo(compileError(1, 'expectedFunction', [message('endOfFile')]));
      return result;
    }
    if (!program.main) {
      result.stage = 'link';
      const names = program.functionNames;
      const near = names.find(n => n.toLowerCase() === 'main');
      const name = near || names[names.length - 1] || '';
      result.error = { kind: 'link', line: program.entryLine || 1, code: 'linkNoMain', message: message('linkNoMain', [Boolean(near), name]) };
      const fn = name && program.funcs.get(name) && program.funcs.get(name)[0];
      if (fn) result.error.line = fn.line;
      return result;
    }
    const missing = program.calls.find(c => !c.fn.body && !c.fn.pure && !c.fn.builtin && !c.fn.isDefault);
    if (missing) {
      result.stage = 'link';
      result.error = { kind: 'link', line: missing.line, code: 'undefinedFunction', message: message('undefinedFunction', [missing.fn.display || missing.fn.name]) };
      return result;
    }
    result.stage = 'runtime';
    try {
      execute(program, opts, result);
      result.ok = true;
      result.stage = 'done';
    } catch (e) {
      if (!(e instanceof SimError)) throw e;
      result.error = errorInfo(e);
      if (!result.error.reads) result.error.reads = [];
    }
    if (result.leaks.length && result.steps.length) {
      const last = result.steps[result.steps.length - 1];
      if (result.ok) last.notes.push(tr(`해제되지 않은 할당이 ${result.leaks.length}개 남았습니다.`, `${result.leaks.length} allocation(s) remain unreleased.`));
    }
    return result;
  }

  const api = { run, formatDouble, SimError, setLang, getLang };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.CppSim = api;
})(this);
