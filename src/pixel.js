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
    lever: ['...kk...', '...yk...', '...yk...', '..kk....', '..lk....', '.llll...', '.kkkkk..', '........'],
    door: ['.kkkkkk.', '.kllllk.', '.klkklk.', '.klkklk.', '.klkylk.', '.klkklk.', '.klkklk.', '.kkkkkk.'],
    loop: ['..cccc..', '.c....c.', 'c......c', 'c....ccc', 'ccc....c', 'c......c', '.c....c.', '..cccc..'],
    rail: ['.l....l.', '.llllll.', '.l....l.', '.llllll.', '.l....l.', '.llllll.', '.l....l.', '........'],
    wrench: ['.l...ll.', '.ll.ll..', '..lll...', '...l....', '..l.....', '.l......', '.ll.....', '........'],
    toolbox: ['..kkkk..', '..k..k..', '.kkkkkk.', '.krrrrk.', '.kryyrk.', '.krrrrk.', '.kkkkkk.', '........'],
    link: ['.ccc....', 'c...c...', 'c..c.cc.', '.cc.c..c', '...c...c', '....ccc.', '........', '........'],
    crate: ['kkkkkkkk', 'kooooook', 'kollllok', 'koloolok', 'koloolok', 'kollllok', 'kooooook', 'kkkkkkkk'],
    map: ['.ll.ww..', 'l..lw.l.', 'l.clw.l.', 'l..lw.l.', 'l..lw.l.', 'l..lw.l.', '.ll.ww..', '........'],
    letters: ['.wwwwww.', '.wBwwBw.', '.wBBBBw.', '.wBwwBw.', '.wBwwBw.', '.wwwwww.', '........', '........'],
    plug: ['..l..l..', '..l..l..', '.kkkkkk.', '.kcccck.', '..kcck..', '...kk...', '...ll...', '........'],
    arrow: ['........', '....y...', '....yy..', 'yyyyyyy.', '....yy..', '....y...', '........', '........'],
    chassis: ['.kkkkkk.', '.kllllk.', '.klkklk.', '.kllllk.', '.kcccck.', '.kcccck.', '..kkkk..', '........'],
    blueprint: ['.BBBBBB.', '.BwwwwB.', '.BwBBwB.', '.BwBBwB.', '.BwwwwB.', '.BBBBBB.', '........', '........'],
    badge: ['..yyyy..', '.ywwwwy.', '.ywywwy.', '.ywwwwy.', '..yyyy..', '..r..r..', '..r..r..', '........'],
    shield: ['.BBBBBB.', '.BssssB.', '.BsGGsB.', '.BsGGsB.', '..BssB..', '...BB...', '........', '........'],
    recycle: ['..ee....', '.e..e...', 'e....ee.', 'ee....e.', '.ee....e', '...e..e.', '....ee..', '........'],
    timer: ['...kk...', '..llll..', '.lwwwwl.', '.lwkwwl.', '.lwkwwl.', '.lwwkwl.', '..llll..', '........'],
    mold: ['.kkkkkk.', '.kllllk.', '.klkklk.', '.klkklk.', '.kllllk.', '.kkkkkk.', '........', '........'],
    funnel: ['.kkkkkk.', '.kllllk.', '..kllk..', '...kk...', '...kk...', '...kk...', '........', '........'],
    plus: ['...GG...', '...GG...', '.GGGGGG.', '.GGGGGG.', '...GG...', '...GG...', '........', '........'],
    disk: ['.kkkkkk.', '.kllkkk.', '.kllkkk.', '.kBBBBk.', '.kwwwwk.', '.kwwwwk.', '.kkkkkk.', '........'],
    flag: ['.kkkk...', '.krrrk..', '.krrrk..', '.kkkk...', '.k......', '.k......', '.k......', '........'],
    alarm: ['...kk...', '..krrk..', '.krrrrk.', '.krrrrk.', '.kkkkkk.', '.kyyyyk.', '.kkkkkk.', '........'],
    crown: ['y......y', 'yy.y..yy', 'yyyyyyyy', '.yyyyyy.', '.yyyyyy.', '.oooooo.', '........', '........'],
    doorOpen: ['.kkkkkk.', '.klkk.k.', '.klkk.k.', '.klkk.k.', '.klkk.k.', '.klkk.k.', '.klkk.k.', '.kkkkkk.'],
    conveyorBelt: ['kkkkkkkk', 'kllllllk', 'kdkddkdk', 'kllllllk', 'kkkkkkkk', '........', '........', '........'],
    cabinet: ['.kkkkkk.', '.kllllk.', '.klkklk.', '.kllllk.', '.klkklk.', '.kllllk.', '.kkkkkk.', '........'],
    siren: ['...kk...', '..krrk..', '.krrrrk.', '.krrrrk.', '.kkkkkk.', '.kyyyyk.', '.kkkkkk.', '........'],
    setBin: ['k......k', 'k......k', 'k......k', '.k....k.', '.k....k.', '..kkkk..', '........', '........'],
    heapTile: ['kkkkkkkk', 'kBBBBBBk', 'kBccccBk', 'kBccccBk', 'kBccccBk', 'kBBBBBBk', 'kkkkkkkk', '........'],
    frameBox: ['kkkkkkkk', 'kllllllk', 'kl....lk', 'kl....lk', 'kl....lk', 'kllllllk', 'kkkkkkkk', '........'],
    arrowHead: ['........', '....s...', '.....s..', 'sssssss.', '.....s..', '....s...', '........', '........'],
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
  function cable(ctx, pts, active, t, reduce, color, idle) {
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
        P(ctx, px, py, 1, 1, on ? (color || 'y') : (idle || 'k'));
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

  // ============================================================ 2~10장 일반 장면용: 구역 바닥과 스프라이트
  // 모든 그림은 위 팔레트 16색만 쓴다. 좌표는 호출하는 쪽이 정수로 넘긴다.
  const C01 = (v) => Math.max(0, Math.min(1, v));

  // 주제별 바닥 타일(8x8). x,y 는 타일 왼쪽 위, c,r 는 타일 번호, n 은 0..1 해시
  const FLOORS = {
    // 교통 정비 마당: 석재 포장(엇갈려 쌓은 이음매)
    flow(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'l');
      P(x, y + 7, 8, 1, 'g');
      if ((c + (r & 1)) % 2 === 0) P(x, y, 1, 7, 'g');
      if (n > 0.78) P(x + 2 + Math.floor(n * 9) % 4, y + 2, 2, 1, 'w');
      if (n < 0.1) P(x + 4, y + 4, 1, 2, 'g');
    },
    // 작업장: 어두운 마룻바닥
    functions(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'v');
      P(x, y + 7, 8, 1, 'k');
      const off = (r * 11) % 32;
      for (let i = 0; i < 8; i++) if ((x + i + off) % 32 === 0) P(x + i, y, 1, 7, 'k');
      if (n > 0.55) P(x + 1 + Math.floor(n * 7) % 4, y + 2 + Math.floor(n * 13) % 3, 3, 1, 'd');
      if (n < 0.08) P(x + 3, y + 4, 2, 1, 'd');
    },
    // 창고: 콘크리트 슬래브와 안전선
    arrays(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'g');
      if (r % 2) P(x, y + 7, 8, 1, 'd');
      if (c % 2) P(x + 7, y, 1, 8, 'd');
      if (n > 0.85) P(x + 3, y + 3, 2, 1, 'd');
      if (c % 2 === 0 && r % 2 === 0) P(x, y, 1, 1, 'y');
    },
    // 배선실: 어두운 회로 기판
    pointers(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'b');
      if (n > 0.45) { P(x, y + 3 + Math.floor(n * 3), 5, 1, 'B'); P(x + 5, y + 3 + Math.floor(n * 3), 1, 3, 'B'); }
      if (n < 0.3) { P(x + 2, y, 1, 3 + Math.floor(n * 10), 'B'); }
      if ((c + r) % 4 === 0) P(x + 4, y + 4, 1, 1, 'c');
    },
    // 조립 구역: 강판 바닥
    classes(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'd');
      if (r % 2) P(x, y + 7, 8, 1, 'k');
      if (c % 2) P(x + 7, y, 1, 8, 'k');
      if (r % 2 === 0 && c % 2 === 0) { P(x + 1, y + 1, 1, 1, 'g'); P(x + 14 - 8, y + 6, 1, 1, 'g'); }
      if (n > 0.8) P(x + 3, y + 4, 2, 1, 'g');
    },
    // 훈련장: 잔디
    oop(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'e');
      if (n > 0.5) { P(x + 1 + Math.floor(n * 4), y + 3, 1, 2, 'G'); P(x + 2 + Math.floor(n * 4), y + 2, 1, 1, 'G'); }
      if (n < 0.14) P(x + 5, y + 5, 1, 1, 't');
    },
    // 보관소: 청록 슬래브
    memory(P, x, y, c, r, n) {
      P(x, y, 8, 8, 't');
      P(x, y + 7, 8, 1, 'd');
      P(x + 7, y, 1, 8, 'd');
      if (n > 0.8) P(x + 3, y + 3, 2, 1, 'e');
    },
    // 설계실: 청사진 격자
    templates(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'b');
      P(x, y, 8, 1, 'B'); P(x, y, 1, 8, 'B');
      if ((c + r) % 2 === 0) P(x, y, 1, 1, 'c');
      if (n > 0.9) P(x + 4, y + 4, 1, 1, 'B');
    },
    // 관제실: 어두운 타일과 표시등
    control(P, x, y, c, r, n) {
      P(x, y, 8, 8, 'd');
      P(x, y + 7, 8, 1, 'b'); P(x + 7, y, 1, 8, 'b');
      if ((c * 3 + r * 5) % 7 === 0) P(x + 3, y + 3, 2, 1, n > 0.5 ? 'e' : 's');
    },
  };

  /* 구역 배경: 바깥 물, 모래 테두리(각 4px, 모서리는 둥글게), 안쪽은 주제별 바닥 */
  function zone(ctx, theme, frame) {
    const floor = FLOORS[theme] || FLOORS.flow;
    const paint = (x, y, w, h, col) => P(ctx, x, y, w, h, col);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 20; c++) floor(paint, c * 8, r * 8, c, r, hash(c, r));
    if (theme === 'classes') {
      for (let i = 8; i < 152; i += 8) { P(ctx, i, 9, 4, 1, 'y'); P(ctx, i, 86, 4, 1, 'y'); }
      for (let j = 8; j < 88; j += 8) { P(ctx, 9, j, 1, 4, 'y'); P(ctx, 150, j, 1, 4, 'y'); }
    }
    const kind = (bx, by) => {
      if (bx < 0 || by < 0 || bx > 39 || by > 23) return 'w';
      const dx = Math.min(bx, 39 - bx), dy = Math.min(by, 23 - by), e = Math.min(dx, dy), d = dx + dy;
      if (e === 0 || d <= 2) return 'w';
      return e === 1 || d <= 4 ? 's' : 'i';
    };
    for (let by = 0; by < 24; by++) for (let bx = 0; bx < 40; bx++) {
      const k = kind(bx, by);
      if (k === 'i') continue;
      const x = bx * 4, y = by * 4, n = hash(bx, by);
      if (k === 'w') {
        P(ctx, x, y, 4, 4, 'B');
        const off = (frame + Math.floor(n * 4)) % 4;
        P(ctx, x + (off % 3), y + 1 + (n > 0.5 ? 2 : 0), 2, 1, 'c');
        if (n > 0.75) P(ctx, x + ((off + 2) % 3), y + 3, 1, 1, 's');
        for (const [ox, oy, sx, sy, w, h] of [[0, -1, 0, 3, 4, 1], [0, 1, 0, 0, 4, 1], [-1, 0, 3, 0, 1, 4], [1, 0, 0, 0, 1, 4]]) {
          if (kind(bx + ox, by + oy) === 's' && hash(bx + oy * 3, by + ox * 5) > 0.35) P(ctx, x + sx, y + sy, w, h, 's');
        }
      } else {
        P(ctx, x, y, 4, 4, 'y');
        const a = hash(bx + 7, by), b = hash(bx, by + 3);
        if (a > 0.4) P(ctx, x + Math.floor(a * 4) % 4, y + Math.floor(b * 4) % 4, 1, 1, 'o');
        if (a > 0.9) P(ctx, x + 1, y + 2, 1, 1, 'w');
        if (kind(bx, by - 1) === 'i') P(ctx, x, y + 3, 4, 1, 'o');
        if (kind(bx, by + 1) === 'i') P(ctx, x, y, 4, 1, 'o');
        if (kind(bx - 1, by) === 'i') P(ctx, x + 3, y, 1, 4, 'o');
        if (kind(bx + 1, by) === 'i') P(ctx, x, y, 1, 4, 'o');
      }
    }
  }

  /* 바닥 장식(구역 위젯용): rails 레일 | shelves 선반줄 | tray 케이블 트레이 | bay 보관칸 | mat 훈련 매트 | pad 작업 패드 | lane 안전선 */
  function floorDeco(ctx, kind, x, y, w, h) {
    switch (kind) {
      case 'rails':
        for (let i = 0; i < w; i += 4) P(ctx, x + i, y + 1, 2, 7, 'v');
        P(ctx, x, y + 1, w, 1, 'l'); P(ctx, x, y + 2, w, 1, 'g');
        P(ctx, x, y + 6, w, 1, 'l'); P(ctx, x, y + 7, w, 1, 'g');
        break;
      case 'tray':
        P(ctx, x, y, w, h, 'k'); P(ctx, x + 1, y + 1, w - 2, h - 2, 'd');
        for (let i = 2; i < w - 2; i += 6) P(ctx, x + i, y + 1, 1, h - 2, 'g');
        break;
      case 'bay':
        for (const [bx, by, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
          P(ctx, sx > 0 ? bx : bx - 3, by, 4, 1, 'y'); P(ctx, bx, sy > 0 ? by : by - 3, 1, 4, 'y');
        }
        break;
      case 'mat':
        P(ctx, x, y, w, h, 'G'); P(ctx, x + 1, y + 1, w - 2, h - 2, 'e');
        P(ctx, x + 2, y + 2, w - 4, 1, 'w'); P(ctx, x + 2, y + h - 3, w - 4, 1, 'w');
        P(ctx, x + 2, y + 2, 1, h - 4, 'w'); P(ctx, x + w - 3, y + 2, 1, h - 4, 'w');
        P(ctx, x + Math.floor(w / 2), y + 2, 1, h - 4, 'w');
        break;
      case 'pad':
        P(ctx, x, y, w, h, 'k'); P(ctx, x + 1, y + 1, w - 2, h - 2, 'g'); P(ctx, x + 1, y + 1, w - 2, 1, 'l');
        break;
      case 'lane':
        for (let i = 0; i < w; i += 6) P(ctx, x + i, y, 4, 1, 'y');
        break;
      case 'shelves':
        for (let j = 0; j < h; j += 10) {
          P(ctx, x, y + j + 6, w, 2, 'k'); P(ctx, x, y + j + 6, w, 1, 'o');
          for (let i = 0; i <= w - 2; i += 24) P(ctx, x + i, y + j, 2, 8, 'k');
        }
        break;
    }
  }

  /* 문 16x22. open 0..1: 패널이 위로 올라간다. lamp: 문 위 표시등 색 */
  function door(ctx, x, y, open, lamp) {
    P(ctx, x, y, 16, 22, 'k');
    P(ctx, x + 1, y + 1, 14, 21, 'g');
    P(ctx, x + 1, y + 1, 14, 1, 'l');
    P(ctx, x + 2, y + 4, 12, 18, open > 0 ? 'b' : 'd');
    if (open > 0) {
      P(ctx, x + 2, y + 20, 12, 2, 'y');
      P(ctx, x + 4, y + 8, 8, 12, 'B'); P(ctx, x + 6, y + 10, 4, 10, 'c');
    }
    P(ctx, x + 5, y + 2, 6, 2, 'k'); P(ctx, x + 6, y + 2, 4, 1, lamp || (open > 0.5 ? 'G' : 'r'));
    const ph = Math.round(18 * (1 - C01(open)));
    if (ph > 0) {
      P(ctx, x + 2, y + 4, 12, ph, 'l');
      P(ctx, x + 2, y + 4, 12, 1, 'w');
      P(ctx, x + 5, y + 5, 1, Math.max(0, ph - 2), 'g'); P(ctx, x + 10, y + 5, 1, Math.max(0, ph - 2), 'g');
      if (ph >= 8) for (let i = 0; i < 12; i += 4) { P(ctx, x + 2 + i, y + 4 + ph - 4, 2, 3, 'y'); P(ctx, x + 4 + i, y + 4 + ph - 4, 2, 3, 'k'); }
      P(ctx, x + 2, y + 4 + ph - 1, 12, 1, 'k');
      if (ph >= 12) P(ctx, x + 11, y + 4 + Math.floor(ph / 2), 2, 2, 'y');
    }
  }

  /* 대문 32x20: 두 짝이 양옆으로 열린다 */
  function gate(ctx, x, y, open, lamp) {
    P(ctx, x, y, 32, 20, 'k');
    P(ctx, x + 1, y + 1, 30, 19, 'g');
    P(ctx, x + 1, y + 1, 30, 1, 'l');
    P(ctx, x + 3, y + 4, 26, 16, open > 0 ? 'b' : 'd');
    if (open > 0) { P(ctx, x + 3, y + 18, 26, 2, 'y'); P(ctx, x + 10, y + 8, 12, 10, 'B'); P(ctx, x + 13, y + 10, 6, 8, 'c'); }
    P(ctx, x + 13, y + 2, 6, 2, 'k'); P(ctx, x + 14, y + 2, 4, 1, lamp || (open > 0.5 ? 'G' : 'r'));
    const pw = Math.round(3 + 10 * (1 - C01(open)));
    for (const side of [0, 1]) {
      const px = side ? x + 29 - pw : x + 3;
      P(ctx, px, y + 4, pw, 16, 'l'); P(ctx, px, y + 4, pw, 1, 'w');
      P(ctx, side ? px : px + pw - 1, y + 4, 1, 16, 'g');
      if (pw >= 8) for (let i = 0; i < 16; i += 4) { P(ctx, px + 1, y + 6 + i, pw - 2, 2, i % 8 ? 'k' : 'y'); }
    }
  }

  /* 정비소 32x24 */
  function workshop(ctx, x, y, state, t, reduce) {
    const lit = state !== 'broken';
    P(ctx, x + 1, y + 10, 30, 14, 'k'); P(ctx, x + 2, y + 11, 28, 13, 'l'); P(ctx, x + 2, y + 11, 28, 1, 'w');
    for (let i = 0; i < 3; i++) { P(ctx, x + 2 + i * 10, y + 3, 10, 8, 'k'); P(ctx, x + 3 + i * 10, y + 4, 8, 7, i % 2 ? 'r' : 'o'); P(ctx, x + 3 + i * 10, y + 4, 8, 1, 'y'); }
    P(ctx, x + 24, y, 4, 5, 'k'); P(ctx, x + 25, y + 1, 2, 4, 'g');
    P(ctx, x + 10, y + 13, 12, 11, 'k');
    const open = state === 'restored';
    P(ctx, x + 11, y + 14, 10, 10, open ? 'y' : 'g');
    if (!open) for (let j = 14; j < 24; j += 2) P(ctx, x + 11, y + j, 10, 1, 'd');
    else { P(ctx, x + 11, y + 14, 10, 2, 'g'); P(ctx, x + 13, y + 18, 6, 6, 'o'); }
    for (const wx of [4, 24]) { P(ctx, x + wx, y + 14, 4, 4, 'k'); P(ctx, x + wx + 1, y + 15, 2, 2, lit ? 'y' : 'b'); }
    P(ctx, x + 4, y + 20, 4, 2, 'g'); P(ctx, x + 24, y + 20, 4, 2, 'g');
    // 톱니 간판
    const gx = x + 12, gy = y - 6;
    P(ctx, gx, gy, 8, 8, 'k');
    drawRows(ctx, ITEMS.gear, gx, gy);
    if (state === 'broken') {
      P(ctx, x + 6, y + 18, 1, 3, 'g'); P(ctx, x + 27, y + 15, 1, 2, 'g');
      const k = reduce ? 0 : (t / 90) % 12;
      for (let i = 0; i < 3; i++) P(ctx, x + 25 + ((i + Math.floor(k / 4)) % 2), y - 3 - ((k + i * 4) % 12), 2, 2, i === 2 ? 'l' : 'g');
    } else if (!reduce && Math.floor(t / 300) % 2) P(ctx, gx + 1, gy + 1, 1, 1, 'y');
  }

  /* 관제탑 16x30: 접시 안테나. waves 가 켜지면 신호가 퍼진다 */
  function tower(ctx, x, y, on, t, reduce) {
    for (let j = 0; j < 16; j++) { const half = 1 + Math.floor(j / 3); P(ctx, x + 8 - half, y + 12 + j, 1, 1, 'k'); P(ctx, x + 7 + half, y + 12 + j, 1, 1, 'k'); }
    for (let j = 15; j < 28; j += 4) { const half = 1 + Math.floor((j - 12) / 3); P(ctx, x + 8 - half, y + 12 + j - 12, half * 2, 1, 'g'); }
    P(ctx, x + 2, y + 28, 12, 2, 'k'); P(ctx, x + 3, y + 28, 10, 1, 'g');
    P(ctx, x + 7, y + 4, 2, 9, 'k');
    P(ctx, x + 3, y + 3, 10, 3, 'k'); P(ctx, x + 4, y + 4, 8, 1, 'l'); P(ctx, x + 5, y + 5, 6, 1, 'g');
    P(ctx, x + 7, y, 2, 3, 'k'); P(ctx, x + 7, y, 2, 2, on ? 'G' : 'r');
    if (on) {
      const k = reduce ? 2 : Math.floor(t / 160) % 3;
      for (let i = 0; i <= k; i++) { const r = 3 + i * 3; P(ctx, x + 8 + r, y - 1 - i, 1, 3 + i * 2, 's'); P(ctx, x + 7 - r, y - 1 - i, 1, 3 + i * 2, 's'); }
    }
  }

  /* 나무 상자 w x h */
  function crate(ctx, x, y, w, h, o) {
    const op = o || {};
    if (op.ghost) {
      P(ctx, x, y, w, h, 'd');
      for (let i = 0; i < w; i += 2) { P(ctx, x + i, y, 1, 1, 'g'); P(ctx, x + i, y + h - 1, 1, 1, 'g'); }
      for (let j = 0; j < h; j += 2) { P(ctx, x, y + j, 1, 1, 'g'); P(ctx, x + w - 1, y + j, 1, 1, 'g'); }
      return;
    }
    const body = op.body || 'o', dark = op.dark || 'r';
    P(ctx, x, y, w, h, 'k');
    P(ctx, x + 1, y + 1, w - 2, h - 2, body);
    P(ctx, x + 1, y + 1, w - 2, 1, 'y');
    for (let j = 4; j < h - 1; j += 4) P(ctx, x + 1, y + j, w - 2, 1, dark);
    P(ctx, x + 1, y + h - 2, w - 2, 1, dark);
    P(ctx, x + 1, y + 1, 1, 1, 'k'); P(ctx, x + w - 2, y + 1, 1, 1, 'k');
  }

  /* 선반 판(상자 아래 깔림) */
  function shelfBoard(ctx, x, y, w) {
    P(ctx, x, y, w, 3, 'k'); P(ctx, x + 1, y, w - 2, 1, 'l'); P(ctx, x + 1, y + 1, w - 2, 1, 'g');
    P(ctx, x + 1, y + 3, 2, 3, 'k'); P(ctx, x + w - 3, y + 3, 2, 3, 'k');
  }

  /* 컨베이어 길이 len(8의 배수 권장), 높이 12. off: 벨트가 움직인 거리 */
  function belt(ctx, x, y, len, off, run) {
    P(ctx, x, y + 4, len, 8, 'k');
    P(ctx, x + 2, y + 5, len - 4, 5, 'g');
    const o = ((Math.round(off) % 4) + 4) % 4;
    for (let i = -4; i < len - 4; i += 4) { const px = x + 2 + i + o; if (px >= x + 2 && px + 1 <= x + len - 3) P(ctx, px, y + 5, 1, 5, 'd'); }
    P(ctx, x + 2, y + 5, len - 4, 1, 'l');
    for (const rx of [x, x + len - 6]) { P(ctx, rx, y + 3, 6, 8, 'k'); P(ctx, rx + 1, y + 4, 4, 6, 'l'); P(ctx, rx + 2, y + 6, 2, 2, run ? 'y' : 'd'); }
    for (let i = 8; i < len - 8; i += 16) P(ctx, x + i, y + 10, 2, 2, 'k');
    P(ctx, x + 2, y + 11, 2, 1, 'k'); P(ctx, x + len - 4, y + 11, 2, 1, 'k');
  }

  /* 보관칸(힙 블록) 18x20. state: alive | freed | leaked */
  function bay(ctx, x, y, state, t, reduce, count) {
    P(ctx, x, y, 18, 20, 'k');
    P(ctx, x + 1, y + 1, 16, 18, state === 'freed' ? 'd' : 'b');
    P(ctx, x + 1, y + 17, 16, 2, 'g');
    P(ctx, x + 1, y + 1, 16, 1, state === 'freed' ? 'g' : 'B');
    const lamp = state === 'alive' ? 'G' : state === 'leaked' ? (!reduce && Math.floor(t / 250) % 2 ? 'o' : 'r') : 'r';
    P(ctx, x + 7, y + 1, 4, 2, 'k'); P(ctx, x + 8, y + 1, 2, 1, lamp);
    if (state === 'freed') {
      for (let i = 0; i < 10; i += 2) { P(ctx, x + 4 + i, y + 5 + i, 2, 2, 'r'); P(ctx, x + 14 - i, y + 5 + i, 2, 2, 'r'); }
      P(ctx, x + 3, y + 16, 12, 1, 'g');
      return;
    }
    const n = Math.max(1, Math.min(4, count || 1));
    const rows = n > 2 ? 2 : 1;
    const per = Math.ceil(n / rows);
    const cw = per > 1 ? 7 : 12, ch = rows > 1 ? 6 : 11;
    for (let k = 0; k < n; k++) {
      const cx = x + 2 + (k % per) * (cw + 1) + (per > 1 ? 0 : 2), cy = y + 4 + Math.floor(k / per) * (ch + 1) + (rows > 1 ? 0 : 2);
      crate(ctx, cx, cy, cw, ch, state === 'leaked' ? { body: 'y', dark: 'o' } : null);
    }
    if (state === 'leaked') { P(ctx, x + 1, y + 18, 16, 1, 'o'); }
  }

  /* 서류 캐비닛 18x24. files: 서랍 위에 튀어나온 종이 개수 */
  function cabinetBig(ctx, x, y, files) {
    P(ctx, x, y + 2, 18, 22, 'k');
    P(ctx, x + 1, y + 3, 16, 20, 'g');
    P(ctx, x + 1, y + 3, 16, 1, 'l');
    for (let i = 0; i < 3; i++) {
      const dy = y + 5 + i * 6;
      P(ctx, x + 2, dy, 14, 5, 'k'); P(ctx, x + 3, dy + 1, 12, 3, 'l');
      P(ctx, x + 7, dy + 2, 4, 1, 'y');
      if (i < files) { P(ctx, x + 3 + (i % 2) * 3, dy - 2, 8, 2, 'w'); P(ctx, x + 3 + (i % 2) * 3, dy - 2, 8, 1, 'c'); }
    }
    P(ctx, x + 1, y, 16, 2, 'k');
  }

  /* 경보기 16x16. state: idle | thrown | caught */
  function sirenLight(ctx, x, y, state, t, reduce) {
    P(ctx, x + 2, y + 12, 12, 4, 'k'); P(ctx, x + 3, y + 12, 10, 1, 'g');
    P(ctx, x + 4, y + 3, 8, 9, 'k');
    const flash = !reduce && Math.floor(t / 200) % 2;
    const dome = state === 'thrown' ? (flash ? 'r' : 'o') : state === 'caught' ? 'G' : 'v';
    P(ctx, x + 5, y + 4, 6, 8, dome);
    P(ctx, x + 5, y + 4, 2, 6, 'w');
    P(ctx, x + 6, y + 1, 4, 2, 'k');
    if (state === 'thrown') {
      P(ctx, x, y + 6, 3, 1, 'y'); P(ctx, x + 13, y + 6, 3, 1, 'y'); P(ctx, x + 2, y + 2, 2, 1, 'y'); P(ctx, x + 12, y + 2, 2, 1, 'y');
    }
    if (state === 'caught') {
      for (let i = 0; i <= 10; i += 3) { P(ctx, x + 2 + i, y + 1, 1, 12, 's'); P(ctx, x + 2, y + 1 + i, 12, 1, 's'); }
    }
  }

  /* 자료 단말 18x14: 값을 보여 주는 작은 콘솔. icon: 8x8 아이템 이름 */
  function consolePlate(ctx, x, y, icon) {
    P(ctx, x, y, 18, 14, 'k');
    P(ctx, x + 1, y + 1, 16, 12, 'g');
    P(ctx, x + 1, y + 1, 16, 1, 'l');
    P(ctx, x + 2, y + 2, 14, 10, 'd');
    P(ctx, x + 2, y + 2, 14, 1, 'b');
    if (icon && ITEMS[icon]) drawRows(ctx, ITEMS[icon], x + 5, y + 3);
    P(ctx, x + 14, y + 11, 2, 1, 'G');
  }

  /* 로봇 발판 22x4 */
  function pad(ctx, x, y, w) {
    P(ctx, x, y, w, 4, 'k'); P(ctx, x + 1, y, w - 2, 1, 'l'); P(ctx, x + 1, y + 1, w - 2, 2, 'g');
    for (let i = 3; i < w - 3; i += 4) P(ctx, x + i, y + 2, 2, 1, 'y');
  }

  /* 입력 단말 24x14 */
  function terminal(ctx, x, y, active, t, reduce) {
    P(ctx, x + 2, y, 20, 9, 'k'); P(ctx, x + 3, y + 1, 18, 7, 'b');
    P(ctx, x + 5, y + 3, 5, 1, 'l'); P(ctx, x + 5, y + 5, 3, 1, 'l');
    if (active || reduce || Math.floor(t / 500) % 2) P(ctx, x + 12, y + 5, 2, 1, 'G');
    P(ctx, x, y + 9, 24, 5, 'k'); P(ctx, x + 1, y + 10, 22, 3, 'g');
    for (let i = 0; i < 8; i++) P(ctx, x + 2 + i * 2 + (i > 3 ? 1 : 0), y + 11, 1, 1, active && !reduce && Math.floor(t / 110) % 8 === i ? 'y' : 'l');
  }

  /* 포인터 상자 18x10. aim: 대상이 있는지 */
  function pointerBox(ctx, x, y, aim) {
    P(ctx, x, y, 18, 10, 'k'); P(ctx, x + 1, y + 1, 16, 8, 'B'); P(ctx, x + 1, y + 1, 16, 1, 'c');
    P(ctx, x + 2, y + 2, 6, 6, 'k');
    if (aim) { P(ctx, x + 4, y + 3, 2, 4, 's'); P(ctx, x + 3, y + 4, 4, 2, 's'); } else { P(ctx, x + 3, y + 3, 4, 4, 'g'); }
    P(ctx, x + 15, y + 3, 3, 4, 'k'); P(ctx, x + 16, y + 4, 2, 2, aim ? 'y' : 'g');
  }

  /* 접지 기호(nullptr) */
  function ground(ctx, x, y) {
    P(ctx, x + 3, y, 1, 3, 'l'); P(ctx, x, y + 3, 7, 1, 'l'); P(ctx, x + 1, y + 5, 5, 1, 'l'); P(ctx, x + 2, y + 7, 3, 1, 'l');
  }

  /* 호출 스택의 방 w x h. active: 지금 실행 중인 방 */
  function stackRoom(ctx, x, y, w, h, active) {
    P(ctx, x, y, w, h, 'k');
    P(ctx, x + 1, y + 1, w - 2, h - 2, active ? 'B' : 'b');
    P(ctx, x + 1, y + 1, w - 2, 1, active ? 'c' : 'B');
    P(ctx, x + 1, y + h - 3, w - 2, 2, 'g');
    P(ctx, x + w - 5, y + 3, 3, Math.max(2, h - 8), active ? 'y' : 'd');
  }

  /* 정렬 상자(set): 밑이 막힌 U 자 */
  function sortBin(ctx, x, y, w, h) {
    P(ctx, x, y, 2, h, 'k'); P(ctx, x + w - 2, y, 2, h, 'k'); P(ctx, x, y + h - 2, w, 2, 'k');
    P(ctx, x + 1, y, 1, h - 2, 'l'); P(ctx, x + w - 2, y, 1, h - 2, 'g');
    P(ctx, x + 2, y + h - 3, w - 4, 1, 'g');
  }

  /* 가로 배터리 */
  function batteryH(ctx, x, y, w, h, level, blink) {
    P(ctx, x + w, y + Math.floor(h / 2) - 2, 1, 4, 'k');
    P(ctx, x, y, w, h, 'k'); P(ctx, x + 1, y + 1, w - 2, h - 2, 'd');
    if (level === undefined || level === null) { drawText(ctx, '?', x + Math.floor((w - 3) / 2), y + Math.floor((h - 5) / 2), blink ? 'y' : 'l'); return; }
    const inner = w - 2, lv = C01(level), fill = Math.round(inner * lv);
    const color = level > 1.0001 ? 'o' : lv < 0.25 ? 'r' : lv < 0.5 ? 'y' : 'G';
    const shade = { o: 'r', r: 'v', y: 'o', G: 'e' }[color];
    P(ctx, x + 1, y + 1, fill, h - 2, color);
    P(ctx, x + 1, y + h - 3, fill, 1, shade);
    for (let k = x + 1 + 6; k < x + 1 + inner; k += 6) P(ctx, k, y + 1, 1, h - 2, k < x + 1 + fill ? shade : 'g');
    if (fill > 0) P(ctx, x + 1, y + 1, fill, 1, 'w');
  }

  /* 화살머리: 선분 끝에 방향 dir(1 오른쪽, -1 왼쪽, 2 아래, -2 위) */
  function arrowHead(ctx, x, y, dir, color) {
    const c = color || 's';
    if (dir === 1) { P(ctx, x - 1, y - 1, 1, 3, c); P(ctx, x - 2, y - 2, 1, 5, c); P(ctx, x, y, 1, 1, c); }
    else if (dir === -1) { P(ctx, x + 1, y - 1, 1, 3, c); P(ctx, x + 2, y - 2, 1, 5, c); P(ctx, x, y, 1, 1, c); }
    else if (dir === 2) { P(ctx, x - 1, y - 1, 3, 1, c); P(ctx, x - 2, y - 2, 5, 1, c); P(ctx, x, y, 1, 1, c); }
    else { P(ctx, x - 1, y + 1, 3, 1, c); P(ctx, x - 2, y + 2, 5, 1, c); P(ctx, x, y, 1, 1, c); }
  }

  /* 로봇 발밑 마커(사용 중 표시) 없이도 쓰는 작은 화분/표지 장식 */
  function prop(ctx, kind, x, y) {
    switch (kind) {
      case 'crates':
        crate(ctx, x, y + 6, 8, 8); crate(ctx, x + 8, y + 6, 8, 8, { body: 'y', dark: 'o' }); crate(ctx, x + 4, y, 8, 7);
        break;
      case 'lamp':
        P(ctx, x + 1, y + 4, 2, 10, 'k'); P(ctx, x, y, 4, 4, 'k'); P(ctx, x + 1, y + 1, 2, 2, 'y'); P(ctx, x - 1, y + 14, 6, 1, 'k');
        break;
      case 'tree':
        P(ctx, x + 3, y + 9, 2, 5, 'k'); P(ctx, x, y + 1, 8, 8, 'k'); P(ctx, x + 1, y + 2, 6, 6, 'e'); P(ctx, x + 2, y + 3, 2, 2, 'G');
        break;
      case 'pipes':
        P(ctx, x, y, 3, 14, 'k'); P(ctx, x + 1, y, 1, 14, 'l'); P(ctx, x + 4, y + 4, 3, 10, 'k'); P(ctx, x + 5, y + 4, 1, 10, 'c');
        break;
      case 'barrel':
        P(ctx, x, y, 8, 10, 'k'); P(ctx, x + 1, y + 1, 6, 8, 'r'); P(ctx, x + 1, y + 3, 6, 1, 'k'); P(ctx, x + 1, y + 6, 6, 1, 'k'); P(ctx, x + 1, y + 1, 1, 8, 'o');
        break;
      case 'mold':
        P(ctx, x, y, 12, 10, 'k'); P(ctx, x + 1, y + 1, 10, 8, 'g'); P(ctx, x + 3, y + 3, 6, 4, 'd'); P(ctx, x + 1, y + 1, 10, 1, 'l');
        break;
    }
  }

  global.Pixel = {
    PAL, drawText, textWidth, drawRows, ICONS, ITEMS, iconURL, itemURL, textURL, P,
    robot, robotFrame, battery, building, generator, machine, monitor, keyboard, mast, sparkle, brackets, cable, island,
    zone, floorDeco, door, gate, workshop, tower, crate, shelfBoard, belt, bay, cabinetBig, sirenLight, consolePlate, pad, terminal,
    pointerBox, ground, stackRoom, sortBin, batteryH, arrowHead, prop, hash,
  };
})(this);
