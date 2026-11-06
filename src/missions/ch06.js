(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const opt = (code, ko, en, errorType) => ({ code, why: t(ko, en), errorType });
  const zone = t('로봇 조립소', 'Robot Assembly');

  M.registerChapter({
    no: 6,
    zone,
    errorTypes: {
      objectTarget: t('객체 대상', 'Object target'),
      fieldChoice: t('필드 선택', 'Field choice'),
      methodChoice: t('메서드 선택', 'Method choice'),
      copyInstead: t('복사 초기화', 'Copy initialization'),
      access: t('접근 제한', 'Access control'),
      chargeRule: t('충전 조건', 'Charge condition'),
    },
    codeErrorTypes: { privateAccess: 'access' },
    missions: [
      {
        id: '6-1',
        title: t('로봇 설계도', 'Robot Blueprint'),
        zone,
        sceneIdle: t('같은 설계도의 섀시 두 대가 대기합니다. 각 객체의 위치와 전력 태그는 해당 필드가 설정될 때 바뀝니다.', 'Two chassis await settings from the same blueprint. Each position and energy tag changes when its field is set.'),
        reward: { item: 'chassis', name: t('독립 섀시', 'Independent Chassis') },
        goal: t('Robot 두 대의 위치를 1과 2, 전력을 30과 70으로 설정하세요.', 'Set two Robots to positions 1 and 2 and energy levels 30 and 70.'),
        done: t('A의 위치와 전력이 1과 30, B가 2와 70이면 완료입니다. 다른 전력에서도 각각 설정하면 적용 확인입니다.', 'Complete with A at position 1 and energy 30, B at position 2 and energy 70; apply it to other energy values too.'),
        reuse: t('같은 종류의 장치 여러 개가 서로 다른 상태를 가질 때 클래스로 필드를 묶습니다.', 'Group fields in a class when several devices of the same kind need independent state.'),
        lecture: {
          pages: t('Lecture 6, p.7~13', 'Lecture 6, pp. 7–13'),
          quotes: [
            'A user-defined datatype which groups together related pieces of information',
            'An instance is an occurrence of a class. Different instances can have their own set of values in their fields.',
          ],
        },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('두 섀시 설정', 'Configure two chassis'),
          template: t([
            'class Robot {',
            'public:',
            '    int position; // 로봇 위치',
            '    int energy;   // 배터리',
            '};',
            'int main() {',
            '    Robot a;',
            '    Robot b;',
            '    a.position = 1;',
            '    b.position = 2;',
            '    a.energy = {first};',
            '    b.energy = 0;',
            '    {target}.{field} = {second};',
            '    return 0;',
            '}',
          ].join('\n'), [
            'class Robot {',
            'public:',
            '    int position; // robot position',
            '    int energy;   // battery',
            '};',
            'int main() {',
            '    Robot a;',
            '    Robot b;',
            '    a.position = 1;',
            '    b.position = 2;',
            '    a.energy = {first};',
            '    b.energy = 0;',
            '    {target}.{field} = {second};',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['first', 'second'],
          blanks: {
            target: [{ code: 'b' }, opt('a', 'a를 다시 바꾸면 b의 전력은 그대로입니다.', 'Changing a again leaves b’s energy unchanged.', 'objectTarget')],
            field: [{ code: 'energy' }, opt('position', 'position은 위치이며 배터리 필드가 아닙니다.', 'position is the location, not the battery field.', 'fieldChoice')],
          },
          tests: [
            { label: t('전력 30과 70', 'Energy 30 and 70'), params: { first: 30, second: 70 } },
            { label: t('전력 25와 60', 'Energy 25 and 60'), params: { first: 25, second: 60 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const read = path => { const c = h.cell(result, path); return c ? Number(c.shown) : NaN; };
            const a = read('a.energy'), b = read('b.energy'), ap = read('a.position'), bp = read('b.position');
            const pass = a === test.params.first && b === test.params.second && ap === 1 && bp === 2;
            return { pass, kind: 'logic', errorType: pass ? undefined : (bp !== 2 ? 'fieldChoice' : 'objectTarget'),
              message: h.t(`${test.label}: a.energy=${a}, b.energy=${b}, 위치는 ${ap}, ${bp}입니다. 목표 전력은 ${test.params.first}, ${test.params.second}, 위치는 1, 2입니다.`, `${test.label}: a.energy=${a}, b.energy=${b}, positions ${ap}, ${bp}. Goal: energy ${test.params.first}, ${test.params.second}, positions 1, 2.`) };
          },
        }],
        hints: [
          t('13번 줄에서 점 앞의 객체와 점 뒤의 필드를 살펴보세요.', 'Inspect the object before the dot and the field after it on line 13.'),
          t('각 인스턴스는 같은 필드 이름을 가져도 별도의 값을 저장합니다.', 'Each instance stores its own values, even when its field names match.'),
          t('13번 줄은 b의 energy 필드를 설정합니다.', 'Line 13 sets the energy field of b.'),
          t('b.energy = 두 번째 전력;을 사용합니다. a의 필드나 b.position을 덮어쓰지 않습니다.', 'Use b.energy = the second energy value; do not overwrite a’s fields or b.position.'),
        ],
        tools: [
          { name: 'Robot a;', target: t('Robot 설계도', 'Robot blueprint'), input: t('객체 이름 a', 'Object name a'), result: t('새 인스턴스 a', 'New instance a'), change: t('a의 별도 필드가 생김', 'Creates separate fields for a'), when: t('로봇 한 대를 만들 때', 'Creating one robot') },
          { name: 'b.energy = 70;', target: t('객체 b의 공개 필드', 'A public field of b'), input: t('저장할 전력', 'Energy to store'), result: t('대입한 전력 값', 'The assigned energy value'), change: t('b.energy만 변경', 'Changes only b.energy'), when: t('b의 전력을 직접 설정할 때', 'Setting b’s energy directly') },
          { name: 'a.position', target: t('객체 a', 'Object a'), input: t('없음', 'None'), result: t('a의 위치 필드', 'The position field of a'), change: t('읽기만 하면 없음', 'None when only read'), when: t('a의 위치를 확인하거나 설정할 때', 'Inspecting or setting a’s position') },
        ],
        scene: { theme: 'classes', widgets: [
          { type: 'objects', x: 16, y: 12, w: 84, pitchX: 40, class: 'Robot', battery: 'energy', max: 100, slots: 2 },
          { type: 'value', x: 96, y: 12, path: 'a.position', icon: 'flag', side: true }, { type: 'value', x: 96, y: 28, path: 'a.energy', icon: 'cell', side: true },
          { type: 'value', x: 96, y: 44, path: 'b.position', icon: 'flag', side: true }, { type: 'value', x: 96, y: 60, path: 'b.energy', icon: 'cell', side: true },
          { type: 'facility', x: 24, y: 54, kind: 'workshop', label: t('조립 공방', 'Assembly shop') },
        ] },
      },
      {
        id: '6-2',
        title: t('로봇의 명령', 'Robot Commands'),
        zone,
        sceneIdle: t('A는 전력 30, B는 70으로 조립됩니다. 생성자 입력은 0~100으로 제한합니다. 호출한 로봇만 충전에 반응하며 charge는 게임을 위해 정의한 메서드입니다.', 'A starts with 30 energy and B with 70. Constructor inputs are limited to 0–100. Only the called robot reacts; charge is a method defined for this game.'),
        reward: { item: 'badge', name: t('A 충전 배지', 'A Charging Badge') },
        goal: t('A만 20 충전해 A=50, B=70으로 만드세요.', 'Charge only A by 20 to reach A=50 and B=70.'),
        done: t('A=50, B=70이면 완료입니다. 다른 초기 전력에서도 A만 20 증가하면 적용 확인입니다.', 'A=50 and B=70 completes the mission; apply it by charging only A for other starting values.'),
        reuse: t('같은 기능을 가진 객체 중 특정 객체에 명령을 보낼 때 대상과 메서드를 함께 고릅니다.', 'Choose both the target and method when commanding one of several similar objects.'),
        lecture: { pages: t('Lecture 6, p.39~47', 'Lecture 6, pp. 39–47'), quotes: [
          'Observe how some functions are closely associated with a particular class',
          'Methods: functions which are part of a class',
          'Implicitly pass the current instance',
        ] },
        predict: {
          intro: t('A=30, B=70에서 a.charge(20)을 호출하면 각 전력은 얼마일까요?', 'With A=30 and B=70, what are their energy levels after a.charge(20)?'),
          questions: [{ label: t('A 전력', 'A energy'), number: true }, { label: t('B 전력', 'B energy'), number: true }],
          answersFrom: () => ['50', '70'],
          explanation: t('호출 대상 a의 전력만 20 증가합니다.', 'Only the call target a gains 20 energy.'),
        },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('A만 충전', 'Charge A only'),
          template: t([
            '#include <iostream>',
            '',
            'class Robot {',
            'private:',
            '    int energy;',
            '',
            'public:',
            '    Robot(int initialEnergy) {',
            '        energy = initialEnergy;',
            '    }',
            '',
            '    void charge(int amount) {',
            '        if (amount > 0 && amount <= 100 - energy) {',
            '            energy += amount;',
            '        }',
            '    }',
            '',
            '    int getEnergy() {',
            '        return energy;',
            '    }',
            '};',
            '',
            'int main() {',
            '    Robot a({first}); // A 배터리',
            '    Robot b({second}); // B 배터리',
            '',
            '    {call}',
            '',
            "    std::cout << a.getEnergy() << ' ' << b.getEnergy() << '\\n';",
            '}',
          ].join('\n'), [
            '#include <iostream>',
            '',
            'class Robot {',
            'private:',
            '    int energy;',
            '',
            'public:',
            '    Robot(int initialEnergy) {',
            '        energy = initialEnergy;',
            '    }',
            '',
            '    void charge(int amount) {',
            '        if (amount > 0 && amount <= 100 - energy) {',
            '            energy += amount;',
            '        }',
            '    }',
            '',
            '    int getEnergy() {',
            '        return energy;',
            '    }',
            '};',
            '',
            'int main() {',
            '    Robot a({first}); // A battery',
            '    Robot b({second}); // B battery',
            '',
            '    {call}',
            '',
            "    std::cout << a.getEnergy() << ' ' << b.getEnergy() << '\\n';",
            '}',
          ].join('\n')),
          params: ['first', 'second'],
          blanks: { call: [
            { code: 'a.charge(20);' },
            opt('b.charge(20);', '충전 기능은 맞게 골랐지만, 대상 객체가 B입니다.', 'You chose the right charging function, but the target object is B.', 'objectTarget'),
            opt('a.getEnergy();', '조회 메서드는 전력을 늘리지 않습니다.', 'The getter does not increase energy.', 'methodChoice'),
          ] },
          tests: [
            { label: t('A 30 · B 70', 'A 30 · B 70'), params: { first: 30, second: 70 } },
            { label: t('A 10 · B 35', 'A 10 · B 35'), params: { first: 10, second: 35 } },
            { label: t('A 65 · B 20', 'A 65 · B 20'), params: { first: 65, second: 20 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const a = h.cell(result, 'a.energy'), b = h.cell(result, 'b.energy');
            const av = a ? Number(a.shown) : NaN, bv = b ? Number(b.shown) : NaN;
            const calls = h.steps(result).flatMap(s => s.events || []).filter(e => e.type === 'call' && /(?:^|::)charge$/.test(e.fn));
            const target = calls.length ? calls[0].object : 'none';
            const pass = av === test.params.first + 20 && bv === test.params.second && calls.length === 1 && target === 'a';
            const explanation = target === 'b' ? h.t('충전 기능은 맞게 골랐지만, 대상 객체가 B입니다.', 'You chose the right charging function, but the target object is B.') : '';
            return { pass, kind: 'logic', errorType: pass ? undefined : (calls.length ? 'objectTarget' : 'methodChoice'),
              message: h.t(`${test.label}: a.energy=${av}, b.energy=${bv}, charge 대상=${target}. 목표는 a=${test.params.first + 20}, b=${test.params.second}, 대상 a입니다. ${explanation}`, `${test.label}: a.energy=${av}, b.energy=${bv}, charge target=${target}. Goal: a=${test.params.first + 20}, b=${test.params.second}, target a. ${explanation}`) };
          },
        }],
        hints: [
          t('24~27번 줄에서 두 객체의 초기값과 호출 대상을 비교하세요.', 'Compare the initial values and call target on lines 24–27.'),
          t('메서드는 점 앞에 놓인 객체의 상태를 사용합니다. 생성자 입력은 0~100으로 제한합니다.', 'A method uses the object before the dot. Constructor inputs here are restricted to 0–100.'),
          t('27번 줄에서 a의 charge에 20을 전달하세요.', 'On line 27, pass 20 to a’s charge method.'),
          t('a.charge(20);입니다. charge는 C++ 표준 함수가 아니라 게임을 위해 정의한 메서드입니다.', 'Use a.charge(20); charge is a method defined for this game, not a C++ standard function.'),
        ],
        tools: [
          { name: 'a.charge(20)', target: t('객체 a', 'Object a'), input: t('충전량 20', 'Charge amount 20'), result: t('없음 (void)', 'None (void)'), change: t('조건에 맞으면 a.energy 증가', 'Increases a.energy if the condition permits'), when: t('전력을 늘릴 때', 'Increasing energy') },
          { name: 'a.getEnergy()', target: t('객체 a', 'Object a'), input: t('없음', 'None'), result: t('현재 전력 (int)', 'Current energy (int)'), change: t('없음', 'None'), when: t('현재 전력을 표시하거나 판단할 때', 'Displaying or checking current energy') },
        ],
        scene: { theme: 'classes', widgets: [
          { type: 'label', x: 80, y: 10, text: t('충전 명령', 'Charge command') },
          { type: 'objects', x: 16, y: 22, w: 84, pitchX: 40, class: 'Robot', battery: 'energy', max: 100, slots: 2 },
          { type: 'value', x: 96, y: 24, path: 'a.energy', icon: 'cell', side: true }, { type: 'value', x: 96, y: 46, path: 'b.energy', icon: 'cell', side: true },
          { type: 'facility', x: 24, y: 56, kind: 'workshop', label: t('조립 공방', 'Assembly shop') },
        ] },
      },
      {
        id: '6-3',
        title: t('출고 설정', 'Factory Settings'),
        zone,
        sceneIdle: t('A가 초기 전력으로 출고되고 B가 복사되어 들어옵니다. 이후 호출된 로봇만 반응합니다.', 'A is constructed with starting energy, then B appears as its copy. Only the later call target reacts.'),
        reward: { item: 'blueprint', name: t('복사 설계도', 'Copy Blueprint') },
        goal: t('전력 30으로 A를 만들고 B를 복사 초기화한 뒤 A만 충전해 40과 30을 만드세요.', 'Create A with energy 30, copy-initialize B, then charge only A to reach 40 and 30.'),
        done: t('A=40, B=30이면 완료입니다. 다른 초기값에서도 복사와 이후 충전이 분리되면 적용 확인입니다.', 'A=40 and B=30 completes the mission; apply it to another starting value.'),
        reuse: t('기존 객체의 필드로 별도의 새 객체를 시작할 때 복사 초기화를 사용합니다.', 'Use copy initialization to start a separate new object from existing fields.'),
        lecture: { pages: t('Lecture 6, p.51~55', 'Lecture 6, pp. 51–55'), quotes: [
          'Method that is called when an instance is created',
          'Can accept parameters',
          'Invoking the copy constructor',
        ] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('복사 출고', 'Copy at assembly'),
          template: t([
            'class Robot {',
            'public:',
            '    int energy; // 출고 전력',
            '    Robot(int initial) {',
            '        energy = initial;',
            '    }',
            '    void charge(int amount) {',
            '        energy += amount;',
            '    }',
            '};',
            'int main() {',
            '    Robot a({start});',
            '    {copy}',
            '    {target}.charge(10);',
            '    return 0;',
            '}',
          ].join('\n'), [
            'class Robot {',
            'public:',
            '    int energy; // starting energy',
            '    Robot(int initial) {',
            '        energy = initial;',
            '    }',
            '    void charge(int amount) {',
            '        energy += amount;',
            '    }',
            '};',
            'int main() {',
            '    Robot a({start});',
            '    {copy}',
            '    {target}.charge(10);',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['start'],
          blanks: {
            copy: [{ code: 'Robot b = a;' }, opt('Robot b(0);', '0으로 생성하면 a의 초기값을 복사하지 않습니다.', 'Constructing with 0 does not copy a’s initial value.', 'copyInstead')],
            target: [{ code: 'a' }, opt('b', '복사 이후 b를 충전하면 a는 변하지 않습니다.', 'Charging b after the copy leaves a unchanged.', 'objectTarget')],
          },
          tests: [
            { label: t('초기 전력 30', 'Starting energy 30'), params: { start: 30 } },
            { label: t('초기 전력 55', 'Starting energy 55'), params: { start: 55 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const a = h.cell(result, 'a.energy'), b = h.cell(result, 'b.energy');
            const av = a ? Number(a.shown) : NaN, bv = b ? Number(b.shown) : NaN;
            const events = h.steps(result).flatMap(s => s.events || []);
            const copy = events.some(e => e.type === 'construct' && e.path === 'b' && e.how === 'copy');
            const call = events.find(e => e.type === 'call' && /(?:^|::)charge$/.test(e.fn));
            const pass = av === test.params.start + 10 && bv === test.params.start && copy && call && call.object === 'a';
            return { pass: !!pass, kind: 'logic', errorType: pass ? undefined : (!copy ? 'copyInstead' : 'objectTarget'),
              message: h.t(`${test.label}: a.energy=${av}, b.energy=${bv}, 복사 생성=${copy}, 충전 대상=${call ? call.object : '없음'}. 목표는 ${test.params.start + 10}, ${test.params.start}, b 복사 생성과 a 충전입니다.`, `${test.label}: a.energy=${av}, b.energy=${bv}, copy construction=${copy}, charge target=${call ? call.object : 'none'}. Goal: ${test.params.start + 10}, ${test.params.start}, a copy for b and a charge on a.`) };
          },
        }],
        hints: [
          t('12~14번 줄에서 생성, 복사, 이후 호출 순서를 보세요.', 'Follow construction, copying, and the later call on lines 12–14.'),
          t('생성자는 객체가 생길 때 실행됩니다. 복사 초기화는 새 객체를 만들며 기존 객체 대입과 다릅니다.', 'A constructor runs when an object is created. Copy initialization creates a new object, unlike assignment to an existing object.'),
          t('13번 줄은 Robot b = a;이고 14번 줄은 a를 충전합니다.', 'Line 13 is Robot b = a; and line 14 charges a.'),
          t('복사 당시 b는 a와 같은 전력을 얻지만 이후 a.charge(10)은 b를 바꾸지 않습니다.', 'At the copy, b gets a’s energy; a later a.charge(10) does not change b.'),
        ],
        tools: [
          { name: 'Robot a(30);', target: t('새 객체 a', 'New object a'), input: t('초기 전력 30', 'Starting energy 30'), result: t('생성된 Robot', 'A constructed Robot'), change: t('a.energy 초기화', 'Initializes a.energy'), when: t('출고 시 초기값을 정할 때', 'Choosing values at creation') },
          { name: 'Robot b = a;', target: t('기존 객체 a', 'Existing object a'), input: t('복사할 a의 필드', 'Fields copied from a'), result: t('새 객체 b', 'New object b'), change: t('별도 객체 b 생성', 'Creates a separate b'), when: t('기존 상태로 새 객체를 만들 때', 'Creating a new object from existing state') },
          { name: 'a.charge(10)', target: t('객체 a', 'Object a'), input: t('충전량 10', 'Charge amount 10'), result: t('없음 (void)', 'None (void)'), change: t('a.energy만 10 증가', 'Only a.energy increases by 10'), when: t('생성된 객체를 나중에 충전할 때', 'Charging an existing object later') },
        ],
        scene: { theme: 'classes', widgets: [
          { type: 'label', x: 80, y: 10, text: t('복사 출고', 'Copy at assembly') },
          { type: 'objects', x: 16, y: 22, w: 84, pitchX: 40, class: 'Robot', battery: 'energy', max: 100, slots: 2 },
          { type: 'value', x: 96, y: 24, path: 'a.energy', icon: 'cell', side: true }, { type: 'value', x: 96, y: 46, path: 'b.energy', icon: 'cell', side: true },
          { type: 'facility', x: 24, y: 56, kind: 'workshop', label: t('조립 공방', 'Assembly shop') },
        ] },
      },
      {
        id: '6-4',
        title: t('보호된 전력', 'Protected Energy'),
        zone,
        sceneIdle: t('전력 필드는 외부 직접 접근이 잠겨 있습니다. 공개 충전 메서드가 조건을 통과하면 A 게이지가 오릅니다.', 'The energy field is closed to direct outside access. A’s gauge rises when the public charge method accepts the amount.'),
        reward: { item: 'shield', name: t('전력 보호막', 'Energy Shield') },
        goal: t('공개 메서드로 30에 20을 충전해 50을 만들고 100을 넘거나 음수인 충전은 막으세요.', 'Charge 30 by 20 through the public method to reach 50; reject negative or over-capacity charges.'),
        done: t('30에 20을 충전하면 완료입니다. 100 초과, 음수, 정확히 100인 경우에도 규칙이 맞으면 적용 확인입니다.', 'Charge 30 by 20 to complete the mission; apply the rule to over-capacity, negative, and exactly-full cases.'),
        reuse: t('외부 접근 제한과 공개 메서드의 조건 검사를 함께 써 상태를 보호합니다.', 'Protect state with both access control and a condition inside a public method.'),
        lecture: { pages: t('Lecture 6, p.59~62', 'Lecture 6, pp. 59–62'), quotes: [
          'Define where your fields/methods can be accessed from',
          'private: can only be accessed within the class',
          'Use getters to allow read-only access to private fields',
        ] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('충전 보호', 'Guard charging'),
          template: t([
            'class Robot {',
            'private:',
            '    int energy; // 잠긴 전력',
            'public:',
            '    Robot(int initial) {',
            '        energy = initial;',
            '    }',
            '    void charge(int amount) {',
            '        if ({condition}) {',
            '            energy += amount;',
            '        }',
            '    }',
            '    int getEnergy() {',
            '        return energy;',
            '    }',
            '};',
            'int main() {',
            '    Robot a({start});',
            '    {call}',
            '    int reading = a.getEnergy(); // 표시 전력',
            '    return 0;',
            '}',
          ].join('\n'), [
            'class Robot {',
            'private:',
            '    int energy; // protected energy',
            'public:',
            '    Robot(int initial) {',
            '        energy = initial;',
            '    }',
            '    void charge(int amount) {',
            '        if ({condition}) {',
            '            energy += amount;',
            '        }',
            '    }',
            '    int getEnergy() {',
            '        return energy;',
            '    }',
            '};',
            'int main() {',
            '    Robot a({start});',
            '    {call}',
            '    int reading = a.getEnergy(); // displayed energy',
            '    return 0;',
            '}',
          ].join('\n')),
          params: ['start', 'amount'],
          blanks: {
            condition: [
              { code: 'amount > 0 && amount <= 100 - energy' },
              opt('amount > 0', '양수만 확인하면 100을 넘는 충전도 허용합니다.', 'Checking only positivity allows charging past 100.', 'chargeRule'),
              opt('amount > 0 && amount < 100 - energy', '남은 용량과 같은 충전을 잘못 거부합니다.', 'This incorrectly rejects a charge exactly equal to the remaining capacity.', 'chargeRule'),
            ],
            call: [
              { code: 'a.charge({amount});' },
              opt('a.energy += {amount};', 'private 필드는 클래스 밖에서 직접 접근할 수 없습니다.', 'A private field cannot be accessed directly outside the class.', 'access'),
              opt('a.getEnergy();', '조회는 충전하지 않으므로 허용된 양도 증가하지 않습니다.', 'Reading energy does not apply an allowed charge.', 'methodChoice'),
            ],
          },
          tests: [
            { label: t('30에서 20 충전', 'Charge 20 from 30'), params: { start: 30, amount: 20 } },
            { label: t('95에서 20 충전', 'Charge 20 from 95'), params: { start: 95, amount: 20 } },
            { label: t('20에서 -5 충전', 'Charge -5 from 20'), params: { start: 20, amount: -5 } },
            { label: t('80에서 20 충전', 'Charge 20 from 80'), params: { start: 80, amount: 20 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const { start, amount } = test.params;
            const expected = start + (amount > 0 && amount <= 100 - start ? amount : 0);
            const a = h.cell(result, 'a.energy'), reading = h.cell(result, 'reading');
            const av = a ? Number(a.shown) : NaN, rv = reading ? Number(reading.shown) : NaN;
            const call = h.steps(result).flatMap(s => s.events || []).find(e => e.type === 'call' && /(?:^|::)charge$/.test(e.fn));
            const pass = av === expected && rv === expected && call && call.object === 'a';
            return { pass: !!pass, kind: 'logic', errorType: pass ? undefined : (!call ? 'methodChoice' : 'chargeRule'),
              message: h.t(`${test.label}: a.energy=${av}, reading=${rv}, 충전 대상=${call ? call.object : '없음'}. 목표는 두 값 ${expected}, 대상 a입니다.`, `${test.label}: a.energy=${av}, reading=${rv}, charge target=${call ? call.object : 'none'}. Goal: both values ${expected}, target a.`) };
          },
        }],
        hints: [
          t('9번 줄의 조건과 19번 줄의 호출을 함께 확인하세요.', 'Inspect the condition on line 9 and the call on line 19 together.'),
          t('private는 외부 접근을 제한할 뿐입니다. 100 상한은 메서드의 조건이 지킵니다.', 'private limits outside access; the condition in the method enforces the 100 limit.'),
          t('9번 줄은 양수이면서 남은 용량 이하인지 검사하고, 19번 줄은 a.charge를 호출합니다.', 'Line 9 checks for a positive amount no larger than remaining capacity; line 19 calls a.charge.'),
          t('amount > 0 && amount <= 100 - energy로 검사하고 a.charge(충전량);을 사용합니다. 직접 a.energy를 쓰면 컴파일 오류입니다.', 'Use amount > 0 && amount <= 100 - energy and a.charge(amount); direct access to a.energy is a compile error.'),
        ],
        tools: [
          { name: 'private: int energy;', target: t('Robot의 전력 필드', 'Robot energy field'), input: t('접근 지정자 private', 'private access specifier'), result: t('클래스 외부 직접 접근 불가', 'Direct access from outside the class is forbidden'), change: t('접근 범위만 제한, 값 검사는 하지 않음', 'Limits access, but does not validate values'), when: t('외부에서 필드를 직접 수정하지 못하게 할 때', 'Preventing direct external field changes') },
          { name: 'a.charge(amount)', target: t('객체 a', 'Object a'), input: t('충전량', 'Charge amount'), result: t('없음 (void)', 'None (void)'), change: t('양수이며 100 이하가 될 때만 전력 증가', 'Increases energy only for positive amounts that stay at or below 100'), when: t('검사한 양만 충전할 때', 'Charging only an allowed amount') },
          { name: 'a.getEnergy()', target: t('객체 a', 'Object a'), input: t('없음', 'None'), result: t('현재 전력 (int)', 'Current energy (int)'), change: t('없음', 'None'), when: t('비공개 전력을 읽을 때', 'Reading private energy') },
        ],
        scene: { theme: 'classes', widgets: [
          { type: 'label', x: 80, y: 10, text: t('전력 보호', 'Energy guard') },
          { type: 'objects', x: 16, y: 22, w: 84, pitchX: 40, class: 'Robot', battery: 'energy', max: 100, slots: 1 },
          { type: 'value', x: 96, y: 24, path: 'a.energy', icon: 'cell', side: true }, { type: 'value', x: 96, y: 46, path: 'reading', icon: 'chip', side: true },
          { type: 'facility', x: 24, y: 56, kind: 'workshop', label: t('조립 공방', 'Assembly shop') },
        ] },
      },
    ],
  });
})(this);
