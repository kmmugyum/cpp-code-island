/* Chapter registry and language-independent grading helpers. */
(function (global) {
  'use strict';
  const Sim = typeof module === 'object' && module.exports ? require('./cppsim.js') : global.CppSim;
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

  const chapters = new Map();
  const cache = new Map();
  let lang = 'ko';
  function resolve(value, language) {
    if (Array.isArray(value)) return value.map(v => resolve(v, language));
    if (value && typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'ko') && Object.prototype.hasOwnProperty.call(value, 'en')) return resolve(value[language], language);
      return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, resolve(v, language)]));
    }
    return value;
  }
  function registerChapter(def) { chapters.set(def.no, def); cache.clear(); }
  function getMissions(language = lang) {
    language = language === 'en' ? 'en' : 'ko';
    if (!cache.has(language)) cache.set(language, [...chapters.values()].sort((a,b) => a.no-b.no).flatMap(c => resolve(c.missions || [], language)));
    return cache.get(language);
  }
  function getChapters(language = lang) {
    return (language === 'en' ? EN_CHAPTERS : CHAPTERS).map(c => ({ ...c, zone: chapters.has(c.no) && chapters.get(c.no).zone ? resolve(chapters.get(c.no).zone, language) : c.zone, playable: !!chapters.get(c.no)?.missions?.length }));
  }
  function getErrorTypes(language = lang) {
    return Object.assign({}, language === 'en' ? EN_ERROR_TYPES : ERROR_TYPES, ...[...chapters.values()].map(c => resolve(c.errorTypes || {}, language)));
  }
  function getErrorLabels(language = lang) { return language === 'en' ? EN_ERROR_LABEL : ERROR_LABEL; }
  const coreClassify = classifySimError;
  classifySimError = function(error) { for (const c of chapters.values()) if (c.codeErrorTypes && c.codeErrorTypes[error.code]) return c.codeErrorTypes[error.code]; return coreClassify(error); };
  function setLang(value) { lang = value === 'en' ? 'en' : 'ko'; if (api._setChapter1Lang) api._setChapter1Lang(lang); }
  function buildBlankSource(variant, choices, params) {
    const values = {};
    for (const key of Object.keys(variant.blanks)) { const i = choices[key]; values[key] = i == null ? `{${key}}` : variant.blanks[key][i].code; }
    return fillTemplate(fillTemplate(variant.template, values), params || {});
  }
  function blanksFilled(variant, choices) { return Object.keys(variant.blanks).every(k => choices[k] != null); }
  function diagnoseApply(failures) { return failures.length && failures.every(f => f.got !== undefined && f.got === failures[0].got) ? 'hardcode' : null; }
  const h = {
    get lang() { return lang; }, t: (ko,en) => lang === 'en' ? en : ko,
    simFailure(result) { const e = result.error; return { pass:false, kind:e.kind, line:e.line, errorType:classifySimError(e), message: lang === 'en' ? `Line ${e.line} — ${e.message}` : `${e.line}번 줄 — ${e.message}` }; },
    numbersIn, lastNumber(text) { const n = numbersIn(text); return n[n.length - 1]; },
    lines: text => text.split(/\r?\n/).filter(Boolean), formatDouble: Sim.formatDouble,
    cell(result, path) {
      function find(c) { if (c.path === path || (!c.path && c.name === path)) return c; for (const child of [...(c.elems || []), ...(c.fields || [])]) { const v = find(child); if (v) return v; } return null; }
      const steps = result.steps || [];
      for (let i = steps.length - 1; i >= 0; i--) {
        const mem = steps[i].mem;
        for (const c of [...(mem?.frames || []).flatMap(f => f.vars || []), ...(mem?.globals || []), ...(mem?.heap || []).map(b => b.cell).filter(Boolean)]) { const v = find(c); if (v) return v; }
      }
      for (const c of result.vars || []) { const v = find(c); if (v) return v; }
      return null;
    }, steps: result => result.steps || [],
  };
  function loadAllChapters() { if (typeof module !== 'object' || !module.exports) return; for (let i=1; i<=10; i++) { const name = `./missions/ch${String(i).padStart(2,'0')}.js`; try { require.resolve(name); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') continue; throw e; } require(name); } }
  const api = { registerChapter, getMissions, getChapters, getErrorTypes, getErrorLabels, classifySimError, h, buildBlankSource, blanksFilled, fillTemplate, numbersIn, diagnoseApply, setLang, loadAllChapters, CHAPTERS, ERROR_TYPES, ERROR_LABEL };
  Object.defineProperty(api, 'MISSIONS', { get: () => getMissions(lang) });
  if (typeof module === 'object' && module.exports) module.exports = api; else global.Missions = api;
})(this);
