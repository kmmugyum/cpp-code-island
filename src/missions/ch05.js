(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const option = (code, ko, en, errorType) => ({ code, why: t(ko, en), errorType });
  const zone = t('배선실', 'Wiring Room');

  M.registerChapter({
    no: 5,
    zone,
    errorTypes: {
      pointerTarget: t('연결 대상', 'Pointer target'),
      pointerValue: t('주소와 값', 'Address and value'),
      nullPointer: t('빈 연결', 'Null connection'),
      copyInstead: t('복사본 수정', 'Modified copy'),
    },
    codeErrorTypes: { nullDeref: 'nullPointer' },
    missions: [
      {
        id: '5-1',
        title: t('주소표 연결', 'Connect an Address'),
        zone,
        sceneIdle: t('배터리 battery와 예비 배터리가 놓여 있습니다. selected의 화살표가 연결 대상을, reading이 읽은 값을 보여 줍니다. 주소 표시는 교육용 가상 주소입니다.', 'The battery and its spare are waiting. The selected arrow shows the connection; reading shows the value read. Displayed addresses are virtual teaching addresses.'),
        reward: { item: 'plug', name: t('주소 플러그', 'Address Plug') },
        goal: t('selected에 battery의 주소를 연결하고 그 배터리 값을 reading에 읽으세요.', 'Connect selected to battery and read its value into reading.'),
        done: t('battery가 30일 때 연결과 읽기가 맞으면 완료, 다른 배터리 값에서도 맞으면 적용 확인입니다.', 'Connect and read battery = 30 to complete the mission; check another battery value to apply it.'),
        reuse: t('이미 존재하는 변수의 위치가 필요하면 &변수로 주소를 얻고, 포인터의 대상 값이 필요하면 *포인터로 읽습니다.', 'Use &variable for an existing variable’s address and *pointer to access the pointed-to value.'),
        lecture: { pages: t('Lecture 5, p.1~2', 'Lecture 5, pp. 1–2'), quotes: ['&x evaluates to the address of x in memory.', 'pointer name is then a variable of type data type * – a “pointer to a data type value.”'] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('배터리 연결', 'Connect the battery'),
          template: t([
            'int main() {',
            '    int battery = {start};  // 배터리 전력',
            '    int spare = {spare};    // 예비 전력',
            '    int* selected = {link}; // 배터리로 가는 연결',
            '    int reading = {read};   // 연결에서 읽은 값',
            '    return 0;',
            '}',
          ].join('\n'), [
            'int main() {',
            '    int battery = {start};  // battery power',
            '    int spare = {spare};    // spare power',
            '    int* selected = {link}; // connection to battery',
            '    int reading = {read};   // value read from connection',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['start', 'spare'],
          blanks: {
            link: [
              { code: '&battery' },
              option('battery', 'battery는 정수 값이지 int* 주소가 아닙니다.', 'battery is an int value, not an int* address.', 'pointerValue'),
              option('*battery', 'battery는 정수이므로 역참조할 수 없습니다.', 'battery is an integer and cannot be dereferenced.', 'pointerValue'),
              option('&selected', 'selected 자신의 주소는 int**이며 배터리 주소가 아닙니다.', 'The address of selected is int**, not the battery address.', 'pointerTarget'),
            ],
            read: [
              { code: '*selected' },
              option('spare', '예비 배터리를 읽으므로 연결된 battery의 값이 아닙니다.', 'This reads the spare, not the connected battery.', 'pointerTarget'),
              option('selected', 'selected는 포인터이고 reading은 정수 값을 담습니다.', 'selected is a pointer; reading stores an integer value.', 'pointerValue'),
            ],
          },
          tests: [
            { label: t('배터리 30 · 예비 70', 'Battery 30 · spare 70'), params: { start: 30, spare: 70 } },
            { label: t('배터리 47 · 예비 12', 'Battery 47 · spare 12'), params: { start: 47, spare: 12 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const p = h.cell(result, 'selected'), r = h.cell(result, 'reading');
            const got = r ? Number(r.value === undefined ? r.shown : r.value) : NaN;
            const pass = !!p && p.target === 'battery' && got === test.params.start;
            return { pass, kind: 'logic', errorType: pass ? undefined : 'pointerTarget', got, expected: test.params.start,
              message: h.t(`${test.label}: selected의 대상은 ${p ? p.target : '?'}이고 reading은 ${got}입니다. 목표는 battery 연결과 ${test.params.start} 읽기입니다.`, `${test.label}: selected targets ${p ? p.target : '?'} and reading is ${got}. The goal is battery and ${test.params.start}.`) };
          },
        }],
        hints: [
          t('4줄의 연결과 5줄의 reading을 변수 표와 함께 보세요.', 'Inspect the connection on line 4 and reading on line 5 in the variable table.'),
          t('&는 변수의 주소를 얻고, 포인터 앞의 *는 연결된 값을 읽습니다.', '& obtains a variable’s address; * before a pointer accesses its target.'),
          t('4줄에는 &battery, 5줄에는 *selected를 넣으세요.', 'Use &battery on line 4 and *selected on line 5.'),
          t('int* selected = &battery;는 주소를 보관합니다. int reading = *selected;는 그 주소의 정수 값을 읽습니다.', 'int* selected = &battery; stores an address. int reading = *selected; reads the integer there.'),
        ],
        tools: [
          { name: '&battery', target: t('battery 변수', 'battery variable'), input: t('기존 변수', 'Existing variable'), result: t('battery의 주소', 'Address of battery'), change: t('배터리 값은 그대로', 'Battery value is unchanged'), when: t('포인터를 변수에 연결할 때', 'Connecting a pointer to a variable') },
          { name: 'int* selected', target: t('포인터 변수', 'Pointer variable'), input: t('int의 주소', 'Address of an int'), result: t('int를 가리키는 연결', 'Connection to an int'), change: t('포인터에 주소 저장', 'Stores an address in the pointer'), when: t('배터리 위치를 기억할 때', 'Remembering a battery location') },
          { name: '*selected', target: t('selected의 대상', 'Target of selected'), input: t('유효한 포인터', 'Valid pointer'), result: t('대상의 정수 값', 'Target integer value'), change: t('읽기만 하면 값 유지', 'A read leaves the value unchanged'), when: t('연결된 전력을 읽을 때', 'Reading connected power') },
        ],
        scene: { theme: 'pointers', widgets: [
          { type: 'wire', pts: [[89, 40], [89, 56]], on: ['reading'] },
          { type: 'pointer', x: 22, y: 26, path: 'selected' },
          { type: 'battery', x: 84, y: 10, w: 10, h: 28, path: 'battery', max: 100 }, { type: 'value', x: 118, y: 14, path: 'spare', icon: 'cell' },
          { type: 'value', x: 80, y: 58, path: 'reading', icon: 'chip' }, { type: 'facility', x: 122, y: 56, kind: 'machine', label: t('주소표 기계', 'Address panel') },
        ] },
      },
      {
        id: '5-2',
        title: t('연결된 배터리 수리', 'Repair the Connected Battery'),
        zone,
        sceneIdle: t('selected와 alias가 같은 battery를 향합니다. 수리 줄이 실행되면 배터리와 두 번째 연결에서 읽은 값이 함께 바뀝니다.', 'selected and alias point to the same battery. The repair changes the battery and the value read through the second connection.'),
        reward: { item: 'wrench', name: t('충전 렌치', 'Charging Wrench') },
        goal: t('selected로 battery를 10 충전하고 alias로 바뀐 값을 읽으세요.', 'Add 10 to battery through selected and read the changed value through alias.'),
        done: t('30을 40으로 충전하면 완료, 시작값이 65여도 75로 바뀌면 적용 확인입니다.', 'Charge 30 to 40 to complete the mission; charging 65 to 75 checks application.'),
        reuse: t('여러 포인터가 같은 변수를 가리킬 때 한 포인터로 수정하면 다른 포인터도 그 원본을 읽습니다.', 'When pointers share a target, a write through one is visible when reading through the other.'),
        lecture: { pages: t('Lecture 5, p.2~3', 'Lecture 5, pp. 2–3'), quotes: ['We can use deferenced pointers as l-values:', 'Once a pointer is declared, we can dereference it with the * operator to access its value:'] },
        kind: 'blanks',
        predict: {
          intro: t('battery가 30이고 두 포인터가 그 배터리를 가리킵니다. *selected += 10 실행 후 alias로 읽을 값을 예상하세요.', 'battery is 30 and both pointers target it. Predict what alias reads after *selected += 10.'),
          questions: [{ label: t('alias로 읽은 값', 'Value read through alias'), number: true }],
          answersFrom: () => ['40'],
        },
        variants: [{
          id: 'base', label: t('공유 배터리 수리', 'Repair a shared battery'),
          template: t([
            'int main() {',
            '    int battery = {start}; // 수리할 배터리',
            '    int spare = {spare};   // 예비 배터리',
            '    int* selected = &battery;',
            '    int* alias = &battery; // 같은 배터리의 두 번째 연결',
            '    {action}               // 배터리 수리',
            '    int reading = {read};  // 두 번째 연결의 값',
            '    return 0;',
            '}',
          ].join('\n'), [
            'int main() {',
            '    int battery = {start}; // battery to repair',
            '    int spare = {spare};   // spare battery',
            '    int* selected = &battery;',
            '    int* alias = &battery; // second connection to the same battery',
            '    {action}               // repair the battery',
            '    int reading = {read};  // value from the second connection',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['start', 'spare'],
          blanks: {
            action: [
              { code: '*selected += 10;' },
              option('int copy = *selected; copy += 10;', 'copy만 충전하고 battery 원본은 바꾸지 않습니다.', 'Only copy is charged; the original battery is unchanged.', 'copyInstead'),
              option('spare += 10;', '연결된 배터리가 아니라 spare를 충전합니다.', 'This charges spare instead of the connected battery.', 'pointerTarget'),
            ],
            read: [
              { code: '*alias' },
              option('spare', '두 번째 연결이 아니라 예비 배터리를 읽습니다.', 'This reads the spare, not the second connection.', 'pointerTarget'),
              option('alias', 'alias는 주소이므로 정수 reading에 넣을 수 없습니다.', 'alias is an address and cannot initialize integer reading.', 'pointerValue'),
            ],
          },
          tests: [
            { label: t('시작 30 · 예비 70', 'Start 30 · spare 70'), params: { start: 30, spare: 70 } },
            { label: t('시작 65 · 예비 12', 'Start 65 · spare 12'), params: { start: 65, spare: 12 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const b = h.cell(result, 'battery'), r = h.cell(result, 'reading'), p = h.cell(result, 'alias');
            const got = b ? Number(b.value === undefined ? b.shown : b.value) : NaN;
            const read = r ? Number(r.value === undefined ? r.shown : r.value) : NaN;
            const expected = test.params.start + 10;
            const pass = got === expected && read === expected && !!p && p.target === 'battery';
            const type = h.cell(result, 'copy') && got !== expected ? 'copyInstead' : 'pointerTarget';
            return { pass, kind: 'logic', errorType: pass ? undefined : type, got, expected,
              message: h.t(`${test.label}: battery는 ${got}, alias의 대상은 ${p ? p.target : '?'}, reading은 ${read}입니다. 목표는 같은 battery와 두 값 ${expected}입니다.`, `${test.label}: battery is ${got}, alias targets ${p ? p.target : '?'}, and reading is ${read}. The goal is the same battery and two values of ${expected}.`) };
          },
        }],
        hints: [
          t('6줄의 수리 전후 battery와 7줄의 reading을 비교하세요.', 'Compare battery before and after line 6 with reading on line 7.'),
          t('두 포인터가 같은 대상을 가리킵니다. 역참조는 그 원본에 접근합니다.', 'Both pointers target the same object. Dereferencing accesses that original.'),
          t('6줄에는 *selected += 10;을, 7줄에는 *alias를 넣으세요.', 'Use *selected += 10; on line 6 and *alias on line 7.'),
          t('복사한 int를 충전하면 원본은 그대로입니다. *selected로 battery를 수정하면 *alias도 증가한 원본을 읽습니다.', 'Charging a copied int leaves the original unchanged. A write through *selected is visible through *alias.'),
        ],
        tools: [
          { name: '*selected += 10', target: t('selected가 가리키는 battery', 'battery targeted by selected'), input: t('증가량 10', 'Increase of 10'), result: t('원본 전력 증가', 'Original power increases'), change: t('battery 값', 'battery value'), when: t('연결을 통해 수리할 때', 'Repairing through a connection') },
          { name: '*alias', target: t('alias가 가리키는 battery', 'battery targeted by alias'), input: t('유효한 연결', 'Valid connection'), result: t('현재 원본 값', 'Current original value'), change: t('읽기만 하므로 없음', 'None for a read'), when: t('다른 경로로 수리 결과를 확인할 때', 'Checking the repair via another path') },
          { name: 'int copy = *selected', target: t('새 정수 copy', 'New integer copy'), input: t('battery의 현재 값', 'Current battery value'), result: t('별도의 값 복사', 'Separate value copy'), change: t('copy 변경은 battery에 영향 없음', 'Changing copy does not change battery'), when: t('독립된 값을 보관할 때', 'Keeping an independent value') },
        ],
        scene: { theme: 'pointers', widgets: [
          { type: 'pointer', x: 22, y: 14, path: 'selected' }, { type: 'pointer', x: 22, y: 44, path: 'alias' },
          { type: 'battery', x: 84, y: 20, w: 10, h: 28, path: 'battery', max: 100 }, { type: 'value', x: 118, y: 14, path: 'spare', icon: 'cell' },
          { type: 'value', x: 80, y: 62, path: 'reading', icon: 'chip' }, { type: 'facility', x: 114, y: 52, kind: 'workshop', label: t('수리 작업실', 'Repair room') },
        ] },
      },
      {
        id: '5-3',
        title: t('잘못된 연결 찾기', 'Find the Missing Connection'),
        zone,
        sceneIdle: t('alias는 battery의 별칭입니다. selected는 처음에 비어 있다가 연결 검사에 따라 reserve로 옮겨집니다. 빈 연결에서는 수리를 건너뜁니다.', 'alias is another name for battery. selected starts empty and may be redirected to reserve; skip repair when it remains empty.'),
        reward: { item: 'shield', name: t('널 검사 방패', 'Null Guard Shield') },
        goal: t('연결이 있을 때 selected를 reserve에 연결해 10 충전하고, 빈 포인터는 역참조하지 마세요.', 'Connect selected to reserve and charge it by 10 when a connection is available; never dereference a null pointer.'),
        done: t('연결된 reserve 50이 60이 되면 완료, 빈 연결에서 두 배터리를 그대로 두면 적용 확인입니다.', 'Charge connected reserve from 50 to 60 to complete the mission; leave both batteries unchanged when disconnected to apply it.'),
        reuse: t('포인터가 빈 연결일 수 있으면 사용 전에 nullptr과 비교하고, 참조는 처음 묶인 객체의 별칭으로 추적합니다.', 'Check a possibly null pointer before dereferencing; track a reference as an alias of its original object.'),
        lecture: { pages: t('Lecture 5, p.4~5', 'Lecture 5, pp. 4–5'), quotes: ['One should generally check whether a pointer is null before dereferencing it.', 'After these declarations, changing x will change y and vice versa, because they are two names for the same thing.'] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('빈 연결 검사', 'Check the empty connection'),
          template: t([
            'int main() {',
            '    int battery = {start};   // 원래 배터리',
            '    int reserve = {reserve}; // 새 연결 대상',
            '    int& alias = battery;    // battery의 별칭',
            '    int* selected = nullptr; // 비어 있는 연결',
            '    if ({connected}) {',
            '        selected = {target}; // 연결 위치 이동',
            '    }',
            '    if ({guard}) {',
            '        *selected += 10;     // 연결된 배터리만 충전',
            '    }',
            '    int reading = alias;     // 원래 배터리 확인',
            '    return 0;',
            '}',
          ].join('\n'), [
            'int main() {',
            '    int battery = {start};   // original battery',
            '    int reserve = {reserve}; // new connection target',
            '    int& alias = battery;    // alias of battery',
            '    int* selected = nullptr; // empty connection',
            '    if ({connected}) {',
            '        selected = {target}; // move the connection',
            '    }',
            '    if ({guard}) {',
            '        *selected += 10;     // charge only a connected battery',
            '    }',
            '    int reading = alias;     // inspect the original battery',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['start', 'reserve', 'connected'],
          blanks: {
            target: [
              { code: '&reserve' },
              option('&battery', '포인터를 reserve로 옮겨야 하는데 battery에 연결했습니다.', 'This connects to battery instead of moving to reserve.', 'pointerTarget'),
              option('nullptr', '연결이 가능해도 포인터가 빈 상태로 남습니다.', 'The pointer stays empty even when a connection is available.', 'pointerTarget'),
            ],
            guard: [
              { code: 'selected != nullptr' },
              option('true', '빈 포인터도 역참조합니다. 이는 정의되지 않은 동작입니다.', 'This also dereferences null, which is undefined behavior.', 'nullPointer'),
              option('selected == nullptr', '연결이 없을 때만 역참조하여 정의되지 않은 동작을 일으킵니다.', 'This dereferences only when null, causing undefined behavior.', 'nullPointer'),
            ],
          },
          tests: [
            { label: t('연결됨 · battery 30 · reserve 50', 'Connected · battery 30 · reserve 50'), params: { start: 30, reserve: 50, connected: 1 } },
            { label: t('연결 없음 · battery 40 · reserve 65', 'Disconnected · battery 40 · reserve 65'), params: { start: 40, reserve: 65, connected: 0 } },
            { label: t('연결됨 · battery 12 · reserve 21', 'Connected · battery 12 · reserve 21'), params: { start: 12, reserve: 21, connected: 1 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const b = h.cell(result, 'battery'), r = h.cell(result, 'reserve'), a = h.cell(result, 'reading'), p = h.cell(result, 'selected');
            const val = c => c ? Number(c.value === undefined ? c.shown : c.value) : NaN;
            const battery = val(b), reserve = val(r), reading = val(a);
            const expected = test.params.reserve + (test.params.connected ? 10 : 0);
            const target = test.params.connected ? 'reserve' : null;
            const pass = battery === test.params.start && reading === test.params.start && reserve === expected && !!p && p.target === target;
            return { pass, kind: 'logic', errorType: pass ? undefined : (p && p.target !== target ? 'pointerTarget' : 'nullPointer'), got: reserve, expected,
              message: h.t(`${test.label}: selected 대상 ${p ? p.target : '?'}, battery ${battery}, reserve ${reserve}, 별칭 읽기 ${reading}입니다. 목표는 대상 ${target}, battery ${test.params.start}, reserve ${expected}입니다.`, `${test.label}: selected targets ${p ? p.target : '?'}, battery is ${battery}, reserve ${reserve}, and alias reads ${reading}. The goal is target ${target}, battery ${test.params.start}, reserve ${expected}.`) };
          },
        }],
        hints: [
          t('7줄에서 연결이 어디로 이동하는지, 9~10줄에서 빈 연결을 사용하는지 보세요.', 'Check where line 7 moves the connection and whether lines 9–10 use an empty connection.'),
          t('nullptr은 대상이 없다는 표시입니다. 참조는 기존 객체의 별칭이지만 포인터는 다른 대상을 가리킬 수 있습니다. nullptr은 강의 원문 밖의 C++11 보충 문법입니다.', 'nullptr means no target. A reference aliases its original object; a pointer can be reseated. nullptr is a C++11 addition beyond the lecture.'),
          t('7줄에는 &reserve, 9줄에는 selected != nullptr를 넣으세요.', 'Use &reserve on line 7 and selected != nullptr on line 9.'),
          t('int& alias의 &는 참조 선언이고 &reserve의 &는 주소를 얻습니다. 널 검사를 통과한 경우에만 *selected를 사용합니다.', 'In int& alias, & declares a reference; in &reserve it obtains an address. Dereference *selected only after the null check.'),
        ],
        tools: [
          { name: 'nullptr', target: t('포인터 selected', 'Pointer selected'), input: t('빈 연결', 'Empty connection'), result: t('대상이 없는 포인터', 'Pointer without a target'), change: t('대상 배터리 없음', 'No target battery'), when: t('아직 연결되지 않았음을 나타낼 때', 'Marking an absent connection') },
          { name: 'selected != nullptr', target: t('selected 연결', 'selected connection'), input: t('포인터와 nullptr', 'Pointer and nullptr'), result: t('연결 여부의 참·거짓', 'True or false for connection'), change: t('검사 자체는 상태를 바꾸지 않음', 'The check changes no state'), when: t('역참조 전에 빈 연결을 피할 때', 'Avoiding null dereference') },
          { name: 'int& alias = battery', target: t('battery', 'battery'), input: t('기존 int 변수', 'Existing int variable'), result: t('battery의 다른 이름', 'Another name for battery'), change: t('alias로 변경하면 battery 변경', 'Writing alias changes battery'), when: t('같은 변수를 다른 이름으로 다룰 때', 'Using another name for the same variable') },
          { name: 'selected = &reserve', target: t('포인터 selected', 'Pointer selected'), input: t('reserve의 주소', 'Address of reserve'), result: t('새 대상 연결', 'Connection to a new target'), change: t('포인터 대상이 reserve로 바뀜', 'Pointer target becomes reserve'), when: t('연결을 다른 기존 변수로 옮길 때', 'Reseating a connection to another existing variable') },
        ],
        scene: { theme: 'pointers', widgets: [
          { type: 'pointer', x: 22, y: 34, path: 'selected' },
          { type: 'battery', x: 66, y: 12, w: 44, h: 12, path: 'battery', max: 100 }, { type: 'battery', x: 66, y: 40, w: 44, h: 12, path: 'reserve', max: 100 },
          { type: 'value', x: 122, y: 12, path: 'reading', icon: 'chip' }, { type: 'facility', x: 124, y: 52, kind: 'machine', label: t('충전 장치', 'Charger') },
        ] },
      },
      {
        id: '5-4',
        title: t('연결 위치 이동', 'Move the Connection'),
        zone,
        sceneIdle: t('cells의 세 칸과 ptr, next 화살표가 보입니다. next는 두 번째 칸으로, reading은 선택한 인덱스의 값으로 바뀝니다.', 'Three cells and the ptr and next arrows are shown. next moves to the second element and reading shows the selected index.'),
        reward: { item: 'arrow', name: t('원소 이동 화살표', 'Element Arrow') },
        goal: t('ptr + 1로 두 번째 칸을 연결하고 *(ptr + i)로 선택한 배열 원소를 읽으세요.', 'Connect to the second element with ptr + 1 and read the selected element with *(ptr + i).'),
        done: t('10, 20, 30에서 인덱스 2를 읽고 두 번째 칸을 연결하면 완료, 다른 값과 인덱스에서도 맞으면 적용 확인입니다.', 'Read index 2 of 10, 20, 30 and connect the second element to complete the mission; apply it to other values and indices.'),
        reuse: t('배열 안에서 포인터에 정수를 더하면 바이트가 아니라 원소 수만큼 이동하며 유효한 범위에서만 역참조합니다.', 'Adding an integer to a pointer moves by elements, not bytes; dereference only within the valid array range.'),
        lecture: { pages: t('Lecture 5, p.5~6', 'Lecture 5, pp. 5–6'), quotes: ['Adding an integer n to a pointer produces a new pointer pointing to n positions further down in memory.', 'Thus, line 3 moves ptr to point to the second element of the array.'] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('배열 배선', 'Wire the array'),
          template: t([
            'int main() {',
            '    int cells[3] = {{first}, {second}, {third}}; // 배터리 칸',
            '    int i = {index};       // 읽을 칸 번호',
            '    int* ptr = cells;      // 첫 칸 연결',
            '    int* next = {advance}; // 두 번째 칸 연결',
            '    int reading = {read};  // 선택한 칸의 전력',
            '    int secondReading = *next;',
            '    return 0;',
            '}',
          ].join('\n'), [
            'int main() {',
            '    int cells[3] = {{first}, {second}, {third}}; // battery slots',
            '    int i = {index};       // slot index to read',
            '    int* ptr = cells;      // connection to first slot',
            '    int* next = {advance}; // connection to second slot',
            '    int reading = {read};  // power in selected slot',
            '    int secondReading = *next;',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['first', 'second', 'third', 'index'],
          blanks: {
            advance: [
              { code: 'ptr + 1' },
              option('ptr', 'ptr은 첫 번째 원소에 그대로 있습니다.', 'ptr remains at the first element.', 'pointerTarget'),
              option('ptr + 2', '두 칸 이동하면 세 번째 원소입니다.', 'Moving two elements reaches the third element.', 'pointerTarget'),
            ],
            read: [
              { code: '*(ptr + i)' },
              option('*ptr', '인덱스 i를 무시하고 항상 첫 원소를 읽습니다.', 'This ignores i and always reads the first element.', 'pointerTarget'),
              option('*(ptr + 1)', '인덱스 i와 관계없이 두 번째 원소만 읽습니다.', 'This always reads the second element regardless of i.', 'pointerTarget'),
            ],
          },
          tests: [
            { label: t('칸 10, 20, 30 · 인덱스 2', 'Cells 10, 20, 30 · index 2'), params: { first: 10, second: 20, third: 30, index: 2 } },
            { label: t('칸 7, 12, 18 · 인덱스 1', 'Cells 7, 12, 18 · index 1'), params: { first: 7, second: 12, third: 18, index: 1 } },
            { label: t('칸 9, 24, 37 · 인덱스 0', 'Cells 9, 24, 37 · index 0'), params: { first: 9, second: 24, third: 37, index: 0 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const p = h.cell(result, 'next'), r = h.cell(result, 'reading'), s = h.cell(result, 'secondReading');
            const got = r ? Number(r.value === undefined ? r.shown : r.value) : NaN;
            const second = s ? Number(s.value === undefined ? s.shown : s.value) : NaN;
            const expected = [test.params.first, test.params.second, test.params.third][test.params.index];
            const pass = !!p && p.target === 'cells[1]' && got === expected && second === test.params.second;
            return { pass, kind: 'logic', errorType: pass ? undefined : 'pointerTarget', got, expected,
              message: h.t(`${test.label}: next 대상 ${p ? p.target : '?'}, reading ${got}, secondReading ${second}입니다. 목표는 cells[1], ${expected}, ${test.params.second}입니다.`, `${test.label}: next targets ${p ? p.target : '?'}, reading is ${got}, and secondReading is ${second}. The goal is cells[1], ${expected}, ${test.params.second}.`) };
          },
        }],
        hints: [
          t('5줄의 next 화살표와 6줄의 reading을 배열 칸과 비교하세요.', 'Compare the next arrow on line 5 and reading on line 6 with the array slots.'),
          t('배열은 포인터가 아니지만 4줄의 식에서 첫 원소를 가리키는 포인터로 변환됩니다.', 'An array is not a pointer, but in the expression on line 4 it converts to a pointer to its first element.'),
          t('5줄에는 ptr + 1, 6줄에는 *(ptr + i)를 넣으세요.', 'Use ptr + 1 on line 5 and *(ptr + i) on line 6.'),
          t('ptr + 1은 한 바이트가 아니라 한 원소를 이동합니다. *(ptr + i)는 cells[i]와 같은 원소를 읽습니다.', 'ptr + 1 advances one element, not one byte. *(ptr + i) reads the same element as cells[i].'),
        ],
        tools: [
          { name: 'int* ptr = cells', target: t('cells 배열', 'cells array'), input: t('배열 표현식', 'Array expression'), result: t('첫 원소 포인터', 'Pointer to first element'), change: t('ptr에 연결 저장, 배열은 그대로', 'Stores a connection; array unchanged'), when: t('배열의 시작을 가리킬 때', 'Pointing to the start of an array') },
          { name: 'ptr + 1', target: t('배열 내 포인터', 'Pointer within an array'), input: t('원소 거리 1', 'Element offset 1'), result: t('다음 원소의 포인터', 'Pointer to next element'), change: t('ptr 자체는 바뀌지 않음', 'ptr itself does not change'), when: t('다음 칸을 가리키는 연결을 만들 때', 'Creating a connection to the next slot') },
          { name: '*(ptr + i)', target: t('i번째 배열 원소', 'Array element at i'), input: t('유효한 인덱스 i', 'Valid index i'), result: t('해당 원소의 값', 'Value of that element'), change: t('읽기만 하면 없음', 'None for a read'), when: t('원소 단위 이동 후 값을 읽을 때', 'Reading after an element-wise offset') },
        ],
        scene: { theme: 'pointers', widgets: [
          { type: 'pointer', x: 22, y: 10, path: 'next' }, { type: 'pointer', x: 22, y: 30, path: 'ptr' },
          { type: 'array', x: 54, y: 50, path: 'cells', display: 'number', slots: 3, tagBelow: true },
          { type: 'value', x: 122, y: 12, path: 'reading', icon: 'chip' }, { type: 'value', x: 122, y: 36, path: 'secondReading', icon: 'chip' },
          { type: 'facility', x: 124, y: 58, kind: 'machine', label: t('칸 선택기', 'Cell selector') },
        ] },
      },
    ],
  });
})(this);
