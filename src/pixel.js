/*
 * 픽셀 아트 공통 모듈: 팔레트·글꼴·아이콘·스프라이트.
 * 모든 그래픽은 이 파일의 코드로 직접 그린다(외부 이미지 에셋 없음).
 * 색상은 Sweetie 16 팔레트(GrafxKid, lospec.com/palette-list/sweetie-16)의 16색만 쓴다.
 * 좌표 단위는 논리 픽셀 1px. 화면에는 정수 배율로만 확대한다.
 */
(function (global) {
  'use strict';

  const PAL = {
    k: '#1a1c2c', v: '#5d275d', r: '#b13e53', o: '#ef7d57', y: '#ffcd75', G: '#a7f070', e: '#38b764', t: '#257179',
    b: '#29366f', B: '#3b5dc9', c: '#41a6f6', s: '#73eff7', w: '#f4f4f4', l: '#94b0c2', g: '#566c86', d: '#333c57',
  };

  // ------------------------------------------------------------ 3x5 글꼴 (대문자·숫자·기호만: 짧은 표시용)
  const FONT = {
    0: '###,#.#,#.#,#.#,###', 1: '.#.,##.,.#.,.#.,###', 2: '###,..#,###,#..,###', 3: '###,..#,###,..#,###',
    4: '#.#,#.#,###,..#,..#', 5: '###,#..,###,..#,###', 6: '###,#..,###,#.#,###', 7: '###,..#,.#.,.#.,.#.',
    8: '###,#.#,###,#.#,###', 9: '###,#.#,###,..#,###',
    A: '.#.,#.#,###,#.#,#.#', B: '##.,#.#,##.,#.#,##.', C: '.##,#..,#..,#..,.##', D: '##.,#.#,#.#,#.#,##.',
    E: '###,#..,##.,#..,###', F: '###,#..,##.,#..,#..', G: '.##,#..,#.#,#.#,.##', H: '#.#,#.#,###,#.#,#.#',
    I: '###,.#.,.#.,.#.,###', J: '..#,..#,..#,#.#,.#.', K: '#.#,#.#,##.,#.#,#.#', L: '#..,#..,#..,#..,###',
    M: '#.#,###,###,#.#,#.#', N: '##.,#.#,#.#,#.#,#.#', O: '.#.,#.#,#.#,#.#,.#.', P: '##.,#.#,##.,#..,#..',
    Q: '.#.,#.#,#.#,##.,.##', R: '##.,#.#,##.,#.#,#.#', S: '.##,#..,.#.,..#,##.', T: '###,.#.,.#.,.#.,.#.',
    U: '#.#,#.#,#.#,#.#,###', V: '#.#,#.#,#.#,#.#,.#.', W: '#.#,#.#,###,###,#.#', X: '#.#,#.#,.#.,#.#,#.#',
    Y: '#.#,#.#,.#.,.#.,.#.', Z: '###,..#,.#.,#..,###',
    ' ': '...,...,...,...,...', '.': '...,...,...,...,.#.', '-': '...,...,###,...,...', ':': '...,.#.,...,.#.,...',
    '?': '##.,..#,.#.,...,.#.', '!': '.#.,.#.,.#.,...,.#.', '/': '..#,..#,.#.,#..,#..', '+': '...,.#.,###,.#.,...',
    '=': '...,###,...,###,...', '>': '#..,.#.,..#,.#.,#..', '<': '..#,.#.,#..,.#.,..#',
  };
  const GLYPHS = {};
  for (const [ch, rows] of Object.entries(FONT)) GLYPHS[ch] = rows.split(',');

  function textWidth(text) {
    return Math.max(0, String(text).length * 4 - 1);
  }

  function drawText(ctx, text, x, y, color, scale) {
    const s = scale || 1;
    ctx.fillStyle = PAL[color] || color;
    let cx = x;
    for (const raw of String(text).toUpperCase()) {
      const g = GLYPHS[raw] || GLYPHS['?'];
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) if (g[row][col] === '#') ctx.fillRect(cx + col * s, y + row * s, s, s);
      }
      cx += 4 * s;
    }
  }

  // ------------------------------------------------------------ 문자열 스프라이트
  function checkRows(name, rows, w, h) {
    if (rows.length !== h || rows.some((r) => r.length !== w)) throw new Error(`sprite ${name}: ${w}x${h} 가 아닙니다`);
  }

  function drawRows(ctx, rows, x, y, map) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        ctx.fillStyle = (map && map[ch]) || PAL[ch];
        ctx.fillRect(x + i, y + j, 1, 1);
      }
    }
  }

  // UI 아이콘: '#' 한 색(어두운 잉크)
  const ICONS = {
    play: ['.#......', '.##.....', '.###....', '.####...', '.###....', '.##.....', '.#......', '........'],
    pause: ['.##.##..', '.##.##..', '.##.##..', '.##.##..', '.##.##..', '.##.##..', '.##.##..', '........'],
    step: ['#....#..', '##...#..', '###..#..', '####.#..', '###..#..', '##...#..', '#....#..', '........'],
    back: ['.#....#.', '.#...##.', '.#..###.', '.#.####.', '.#..###.', '.#...##.', '.#....#.', '........'],
    end: ['#...#..#', '##..##.#', '###.####', '########', '###.####', '##..##.#', '#...#..#', '........'],
    reset: ['.####...', '#....#.#', '#.....##', '#....###', '#.......', '.#....#.', '..####..', '........'],
    soundOn: ['...#..#.', '..##...#', '####.#.#', '####.#.#', '..##...#', '...#..#.', '........', '........'],
    soundOff: ['...#....', '..##....', '####.#.#', '####..#.', '..##.#.#', '...#....', '........', '........'],
    hint: ['..###...', '.#...#..', '.#...#..', '.#...#..', '..#.#...', '..###...', '..###...', '........'],
    book: ['.##.##..', '#..#..#.', '#..#..#.', '#..#..#.', '#..#..#.', '.##.##..', '...#....', '........'],
    card: ['######..', '#....#..', '#.##.#..', '#....#..', '#.##.#..', '#....#..', '######..', '........'],
    map: ['...#....', '...##...', '...###..', '...#....', '.#####..', '#######.', '.#####..', '........'],
    record: ['#######.', '#.....#.', '#.###.#.', '#.....#.', '#.###.#.', '#.....#.', '#######.', '........'],
    motion: ['........', '.##..##.', '#..##..#', '........', '.##..##.', '#..##..#', '........', '........'],
    check: ['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........', '........'],
    cross: ['#.....#.', '.#...#..', '..#.#...', '...#....', '..#.#...', '.#...#..', '#.....#.', '........'],
    lock: ['..###...', '.#...#..', '.#...#..', '#######.', '###.###.', '###.###.', '#######.', '........'],
    star: ['...#....', '...#....', '#######.', '.#####..', '..###...', '.##.##..', '.#...#..', '........'],
    edit: ['.....##.', '....#..#', '...#..#.', '..#..#..', '.#..#...', '#..#....', '##......', '........'],
    arrow: ['........', '....#...', '....##..', '#######.', '....##..', '....#...', '........', '........'],
    close: ['##...##.', '.##.##..', '..###...', '..###...', '.##.##..', '##...##.', '........', '........'],
    dot: ['........', '..###...', '.#####..', '.#####..', '.#####..', '..###...', '........', '........'],
    half: ['........', '..###...', '.#..##..', '.#..##..', '.#..##..', '..###...', '........', '........'],
    ring: ['........', '..###...', '.#...#..', '.#...#..', '.#...#..', '..###...', '........', '........'],
  };

  // 아이템(색상 스프라이트 8x8)
  const ITEMS = {
    key: ['..yyy...', '.y...y..', '.y...y..', '..yyy...', '...y....', '...yy...', '...y....', '...yy...'],
    signal: ['.c...c..', 'c.c.c.c.', '.c.l.c..', '...l....', '...l....', '..lll...', '.ggggg..', '........'],
    gear: ['..l.l...', '.lllll..', 'lldddll.', '.ld.dl..', 'lldddll.', '.lllll..', '..l.l...', '........'],
    cell: ['...gg...', '..kkkk..', '..kGGk..', '..kGGk..', '..keek..', '..keek..', '..kkkk..', '........'],
    file: ['.kkkkk..', '.kwwwkk.', '.kwwwwk.', '.kgggwk.', '.kwwwwk.', '.kgggwk.', '.kwwwwk.', '.kkkkkk.'],
    scroll: ['.kkkkkk.', '.kwwwwk.', '.kcccwk.', '.kwwwwk.', '.kcccwk.', '.kwwwwk.', '.kkkkkk.', '........'],
    chip: ['..l.l.l.', '.kkkkkkk', 'lkBBBBBk', '.kBsBBBk', 'lkBBBBBk', '.kkkkkkk', '..l.l.l.', '........'],
    book: ['.kkkkk..', '.krrrrk.', '.krwwrk.', '.krrrrk.', '.krrrrk.', '.kwwwwk.', '.kkkkkk.', '........'],
    cart: ['.kkkkkk.', '.kBBBBk.', '.kwwwwk.', '.kwyywk.', '.kwwwwk.', '.kBBBBk.', '..kkkk..', '........'],
    house: ['...rr...', '..rrrr..', '.rrrrrr.', 'rrrrrrrr', '.llllll.', '.lyllyl.', '.llkkll.', '.llkkll.'],
  };
  for (const [n, rows] of Object.entries(ICONS)) checkRows(n, rows, 8, 8);
  for (const [n, rows] of Object.entries(ITEMS)) checkRows(n, rows, 8, 8);

  // ------------------------------------------------------------ 이미지(data URL) 캐시: UI 에 같은 스프라이트를 쓴다
  const urlCache = new Map();
  function toURL(key, w, h, scale, draw) {
    const id = `${key}@${scale}`;
    if (urlCache.has(id)) return urlCache.get(id);
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.scale(scale, scale);
    draw(ctx);
    const url = c.toDataURL('image/png');
    urlCache.set(id, url);
    return url;
  }

  function iconURL(name, scale, color) {
    const ink = color || 'k';
    return toURL(`icon:${name}:${ink}`, 8, 8, scale || 2, (ctx) => drawRows(ctx, ICONS[name], 0, 0, { '#': PAL[ink] }));
  }
  function itemURL(name, scale, mono) {
    return toURL(`item:${name}:${mono || ''}`, 8, 8, scale || 3, (ctx) => {
      if (!mono) { drawRows(ctx, ITEMS[name], 0, 0); return; }
      const map = {};
      for (const ch of Object.keys(PAL)) map[ch] = PAL[mono];
      drawRows(ctx, ITEMS[name], 0, 0, map);
    });
  }
  function textURL(text, scale, color) {
    const w = textWidth(text);
    return toURL(`text:${text}:${color}`, Math.max(1, w), 5, scale || 2, (ctx) => drawText(ctx, text, 0, 0, color || 'k'));
  }

  // ------------------------------------------------------------ 스프라이트(파라미터로 그리는 것)
  function P(ctx, x, y, w, h, c) {
    ctx.fillStyle = PAL[c] || c;
    ctx.fillRect(x, y, w, h);
  }

  /* 로봇 16x16. o: { body, eyes, arms, legs, chest, bulb, dy } */
  function robot(ctx, x, y, o) {
    const dy = o.dy || 0;
    const X = (dx) => x + dx;
    const Y = (d) => y + d + dy;
    const body = o.body || 'c';
    // 그림자는 점프해도 바닥에 남는다
    P(ctx, x + 3, y + 15, 10, 1, 'd');
    // 안테나
    P(ctx, X(7), Y(0), 2, 1, o.bulb || 'y');
    P(ctx, X(7), Y(1), 2, 1, 'k');
    // 머리
    P(ctx, X(2), Y(2), 12, 7, 'k');
    P(ctx, X(3), Y(3), 10, 5, 'l');
    P(ctx, X(3), Y(3), 10, 1, 'w');
    P(ctx, X(4), Y(4), 8, 3, 'd');
    const eye = (px, py, c) => P(ctx, X(px), Y(py), 1, 1, c);
    switch (o.eyes) {
      case 'happy':
        for (const ox of [0, 4]) { eye(5 + ox, 5, 's'); eye(6 + ox, 4, 's'); eye(7 + ox, 5, 's'); }
        break;
      case 'x':
        for (const ox of [0, 4]) { eye(5 + ox, 4, 'r'); eye(7 + ox, 4, 'r'); eye(6 + ox, 5, 'r'); eye(5 + ox, 6, 'r'); eye(7 + ox, 6, 'r'); }
        break;
      case 'blink':
        P(ctx, X(5), Y(5), 2, 1, 't'); P(ctx, X(9), Y(5), 2, 1, 't');
        break;
      case 'sad':
        P(ctx, X(5), Y(6), 2, 1, 's'); P(ctx, X(9), Y(6), 2, 1, 's'); eye(5, 5, 'c'); eye(10, 5, 'c');
        break;
      default:
        P(ctx, X(5), Y(5), 2, 1, 's'); P(ctx, X(9), Y(5), 2, 1, 's');
    }
    // 목·몸통
    P(ctx, X(6), Y(9), 4, 1, 'k');
    P(ctx, X(4), Y(10), 8, 4, 'k');
    P(ctx, X(5), Y(11), 6, 2, body);
    P(ctx, X(7), Y(11), 2, 1, o.chest || 'e');
    // 팔
    const armDown = (side) => { const ax = side < 0 ? 2 : 12; P(ctx, X(ax), Y(10), 2, 3, 'g'); P(ctx, X(ax), Y(13), 2, 1, 'k'); };
    const armUp = (side) => { const ax = side < 0 ? 0 : 14; P(ctx, X(ax), Y(6), 2, 5, 'g'); P(ctx, X(ax), Y(5), 2, 1, 'k'); };
    const arms = o.arms || 'down';
    if (arms === 'up') { armUp(-1); armUp(1); } else if (arms === 'workL') { armUp(-1); armDown(1); } else if (arms === 'workR') { armDown(-1); armUp(1); } else { armDown(-1); armDown(1); }
    // 다리
    const legs = o.legs || 'stand';
    if (legs === 'walkA') { P(ctx, X(4), Y(14), 2, 1, 'd'); P(ctx, X(10), Y(14), 2, 1, 'd'); P(ctx, X(5), Y(14), 2, 1, 'k'); }
    else if (legs === 'walkB') { P(ctx, X(6), Y(14), 2, 1, 'd'); P(ctx, X(8), Y(14), 2, 1, 'd'); P(ctx, X(10), Y(14), 1, 1, 'k'); }
    else { P(ctx, X(5), Y(14), 2, 1, 'd'); P(ctx, X(9), Y(14), 2, 1, 'd'); }
  }

  /* 로봇 상태 → 프레임. state: idle|walk|work|charge|success|fail|sad, t: ms */
  function robotFrame(state, t, reduce) {
    const f = reduce ? 0 : Math.floor(t / 220) % 2;
    switch (state) {
      case 'walk': return { legs: f ? 'walkA' : 'walkB', dy: reduce ? 0 : -f, arms: 'down' };
      case 'work': return { arms: f ? 'workL' : 'workR', eyes: 'open', chest: 'y' };
      case 'charge': return { arms: 'down', bulb: f ? 'G' : 'y', chest: f ? 'y' : 'G', eyes: 'open' };
      case 'success': return { arms: 'up', eyes: 'happy', dy: reduce ? 0 : (f ? -2 : 0), bulb: 'G', chest: 'G' };
      case 'fail': return { eyes: 'x', chest: 'r', bulb: 'r' };
      case 'sad': return { eyes: 'sad', chest: 'o' };
      case 'happy': return { eyes: 'happy', chest: 'G', bulb: 'G' };
      default: return { eyes: !reduce && Math.floor(t / 1600) % 4 === 3 && t % 1600 < 160 ? 'blink' : 'open', dy: reduce ? 0 : (Math.floor(t / 600) % 2 ? 0 : -1) };
    }
  }

  /* 배터리. level: 0..1 (1 초과는 넘침), undefined 는 '값 없음' */
  function battery(ctx, x, y, w, h, level, opts) {
    const o = opts || {};
    P(ctx, x + Math.floor(w / 2) - 2, y - 1, 4, 1, 'k');
    P(ctx, x, y, w, h, 'k');
    P(ctx, x + 1, y + 1, w - 2, h - 2, 'd');
    if (level === undefined || level === null) {
      drawText(ctx, '?', x + Math.floor((w - 3) / 2), y + Math.floor((h - 5) / 2), o.blink ? 'y' : 'l');
      return;
    }
    const inner = h - 2;
    const lv = Math.max(0, Math.min(1, level));
    const fill = Math.round(inner * lv);
    const color = level > 1.0001 ? 'o' : lv < 0.25 ? 'r' : lv < 0.5 ? 'y' : 'G';
    const shade = { o: 'r', r: 'v', y: 'o', G: 'e' }[color];
    const top = y + 1 + inner - fill;
    P(ctx, x + 1, top, w - 2, fill, color);
    // 칸 구분선: 채워진 칸은 같은 색의 어두운 단계, 빈 칸은 바탕보다 조금 밝게
    for (let k = y + 1 + inner - 4; k > y + 1; k -= 4) P(ctx, x + 1, k, w - 2, 1, k >= top ? shade : 'g');
    if (fill > 0) P(ctx, x + 1, top, 1, fill, 'w');
  }

  /* 기지 건물 32x24. state: broken|working|restored */
  function building(ctx, x, y, state, t, reduce) {
    const lit = state !== 'broken';
    // 지붕(계단형)
    for (let i = 0; i < 5; i++) P(ctx, x + 6 - i, y + i * 2, 20 + i * 2, 2, i === 0 ? 'k' : 'r');
    P(ctx, x, y + 10, 32, 1, 'k');
    // 굴뚝
    P(ctx, x + 22, y - 2, 4, 6, 'k'); P(ctx, x + 23, y - 1, 2, 5, 'g');
    // 벽
    P(ctx, x + 1, y + 11, 30, 12, 'k');
    P(ctx, x + 2, y + 11, 28, 12, 'l');
    P(ctx, x + 2, y + 11, 28, 1, 'w');
    // 창문
    for (const wx of [4, 10, 21, 26]) {
      P(ctx, x + wx - 1, y + 13, 5, 5, 'k');
      P(ctx, x + wx, y + 14, 3, 3, lit ? 'y' : 'b');
      if (lit) P(ctx, x + wx, y + 14, 1, 1, 'w');
    }
    // 문
    P(ctx, x + 14, y + 14, 5, 9, 'k');
    if (state === 'restored') { P(ctx, x + 15, y + 15, 3, 8, 'd'); P(ctx, x + 15, y + 15, 1, 8, 'o'); }
    else P(ctx, x + 15, y + 15, 3, 8, 'o');
    if (state === 'broken') {
      // 금 간 벽과 연기
      P(ctx, x + 7, y + 18, 1, 2, 'g'); P(ctx, x + 8, y + 20, 1, 2, 'g'); P(ctx, x + 25, y + 19, 2, 1, 'g');
      const k = reduce ? 0 : (t / 90) % 12;
      for (let i = 0; i < 3; i++) {
        const sy = y - 4 - ((k + i * 4) % 12);
        P(ctx, x + 23 + ((i + Math.floor(k / 4)) % 2), sy, 2, 2, i === 2 ? 'l' : 'g');
      }
    }
    if (state === 'restored') {
      const wave = reduce ? 0 : Math.floor(t / 300) % 2;
      P(ctx, x + 6, y - 7, 1, 7, 'k');
      P(ctx, x + 7, y - 7, 5, 3, 'y');
      P(ctx, x + 7, y - 5, 5, 1, 'o');
      P(ctx, x + 7 + 4, y - 7 + wave, 1, 2, 'o');
    }
  }

  /* 발전기 24x20 */
  function generator(ctx, x, y, on, t, reduce) {
    P(ctx, x, y + 2, 24, 18, 'k');
    P(ctx, x + 1, y + 3, 22, 16, 'g');
    P(ctx, x + 1, y + 3, 22, 1, 'l');
    for (let i = 0; i < 4; i++) P(ctx, x + 3, y + 7 + i * 3, 6, 1, 'd');
    P(ctx, x + 12, y + 5, 9, 11, 'k');
    const flick = on && (reduce || Math.floor(t / 140) % 3 !== 0);
    const bolt = flick ? 'y' : 'd';
    const pts = [[17, 6], [16, 7], [15, 8], [14, 9], [15, 9], [16, 9], [17, 10], [16, 11], [15, 12], [14, 13]];
    for (const [bx, by] of pts) P(ctx, x + bx, y + by, 2, 1, bolt);
    P(ctx, x + 3, y + 4, 2, 2, on ? 'G' : 'r');
    P(ctx, x + 4, y, 3, 2, 'k'); P(ctx, x + 17, y, 3, 2, 'k');
  }

  /* 기계(배분 장치·빌드 기계) 16x16. state: broken|working|restored|off */
  function machine(ctx, x, y, state, t, reduce, panel) {
    P(ctx, x, y + 2, 16, 14, 'k');
    P(ctx, x + 1, y + 3, 14, 12, panel || 'B');
    P(ctx, x + 1, y + 3, 14, 1, 'c');
    P(ctx, x + 3, y + 5, 10, 5, 'k');
    const on = state === 'working' || state === 'restored';
    P(ctx, x + 4, y + 6, 8, 3, on ? 't' : 'd');
    if (on) P(ctx, x + 4 + (reduce ? 3 : Math.floor(t / 120) % 8), y + 7, 1, 1, 's');
    P(ctx, x + 3, y + 12, 2, 2, state === 'broken' ? 'r' : state === 'off' ? 'd' : 'G');
    P(ctx, x + 7, y + 12, 6, 2, 'd');
    P(ctx, x + 6, y, 4, 2, 'k');
    if (state === 'broken' && !reduce && Math.floor(t / 180) % 4 === 0) {
      P(ctx, x + 13, y + 1, 1, 1, 'y'); P(ctx, x + 14, y, 1, 1, 'w'); P(ctx, x + 12, y, 1, 1, 'o');
    }
  }

  /* 모니터(출력 화면) */
  function monitor(ctx, x, y, w, h, on, alert) {
    P(ctx, x, y, w, h, 'k');
    P(ctx, x + 1, y + 1, w - 2, h - 2, 'd');
    P(ctx, x + 2, y + 2, w - 4, h - 5, on ? 'b' : 'k');
    P(ctx, x + w - 4, y + h - 2, 2, 1, alert ? 'r' : on ? 'G' : 'g');
    P(ctx, x + Math.floor(w / 2) - 2, y + h, 4, 2, 'k');
  }

  /* 입력 단말(키보드) 16x8 */
  function keyboard(ctx, x, y, active, t, reduce) {
    P(ctx, x, y, 16, 8, 'k');
    P(ctx, x + 1, y + 1, 14, 6, 'g');
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
      const pressed = active && !reduce && Math.floor(t / 110) % 6 === i && r === 0;
      P(ctx, x + 2 + i * 2, y + 2 + r * 2, 1, 1, pressed ? 'y' : 'l');
    }
  }

  /* 안테나 탑 */
  function mast(ctx, x, y, h, waves, t, reduce) {
    P(ctx, x + 3, y, 2, h, 'k');
    for (let i = 4; i < h; i += 4) { P(ctx, x + 1, y + i, 6, 1, 'g'); P(ctx, x + (i % 8 ? 1 : 5), y + i - 2, 2, 2, 'g'); }
    P(ctx, x, y + h, 8, 2, 'k');
    P(ctx, x + 2, y - 2, 4, 2, waves ? 'G' : 'r');
    if (waves) {
      const k = reduce ? 2 : Math.floor(t / 160) % 3;
      for (let i = 0; i <= k; i++) {
        const r = 4 + i * 3;
        P(ctx, x + 4 + r, y - 3 - i, 1, 3 + i * 2, 's');
        P(ctx, x + 3 - r, y - 3 - i, 1, 3 + i * 2, 's');
      }
    }
  }

  /* 반짝임(복구 효과) */
  function sparkle(ctx, x, y, f) {
    const c = f % 2 ? 'w' : 'y';
    P(ctx, x, y - 2, 1, 5, c); P(ctx, x - 2, y, 5, 1, c);
  }

  /* 강조 괄호. kind: change|read|output|error */
  function brackets(ctx, x, y, w, h, kind, t, reduce) {
    const c = { change: 'y', read: 's', output: 'w', error: 'r' }[kind];
    const pad = kind === 'change' && !reduce ? 2 + (Math.floor(t / 200) % 2) : 2;
    const L = 3;
    const x0 = x - pad;
    const y0 = y - pad;
    const x1 = x + w + pad - 1;
    const y1 = y + h + pad - 1;
    const seg = (ax, ay, bw, bh) => P(ctx, ax, ay, bw, bh, c);
    if (kind === 'read') {
      // 점선 사각형: 읽기만 함
      for (let i = x0; i <= x1; i += 2) { seg(i, y0, 1, 1); seg(i, y1, 1, 1); }
      for (let j = y0; j <= y1; j += 2) { seg(x0, j, 1, 1); seg(x1, j, 1, 1); }
      return;
    }
    seg(x0, y0, L, 1); seg(x0, y0, 1, L);
    seg(x1 - L + 1, y0, L, 1); seg(x1, y0, 1, L);
    seg(x0, y1, L, 1); seg(x0, y1 - L + 1, 1, L);
    seg(x1 - L + 1, y1, L, 1); seg(x1, y1 - L + 1, 1, L);
  }

  /* 케이블(점선이 흐르는 전선). pts: [[x,y],...] 직교 경로 */
  function cable(ctx, pts, active, t, reduce, color) {
    const flow = active && !reduce ? Math.floor(t / 70) % 4 : 0;
    let k = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= n; s++) {
        const px = ax + Math.sign(bx - ax) * s;
        const py = ay + Math.sign(by - ay) * s;
        const on = active && (k + 4 - flow) % 4 < 2;
        P(ctx, px, py, 1, 1, on ? (color || 'y') : 'k');
        k++;
      }
    }
  }

  // ------------------------------------------------------------ 타일 배경
  function hash(i, j) {
    let h = (i * 374761393 + j * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /* 섬 배경: 바깥 1칸 물, 다음 1칸 모래, 안쪽 풀밭. paths: [[col,row],...] 돌길 칸 */
  function island(ctx, cols, rows, opts, frame) {
    const o = opts || {};
    const pathSet = new Set((o.paths || []).map(([c, r]) => `${c},${r}`));
    const floorSet = new Set((o.floors || []).map(([c, r]) => `${c},${r}`));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * 8;
      const y = r * 8;
      const edge = Math.min(c, r, cols - 1 - c, rows - 1 - r);
      const corner = (c === 1 || c === cols - 2) && (r === 1 || r === rows - 2);
      if (edge === 0 || corner) {
        P(ctx, x, y, 8, 8, 'B');
        const n = hash(c, r);
        const off = (frame + Math.floor(n * 4)) % 4;
        P(ctx, x + off * 2, y + 2 + (n > 0.5 ? 3 : 0), 3, 1, 'c');
        if (n > 0.7) P(ctx, x + ((off + 2) % 4) * 2, y + 6, 2, 1, 's');
      } else if (edge === 1) {
        P(ctx, x, y, 8, 8, 'y');
        const n = hash(c + 7, r);
        P(ctx, x + Math.floor(n * 7), y + Math.floor(hash(c, r + 3) * 7), 1, 1, 'o');
        if (n > 0.6) P(ctx, x + 2, y + 5, 1, 1, 'w');
      } else if (floorSet.has(`${c},${r}`)) {
        P(ctx, x, y, 8, 8, 'g');
        P(ctx, x, y, 8, 1, 'l');
        P(ctx, x, y, 1, 8, 'l');
        P(ctx, x + 6, y + 6, 1, 1, 'd');
      } else if (pathSet.has(`${c},${r}`)) {
        P(ctx, x, y, 8, 8, 'l');
        P(ctx, x + 1, y + 1, 3, 2, 'w');
        P(ctx, x + 4, y + 4, 3, 3, 'g');
        P(ctx, x, y + 7, 8, 1, 'g');
      } else {
        P(ctx, x, y, 8, 8, 'e');
        const n = hash(c, r);
        if (n > 0.55) { P(ctx, x + 1 + Math.floor(n * 4), y + 3, 1, 2, 'G'); P(ctx, x + 2 + Math.floor(n * 4), y + 2, 1, 1, 'G'); }
        if (n < 0.15) P(ctx, x + 5, y + 5, 1, 1, 't');
        if (n > 0.92) { P(ctx, x + 3, y + 5, 1, 1, 'w'); P(ctx, x + 4, y + 4, 1, 1, 'y'); }
      }
    }
  }

  global.Pixel = {
    PAL, drawText, textWidth, drawRows, ICONS, ITEMS, iconURL, itemURL, textURL, P,
    robot, robotFrame, battery, building, generator, machine, monitor, keyboard, mast, sparkle, brackets, cable, island,
  };
})(this);
