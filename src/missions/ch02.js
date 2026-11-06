(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const zone = t('자동문과 운송로', 'Automatic Doors and Routes');
  const wrong = (code, ko, en, errorType) => ({ code, why: t(ko, en), errorType });
  const sample = (input, expected) => ({ label: t(`입력 ${input}`, `Input ${input}`), input: String(input), params: { expected } });
  const card = (name, target, input, result, change, when) => ({ name, target, input, result, change, when });
  function grade(path, r, test, h) {
    if (!r.ok) return h.simFailure(r);
    const cell = h.cell(r, path);
    const got = cell ? Number(cell.value ?? cell.shown) : undefined;
    const expected = test.params.expected;
    const pass = got === expected;
    return { pass, kind: 'logic', expected, got, message: h.t(
      `입력 ${test.input}: ${path} 값은 ${got ?? '확인할 수 없음'}이고 목표는 ${expected}입니다.`,
      `Input ${test.input}: ${path} is ${got ?? 'unavailable'}; the goal is ${expected}.`
    ) };
  }
  // 코드 문자열은 한 벌로 쓰고, 한국어 화면에서는 주석만 한국어로 바꾼다(코드와 줄 번호는 같다)
  const KO_COMMENTS = {
    'door state': '문 상태',
    'selected destination': '선택한 목적지',
    'charge per iteration': '한 번 반복할 때 충전량',
    'connected segments': '연결한 구간 수',
  };
  function koComments(def) {
    const swap = (src) => (typeof src === 'string'
      ? { en: src, ko: src.replace(/\/\/ ?([^\n]+)/g, (m, c) => (KO_COMMENTS[c.trim()] ? `// ${KO_COMMENTS[c.trim()]}` : m)) }
      : src);
    for (const m of def.missions) {
      for (const v of m.variants || []) v.template = swap(v.template);
      if (m.starter) m.starter = swap(m.starter);
      if (m.reference) m.reference = swap(m.reference);
      if (m.predict && m.predict.program) m.predict.program = swap(m.predict.program);
    }
    return def;
  }
  M.registerChapter(koComments({
    no: 2, zone,
    errorTypes: {
      boundary: t('조건 경계', 'Condition boundary'),
      fallthrough: t('case 이어 실행', 'Case fall-through'),
      loopCount: t('반복 횟수', 'Iteration count'),
      chargeStep: t('충전 단위', 'Charge increment'),
    },
    missions: [
      {
        id: '2-1', title: t('전력 검사문', 'Power Check Door'), zone,
        sceneIdle: t('닫힌 문과 전력 표시가 보입니다. 실행하면 energy와 open에 따라 문이 반응합니다.', 'A closed door and power display await. The door reacts to energy and open when you run.'),
        reward: { item: 'door', name: t('전력 검사문 열쇠', 'Power-door key') },
        goal: t('전력이 50 이상이면 문을 열고 49에서는 닫으세요.', 'Open the door at power 50 or higher and keep it closed at 49.'),
        done: t('50에서 문이 열리면 완료, 49와 51에서도 맞으면 적용 확인입니다.', 'Opening at 50 completes the mission; 49 and 51 check the rule.'),
        reuse: t('최솟값을 포함하는 입장 조건을 만들 때 경계값을 함께 검사합니다.', 'Include and test the boundary when setting a minimum entry requirement.'),
        lecture: { pages: t('Lecture 2, p.1, 3', 'Lecture 2, pp. 1, 3'), quotes: ['>= Greater than or equal to', 'If the condition is met, the block corresponding to the if is executed. Otherwise, the block corresponding to the else is executed.'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('기본: 전력 검사', 'Base: power check'),
          template: [
            '#include <iostream>', 'using namespace std;', '', 'int main() {',
            '    int energy;', '    cin >> energy;', '    bool open = false; // door state',
            '    if (energy {op} 50) {', '        open = {yes};', '    } else {',
            '        open = false;', '    }', '    cout << open;', '    return 0;', '}'
          ].join('\n'),
          blanks: { op: [{ code: '>=' }, wrong('>', '50을 제외하면 기준과 같은 전력에서 문이 닫힙니다.', 'Greater than excludes the threshold of 50.', 'boundary'), wrong('<=', '50 이하가 아니라 50 이상에서 열어야 합니다.', 'The door needs power at least 50, not at most 50.', 'boundary')],
            yes: [{ code: 'true' }, wrong('false', '조건이 참이어도 false를 대입하면 문은 닫힙니다.', 'Assigning false keeps the door closed even when the condition is true.', 'boundary')] },
          tests: [sample(50, 1), sample(49, 0), sample(51, 1)], check: (r, s, h) => grade('open', r, s, h)
        }], apply: 'tests',
        hints: [t('8줄의 energy와 50을 비교하세요.', 'Compare energy with 50 on line 8.'), t('이상은 기준과 같은 값도 포함합니다.', 'At least includes the threshold itself.'), t('8줄에는 >=, 9줄에는 열린 상태를 넣습니다.', 'Use >= on line 8 and the open state on line 9.'), t('8줄의 energy >= 50이 참이면 9줄에서 open을 true로 바꾸고, 아니면 11줄에서 false로 둡니다.', 'On line 8, energy >= 50 selects line 9, setting open to true; otherwise line 11 sets it to false.')],
        tools: [card('>=', t('energy와 기준', 'energy and threshold'), t('두 수 50과 50', 'Two numbers, 50 and 50'), t('true', 'true'), t('비교 자체는 변수를 바꾸지 않습니다.', 'The comparison itself changes no variable.'), t('기준 이상인지 판단할 때', 'When checking a minimum')), card('if / else', t('문 상태', 'Door state'), t('비교 결과', 'Comparison result'), t('두 블록 중 하나 실행', 'One of two blocks runs'), t('선택한 대입이 open을 바꿉니다.', 'The selected assignment changes open.'), t('열림과 닫힘을 나눌 때', 'When choosing open or closed'))],
        scene: { theme: 'flow', widgets: [
          { type: 'zone', kind: 'rails', x: 12, y: 56, w: 136, h: 8 },
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 35], [46, 35]], on: ['energy'] }, { type: 'wire', pts: [[64, 35], [74, 35], [74, 21], [84, 21]], on: ['energy', 'open'] }, { type: 'wire', pts: [[100, 21], [108, 21], [108, 36], [118, 36]], on: ['open'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'value', path: 'energy', x: 46, y: 28, icon: 'cell' }, { type: 'door', path: 'open', x: 84, y: 10 },
          { type: 'facility', kind: 'gate', x: 118, y: 26, label: t('자동문', 'Auto gate') },
          { type: 'monitor', x: 12, y: 66, w: 70, h: 20 }, { type: 'prop', kind: 'crates', x: 124, y: 68 },
        ] }
      },
      {
        id: '2-2', title: t('노선 선택', 'Route Selection'), zone,
        sceneIdle: t('노선 선택기와 목적지 표시가 대기합니다. case가 실행될 때 destination이 바뀝니다.', 'The route selector and destination display are waiting. Each executed case changes destination.'),
        reward: { item: 'lever', name: t('노선 전환 레버', 'Route switch lever') },
        goal: t('1번은 10, 2번은 20, 다른 번호는 30으로 목적지를 정하세요.', 'Send route 1 to 10, route 2 to 20, and other numbers to 30.'),
        done: t('1번이 10이면 완료, 2번과 다른 번호도 맞으면 적용 확인입니다.', 'Route 1 reaching 10 completes the mission; route 2 and the default check the rule.'),
        reuse: t('고정된 번호별 작업을 고를 때 case 끝에서 이어 실행할지 결정합니다.', 'When selecting by fixed number, decide whether each case should fall through.'),
        lecture: { pages: t('Lecture 2, p.4~5', 'Lecture 2, pp. 4–5'), quotes: ['The switch evaluates expression and, if expression is equal to constant1, then the statements beneath case constant 1: are executed until a break is encountered.'] },
        predict: { intro: t('먼저 break가 빠진 예제를 살펴보세요. 1번을 선택하면 최종 목적지는 무엇일까요?', 'First inspect the example without break. What is the final destination for route 1?'),
          program: ['#include <iostream>', 'using namespace std;', 'int main() {', '    int route = 1;', '    int destination = 0;', '    switch (route) {', '    case 1: destination = 10;', '    case 2: destination = 20; break;', '    default: destination = 30;', '    }', '    cout << destination;', '    return 0;', '}'].join('\n'),
          questions: [{ label: t('최종 destination은?', 'What is the final destination?'), number: true }], answersFrom: r => [String(M.numbersIn(r.output)[0])] },
        kind: 'blanks', variants: [{ id: 'base', label: t('기본: 노선 선택', 'Base: route selection'),
          template: ['#include <iostream>', 'using namespace std;', '', 'int main() {', '    int route;', '    cin >> route;', '    int destination = 0; // selected destination', '    switch (route) {', '    case 1:', '        destination = 10;', '        {stop1}', '    case 2:', '        destination = 20;', '        {stop2}', '    default:', '        destination = 30;', '    }', '    cout << destination;', '    return 0;', '}'].join('\n'),
          blanks: { stop1: [{ code: 'break;' }, wrong(';', '1번 뒤에 break가 없으면 2번도 실행되어 20으로 바뀝니다.', 'Without break after case 1, case 2 also runs and changes the destination to 20.', 'fallthrough')], stop2: [{ code: 'break;' }, wrong(';', '2번 뒤에 break가 없으면 default도 실행되어 30으로 바뀝니다.', 'Without break after case 2, default also runs and changes the destination to 30.', 'fallthrough')] },
          tests: [sample(1, 10), sample(2, 20), sample(9, 30)], check: (r, s, h) => grade('destination', r, s, h)
        }], apply: 'tests',
        hints: [t('10~14줄에서 목적지를 대입한 뒤 어디로 가는지 보세요.', 'Inspect where execution goes after assignments on lines 10–14.'), t('case 이름은 자동으로 실행을 멈추지 않습니다.', 'A case label does not automatically stop execution.'), t('11줄과 14줄에 switch를 벗어나는 문장을 넣으세요.', 'Put a statement that exits the switch on lines 11 and 14.'), t('11줄과 14줄의 break;가 다음 case나 default로 이어지는 것을 막습니다.', 'The break; on lines 11 and 14 prevents falling through to the next case or default.')],
        tools: [card('switch / case', t('route', 'route'), t('정수 노선 번호', 'An integer route number'), t('일치하는 case에서 실행 시작', 'Execution starts at the matching case'), t('case 안 대입이 destination을 바꿉니다.', 'Assignments in a case change destination.'), t('정해진 번호로 분기할 때', 'When branching on fixed numbers')), card('break', t('가장 안쪽 switch', 'The innermost switch'), t('실행 중인 case', 'The running case'), t('switch를 빠져나감', 'Exits the switch'), t('직접 값을 바꾸지는 않습니다.', 'It does not itself change a value.'), t('다음 case 실행을 막을 때', 'When preventing fall-through'))],
        scene: { theme: 'flow', widgets: [
          { type: 'zone', kind: 'rails', x: 12, y: 56, w: 136, h: 8 },
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 35], [46, 35]], on: ['route'] }, { type: 'wire', pts: [[64, 35], [74, 35], [74, 20], [84, 20]], on: ['route', 'destination'] }, { type: 'wire', pts: [[100, 20], [108, 20], [108, 35], [118, 35]], on: ['destination'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'value', path: 'route', x: 46, y: 28, icon: 'map' },
          { type: 'facility', kind: 'machine', x: 84, y: 12, label: t('노선 분기기', 'Route switch') },
          { type: 'value', path: 'destination', x: 118, y: 28, icon: 'flag' },
          { type: 'monitor', x: 12, y: 66, w: 70, h: 20 }, { type: 'prop', kind: 'crates', x: 124, y: 68 },
        ] }
      },
      {
        id: '2-3', title: t('충전 정거장', 'Charging Station'), zone,
        sceneIdle: t('배터리는 입력 전력을 보여 줍니다. 반복할 때 energy가 한 칸씩 늘어납니다.', 'The battery shows the input power. Each loop iteration can increase energy by one.'),
        reward: { item: 'cell', name: t('충전 셀', 'Charging cell') },
        goal: t('전력이 50 미만인 동안 한 칸씩 충전하고 이미 50 이상이면 그대로 두세요.', 'Charge one unit while power is below 50; leave power of 50 or more unchanged.'),
        done: t('48을 50으로 충전하면 완료, 47·50·52도 맞으면 적용 확인입니다.', 'Charging 48 to 50 completes the mission; 47, 50 and 52 check the rule.'),
        reuse: t('작업 전 조건이 이미 거짓일 수 있다면 while로 먼저 검사합니다.', 'Use while to check first when the work may already be unnecessary.'),
        lecture: { pages: t('Lecture 2, p.5~6', 'Lecture 2, pp. 5–6'), quotes: ['As long as condition holds, the block of statements will be repeatedly executed.', 'The block of statements is executed and then, if the condition holds, the program returns to the top of the block.'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('기본: 충전', 'Base: charge'),
          template: ['#include <iostream>', 'using namespace std;', '', 'int main() {', '    int energy;', '    cin >> energy;', '    int increment = {step}; // charge per iteration', '    {loop}', '    cout << energy;', '    return 0;', '}'].join('\n'),
          blanks: { loop: [{ code: 'while (energy < 50) { energy += increment; }' }, wrong('do { energy += increment; } while (energy < 50);', 'do-while은 먼저 한 번 충전하므로 이미 50인 배터리도 증가합니다.', 'A do-while charges once before checking, even when energy is already 50.', 'loopCount')], step: [{ code: '1' }, wrong('2', '두 칸씩 충전하면 홀수 전력에서 50을 지나칩니다.', 'Charging two units at a time overshoots 50 from odd power.', 'chargeStep')] },
          tests: [sample(48, 50), sample(50, 50), sample(52, 52), sample(47, 50)], check: (r, s, h) => grade('energy', r, s, h)
        }], apply: 'tests',
        hints: [t('8줄의 본문 실행 전후에 조건을 검사하는 순서를 보세요.', 'Inspect when the condition is checked relative to the body on line 8.'), t('while은 처음부터 거짓이면 0번, do-while은 적어도 1번 실행합니다.', 'while can run zero times; do-while runs at least once.'), t('7줄에서 충전량을 1로 정하고 8줄에서 energy < 50을 먼저 검사하세요.', 'Set the increment to 1 on line 7 and check energy < 50 first on line 8.'), t('8줄의 while (energy < 50)은 먼저 조건을 검사하고 increment만큼 더합니다. 50 이상에서는 본문을 건너뜁니다.', 'On line 8, while (energy < 50) checks first and adds increment. At 50 or above the body is skipped.')],
        tools: [card('while', t('energy', 'energy'), t('energy < 50', 'energy < 50'), t('참인 동안 충전 본문 반복', 'Repeats the charge body while true'), t('본문의 대입이 energy를 증가시킵니다.', 'The body assignment increases energy.'), t('0번 실행할 수도 있을 때', 'When zero iterations may be needed')), card('do / while', t('반복 본문', 'Loop body'), t('본문 뒤 조건', 'Condition after the body'), t('조건 검사 전에 한 번 실행', 'Runs once before the condition is checked'), t('본문이 실행하면 energy가 바뀝니다.', 'The body changes energy when it runs.'), t('최소 한 번 실행해야 할 때', 'When at least one iteration is required'))],
        scene: { theme: 'flow', widgets: [
          { type: 'zone', kind: 'rails', x: 12, y: 56, w: 136, h: 8 },
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 35], [46, 35]], on: ['energy'] }, { type: 'wire', pts: [[64, 35], [74, 35], [74, 20], [84, 20]], on: ['energy'] }, { type: 'wire', pts: [[108, 20], [112, 20], [112, 36], [118, 36]], on: ['energy'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'value', path: 'energy', x: 46, y: 28, icon: 'cell' },
          { type: 'facility', kind: 'generator', x: 84, y: 10, label: t('충전기', 'Charger') },
          { type: 'robot', battery: { path: 'energy', max: 60 }, x: 118, y: 27 },
          { type: 'monitor', x: 12, y: 66, w: 70, h: 20 }, { type: 'prop', kind: 'crates', x: 124, y: 68 },
        ] }
      },
      {
        id: '2-4', title: t('운송로 연결', 'Connect the Route'), zone,
        sceneIdle: t('비어 있는 운송로와 built 표시가 대기합니다. 반복할 때마다 구간이 하나씩 연결됩니다.', 'An empty conveyor and built counter await. Each iteration connects one segment.'),
        reward: { item: 'rail', name: t('운송로 레일', 'Conveyor rail') },
        goal: t('입력한 개수만큼 운송로 구간을 연결하고 0개 요청도 처리하세요.', 'Connect the requested number of conveyor segments, including a request for zero.'),
        done: t('3개 요청에 3개를 연결하면 완료, 0개와 5개도 맞으면 적용 확인입니다.', 'Building 3 segments completes the mission; 0 and 5 check the rule.'),
        reuse: t('횟수가 정해진 작업은 시작값, 계속할 조건, 증가식을 함께 추적합니다.', 'For a counted task, trace the initializer, continuation condition, and increment together.'),
        lecture: { pages: t('Lecture 2, p.6~7', 'Lecture 2, pp. 6–7'), quotes: ['The for loop is designed to allow a counter variable that is initialized at the beginning of the loop and incremented (or decremented) on each iteration of the loop.'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('기본: 운송로', 'Base: conveyor'),
          template: ['#include <iostream>', 'using namespace std;', '', 'int main() {', '    int count;', '    cin >> count;', '    int built = 0; // connected segments', '    for (int i = {start}; i {op} count; i++) {', '        built++;', '    }', '    cout << built;', '    return 0;', '}'].join('\n'),
          blanks: { start: [{ code: '0' }, wrong('1', '1에서 시작하면 양수 요청에서 첫 반복 한 번이 빠집니다.', 'Starting at 1 skips one iteration for positive requests.', 'loopCount')], op: [{ code: '<' }, wrong('<=', '0부터 count까지 포함하면 요청보다 한 번 더 반복합니다.', 'Including count when starting at zero adds one iteration.', 'loopCount')] },
          tests: [sample(3, 3), sample(0, 0), sample(5, 5)], check: (r, s, h) => grade('built', r, s, h)
        }], apply: 'tests',
        hints: [t('8줄의 시작값, 조건, i++와 9줄의 built를 함께 보세요.', 'Trace the initializer, condition, i++ on line 8 and built on line 9.'), t('0부터 count 미만까지 1씩 늘리면 count번 실행합니다.', 'Starting at zero and increasing by one while below count runs count times.'), t('8줄에서 i를 0으로 시작하고 i < count를 검사하세요.', 'On line 8, start i at 0 and check i < count.'), t('8줄에서 i는 0부터 count - 1까지이고 매번 i++로 증가합니다. 9줄은 정확히 count번 실행됩니다.', 'On line 8, i runs from 0 through count - 1, increasing with i++; line 9 executes exactly count times.')],
        tools: [card('for (init; condition; increment)', t('반복 카운터 i', 'Loop counter i'), t('0, i < count, i++', '0, i < count, i++'), t('조건이 참인 동안 본문 실행', 'Runs the body while the condition is true'), t('매 반복 후 i가 증가합니다.', 'i increases after each iteration.'), t('횟수가 정해진 작업에', 'For a fixed-count task')), card('built++', t('연결된 구간 수 built', 'Segment count built'), t('현재 built', 'Current built'), t('built를 1 증가', 'Increases built by one'), t('매 본문 실행마다 built가 바뀝니다.', 'built changes each time the body runs.'), t('실제 작업 횟수를 셀 때', 'When counting completed work'))],
        scene: { theme: 'flow', widgets: [
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 35], [46, 35]], on: ['count'] }, { type: 'wire', pts: [[64, 35], [70, 35], [70, 44]], on: ['count', 'built'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'value', path: 'count', x: 46, y: 28, icon: 'loop' },
          { type: 'conveyor', path: 'built', x: 68, y: 38, length: 56 },
          { type: 'facility', kind: 'machine', x: 128, y: 36, label: t('운송 기계', 'Route machine') },
          { type: 'monitor', x: 12, y: 66, w: 70, h: 20 }, { type: 'prop', kind: 'crates', x: 100, y: 68 },
        ] }
      }
    ]
  }));
})(this);
