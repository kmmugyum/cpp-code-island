(function (global) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../missions.js') : global.Missions;
  const t = (ko, en) => ({ ko, en });
  const opt = (code, ko, en, errorType) => ({ code, why: t(ko, en), errorType });
  const zone = t('자원 관리소', 'Resource Depot');
  const events = (r, type) => (r.steps || []).flatMap(s => s.events || []).filter(e => e.type === type);

  M.registerChapter({
    no: 8, zone,
    errorTypes: {
      ownership: t('자원 소유와 수명', 'Ownership and lifetime'),
      memoryLeak: t('메모리 누수', 'Memory leak'),
      doubleFree: t('이중 해제', 'Double free'),
      useAfterFree: t('해제 후 사용', 'Use after free'),
      deleteMismatch: t('배열 해제 방식', 'Mismatched release'),
      copyValue: t('복사 값', 'Copied value'),
    },
    codeErrorTypes: { doubleFree: 'doubleFree', useAfterFree: 'useAfterFree', deleteMismatch: 'deleteMismatch' },
    missions: [
      {
        id: '8-1', title: t('임시 작업실', 'Temporary Workshop'), zone,
        sceneIdle: t('작업실은 비어 있습니다. 블록에서 r이 생성되면 전력과 객체가 나타나고 블록을 나가면 객체가 사라집니다.', 'The workshop starts empty. Robot r and its power appear inside the block and the object leaves at block exit.'),
        reward: { item: 'timer', name: t('수명 타이머', 'Lifetime Timer') },
        goal: t('입력 전력을 r에 저장하고 블록 안에서 읽은 뒤 소멸 순서를 확인하세요.', 'Store the input power in r, read it inside the block, and observe destruction.'),
        done: t('입력 4에서 4, 0, 1 순서와 r의 생성·소멸을 확인하면 완료입니다. 입력 9에서도 확인하세요.', 'Complete with input 4, output 4, 0, 1, and construction and destruction of r; apply it with input 9.'),
        reuse: t('인자와 필드 이름이 같을 때 this로 현재 객체의 필드를 지정하고 블록 밖에서는 지역 객체를 사용하지 않습니다.', 'Use this to distinguish a field from a same-named parameter, and do not use a local object after its block.'),
        lecture: { pages: t('Lecture 8, p.11, 13~14, 58~60', 'Lecture 8, pp. 11, 13–14, 58–60'), quotes: ['this: a pointer to the current instance', 'Destructor is called when the class instance gets de-allocated'] },
        predict: { intro: t('블록을 나간 뒤 1을 출력합니다. 소멸자의 0은 그 전일까요?', 'The program prints 1 after the block. Does the destructor print 0 first?'), questions: [{ label: t('입력 4에서 두 번째 출력', 'Second output for input 4'), number: true }], answersFrom: () => ['0'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('작업실 수명', 'Workshop lifetime'),
          template: t([
            '#include <iostream>', 'using namespace std;', 'class Robot {', 'public:', '    int power;', '    Robot(int power) {', '        {store}', '    }', '    ~Robot() { cout << 0 << endl; }', '};', 'int main() {', '    int n; cin >> n;', '    {', '        Robot r(n); // 작업실의 로봇', '        cout << {read} << endl;', '    }', '    cout << 1 << endl;', '}'
          ].join('\n'), [
            '#include <iostream>', 'using namespace std;', 'class Robot {', 'public:', '    int power;', '    Robot(int power) {', '        {store}', '    }', '    ~Robot() { cout << 0 << endl; }', '};', 'int main() {', '    int n; cin >> n;', '    {', '        Robot r(n); // robot in the workshop', '        cout << {read} << endl;', '    }', '    cout << 1 << endl;', '}'
          ].join('\n')),
          blanks: {
            store: [{ code: 'this->power = power;' }, opt('this->power = 4;', '4만 저장하면 다른 입력을 잃습니다.', 'Storing 4 loses other inputs.', 'ownership')],
            read: [{ code: 'r.power' }, opt('n + 1', '입력에 1을 더하면 로봇의 전력을 읽지 않습니다.', 'Adding 1 to the input does not read the robot power.', 'ownership')],
          },
          tests: [{ label: t('전력 4', 'Power 4'), input: '4' }, { label: t('전력 9', 'Power 9'), input: '9' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), out = h.numbersIn(r.output), cs = events(r, 'construct'), ds = events(r, 'destruct');
            const power = h.cell(r, 'r.power');
            const pass = out.join(',') === [n, 0, 1].join(',') && Number(power?.shown) === n && cs.some(e => e.path === 'r') && ds.some(e => e.path === 'r');
            return { pass, kind: 'logic', errorType: 'ownership', message: h.t(`입력 ${n}: r.power=${power?.shown ?? '없음'}, 출력 ${out.join(', ')}; r 생성 ${cs.length}회, 소멸 ${ds.length}회입니다. 목표는 전력 ${n}, 출력 ${n}, 0, 1과 r의 생성·소멸입니다.`, `Input ${n}: r.power=${power?.shown ?? 'missing'}, output ${out.join(', ')}; ${cs.length} construction and ${ds.length} destruction events. Goal: power ${n}, output ${n}, 0, 1 and r constructed and destroyed.`) };
          }
        }], apply: 'tests',
        hints: [t('7행의 필드 대입과 15행의 읽기를 살펴보세요.', 'Inspect the field assignment on line 7 and read on line 15.'), t('this는 생성 중인 객체이고 r은 블록에서만 사용할 수 있습니다.', 'this is the object being constructed; r is usable only within its block.'), t('this->power에 인자 power를 저장하고 r.power를 읽습니다.', 'Store the parameter power in this->power and read r.power.'), t('블록이 끝나면 r의 소멸자가 0을 출력한 후 바깥에서 1을 출력합니다.', 'At block exit r’s destructor prints 0, then the outer code prints 1.')],
        tools: [
          { name: 'this->power', target: t('현재 Robot의 필드', 'Current Robot field'), input: t('생성자 인자 power', 'Constructor argument power'), result: t('저장된 전력', 'Stored power'), change: t('r.power가 바뀜', 'Changes r.power'), when: t('인자와 필드 이름이 같을 때', 'When parameter and field names match') },
          { name: '~Robot()', target: t('블록의 r', 'Block-local r'), input: t('블록 종료', 'Block exit'), result: t('소멸자 호출', 'Destructor call'), change: t('r의 수명이 끝남', 'Ends r’s lifetime'), when: t('객체가 범위를 벗어날 때', 'When the object leaves scope') },
        ],
        scene: { theme: 'memory', widgets: [
          { type: 'zone', kind: 'bay', x: 12, y: 10, w: 46, h: 46 },
          { type: 'objects', class: 'Robot', battery: 'power', max: 10, x: 26, y: 16, w: 40, slots: 1 },
          { type: 'value', path: 'r.power', x: 70, y: 18, icon: 'cell', side: true },
          { type: 'monitor', x: 10, y: 62, w: 70, h: 24 }, { type: 'facility', kind: 'workshop', x: 114, y: 22, label: t('임시 작업실', 'Temporary shop') },
        ] },
      },
      {
        id: '8-2', title: t('임시 자원 대여', 'Borrow a Resource'), zone,
        sceneIdle: t('p와 빈 힙이 보입니다. 안쪽 블록을 나간 뒤에도 힙이 살아 있다가 반납되면 해제 표시가 나타납니다.', 'Pointer p and an empty heap await the loan. The block remains live after the inner scope, then shows as freed.'),
        reward: { item: 'recycle', name: t('대여 반납 표식', 'Loan Return Token') },
        goal: t('안쪽 블록에서 정수를 할당해 입력을 저장하고 바깥에서 읽은 뒤 반납하세요.', 'Allocate an integer in the inner block, store the input, then read and release it outside.'),
        done: t('입력 4를 출력하고 할당 하나를 한 번 해제하면 완료입니다. 입력 9도 확인하세요.', 'Complete by printing input 4 and freeing the single allocation once; also check input 9.'),
        reuse: t('블록을 넘어 살아야 하는 자원을 new로 만들면 마지막 사용 후 대응하는 delete로 반납합니다.', 'For a resource that must outlive a block, pair new with delete after its last use.'),
        lecture: { pages: t('Lecture 8, p.23~26, 29', 'Lecture 8, pp. 23–26, 29'), quotes: ['Returns a pointer to the newly allocated memory', 'De-allocates memory that was previously allocated using new'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('대여와 반납', 'Borrow and return'),
          template: t([
            '#include <iostream>', 'using namespace std;', 'int main() {', '    int n; cin >> n;', '    int *p = nullptr;', '    {', '        p = {allocate}; // 블록 밖에서도 살아 있는 자원', '        *p = n;', '    }', '    cout << *p << endl;', '    {release}', '}'
          ].join('\n'), [
            '#include <iostream>', 'using namespace std;', 'int main() {', '    int n; cin >> n;', '    int *p = nullptr;', '    {', '        p = {allocate}; // resource survives the block', '        *p = n;', '    }', '    cout << *p << endl;', '    {release}', '}'
          ].join('\n')),
          blanks: { allocate: [{ code: 'new int' }, opt('new int[1]', '배열 할당에는 delete[]가 필요합니다.', 'An array allocation requires delete[].', 'deleteMismatch')], release: [{ code: 'delete p;' }, opt('p = nullptr;', '포인터만 지우면 할당은 누수로 남습니다.', 'Clearing the pointer leaves the allocation leaked.', 'memoryLeak')] },
          tests: [{ label: t('대여 값 4', 'Loan value 4'), input: '4' }, { label: t('대여 값 9', 'Loan value 9'), input: '9' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), a = events(r, 'alloc'), f = events(r, 'free'), out = h.numbersIn(r.output);
            const pass = out.length === 1 && out[0] === n && a.length === 1 && f.length === 1 && a[0].id === f[0].id && !f[0].array && !r.leaks.length;
            return { pass, kind: 'logic', errorType: r.leaks.length ? 'memoryLeak' : 'ownership', message: h.t(`입력 ${n}: 출력 ${out.join(', ')}, 할당 ${a.length}개, 해제 ${f.length}개, 누수 ${r.leaks.length}개입니다. 목표는 ${n} 출력과 단일 할당의 해제, 누수 0개입니다.`, `Input ${n}: output ${out.join(', ')}, ${a.length} allocations, ${f.length} frees, ${r.leaks.length} leaks. Goal: print ${n}, free the single allocation, and leave no leaks.`) };
          }
        }], apply: 'tests',
        hints: [t('7행의 할당과 11행의 반납을 살펴보세요.', 'Inspect the allocation on line 7 and release on line 11.'), t('p의 범위와 p가 가리키는 동적 정수의 수명은 다릅니다.', 'The scope of p and the lifetime of its dynamically allocated integer differ.'), t('new int와 delete p를 짝지으세요.', 'Pair new int with delete p.'), t('안쪽 블록이 끝나도 힙 정수는 남습니다. 출력 후 delete p를 한 번 실행합니다.', 'The heap integer survives the inner block. Execute delete p once after printing.')],
        tools: [
          { name: 'new int', target: t('힙의 정수', 'Heap integer'), input: t('정수 타입', 'The int type'), result: t('새 할당의 포인터', 'Pointer to the allocation'), change: t('살아 있는 힙 블록 추가', 'Adds a live heap block'), when: t('범위 밖에서도 살아야 할 때', 'When storage must outlive a block') },
          { name: 'delete p', target: t('p의 단일 할당', 'Single allocation at p'), input: t('소유 포인터 p', 'Owning pointer p'), result: t('할당 해제', 'Allocation released'), change: t('힙 블록이 해제됨', 'Heap block becomes freed'), when: t('마지막 사용 후', 'After the last use') },
        ],
        scene: { theme: 'memory', widgets: [
          { type: 'pointer', path: 'p', x: 22, y: 20 }, { type: 'heap', x: 76, y: 14, w: 60, slots: 2 },
          { type: 'value', path: 'n', x: 22, y: 42, icon: 'cell' },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', kind: 'workshop', x: 116, y: 52, label: t('임시 창고', 'Loan depot') },
        ] },
      },
      {
        id: '8-3', title: t('자원 반납 검사', 'Resource Return Inspection'), zone,
        sceneIdle: t('두 칸 배열이 힙에 할당되면 p의 화살표가 연결됩니다. 해제와 종료 시 남은 누수를 관찰하세요.', 'The heap receives a two-slot array and p points to it. Watch release and allocations left at exit.'),
        reward: { item: 'badge', name: t('배열 반납증', 'Array Return Ticket') },
        goal: t('입력 n과 n+1을 더한 뒤 배열을 한 번 반납하고 누수와 세 가지 잘못된 해제를 구분하세요.', 'Add input n and n+1, release the array once, and distinguish a leak from three invalid memory operations.'),
        done: t('입력 4에서 합 9를 출력하고 배열 해제와 누수 0개를 확인하면 완료입니다. 입력 9에서도 적용하세요.', 'Complete with input 4, sum 9, an array free and zero leaks; apply it to input 9.'),
        reuse: t('new[]로 확보한 배열은 마지막 읽기 뒤 delete[]로 정확히 한 번 해제합니다.', 'Release an array allocated with new[] exactly once with delete[] after its final read.'),
        lecture: { pages: t('Lecture 8, p.33, 44~46, 51~53', 'Lecture 8, pp. 33, 44–46, 51–53'), quotes: ['When your program allocates memory but is unable to de-allocate it, this is a memory leak', 'De-allocate arrays with delete[]', 'Don’t delete memory twice'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('배열 검사', 'Inspect the array'),
          template: t([
            '#include <iostream>', 'using namespace std;', 'int main() {', '    int n; cin >> n;', '    int *p = new int[2]; // 대여한 두 칸', '    p[0] = n;', '    p[1] = n + 1;', '    cout << {sum} << endl;', '    {release}', '}'
          ].join('\n'), [
            '#include <iostream>', 'using namespace std;', 'int main() {', '    int n; cin >> n;', '    int *p = new int[2]; // two borrowed slots', '    p[0] = n;', '    p[1] = n + 1;', '    cout << {sum} << endl;', '    {release}', '}'
          ].join('\n')),
          blanks: {
            sum: [{ code: 'p[0] + p[1]' }, opt('p[0] + p[0]', '첫 칸을 두 번 더하면 둘째 칸이 빠집니다.', 'Adding the first slot twice omits the second.', 'ownership')],
            release: [{ code: 'delete[] p;' }, opt('p = nullptr;', '할당을 해제하지 않아 종료 시 누수가 남습니다.', 'The allocation is not freed and remains leaked at exit.', 'memoryLeak'), opt('delete[] p; delete[] p;', '같은 배열을 두 번 해제하면 정의되지 않은 동작입니다.', 'Deleting the same array twice is undefined behavior.', 'doubleFree'), opt('delete[] p; cout << p[0];', '해제된 배열을 읽으면 정의되지 않은 동작입니다.', 'Reading the freed array is undefined behavior.', 'useAfterFree'), opt('delete p;', 'new[]로 만든 배열에는 delete[]가 필요합니다.', 'An array made with new[] requires delete[].', 'deleteMismatch')],
          },
          tests: [{ label: t('배열 값 4와 5', 'Array values 4 and 5'), input: '4' }, { label: t('배열 값 9와 10', 'Array values 9 and 10'), input: '9' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), out = h.numbersIn(r.output), a = events(r, 'alloc'), f = events(r, 'free');
            const pass = out.length === 1 && out[0] === 2 * n + 1 && a.length === 1 && f.length === 1 && f[0].array && a[0].id === f[0].id && !r.leaks.length;
            return { pass, kind: 'logic', errorType: r.leaks.length ? 'memoryLeak' : 'ownership', message: h.t(`입력 ${n}: 합 출력 ${out.join(', ')}, 배열 해제 ${f.filter(e => e.array).length}회, 누수 ${r.leaks.length}개입니다. 목표는 합 ${2*n+1}, 배열 해제 1회와 누수 0개입니다.`, `Input ${n}: sum output ${out.join(', ')}, ${f.filter(e => e.array).length} array frees, ${r.leaks.length} leaks. Goal: sum ${2*n+1}, one array free, zero leaks.`) };
          }
        }], apply: 'tests',
        hints: [t('8행의 두 원소와 9행의 해제 방식을 확인하세요.', 'Inspect both elements on line 8 and the release on line 9.'), t('누수는 종료 시 남은 할당이며 즉시 종료를 뜻하지 않습니다. 이중 해제와 해제 후 읽기는 정의되지 않은 동작입니다.', 'A leak is an allocation left at exit, not an immediate termination. Double free and use after free are undefined behavior.'), t('p[0] + p[1]을 출력하고 delete[] p를 사용하세요.', 'Print p[0] + p[1] and use delete[] p.'), t('배열을 읽은 다음 delete[]로 한 번 반납합니다. delete p는 new[]와 맞지 않습니다.', 'Read the array, then release it once with delete[]. Scalar delete does not match new[].')],
        tools: [
          { name: 'new int[2]', target: t('정수 배열', 'Integer array'), input: t('원소 수 2', 'Two elements'), result: t('첫 원소를 가리키는 포인터', 'Pointer to first element'), change: t('힙 배열 할당', 'Allocates a heap array'), when: t('동적 배열이 필요할 때', 'When dynamic array storage is needed') },
          { name: 'delete[] p', target: t('p의 배열', 'Array at p'), input: t('배열 소유 포인터', 'Owning array pointer'), result: t('배열 전체 반납', 'Entire array released'), change: t('힙 블록이 해제됨', 'Heap block becomes freed'), when: t('마지막 원소 사용 뒤', 'After the last element access') },
        ],
        scene: { theme: 'memory', widgets: [
          { type: 'pointer', path: 'p', x: 22, y: 20 }, { type: 'heap', x: 76, y: 14, w: 60, slots: 2 },
          { type: 'value', path: 'n', x: 22, y: 42, icon: 'cell' },
          { type: 'monitor', x: 10, y: 64, w: 70, h: 22 }, { type: 'facility', kind: 'workshop', x: 116, y: 52, label: t('반납 검사소', 'Return check') },
        ] },
      },
      {
        id: '8-4', title: t('복제 로봇의 고장', 'The Broken Copy'), zone,
        sceneIdle: t('원본과 복제 로봇이 각각 힙 자원을 가리킵니다. 복사 방식에 따라 화살표와 해제 기록이 달라집니다.', 'Original and copied robots point to heap resources. Their arrows and release events depend on the copy.'),
        reward: { item: 'blueprint', name: t('독립 복제 설계도', 'Independent Copy Blueprint') },
        goal: t('복사 생성자가 별도 정수를 할당해 원본 값을 복사하고 두 로봇이 각자 반납하게 하세요.', 'Make the copy constructor allocate and copy a separate integer so each robot releases its own resource.'),
        done: t('입력 4에서 복사 직후 4, 수정한 복제본 5, 원본 4를 출력하고 두 할당을 각각 해제하면 완료입니다. 입력 9도 확인하세요.', 'Complete with input 4, copy 4 before modification, changed copy 5, original 4, and two separate frees; apply it to input 9.'),
        reuse: t('수동 자원 소유 객체를 복사 생성할 때 별도 자원을 만들고 복사 대입은 별도로 검토합니다.', 'When copy-constructing a manual resource owner, allocate separate storage; consider copy assignment separately.'),
        lecture: { pages: t('Lecture 8, p.67~73, 75', 'Lecture 8, pp. 67–73, 75'), quotes: ['Default copy constructor copies fields', 'Write your own a copy constructor to fix these bugs'] },
        kind: 'blanks', variants: [{ id: 'base', label: t('독립 복제', 'Independent copy'),
          template: t([
            '#include <iostream>', 'using namespace std;', 'class Robot {', 'public:', '    int *data;', '    Robot(int n) { data = new int; *data = n; }', '    Robot(const Robot &other) {', '        {copyData}', '    }', '    ~Robot() { delete data; }', '};', 'int main() {', '    int n; cin >> n;', '    Robot a(n);', '    {', '        {makeCopy} // 새 객체의 복사 생성', '        cout << *b.data << endl;', '        *b.data = n + 1;', '        cout << *b.data << endl;', '    }', '    cout << *a.data << endl;', '}'
          ].join('\n'), [
            '#include <iostream>', 'using namespace std;', 'class Robot {', 'public:', '    int *data;', '    Robot(int n) { data = new int; *data = n; }', '    Robot(const Robot &other) {', '        {copyData}', '    }', '    ~Robot() { delete data; }', '};', 'int main() {', '    int n; cin >> n;', '    Robot a(n);', '    {', '        {makeCopy} // copy construction of a new object', '        cout << *b.data << endl;', '        *b.data = n + 1;', '        cout << *b.data << endl;', '    }', '    cout << *a.data << endl;', '}'
          ].join('\n')),
          blanks: {
            copyData: [{ code: 'data = new int; *data = *other.data;' }, opt('data = other.data;', '얕은 복사는 두 소멸자가 같은 자원을 해제하게 하며 먼저 원본 읽기도 위험해집니다.', 'A shallow copy makes both destructors release the same resource and makes the earlier original read unsafe.', 'useAfterFree'), opt('data = new int; *data = 4;', '별도 공간이지만 원본 값 대신 4를 저장합니다.', 'The storage is separate but holds 4 instead of the original value.', 'copyValue')],
            makeCopy: [{ code: 'Robot b = a;' }, opt('Robot b(n);', '새 객체를 만들지만 a의 복사 생성자를 호출하지 않습니다.', 'This creates a new object without invoking the copy constructor of a.', 'ownership')],
          },
          tests: [{ label: t('원본 값 4', 'Original value 4'), input: '4' }, { label: t('원본 값 9', 'Original value 9'), input: '9' }],
          check(r, test, h) {
            if (!r.ok) return h.simFailure(r);
            const n = Number(test.input), out = h.numbersIn(r.output), a = events(r, 'alloc'), f = events(r, 'free'), c = events(r, 'construct'), d = events(r, 'destruct');
            const ids = new Set(a.map(e => e.id));
            const pass = out.join(',') === [n,n+1,n].join(',') && a.length === 2 && ids.size === 2 && f.length === 2 && new Set(f.map(e => e.id)).size === 2 && f.every(e => ids.has(e.id)) && c.some(e => e.path === 'b' && e.how === 'copy') && d.some(e => e.path === 'a') && d.some(e => e.path === 'b') && !r.leaks.length;
            return { pass, kind: 'logic', errorType: out[0] !== n ? 'copyValue' : 'ownership', message: h.t(`입력 ${n}: 출력 ${out.join(', ')}, 할당 ${a.length}개, 서로 다른 해제 ${new Set(f.map(e => e.id)).size}개, 복사 생성 ${c.filter(e => e.how === 'copy').length}회, 누수 ${r.leaks.length}개입니다. 목표는 ${n}, ${n+1}, ${n}과 독립 할당·해제 2개, b의 복사 생성입니다.`, `Input ${n}: output ${out.join(', ')}, ${a.length} allocations, ${new Set(f.map(e => e.id)).size} distinct frees, ${c.filter(e => e.how === 'copy').length} copy constructions, ${r.leaks.length} leaks. Goal: ${n}, ${n+1}, ${n}, two independent allocations and frees, and copy construction of b.`) };
          }
        }], apply: 'tests',
        hints: [t('8행의 자원 복사와 16행의 객체 생성을 살펴보세요.', 'Inspect the resource copy on line 8 and object creation on line 16.'), t('포인터만 복사하면 두 소멸자가 같은 자원을 해제하려고 합니다.', 'Copying only the pointer makes two destructors attempt to free the same resource.'), t('새 int에 *other.data를 복사하고 Robot b = a로 생성하세요.', 'Copy *other.data into a new int and create Robot b = a.'), t('b는 새 객체이므로 복사 생성입니다. b의 독립 자원 수정과 소멸 후에도 a의 값은 남습니다. 복사 대입은 별도 문제입니다.', 'b is a new object, so this is copy construction. Changing and destroying b leaves a’s independent value intact. Copy assignment is separate.')],
        tools: [
          { name: 'Robot(const Robot &other)', target: t('새 Robot', 'New Robot'), input: t('원본 객체', 'Source object'), result: t('복사 생성된 객체', 'Copy-constructed object'), change: t('별도 자원을 소유하는 객체 생성', 'Creates an object owning a separate resource'), when: t('Robot b = a로 새 객체를 만들 때', 'When creating a new object with Robot b = a') },
          { name: '*data = *other.data', target: t('새 힙 정수', 'New heap integer'), input: t('원본 자원의 값', 'Value of the source resource'), result: t('복사된 값', 'Copied value'), change: t('새 블록의 값', 'Value of the new block'), when: t('별도 할당을 초기화할 때', 'When initializing separate storage') },
          { name: '~Robot()', target: t('소유 Robot', 'Owning Robot'), input: t('객체 수명 종료', 'End of object lifetime'), result: t('자원 해제', 'Resource release'), change: t('해당 힙 블록 반납', 'Releases its heap block'), when: t('객체가 범위를 벗어날 때', 'When the object leaves scope') },
        ],
        scene: { theme: 'memory', widgets: [
          { type: 'objects', class: 'Robot', x: 14, y: 10, w: 40, slots: 2, pitchY: 38 },
          { type: 'pointer', path: 'a.data', x: 50, y: 18 }, { type: 'pointer', path: 'b.data', x: 50, y: 56 },
          { type: 'heap', x: 96, y: 12, w: 52, slots: 2 },
          { type: 'monitor', x: 100, y: 66, w: 50, h: 20 }, { type: 'facility', kind: 'machine', x: 76, y: 38, label: t('복제기', 'Cloner') },
        ] },
      },
    ],
  });
})(this);
