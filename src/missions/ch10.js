(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const opt = (code, ko, en, errorType) => ({ code, why: t(ko, en), errorType });
  const zone = t('중앙 관제소', 'Central Control');
  const value = (h, r, path) => { const c = h.cell(r, path); return c ? c.value : undefined; };
  const text = (h, r, path) => { const c = h.cell(r, path); if (!c) return undefined; return typeof c.value === 'string' ? c.value : String(c.shown).replace(/^"([\s\S]*)"$/, '$1'); };
  const STATES = { IDLE: 0, READY: 1, FAILED: 2 };
  const stateOf = (h, r, path) => { const c = h.cell(r, path); if (!c) return NaN; const raw = c.value !== undefined && c.value !== null ? c.value : c.shown; return typeof raw === 'number' ? raw : raw in STATES ? STATES[raw] : Number(raw); };
  const events = (h, r, type) => h.steps(r).flatMap(s => s.events || []).filter(e => e.type === type);
  const exception = e => (e.exception === 'runtime_error' || e.exception === 'std::runtime_error') && e.what === 'bad power';

  M.registerChapter({
    no: 10,
    zone,
    errorTypes: {
      fileSave: t('파일에 기록할 값', 'Value written to file'),
      fileRestore: t('파일에서 복원', 'Restoring from file'),
      lineInput: t('한 줄 입력', 'Line input'),
      wordInput: t('단어 입력', 'Word input'),
      stateChoice: t('열거 상태 선택', 'Enum state choice'),
      stateCondition: t('상태 전환 조건', 'State transition condition'),
      constQuery: t('읽기 전용 조회', 'Const query'),
      managerTarget: t('관리자 대상', 'Manager target'),
      throwChoice: t('예외 발생', 'Throwing an exception'),
      catchChoice: t('예외 처리', 'Handling an exception'),
      restoreConnection: t('복원 연결', 'Restore connection'),
      reportChoice: t('복원 결과 보고', 'Restore reporting'),
    },
    codeErrorTypes: { constViolation: 'constQuery', uncaughtException: 'catchChoice' },
    missions: [
      {
        id: '10-1', title: t('기록 보관소', 'Records Archive'), zone,
        sceneIdle: t('가상 파일 보관함은 비어 있고 power 태그가 입력을 기다립니다. 파일 기록 후 전력을 0으로 바꾼 뒤 복원합니다. 이 파일은 브라우저 진도 저장소가 아닙니다.', 'The virtual cabinet starts empty and power awaits input. After writing the file, power becomes 0 and is restored. This file is not browser progress storage.'),
        reward: { item: 'disk', name: t('복원 기록 디스크', 'Restore Record Disk') },
        goal: t('입력한 전력을 robot.txt에 기록하고 0으로 바꾼 다음 저장한 값으로 복원하세요.', 'Save the entered power to robot.txt, change it to 0, and restore the saved value.'),
        done: t('전력 8을 저장하고 복원하면 완료입니다. 13과 27도 복원하면 적용 확인입니다.', 'Save and restore power 8 to complete; restore 13 and 27 as well to apply it.'),
        reuse: t('상태를 파일에 기록했다가 나중에 읽을 때 출력 스트림과 입력 스트림을 구분합니다.', 'Use separate output and input streams when saving state and reading it back.'),
        lecture: { pages: t('Lecture 10, p.1', 'Lecture 10, p. 1'), quotes: [
          'Each open file is represented by a separate ifstream or an ofstream object.',
          'Close your files using the close() method when you’re done using them.',
        ] },
        predict: { intro: t('전력 8을 저장하고 power를 0으로 바꾼 뒤 파일에서 읽으면 power는 얼마일까요?', 'If power 8 is saved, changed to 0, then read from the file, what is power?'), questions: [{ label: t('복원 전력', 'Restored power'), number: true }], answersFrom: () => ['8'] },
        kind: 'blanks', variants: [{
          id: 'base', label: t('저장하고 복원', 'Save and restore'),
          template: t([
            '#include <iostream>', '#include <fstream>', 'using namespace std;', '', 'int main() {',
            '    int power;', '    cin >> power; // 입력 전력', '    ofstream out("robot.txt");', '    out << {save}; // 가상 파일에 기록', '    out.close();', '    power = 0; // 상태 변경', '    ifstream in("robot.txt");', '    {restore}', '    in.close();', '    cout << power << endl;', '}',
          ].join('\n'), [
            '#include <iostream>', '#include <fstream>', 'using namespace std;', '', 'int main() {',
            '    int power;', '    cin >> power; // input power', '    ofstream out("robot.txt");', '    out << {save}; // write to the virtual file', '    out.close();', '    power = 0; // change the state', '    ifstream in("robot.txt");', '    {restore}', '    in.close();', '    cout << power << endl;', '}',
          ].join('\n')),
          blanks: {
            save: [{ code: 'power' }, opt('0', '0을 기록하면 입력 전력이 파일에 남지 않습니다.', 'Writing 0 does not save the input power.', 'fileSave')],
            restore: [{ code: 'in >> power;' }, opt('power = 0;', '대입은 파일을 읽지 않으므로 저장값을 복원하지 못합니다.', 'Assignment does not read the file or restore its value.', 'fileRestore')],
          },
          tests: [{ label: t('전력 8', 'Power 8'), input: '8' }, { label: t('전력 13', 'Power 13'), input: '13' }, { label: t('전력 27', 'Power 27'), input: '27' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), p = Number(value(h, r, 'power')), file = r.files['robot.txt'];
            const reads = events(h, r, 'file').filter(e => e.op === 'read' && e.name === 'robot.txt').length;
            const writes = events(h, r, 'file').filter(e => e.op === 'write' && e.name === 'robot.txt').length;
            const pass = file === String(n) && p === n && reads > 0 && writes > 0;
            return { pass, kind: 'logic', errorType: pass ? undefined : file !== String(n) ? 'fileSave' : 'fileRestore', message: h.t(`${test.label}: 파일=${JSON.stringify(file)}, power=${p}, 읽기 ${reads}회, 쓰기 ${writes}회입니다. 파일과 power가 ${n}이고 각각 읽고 써야 합니다.`, `${test.label}: file=${JSON.stringify(file)}, power=${p}, ${reads} reads and ${writes} writes. Both file and power must be ${n}, with a read and a write.`) };
          },
        }],
        hints: [
          t('9번 줄의 기록 값과 13번 줄의 복원 동작을 살펴보세요.', 'Inspect the value written on line 9 and the restore operation on line 13.'),
          t('ofstream은 쓰고 ifstream은 읽습니다. power를 바꾼 뒤에도 파일 내용은 남습니다.', 'An ofstream writes and an ifstream reads. The file remains after power changes.'),
          t('9번 줄에 power, 13번 줄에 in >> power를 사용하세요.', 'Use power on line 9 and in >> power on line 13.'),
          t('out << power로 저장하고 in >> power로 파일의 정수를 같은 변수에 다시 넣습니다.', 'Save with out << power, then read the integer back into that variable with in >> power.'),
        ],
        tools: [
          { name: 'out << power', target: t('출력 파일 robot.txt', 'Output file robot.txt'), input: t('현재 전력', 'Current power'), result: t('파일에 정수 기록', 'Integer written to file'), change: t('가상 파일 내용', 'Virtual file content'), when: t('상태를 보관할 때', 'Saving state') },
          { name: 'in >> power', target: t('입력 파일 robot.txt', 'Input file robot.txt'), input: t('파일의 정수', 'Integer in the file'), result: t('읽은 전력', 'Read power'), change: t('power와 읽기 위치', 'power and the read position'), when: t('저장한 전력을 복원할 때', 'Restoring saved power') },
          { name: 'close()', target: t('열린 파일 스트림', 'Open file stream'), input: t('없음', 'None'), result: t('스트림 닫힘', 'Stream closed'), change: t('열린 파일 연결 해제', 'Releases the open file connection'), when: t('파일 작업을 마쳤을 때', 'Finished with a file') },
        ],
        scene: { theme: 'control', widgets: [
          { type: 'zone', kind: 'tray', x: 12, y: 56, w: 136, h: 6 },
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 35], [46, 35]], on: ['power'] }, { type: 'wire', pts: [[64, 35], [74, 35], [74, 22], [84, 22]], on: ['power'] }, { type: 'wire', pts: [[102, 22], [108, 22], [108, 50], [112, 50]], on: ['power'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'value', path: 'power', x: 46, y: 28, icon: 'cell' },
          { type: 'files', x: 84, y: 10 },
          { type: 'facility', kind: 'building', x: 112, y: 36, label: t('기록 보관소', 'Records archive') },
          { type: 'monitor', x: 12, y: 64, w: 70, h: 20 }, { type: 'prop', kind: 'lamp', x: 132, y: 68 },
        ] },
      },
      {
        id: '10-2', title: t('관제 입력', 'Control Input'), zone,
        sceneIdle: t('키보드에서 단어와 공백이 있는 명령을 따로 읽습니다. 다음 체크포인트에서는 관제 상태 태그가 바뀝니다.', 'The keyboard supplies a word and a command containing spaces. In the next checkpoint the control-state tag changes.'),
        reward: { item: 'flag', name: t('관제 상태 깃발', 'Control State Flag') },
        goal: t('한 단어 호출명과 공백을 포함한 명령을 읽고, 별도 체크포인트에서 READY와 FAILED 상태를 고르세요.', 'Read a one-word call sign and a command with spaces, then select READY or FAILED in a separate checkpoint.'),
        done: t('호출명과 명령 전체를 읽으면 완료입니다. 별도 상태 체크포인트에서 양수와 음수를 구분하면 적용 확인입니다.', 'Reading the call sign and complete command completes the mission; distinguish positive and negative values in the separate state checkpoint to apply it.'),
        reuse: t('공백 포함 입력은 getline으로 읽고 제한된 상태에는 이름 붙은 enum 값을 사용합니다.', 'Use getline for text with spaces and named enum values for a fixed set of states.'),
        lecture: { pages: t('Lecture 10, p.2~3', 'Lecture 10, pp. 2–3'), quotes: [
          'However, this method only reads up to the first whitespace; it stops at any tab, space, newline, etc.',
          'The first item defaults to 0.', 'Every other item defaults to the previous item plus 1.',
        ] },
        kind: 'blanks', apply: 'variant', variants: [{
          id: 'base', label: t('단어와 명령', 'Word and command'),
          template: t([
            '#include <iostream>', '#include <string>', 'using namespace std;', '', 'int main() {', '    string callSign;', '    string command;', '    {word}', '    cin.ignore(); // 단어 뒤 줄바꿈 제거', '    {line}', '    cout << callSign << endl;', '    cout << command << endl;', '}',
          ].join('\n'), [
            '#include <iostream>', '#include <string>', 'using namespace std;', '', 'int main() {', '    string callSign;', '    string command;', '    {word}', '    cin.ignore(); // discard the newline after the word', '    {line}', '    cout << callSign << endl;', '    cout << command << endl;', '}',
          ].join('\n')),
          blanks: {
            word: [{ code: 'cin >> callSign;' }, opt('callSign = "A";', '고정 호출명은 다른 입력을 읽지 않으며 줄바꿈도 제거하지 못합니다.', 'A fixed call sign does not read the input or leave the expected newline.', 'wordInput')],
            line: [{ code: 'getline(cin, command);' }, opt('cin >> command;', '>>는 첫 공백 앞의 단어만 읽습니다.', 'Extraction reads only the word before the first space.', 'lineInput')],
          },
          tests: [{ label: t('A와 repair gate', 'A and repair gate'), input: 'A\nrepair gate\n', callSign: 'A', command: 'repair gate' }, { label: t('B와 open north door', 'B and open north door'), input: 'B\nopen north door\n', callSign: 'B', command: 'open north door' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const call = text(h, r, 'callSign'), command = text(h, r, 'command');
            const pass = call === test.callSign && command === test.command;
            return { pass, kind: 'logic', errorType: pass ? undefined : call !== test.callSign || command === '' ? 'wordInput' : 'lineInput', message: h.t(`${test.label}: callSign=${JSON.stringify(call)}, command=${JSON.stringify(command)}입니다. 목표는 ${test.callSign}와 ${JSON.stringify(test.command)} 전체입니다.`, `${test.label}: callSign=${JSON.stringify(call)}, command=${JSON.stringify(command)}. Goal: ${test.callSign} and the whole ${JSON.stringify(test.command)}.`) };
          },
        }, {
          id: 'apply', label: t('관제 상태', 'Control state'),
          template: t([
            '#include <iostream>', 'using namespace std;', 'enum State { IDLE, READY, FAILED };', '', 'int main() {', '    int signal;', '    cin >> signal;', '    State state = IDLE; // 초기 대기 상태', '    if ({condition}) {', '        state = {positive};', '    } else if (signal < 0) {', '        state = FAILED;', '    }', '    cout << state << endl;', '}',
          ].join('\n'), [
            '#include <iostream>', 'using namespace std;', 'enum State { IDLE, READY, FAILED };', '', 'int main() {', '    int signal;', '    cin >> signal;', '    State state = IDLE; // initial idle state', '    if ({condition}) {', '        state = {positive};', '    } else if (signal < 0) {', '        state = FAILED;', '    }', '    cout << state << endl;', '}',
          ].join('\n')),
          blanks: {
            condition: [{ code: 'signal > 0' }, opt('signal >= 0', '0은 준비가 아니라 IDLE로 남아야 합니다.', 'Zero must remain IDLE, not become ready.', 'stateCondition')],
            positive: [{ code: 'READY' }, opt('FAILED', '양수 신호는 FAILED가 아니라 READY입니다.', 'A positive signal means READY, not FAILED.', 'stateChoice')],
          },
          tests: [{ label: t('양수 2', 'Positive 2'), input: '2' }, { label: t('경계 0', 'Boundary 0'), input: '0' }, { label: t('음수 -3', 'Negative -3'), input: '-3' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), actual = stateOf(h, r, 'state'), expected = n > 0 ? 1 : n < 0 ? 2 : 0, pass = actual === expected;
            return { pass, kind: 'logic', errorType: pass ? undefined : n === 0 ? 'stateCondition' : 'stateChoice', message: h.t(`${test.label}: state=${actual}입니다. 목표는 IDLE=0, READY=1, FAILED=2 중 ${expected}입니다.`, `${test.label}: state=${actual}. Goal: ${expected}, where IDLE=0, READY=1 and FAILED=2.`) };
          },
        }],
        hints: [
          t('첫 체크포인트의 8~10번 줄과 다음 체크포인트의 9~12번 줄을 비교하세요.', 'Compare lines 8–10 in the first checkpoint and lines 9–12 in the next.'),
          t('>>는 한 단어를 읽고 getline은 한 줄을 읽습니다. enum의 첫 값은 0부터 시작합니다.', 'Extraction reads one word; getline reads a line. The first enum value starts at 0.'),
          t('8번 줄은 cin >> callSign, 10번 줄은 getline(cin, command)입니다.', 'Use cin >> callSign on line 8 and getline(cin, command) on line 10.'),
          t('한 단어 뒤 줄바꿈을 ignore한 다음 한 줄을 읽습니다. 상태 문제에서는 signal > 0일 때 READY를 고릅니다.', 'Ignore the newline after the word before reading the line. In the state checkpoint, select READY when signal > 0.'),
        ],
        tools: [
          { name: 'cin >> callSign', target: t('표준 입력', 'Standard input'), input: t('공백 없는 호출명', 'A call sign without spaces'), result: t('첫 단어', 'The first word'), change: t('callSign과 입력 위치', 'callSign and the input position'), when: t('한 단어를 읽을 때', 'Reading one word') },
          { name: 'getline(cin, command)', target: t('표준 입력', 'Standard input'), input: t('다음 줄', 'The next line'), result: t('공백을 포함한 문자열', 'A string including spaces'), change: t('command와 입력 위치', 'command and the input position'), when: t('명령 한 줄을 읽을 때', 'Reading a command line') },
          { name: 'enum State', target: t('관제 상태 타입', 'Control state type'), input: t('IDLE, READY, FAILED', 'IDLE, READY, FAILED'), result: t('이름 붙은 정수 열거값', 'Named integer enumerators'), change: t('선언만으로 객체 상태는 바뀌지 않음', 'Declaration alone does not change object state'), when: t('정해진 상태를 구분할 때', 'Distinguishing fixed states') },
        ],
        scene: { theme: 'control', widgets: [
          { type: 'wire', pts: [[34, 19], [46, 19]], on: ['callSign'] }, { type: 'wire', pts: [[34, 21], [40, 21], [40, 37], [46, 37]], on: ['command'] },
          { type: 'keyboard', x: 10, y: 12 },
          { type: 'value', path: 'callSign', x: 46, y: 12, icon: 'signal', side: true },
          { type: 'value', path: 'command', x: 46, y: 30, icon: 'scroll', side: true },
          { type: 'value', path: 'state', x: 46, y: 48, icon: 'flag', side: true },
          { type: 'facility', kind: 'tower', x: 134, y: 30, label: t('관제탑', 'Control tower') },
          { type: 'monitor', x: 12, y: 66, w: 70, h: 18 },
        ] },
      },
      {
        id: '10-3', title: t('중앙 관리자', 'Central Manager'), zone,
        sceneIdle: t('Game 안의 로봇 두 대가 입력 전력을 기다립니다. 조회는 전력을 바꾸지 않고 합계 태그에 결과를 남깁니다.', 'Two robots inside Game await input power. The query leaves their power unchanged and records the total.'),
        reward: { item: 'crown', name: t('관리자 관측 왕관', 'Manager Observer Crown') },
        goal: t('Game이 첫 로봇에 입력 전력, 둘째에 그보다 1 큰 전력을 설정하고 const 조회로 합계를 돌려주게 하세요.', 'Have Game set the first robot to the input power and the second to one more, then return their sum through a const query.'),
        done: t('입력 8에서 두 전력 8과 9, 합계 17이면 완료입니다. 다른 입력에서도 합계가 맞으면 적용 확인입니다.', 'For input 8, powers 8 and 9 and total 17 complete the mission. Apply it to other inputs too.'),
        reuse: t('상태를 관리하는 메서드와 const 객체에서도 부를 수 있는 조회 메서드를 나눕니다.', 'Separate state-changing methods from queries callable on const objects.'),
        lecture: { pages: t('Lecture 10, p.3, 5', 'Lecture 10, pp. 3, 5'), quotes: [
          'main creates a single instance of this managing class, handles the interaction with the user (i.e. asking the user what to do next), and calls methods on the manager object to perform the appropriate actions based on user input.',
          'To signal that a method is safe to call on a const object, you must put the const keyword at the end of its signature,',
        ] },
        kind: 'blanks', variants: [{
          id: 'base', label: t('두 로봇 관리', 'Manage two robots'),
          template: t([
            '#include <iostream>', 'using namespace std;', '', 'class Robot {', 'public:', '    int power;', '    Robot() { power = 0; }', '};', '', 'class Game {', 'public:', '    Robot first;', '    Robot second;', '    void setPower(int n) {', '        first.power = n;', '        {target}.power = n + 1;', '    }', '    int total() {qualifier} {', '        return first.power + second.power;', '    }', '};', '', 'int main() {', '    int n;', '    cin >> n;', '    Game game;', '    game.setPower(n); // 관리자 상태 변경', '    const Game &view = game;', '    int sum = view.total(); // 읽기 전용 조회', '    cout << sum << endl;', '}',
          ].join('\n'), [
            '#include <iostream>', 'using namespace std;', '', 'class Robot {', 'public:', '    int power;', '    Robot() { power = 0; }', '};', '', 'class Game {', 'public:', '    Robot first;', '    Robot second;', '    void setPower(int n) {', '        first.power = n;', '        {target}.power = n + 1;', '    }', '    int total() {qualifier} {', '        return first.power + second.power;', '    }', '};', '', 'int main() {', '    int n;', '    cin >> n;', '    Game game;', '    game.setPower(n); // change manager state', '    const Game &view = game;', '    int sum = view.total(); // read-only query', '    cout << sum << endl;', '}',
          ].join('\n')),
          blanks: {
            target: [{ code: 'second' }, opt('first', '첫 로봇을 다시 바꾸면 둘째 로봇은 0으로 남습니다.', 'Changing the first robot again leaves the second at 0.', 'managerTarget')],
            qualifier: [{ code: 'const' }, opt('', 'const 참조 view에서는 const가 아닌 total을 호출할 수 없습니다.', 'A non-const total cannot be called through const reference view.', 'constQuery')],
          },
          tests: [{ label: t('입력 8', 'Input 8'), input: '8' }, { label: t('입력 13', 'Input 13'), input: '13' }, { label: t('입력 25', 'Input 25'), input: '25' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), first = Number(value(h, r, 'game.first.power')), second = Number(value(h, r, 'game.second.power')), sum = Number(value(h, r, 'sum'));
            const pass = first === n && second === n + 1 && sum === 2 * n + 1;
            return { pass, kind: 'logic', errorType: pass ? undefined : 'managerTarget', message: h.t(`${test.label}: 첫 전력=${first}, 둘째 전력=${second}, sum=${sum}입니다. 목표는 ${n}, ${n + 1}, ${2 * n + 1}입니다.`, `${test.label}: first power=${first}, second power=${second}, sum=${sum}. Goal: ${n}, ${n + 1}, ${2 * n + 1}.`) };
          },
        }],
        hints: [
          t('16번 줄의 대상과 18번 줄의 조회 함수 선언을 살펴보세요.', 'Inspect the target on line 16 and the query declaration on line 18.'),
          t('setPower는 두 객체를 수정하지만 total은 상태를 바꾸지 않는 const 조회입니다.', 'setPower changes two objects, but total is a const query that does not change state.'),
          t('16번 줄은 second.power, 18번 줄은 total() const입니다.', 'Use second.power on line 16 and total() const on line 18.'),
          t('둘째 필드에 n+1을 저장하고 total 뒤에 const를 붙여 const 참조 view에서 호출할 수 있게 합니다.', 'Store n+1 in the second field and put const after total so const reference view can call it.'),
        ],
        tools: [
          { name: 'game.setPower(n)', target: t('Game 객체 game', 'Game object game'), input: t('첫 로봇 전력 n', 'First robot power n'), result: t('없음 (void)', 'None (void)'), change: t('first.power와 second.power', 'first.power and second.power'), when: t('두 로봇의 전력을 설정할 때', 'Setting both robots’ power') },
          { name: 'view.total()', target: t('game의 const 참조 view', 'const reference view of game'), input: t('없음', 'None'), result: t('두 전력의 합 (int)', 'Sum of both powers (int)'), change: t('객체 상태 변경 없음', 'No object state change'), when: t('관리자의 전력을 조회할 때', 'Querying managed power') },
        ],
        scene: { theme: 'control', widgets: [
          { type: 'objects', class: 'Robot', battery: 'power', max: 100, x: 16, y: 12, w: 84, pitchX: 40, slots: 2 },
          { type: 'value', path: 'game.first.power', x: 96, y: 12, icon: 'cell', side: true },
          { type: 'value', path: 'game.second.power', x: 96, y: 28, icon: 'cell', side: true },
          { type: 'value', path: 'sum', x: 96, y: 44, icon: 'plus', side: true },
          { type: 'facility', kind: 'building', x: 16, y: 58, label: t('중앙 관리실', 'Manager room') },
          { type: 'monitor', x: 56, y: 64, w: 48, h: 20 },
        ] },
      },
      {
        id: '10-4', title: t('최종 복구 작전', 'Final Restoration'), zone,
        sceneIdle: t('경보기와 가상 파일 보관함, 관리자가 대기합니다. 음수 전력의 throw와 catch에는 경보가 반응합니다.', 'The alarm, virtual cabinet and manager are ready. The alarm reacts to throw and catch on negative power.'),
        reward: { item: 'alarm', name: t('복구 작전 경보기', 'Restoration Alarm') },
        goal: t('음수 전력을 runtime_error로 처리한 뒤 파일의 저장값을 관리자에 연결하고 성공과 실패를 보고하세요.', 'Handle negative power with runtime_error, then connect the saved file value to the manager and report success or failure.'),
        done: t('음수에서 예외를 잡고 정상값을 유지하면 완료입니다. 종합 체크포인트에서 여러 전력과 실패를 처리하면 적용 확인입니다.', 'Catch the exception for negative input and preserve normal values to complete; handle multiple power values and failure in the final checkpoint to apply it.'),
        reuse: t('작업 실패를 호출자에게 전달하고 복구 흐름을 분리할 때 예외와 catch를 사용합니다.', 'Use exceptions and catch to report failure to the caller and separate the recovery path.'),
        lecture: { pages: t('Lecture 10, p.6~7', 'Lecture 10, pp. 6–7'), quotes: [
          'The calling function has the opportunity to catch the exception – to specify how it should be handled.',
          'That description can be accessed by calling the what method on an exception object.',
        ] },
        kind: 'blanks', apply: 'variant', variants: [{
          id: 'base', label: t('예외 연습', 'Exception practice'),
          template: t([
            '#include <iostream>', '#include <stdexcept>', 'using namespace std;', '', 'int main() {', '    int power;', '    cin >> power;', '    int status = 0;', '    try {', '        if (power < 0) {', '            {throwing}', '        }', '        status = power;', '    } catch (const runtime_error &e) {', '        {handling} // 경보 상태', '    }', '    cout << status << endl;', '}',
          ].join('\n'), [
            '#include <iostream>', '#include <stdexcept>', 'using namespace std;', '', 'int main() {', '    int power;', '    cin >> power;', '    int status = 0;', '    try {', '        if (power < 0) {', '            {throwing}', '        }', '        status = power;', '    } catch (const runtime_error &e) {', '        {handling} // alarm status', '    }', '    cout << status << endl;', '}',
          ].join('\n')),
          blanks: {
            throwing: [{ code: 'throw runtime_error("bad power");' }, opt('power = 0;', '값만 바꾸면 예외가 발생하지 않아 catch에 들어가지 않습니다.', 'Changing the value does not throw, so catch is not entered.', 'throwChoice')],
            handling: [{ code: 'status = -1;' }, opt('status = 0;', 'catch가 실행되어도 0은 실패 표시 -1이 아닙니다.', 'Even when catch runs, 0 is not the failure marker -1.', 'catchChoice')],
          },
          tests: [{ label: t('실패 -1', 'Failure -1'), input: '-1' }, { label: t('정상 6', 'Normal 6'), input: '6' }, { label: t('정상 14', 'Normal 14'), input: '14' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), status = Number(value(h, r, 'status')), thrown = events(h, r, 'throw'), caught = events(h, r, 'catch');
            const valid = n < 0 ? thrown.some(exception) && caught.some(exception) : thrown.length === 0 && caught.length === 0;
            const expected = n < 0 ? -1 : n, pass = status === expected && valid;
            return { pass, kind: 'logic', errorType: pass ? undefined : !valid ? 'throwChoice' : 'catchChoice', message: h.t(`${test.label}: status=${status}, throw=${thrown.length}, catch=${caught.length}입니다. 목표 status=${expected}, 음수에서만 bad power 예외를 던지고 잡습니다.`, `${test.label}: status=${status}, throw=${thrown.length}, catch=${caught.length}. Goal: status=${expected}, throwing and catching bad power only for negative input.`) };
          },
        }, {
          id: 'apply', label: t('파일과 관리자 연결', 'Connect file and manager'),
          template: t([
            '#include <iostream>', '#include <fstream>', '#include <stdexcept>', 'using namespace std;', '', 'class Game {', 'public:', '    int power;', '    Game() { power = 0; }', '    void restore(int n) {', '        if (n < 0) {', '            throw runtime_error("bad power");', '        }', '        power = n;', '    }', '    int get() const { return power; }', '};', '', 'int main() {', '    int n;', '    cin >> n;', '    ofstream out("power.txt");', '    out << n; // 가상 파일에 기록', '    out.close();', '    ifstream in("power.txt");', '    int saved;', '    in >> saved;', '    in.close();', '    Game game;', '    int status = 0;', '    try {', '        {connect}', '        {report}', '    } catch (const runtime_error &e) {', '        status = -1;', '        cout << e.what() << endl;', '    }', '    cout << status << endl;', '}',
          ].join('\n'), [
            '#include <iostream>', '#include <fstream>', '#include <stdexcept>', 'using namespace std;', '', 'class Game {', 'public:', '    int power;', '    Game() { power = 0; }', '    void restore(int n) {', '        if (n < 0) {', '            throw runtime_error("bad power");', '        }', '        power = n;', '    }', '    int get() const { return power; }', '};', '', 'int main() {', '    int n;', '    cin >> n;', '    ofstream out("power.txt");', '    out << n; // write to the virtual file', '    out.close();', '    ifstream in("power.txt");', '    int saved;', '    in >> saved;', '    in.close();', '    Game game;', '    int status = 0;', '    try {', '        {connect}', '        {report}', '    } catch (const runtime_error &e) {', '        status = -1;', '        cout << e.what() << endl;', '    }', '    cout << status << endl;', '}',
          ].join('\n')),
          blanks: {
            connect: [{ code: 'game.restore(saved);' }, opt('game.restore(0);', '고정값 0은 파일에서 읽은 값도 실패도 관리자에 전달하지 않습니다.', 'Fixed 0 passes neither the file value nor its failure to the manager.', 'restoreConnection')],
            report: [{ code: 'status = game.get();' }, opt('status = 0;', '정상 복원 후에도 고정값 0을 보고하면 실제 전력을 알 수 없습니다.', 'Reporting fixed 0 after a successful restore hides the actual power.', 'reportChoice')],
          },
          tests: [{ label: t('복원 6', 'Restore 6'), input: '6' }, { label: t('복원 12', 'Restore 12'), input: '12' }, { label: t('실패 -1', 'Failure -1'), input: '-1' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), saved = Number(value(h, r, 'saved')), power = Number(value(h, r, 'game.power')), status = Number(value(h, r, 'status')), file = r.files['power.txt'];
            const thrown = events(h, r, 'throw'), caught = events(h, r, 'catch');
            const valid = n < 0 ? thrown.some(exception) && caught.some(exception) : thrown.length === 0 && caught.length === 0;
            const pass = file === String(n) && saved === n && power === (n < 0 ? 0 : n) && status === (n < 0 ? -1 : n) && valid;
            return { pass, kind: 'logic', errorType: pass ? undefined : power !== (n < 0 ? 0 : n) || !valid ? 'restoreConnection' : 'reportChoice', message: h.t(`${test.label}: 파일=${JSON.stringify(file)}, saved=${saved}, game.power=${power}, status=${status}, throw/catch=${thrown.length}/${caught.length}입니다. 목표는 저장값 ${n}, 전력 ${n < 0 ? 0 : n}, 상태 ${n < 0 ? -1 : n}이며 음수에서만 bad power를 잡습니다.`, `${test.label}: file=${JSON.stringify(file)}, saved=${saved}, game.power=${power}, status=${status}, throw/catch=${thrown.length}/${caught.length}. Goal: saved ${n}, power ${n < 0 ? 0 : n}, status ${n < 0 ? -1 : n}, catching bad power only for negatives.`) };
          },
        }],
        hints: [
          t('예외 연습 11번 줄과 15번 줄을 보고, 종합 문제의 32~33번 줄 연결도 살펴보세요.', 'Inspect lines 11 and 15 in exception practice, then the connections on lines 32–33 in the final checkpoint.'),
          t('throw는 현재 흐름을 중단하고 일치하는 catch로 넘깁니다. 관리자는 파일에서 읽은 값을 받아야 합니다.', 'throw interrupts the current flow and transfers control to a matching catch. The manager must receive the value read from the file.'),
          t('11번 줄에서 runtime_error를 던지고 15번 줄에서 status를 -1로 만드세요.', 'Throw runtime_error on line 11 and set status to -1 on line 15.'),
          t('종합 문제는 game.restore(saved) 다음 status = game.get()입니다. 음수에서는 대입 전에 catch가 실행됩니다.', 'In the final checkpoint use game.restore(saved), then status = game.get(). A negative value reaches catch before the assignment.'),
        ],
        tools: [
          { name: 'throw runtime_error("bad power")', target: t('현재 작업과 호출자', 'Current operation and caller'), input: t('실패 설명', 'Failure description'), result: t('runtime_error 예외', 'A runtime_error exception'), change: t('정상 흐름 중단', 'Interrupts normal flow'), when: t('전력이 음수여서 복원할 수 없을 때', 'Power is negative and cannot be restored') },
          { name: 'catch (const runtime_error &e)', target: t('try에서 전달된 예외', 'Exception from try'), input: t('runtime_error 참조', 'A runtime_error reference'), result: t('일치하면 처리 블록 실행', 'Runs the handler on a match'), change: t('실패 상태와 경보', 'Failure state and alarm'), when: t('복원 실패를 처리할 때', 'Handling restore failure') },
          { name: 'game.restore(saved)', target: t('Game 객체 game', 'Game object game'), input: t('파일에서 읽은 전력', 'Power read from the file'), result: t('없음 또는 예외', 'None or an exception'), change: t('정상이면 game.power 변경', 'Changes game.power on success'), when: t('저장 상태를 관리자에 연결할 때', 'Connecting saved state to the manager') },
        ],
        scene: { theme: 'control', widgets: [
          { type: 'wire', pts: [[64, 51], [126, 51]], on: ['status'] },
          { type: 'files', x: 12, y: 10 }, { type: 'alarm', x: 46, y: 12 },
          { type: 'objects', class: 'Game', x: 84, y: 10, w: 40, pitchX: 40, slots: 1 },
          { type: 'value', path: 'status', x: 46, y: 44, icon: 'flag' },
          { type: 'facility', kind: 'tower', x: 134, y: 36, label: t('중앙 관제소', 'Central control') },
          { type: 'monitor', x: 12, y: 66, w: 70, h: 18 },
        ] },
      },
    ],
  });
})(this);
