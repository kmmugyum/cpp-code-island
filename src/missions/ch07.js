(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const wrong = (code, ko, en, errorType, label) => ({ code, why: t(ko, en), errorType, ...(label ? { label: t(...label) } : {}) });
  const zone = t('전문 로봇 훈련장', 'Specialist Robot Training Ground');

  // 코드 문자열은 한 벌로 쓰고, 한국어 화면에서는 주석만 한국어로 바꾼다(코드와 줄 번호는 같다)
  const KO_COMMENTS = {
    'specialist robot': '전문 로봇',
    'shared energy': '공통 전력',
    'repair capacity': '수리량',
    'battery inside the robot': '로봇 안의 배터리',
    'actual specialist': '실제 전문 로봇',
    'control pointer': '관제 포인터',
    'work contract': '작업 계약',
    'concrete specialist': '구체적인 전문 로봇',
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
    no: 7,
    zone,
    errorTypes: {
      relationship: t('상속과 포함 관계', 'Inheritance and composition'),
      dispatch: t('가상 함수 호출', 'Virtual dispatch'),
      abstractContract: t('추상 작업 계약', 'Abstract work contract'),
    },
    codeErrorTypes: { abstractInstantiation: 'abstractContract', noSuchMember: 'relationship' },
    missions: [
      {
        id: '7-1',
        title: t('공통 로봇 만들기', 'Build a Common Robot'),
        zone,
        sceneIdle: t('수리 로봇이 공통 전력과 자신의 수리량을 기다립니다. 실행하면 두 칸과 훈련장이 반응합니다.', 'The repair robot awaits its shared energy and its own repair capacity. Running fills both cells and activates the training ground.'),
        reward: { item: 'blueprint', name: t('전문 로봇 설계도', 'Specialist Blueprint') },
        goal: t('RepairRobot을 Robot의 한 종류로 만들고 전력 30과 수리량 5를 기록하세요.', 'Make RepairRobot a kind of Robot and record energy 30 and repair capacity 5.'),
        done: t('두 값 30과 5가 기록되면 완료입니다. 60과 9에서도 맞으면 적용 확인입니다.', 'Record 30 and 5 to complete the mission; check 60 and 9 to apply it.'),
        reuse: t('전문 타입이 공통 타입의 한 종류일 때 공개 상속을 쓰고, 단순한 중복만으로 상속을 결정하지 않습니다.', 'Use public inheritance for a genuine is-a relationship, not merely to remove duplication.'),
        lecture: { pages: t('Lecture 7, p.2~3', 'Lecture 7, pp. 2–3'), quotes: ['Inheritance allows us to define hierarchies of related classes.', 'Class Car inherits from class Vehicle. This is equivalent to saying that Car is a derived class, while Vehicle is its base class.'] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('수리 로봇 조립', 'Assemble a repair robot'),
          template: [
            '#include <iostream>',
            'class Robot {',
            'public:',
            '    int energy;',
            '};',
            'class RepairRobot {relation} {',
            'public:',
            '    int repair;',
            '};',
            'int main() {',
            '    RepairRobot a;  // specialist robot',
            '    a.energy = {energy};  // shared energy',
            '    a.repair = {amount};  // repair capacity',
            '    int reading = {reading};',
            "    std::cout << a.energy << ' ' << reading << '\\n';",
            '    return 0;',
            '}',
          ].join('\n'),
          params: ['energy', 'amount'],
          blanks: {
            relation: [
              { code: ': public Robot' },
              wrong('', '기반 클래스가 없으면 RepairRobot에 공통 energy가 없습니다.', 'Without a base class RepairRobot has no shared energy.', 'relationship', ['상속 없음', 'No inheritance']),
            ],
            reading: [
              { code: 'a.repair' },
              wrong('a.energy', '수리량 대신 공통 전력을 읽었습니다.', 'This reads shared energy instead of repair capacity.', 'relationship'),
            ],
          },
          tests: [
            { label: t('전력 30 · 수리량 5', 'Energy 30 · repair 5'), params: { energy: 30, amount: 5 } },
            { label: t('전력 60 · 수리량 9', 'Energy 60 · repair 9'), params: { energy: 60, amount: 9 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const energy = h.cell(result, 'a.energy');
            const repair = h.cell(result, 'a.repair');
            const reading = h.cell(result, 'reading');
            const values = [energy, repair, reading].map(c => c ? Number(c.value ?? c.shown) : NaN);
            const expected = [test.params.energy, test.params.amount, test.params.amount];
            const out = h.numbersIn(result.output);
            const pass = values.every((v, i) => v === expected[i]) && out[0] === expected[0] && out[1] === expected[1];
            return { pass, kind: 'logic', errorType: pass ? undefined : 'relationship', got: values[2], expected: expected[2], message: h.t(`${test.label}: a의 전력/수리량과 reading은 ${values.join('/')}이고 출력은 ${result.output.trim()}입니다. 목표는 ${expected.join('/')}입니다.`, `${test.label}: a's energy/repair and reading are ${values.join('/')}, output ${result.output.trim()}. The goal is ${expected.join('/')}.`) };
          },
        }],
        hints: [
          t('6번 줄의 클래스 관계와 14번 줄의 읽는 대상을 살펴보세요.', 'Inspect the class relationship on line 6 and the value read on line 14.'),
          t('공개 상속은 is-a 관계입니다. 수리 로봇은 로봇이고 수리량은 별도 필드입니다.', 'Public inheritance expresses is-a. A repair robot is a robot and has its own repair field.'),
          t('6번 줄에는 : public Robot, 14번 줄에는 a.repair를 넣으세요.', 'Use : public Robot on line 6 and a.repair on line 14.'),
          t('RepairRobot은 Robot의 energy를 물려받고 repair를 추가합니다. 단순히 코드가 비슷하다고 항상 상속하지는 않습니다.', 'RepairRobot inherits energy from Robot and adds repair. Similar code alone does not always justify inheritance.'),
        ],
        tools: [
          { name: ': public Robot', target: t('RepairRobot 설계도', 'RepairRobot class'), input: t('기반 클래스 Robot', 'Base class Robot'), result: t('공개 is-a 관계', 'Public is-a relationship'), change: t('기반 멤버를 사용 가능', 'Base members become available'), when: t('전문 로봇이 로봇의 한 종류일 때', 'When a specialist is a kind of robot') },
          { name: 'a.repair', target: t('수리 로봇 a', 'Repair robot a'), input: t('없음', 'None'), result: t('수리량 값', 'Repair capacity'), change: t('읽기만 하면 변화 없음', 'Reading alone changes nothing'), when: t('전문 필드를 확인할 때', 'Reading the specialist field') },
        ],
        scene: { theme: 'oop', widgets: [
          { type: 'zone', kind: 'mat', x: 12, y: 10, w: 44, h: 44 },
          { type: 'objects', x: 20, y: 16, w: 40, class: 'Robot', battery: 'energy', max: 100, slots: 1 },
          { type: 'value', x: 66, y: 16, path: 'a.energy', icon: 'cell', side: true }, { type: 'value', x: 66, y: 36, path: 'a.repair', icon: 'wrench', side: true },
          { type: 'monitor', x: 10, y: 60, w: 70, h: 24 }, { type: 'facility', x: 114, y: 56, kind: 'workshop', label: t('특수 로봇 공방', 'Specialist shop') },
        ] },
      },
      {
        id: '7-2',
        title: t('배터리는 누구인가', 'What Is a Battery?'),
        zone,
        sceneIdle: t('로봇 안의 배터리 전력과 관제 읽기 값이 비어 있습니다. 멤버 객체가 채워지면 두 칸이 반응합니다.', 'The robot’s battery and control reading are empty. Both cells respond when the member object is filled.'),
        reward: { item: 'cell', name: t('배터리 홀더', 'Battery Holder') },
        goal: t('Robot이 Battery를 상속하지 않고 멤버로 소유해 전력 35를 읽도록 하세요.', 'Give Robot a Battery member rather than inheriting Battery, and read energy 35.'),
        done: t('배터리 멤버에서 35를 읽으면 완료입니다. 전력 80도 같은 경로로 읽으면 적용 확인입니다.', 'Read 35 from the battery member to complete the mission; read 80 through the same path to apply it.'),
        reuse: t('어떤 물건이 다른 종류의 부품을 가진다면 상속 대신 멤버 객체를 고려합니다.', 'When an object has a component of another type, consider a member object instead of inheritance.'),
        lecture: { pages: t('Lecture 7, p.4', 'Lecture 7, p. 4'), quotes: ['Inheritance allows us to define “is-a” relationships, but it should not be used to implement “has-a” relationships.', '“Has-a” relationships should be implemented by declaring data members, not by inheritance.'] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('배터리 장착', 'Install a battery'),
          template: [
            '#include <iostream>',
            'class Battery {',
            'public:',
            '    int energy;',
            '};',
            'class Robot {relation} {',
            'public:',
            '    {member}  // battery inside the robot',
            '};',
            'int main() {',
            '    Robot a;',
            '    a.battery.energy = {energy};',
            '    int reading = a.battery.energy;',
            "    std::cout << reading << '\\n';",
            '    return 0;',
            '}',
          ].join('\n'),
          params: ['energy'],
          blanks: {
            relation: [
              { code: '', label: t('상속 없음', 'No inheritance') },
              wrong(': public Battery', '로봇은 배터리가 아닙니다. 배터리를 멤버로 갖는 것과 상속은 다릅니다.', 'A robot is not a battery. Having a battery member is not inheritance.', 'relationship'),
            ],
            member: [
              { code: 'Battery battery;' },
              wrong('int battery;', '정수 멤버에는 energy 필드가 없습니다.', 'An integer member has no energy field.', 'relationship'),
            ],
          },
          tests: [
            { label: t('배터리 전력 35', 'Battery energy 35'), params: { energy: 35 } },
            { label: t('배터리 전력 80', 'Battery energy 80'), params: { energy: 80 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const cell = h.cell(result, 'a.battery.energy');
            const reading = h.cell(result, 'reading');
            const extra = h.cell(result, 'a.energy');
            const got = cell ? Number(cell.value ?? cell.shown) : NaN;
            const read = reading ? Number(reading.value ?? reading.shown) : NaN;
            const pass = got === test.params.energy && read === got && !extra && h.lastNumber(result.output) === got;
            return { pass, kind: 'logic', errorType: pass ? undefined : 'relationship', got: read, expected: test.params.energy, message: h.t(`${test.label}: a.battery.energy=${got}, reading=${read}, 상속된 a.energy=${extra ? '있음' : '없음'}; 목표는 멤버 값 ${test.params.energy}이며 배터리를 상속하지 않는 것입니다.`, `${test.label}: a.battery.energy=${got}, reading=${read}, inherited a.energy=${extra ? 'present' : 'absent'}; the goal is member value ${test.params.energy} without inheriting Battery.`) };
          },
        }],
        hints: [
          t('6번 줄의 기반 클래스와 8번 줄의 배터리 선언을 비교하세요.', 'Compare the base class on line 6 with the battery declaration on line 8.'),
          t('로봇은 배터리가 아니라 배터리를 가집니다. has-a는 멤버로 표현합니다.', 'A robot has a battery; it is not a battery. Express has-a with a member.'),
          t('6번 줄에서는 상속을 비우고 8번 줄에 Battery battery;를 넣습니다.', 'Leave inheritance empty on line 6 and put Battery battery; on line 8.'),
          t('a.battery.energy는 a 안의 Battery 객체의 필드입니다. Robot을 Battery로 만드는 것은 다른 관계입니다.', 'a.battery.energy is a field of the Battery inside a. Making Robot a Battery expresses a different relationship.'),
        ],
        tools: [
          { name: 'Battery battery;', target: t('Robot 설계도', 'Robot class'), input: t('Battery 타입', 'Battery type'), result: t('Battery 멤버 객체', 'Battery member object'), change: t('각 Robot에 배터리 포함', 'Each Robot contains a battery'), when: t('로봇이 배터리를 가질 때', 'When a robot has a battery') },
          { name: 'a.battery.energy', target: t('a 내부의 배터리', 'Battery inside a'), input: t('필드 이름 energy', 'Field name energy'), result: t('해당 배터리의 전력', 'That battery’s energy'), change: t('대입하면 해당 필드 변경', 'Assignment changes that field'), when: t('포함된 객체의 상태를 다룰 때', 'Accessing state in a contained object') },
        ],
        scene: { theme: 'oop', widgets: [
          { type: 'zone', kind: 'mat', x: 12, y: 10, w: 44, h: 44 },
          { type: 'objects', x: 20, y: 16, w: 40, class: 'Robot', slots: 1 },
          { type: 'battery', x: 66, y: 18, path: 'a.battery.energy', max: 100, w: 44, h: 12 }, { type: 'value', x: 66, y: 40, path: 'reading', icon: 'chip', side: true },
          { type: 'facility', x: 122, y: 14, kind: 'machine', label: t('배터리 장치', 'Battery unit') }, { type: 'monitor', x: 10, y: 60, w: 70, h: 24 },
        ] },
      },
      {
        id: '7-3',
        title: t('관제 명령 전달', 'Dispatch a Work Command'),
        zone,
        sceneIdle: t('관제 포인터 p가 수리 로봇을 가리킬 준비를 합니다. 호출하면 실제 객체 배지와 호출 방식, 두 결과가 반응합니다.', 'Control pointer p is ready to point at a repair robot. Calls highlight the actual object, dispatch, and both results.'),
        reward: { item: 'badge', name: t('관제 호출 배지', 'Dispatch Badge') },
        goal: t('기반 포인터로 수리 로봇에 두 번 명령해 두 결과를 모두 7로 만드세요.', 'Send two commands to a repair robot through a base pointer and get 7 from both.'),
        done: t('두 표기에서 수리 작업 7이 호출되면 완료입니다. 작업량 12에서도 맞으면 적용 확인입니다.', 'Complete the mission when both forms invoke repair work and return 7; apply it again with work value 12.'),
        reuse: t('서로 다른 로봇에 공통 포인터로 명령할 때 가상 함수로 실제 객체의 행동을 선택합니다.', 'Use a virtual function to select the actual object’s behavior when commanding different robots through a common pointer.'),
        lecture: { pages: t('Lecture 7, p.5~6', 'Lecture 7, pp. 5–6'), quotes: ['Selecting the correct function at runtime is called dynamic dispatch.', 'ptr->member is equivalent to (*ptr).member.'] },
        kind: 'blanks',
        predict: {
          intro: t('virtual이 없는 경우와 있는 경우, Robot 포인터가 가리키는 RepairRobot의 결과를 각각 예상하세요.', 'Predict the result through a Robot pointer to a RepairRobot without and with virtual.'),
          program: [
            '#include <iostream>',
            'class Robot {',
            'public:',
            '    int work() { return 1; }',
            '};',
            'class RepairRobot : public Robot {',
            'public:',
            '    int work() { return 7; }',
            '};',
            'class VirtualRobot {',
            'public:',
            '    virtual int work() { return 1; }',
            '};',
            'class VirtualRepair : public VirtualRobot {',
            'public:',
            '    int work() { return 7; }',
            '};',
            'int main() {',
            '    RepairRobot a;',
            '    Robot* p = &a;',
            '    VirtualRepair b;',
            '    VirtualRobot* q = &b;',
            "    std::cout << p->work() << '\\n';",
            "    std::cout << q->work() << '\\n';",
            '    return 0;',
            '}',
          ].join('\n'),
          questions: [
            { label: t('virtual 없는 호출', 'Call without virtual'), options: ['1', '7'] },
            { label: t('virtual 있는 호출', 'Call with virtual'), options: ['1', '7'] },
          ],
          answersFrom: result => result.output.split(/\s+/).filter(Boolean),
          explanation: t('virtual이 없으면 포인터의 정적 타입 Robot의 함수가 선택되고, 있으면 실제 객체의 재정의가 선택됩니다.', 'Without virtual the pointer’s static Robot type selects the function; with virtual the actual object’s override is selected.'),
        },
        variants: [{
          id: 'base', label: t('두 방식으로 작업 요청', 'Request work in two forms'),
          template: [
            '#include <iostream>',
            'class Robot {',
            'public:',
            '    {virtual} int work() { return 1; }',
            '};',
            'class RepairRobot : public Robot {',
            'public:',
            '    int work() { return {amount}; }',
            '};',
            'int main() {',
            '    Robot base;',
            '    RepairRobot repair;  // actual specialist',
            '    Robot* p = {target};  // control pointer',
            '    int arrow = p->work();',
            '    int dot = (*p).work();',
            "    std::cout << arrow << ' ' << dot << '\\n';",
            '    return 0;',
            '}',
          ].join('\n'),
          params: ['amount'],
          blanks: {
            virtual: [
              { code: 'virtual' },
              wrong('', 'virtual이 없으면 Robot 포인터의 정적 타입에 따라 Robot::work가 선택됩니다.', 'Without virtual, the Robot pointer’s static type selects Robot::work.', 'dispatch', ['virtual 없음', 'No virtual']),
            ],
            target: [
              { code: '&repair' },
              wrong('&base', '기반 로봇을 가리키면 실제 객체도 Robot이므로 수리 작업이 선택되지 않습니다.', 'Pointing at the base robot makes the actual object Robot, so repair work is not selected.', 'dispatch'),
            ],
          },
          tests: [
            { label: t('수리 작업량 7', 'Repair work 7'), params: { amount: 7 } },
            { label: t('수리 작업량 12', 'Repair work 12'), params: { amount: 12 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const a = h.cell(result, 'arrow'); const d = h.cell(result, 'dot');
            const arrow = a ? Number(a.value ?? a.shown) : NaN;
            const dot = d ? Number(d.value ?? d.shown) : NaN;
            const events = h.steps(result).flatMap(s => s.events || []).filter(e => e.type === 'dispatch' && e.method === 'work');
            const dispatched = events.length >= 2 && events.every(e => e.static === 'Robot' && e.dynamic === 'RepairRobot' && e.virtual === true);
            const out = h.numbersIn(result.output);
            const pass = arrow === test.params.amount && dot === test.params.amount && dispatched && out[0] === arrow && out[1] === dot;
            const observed = events.map(e => `${e.static}/${e.dynamic}/${e.virtual}`).join(', ') || '?';
            return { pass, kind: 'logic', errorType: pass ? undefined : 'dispatch', got: arrow, expected: test.params.amount, message: h.t(`${test.label}: arrow=${arrow}, dot=${dot}, 호출(정적/동적/virtual)=${observed}, 출력=${result.output.trim()}. 목표는 두 값 ${test.params.amount}과 Robot/RepairRobot/true입니다.`, `${test.label}: arrow=${arrow}, dot=${dot}, dispatch (static/dynamic/virtual)=${observed}, output=${result.output.trim()}. Goal: both values ${test.params.amount} and Robot/RepairRobot/true.`) };
          },
        }],
        hints: [
          t('4번 줄의 함수 선언과 13~15번 줄의 포인터 대상 및 두 호출 결과를 보세요.', 'Inspect the function declaration on line 4, pointer target on line 13, and both calls on lines 14–15.'),
          t('virtual이 있으면 기반 포인터도 실제 객체의 재정의를 선택합니다. 없으면 정적 타입의 함수가 선택됩니다.', 'With virtual, a base pointer selects the actual object’s override. Without it the static type selects the function.'),
          t('4번 줄에 virtual, 13번 줄에 &repair를 넣으세요.', 'Put virtual on line 4 and &repair on line 13.'),
          t('p->work()와 (*p).work()는 같은 호출입니다. 이미 있는 객체의 주소를 쓰므로 new와 delete는 필요하지 않습니다.', 'p->work() and (*p).work() are equivalent. The objects already exist, so no new or delete is needed.'),
        ],
        tools: [
          { name: 'virtual int work()', target: t('Robot의 work', 'Robot work'), input: t('없음', 'None'), result: t('실제 객체의 재정의 선택', 'Selects the actual object’s override'), change: t('함수 선택 방식만 변경', 'Changes function selection'), when: t('기반 포인터로 전문 동작을 호출할 때', 'Calling specialist behavior through a base pointer') },
          { name: 'Robot* p = &repair;', target: t('기존 repair 객체', 'Existing repair object'), input: t('객체의 주소', 'Object address'), result: t('기반 타입 포인터', 'Base-type pointer'), change: t('p가 repair를 가리킴', 'p points at repair'), when: t('공통 인터페이스로 객체를 다룰 때', 'Using a common interface for an object') },
          { name: 'p->work()', target: t('p가 가리키는 객체', 'Object pointed to by p'), input: t('없음', 'None'), result: t('work의 반환값', 'Return value of work'), change: t('이 예제에서는 없음', 'None in this example'), when: t('(*p).work()와 같은 멤버 호출', 'Equivalent member call to (*p).work()') },
        ],
        scene: { theme: 'oop', widgets: [
          { type: 'zone', kind: 'mat', x: 40, y: 6, w: 84, h: 36 },
          { type: 'objects', x: 50, y: 12, w: 80, pitchX: 40, class: 'Robot', slots: 2 },
          { type: 'pointer', x: 22, y: 40, path: 'p' },
          { type: 'value', x: 74, y: 52, path: 'arrow', icon: 'arrow', side: true }, { type: 'value', x: 74, y: 68, path: 'dot', icon: 'arrow', side: true },
          { type: 'facility', x: 132, y: 22, kind: 'tower', label: t('관제 안테나', 'Control mast') }, { type: 'monitor', x: 10, y: 60, w: 50, h: 24 },
        ] },
      },
      {
        id: '7-4',
        title: t('작업 계약', 'Work Contract'),
        zone,
        sceneIdle: t('추상 Robot 계약과 전문 로봇의 작업 결과가 대기 중입니다. 구체 객체의 호출이 작업장과 결과 칸에 표시됩니다.', 'The abstract Robot contract and specialist work result are waiting. A concrete object’s call appears in the workshop and result cell.'),
        reward: { item: 'scroll', name: t('작업 계약서', 'Work Contract Scroll') },
        goal: t('순수 가상 work를 수리 로봇에서 구현하고 전력 10에 작업량 5를 더한 15를 얻으세요.', 'Implement pure virtual work in the repair robot and get 15 by adding 5 to energy 10.'),
        done: t('수리 로봇의 결과 15가 출력되면 완료입니다. 전력 23에서 28도 얻으면 적용 확인입니다.', 'Print the repair robot’s result 15 to complete the mission; get 28 from energy 23 to apply it.'),
        reuse: t('모든 전문 타입이 공통 명령을 구현해야 할 때 기반 클래스에 순수 가상 계약을 둡니다.', 'Use a pure virtual base contract when every concrete specialist must implement a common command.'),
        lecture: { pages: t('Lecture 7, p.6~7', 'Lecture 7, pp. 6–7'), quotes: ['Still, we do want to require every derived class of Vehicle to have this function.', 'We can omit the definition of getDesc from Vehicle by making the function pure virtual via the following odd syntax:'] },
        kind: 'blanks',
        variants: [{
          id: 'base', label: t('계약 구현', 'Implement the contract'),
          template: [
            '#include <iostream>',
            'class Robot {',
            'public:',
            '    int energy;',
            '    int readEnergy() { return energy; }',
            '    virtual int work() = 0;  // work contract',
            '};',
            'class RepairRobot : public Robot {',
            'public:',
            '    {implementation}',
            '};',
            'int main() {',
            '    {object} robot;  // concrete specialist',
            '    robot.energy = {start};',
            '    Robot* p = &robot;',
            '    int result = p->work();',
            "    std::cout << robot.readEnergy() << ' ' << result << '\\n';",
            '    return 0;',
            '}',
          ].join('\n'),
          params: ['start'],
          blanks: {
            implementation: [
              { code: 'int work() { return energy + 5; }' },
              wrong('int repair() { return energy + 5; }', 'work를 구현하지 않으면 RepairRobot도 추상 클래스라 객체를 만들 수 없습니다.', 'Without implementing work, RepairRobot remains abstract and cannot be instantiated.', 'abstractContract'),
              wrong('int work() { return energy; }', 'work는 구현했지만 작업량 5를 더하지 않았습니다.', 'work is implemented, but it does not add the work amount 5.', 'abstractContract'),
            ],
            object: [
              { code: 'RepairRobot' },
              wrong('Robot', '순수 가상 work가 남은 Robot은 추상 클래스라 직접 객체를 만들 수 없습니다.', 'Robot still has pure virtual work, so it is abstract and cannot be instantiated.', 'abstractContract'),
            ],
          },
          tests: [
            { label: t('전력 10 · 작업량 5', 'Energy 10 · work 5'), params: { start: 10 } },
            { label: t('전력 23 · 작업량 5', 'Energy 23 · work 5'), params: { start: 23 } },
          ],
          check(result, test, h) {
            if (!result.ok) return h.simFailure(result);
            const energy = h.cell(result, 'robot.energy'); const value = h.cell(result, 'result');
            const actualEnergy = energy ? Number(energy.value ?? energy.shown) : NaN;
            const got = value ? Number(value.value ?? value.shown) : NaN;
            const events = h.steps(result).flatMap(s => s.events || []).filter(e => e.type === 'dispatch' && e.method === 'work');
            const dispatch = events.some(e => e.static === 'Robot' && e.dynamic === 'RepairRobot' && e.virtual === true);
            const out = h.numbersIn(result.output); const expected = test.params.start + 5;
            const pass = actualEnergy === test.params.start && got === expected && dispatch && out[0] === actualEnergy && out[1] === expected;
            const observed = events.map(e => `${e.static}/${e.dynamic}/${e.virtual}`).join(', ') || '?';
            return { pass, kind: 'logic', errorType: pass ? undefined : 'abstractContract', expected, got, message: h.t(`${test.label}: robot.energy=${actualEnergy}, result=${got}, 호출(정적/동적/virtual)=${observed}, 출력=${result.output.trim()}. 목표는 전력 ${test.params.start}, 결과 ${expected}, Robot/RepairRobot/true입니다.`, `${test.label}: robot.energy=${actualEnergy}, result=${got}, dispatch (static/dynamic/virtual)=${observed}, output=${result.output.trim()}. Goal: energy ${test.params.start}, result ${expected}, Robot/RepairRobot/true.`) };
          },
        }],
        hints: [
          t('6번 줄의 계약, 10번 줄의 구현, 13번 줄의 객체 타입을 보세요.', 'Inspect the contract on line 6, implementation on line 10, and object type on line 13.'),
          t('순수 가상 함수가 구현되지 않은 클래스는 추상 클래스이므로 직접 객체를 만들 수 없습니다.', 'A class with an unimplemented pure virtual function is abstract and cannot be instantiated.'),
          t('10번 줄에 int work() { return energy + 5; }를, 13번 줄에 RepairRobot을 넣으세요.', 'Use int work() { return energy + 5; } on line 10 and RepairRobot on line 13.'),
          t('Robot은 추상 클래스여도 energy 데이터와 구현된 readEnergy를 가집니다. RepairRobot이 work를 구현하면 구체 객체를 만들 수 있습니다.', 'Even abstract Robot has energy data and an implemented readEnergy. Once RepairRobot implements work, a concrete object can be created.'),
        ],
        tools: [
          { name: 'virtual int work() = 0;', target: t('Robot 작업 계약', 'Robot work contract'), input: t('없음', 'None'), result: t('순수 가상 함수 선언', 'Pure virtual function declaration'), change: t('Robot을 추상 클래스로 만듦', 'Makes Robot abstract'), when: t('구체 클래스마다 작업 구현을 요구할 때', 'Requiring concrete classes to implement work') },
          { name: 'int work() { ... }', target: t('RepairRobot 객체', 'RepairRobot object'), input: t('없음', 'None'), result: t('energy + 5 반환', 'Returns energy + 5'), change: t('전력은 바뀌지 않음', 'Energy does not change'), when: t('수리 로봇의 계약을 구현할 때', 'Implementing the repair robot’s contract') },
          { name: 'readEnergy()', target: t('Robot 부분', 'Robot part'), input: t('없음', 'None'), result: t('현재 energy', 'Current energy'), change: t('없음', 'None'), when: t('추상 기반에 공통 구현을 둘 때', 'Sharing an implemented method in an abstract base') },
        ],
        scene: { theme: 'oop', widgets: [
          { type: 'zone', kind: 'mat', x: 40, y: 6, w: 60, h: 36 },
          { type: 'objects', x: 50, y: 12, w: 44, class: 'Robot', battery: 'energy', max: 100, slots: 1 },
          { type: 'pointer', x: 22, y: 40, path: 'p' },
          { type: 'value', x: 74, y: 52, path: 'robot.energy', icon: 'cell', side: true }, { type: 'value', x: 74, y: 68, path: 'result', icon: 'gear', side: true },
          { type: 'facility', x: 118, y: 20, kind: 'workshop', label: t('작업 계약소', 'Contract shop') }, { type: 'monitor', x: 10, y: 60, w: 50, h: 24 },
        ] },
      },
    ],
  }));
})(this);
