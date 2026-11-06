(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const zone = t('명령 제작소', 'Command Workshop');
  const option = (code, ko, en, errorType) => errorType ? { code, why: t(ko, en), errorType } : { code };
  const sample = (input, params) => ({ label: t(`입력 ${input}`, `Input ${input}`), input, params });
  const cell = (h, r, path) => { const c = h.cell(r, path); return c ? Number(c.value === undefined ? c.shown : c.value) : NaN; };
  const tool = (name, ko, en) => ({ name, target: t(ko[0], en[0]), input: t(ko[1], en[1]), result: t(ko[2], en[2]), change: t(ko[3], en[3]), when: t(ko[4], en[4]) });
  const code = (lines, ko, en) => t(lines.map(s => s.replace('$comment', ko)).join('\n'), lines.map(s => s.replace('$comment', en)).join('\n'));
  const check = (paths, expected, type) => (r, test, h) => {
    if (!r.ok) return h.simFailure(r);
    const want = expected(test.params);
    const got = paths.map(p => cell(h, r, p));
    const output = h.numbersIn(r.output);
    const pass = got.every((v, i) => v === want[i]) && output.length === want.length && output.every((v, i) => v === want[i]);
    const actual = paths.map((p, i) => `${p}=${Number.isNaN(got[i]) ? '?' : got[i]}`).join(', ');
    const goal = paths.map((p, i) => `${p}=${want[i]}`).join(', ');
    return { pass, kind: 'logic', errorType: pass ? undefined : type, expected: goal, got: `${actual}; output=${r.output}`, message: h.t(`입력 ${test.input}: ${actual}, 출력은 ${r.output || '(없음)'}입니다. 목표는 ${goal}을 차례로 출력하는 것입니다.`, `Input ${test.input}: ${actual}, output ${r.output || '(none)'}. The goal is to print ${goal} in order.`) };
  };
  const predictProgram = [
    '#include <iostream>',
    'using namespace std;',
    'void charge(int energy) {',
    '    energy += 20;',
    '    cout << energy << " ";',
    '}',
    'int main() {',
    '    int energy = 30;',
    '    charge(energy);',
    '    cout << energy;',
    '    return 0;',
    '}'
  ].join('\n');
  M.registerChapter({
    no: 3, zone,
    errorTypes: {
      functionRule: t('함수 계산과 인자', 'Function calculation and arguments'),
      returnValue: t('반환과 출력', 'Return versus output'),
      prototype: t('함수 선언과 정의', 'Declaration and definition'),
      localScope: t('지역 변수 범위', 'Local scope'),
      valueReference: t('값과 참조 전달', 'Value versus reference')
    },
    codeErrorTypes: { undeclaredFunction: 'prototype', undefinedFunction: 'prototype' },
    missions: [
      {
        id: '3-1', title: t('명령 추출', 'Extract a Command'), zone,
        sceneIdle: t('두 수리 비용 칸과 작업대가 비어 있습니다. 호출할 때마다 같은 함수가 각 부품 수를 계산합니다.', 'Two repair-cost cells and the workshop wait. Each call applies the same function to its own parts count.'),
        reward: { item: 'wrench', name: t('공통 수리 렌치', 'Reusable repair wrench') },
        goal: t('부품 3개와 5개의 수리 비용을 각각 두 배로 계산하는 repairCost를 완성하세요.', 'Complete repairCost to calculate twice the cost for 3 and 5 parts.'),
        done: t('3과 5에서 6과 10을 얻으면 완료입니다. 1과 8, 0과 4에서도 각각 계산하면 적용 완료입니다.', 'Get 6 and 10 for 3 and 5 to complete the mission; calculate correctly for 1 and 8, then 0 and 4, to apply it.'),
        reuse: t('여러 곳에서 같은 규칙을 다른 인자에 적용할 때 계산을 함수로 묶습니다.', 'Extract a function when several calls apply the same rule to different arguments.'),
        lecture: { pages: t('Lecture 3, p.3~8, 11', 'Lecture 3, pp. 3–8, 11'), quotes: ['Maintainability: To change the algorithm, just change the function (vs changing it everywhere you ever used it)', 'Argument order matters:'] },
        kind: 'blanks', apply: 'tests',
        variants: [{ id: 'base', label: t('두 수리 비용', 'Two repair costs'),
          template: code([
            '#include <iostream>', 'using namespace std;', '', 'int repairCost(int parts) {', '    // $comment', '    return {calc};', '}', '', 'int main() {', '    int a;', '    int b;', '    cin >> a >> b;', '    int first = repairCost(a);', '    int second = repairCost({argument});', '    cout << first << " " << second;', '    return 0;', '}'
          ], '부품 수마다 같은 비용 규칙', 'The same cost rule for each parts count'),
          blanks: {
            calc: [option('parts * 2'), option('parts + 2', '두 배가 아니라 2를 더합니다.', 'This adds 2 instead of doubling.', 'functionRule'), option('6', '첫 입력에만 맞는 상수로 인자를 무시합니다.', 'This constant only fits the first input and ignores the argument.', 'functionRule')],
            argument: [option('b'), option('a', '두 번째 호출에도 첫 부품 수를 사용합니다.', 'The second call reuses the first parts count.', 'functionRule')]
          },
          tests: [sample('3 5', { a: 3, b: 5 }), sample('1 8', { a: 1, b: 8 }), sample('0 4', { a: 0, b: 4 })],
          check: check(['first', 'second'], p => [p.a * 2, p.b * 2], 'functionRule')
        }],
        hints: [t('6줄의 계산과 13~14줄의 호출을 보세요.', 'Inspect the calculation on line 6 and calls on lines 13–14.'), t('매개변수 parts는 호출할 때 전달한 각 부품 수를 받습니다.', 'The parameter parts receives the count supplied by each call.'), t('6줄에서 parts * 2를 반환하고 14줄에는 b를 전달하세요.', 'Return parts * 2 on line 6 and pass b on line 14.'), t('같은 repairCost를 a와 b에 호출하므로 규칙은 한 곳에 있고 결과는 각각 다릅니다.', 'Both calls reuse repairCost; the rule is in one place, but each argument has its own result.')],
        tools: [tool('repairCost(parts)', ['수리 비용 함수', '부품 수', '두 배의 비용', '호출자 변수는 바뀌지 않음', '같은 비용 규칙을 재사용할 때'], ['Repair cost function', 'Parts count', 'Twice the count', 'Caller variables do not change', 'Reusing the cost rule']), tool('return', ['repairCost 호출자', '계산한 비용', '호출식의 값', 'first 또는 second에 저장', '계산 결과를 돌려줄 때'], ['The repairCost caller', 'Calculated cost', 'Value of the call expression', 'Stored in first or second', 'Returning a calculation'])],
        scene: { theme: 'functions', widgets: [
          { type: 'stack', x: 10, y: 10, w: 76, h: 48 }, { type: 'value', x: 100, y: 12, path: 'first', icon: 'gear' }, { type: 'value', x: 100, y: 34, path: 'second', icon: 'gear' },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', x: 116, y: 56, kind: 'workshop', label: t('수리 공방', 'Repair shop') },
        ] }
      },
      {
        id: '3-2', title: t('결과 전달', 'Return the Result'), zone,
        sceneIdle: t('예산과 잔액 칸이 보입니다. cost의 반환값을 빼면 잔액이 바뀌고 화면에 표시됩니다.', 'The budget and remaining balance cells are visible. Subtract the value returned by cost to update and display the balance.'),
        reward: { item: 'toolbox', name: t('잔액 도구함', 'Balance toolbox') },
        goal: t('부품 4개의 비용 8을 반환해 예산 30에서 빼고 잔액 22를 출력하세요.', 'Return cost 8 for 4 parts, subtract it from budget 30, and print the remaining 22.'),
        done: t('부품 4개에서 잔액 22면 완료입니다. 7개와 0개에서도 잔액이 맞으면 적용 완료입니다.', 'A balance of 22 for 4 parts completes the mission; correct balances for 7 and 0 parts complete the apply check.'),
        reuse: t('다음 계산에 필요한 값은 출력만 하지 말고 반환해 호출자가 사용하도록 합니다.', 'Return a value rather than only printing it when the caller needs it for another calculation.'),
        lecture: { pages: t('Lecture 3, p.17~20', 'Lecture 3, pp. 17–20'), quotes: ['Up to one value may be returned; it must be the same type as the return type.', 'Function returns as soon as a return statement is executed.'] },
        kind: 'blanks', apply: 'tests',
        variants: [{ id: 'base', label: t('예산에서 빼기', 'Subtract from the budget'),
          template: code(['#include <iostream>', 'using namespace std;', '', 'int cost(int parts) {', '    // $comment', '    {body}', '}', '', 'int main() {', '    int parts;', '    cin >> parts;', '    int budget = 30;', '    int remaining = {use};', '    cout << remaining;', '    return 0;', '}'], '반환값은 호출자의 계산에 쓰입니다', 'The caller uses the returned value'),
          blanks: {
            body: [option('return parts * 2;'), option('cout << parts * 2 << \" \"; return 0;', '출력은 값을 전달하지 않습니다. 이 코드는 비용 대신 0을 반환합니다.', 'Printing does not pass a value back; this returns 0 instead of the cost.', 'returnValue')],
            use: [option('budget - cost(parts)'), option('cost(parts)', '반환된 비용만 저장하고 예산에서 빼지 않았습니다.', 'This stores the cost without subtracting it from the budget.', 'returnValue'), option('budget', '비용을 호출하지 않아 잔액이 예산 그대로입니다.', 'The cost is never called, so the balance stays at the budget.', 'returnValue')]
          },
          tests: [sample('4', { parts: 4 }), sample('7', { parts: 7 }), sample('0', { parts: 0 })],
          check: check(['remaining'], p => [30 - p.parts * 2], 'returnValue')
        }],
        hints: [t('6줄의 함수 본문과 13~14줄의 잔액을 보세요.', 'Inspect the function body on line 6 and balance on lines 13–14.'), t('cout은 화면에 보이게 하고 return은 호출식에 값을 돌려줍니다.', 'cout displays a value; return supplies a value to the call expression.'), t('6줄에 return parts * 2;를 쓰고 13줄에서 budget - cost(parts)를 계산하세요.', 'Use return parts * 2; on line 6 and budget - cost(parts) on line 13.'), t('cost가 8을 반환하면 호출자가 30 - 8을 계산하고 22를 출력합니다.', 'cost returns 8, so the caller calculates 30 - 8 and prints 22.')],
        tools: [tool('return parts * 2', ['cost 호출자', '부품 수로 계산한 비용', '정수 비용', '함수 종료, 호출자에게 값 전달', '호출자가 비용을 계산에 쓸 때'], ['The cost caller', 'Cost calculated from parts', 'Integer cost', 'Ends the function and supplies the value', 'When the caller needs the cost']), tool('cout << remaining', ['출력 화면', '계산된 잔액', '화면에 숫자 표시', 'remaining은 변하지 않음', '계산 결과를 보여 줄 때'], ['Output monitor', 'Calculated balance', 'A number on screen', 'remaining does not change', 'Showing the result'])],
        scene: { theme: 'functions', widgets: [
          { type: 'stack', x: 10, y: 10, w: 76, h: 48 }, { type: 'value', x: 100, y: 12, path: 'budget', icon: 'cell' }, { type: 'value', x: 100, y: 34, path: 'remaining', icon: 'gear' },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', x: 126, y: 60, kind: 'machine', label: t('정산기', 'Cost meter') },
        ] }
      },
      {
        id: '3-3', title: t('호출 연결', 'Connect the Call'), zone,
        sceneIdle: t('호출 스택과 main의 value, result 칸이 보입니다. adjust의 같은 이름 매개변수는 별도 칸입니다.', 'The call stack and main’s value and result cells are visible. adjust has a separate parameter with the same name.'),
        reward: { item: 'blueprint', name: t('호출 연결 설계도', 'Call-link blueprint') },
        goal: t('main보다 앞에 adjust를 선언하고 값 5의 복사본을 2 올려 원본 5와 결과 7을 출력하세요.', 'Declare adjust before main, add 2 to a copy of 5, and print the original 5 and result 7.'),
        done: t('입력 5에서 5와 7을 출력하면 완료입니다. 0과 9에서도 원본과 결과가 맞으면 적용 완료입니다.', 'Print 5 and 7 for input 5 to complete the mission; preserve the original and return the right result for 0 and 9 to apply it.'),
        reuse: t('정의가 호출 뒤에 있을 때 맞는 프로토타입을 먼저 두고 지역 변수의 범위를 구분합니다.', 'Declare a matching prototype before a call when the definition follows it, and distinguish local scopes.'),
        lecture: { pages: t('Lecture 3, p.27~30, 40', 'Lecture 3, pp. 27–30, 40'), quotes: ['Function declarations need to occur before invocations', 'Function prototypes should match the signature of the method, though argument names don’t matter'] },
        kind: 'blanks', apply: 'tests',
        variants: [{ id: 'base', label: t('선언과 지역 변수', 'Declaration and locals'),
          template: code(['#include <iostream>', 'using namespace std;', '', '{declaration}', '', 'int main() {', '    int value;', '    cin >> value;', '    int result = adjust(value);', '    cout << value << " " << result;', '    return 0;', '}', '', 'int adjust(int value) {', '    // $comment', '    value += 2;', '    return {returned};', '}'], '이 value는 main의 value와 별개입니다', 'This value is separate from main’s value'),
          blanks: {
            declaration: [option('int adjust(int value);'), option(' ', '선언 전에 adjust를 호출하면 컴파일할 수 없습니다.', 'Calling adjust before any declaration is a compile error.', 'prototype'), option('int adjust(double value);', 'double을 받는 선언은 뒤의 int 정의와 다른 함수여서 링크되지 않습니다.', 'The double declaration names a different overload from the int definition, leaving the call undefined at link time.', 'prototype')],
            returned: [option('value'), option('value - 2', '함수의 지역 value에서 증가분을 다시 빼므로 원본과 같은 값이 반환됩니다.', 'Subtracting the increment from the local value returns the unchanged input.', 'localScope')]
          },
          tests: [sample('5', { value: 5 }), sample('0', { value: 0 }), sample('9', { value: 9 })],
          check: check(['value', 'result'], p => [p.value, p.value + 2], 'localScope')
        }],
        hints: [t('4줄의 선언, 9줄의 호출, 14~17줄의 정의를 보세요.', 'Inspect the declaration on line 4, call on line 9, and definition on lines 14–17.'), t('호출 전에 선언이 필요하며 매개변수 타입이 정의와 맞아야 합니다.', 'A declaration must precede the call, and its parameter type must match the definition.'), t('4줄에 int adjust(int value);를 두고 17줄에서 value를 반환하세요.', 'Put int adjust(int value); on line 4 and return value on line 17.'), t('adjust의 value는 값 전달로 만든 별도 지역 변수이므로 main의 value는 그대로입니다.', 'adjust receives a separate local value by value, so main’s value stays unchanged.')],
        tools: [tool('int adjust(int value);', ['뒤에 정의할 adjust', '매개변수 타입 int', '호출 전에 알려진 선언', '값 변경 없음', '정의보다 먼저 호출할 때'], ['adjust, defined later', 'Parameter type int', 'Declaration visible before the call', 'No value changes', 'Calling before the definition']), tool('adjust(value)', ['adjust의 지역 value', 'main의 value 복사본', '2 증가한 정수', 'main의 value는 그대로, result에 반환값 저장', '원본을 보존하며 계산할 때'], ['adjust’s local value', 'Copy of main’s value', 'An integer increased by 2', 'main’s value stays unchanged; result stores the return', 'Calculating without changing the original'])],
        scene: { theme: 'functions', widgets: [
          { type: 'stack', x: 10, y: 10, w: 76, h: 48 }, { type: 'value', x: 100, y: 12, path: 'value', icon: 'cell' }, { type: 'value', x: 100, y: 34, path: 'result', icon: 'gear' },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', x: 132, y: 40, kind: 'tower', label: t('호출 안테나', 'Call mast') },
        ] }
      },
      {
        id: '3-4', title: t('진짜 배터리 충전', 'Charge the Real Battery'), zone,
        sceneIdle: t('호출 스택과 원본 energy 배터리가 보입니다. 값 전달은 복사본만, 참조 전달은 원본을 바꿉니다.', 'The call stack and original energy battery are visible. A value parameter changes a copy; a reference changes the original.'),
        reward: { item: 'link', name: t('배터리 참조 연결', 'Battery reference link') },
        goal: t('charge가 호출자의 전력 30을 20 올려 50으로 만들도록 참조를 연결하세요.', 'Connect a reference so charge increases the caller’s energy from 30 by 20 to 50.'),
        done: t('30을 50으로 충전하면 완료입니다. 시작값 10과 60도 각각 30과 80이 되면 적용 완료입니다.', 'Charge 30 to 50 to complete the mission; charge 10 and 60 to 30 and 80 to apply it.'),
        reuse: t('함수가 기존 변수 자체를 수정해야 할 때 참조 매개변수를 사용합니다.', 'Use a reference parameter when a function must modify an existing caller variable.'),
        lecture: { pages: t('Lecture 3, p.48~52', 'Lecture 3, pp. 48–52'), quotes: ['makes a copy of the variable; changes to the variable within the function don’t occur outside the function', 'If you want to modify the original variable as opposed to making a copy, pass the variable by reference'] },
        predict: {
          intro: t('수정 전 값 전달 예제입니다. 함수 안의 복사본과 호출 후 원본의 출력값을 각각 예상하세요.', 'This is the original pass-by-value example. Predict the printed copy inside the function and the original after the call.'),
          program: predictProgram,
          questions: [{ label: t('함수 안의 복사본', 'Copy inside the function'), number: true }, { label: t('호출 후 원본', 'Original after the call'), number: true }],
          answersFrom: r => (r.output.match(/-?\d+/g) || []).slice(0, 2)
        },
        kind: 'blanks', apply: 'tests',
        variants: [{ id: 'base', label: t('원본 충전', 'Charge the original'),
          template: code(['#include <iostream>', 'using namespace std;', '', 'void charge({param}) {', '    // $comment', '    energy += {amount};', '}', '', 'int main() {', '    int energy;', '    cin >> energy;', '    charge(energy);', '    cout << energy;', '    return 0;', '}'], '참조라면 호출자의 배터리가 바뀝니다', 'A reference changes the caller’s battery'),
          blanks: {
            param: [option('int& energy'), option('int energy', '값 전달은 20을 원본이 아닌 함수의 복사본에 더합니다.', 'Pass by value adds 20 to the function’s copy, not the original.', 'valueReference')],
            amount: [option('20'), option('10', '원본을 참조해도 10만 더하면 목표 충전량에 모자랍니다.', 'Even through a reference, adding only 10 misses the target increase.', 'valueReference')]
          },
          tests: [sample('30', { energy: 30 }), sample('10', { energy: 10 }), sample('60', { energy: 60 })],
          check: check(['energy'], p => [p.energy + 20], 'valueReference')
        }],
        hints: [t('4~6줄의 매개변수와 12~13줄의 원본을 비교하세요.', 'Compare the parameter on lines 4–6 with the original on lines 12–13.'), t('값 매개변수는 복사본이고 참조 매개변수는 호출자가 준 변수의 별칭입니다.', 'A value parameter is a copy; a reference parameter aliases the caller’s variable.'), t('4줄에 int& energy를 쓰고 6줄에서 20을 더하세요.', 'Use int& energy on line 4 and add 20 on line 6.'), t('참조에 더하면 main의 energy가 직접 바뀌므로 30은 50이 됩니다.', 'Adding through the reference changes main’s energy itself, so 30 becomes 50.')],
        tools: [tool('int energy', ['charge의 별도 매개변수', '호출자의 전력 복사본', '함수 안에서만 쓰는 정수', '원본은 바뀌지 않음', '원본을 보존할 때'], ['A separate charge parameter', 'Copy of the caller’s energy', 'Integer local to the function', 'The original does not change', 'Preserving the original']), tool('int& energy', ['호출자의 energy', '기존 정수 변수', '그 변수의 별칭', '별칭을 수정하면 원본 변경', '함수가 원본을 충전할 때'], ['The caller’s energy', 'An existing integer variable', 'An alias for that variable', 'Changing the alias changes the original', 'Charging the original from a function'])],
        scene: { theme: 'functions', widgets: [
          { type: 'stack', x: 10, y: 10, w: 72, h: 48 }, { type: 'battery', x: 104, y: 12, w: 10, h: 22, path: 'energy', max: 100 },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', x: 116, y: 56, kind: 'generator', label: t('발전기', 'Generator') },
        ] }
      }
    ]
  });
})(this);
