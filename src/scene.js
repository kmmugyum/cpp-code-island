/*
 * 장면 엔진: 160x96 논리 픽셀 캔버스를 정수 배율로만 확대해 그린다.
 * 화면은 app 이 넘긴 model(현재 실행 단계·변수·판정)의 함수다. 애니메이션은 단계가 바뀐 시각에서
 * 흐른 시간으로만 계산하므로, 연타·되감기·초기화를 해도 장면이 실행 기록과 어긋나지 않는다.
 * 코드 이름·값·출력처럼 대소문자가 중요한 글자는 캔버스가 아니라 HTML 태그(읽기 쉬운 글꼴)로 올린다.
 */
(function (global) {
  'use strict';

  const Px = global.Pixel;
  const W = 160;
  const H = 96;
  const STEP_MS = 650;
  const SUCCESS_MS = 1800;

  const SCENES = {};

  const state = {
    stage: null, canvas: null, ctx: null, tags: null,
    scale: 1, cssScale: 1,
    model: null, stepKey: null, stepStart: 0, successKey: null, successStart: -1e9, checkKey: null, checkStart: 0,
    reduce: false, raf: 0, lastDraw: 0, tagsHtml: '', bgCache: new Map(),
  };

  const ease = (p) => 1 - (1 - p) * (1 - p);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mount(stage) {
    state.stage = stage;
    stage.innerHTML = '<div class="scene-probe" aria-hidden="true"></div><div class="scene-canvas-wrap"><canvas class="scene-canvas" width="160" height="96" aria-hidden="true"></canvas><div class="scene-tags"></div></div>';
    state.probe = stage.querySelector('.scene-probe');
    state.canvas = stage.querySelector('canvas');
    state.ctx = state.canvas.getContext('2d');
    state.tags = stage.querySelector('.scene-tags');
    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(stage);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    resize();
  }

  // 들어갈 수 있는 가장 큰 '기기 픽셀 기준 정수 배율'을 고른다 → 모든 픽셀이 같은 크기로 선명하게 보인다
  function resize() {
    if (!state.stage) return;
    const dpr = window.devicePixelRatio || 1;
    const availW = state.stage.clientWidth - 8; // 픽셀 테두리(4px x 2) 만큼 뺀다
    const maxH = state.probe.offsetHeight || Infinity; // CSS 변수 --scene-max-h(calc 포함)를 실제 px 로 읽는다
    const scale = Math.max(1, Math.floor(Math.min(availW * dpr / W, maxH * dpr / H)));
    state.scale = scale;
    state.cssScale = scale / dpr;
    state.canvas.width = W * scale;
    state.canvas.height = H * scale;
    const cw = `${(W * scale) / dpr}px`;
    const ch = `${(H * scale) / dpr}px`;
    state.canvas.style.width = cw;
    state.canvas.style.height = ch;
    state.tags.style.width = cw;
    state.tags.style.height = ch;
    state.tags.style.setProperty('--u', `${state.cssScale}px`);
    state.tagsHtml = '';
    draw(performance.now(), true);
  }

  // 같은 단계·성공·확인 키는 처음 본 시각을 기억한다 → 다른 미션에 다녀와도 지난 연출을 다시 틀지 않는다
  const seen = new Map();
  function startOf(kind, key, now) {
    const k = `${kind}:${key}`;
    if (!seen.has(k)) {
      if (seen.size > 500) seen.clear();
      seen.set(k, now);
    }
    return seen.get(k);
  }

  function set(model) {
    const now = performance.now();
    if (model.stepKey !== state.stepKey) { state.stepKey = model.stepKey; state.stepStart = startOf('step', model.stepKey, now); }
    state.successKey = model.successKey || null;
    state.successStart = model.successKey ? startOf('success', model.successKey, now) : -1e9;
    if (model.checkKey !== state.checkKey) { state.checkKey = model.checkKey; state.checkStart = model.checkKey ? startOf('check', model.checkKey, now) : 0; }
    state.model = model;
    state.tagsHtml = '';
    // 코드 줄·변수 표와 같은 순간에 장면과 태그도 바뀌도록 즉시 한 번 그린다
    draw(now, true);
    kick();
  }

  function setReduceMotion(on) {
    state.reduce = on;
    if (state.model) draw(performance.now(), true);
    kick();
  }

  function kick() {
    if (!state.raf) state.raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    state.raf = 0;
    if (!state.model || document.hidden) return;
    const busy = draw(now, false);
    // 움직임 줄이기: 진행 중인 전환이 없으면 다시 그리지 않는다
    if (!state.reduce || busy) state.raf = requestAnimationFrame(loop);
  }

  function context(now) {
    const m = state.model;
    const raw = state.reduce ? 1 : Math.min(1, (now - state.stepStart) / STEP_MS);
    const step = m.step;
    const S = {
      ctx: state.ctx, t: now, reduce: state.reduce, model: m, step,
      p: ease(raw), rawP: raw,
      successAge: now - state.successStart,
      checkAge: state.reduce ? 1e9 : now - state.checkStart,
      vars: step ? step.after : [],
      declared(name) { return S.vars.some((v) => v.name === name); },
      value(name) { const v = S.vars.find((x) => x.name === name); return v ? v.value : undefined; },
      // 바뀐 변수는 실행 전 값 → 실행 후 값으로 트윈한다
      tween(name) {
        const after = S.value(name);
        if (!step || !step.changed.includes(name)) return after;
        const b = step.before.find((x) => x.name === name);
        const from = b && b.value !== undefined ? b.value : 0;
        if (after === undefined) return undefined;
        return from + (after - from) * S.p;
      },
      changing(name) { return !!step && step.changed.includes(name) && raw < 1; },
      status(names) {
        if (!step) return null;
        if (names.some((n) => step.changed.includes(n))) return 'change';
        if (names.some((n) => step.reads.includes(n))) return 'read';
        return null;
      },
      robotState(opts) {
        const o = opts || {};
        if (m.phase === 'compileError' || m.phase === 'runtimeError') return 'fail';
        if (S.successAge < SUCCESS_MS && m.phase === 'pass') return 'success';
        if (o.active) return o.active;
        if (m.phase === 'fail') return 'sad';
        if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) return 'happy';
        return 'idle';
      },
    };
    return S;
  }

  function background(id, frame) {
    const key = `${id}:${frame}`;
    if (state.bgCache.has(key)) return state.bgCache.get(key);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    Px.island(ctx, W / 8, H / 8, SCENES[id].bg, frame);
    state.bgCache.set(key, c);
    return c;
  }

  function draw(now, force) {
    const m = state.model;
    if (!m || !state.ctx) return false;
    if (!force && !state.reduce && now - state.lastDraw < 66) return true; // 약 15fps: 픽셀 게임에 충분
    state.lastDraw = now;
    const scene = SCENES[m.id];
    if (!scene) return false;
    const ctx = state.ctx;
    ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const frame = state.reduce ? 0 : Math.floor(now / 500) % 4;
    ctx.drawImage(background(m.id, frame), 0, 0);
    const S = context(now);
    scene.draw(S);
    renderTags(scene.tags(S));
    const busy = S.rawP < 1 || S.successAge < SUCCESS_MS || S.checkAge < (scene.checkMs ? scene.checkMs(S) : 0);
    return busy;
  }

  // ------------------------------------------------------------ HTML 태그
  function renderTags(list) {
    const k = state.cssScale;
    const html = list.filter(Boolean).map((t) => {
      const style = `left:${Math.round(t.x * k)}px;top:${Math.round(t.y * k)}px;${t.w ? `width:${Math.round(t.w * k)}px;` : ''}${t.h ? `height:${Math.round(t.h * k)}px;` : ''}`;
      return `<div class="tag ${t.cls || ''} at-${t.anchor || 'bottom'}" style="${style}">${t.html}</div>`;
    }).join('');
    if (html !== state.tagsHtml) {
      state.tags.innerHTML = html;
      state.tagsHtml = html;
    }
  }

  function fmt(v, type) {
    if (v === undefined) return '?';
    if (type === 'double') return global.CppSim.formatDouble(v);
    return String(v);
  }

  // 변수 태그: 이름(코드 글꼴) + 값 + 상태 배지(글자). 색만으로 상태를 나타내지 않는다
  function varTag(S, name, x, y, anchor) {
    if (!S.declared(name)) return null;
    const v = S.vars.find((z) => z.name === name);
    const st = S.status([name]);
    const badge = st === 'change' ? '<em class="b-change">변경</em>' : st === 'read' ? '<em class="b-read">읽음</em>' : '';
    return { x, y, anchor, cls: `var ${st ? `is-${st}` : ''}`, html: `<code>${esc(name)}</code> <b>${esc(fmt(v.value, v.type))}</b>${badge}` };
  }

  function label(x, y, text, anchor, cls) {
    return { x, y, anchor, cls: `label ${cls || ''}`, html: esc(text) };
  }

  function screenTag(S, x, y, w, h, opts) {
    const o = opts || {};
    const m = S.model;
    const out = S.step ? S.step.outAfter : '';
    const lines = out.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    const shown = lines.slice(-(o.lines || 2));
    const isOut = S.step && S.step.kind === 'cout';
    let body;
    if (m.phase === 'compileError') body = `<span class="scr-err">${m.buildFail === 'link' ? '링크 실패' : '컴파일 실패'}</span><span class="scr-dim">실행 파일 없음</span>`;
    else if (!S.step && m.phase === 'edit') body = `<span class="scr-dim">${esc(o.idle || '대기 중')}</span>`;
    else body = shown.map((l) => `<span>${esc(l) || '&nbsp;'}</span>`).join('') || '<span class="scr-dim">(출력 없음)</span>';
    return { x, y, w, h, anchor: 'box', cls: `screen ${isOut ? 'is-output' : ''} ${o.big ? 'big' : ''}`, html: body };
  }

  function outputBadge(S, x, y) {
    if (!S.step || S.step.kind !== 'cout') return null;
    return { x, y, anchor: 'bottom', cls: 'var is-output', html: '<em class="b-output">출력만</em> 변수는 그대로' };
  }

  // ================================================================ 1-3 전력 분배 (대표 장면)
  const R13 = { gen: [18, 40, 24, 20], dist: [54, 42, 16, 16], mon: [48, 6, 40, 22], robotY: 52, robotX0: 84, robotDX: 15 };

  SCENES['1-3'] = {
    bg: { paths: [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [15, 8], [16, 8], [17, 8]], floors: [[6, 5], [7, 5], [6, 6], [7, 6], [6, 7], [7, 7]] },
    layout(S) {
      const m = S.model;
      const declaredN = S.value('robots');
      const n = Math.max(1, Math.min(4, declaredN !== undefined ? declaredN : m.params.robots));
      const total = S.value('total') !== undefined ? S.value('total') : m.params.total;
      const robots = Array.from({ length: n }, (_, i) => ({ x: R13.robotX0 + i * R13.robotDX, y: R13.robotY }));
      return { n, total, robots, target: total / n };
    },
    draw(S) {
      const { ctx, t, reduce, model: m } = S;
      const L = this.layout(S);
      const shareNow = S.tween('share');
      const charging = S.changing('share');

      // 발전기 → 배분 장치 → 로봇 배터리 전선
      const busY = 30;
      const lastX = L.robots[L.robots.length - 1].x + 8;
      Px.cable(ctx, [[42, 52], [54, 52]], charging || S.changing('total'), t, reduce);
      Px.cable(ctx, [[62, 42], [62, busY], [lastX, busY]], charging, t, reduce);
      for (const r of L.robots) Px.cable(ctx, [[r.x + 8, busY], [r.x + 8, busY + 3]], charging, t, reduce);

      // 발전기: total 이 만들어지면 가동
      const genOn = S.declared('total') || (m.phase === 'edit' && m.restored);
      Px.generator(ctx, R13.gen[0], R13.gen[1], genOn, t, reduce);

      // 배분 장치: 고장 → 작동 → 복구
      let dist = 'broken';
      if (m.phase === 'running') dist = 'working';
      else if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) dist = 'restored';
      Px.machine(ctx, R13.dist[0], R13.dist[1], dist, t, reduce);

      // 출력 화면(cout): 출력만 보여 주고 다른 장치에는 영향 없음
      Px.monitor(ctx, R13.mon[0], R13.mon[1], R13.mon[2], R13.mon[3], m.phase !== 'edit' && m.phase !== 'compileError', m.phase === 'compileError');

      // 로봇과 배터리
      L.robots.forEach((r, i) => {
        const level = shareNow === undefined ? undefined : shareNow / L.target;
        Px.battery(ctx, r.x + 3, busY + 4, 10, 17, level, { blink: S.changing('share') });
        const active = charging ? 'charge' : S.changing('robots') ? 'work' : null;
        const st = S.robotState({ active });
        const fr = Px.robotFrame(st, t + i * 130, reduce);
        Px.robot(ctx, r.x, r.y, Object.assign({ body: i % 2 ? 'o' : 'c' }, fr));
      });

      // 나눠지지 않은 전력 / 초과 전력
      const share = S.value('share');
      if (share !== undefined && S.rawP >= 1) {
        const lost = L.total - share * L.n;
        if (lost > 1e-9 && !reduce) {
          const k = Math.floor(t / 120) % 6;
          Px.P(ctx, 66, 60 + k, 1, 1, 'y');
          Px.P(ctx, 59, 60 + ((k + 3) % 6), 1, 1, 'o');
        }
      }

      // 이번 단계에서 바뀐 대상 / 읽기만 한 대상 / 출력
      const hl = (rect, names) => { const st = S.status(names); if (st) Px.brackets(ctx, rect[0], rect[1], rect[2], rect[3], st, t, reduce); };
      hl(R13.gen, ['total']);
      const groupW = L.robots.length * R13.robotDX + 1;
      hl([R13.robotX0, busY + 3, groupW, 15], ['share']);
      hl([R13.robotX0, R13.robotY, groupW, 16], ['robots']);
      if (S.step && S.step.kind === 'cout') Px.brackets(ctx, R13.mon[0], R13.mon[1], R13.mon[2], R13.mon[3], 'output', t, reduce);
      if (m.phase === 'compileError') Px.brackets(ctx, R13.dist[0], R13.dist[1], 16, 16, 'error', t, reduce);

      if (S.model.phase === 'pass' && S.successAge < SUCCESS_MS && !reduce) {
        const f = Math.floor(S.successAge / 150);
        Px.sparkle(ctx, 56 + (f * 7) % 14, 40 - (f % 3) * 3, f);
        L.robots.forEach((r, i) => Px.sparkle(ctx, r.x + 8 + ((f + i) % 3) * 3 - 3, r.y - 2, f + i));
      }
    },
    tags(S) {
      const L = this.layout(S);
      const m = S.model;
      const share = S.value('share');
      const midX = R13.robotX0 + (L.robots.length * R13.robotDX) / 2;
      const distLabel = { broken: '고장', working: '작동 중', restored: '복구됨' };
      let dist = 'broken';
      if (m.phase === 'running') dist = 'working';
      else if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) dist = 'restored';
      const out = [
        label(30, 62, '발전기', 'top'),
        varTag(S, 'total', 30, 39, 'bottom'),
        label(62, 60, `배분 장치 · ${distLabel[dist]}`, 'top', `st-${dist}`),
        varTag(S, 'share', midX, 31, 'bottom') || label(midX, 31, '배터리 = share', 'bottom', 'dim'),
        varTag(S, 'robots', midX, 69, 'top') || label(midX, 69, `로봇 ${L.n}대`, 'top', 'dim'),
        screenTag(S, R13.mon[0] + 2, R13.mon[1] + 2, R13.mon[2] - 4, R13.mon[3] - 5, { idle: 'cout 출력 화면' }),
        outputBadge(S, R13.mon[0] + R13.mon[2] / 2, R13.mon[1] - 1),
      ];
      if (share !== undefined && S.rawP >= 1) {
        const lost = L.total - share * L.n;
        if (lost > 1e-9) out.push({ x: 62, y: 68, anchor: 'top', cls: 'var is-warn', html: `<em class="b-warn">손실</em> 나눠 주지 못한 전력 <b>${esc(fmt(lost, 'double'))}</b>` });
        else if (lost < -1e-9) out.push({ x: 62, y: 68, anchor: 'top', cls: 'var is-warn', html: `<em class="b-warn">초과</em> 발전기에 없는 전력 <b>${esc(fmt(-lost, 'double'))}</b>` });
      }
      return out;
    },
  };

  // ================================================================ 공통: 장치 상태
  function facilityState(m) {
    if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) return 'restored';
    if (m.phase === 'running') return 'working';
    return 'broken';
  }
  const FACILITY_TEXT = { broken: '고장', working: '작동 중', restored: '복구됨' };
  const item = (ctx, name, x, y) => Px.drawRows(ctx, Px.ITEMS[name], Math.round(x), Math.round(y));

  // ================================================================ 1-1 빌드 공장
  const HOP = 450;
  const B11 = {
    // 카드 순서대로: 소스, 전처리기, 컴파일러, 오브젝트, 링커, 실행 파일, 운영체제(기지)
    st: [[18, 16], [48, 16], [78, 16], [108, 16], [118, 54], [86, 54], [22, 50]],
    panel: ['g', 't', 'B', 'v', 'r', 'd'],
    robotAt(i) { if (i < 0) return [136, 34]; const [x, y] = this.st[i]; return i === 6 ? [x + 8, 34] : [x, 34]; },
  };

  SCENES['1-1'] = {
    bg: { paths: Array.from({ length: 16 }, (_, i) => [i + 2, 4]).concat(Array.from({ length: 16 }, (_, i) => [i + 2, 5])) },
    // 확인을 누른 뒤 로봇이 놓인 카드 순서대로 기계를 찾아간다. 틀린 칸에서 멈춘다.
    timeline(S) {
      const m = S.model;
      const ids = m.cards.map((c) => c.id);
      if (!m.check) return { visits: [], hop: 0, frac: 1, lit: m.restored ? 7 : 0, failAt: -1, done: m.restored };
      const c = m.check;
      const visits = c.pass ? ids.map((_, i) => i) : c.placed.slice(0, c.prefix + 1).map((id) => ids.indexOf(id));
      const age = S.checkAge;
      const hop = Math.min(visits.length, Math.floor(age / HOP));
      const frac = hop >= visits.length ? 1 : (age % HOP) / HOP;
      const arrived = Math.min(visits.length, Math.floor(age / HOP));
      const lit = Math.min(arrived, c.prefix);
      const failAt = !c.pass && arrived > c.prefix ? visits[c.prefix] : -1;
      return { visits, hop, frac, lit, failAt, done: c.pass && arrived >= visits.length };
    },
    checkMs(S) { return S.model.check ? (S.model.check.placed.length + 1) * HOP + SUCCESS_MS : 0; },
    draw(S) {
      const { ctx, t, reduce, model: m } = S;
      const T = this.timeline(S);
      const litSet = new Set(T.visits.slice(0, T.lit));
      if (!m.check && m.restored) for (let i = 0; i < 7; i++) litSet.add(i);
      // 라이브러리 책장(링커 옆)
      item(ctx, 'book', 138, 58);
      for (let i = 0; i < 6; i++) {
        const [x, y] = B11.st[i];
        const lit = litSet.has(i);
        Px.machine(ctx, x, y, lit ? 'restored' : i === T.failAt ? 'broken' : 'off', t, reduce, B11.panel[i]);
        if (lit) item(ctx, m.cards[i].item, x + 4, y - 7);
        if (i === T.failAt) Px.brackets(ctx, x, y, 16, 16, 'error', t, reduce);
      }
      const baseState = litSet.has(6) || T.done ? 'restored' : 'broken';
      Px.building(ctx, B11.st[6][0], B11.st[6][1], baseState, t, reduce);
      if (T.failAt === 6) Px.brackets(ctx, B11.st[6][0], B11.st[6][1], 32, 24, 'error', t, reduce);
      // 로봇 위치: 앞 기계 → 다음 기계로 걷는다
      let pos = B11.robotAt(-1);
      let st = S.robotState();
      let carry = 'file';
      if (T.visits.length) {
        const from = T.hop === 0 ? B11.robotAt(-1) : B11.robotAt(T.visits[T.hop - 1]);
        const to = T.hop >= T.visits.length ? from : B11.robotAt(T.visits[T.hop]);
        pos = [from[0] + (to[0] - from[0]) * T.frac, from[1] + (to[1] - from[1]) * T.frac];
        if (T.hop < T.visits.length) st = 'walk';
        else if (T.failAt >= 0) st = 'fail';
        else if (T.done) st = S.checkAge < (T.visits.length * HOP + SUCCESS_MS) && !reduce ? 'success' : 'happy';
        const last = T.visits.slice(0, T.lit).pop();
        if (last !== undefined) carry = m.cards[last].item;
      } else if (m.restored) {
        pos = B11.robotAt(6);
        st = 'happy';
        carry = null;
      }
      if (T.done) carry = null;
      Px.robot(ctx, Math.round(pos[0]), Math.round(pos[1]), Object.assign({ body: 'c' }, Px.robotFrame(st, t, reduce)));
      if (carry && st !== 'fail') item(ctx, carry, pos[0] + 4, pos[1] - 9);
      if (T.done && !reduce && S.checkAge < T.visits.length * HOP + SUCCESS_MS) {
        const f = Math.floor(S.checkAge / 150);
        Px.sparkle(ctx, B11.st[6][0] + 6 + (f * 7) % 20, B11.st[6][1] + 2, f);
      }
    },
    tags(S) {
      const m = S.model;
      const T = this.timeline(S);
      const litSet = new Set(T.visits.slice(0, T.lit));
      if (!m.check && m.restored) for (let i = 0; i < 7; i++) litSet.add(i);
      return m.cards.map((c, i) => {
        const [x, y] = B11.st[i];
        const w = i === 6 ? 32 : 16;
        const below = i >= 4;
        const ty = below ? y + (i === 6 ? 25 : 17) : y - 1;
        if (i === T.failAt) return label(x + w / 2, ty, `${c.label} · 흐름 끊김`, below ? 'top' : 'bottom', 'st-fail');
        if (litSet.has(i)) return label(x + w / 2, ty, c.label, below ? 'top' : 'bottom', 'st-ok');
        return label(x + w / 2, ty, '?', below ? 'top' : 'bottom', 'dim');
      });
    },
  };

  // ================================================================ 1-2 관제탑
  const R12 = { mast: [20, 22], robot: [40, 48], kb: [40, 64], mon: [64, 18, 78, 44] };

  SCENES['1-2'] = {
    bg: { floors: [[5, 6], [6, 6], [5, 7], [6, 7], [5, 8], [6, 8]] },
    draw(S) {
      const { ctx, t, reduce, model: m } = S;
      const fac = facilityState(m);
      const printing = !!S.step && S.step.kind === 'cout' && S.rawP < 1;
      const ok = m.phase === 'pass' || (m.phase === 'edit' && m.restored);
      Px.mast(ctx, R12.mast[0], R12.mast[1], 46, ok || printing, t, reduce);
      Px.cable(ctx, [[R12.mast[0] + 8, 66], [R12.kb[0], 66]], printing, t, reduce);
      Px.cable(ctx, [[R12.kb[0] + 16, 66], [R12.mon[0] + 10, 66], [R12.mon[0] + 10, R12.mon[1] + R12.mon[3] + 2]], printing, t, reduce);
      Px.monitor(ctx, R12.mon[0], R12.mon[1], R12.mon[2], R12.mon[3], fac !== 'broken' || m.phase === 'fail', m.phase === 'compileError' || fac === 'broken');
      // 꺼진 화면: 지직거리는 잡음
      if (fac === 'broken' && m.phase !== 'compileError' && m.phase !== 'fail' && !reduce) {
        for (let i = 0; i < 40; i++) {
          const n = Math.sin((i + 1) * 12.9898 + Math.floor(t / 120) * 78.233) * 43758.5453;
          const fr = n - Math.floor(n);
          Px.P(ctx, R12.mon[0] + 2 + Math.floor(fr * (R12.mon[2] - 4)), R12.mon[1] + 2 + Math.floor(((fr * 97) % 1) * (R12.mon[3] - 5)), 1, 1, i % 3 ? 'g' : 'l');
        }
      }
      const active = printing ? 'work' : null;
      Px.robot(ctx, R12.robot[0], R12.robot[1], Object.assign({ body: 'o' }, Px.robotFrame(S.robotState({ active }), t, reduce)));
      Px.keyboard(ctx, R12.kb[0], R12.kb[1], printing, t, reduce);
      if (S.step && S.step.kind === 'cout') Px.brackets(ctx, R12.mon[0], R12.mon[1], R12.mon[2], R12.mon[3], 'output', t, reduce);
      if (m.phase === 'compileError') Px.brackets(ctx, R12.mon[0], R12.mon[1], R12.mon[2], R12.mon[3], 'error', t, reduce);
      if (m.phase === 'pass' && S.successAge < SUCCESS_MS && !reduce) {
        const f = Math.floor(S.successAge / 150);
        Px.sparkle(ctx, R12.mon[0] + 8 + (f * 13) % (R12.mon[2] - 16), R12.mon[1] + 4, f);
      }
    },
    tags(S) {
      const m = S.model;
      const fac = facilityState(m);
      const [x, y, w, h] = R12.mon;
      const idle = fac === 'restored' ? `복구됨 · 마지막 신호 ${m.target}` : '꺼져 있음';
      return [
        label(x + w / 2, y - 1, `목표 신호: ${m.target}`, 'bottom'),
        screenTag(S, x + 3, y + 3, w - 6, h - 7, { idle, lines: 3, big: true }),
        label(x + w / 2, y + h + 3, `관제 화면 · ${FACILITY_TEXT[fac]}`, 'top', `st-${fac}`),
        outputBadge(S, R12.robot[0] + 8, R12.robot[1] - 2),
        label(R12.mast[0] + 4, R12.mast[1] + 50, '안테나', 'top', 'dim'),
      ];
    },
  };

  // ================================================================ 1-4 기지 본관
  const R14 = { mon: [18, 14, 36, 20], robot: [22, 44], kb: [22, 62], bat: [66, 30, 14, 36], base: [104, 38] };

  SCENES['1-4'] = {
    bg: { paths: Array.from({ length: 11 }, (_, i) => [i + 4, 8]), floors: [[13, 5], [14, 5], [15, 5], [16, 5], [13, 6], [14, 6], [15, 6], [16, 6]] },
    powered(S) {
      // energy = energy - usage 처럼 usage 를 읽어 energy 를 바꾼 문장이 이미 실행됐고 전력이 남아 있으면 기지가 켜진다
      const e = S.value('energy');
      return S.model.past.some((s) => s.changed.includes('energy') && s.reads.includes('usage')) && e !== undefined && e >= 0;
    },
    draw(S) {
      const { ctx, t, reduce, model: m } = S;
      const [bx, by, bw, bh] = R14.bat;
      const reading = !!S.step && S.step.kind === 'cin' && S.rawP < 1;
      const draining = S.changing('energy') && S.step.reads.includes('usage');
      Px.cable(ctx, [[R14.kb[0] + 16, 66], [bx + 4, 66], [bx + 4, by + bh]], reading, t, reduce, 'G');
      Px.cable(ctx, [[bx + bw, 52], [R14.base[0], 52]], draining, t, reduce);
      Px.monitor(ctx, R14.mon[0], R14.mon[1], R14.mon[2], R14.mon[3], m.phase !== 'edit' && m.phase !== 'compileError', m.phase === 'compileError');
      // 기지: 고장 → (전력 공급) 작동 → 복구
      let base = 'broken';
      if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) base = 'restored';
      else if (this.powered(S)) base = 'working';
      Px.building(ctx, R14.base[0], R14.base[1], base, t, reduce);
      // 배터리 = energy
      const e = S.tween('energy');
      const cap = Math.max(100, Number(m.input) || 0);
      Px.battery(ctx, bx, by, bw, bh, S.declared('energy') ? (e === undefined ? undefined : e / cap) : 0, { blink: S.step && S.step.kind === 'decl' && S.step.changed.includes('energy') });
      // 입력 단말과 로봇
      Px.robot(ctx, R14.robot[0], R14.robot[1], Object.assign({ body: 'c' }, Px.robotFrame(S.robotState({ active: reading ? 'work' : null }), t, reduce)));
      Px.keyboard(ctx, R14.kb[0], R14.kb[1], reading, t, reduce);
      // cin: 전력 셀이 단말에서 배터리로 날아간다
      if (reading) {
        const p = S.p;
        const x = R14.kb[0] + 8 + (bx + 3 - R14.kb[0] - 8) * p;
        const y = R14.kb[1] - 8 + (by + 10 - R14.kb[1] + 8) * p - Math.sin(Math.PI * p) * 14;
        item(ctx, 'cell', x, y);
      }
      // 기지로 흘러가는 전력 입자
      if (draining && !reduce) for (let i = 0; i < 3; i++) Px.P(ctx, bx + bw + ((Math.floor(t / 60) + i * 8) % 24), 51, 2, 2, 'y');
      if (e !== undefined && e < 0 && !reduce && Math.floor(t / 200) % 2) Px.P(ctx, R14.base[0] + 26, R14.base[1] + 12, 2, 2, 'o');
      // 강조
      const hl = (rect, names) => { const st = S.status(names); if (st) Px.brackets(ctx, rect[0], rect[1], rect[2], rect[3], st, t, reduce); };
      hl([bx, by - 1, bw, bh + 1], ['energy']);
      hl([R14.base[0], R14.base[1] - 2, 32, 26], ['usage']);
      if (S.step && S.step.kind === 'cout') Px.brackets(ctx, R14.mon[0], R14.mon[1], R14.mon[2], R14.mon[3], 'output', t, reduce);
      if (reading) Px.brackets(ctx, R14.kb[0], R14.kb[1], 16, 8, 'read', t, reduce);
      if (m.phase === 'pass' && S.successAge < SUCCESS_MS && !reduce) {
        const f = Math.floor(S.successAge / 150);
        Px.sparkle(ctx, R14.base[0] + 4 + (f * 9) % 24, R14.base[1] + 6, f);
      }
    },
    tags(S) {
      const m = S.model;
      const [bx, by, bw, bh] = R14.bat;
      let base = 'broken';
      if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) base = 'restored';
      else if (this.powered(S)) base = 'working';
      const e = S.value('energy');
      const out = [
        varTag(S, 'energy', bx + bw / 2, by - 3, 'bottom') || label(bx + bw / 2, by - 3, '배터리 = energy', 'bottom', 'dim'),
        varTag(S, 'usage', R14.base[0] + 16, R14.base[1] - 9, 'bottom') || label(R14.base[0] + 16, R14.base[1] - 9, '가동 전력 = usage', 'bottom', 'dim'),
        label(R14.base[0] + 16, R14.base[1] + 26, `기지 · ${FACILITY_TEXT[base]}`, 'top', `st-${base}`),
        label(R14.kb[0] + 8, R14.kb[1] + 9, `입력 단말 ${m.input ? `(${m.input})` : ''}`, 'top', 'dim'),
        screenTag(S, R14.mon[0] + 2, R14.mon[1] + 2, R14.mon[2] - 4, R14.mon[3] - 5, { idle: 'cout 출력 화면' }),
        outputBadge(S, R14.mon[0] + R14.mon[2] / 2, R14.mon[1] - 1),
      ];
      if (e !== undefined && e < 0) out.push({ x: R14.base[0] + 16, y: R14.base[1] + 34, anchor: 'top', cls: 'var is-warn', html: '<em class="b-warn">부족</em> 전력이 모자랍니다' });
      return out;
    },
  };

  global.Scene = { mount, set, resize, setReduceMotion, SCENES, W, H, STEP_MS, helpers: { varTag, label, screenTag, outputBadge, fmt, esc } };
})(this);
