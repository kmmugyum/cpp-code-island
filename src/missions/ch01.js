/*
 * 1장 미션 데이터와 채점. DOM 을 쓰지 않으므로 Node 테스트에서도 그대로 불러올 수 있다.
 * 채점은 정답 문자열 비교가 아니라 시뮬레이터 실행 결과(출력·변수)로 한다.
 */
(function (global) {
  'use strict';

  const Sim = typeof module === 'object' && module.exports ? require('../cppsim.js') : global.CppSim;

  const CHAPTERS = [
    { no: 1, lecture: 'Introduction', zone: '시작 기지', action: '입력한 전력을 계산해 기지 가동', pages: 'p.1~8', playable: true },
    { no: 2, lecture: 'Flow of Control', zone: '자동문과 운송로', action: '조건과 반복으로 이동·충전 자동화', pages: 'p.1~8' },
    { no: 3, lecture: 'Functions', zone: '명령 제작소', action: '반복 작업을 함수로 만들고 원본 값 수정', pages: 'p.8~64' },
    { no: 4, lecture: 'Arrays and Strings', zone: '부품 창고', action: '여러 칸을 처리하고 문자 신호 해독', pages: 'p.1~5' },
    { no: 5, lecture: 'Pointers', zone: '배선실', action: '주소를 연결하고 가리키는 값 조작', pages: 'p.1~6' },
    { no: 6, lecture: 'Classes', zone: '로봇 조립소', action: '상태와 행동을 묶어 여러 로봇 생성', pages: 'p.7~65' },
    { no: 7, lecture: 'OOP and Inheritance', zone: '전문 로봇 훈련장', action: '상속·구성과 다형성으로 역할 분담', pages: 'p.1~7' },
    { no: 8, lecture: 'Memory Management', zone: '자원 관리소', action: '객체 수명과 동적 메모리 관리', pages: 'p.2~76' },
    { no: 9, lecture: 'Advanced Topics I', zone: '범용 공방', action: '템플릿·STL·연산자 오버로딩 활용', pages: 'p.1~6' },
    { no: 10, lecture: 'Advanced Topics II', zone: '중앙 관제소', action: '파일 저장·입력·예외 처리를 연결', pages: 'p.1~9' },
  ];

  const ERROR_TYPES = {
    order: '빌드 순서',
    semicolon: '문장 끝(;)',
    name: '이름·대소문자',
    direction: '입출력 방향(<< >>)',
    namespace: 'std 이름공간',
    intDivision: '정수 나눗셈',
    conversion: 'double→int 변환',
    evalOrder: '계산 순서',
    hardcode: '특정 입력에만 맞춤',
    noOutput: '출력 누락',
    input: '입력 값',
    uninit: '초기화 전 사용',
    syntax: '기타 문법',
  };

  // 시뮬레이터 오류 → 튜터가 볼 오류 유형
  function classifySimError(error) {
    const types = {
      linkNoMain: 'name', caseMismatch: 'name', undeclared: 'name', undeclaredVar: 'name',
      cinUndeclared: 'name', unknownIoName: 'name', notInStd: 'name',
      nameNeedsStd: 'namespace', endlNeedsStd: 'namespace',
      missingSemicolon: 'semicolon', colonInsteadOfSemicolon: 'semicolon', semicolonBefore: 'semicolon',
      wrongArrowCout: 'direction', wrongArrowCin: 'direction', singleArrow: 'direction',
      streamNeedsArrow: 'direction', streamParen: 'direction',
      inputMissing: 'input', inputBad: 'input', uninitRead: 'uninit', uninitCompound: 'uninit',
    };
    return types[error.code] || 'syntax';
  }

  const ERROR_LABEL = {
    compile: '컴파일 오류',
    link: '링크 오류',
    runtime: '실행 중 문제',
    ub: '실행 중 문제',
    input: '실행 중 문제(입력)',
    unsupported: '시뮬레이터 미지원',
  };

  function numbersIn(text) {
    return (text.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) || []).map(Number);
  }

  function fillTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole));
  }

  // ------------------------------------------------------------------ 1-1

  const m11 = {
    id: '1-1',
    title: '시동 순서',
    zone: '배선 공장',
    sceneIdle: '빌드 기계가 모두 꺼져 있습니다. 카드 순서를 확인하면 로봇이 소스 파일을 들고 기계를 차례로 지나갑니다.',
    reward: { item: 'key', name: '빌드 키' },
    kind: 'order',
    goal: '기지 설계도(소스 코드)가 실제로 움직이는 프로그램이 되기까지의 순서를 맞춰 기지 배선을 연결하세요.',
    done: '카드 7장을 올바른 순서로 놓으면 미션 완료, 이어지는 상황 질문 2개를 맞히면 적용 확인.',
    reuse: '코드를 고쳤는데 결과가 그대로라면, 다시 빌드(컴파일·링크)했는지부터 확인합니다.',
    lecture: {
      pages: 'Lecture 1, p.1~2',
      quotes: [
        'A program goes from text files (or source files) to processor instructions as follows',
        'Object files are intermediate files that represent an incomplete copy of the program',
        'the code is run through a preprocessor, which applies some modifications to the source code, before being fed to the compiler.',
      ],
    },
    cards: [
      { id: 'source', item: 'file', label: '소스 파일', sub: 'base.cpp — 사람이 읽고 고치는 글', why: '소스 파일은 사람이 쓴 출발점입니다. 다른 단계는 모두 이 글을 재료로 씁니다.' },
      { id: 'pre', item: 'scroll', label: '전처리기', sub: '#include 같은 # 명령을 먼저 처리', why: '전처리기는 소스 파일을 받아 #include 내용을 붙인 뒤 컴파일러에 넘깁니다.' },
      { id: 'compiler', item: 'gear', label: '컴파일러', sub: '코드를 기계어 조각으로 번역', why: '컴파일러는 전처리된 코드를 받아 번역합니다. 전처리기보다 뒤, 오브젝트 파일보다 앞입니다.' },
      { id: 'object', item: 'chip', label: '오브젝트 파일', sub: '빠진 부분 표시가 남은 미완성 조각', why: '오브젝트 파일은 컴파일러가 만든 결과물입니다. 아직 빠진 조각이 있어 바로 실행할 수 없습니다.' },
      { id: 'linker', item: 'book', label: '링커', sub: '조각과 라이브러리를 이어 붙임', why: '링커는 오브젝트 파일과 라이브러리를 받아 빠진 부분을 채웁니다.' },
      { id: 'exe', item: 'cart', label: '실행 파일', sub: '완성된 프로그램', why: '실행 파일은 링커가 만든 완성품입니다. 운영체제가 실행하기 직전 단계입니다.' },
      { id: 'os', item: 'house', label: '운영체제가 실행', sub: '메모리에 올려 실제로 동작', why: '운영체제는 완성된 실행 파일만 실행할 수 있습니다. 가장 마지막입니다.' },
    ],
    quiz: [
      {
        q: 'base.cpp 의 출력 문장 한 줄을 고쳤습니다. 고친 내용이 기지에 반영되려면?',
        options: [
          { t: '이미 있는 실행 파일을 다시 실행한다', ok: false, why: '그 실행 파일은 고치기 전의 소스로 만든 것이라 바뀐 내용이 들어 있지 않습니다.' },
          { t: '다시 컴파일·링크해서 새 실행 파일을 만든 뒤 실행한다', ok: true, why: '소스가 바뀌면 그 소스로 실행 파일을 다시 만들어야 합니다.' },
          { t: '오브젝트 파일을 메모장으로 열어 직접 고친다', ok: false, why: '오브젝트 파일은 번역된 기계어 조각입니다. 사람이 고치는 것은 소스 파일입니다.' },
        ],
      },
      {
        q: "컴파일은 통과했는데 \"'main' 을 찾을 수 없다\"는 오류로 실행 파일이 만들어지지 않았습니다. 어느 단계에서 멈춘 걸까요?",
        options: [
          { t: '전처리기', ok: false, why: '전처리기는 # 명령만 처리합니다. 컴파일이 통과했다면 이미 지나간 단계입니다.' },
          { t: '링커', ok: true, why: '링커는 조각을 이어 붙일 때 프로그램 시작점 main 을 찾습니다. 없으면 실행 파일을 만들지 못합니다.' },
          { t: '운영체제 실행', ok: false, why: '실행 파일이 만들어지지 않았으니 운영체제가 실행할 것도 없습니다.' },
        ],
      },
    ],
    hints: [
      '각 카드 아래 설명에서 "무엇을 받아 무엇을 만드는지"를 보세요. 앞 카드의 결과물이 다음 카드의 재료입니다.',
      '컴파일러는 코드를 오브젝트 파일로, 링커는 오브젝트 파일과 라이브러리를 실행 파일로 만듭니다. C++ 는 컴파일 전에 전처리 단계를 하나 더 거칩니다.',
      '처음은 소스 파일, 마지막은 운영체제가 실행입니다. 전처리기는 컴파일러보다 먼저입니다.',
      '소스 파일 → 전처리기 → 컴파일러 → 오브젝트 파일 → 링커(+라이브러리) → 실행 파일 → 운영체제가 실행. 이 과정은 모두 실행 전에 끝납니다(강의 p.2).',
    ],
    tools: [
      { name: '소스 파일 (.cpp)', target: '사람', input: '직접 쓴 C++ 코드', result: '빌드의 출발점', change: '고치면 다시 빌드해야 반영', when: '프로그램 동작을 바꿀 때 고치는 곳' },
      { name: '컴파일러', target: '전처리된 코드', input: '소스 한 개', result: '오브젝트 파일', change: '문법이 틀리면 여기서 컴파일 오류', when: '코드를 기계어로 옮길 때' },
      { name: '링커', target: '오브젝트 파일들 + 라이브러리', input: '미완성 조각', result: '실행 파일', change: 'main 이 없으면 링크 오류', when: '조각을 하나의 프로그램으로 묶을 때' },
    ],
  };

  function checkOrder(placedIds) {
    const answer = m11.cards.map((c) => c.id);
    const empty = answer.length - placedIds.filter(Boolean).length;
    if (empty > 0) {
      return { pass: false, correctPrefix: prefixLength(placedIds, answer), message: lang === 'en' ? `${empty} slot(s) are still empty. Place all the cards before checking.` : `아직 빈 칸이 ${empty}개 있습니다. 카드를 모두 놓은 뒤 확인하세요.` };
    }
    const prefix = prefixLength(placedIds, answer);
    if (prefix === answer.length) {
      return { pass: true, correctPrefix: prefix, message: lang === 'en' ? 'Wiring complete! You put the build steps in order.' : '배선 완료! 소스 파일이 실행되는 프로그램이 되기까지의 순서를 맞췄습니다.' };
    }
    const wrong = getMissions(lang)[0].cards.find((c) => c.id === placedIds[prefix]);
    return {
      pass: false,
      correctPrefix: prefix,
      wrongIndex: prefix,
      message: lang === 'en' ? `The sequence breaks at slot ${prefix + 1}, '${wrong.label}'. ${wrong.why}` : `${prefix + 1}번째 칸의 '${wrong.label}' 부터 흐름이 끊깁니다. ${wrong.why}`,
    };
  }

  function prefixLength(a, b) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return i;
  }

  // ------------------------------------------------------------------ 1-2

  const m12 = {
    id: '1-2',
    title: '신호 보내기',
    zone: '관제탑',
    sceneIdle: '관제 화면이 꺼져 있습니다. 실행 파일이 만들어져야 화면에 cout 출력이 나타납니다.',
    reward: { item: 'signal', name: '신호기' },
    kind: 'blanks',
    goal: '관제 화면에 READY 신호를 띄우는 프로그램의 빈칸을 채우세요.',
    done: '실행 결과 화면에 READY 가 출력되면 미션 완료, 응용 신호 GO 까지 보내면 적용 확인.',
    reuse: '화면에 무언가를 보여 줘야 할 때는 main 안에서 cout << 로 출력하고, 문장마다 ; 로 끝냅니다.',
    lecture: {
      pages: 'Lecture 1, p.2~5',
      quotes: [
        'int main() {...} defines the code that should execute when the program starts up.',
        'Everything in C++ is case sensitive: someName is not the same as SomeName.',
        'Note that every statement ends with a semicolon (except preprocessor commands and blocks using {}).',
      ],
    },
    variants: [
      {
        id: 'base',
        label: '기본: READY',
        target: 'READY',
        template: [
          '#include <iostream>',
          '',
          'int {fn}() {',
          '    std::{stream} << "READY\\n"{end}',
          '    return 0;',
          '}',
        ].join('\n'),
        blanks: {
          fn: [{ code: 'main' }, { code: 'Main' }, { code: 'start' }],
          stream: [{ code: 'cout' }, { code: 'cin' }, { code: 'print' }],
          end: [{ code: ';' }, { code: ':' }, { code: '', label: '(비움)' }],
        },
      },
      {
        id: 'apply',
        label: '응용: GO',
        target: 'GO',
        template: [
          '#include <iostream>',
          '{ns}',
          '',
          'int main() {',
          '    cout {op} "GO\\n";',
          '    return 0;',
          '}',
        ].join('\n'),
        blanks: {
          ns: [{ code: 'using namespace std;' }, { code: '', label: '(비움)' }, { code: 'using std;' }],
          op: [{ code: '<<' }, { code: '>>' }, { code: '<' }],
        },
      },
    ],
    hints: [
      '아래 실행 결과에 나온 오류 종류(컴파일/링크)와 줄 번호를 먼저 보세요. 그 줄의 빈칸이 원인입니다.',
      '프로그램은 이름이 정확히 main 인 함수에서 시작합니다(대소문자 구분). 화면 출력은 cout << 이고, 문장은 ; 로 끝납니다. std:: 를 빼려면 using namespace std; 가 필요합니다.',
      '첫 빈칸은 main 입니다. 출력 화살표 << 는 데이터가 cout(화면) 쪽으로 흐르는 방향입니다.',
      '기본: int main() { std::cout << "READY\\n"; return 0; }  응용: using namespace std; 를 넣고 cout << "GO\\n";',
    ],
    tools: [
      { name: 'int main() { … }', target: '프로그램', input: '없음', result: '프로그램 시작 지점', change: '이 안의 문장이 위에서부터 실행', when: '모든 C++ 프로그램에 하나씩 필요' },
      { name: 'std::cout << 값', target: '화면(표준 출력)', input: '출력할 값', result: '화면에 글자가 나타남', change: '변수는 바뀌지 않음', when: '결과를 사람에게 보여 줄 때' },
      { name: 'using namespace std;', target: '컴파일러', input: '없음', result: 'std:: 없이 cout, cin, endl 사용', change: '실행 중 바뀌는 값 없음', when: 'std:: 를 매번 쓰지 않으려 할 때' },
      { name: '"…\\n"', target: '문자열', input: '\\n (이스케이프 시퀀스)', result: '줄바꿈 문자 하나', change: '없음', when: '출력 뒤에 줄을 바꿀 때' },
    ],
  };

  function buildBlankSource(variant, choices, params) {
    const values = {};
    for (const key of Object.keys(variant.blanks)) {
      const idx = choices[key];
      values[key] = idx === undefined || idx === null ? `{${key}}` : variant.blanks[key][idx].code;
    }
    return fillTemplate(variant.template, Object.assign({}, params || {}, values));
  }

  function blanksFilled(variant, choices) {
    return Object.keys(variant.blanks).every((k) => choices[k] !== undefined && choices[k] !== null);
  }

  function checkSignal(variant, result) {
    if (!result.ok) return simFailure(result);
    const shown = result.output.trim();
    if (shown === variant.target) {
      return { pass: true, message: lang === 'en' ? `The control screen shows ${variant.target}.` : `관제 화면에 ${variant.target} 신호가 떴습니다.` };
    }
    return {
      pass: false, kind: 'logic', errorType: 'syntax',
      message: lang === 'en' ? `The program ran, but displayed ${JSON.stringify(result.output)}. The goal is ${variant.target}.` : `프로그램은 실행됐지만 화면에 ${JSON.stringify(result.output)} 가 나왔습니다. 목표는 ${variant.target} 입니다.`,
    };
  }

  function simFailure(result) {
    const e = result.error;
    return {
      pass: false, kind: e.kind, line: e.line, errorType: classifySimError(e),
      message: lang === 'en' ? `Line ${e.line} — ${e.message}` : `${e.line}번 줄 — ${e.message}`,
    };
  }

  // ------------------------------------------------------------------ 1-3

  const m13 = {
    id: '1-3',
    title: '전력 분배',
    zone: '발전소',
    sceneIdle: '배분 장치가 고장 났습니다. 실행하면 로봇 배터리(share)에 전력이 들어가고, 발전기(total)와 로봇 수(robots)는 읽기만 합니다.',
    reward: { item: 'gear', name: '배분 톱니' },
    kind: 'blanks',
    goal: '발전기 전력 total 을 로봇 robots 대에게 똑같이 나눠, 각 로봇이 받을 share 를 정확히 계산하세요.',
    done: '발전기 5, 로봇 2대에서 share 가 2.5 이면 미션 완료, 다른 발전기·로봇 수에서도 맞으면 적용 확인.',
    reuse: '정수끼리 나눈 값에 소수점이 필요하면, 나누기 전에 한쪽을 double 로 만들고 결과도 double 변수에 담습니다.',
    lecture: {
      pages: 'Lecture 1, p.5~6',
      quotes: [
        'An operator also normally produces a value of the same type as its operands; thus, 1 / 4 evaluates to 0 because with two integer operands, / truncates the result to an integer.',
        "To get 0.25, you'd need to write something like 1 / 4.0.",
      ],
    },
    predict: {
      intro: '배분 장치를 고치기 전에, 지금 장치가 어떻게 계산하는지 예상해 보세요.',
      program: [
        '#include <iostream>',
        'using namespace std;',
        '',
        'int main() {',
        "    cout << 5 / 2 << '\\n';",
        "    cout << 5 / 2.0 << '\\n';",
        '    return 0;',
        '}',
      ].join('\n'),
      questions: [
        { label: '5 / 2 의 출력', options: ['2', '2.5', '3'] },
        { label: '5 / 2.0 의 출력', options: ['2', '2.5', '2.0'] },
      ],
      answersFrom: (result) => result.output.split('\n').filter(Boolean),
    },
    variants: [
      {
        id: 'base',
        label: '배분 장치',
        template: [
          '#include <iostream>',
          'using namespace std;',
          '',
          'int main() {',
          '    int total = {total};    // 발전기 출력',
          '    int robots = {robots};   // 로봇 수',
          '    {type} share = {expr};',
          "    cout << share << '\\n';",
          '    return 0;',
          '}',
        ].join('\n'),
        params: ['total', 'robots'],
        blanks: {
          type: [
            { code: 'int', why: 'share 가 int 면 2.5 를 담는 순간 소수점 아래가 버려집니다.', errorType: 'conversion' },
            { code: 'double' },
          ],
          expr: [
            { code: 'total / robots', why: 'int / int 는 정수 나눗셈이라 계산 단계에서 이미 소수점 아래를 버립니다.', errorType: 'intDivision' },
            { code: 'total / 2.0', why: '2.0 은 로봇 수가 아니라 고정된 숫자입니다. 로봇이 2대일 때만 맞습니다.', errorType: 'hardcode' },
            { code: 'total / robots * 1.0', why: '식은 왼쪽부터 계산합니다. total / robots 가 먼저 정수 나눗셈으로 끝나서 1.0 을 곱해도 늦습니다.', errorType: 'evalOrder' },
            { code: '1.0 * total / robots' },
            { code: 'total * 1.0 / robots' },
          ],
        },
        tests: [
          { params: { total: 5, robots: 2 }, label: '발전기 5 · 로봇 2' },
          { params: { total: 7, robots: 2 }, label: '발전기 7 · 로봇 2' },
          { params: { total: 9, robots: 4 }, label: '발전기 9 · 로봇 4' },
        ],
      },
    ],
    hints: [
      '아래 변수 표에서 share 의 타입과 값을 보세요. 발전기 5, 로봇 2대라면 2.5 가 되어야 합니다.',
      '정수 / 정수 는 소수점을 버리는 정수 나눗셈입니다. 둘 중 하나라도 double 이면 실수 나눗셈이 됩니다. 식은 왼쪽부터 계산합니다.',
      'share 의 타입은 double 이어야 합니다. 식에서는 나누기 전에 1.0 을 곱해 값을 double 로 만듭니다.',
      'double share = 1.0 * total / robots;  (total * 1.0 / robots 도 같습니다.) total / 2.0 은 로봇이 4대면 틀리고, total / robots * 1.0 은 이미 정수 나눗셈이 끝난 뒤에 1.0 을 곱합니다.',
    ],
    tools: [
      { name: 'int', target: '정수 변수', input: '정수 값', result: '소수점 없는 값 저장', change: 'double 을 넣으면 소수점 아래를 버림', when: '개수·횟수처럼 나눌 수 없는 값' },
      { name: 'double', target: '실수 변수', input: '실수 값', result: '소수점 있는 값 저장', change: '없음', when: '나눈 결과·비율처럼 소수가 필요한 값' },
      { name: 'a / b', target: '두 값', input: 'a, b', result: '둘 다 int 면 정수 몫, 하나라도 double 이면 실수', change: '변수는 바뀌지 않음(= 로 저장해야 바뀜)', when: '나누기. 결과 타입을 먼저 생각할 것' },
    ],
  };

  function checkShare(test, result) {
    if (!result.ok) return simFailure(result);
    const expected = test.params.total / test.params.robots;
    const share = result.vars.find((v) => v.name === 'share');
    const printed = numbersIn(result.output);
    const got = printed.length ? printed[printed.length - 1] : NaN;
    if (Math.abs(got - expected) < 1e-9) {
      return { pass: true, message: lang === 'en' ? `${test.label}: each robot received ${Sim.formatDouble(expected)}.` : `${test.label}: 각 로봇이 ${Sim.formatDouble(expected)} 씩 받았습니다.` };
    }
    return {
      pass: false, kind: 'logic',
      message: lang === 'en' ? `${test.label}: share is ${share ? share.shown : '?'} (${share ? share.type : '?'}). The goal is ${Sim.formatDouble(expected)}.` : `${test.label}: share 가 ${share ? share.shown : '?'}(${share ? share.type : '?'}) 입니다. 목표는 ${Sim.formatDouble(expected)} 입니다.`,
      expected, got,
    };
  }

  // ------------------------------------------------------------------ 1-4

  const m14 = {
    id: '1-4',
    title: '기지 가동',
    zone: '기지 본관',
    sceneIdle: '기지가 꺼져 있습니다. 입력 단말의 값이 cin 으로 배터리(energy)에 들어가고, 기지 가동(usage)만큼 빠져야 불이 켜집니다.',
    reward: { item: 'cell', name: '전력 셀' },
    kind: 'editor',
    goal: 'cin 으로 받은 전력에서 기지 가동에 쓰는 35 를 빼고, 남은 전력을 cout 으로 출력하세요. 오류가 난 줄도 고쳐야 합니다.',
    done: '입력 100 에서 65 가 출력되면 미션 완료, 다른 입력 값에서도 맞으면 적용 확인.',
    reuse: '실행할 때마다 달라지는 값은 cin >> 으로 받아 변수에 담고, 계산한 변수를 cout << 으로 보여 줍니다.',
    lecture: {
      pages: 'Lecture 1, p.7~8',
      quotes: [
        'A variable is a named location in memory.',
        'Just as cout << is the syntax for outputting values, cin >> (line 6) is the syntax for inputting values.',
        'think of them as arrows pointing in the direction of data flow.',
        'Compilation errors are problems raised by the compiler, generally resulting from violations of the syntax rules or misuse of types.',
      ],
    },
    predict: {
      intro: '코드를 고치기 전에 목표 값을 예상해 보세요.',
      questions: [{ label: '기지 가동에 35 를 쓴다면, 입력이 100 일 때 남는 전력은?', number: true }],
      answersFrom: () => ['65'],
    },
    starter: [
      '#include <iostream>',
      'using namespace std;',
      '',
      'int main() {',
      '    int usage = 35;   // 기지 가동에 드는 전력',
      '    int energy;       // 게이지에 연결된 변수',
      '',
      '    cin << energy;    // 수정할 코드',
      '    energy = energy - usage    // 수정할 코드',
      '    // 여기에 남은 전력 energy 를 출력하는 문장을 쓰세요',
      '',
      '    return 0;',
      '}',
    ].join('\n'),
    reference: [
      '#include <iostream>',
      'using namespace std;',
      '',
      'int main() {',
      '    int usage = 35;   // 기지 가동에 드는 전력',
      '    int energy;       // 게이지에 연결된 변수',
      '',
      '    cin >> energy;',
      '    energy = energy - usage;',
      "    cout << \"LEFT: \" << energy << '\\n';",
      '',
      '    return 0;',
      '}',
    ].join('\n'),
    tests: [
      { input: '100', label: '입력 100' },
      { input: '35', label: '입력 35' },
      { input: '80', label: '입력 80' },
      { input: '47', label: '입력 47' },
    ],
    hints: [
      '실행 결과에 나온 오류 줄 번호부터 고칩니다. 오류가 사라지면 출력 칸에 숫자가 나오는지 보세요.',
      'cin >> 변수 는 입력을 변수로, cout << 값 은 값을 화면으로 보냅니다. 화살표 방향이 데이터가 흐르는 방향입니다(강의 p.8). 문장 끝에는 ; 가 필요합니다.',
      "8번 줄은 cin >> energy; 9번 줄 끝에는 ; 를 붙입니다. 10번 줄 자리에 cout << energy 로 시작하는 문장을 추가합니다.",
      "cin >> energy;\nenergy = energy - usage;\ncout << \"LEFT: \" << energy << '\\n';\n출력 형식은 자유입니다. 마지막에 출력한 숫자로 채점합니다.",
    ],
    tools: [
      { name: 'cin >> 변수', target: '키보드(표준 입력)', input: '입력 칸의 값', result: '읽은 값을 변수에 저장', change: '변수 값이 바뀜', when: '실행할 때마다 다른 값을 받을 때' },
      { name: '변수 = 식;', target: '왼쪽 변수', input: '오른쪽 식의 값', result: '변수에 새 값 저장', change: '왼쪽 변수만 바뀜', when: '계산 결과를 기억해 둘 때' },
      { name: 'cout << 값', target: '화면(표준 출력)', input: '출력할 값', result: '화면에 표시', change: '변수는 바뀌지 않음', when: '결과를 보여 줄 때' },
    ],
  };

  function expectedLeft(test) {
    return Number(test.input) - 35;
  }

  function checkBase(test, result) {
    if (!result.ok) return simFailure(result);
    const expected = expectedLeft(test);
    const printed = numbersIn(result.output);
    if (!printed.length) {
      return { pass: false, kind: 'logic', errorType: 'noOutput', message: lang === 'en' ? `${test.label}: no number was printed. Check that you output the calculated energy with cout.` : `${test.label}: 화면에 숫자가 출력되지 않았습니다. 계산한 energy 를 cout 으로 출력했는지 확인하세요.` };
    }
    const got = printed[printed.length - 1];
    if (got === expected) {
      return { pass: true, message: lang === 'en' ? `${test.label}: printed ${expected} remaining energy.` : `${test.label}: 남은 전력 ${expected} 이(가) 출력됐습니다.` };
    }
    return { pass: false, kind: 'logic', message: lang === 'en' ? `${test.label}: the last number printed was ${got}. The goal is ${expected}.` : `${test.label}: 마지막으로 출력한 숫자가 ${got} 입니다. 목표는 ${expected} 입니다.`, expected, got };
  }

  // 기본 입력은 맞았는데 다른 입력에서 틀리면, 출력이 입력에 따라 바뀌지 않는 것(숫자를 직접 적음)이 흔한 원인
  function diagnoseApply(failures) {
    const fixed = failures.every((f) => f.got !== undefined && f.got === failures[0].got);
    return fixed ? 'hardcode' : null;
  }

  m14.fixMark = '수정할 코드';
  const MISSIONS = [m11, m12, m13, m14];
  let lang = 'ko';
  function setLang(value) { lang = value === 'en' ? 'en' : 'ko'; }

  // Clone the data while retaining the prediction functions.
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      const copy = {};
      for (const key of Object.keys(value)) copy[key] = clone(value[key]);
      return copy;
    }
    return value;
  }
  function translateTools(tools, rows) {
    const keys = ['name', 'target', 'input', 'result', 'change', 'when'];
    tools.forEach((tool, i) => keys.forEach((key, j) => { tool[key] = rows[i][j]; }));
  }
  function englishMissions() {
    const missions = clone(MISSIONS);
    const [a, b, c, d] = missions;
    Object.assign(a, {
      title: 'Startup Sequence', zone: 'Wiring Factory',
      sceneIdle: 'The build machines are off. Put the cards in order to guide the robot and its source file through them.',
      goal: 'Connect the base wiring by ordering the steps that turn source code into a running program.',
      done: 'Place all seven cards in order to complete the mission, then answer two questions to apply what you learned.',
      reuse: 'If a code change has no effect, check whether you rebuilt it by compiling and linking again.',
    });
    a.reward.name = 'Build Key';
    const cards = [
      ['Source file', 'base.cpp — text people read and edit', 'The source file is the starting point written by a person. All later steps use it.'],
      ['Preprocessor', 'Handles # commands such as #include first', 'The preprocessor handles #include and passes the result to the compiler.'],
      ['Compiler', 'Translates code into machine-code pieces', 'The compiler translates preprocessed code, after preprocessing and before the object file.'],
      ['Object file', 'An incomplete piece with missing parts marked', 'The compiler produces an object file. It still needs other pieces before it can run.'],
      ['Linker', 'Joins pieces and libraries', 'The linker combines object files and libraries to fill in missing parts.'],
      ['Executable', 'The finished program', 'The linker produces the executable, ready for the operating system to run.'],
      ['Operating system runs it', 'Loads the program into memory and runs it', 'The operating system runs the finished executable. This is the final step.'],
    ];
    a.cards.forEach((card, i) => [card.label, card.sub, card.why] = cards[i]);
    a.quiz[0].q = 'You changed an output statement in base.cpp. How do you make the change appear?';
    a.quiz[1].q = 'Compilation succeeded, but the executable was not created because main could not be found. Which step failed?';
    const quiz = [
      [['Run the existing executable again', 'It was built from the old source, so it does not contain the change.'], ['Compile and link again, then run the new executable', 'When source changes, rebuild the executable from that source.'], ['Open the object file in a text editor and change it', 'An object file contains translated machine code. Edit the source file instead.']],
      [['Preprocessor', 'The preprocessor handles # commands. Compilation has already passed it.'], ['Linker', 'The linker looks for the program entry point, main. Without it, it cannot create the executable.'], ['Operating system', 'No executable was created, so the operating system has nothing to run.']],
    ];
    a.quiz.forEach((q, i) => q.options.forEach((option, j) => [option.t, option.why] = quiz[i][j]));
    a.hints = [
      'Read what each card takes in and produces. Each result becomes input for the next step.',
      'The compiler produces an object file; the linker combines object files and libraries into an executable. C++ also preprocesses before compiling.',
      'Start with the source file and end with the operating system running it. The preprocessor comes before the compiler.',
      'Source file → preprocessor → compiler → object file → linker (+ libraries) → executable → operating system. The build finishes before execution (lecture p.2).',
    ];
    translateTools(a.tools, [
      ['Source file (.cpp)', 'Person', 'C++ code you write', 'Starting point for the build', 'Changes require a rebuild', 'Edit this to change program behavior'],
      ['Compiler', 'Preprocessed code', 'One source file', 'Object file', 'Syntax mistakes cause compile errors here', 'Translating code into machine code'],
      ['Linker', 'Object files + libraries', 'Incomplete pieces', 'Executable', 'Missing main causes a link error', 'Combining pieces into a program'],
    ]);
    Object.assign(b, {
      title: 'Send a Signal', zone: 'Control Tower',
      sceneIdle: 'The control screen is off. An executable must be built before cout can display output.',
      goal: 'Fill in the blanks to display READY on the control screen.',
      done: 'Display READY to complete the mission, then send GO to apply what you learned.',
      reuse: 'To display something, use cout << inside main and end each statement with a semicolon.',
    });
    b.reward.name = 'Signal Beacon';
    b.variants[0].label = 'Basic: READY';
    b.variants[1].label = 'Apply: GO';
    b.variants.forEach(v => { if (v.tests) v.tests[0].label = v.label; });
    b.variants[0].blanks.end[2].label = '(empty)';
    b.variants[1].blanks.ns[1].label = '(empty)';
    b.hints = [
      'First check the error type (compile or link) and line number in the result. A blank on that line is the cause.',
      'A program starts in a function named exactly main (names are case-sensitive). Use cout << for output and end statements with ;. Without std::, use using namespace std;.',
      'The first blank is main. The output arrow << points toward cout (the screen).',
      'Basic: int main() { std::cout << "READY\\n"; return 0; }  Apply: add using namespace std; and use cout << "GO\\n";',
    ];
    translateTools(b.tools, [
      ['int main() { … }', 'Program', 'None', 'Program entry point', 'Statements inside run from top to bottom', 'Every C++ program needs one'],
      ['std::cout << value', 'Screen (standard output)', 'Value to print', 'Text appears on screen', 'Variables do not change', 'Showing a result to a person'],
      ['using namespace std;', 'Compiler', 'None', 'Use cout, cin and endl without std::', 'No runtime values change', 'Avoiding repeated std:: prefixes'],
      ['"…\\n"', 'String', '\\n (escape sequence)', 'One newline character', 'None', 'Starting a new line after output'],
    ]);
    Object.assign(c, {
      title: 'Share the Power', zone: 'Power Plant',
      sceneIdle: 'The distributor is broken. Running the code puts power into the robot battery (share); generator power (total) and robot count (robots) are only read.',
      goal: 'Divide generator power total equally among robots and calculate each robot’s share.',
      done: 'Get share = 2.5 for generator 5 and 2 robots, then check other values to apply what you learned.',
      reuse: 'For a fractional result from integers, make one operand double before dividing and store the result in a double.',
    });
    c.reward.name = 'Distribution Gear';
    c.predict.intro = 'Before fixing the distributor, predict how it calculates.';
    c.predict.questions[0].label = 'Output of 5 / 2';
    c.predict.questions[1].label = 'Output of 5 / 2.0';
    const cv = c.variants[0];
    cv.label = 'Power distributor';
    cv.template = cv.template.replace('// 발전기 출력', '// generator output').replace('// 로봇 수', '// robot count');
    cv.blanks.type[0].why = 'If share is int, storing 2.5 discards the fractional part.';
    cv.blanks.expr[0].why = 'int / int uses integer division, which discards the fractional part during division.';
    cv.blanks.expr[1].why = '2.0 is a fixed number, not the robot count. This only works for two robots.';
    cv.blanks.expr[2].why = 'The expression is evaluated left to right. Integer division happens before multiplication by 1.0.';
    cv.tests.forEach((test) => { test.label = `Generator ${test.params.total} · robots ${test.params.robots}`; });
    c.hints = [
      'Check the type and value of share in the variable table. Generator 5 and 2 robots should give 2.5.',
      'Integer / integer discards the fractional part. If either operand is double, division is floating-point. Evaluate left to right.',
      'The type of share must be double. Multiply by 1.0 before dividing to make an operand double.',
      'double share = 1.0 * total / robots;  (total * 1.0 / robots also works.) total / 2.0 fails for 4 robots; total / robots * 1.0 multiplies after integer division.',
    ];
    translateTools(c.tools, [
      ['int', 'Integer variable', 'Integer value', 'Stores a whole number', 'Discard the fractional part when storing a double', 'Counts and other whole-number values'],
      ['double', 'Floating-point variable', 'Floating-point value', 'Stores a value with a fractional part', 'None', 'Quotients and ratios needing fractions'],
      ['a / b', 'Two values', 'a, b', 'Integer quotient if both are int; floating-point if either is double', 'Variables do not change unless assigned with =', 'Division: consider the result type first'],
    ]);
    Object.assign(d, {
      title: 'Power Up the Base', zone: 'Main Base',
      sceneIdle: 'The base is off. cin must read the terminal value into the battery (energy), then subtract base usage before the lights come on.',
      goal: 'Read power with cin, subtract 35 for base usage, and print the remainder with cout. Fix the errors too.',
      done: 'Print 65 for input 100 to complete the mission, then check other inputs to apply what you learned.',
      reuse: 'Read values that change each run into a variable with cin >>, then show the calculated value with cout <<.',
      fixMark: 'fix this line',
    });
    d.reward.name = 'Power Cell';
    d.predict.intro = 'Before fixing the code, predict the target value.';
    d.predict.questions[0].label = 'If the base uses 35 power, how much remains when the input is 100?';
    const comments = (source) => source.replace(/기지 가동에 드는 전력/g, 'power used by the base')
      .replace(/게이지에 연결된 변수/g, 'variable connected to the gauge')
      .replace(/수정할 코드/g, 'fix this line')
      .replace(/여기에 남은 전력 energy 를 출력하는 문장을 쓰세요/g, 'print the remaining energy here');
    d.starter = comments(d.starter);
    d.reference = comments(d.reference);
    d.tests.forEach((test) => { test.label = `Input ${test.input}`; });
    d.hints = [
      'First fix the error at the reported line. Once errors are gone, check whether a number appears in the output.',
      'cin >> variable sends input into a variable; cout << value sends a value to the screen. Arrows show data flow (lecture p.8). End statements with ;.',
      'On line 8 use cin >> energy; add ; at the end of line 9. On line 10 add a statement starting with cout << energy.',
      'cin >> energy;\nenergy = energy - usage;\ncout << "LEFT: " << energy << \'\\n\';\nThe output format is up to you. The last number printed is graded.',
    ];
    translateTools(d.tools, [
      ['cin >> variable', 'Keyboard (standard input)', 'Value in the input box', 'Stores the input in a variable', 'The variable changes', 'Reading a different value each run'],
      ['variable = expression;', 'Variable on the left', 'Value of the expression on the right', 'Stores a new value in the variable', 'Only the left variable changes', 'Keeping a calculated result'],
      ['cout << value', 'Screen (standard output)', 'Value to print', 'Displays the value', 'Variables do not change', 'Showing a result'],
    ]);
    return missions;
  }
  const missionCache = { ko: MISSIONS };
  function getMissions(value) {
    if (value !== 'en') return MISSIONS;
    if (!missionCache.en) missionCache.en = englishMissions();
    return missionCache.en;
  }
  const EN_CHAPTERS = CHAPTERS.map((chapter, i) => Object.assign({}, chapter, {
    zone: ['Starting Base', 'Doors and Routes', 'Command Workshop', 'Parts Warehouse', 'Wiring Room', 'Robot Assembly', 'Specialist Training', 'Resource Center', 'General Workshop', 'Control Center'][i],
    action: ['Calculate input power to start the base', 'Automate movement and charging with conditions and loops', 'Make functions for repeated work and modify original values', 'Process arrays and decode text signals', 'Connect addresses and manipulate pointed-to values', 'Combine state and behavior to create robots', 'Assign roles using inheritance, composition and polymorphism', 'Manage object lifetimes and dynamic memory', 'Use templates, STL and operator overloading', 'Connect file storage, input and exception handling'][i],
  }));
  const EN_ERROR_TYPES = {
    order: 'Build order', semicolon: 'Statement ending (;)', name: 'Names and capitalization',
    direction: 'Input/output direction (<< >>)', namespace: 'std namespace', intDivision: 'Integer division',
    conversion: 'double to int conversion', evalOrder: 'Evaluation order', hardcode: 'Hard-coded input',
    noOutput: 'Missing output', input: 'Input value', uninit: 'Use before initialization', syntax: 'Other syntax',
  };
  const EN_ERROR_LABEL = { compile: 'Compile error', link: 'Link error', runtime: 'Runtime problem', ub: 'Runtime problem', input: 'Runtime problem (input)', unsupported: 'Not supported by simulator' };
  function getChapters(value) { return value === 'en' ? EN_CHAPTERS : CHAPTERS; }
  function getErrorTypes(value) { return value === 'en' ? EN_ERROR_TYPES : ERROR_TYPES; }
  function getErrorLabels(value) { return value === 'en' ? EN_ERROR_LABEL : ERROR_LABEL; }
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  function pair(a, b) {
    if (typeof a === 'string' && typeof b === 'string') return a === b ? a : { ko: a, en: b };
    if (Array.isArray(a)) return a.map((v, i) => pair(v, b[i]));
    if (a && typeof a === 'object') return Object.fromEntries(Object.keys(a).map(k => [k, pair(a[k], b[k])]));
    return a;
  }
  m11.apply = 'quiz'; m11.check = (placed) => checkOrder(placed);
  m12.apply = 'variant';
  m12.variants.forEach(v => { v.tests = [{ label: v.label }]; v.check = (result) => checkSignal(v, result); });
  m13.variants[0].check = (result, test) => checkShare(test, result);
  m13.predict.explanation = { ko: '5와 2는 모두 정수이므로 5 / 2는 소수점을 버려 2가 됩니다. 5 / 2.0은 2.5입니다(강의 p.6).', en: 'Both 5 and 2 are integers, so 5 / 2 discards the fractional part and becomes 2. 5 / 2.0 is 2.5 (lecture p.6).' };
  m14.predict.summary = true;
  m14.check = (result, test) => checkBase(test, result);
  for (const m of MISSIONS) m.scene = { custom: true };
  const localized = englishMissions();
  M.registerChapter({ no: 1, zone: { ko: '시작 기지', en: 'Starting Base' }, missions: MISSIONS.map((m, i) => pair(m, localized[i])) });
  Object.assign(M, { checkOrder, checkSignal, checkShare, checkBase, expectedLeft });
  M._setChapter1Lang = setLang;
})(this);
