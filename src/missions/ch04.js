(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const zone = t('부품 창고', 'Parts Warehouse');
  const card = (code, ko, en, errorType) => ({ code, label: t(code, code), ...(errorType ? { why: t(ko, en), errorType } : {}) });
  const sample = (input, expected) => ({ label: t(`입력 ${input}`, `Input ${input}`), input, params: { expected } });
  const tool = (name, target, input, result, change, when) => ({ name, target, input, result, change, when });
  const B = t;
  function verdict(r, test, h, path, goal, errorType) {
    if (!r.ok) return h.simFailure(r);
    const cell = h.cell(r, path);
    const value = cell ? Number(cell.value ?? cell.shown) : NaN;
    const printed = h.numbersIn(r.output);
    const expected = test.params.expected;
    const pass = value === expected && printed.length === 1 && printed[0] === expected;
    return {
      pass, kind: 'logic', errorType: pass ? undefined : errorType, expected, got: value,
      message: h.t(`입력 ${test.input}: ${path} 값은 ${value}, 출력은 ${r.output.trim() || '(없음)'}입니다. ${goal.ko} 목표 값은 ${expected}입니다.`,
        `Input ${test.input}: ${path} is ${value}, and output is ${r.output.trim() || '(none)'}. ${goal.en} The target is ${expected}.`),
    };
  }
  // 코드 문자열은 한 벌로 쓰고, 한국어 화면에서는 주석만 한국어로 바꾼다(코드와 줄 번호는 같다)
  const KO_COMMENTS = {
    'warehouse slots': '창고 칸',
    'selected slot': '고른 칸',
    'inventory crates': '재고 상자',
    'add one crate': '상자 하나 더하기',
    'warehouse map': '창고 지도',
    'mark broken cell': '고장 칸 표시',
    'signal and terminator': '신호와 끝 표시',
    'letter counter': '영문자 개수',
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
    no: 4, zone,
    errorTypes: {
      index: t('칸 번호와 인덱스', 'Slot number and index'),
      arrayBoundary: t('배열 경계', 'Array bounds'),
      rowColumn: t('행과 열', 'Row and column'),
      charEnd: t('문자 배열의 끝', 'Character array terminator'),
      characterKind: t('문자 판별', 'Character classification'),
    },
    codeErrorTypes: { indexOutOfBounds: 'arrayBoundary' },
    missions: [
      {
        id: '4-1', title: t('창고 칸 찾기', 'Find the Warehouse Slot'), zone,
        sceneIdle: t('네 부품 칸이 비어 있습니다. 입력하면 칸마다 수량이 나타나고 세 번째 칸을 읽을 때 강조됩니다.', 'Four part slots are empty. Input fills them, and reading the third highlights it.'),
        reward: { item: 'crate', name: t('번호표 상자', 'Indexed crate') },
        goal: t('네 칸 중 사람이 세는 세 번째 칸의 부품 수를 찾아 출력하세요.', 'Find and print the part count in the third of four slots.'),
        done: t('4 7 9 12에서 9를 찾으면 완료, 다른 재고 두 가지에서도 세 번째 값을 찾으면 적용 확인입니다.', 'Finding 9 for 4 7 9 12 completes the mission; finding the third value for two other inventories checks application.'),
        reuse: t('사람이 센 순서를 배열 인덱스로 바꿀 때 첫 칸이 0임을 확인합니다.', 'When converting a human slot number to an array index, remember that the first slot is 0.'),
        lecture: { pages: t('Lecture 4, p.1', 'Lecture 4, p. 1'), quotes: ['Arrays in C++ are zero-indexed, so the first element has an index of 0.', 'So, to access the third element in arr, we write arr[2];'] },
        kind: 'blanks',
        predict: {
          intro: t('실행 전, 인덱스 2에서 읽을 부품 수를 예측하세요.', 'Before running, predict the part count read at index 2.'),
          program: ['#include <iostream>', 'using namespace std;', 'int main() {', '    int parts[4] = {4, 7, 9, 12};', '    cout << parts[2] << endl;', '    return 0;', '}'].join('\n'),
          questions: [{ label: t('출력할 부품 수는?', 'What part count is printed?'), number: true }],
          answersFrom: () => ['9'],
        },
        variants: [{ id: 'base', label: t('세 번째 칸', 'Third slot'),
          template: [
            '#include <iostream>', 'using namespace std;', 'int main() {',
            '    int parts[4] = {0, 0, 0, 0}; // warehouse slots',
            '    cin >> parts[0] >> parts[1] >> parts[2] >> parts[3];',
            '    int found = parts[{index}]; // selected slot',
            '    cout << {show} << endl;', '    return 0;', '}',
          ].join('\n'),
          blanks: {
            index: [card('2'), card('1', '인덱스 1은 두 번째 칸입니다.', 'Index 1 is the second slot.', 'index'), card('3', '인덱스 3은 네 번째 칸입니다.', 'Index 3 is the fourth slot.', 'index')],
            show: [card('found'), card('parts[0]', '첫 칸을 출력하면 찾은 세 번째 칸을 보여 주지 못합니다.', 'Printing the first slot does not show the third slot you found.', 'index')],
          },
          tests: [sample('4 7 9 12', 9), sample('8 3 5 1', 5), sample('2 6 11 4', 11)],
          check: (r, s, h) => verdict(r, s, h, 'found', t('세 번째 칸을 읽어 출력해야 합니다.', 'Read and print the third slot.'), 'index'),
        }], apply: 'tests',
        hints: [
          t('4~6줄에서 네 칸의 인덱스와 읽는 칸을 살펴보세요.', 'Inspect the four indexes and the read on lines 4–6.'),
          t('첫 칸의 인덱스가 0이므로 세 번째 칸은 인덱스 2입니다.', 'The first index is 0, so the third slot has index 2.'),
          t('6줄에서 parts[2]를 읽고 7줄에서 찾은 값을 출력하세요.', 'Read parts[2] on line 6 and print the found value on line 7.'),
          t('6줄의 parts[2]를 found에 저장하고 7줄에서 found를 출력합니다.', 'Line 6 stores parts[2] in found; line 7 prints found.'),
        ],
        tools: [
          tool('parts[index]', B('네 칸 배열', 'Four-slot array'), B('0부터 3까지 인덱스', 'Index from 0 to 3'), B('해당 칸의 수량', 'Count in that slot'), B('읽기만 하면 변경 없음', 'No change when reading'), B('특정 칸을 찾을 때', 'To find a specific slot')),
          tool('cin >>', B('선택한 배열 원소', 'Selected array elements'), B('수량 네 개', 'Four counts'), B('각 칸에 입력값 저장', 'Inputs stored in slots'), B('parts의 네 값 변경', 'Changes four values of parts'), B('창고 재고를 입력할 때', 'To enter warehouse stock')),
        ],
        scene: { theme: 'arrays', widgets: [
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 33], [44, 33]], on: ['parts'] }, { type: 'wire', pts: [[106, 33], [118, 33]], on: ['found'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'array', path: 'parts', display: 'crate', x: 44, y: 26, slots: 4 },
          { type: 'value', path: 'found', x: 118, y: 26, icon: 'crate' },
          { type: 'monitor', x: 10, y: 60, w: 64, h: 26 }, { type: 'facility', kind: 'building', x: 112, y: 50, label: t('창고 사무동', 'Depot office') },
        ] },
      },
      {
        id: '4-2', title: t('재고 집계', 'Count the Inventory'), zone,
        sceneIdle: t('네 상자와 합계 표시기가 보입니다. 반복할 때 읽는 상자와 total의 변화가 표시됩니다.', 'Four crates and a total display are ready. Each iteration highlights a crate and updates total.'),
        reward: { item: 'cart', name: t('집계 운반차', 'Inventory cart') },
        goal: t('인덱스 0부터 마지막 유효 인덱스 3까지 네 칸의 재고를 합산하세요.', 'Sum all four stock counts from index 0 through the last valid index, 3.'),
        done: t('1 2 3 4의 합 10을 구하면 완료, 마지막 칸만 채운 경우를 포함한 다른 재고도 맞히면 적용 확인입니다.', 'A total of 10 for 1 2 3 4 completes the mission; the other inventories, including a last-slot-only case, check application.'),
        reuse: t('고정 배열을 순회할 때 크기 미만 조건으로 마지막 원소까지 처리합니다.', 'Traverse a fixed array with an index less than its size to include the last element.'),
        lecture: { pages: t('Lecture 4, p.2', 'Lecture 4, p. 2'), quotes: ['The index itself may be directly provided, derived from a variable, or computed from an expression:', 'The function sum takes a constant integer array and a constant integer length as its arguments and adds up length elements in the array.'] },
        kind: 'blanks',
        variants: [{ id: 'base', label: t('네 칸 합계', 'Four-slot total'),
          template: [
            '#include <iostream>', 'using namespace std;', 'int main() {',
            '    int parts[4] = {0, 0, 0, 0}; // inventory crates',
            '    cin >> parts[0] >> parts[1] >> parts[2] >> parts[3];',
            '    int total = 0;', '    for (int i = 0; {condition}; i++) {',
            '        total += {item}; // add one crate', '    }',
            '    cout << total << endl;', '    return 0;', '}',
          ].join('\n'),
          blanks: {
            condition: [card('i < 4'), card('i < 3', '인덱스 3인 마지막 칸을 빠뜨립니다.', 'This skips the last slot, index 3.', 'arrayBoundary'), card('i <= 4', '인덱스 4는 범위 밖입니다. 학습 검사기는 이를 중단하지만 실제 C++의 동작은 보장되지 않습니다.', 'Index 4 is out of bounds. The learning checker stops it; real C++ behavior is not guaranteed.', 'arrayBoundary')],
            item: [card('parts[i]'), card('parts[0]', '매번 첫 칸을 더하면 다른 칸을 세지 못합니다.', 'Adding the first slot each time misses the other slots.', 'index')],
          },
          tests: [sample('1 2 3 4', 10), sample('0 0 0 9', 9), sample('4 5 6 7', 22)],
          check: (r, s, h) => verdict(r, s, h, 'total', t('네 칸을 각각 한 번씩 더해야 합니다.', 'Add each of the four slots once.')),
        }], apply: 'tests',
        hints: [
          t('7~8줄에서 인덱스가 어디까지 가고 어떤 칸을 더하는지 보세요.', 'On lines 7–8, inspect the last index and which slot is added.'),
          t('크기가 4인 배열의 유효 인덱스는 0, 1, 2, 3입니다.', 'An array of size 4 has valid indexes 0, 1, 2 and 3.'),
          t('7줄에 i < 4를 쓰고 8줄에서 parts[i]를 더하세요.', 'Use i < 4 on line 7 and add parts[i] on line 8.'),
          t('7줄의 조건은 4에서 멈추므로 8줄은 마지막 유효 칸 3까지 실행됩니다.', 'The condition on line 7 stops at 4, so line 8 reaches the last valid slot, 3.'),
        ],
        tools: [
          tool('for', B('인덱스 i', 'Index i'), B('시작 0, 조건 i < 4, 증가 1', 'Start 0, condition i < 4, increment 1'), B('네 번의 본문 실행', 'Four body executions'), B('반복할 때 i 증가', 'i increases each iteration'), B('모든 칸을 한 번씩 방문할 때', 'To visit every slot once')),
          tool('total += parts[i]', B('합계와 현재 칸', 'Total and current slot'), B('현재 칸의 수량', 'Current slot count'), B('누적 합계', 'Running total'), B('total이 수량만큼 증가', 'Increases total by the count'), B('재고를 집계할 때', 'To sum inventory')),
        ],
        scene: { theme: 'arrays', widgets: [
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 31], [44, 31]], on: ['parts'] }, { type: 'wire', pts: [[106, 31], [120, 31]], on: ['total'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'array', path: 'parts', display: 'crate', x: 44, y: 24, slots: 4 },
          { type: 'value', path: 'total', x: 120, y: 24, icon: 'crate' }, { type: 'conveyor', x: 40, y: 58, length: 72 },
          { type: 'facility', kind: 'machine', x: 120, y: 54, label: t('집계기', 'Counter') }, { type: 'monitor', x: 10, y: 62, w: 28, h: 24 },
        ] },
      },
      {
        id: '4-3', title: t('창고 지도', 'Warehouse Map'), zone,
        sceneIdle: t('2행 3열 창고 지도가 모두 0으로 표시됩니다. 고장 값을 기록한 칸이 강조됩니다.', 'A two-row, three-column map starts at zero. The cell receiving the fault code is highlighted.'),
        reward: { item: 'map', name: t('고장 위치 지도', 'Fault map') },
        goal: t('고장 번호를 행 인덱스 1, 열 인덱스 2인 칸에 기록하고 확인하세요.', 'Record and check the fault code at row index 1, column index 2.'),
        done: t('고장 번호 7이 지정된 칸에 기록되면 완료, 3과 9에도 같은 위치를 쓰면 적용 확인입니다.', 'Recording fault 7 in the specified cell completes the mission; the same location for 3 and 9 checks application.'),
        reuse: t('격자에서 위치를 지정할 때 첫 인덱스는 행, 둘째는 열로 읽습니다.', 'For a grid position, read the first index as the row and the second as the column.'),
        lecture: { pages: t('Lecture 4, p.2~3', 'Lecture 4, pp. 2–3'), quotes: ['C++ also supports the creation of multidimensional arrays, through the addition of more than one set of brackets.', 'The first index indicates which of dimension1 subarrays to access, and then the second index accesses one of dimension2 elements within that subarray.'] },
        kind: 'blanks',
        variants: [{ id: 'base', label: t('고장 표시', 'Mark the fault'),
          template: [
            '#include <iostream>', 'using namespace std;', 'int main() {',
            '    int grid[2][3] = {{0, 0, 0}, {0, 0, 0}}; // warehouse map',
            '    int fault;', '    cin >> fault;',
            '    grid[{row}][{col}] = fault; // mark broken cell',
            '    cout << grid[1][2] << endl;', '    return 0;', '}',
          ].join('\n'),
          blanks: {
            row: [card('1'), card('0', '행 인덱스 0은 첫 번째 행입니다.', 'Row index 0 is the first row.', 'rowColumn')],
            col: [card('2'), card('1', '열 인덱스 1은 두 번째 열입니다.', 'Column index 1 is the second column.', 'rowColumn'), card('0', '열 인덱스 0은 첫 번째 열입니다.', 'Column index 0 is the first column.', 'rowColumn')],
          },
          tests: [sample('7', 7), sample('3', 3), sample('9', 9)],
          check: (r, s, h) => verdict(r, s, h, 'grid[1][2]', t('행 1, 열 2에 고장 번호를 기록해야 합니다.', 'Record the fault code at row 1, column 2.'), 'rowColumn'),
        }], apply: 'tests',
        hints: [
          t('4줄의 지도 크기와 7줄의 두 인덱스를 보세요.', 'Inspect the map dimensions on line 4 and both indexes on line 7.'),
          t('첫 대괄호는 행, 두 번째 대괄호는 열이며 각각 0부터 셉니다.', 'The first brackets select a row and the second a column; both start at 0.'),
          t('7줄에서 grid[1][2]에 fault를 넣으세요.', 'On line 7, put fault into grid[1][2].'),
          t('7줄의 grid[1][2]는 두 번째 행의 세 번째 칸이고 8줄에서 그 값을 확인합니다.', 'On line 7, grid[1][2] is the third cell of the second row; line 8 checks it.'),
        ],
        tools: [
          tool('grid[row][col]', B('2행 3열 배열', 'Two-row, three-column array'), B('행과 열 인덱스', 'Row and column indexes'), B('한 칸', 'One cell'), B('읽기만 하면 변경 없음', 'No change when reading'), B('고장 위치를 찾을 때', 'To locate a fault')),
          tool('=', B('선택한 격자 칸', 'Selected grid cell'), B('고장 번호 fault', 'Fault code fault'), B('기록된 고장 번호', 'Recorded fault code'), B('선택한 칸만 변경', 'Changes only the selected cell'), B('지도에 고장을 표시할 때', 'To mark a fault on the map')),
        ],
        scene: { theme: 'arrays', widgets: [
          { type: 'wire', pts: [[34, 19], [40, 19], [40, 33], [50, 33]], on: ['grid'] }, { type: 'wire', pts: [[96, 33], [110, 33]], on: ['fault'] },
          { type: 'keyboard', x: 10, y: 12 }, { type: 'grid', path: 'grid', x: 50, y: 24, slots: 3, rows: 2 },
          { type: 'value', path: 'fault', x: 110, y: 24, icon: 'wrench' },
          { type: 'monitor', x: 10, y: 60, w: 32, h: 26 }, { type: 'facility', kind: 'building', x: 108, y: 52, label: t('창고 건물', 'Warehouse') },
        ] },
      },
      {
        id: '4-4', title: t('문자 신호 복구', 'Repair the Character Signal'), zone,
        sceneIdle: t('문자 타일과 널 종료 표시가 보입니다. ASCII 신호를 입력하면 각 문자와 영문자 개수가 표시됩니다.', 'Character tiles include a null terminator. Enter an ASCII signal to see the characters and letter count.'),
        reward: { item: 'letters', name: t('문자 판독기', 'Letter decoder') },
        goal: t('ASCII 문자 세 개 중 널 문자 전의 영문자 수를 cctype으로 세세요.', 'Use cctype to count ASCII letters in three characters before the null terminator.'),
        done: t('A 2 b에서 영문자 2개를 세면 완료, 숫자만 있는 신호와 다른 신호에도 맞으면 적용 확인입니다.', 'Counting two letters in A 2 b completes the mission; a digits-only signal and another signal check application.'),
        reuse: t('문자 배열을 문자열로 읽을 때 할당 공간 끝이 아니라 널 문자를 종료점으로 사용합니다.', 'When reading a character array as a string, stop at the null character rather than the end of allocated space.'),
        lecture: { pages: t('Lecture 4, p.3~4', 'Lecture 4, pp. 3–4'), quotes: ['This character is used to indicate the end of the string.', 'The for loop beginning at line 9 takes each successive character from messyString until it reaches the null character.'] },
        kind: 'blanks',
        variants: [{ id: 'base', label: t('신호 판독', 'Decode the signal'),
          template: [
            '#include <iostream>', '#include <cctype>', 'using namespace std;', 'int main() {',
            '    char signal[8] = "A2b"; // signal and terminator',
            '    cin >> signal[0] >> signal[1] >> signal[2];',
            '    int count = 0;', '    int i = 0;',
            '    while (signal[i] {end}) {', '        if ({classify}(signal[i])) {',
            '            count++; // letter counter', '        }', '        i++;', '    }',
            '    cout << count << endl;', '    return 0;', '}',
          ].join('\n'),
          blanks: {
            end: [card("!= '\\0'"), card("== '\\0'", '널 문자일 때만 계속하면 첫 글자에서 바로 멈춥니다.', 'Continuing only at the null character stops at the first letter.', 'charEnd'), card("!= '\\0' && signal[i] != '2'", '숫자 2는 종료 문자가 아니므로 뒤의 문자도 읽어야 합니다.', 'The digit 2 is not a terminator; characters after it still belong to the signal.', 'charEnd')],
            classify: [card('isalpha'), card('isdigit', 'isdigit은 영문자가 아니라 숫자를 판별합니다.', 'isdigit detects digits, not letters.', 'characterKind')],
          },
          tests: [sample('A 2 b', 2), sample('1 2 3', 0), sample('z Q 9', 2)],
          check: (r, s, h) => verdict(r, s, h, 'count', t('널 문자 앞의 ASCII 영문자만 세어야 합니다.', 'Count only ASCII letters before the null terminator.')),
        }], apply: 'tests',
        hints: [
          t('5~6줄의 문자와 종료 문자, 9~10줄의 반복과 판별을 보세요.', 'Inspect the characters and terminator on lines 5–6 and the loop and test on lines 9–10.'),
          t('문자열 리터럴 뒤에는 널 문자가 들어가며 isalpha는 영문자를 판별합니다.', 'A string literal is followed by a null character; isalpha identifies letters.'),
          t("9줄에서 != '\\0'을 검사하고 10줄에서 isalpha를 쓰세요.", "On line 9 test != '\\0' and use isalpha on line 10."),
          t('9줄은 널 문자를 만나기 전까지 반복합니다. 10줄은 숫자를 건너뛰고 영문자만 셉니다.', 'Line 9 loops until the null character. Line 10 skips digits and counts only letters.'),
        ],
        tools: [
          tool("'\\0'", B('문자 배열 signal', 'Character array signal'), B('현재 문자', 'Current character'), B('문자열 끝을 나타내는 널 문자', 'Null character marking the string end'), B('비교만으로 변경 없음', 'Comparison changes nothing'), B('문자열 순회를 끝낼 때', 'To stop traversing a string')),
          tool('isalpha', B('ASCII 문자', 'ASCII character'), B('signal[i]', 'signal[i]'), B('영문자이면 참', 'True for a letter'), B('문자 자체는 바꾸지 않음', 'Does not change the character'), B('글자만 골라 셀 때', 'To count letters only')),
        ],
        scene: { theme: 'arrays', widgets: [
          { type: 'wire', pts: [[34, 17], [44, 17], [44, 33]], on: ['signal'] },
          { type: 'keyboard', x: 10, y: 10 }, { type: 'chars', path: 'signal', x: 14, y: 34, cell: 12, slots: 8 },
          { type: 'value', path: 'i', x: 26, y: 58, icon: 'arrow' }, { type: 'value', path: 'count', x: 62, y: 58, icon: 'signal' },
          { type: 'facility', kind: 'tower', x: 132, y: 20, label: t('신호탑', 'Signal mast') }, { type: 'monitor', x: 94, y: 62, w: 40, h: 24 },
        ] },
      },
    ],
  }));
})(this);
