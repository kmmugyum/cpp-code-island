(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const opt = (code, ko, en, errorType) => ({ code, why: t(ko, en), errorType });
  const zone = t('범용 공방', 'General Workshop');
  const number = (h, r, path) => { const c = h.cell(r, path); return c ? Number(c.shown) : NaN; };

  M.registerChapter({
    no: 9, zone,
    errorTypes: {
      templateType: t('템플릿 타입', 'Template type'),
      templateDeduction: t('템플릿 타입 추론', 'Template deduction'),
      calculation: t('계산 규칙', 'Calculation rule'),
      boxType: t('부품함 저장 타입', 'Box storage type'),
      boxValue: t('부품함 값 인자', 'Box value argument'),
      setInsert: t('집합 삽입', 'Set insertion'),
      setSearch: t('집합 검색', 'Set search'),
      arraySort: t('배열 정렬', 'Array sorting'),
      operatorDefinition: t('연산자 정의', 'Operator definition'),
      bundleSum: t('묶음 합산', 'Bundle addition'),
    },
    codeErrorTypes: { templateDeduction: 'templateDeduction' },
    missions: [
      {
        id: '9-1', title: t('범용 계산기', 'Generic Calculator'), zone,
        sceneIdle: t('정수와 실수 계산 결과 칸이 비어 있습니다. 같은 sum 규칙을 두 타입에 적용하면 각 결과가 나타납니다.', 'The integer and decimal result slots are empty. Both fill when the same sum rule runs for each type.'),
        reward: { item: 'mold', name: t('덧셈 금형', 'Addition Mold') },
        goal: t('정수 3과 5, 실수 3.5와 1.25를 같은 템플릿 규칙으로 더하세요.', 'Add integers 3 and 5, and decimals 3.5 and 1.25 with the same template rule.'),
        done: t('정수 결과 8과 실수 결과 4.75가 나오면 완료입니다. 다른 두 쌍에서도 합이 맞으면 적용 확인입니다.', 'Results 8 and 4.75 complete the mission; correct sums for the other pairs confirm application.'),
        reuse: t('타입만 다르고 연산 규칙이 같을 때 함수 템플릿으로 중복을 줄입니다.', 'Use a function template when types differ but the operation is the same.'),
        lecture: { pages: t('Lecture 9, p.1~2', 'Lecture 9, pp. 1–2'), quotes: [
          'To overcome this we rewrite sum as a function template.',
          'It is also possible to invoke a function template without giving an explicit type, in cases where the generic type identifier is used as the type for a parameter for the function.',
        ] },
        predict: { intro: t('sum(3, 5)와 sum<double>(3.5, 1.25)의 결과를 예상하세요.', 'Predict sum(3, 5) and sum<double>(3.5, 1.25).'), questions: [{ label: t('정수 합', 'Integer sum'), number: true }, { label: t('실수 합', 'Decimal sum'), number: true }], answersFrom: () => ['8', '4.75'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('한 규칙, 두 타입', 'One rule, two types'),
          template: t([
            '#include <iostream>',
            'template <typename T>',
            'T sum(T a, T b) {',
            '    return {rule};',
            '}',
            'int main() {',
            '    int a = {a}, b = {b};',
            '    double x = {x}, y = {y};',
            '    int whole = sum(a, b); // 정수 결과',
            '    double decimal = {call}; // 실수 결과',
            "    std::cout << whole << ' ' << decimal << '\\n';",
            '}'
          ].join('\n'), [
            '#include <iostream>',
            'template <typename T>',
            'T sum(T a, T b) {',
            '    return {rule};',
            '}',
            'int main() {',
            '    int a = {a}, b = {b};',
            '    double x = {x}, y = {y};',
            '    int whole = sum(a, b); // integer result',
            '    double decimal = {call}; // decimal result',
            "    std::cout << whole << ' ' << decimal << '\\n';",
            '}'
          ].join('\n')),
          params: ['a', 'b', 'x', 'y'],
          blanks: {
            rule: [{ code: 'a + b' }, opt('a - b', '뺄셈은 두 타입 모두에서 합 대신 차를 반환합니다.', 'Subtraction returns a difference rather than a sum for both types.', 'calculation')],
            call: [{ code: 'sum(x, y)' }, opt('sum(a, y)', 'int와 double을 같은 T로 추론할 수 없습니다. 타입을 통일하거나 명시하세요.', 'The same T cannot be deduced from both int and double. Use matching types or specify T.', 'templateDeduction'), opt('sum<double>(x, x)', '타입은 맞지만 y 대신 x를 두 번 더합니다.', 'The type is correct, but this adds x twice instead of using y.', 'calculation')],
          },
          tests: [
            { label: t('3, 5와 3.5, 1.25', '3, 5 and 3.5, 1.25'), params: { a: 3, b: 5, x: 3.5, y: 1.25 } },
            { label: t('7, 2와 2.5, 4.25', '7, 2 and 2.5, 4.25'), params: { a: 7, b: 2, x: 2.5, y: 4.25 } },
            { label: t('4, 4와 1.5, 0.25', '4, 4 and 1.5, 0.25'), params: { a: 4, b: 4, x: 1.5, y: 0.25 } },
          ],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const whole = number(h, r, 'whole'), decimal = number(h, r, 'decimal');
            const w = test.params.a + test.params.b, d = test.params.x + test.params.y;
            const pass = whole === w && decimal === d;
            return { pass, kind: 'logic', errorType: pass ? undefined : 'calculation', message: h.t(`${test.label}: whole=${whole}, decimal=${decimal}; 목표는 ${w}, ${d}입니다.`, `${test.label}: whole=${whole}, decimal=${decimal}; the goals are ${w}, ${d}.`) };
          },
        }], apply: 'tests',
        hints: [
          t('4번 줄의 계산과 9~10번 줄의 두 호출을 비교하세요.', 'Compare the calculation on line 4 with both calls on lines 9–10.'),
          t('하나의 T를 추론하려면 두 인자의 타입이 같아야 합니다.', 'Both arguments must have the same type to deduce one T.'),
          t('4번 줄에서는 a와 b를 더하고 10번 줄에는 x와 y를 전달하세요.', 'Add a and b on line 4 and pass x and y on line 10.'),
          t('a + b와 sum(x, y)를 선택합니다. 명시적 sum<double>(x, y)도 같은 타입을 지정합니다.', 'Choose a + b and sum(x, y). Explicit sum<double>(x, y) also selects the same type.'),
        ],
        tools: [
          { name: 'template <typename T>', target: t('함수 sum', 'Function sum'), input: t('타입 매개변수 T', 'Type parameter T'), result: t('타입별 함수 생성 규칙', 'Rule for functions of each type'), change: t('선언 자체는 값 변경 없음', 'Declaration changes no values'), when: t('같은 계산을 여러 타입에 쓸 때', 'Sharing a calculation across types') },
          { name: 'sum(x, y)', target: t('함수 템플릿', 'Function template'), input: t('같은 타입의 두 값', 'Two values of the same type'), result: t('추론된 T 타입의 합', 'Sum of deduced type T'), change: t('호출 결과를 받을 변수가 바뀜', 'Changes the variable receiving the result'), when: t('인자에서 타입을 추론할 때', 'Deducing the type from arguments') },
          { name: 'sum<double>(x, y)', target: t('함수 템플릿', 'Function template'), input: t('명시 타입 double과 두 값', 'Explicit double type and two values'), result: t('double 합', 'A double sum'), change: t('인자 원본은 변경하지 않음', 'Does not change the original arguments'), when: t('템플릿 타입을 명시할 때', 'Specifying the template type') },
        ],
        scene: { theme: 'templates', widgets: [
          { type: 'wire', pts: [[66, 34], [84, 34], [84, 21], [100, 21]], on: ['whole'] }, { type: 'wire', pts: [[66, 34], [84, 34], [84, 47], [100, 47]], on: ['decimal'] },
          { type: 'facility', kind: 'machine', x: 50, y: 26, label: t('틀 sum<T>', 'Mold sum<T>') },
          { type: 'value', x: 100, y: 14, path: 'whole', icon: 'gear', side: true }, { type: 'value', x: 100, y: 40, path: 'decimal', icon: 'mold', side: true },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', x: 114, y: 62, kind: 'workshop', label: t('범용 공방', 'General shop') },
        ] },
      },
      {
        id: '9-2', title: t('범용 부품함', 'Generic Parts Box'), zone,
        sceneIdle: t('정수 부품함과 실수 부품함이 비어 있습니다. 생성된 상자의 value 필드와 꺼낸 값이 각각 바뀝니다.', 'The integer and decimal boxes are empty. Watch each constructed value field and retrieved value.'),
        reward: { item: 'crate', name: t('타입별 보관함', 'Typed Storage Crate') },
        goal: t('첫 상자에는 정수 3을, 둘째 상자에는 실수 5.5를 각 타입 그대로 보관하세요.', 'Store integer 3 in the first box and decimal 5.5 in the second, preserving their types.'),
        done: t('first.value가 int 3, second.value가 double 5.5이면 완료입니다. 다른 입력값도 보관하면 적용 확인입니다.', 'Complete when first.value is int 3 and second.value is double 5.5; store the other inputs to confirm application.'),
        reuse: t('같은 보관 동작을 서로 다른 타입의 값에 적용할 때 클래스 템플릿을 사용합니다.', 'Use a class template to apply the same storage behavior to different value types.'),
        lecture: { pages: t('Lecture 9, p.2', 'Lecture 9, p. 2'), quotes: [
          'Class templates are also possible, in much the same way we have written function templates:',
          'Point(const T u, const T v) : x(u), y(v) {}',
        ] },
        kind: 'blanks', variants: [{ id: 'base', label: t('타입과 값 구분', 'Type versus value'),
          template: t([
            '#include <iostream>',
            'template <typename T>',
            'class Box {',
            'public:',
            '    T value;',
            '    Box(T v) { value = v; }',
            '    T get() { return value; }',
            '};',
            'int main() {',
            '    int a = {a};',
            '    double b = {b};',
            '    Box<{type}> first(a); // 정수 부품함',
            '    Box<double> second({value}); // 실수 부품함',
            '    int x = first.get();',
            '    double y = second.get();',
            "    std::cout << x << ' ' << y << '\\n';",
            '}'
          ].join('\n'), [
            '#include <iostream>',
            'template <typename T>',
            'class Box {',
            'public:',
            '    T value;',
            '    Box(T v) { value = v; }',
            '    T get() { return value; }',
            '};',
            'int main() {',
            '    int a = {a};',
            '    double b = {b};',
            '    Box<{type}> first(a); // integer box',
            '    Box<double> second({value}); // decimal box',
            '    int x = first.get();',
            '    double y = second.get();',
            "    std::cout << x << ' ' << y << '\\n';",
            '}'
          ].join('\n')),
          params: ['a', 'b'], blanks: {
            type: [{ code: 'int' }, opt('double', 'first의 저장 타입이 double이 되어 정수 부품함이 아닙니다.', 'This makes first store double rather than int.', 'boxType')],
            value: [{ code: 'b' }, opt('a', '생성자에 정수 a를 넘기면 실수 b가 저장되지 않습니다.', 'Passing a to the constructor does not store the decimal b.', 'boxValue')],
          },
          tests: [
            { label: t('정수 3, 실수 5.5', 'Integer 3, decimal 5.5'), params: { a: 3, b: 5.5 } },
            { label: t('정수 7, 실수 2.25', 'Integer 7, decimal 2.25'), params: { a: 7, b: 2.25 } },
            { label: t('정수 1, 실수 8.5', 'Integer 1, decimal 8.5'), params: { a: 1, b: 8.5 } },
          ],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const first = h.cell(r, 'first.value'), second = h.cell(r, 'second.value');
            const x = number(h, r, 'x'), y = number(h, r, 'y');
            const typeOK = !!first && !!second && first.type === 'int' && second.type === 'double';
            const pass = typeOK && Number(first.shown) === test.params.a && Number(second.shown) === test.params.b && x === test.params.a && y === test.params.b;
            return { pass, kind: 'logic', errorType: pass ? undefined : typeOK ? 'boxValue' : 'boxType', message: h.t(`${test.label}: first.value=${first ? first.shown : '?'} (${first ? first.type : '?'}), second.value=${second ? second.shown : '?'} (${second ? second.type : '?'}), x=${x}, y=${y}. 목표는 int ${test.params.a}, double ${test.params.b}입니다.`, `${test.label}: first.value=${first ? first.shown : '?'} (${first ? first.type : '?'}), second.value=${second ? second.shown : '?'} (${second ? second.type : '?'}), x=${x}, y=${y}. Goal: int ${test.params.a}, double ${test.params.b}.`) };
          },
        }], apply: 'tests',
        hints: [
          t('12~13번 줄에서 꺾쇠 안과 괄호 안을 따로 살펴보세요.', 'Inspect the angle brackets and parentheses separately on lines 12–13.'),
          t('클래스 템플릿 인자는 저장 타입이고 생성자 인자는 저장할 값입니다.', 'The class template argument is the storage type; the constructor argument is the value.'),
          t('12번 줄에는 int, 13번 줄에는 실수 변수 b가 필요합니다.', 'Line 12 needs int; line 13 needs the decimal variable b.'),
          t('Box<int> first(a)와 Box<double> second(b)를 사용합니다.', 'Use Box<int> first(a) and Box<double> second(b).'),
        ],
        tools: [
          { name: 'Box<int>', target: t('클래스 템플릿 Box', 'Class template Box'), input: t('타입 인자 int', 'Type argument int'), result: t('정수를 보관하는 클래스 타입', 'A class type storing integers'), change: t('타입 지정만으로 값은 바뀌지 않음', 'Selecting a type alone changes no value'), when: t('정수 상자를 선언할 때', 'Declaring an integer box') },
          { name: 'Box<double> second(b)', target: t('double 상자 second', 'Double box second'), input: t('생성자 값 b', 'Constructor value b'), result: t('초기화된 객체', 'An initialized object'), change: t('second.value에 b 저장', 'Stores b in second.value'), when: t('실수 값으로 상자를 만들 때', 'Creating a box with a decimal value') },
          { name: 'second.get()', target: t('객체 second', 'Object second'), input: t('없음', 'None'), result: t('보관된 double 값', 'The stored double value'), change: t('값을 읽으며 상자는 변경하지 않음', 'Reads without changing the box'), when: t('보관한 값을 꺼내 확인할 때', 'Retrieving the stored value') },
        ],
        scene: { theme: 'templates', widgets: [
          { type: 'wire', pts: [[32, 19], [66, 19]], on: ['first.value'] }, { type: 'wire', pts: [[78, 19], [110, 19]], on: ['x'] },
          { type: 'wire', pts: [[32, 45], [66, 45]], on: ['second.value'] }, { type: 'wire', pts: [[78, 45], [110, 45]], on: ['y'] },
          { type: 'prop', kind: 'mold', x: 66, y: 14 }, { type: 'prop', kind: 'mold', x: 66, y: 40 },
          { type: 'label', x: 72, y: 26, text: t('Box<int>', 'Box<int>') }, { type: 'label', x: 72, y: 52, text: t('Box<double>', 'Box<double>') },
          { type: 'value', x: 14, y: 12, path: 'first.value', icon: 'gear' }, { type: 'value', x: 110, y: 12, path: 'x', icon: 'gear' },
          { type: 'value', x: 14, y: 38, path: 'second.value', icon: 'mold' }, { type: 'value', x: 110, y: 38, path: 'y', icon: 'mold' },
          { type: 'monitor', x: 10, y: 66, w: 70, h: 20 }, { type: 'facility', x: 114, y: 64, kind: 'workshop', label: t('범용 부품실', 'Parts room') },
        ] },
      },
      {
        id: '9-3', title: t('부품 분류기', 'Parts Sorter'), zone,
        sceneIdle: t('집합 바구니와 별도 배열이 대기합니다. 중복 삽입, 순회 합계, 배열 정렬과 검색 결과를 관찰하세요.', 'A set bin and a separate array await parts. Watch duplicate insertion, the iteration sum, sorting, and search results.'),
        reward: { item: 'funnel', name: t('고유 코드 깔때기', 'Unique-code Funnel') },
        goal: t('코드 5와 3을 집합에 넣고 중복 3은 한 번만 보관하며 배열을 정렬하고 검색하세요.', 'Insert codes 5 and 3 into the set, keep duplicate 3 only once, and sort and search the array.'),
        done: t('집합 크기 2, 순회 합 8, 검색 성공과 배열 3, 5가 나오면 완료입니다. 중복과 역순을 포함한 다른 코드도 통과하면 적용 확인입니다.', 'A set size of 2, iteration sum of 8, successful searches, and array 3, 5 complete the mission. Other codes, including duplicates and reversed order, confirm application.'),
        reuse: t('고유한 정렬 코드에는 set을, 임의 접근 배열의 정렬과 이진 검색에는 알고리즘을 사용합니다.', 'Use a set for sorted unique codes, and algorithms to sort and binary-search a random-access array.'),
        lecture: { pages: t('Lecture 9, p.4~5', 'Lecture 9, pp. 4–5'), quotes: [
          'Note that the set automatically sorts its own items.',
          'sort(a, a+7);', 'rotate(a,a+3,a+7);', 'reverse(a, a+7);',
        ] },
        predict: {
          intro: t('2, 2, 5를 set에 넣으면 원소는 몇 개일까요?', 'How many elements remain after inserting 2, 2, and 5 into a set?'),
          program: [
            '#include <iostream>',
            '#include <set>',
            '',
            'int main() {',
            '    std::set<int> s;',
            '    s.insert(2);',
            '    s.insert(2);',
            '    s.insert(5);',
            '    std::cout << s.size();',
            '    return 0;',
            '}',
          ].join('\n'),
          questions: [{ label: t('원소 수', 'Element count'), number: true }],
          answersFrom: r => [r.output.trim()],
        },
        kind: 'blanks', variants: [{ id: 'base', label: t('집합과 배열', 'Set and array'),
          template: t([
            '#include <iostream>',
            '#include <set>',
            '#include <algorithm>',
            'int main() {',
            '    int a = {a}, b = {b};',
            '    std::set<int> parts; // 중복 없는 코드',
            '    parts.{insert}(a);',
            '    parts.insert(b);',
            '    parts.insert(b);',
            '    int total = 0;',
            '    for (int code : parts) { total += code; }',
            '    bool found = parts.find({search}) != parts.end();',
            '    int values[2] = {a, b}; // 별도 배열',
            '    {sort}',
            '    bool searched = std::binary_search(values, values + 2, b);',
            "    std::cout << parts.size() << ' ' << total << ' ' << found << ' ' << searched << '\\n';",
            '}'
          ].join('\n'), [
            '#include <iostream>',
            '#include <set>',
            '#include <algorithm>',
            'int main() {',
            '    int a = {a}, b = {b};',
            '    std::set<int> parts; // unique codes',
            '    parts.{insert}(a);',
            '    parts.insert(b);',
            '    parts.insert(b);',
            '    int total = 0;',
            '    for (int code : parts) { total += code; }',
            '    bool found = parts.find({search}) != parts.end();',
            '    int values[2] = {a, b}; // separate array',
            '    {sort}',
            '    bool searched = std::binary_search(values, values + 2, b);',
            "    std::cout << parts.size() << ' ' << total << ' ' << found << ' ' << searched << '\\n';",
            '}'
          ].join('\n')),
          params: ['a', 'b'], blanks: {
            insert: [{ code: 'insert' }, opt('erase', 'erase는 a를 삽입하지 않고 기존 a를 지웁니다.', 'erase removes an existing a rather than inserting it.', 'setInsert')],
            search: [{ code: 'a' }, opt('a + 100', '삽입한 a가 아닌 다른 코드를 검색합니다.', 'This searches for a different code, not the inserted a.', 'setSearch')],
            sort: [{ code: 'std::sort(values, values + 2);' }, opt('std::reverse(values, values + 2);', 'reverse는 순서를 뒤집지만 임의의 배열을 정렬하지는 않습니다.', 'reverse reverses the order but does not sort an arbitrary array.', 'arraySort')],
          },
          tests: [
            { label: t('코드 5, 3', 'Codes 5, 3'), params: { a: 5, b: 3 } },
            { label: t('코드 2, 7', 'Codes 2, 7'), params: { a: 2, b: 7 } },
            { label: t('같은 코드 4, 4', 'Duplicate codes 4, 4'), params: { a: 4, b: 4 } },
          ],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const { a, b } = test.params, total = number(h, r, 'total'), found = number(h, r, 'found'), searched = number(h, r, 'searched');
            const lo = number(h, r, 'values[0]'), hi = number(h, r, 'values[1]');
            const out = h.numbersIn(r.output), size = a === b ? 1 : 2, sum = a === b ? a : a + b;
            const pass = out[0] === size && total === sum && found === 1 && searched === 1 && lo === Math.min(a, b) && hi === Math.max(a, b);
            const errorType = out[0] !== size || total !== sum ? 'setInsert' : found !== 1 ? 'setSearch' : 'arraySort';
            return { pass, kind: 'logic', errorType: pass ? undefined : errorType, message: h.t(`${test.label}: 크기=${out[0]}, 순회 합=${total}, 집합 검색=${found}, 배열=[${lo}, ${hi}], 이진 검색=${searched}. 목표는 크기 ${size}, 합 ${sum}, 두 검색 1, 정렬된 배열입니다.`, `${test.label}: size=${out[0]}, iteration sum=${total}, set search=${found}, array=[${lo}, ${hi}], binary search=${searched}. Goal: size ${size}, sum ${sum}, both searches 1, and a sorted array.`) };
          },
        }], apply: 'tests',
        hints: [
          t('7번 줄의 삽입, 12번 줄의 검색, 14~15번 줄의 배열 처리를 보세요.', 'Inspect insertion on line 7, search on line 12, and array processing on lines 14–15.'),
          t('set은 중복을 제거하고 정렬합니다. binary_search 전에 배열을 정렬해야 합니다.', 'A set removes duplicates and orders elements. Sort the array before binary_search.'),
          t('parts.insert(a), parts.find(a), std::sort(values, values + 2)를 사용하세요.', 'Use parts.insert(a), parts.find(a), and std::sort(values, values + 2).'),
          t('insert와 find는 set 멤버 함수이고 sort는 배열 범위를 받는 일반 함수입니다. set에 sort를 호출하지 않습니다.', 'insert and find are set members; sort is a free function on the array range. Do not sort the set.'),
        ],
        tools: [
          { name: 'parts.insert(a)', target: t('set parts', 'Set parts'), input: t('코드 a', 'Code a'), result: t('삽입 결과', 'Insertion result'), change: t('없던 코드만 추가', 'Adds only a new code'), when: t('중복 없이 보관할 때', 'Storing unique codes') },
          { name: 'parts.find(a)', target: t('set parts', 'Set parts'), input: t('찾을 코드 a', 'Code a to find'), result: t('원소 반복자 또는 end()', 'Element iterator or end()'), change: t('집합은 바뀌지 않음', 'Does not change the set'), when: t('특정 코드가 있는지 확인할 때', 'Checking for a specific code') },
          { name: 'std::sort(values, values + 2)', target: t('배열의 반열린 범위', 'Half-open array range'), input: t('시작과 끝 다음 위치', 'Beginning and one-past-end'), result: t('반환값 없음', 'No return value'), change: t('배열을 오름차순으로 재배치', 'Reorders the array ascending'), when: t('정렬된 배열을 준비할 때', 'Preparing a sorted array') },
          { name: 'std::binary_search', target: t('정렬된 배열 범위', 'Sorted array range'), input: t('시작, 끝, 찾을 코드', 'Beginning, end, and code'), result: t('존재 여부 bool', 'Presence as bool'), change: t('배열을 변경하지 않음', 'Does not change the array'), when: t('정렬된 범위에서 존재 여부를 찾을 때', 'Checking presence in a sorted range') },
        ],
        scene: { theme: 'templates', widgets: [
          { type: 'wire', pts: [[60, 30], [84, 30], [84, 19], [100, 19]], on: ['total'] }, { type: 'wire', pts: [[60, 30], [84, 30], [84, 41], [100, 41]], on: ['found'] },
          { type: 'set', x: 14, y: 14, path: 'parts', slots: 3 }, { type: 'array', x: 14, y: 50, path: 'values', display: 'crate', slots: 2 },
          { type: 'facility', kind: 'machine', x: 64, y: 24, label: t('정렬기', 'Sorter') },
          { type: 'value', x: 100, y: 12, path: 'total', icon: 'gear', side: true }, { type: 'value', x: 100, y: 34, path: 'found', icon: 'flag', side: true },
          { type: 'monitor', x: 96, y: 62, w: 54, h: 24 },
        ] },
      },
      {
        id: '9-4', title: t('자원 합산기', 'Resource Combiner'), zone,
        sceneIdle: t('왼쪽과 오른쪽 묶음의 부품 수가 준비됩니다. +가 반환한 새 total 묶음과 원본을 비교하세요.', 'The left and right bundle counts are ready. Compare the new total returned by + with its originals.'),
        reward: { item: 'plus', name: t('자원 결합 표식', 'Resource Combination Mark') },
        goal: t('부품 3개 묶음과 5개 묶음의 +가 부품 8개의 새 묶음을 만들게 하세요.', 'Make + create a new bundle of 8 parts from bundles of 3 and 5.'),
        done: t('원본 3과 5를 유지하고 total.parts가 8이면 완료입니다. 다른 묶음의 합도 맞으면 적용 확인입니다.', 'Complete when the originals remain 3 and 5 and total.parts is 8. Correct sums for other bundles confirm application.'),
        reuse: t('사용자 정의 값끼리의 연산이 명확한 의미를 가질 때 해당 연산자를 정의합니다.', 'Define an operator when an operation on user-defined values has a clear meaning.'),
        lecture: { pages: t('Lecture 9, p.5~6', 'Lecture 9, pp. 5–6'), quotes: [
          'We have been using operators on primitives, but sometimes it makes sense to use them on user-defined datatypes.',
          'USCurrency c = a + b;',
        ] },
        kind: 'blanks', variants: [{ id: 'base', label: t('두 묶음 합치기', 'Combine two bundles'),
          template: t([
            '#include <iostream>',
            'class Bundle {',
            'public:',
            '    int parts;',
            '    Bundle(int n) { parts = n; }',
            '    Bundle {op}(const Bundle &other) {',
            '        return Bundle({sum});',
            '    }',
            '};',
            'int main() {',
            '    Bundle left({a}); // 왼쪽 묶음',
            '    Bundle right({b}); // 오른쪽 묶음',
            '    Bundle total = left + right;',
            "    std::cout << total.parts << '\\n';",
            '}'
          ].join('\n'), [
            '#include <iostream>',
            'class Bundle {',
            'public:',
            '    int parts;',
            '    Bundle(int n) { parts = n; }',
            '    Bundle {op}(const Bundle &other) {',
            '        return Bundle({sum});',
            '    }',
            '};',
            'int main() {',
            '    Bundle left({a}); // left bundle',
            '    Bundle right({b}); // right bundle',
            '    Bundle total = left + right;',
            "    std::cout << total.parts << '\\n';",
            '}'
          ].join('\n')),
          params: ['a', 'b'], blanks: {
            op: [{ code: 'operator+' }, opt('operator-', 'operator-를 정의해도 left + right에 필요한 operator+는 생기지 않습니다.', 'Defining operator- does not provide the operator+ needed by left + right.', 'operatorDefinition')],
            sum: [{ code: 'parts + other.parts' }, opt('parts - other.parts', '오른쪽 묶음을 빼면 두 부품 수의 합이 아닙니다.', 'Subtracting the right bundle does not produce the combined count.', 'bundleSum'), opt('parts + parts', '왼쪽을 두 번 더하면 오른쪽 묶음이 빠집니다.', 'Adding the left count twice leaves out the right bundle.', 'bundleSum')],
          },
          tests: [
            { label: t('왼쪽 3, 오른쪽 5', 'Left 3, right 5'), params: { a: 3, b: 5 } },
            { label: t('왼쪽 7, 오른쪽 2', 'Left 7, right 2'), params: { a: 7, b: 2 } },
            { label: t('왼쪽 4, 오른쪽 0', 'Left 4, right 0'), params: { a: 4, b: 0 } },
          ],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const left = number(h, r, 'left.parts'), right = number(h, r, 'right.parts'), total = number(h, r, 'total.parts');
            const expected = test.params.a + test.params.b;
            const pass = left === test.params.a && right === test.params.b && total === expected;
            return { pass, kind: 'logic', errorType: pass ? undefined : 'bundleSum', message: h.t(`${test.label}: left.parts=${left}, right.parts=${right}, total.parts=${total}. 목표는 원본 ${test.params.a}, ${test.params.b} 유지와 합 ${expected}입니다.`, `${test.label}: left.parts=${left}, right.parts=${right}, total.parts=${total}. Goal: preserve ${test.params.a}, ${test.params.b} and produce ${expected}.`) };
          },
        }], apply: 'tests',
        hints: [
          t('6~7번 줄의 연산자 선언과 반환할 새 묶음을 살펴보세요.', 'Inspect the operator declaration and returned new bundle on lines 6–7.'),
          t('멤버 연산자에서 현재 객체가 왼쪽이고 other가 오른쪽 피연산자입니다.', 'In a member operator, the current object is the left operand and other is the right operand.'),
          t('6번 줄에는 operator+, 7번 줄에는 parts + other.parts가 필요합니다.', 'Line 6 needs operator+; line 7 needs parts + other.parts.'),
          t('operator+는 두 필드의 합으로 새 Bundle을 반환하며 기존 묶음을 바꾸지 않습니다.', 'operator+ returns a new Bundle with the sum of both fields, leaving the originals unchanged.'),
        ],
        tools: [
          { name: 'Bundle::operator+', target: t('+ 왼쪽 Bundle', 'Bundle on the left of +'), input: t('오른쪽 Bundle 참조 other', 'Reference other to the right Bundle'), result: t('새 Bundle', 'A new Bundle'), change: t('여기서는 원본 묶음을 변경하지 않음', 'Here neither original bundle changes'), when: t('묶음의 결합 의미를 정의할 때', 'Defining what combining bundles means') },
          { name: 'parts + other.parts', target: t('두 부품 수', 'Both part counts'), input: t('왼쪽과 오른쪽 정수', 'Left and right integers'), result: t('두 정수의 합', 'The sum of both integers'), change: t('계산만 하며 필드 변경 없음', 'Calculates without changing fields'), when: t('새 묶음의 부품 수를 계산할 때', 'Calculating the new bundle count') },
          { name: 'left + right', target: t('두 Bundle 객체', 'Two Bundle objects'), input: t('왼쪽과 오른쪽 객체', 'Left and right objects'), result: t('operator+가 반환한 묶음', 'Bundle returned by operator+'), change: t('반환값으로 total 생성', 'Constructs total from the result'), when: t('정의한 합산을 사용할 때', 'Using the defined addition') },
        ],
        scene: { theme: 'templates', widgets: [
          { type: 'wire', pts: [[32, 19], [44, 19], [44, 34], [56, 34]], on: ['left.parts'] }, { type: 'wire', pts: [[32, 45], [44, 45], [44, 38], [56, 38]], on: ['right.parts'] }, { type: 'wire', pts: [[72, 36], [104, 36]], on: ['total.parts'] },
          { type: 'value', x: 14, y: 12, path: 'left.parts', icon: 'crate' }, { type: 'value', x: 14, y: 38, path: 'right.parts', icon: 'crate' },
          { type: 'facility', kind: 'machine', x: 56, y: 28, label: t('operator+', 'operator+') },
          { type: 'value', x: 104, y: 28, path: 'total.parts', icon: 'crate' },
          { type: 'monitor', x: 10, y: 66, w: 70, h: 20 }, { type: 'facility', x: 114, y: 60, kind: 'workshop', label: t('합산 공방', 'Merge shop') },
        ] },
      },
    ],
  });
})(this);
