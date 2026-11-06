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
    injectStyle();
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
    state.tagsHtml = null;
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
    state.tagsHtml = null;
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
      vars: step && step.after ? step.after : [],
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
    const generic = m.scene && !m.scene.custom;
    const scene = generic ? null : SCENES[m.id];
    if (!generic && !scene) return false;
    const ctx = state.ctx;
    ctx.setTransform(state.scale, 0, 0, state.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const frame = state.reduce ? 0 : Math.floor(now / 500) % 4;
    const S = context(now);
    if (generic) {
      genericScene(S, m.scene);
      return S.rawP < 1 || S.successAge < SUCCESS_MS;
    }
    ctx.drawImage(background(m.id, frame), 0, 0);
    scene.draw(S);
    renderTags(scene.tags(S));
    const busy = S.rawP < 1 || S.successAge < SUCCESS_MS || S.checkAge < (scene.checkMs ? scene.checkMs(S) : 0);
    return busy;
  }

  const WORDS = {
    changed: ['변경', 'Changed'], read: ['읽음', 'Read'], output: ['출력만', 'Output only'],
    open: ['열림', 'OPEN'], closed: ['닫힘', 'CLOSED'], freed: ['해제됨', 'freed'],
    leaked: ['누수', 'leaked'], alive: ['사용 중', 'alive'], null: ['널 포인터', 'nullptr'],
    dangling: ['무효 포인터', 'dangling'], caught: ['예외 처리', 'caught'],
    thrown: ['예외 발생', 'thrown'], bounds: ['범위 밖', 'out of bounds'], empty: ['비어 있음', 'empty'],
    input: ['입력', 'Input'], virtual: ['가상 호출', 'virtual'], direct: ['정적 호출', 'static'],
    sorted: ['정렬', 'sorted'], idle: ['대기', 'idle'],
  };

  // 장면 전용 CSS: 칸 안의 값 태그(cell), 가운데 기준 태그(at-mid), 줄 안 강조(hl). 나머지는 기존 태그 규칙을 그대로 쓴다.
  const SCENE_CSS = [
    '.tag.at-mid{transform:translate(-50%,-50%)}',
    '.tag.cell{background:transparent;box-shadow:none;padding:0;font-family:var(--mono);font-weight:800;color:#f4f4f4;text-shadow:1px 0 #1a1c2c,-1px 0 #1a1c2c,0 1px #1a1c2c,0 -1px #1a1c2c}',
    '.tag.cell.ink{color:#1a1c2c;text-shadow:none}',
    '.tag.cell.is-change{color:#ffcd75}.tag.cell.ink.is-change{color:#b13e53}',
    '.tag.cell.is-read{color:#73eff7}.tag.cell.ink.is-read{color:#257179}',
    '.tag .hl{padding:0 2px}.tag .hl.change{background:#ffcd75;color:#1a1c2c}.tag .hl.change b{color:#1a1c2c}',
    '.tag .hl.read{outline:1px dotted #73eff7}',
    '.tag i{font-style:normal;color:#a7f070;font-weight:700}',
    '.tag.dim{background:rgba(51,60,87,.9)}',
  ].join('');

  function injectStyle() {
    if (document.getElementById('scene-extra-style')) return;
    const el = document.createElement('style');
    el.id = 'scene-extra-style';
    el.textContent = SCENE_CSS;
    document.head.appendChild(el);
  }

  function zoneBackground(theme, frame) {
    const key = `zone:${theme}:${frame}`;
    if (state.bgCache.has(key)) return state.bgCache.get(key);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    Px.zone(c.getContext('2d'), theme, frame);
    state.bgCache.set(key, c);
    return c;
  }

  // 태그 가로 폭 추정(em 단위): 한글은 1em, 대문자·숫자는 조금 넓게
  function textEm(html) {
    const s = html.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, 'x');
    let w = 0;
    for (const ch of s) w += ch.charCodeAt(0) > 0x2e7f ? 1 : /[A-Z0-9@]/.test(ch) ? 0.64 : ch === ' ' ? 0.32 : 0.57;
    return w;
  }

  const SIZES = { generator: [24, 20], tower: [16, 30], machine: [16, 16], gate: [32, 20], workshop: [32, 24], building: [32, 24] };

  // 캔버스에 그리면서 정규 경로별 위치(anchor)를 모으고, 마지막에 포인터·참조 연결선을 그린다.
  function genericScene(S, spec) {
    const ctx = S.ctx, m = S.model, step = S.step || {};
    const events = step.events || [];
    // main 이 끝난 뒤에는 지역 변수가 이미 지워진 메모리 대신 끝나기 직전 값(finalMem)을 보여 준다.
    // 힙과 파일은 현재 단계 것을 써서 해제·누수·저장 결과가 그대로 보이게 한다.
    let mem = step.mem || {};
    if (m.mainDone && m.finalMem) {
      mem = Object.assign({}, m.finalMem, { heap: mem.heap || m.finalMem.heap, files: mem.files || m.finalMem.files });
    }
    const lang = global.I18N && global.I18N.lang === 'en' ? 1 : 0;
    const word = k => WORDS[k][lang];
    const tr = s => s && typeof s === 'object' ? (s[lang ? 'en' : 'ko'] || '') : (s || '');
    const P = (x, y, w, h, c) => Px.P(ctx, Math.round(x), Math.round(y), w, h, c);
    const frame = S.reduce ? 0 : Math.floor(S.t / 500) % 4;
    ctx.drawImage(zoneBackground(spec.theme || 'flow', frame), 0, 0);

    const cs = state.cssScale || 1, em = Math.max(10, cs * 3.6);
    const fac = facilityState(m);
    const cells = new Map(), anchors = new Map(), weak = new Map(), links = [], tags = [], occupied = [], deferred = [];
    const refs = {};
    function collect(c) {
      if (!c) return;
      if (c.path) cells.set(c.path, c);
      (c.elems || []).forEach(collect); (c.fields || []).forEach(collect);
    }
    (mem.globals || []).forEach(collect);
    (mem.frames || []).forEach(f => (f.vars || []).forEach(collect));
    (mem.heap || []).forEach(b => collect(b.cell));
    const matches = (a, b) => !!a && !!b && (a === b || a.startsWith(b + '.') || a.startsWith(b + '['));
    const status = path => {
      if (step.error && (matches(step.error.path, path) || matches(path, step.error.path))) return 'error';
      if ((step.changed || []).some(p => matches(p, path))) return 'change';
      if ((step.reads || []).some(p => matches(p, path))) return 'read';
      return null;
    };
    const cls = path => { const st = status(path); return `var ${st ? `is-${st}` : ''}`; };
    const rectOf = (x, y, w, h) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
    // quiet: 위치만 등록하고 괄호는 그리지 않는다
    function mark(path, x, y, w, h, o) {
      if (!path) return;
      const op = o || {};
      const map = op.weak ? weak : anchors;
      if (!map.has(path)) map.set(path, rectOf(x, y, w, h));
      const st = op.quiet ? null : status(path);
      if (st) Px.brackets(ctx, x, y, w, h, st, S.t, S.reduce);
    }
    const anchorOf = path => anchors.get(path) || weak.get(path);

    // HTML 태그: 가운데 x 기준. 겹치면 가까운 빈자리로 옮긴다
    function tag(x, y, html, kind, o) {
      if (!html) return;
      const op = o || {}, isCell = /\bcell\b/.test(kind || '');
      const wCss = textEm(html) * em + (isCell ? 2 : 14), hCss = em * 1.3 + (isCell ? 0 : 6);
      const w = Math.min(W - 4, wCss / cs), h = hCss / cs;
      const anchor = op.anchor || 'top';
      let left = op.left ? x : x - w / 2;
      let top = anchor === 'bottom' ? y - h : anchor === 'mid' ? y - h / 2 : y;
      const fit = (l, t) => [Math.max(2, Math.min(W - w - 2, l)), Math.max(1, Math.min(H - h - 1, t))];
      [left, top] = fit(left, top);
      const hit = b => occupied.some(a => a.x < b.x + b.w + 1 && a.x + a.w + 1 > b.x && a.y < b.y + b.h + 0.5 && a.y + a.h + 0.5 > b.y);
      let box = { x: left, y: top, w, h };
      if (!isCell && !op.fixed && hit(box)) {
        let done = false;
        for (const dy of [h, -h, 2 * h, -2 * h, 3 * h, -3 * h]) {
          for (const dx of [0, w * 0.55, -w * 0.55, w * 1.1, -w * 1.1]) {
            const [l2, t2] = fit(left + dx, top + dy), cand = { x: l2, y: t2, w, h };
            if (!hit(cand)) { box = cand; done = true; break; }
          }
          if (done) break;
        }
      }
      occupied.push(box);
      tags.push(isCell
        ? { x: box.x + w / 2, y: box.y + h / 2, anchor: 'mid', cls: kind, html }
        : { x: box.x + w / 2, y: box.y, anchor: 'top', cls: kind || 'var', html });
    }
    // 메모리에 아직(또는 이 프로그램에) 없는 변수는 '–', 만들었지만 값을 넣지 않은 변수는 '?'
    const show = c => c ? (c.shown != null ? String(c.shown) : c.value != null ? String(c.value) : '?') : '–';
    const named = (path, c) => `<code>${esc(path || '')}</code> <b>${esc(show(c))}</b>`;
    const badge = path => {
      const st = status(path);
      return st === 'change' || st === 'read' ? ` <em class="b-${st}">${esc(word(st === 'change' ? 'changed' : 'read'))}</em>` : '';
    };
    const truthy = v => v !== undefined && v !== null && v !== '' && v !== 0 && v !== '0' && v !== false && v !== 'false' && v !== '?';
    const sprite = (name, x, y) => Px.drawRows(ctx, Px.ITEMS[name], Math.round(x), Math.round(y));
    const box = (x, y, w, h, color, hi) => { P(x, y, w, h, 'k'); P(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2), color || 'd'); if (hi) P(x + 1, y + 1, Math.max(0, w - 2), 1, hi); };
    const tween = (path, c) => {
      let n = c && Number(c.value);
      const d = step.delta && step.delta[path];
      if (d && d.from != null && Number.isFinite(Number(d.from)) && Number.isFinite(n)) n = Number(d.from) + (n - Number(d.from)) * S.p;
      return Number.isFinite(n) ? n : undefined;
    };
    const loopsDone = (m.past || []).reduce((n, s) => n + (s.events || []).filter(e => e.type === 'loop' && e.cond).length, 0);
    const outOfBounds = step.error && step.error.code === 'indexOutOfBounds' ? step.error : null;
    const errorPhase = m.phase === 'runtimeError' || m.phase === 'compileError';
    const heapIds = new Set();

    // 크기가 있는 위젯 하나에 이름표를 붙인다(label 속성)
    const nameTag = (a, cx, y, anchor) => { if (a.label) tag(cx, y, esc(tr(a.label)), 'label', { anchor: anchor || 'bottom' }); };

    const order = (spec.widgets || []);
    const back = a => a.type === 'zone' || a.type === 'prop' || a.type === 'wire';
    const widgets = order.filter(back).concat(order.filter(a => !back(a)));
    for (const a of widgets) {
      const x = Math.round(a.x || 0), y = Math.round(a.y || 0), path = a.path, c = cells.get(path);
      switch (a.type) {
        case 'wire': {
          const on = (a.on || []).some(p => status(p) && status(p) !== 'error');
          Px.cable(ctx, a.pts, on, S.t, S.reduce, a.color || 'y', spec.theme === 'flow' ? 'k' : 'g');
          break;
        }
        case 'zone': Px.floorDeco(ctx, a.kind, x, y, a.w || 32, a.h || 16); break;
        case 'prop': Px.prop(ctx, a.kind, x, y); break;
        case 'label': tag(x, y, esc(tr(a.text || a.label)), 'label'); break;
        case 'value': {
          Px.consolePlate(ctx, x, y, a.icon || 'chip');
          mark(path, x, y, 18, 14);
          if (a.side) tag(x + 20, y + 7, named(path, c) + badge(path), cls(path), { left: true, anchor: 'mid' });
          else tag(x + 9, y + 16, named(path, c) + badge(path), cls(path));
          nameTag(a, x + 9, y - 1);
          break;
        }
        case 'robot': {
          const bp = a.battery && a.battery.path;
          const delta = step.delta && step.delta[bp];
          const active = delta && Number(delta.to) > Number(delta.from) ? 'charge' :
            status(path || bp) === 'change' || events.some(e => e.type === 'call' && e.object === path) ? 'work' : null;
          Px.pad(ctx, x - 3, y + 13, 22);
          Px.robot(ctx, x, y, Object.assign({ body: a.body || 'c' }, Px.robotFrame(S.robotState({ active }), S.t, S.reduce)));
          mark(path, x, y, 16, 16);
          if (bp) {
            const bc = cells.get(bp), lv = tween(bp, bc);
            Px.battery(ctx, x + 21, y + 1, 6, 15, lv === undefined ? undefined : lv / (a.battery.max || 100));
            mark(bp, x + 21, y + 1, 6, 15);
          }
          if (a.name || a.label) tag(x + 8, y + 18, esc(a.name || tr(a.label)), 'label');
          break;
        }
        case 'battery': {
          const lv = tween(path, c), bw = a.w || 10, bh = a.h || 20, v = lv === undefined ? undefined : lv / (a.max || 100);
          if (bw > bh) Px.batteryH(ctx, x, y, bw, bh, v, status(path) === 'change'); else Px.battery(ctx, x, y, bw, bh, v);
          mark(path, x, y, bw, bh);
          tag(x + bw / 2, y + bh + 3, named(path, c) + badge(path), cls(path));
          nameTag(a, x + bw / 2, y - 3);
          break;
        }
        case 'door': {
          const now = truthy(c && c.value);
          const d = step.delta && step.delta[path];
          let amount = now ? 1 : 0;
          if (d && d.from != null && S.rawP < 1 && truthy(d.from) !== now) amount = now ? S.p : 1 - S.p;
          Px.door(ctx, x, y, amount);
          mark(path, x, y, 16, 22);
          tag(x + 8, y + 24, `<code>${esc(path || '')}</code> <b>${esc(word(now ? 'open' : 'closed'))}</b>${badge(path)}`, cls(path));
          nameTag(a, x + 8, y - 3);
          break;
        }
        case 'facility': {
          const [fw, fh] = SIZES[a.kind] || SIZES.building, on = fac !== 'broken';
          if (a.kind === 'generator') Px.generator(ctx, x, y, on, S.t, S.reduce);
          else if (a.kind === 'tower') Px.tower(ctx, x, y, on, S.t, S.reduce);
          else if (a.kind === 'machine') Px.machine(ctx, x, y, fac, S.t, S.reduce);
          else if (a.kind === 'gate') Px.gate(ctx, x, y, fac === 'restored' ? 1 : fac === 'working' ? 0.5 : 0);
          else if (a.kind === 'workshop') Px.workshop(ctx, x, y, fac, S.t, S.reduce);
          else Px.building(ctx, x, y, fac, S.t, S.reduce);
          mark(path, x, y, fw, fh);
          if (m.phase === 'compileError') Px.brackets(ctx, x, y, fw, fh, 'error', S.t, S.reduce);
          if (m.phase === 'pass' && S.successAge < SUCCESS_MS && !S.reduce) {
            const f = Math.floor(S.successAge / 150);
            Px.sparkle(ctx, x + 4 + (f * 9) % Math.max(6, fw - 8), y + 4 + (f % 3) * 3, f);
          }
          const text = (a.label ? `${esc(tr(a.label))} · ` : '') + esc(facilityText(fac));
          tag(x + fw / 2, y + fh + 2, text, `label st-${fac}`);
          break;
        }
        case 'monitor': {
          const w = a.w || 48, h = a.h || 24;
          Px.monitor(ctx, x, y, w, h, true, errorPhase);
          refs.monitor = rectOf(x, y, w, h);
          const lineH = em * 1.3 / cs;
          tags.push(screenTag(S, x + 2, y + 2, w - 4, h - 5, { lines: Math.max(1, Math.min(4, Math.floor((h - 7) / lineH))) }));
          occupied.push({ x, y, w, h: h + 2 });
          if (step.kind === 'cout') { Px.brackets(ctx, x, y, w, h, 'output', S.t, S.reduce); tag(x + w / 2, y - 1, `<em class="b-output">${esc(word('output'))}</em>`, 'var is-output', { anchor: 'bottom' }); }
          nameTag(a, x + w / 2, y + h + 3, 'top');
          break;
        }
        case 'keyboard': {
          const reading = step.kind === 'cin' || (step.inputs || []).length > 0 || events.some(e => e.fn === 'getline');
          Px.terminal(ctx, x, y, reading && S.rawP < 1, S.t, S.reduce);
          refs.terminal = rectOf(x, y, 24, 14);
          if (reading) Px.brackets(ctx, x, y, 24, 14, 'read', S.t, S.reduce);
          const typed = (step.inputs || []).map(i => i.text).join(' ') || (m.input != null ? String(m.input).trim() : '');
          const shownText = typed.replace(/\n/g, ' ↵ ');
          tag(x + 12, y + 16, `${esc(word('input'))}${shownText ? ` <code>${esc(shownText.length > 16 ? `${shownText.slice(0, 15)}…` : shownText)}</code>` : ''}`, 'var');
          break;
        }
        case 'conveyor': {
          const len = a.length || 40, pitch = 10;
          const nowLoop = events.some(e => e.type === 'loop' && e.cond) ? 1 : 0;
          const done = loopsDone - nowLoop;
          const L = done + nowLoop * S.p;
          Px.belt(ctx, x, y, len, L * pitch, nowLoop && S.rawP < 1);
          ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y - 14, len - 4, 20); ctx.clip();
          for (let k = 0; k < Math.ceil(L); k++) {
            const px = x + 3 + (L - k - 1) * pitch;
            if (px > x + len - 12) continue;
            Px.crate(ctx, Math.round(px), y - 5, 9, 9, k % 2 ? { body: 'y', dark: 'o' } : null);
          }
          ctx.restore();
          mark(path, x, y - 5, len, 17);
          if (path) tag(x + len / 2, y + 14, named(path, c) + badge(path), cls(path));
          nameTag(a, x + len / 2, y - 10);
          break;
        }
        case 'array': case 'grid': case 'chars': {
          const size = a.cell || 14, pitch = size + 2, kindShow = a.type === 'chars' ? 'char' : (a.display || 'crate');
          let rows = a.type === 'grid' ? (c && c.elems || []) : [c];
          let list = rows.map(row => row && row.elems || []);
          if (a.type === 'chars' && c && !list[0].length && typeof c.value === 'string') list = [Array.from(c.value + '\0', (v, i) => ({ path: `${path}[${i}]`, shown: v === '\0' ? '\\0' : v }))];
          if (!list.some(l => l.length) && a.slots) {
            const r = a.type === 'grid' ? (a.rows || 2) : 1;
            list = Array.from({ length: r }, () => Array.from({ length: a.slots }, () => null));
          }
          const cols = Math.max(1, ...list.map(l => l.length));
          const totalW = cols * pitch - 2, rowPitch = a.type === 'grid' ? size + 8 : size + 12;
          list.forEach((row, r) => {
            const ry = y + r * rowPitch, lastRow = r === list.length - 1;
            row.forEach((el, i) => {
              const ex = x + i * pitch, ep = el && el.path || (a.type === 'grid' ? `${path}[${r}][${i}]` : `${path}[${i}]`);
              const raw = el ? show(el) : '';
              const text = raw === '\0' ? '\\0' : raw;
              let ink = false;
              if (!el) Px.crate(ctx, ex, ry, size, size, { ghost: true });
              else if (kindShow === 'char') { box(ex, ry, size, size, raw === '\0' || raw === '\\0' ? 'v' : 'w', raw === '\0' || raw === '\\0' ? 'r' : 'l'); ink = !(raw === '\0' || raw === '\\0'); }
              else if (kindShow === 'number') { box(ex, ry, size, size, 'b', 'B'); }
              else if (kindShow === 'bar') {
                box(ex, ry, size, size, 'd');
                const bh = Math.max(0, Math.min(size - 4, Math.round(Number(el.value) / (a.max || 100) * (size - 4))));
                P(ex + 2, ry + size - 2 - bh, size - 4, bh, 'G');
              } else Px.crate(ctx, ex, ry, size, size);
              if (el) {
                mark(ep, ex, ry, size, size);
                const st = status(ep);
                tag(ex + size / 2, ry + size / 2, esc(text), `cell ${ink ? 'ink' : ''} ${st ? `is-${st}` : ''}`, { anchor: 'mid' });
              }
              if (a.type !== 'grid' || lastRow) Px.drawText(ctx, String(i), ex + Math.floor((size - (String(i).length * 4 - 1)) / 2), ry + size + (kindShow === 'crate' ? 7 : 2), 'l');
            });
            if (a.type === 'grid') Px.drawText(ctx, String(r), x - 6, ry + Math.floor((size - 5) / 2), 'l');
            if (kindShow === 'crate' && row.length) Px.shelfBoard(ctx, x - 2, ry + size, row.length * pitch + 2);
          });
          mark(path, x, y, totalW, list.length * rowPitch - 10, { quiet: true });
          if (outOfBounds && (matches(outOfBounds.path, path) || matches(path, outOfBounds.path))) {
            const idx = Number.isFinite(Number(outOfBounds.index)) ? Number(outOfBounds.index) : cols;
            const ex = x + Math.max(-1, Math.min(cols + 1, idx)) * pitch;
            Px.crate(ctx, ex, y, size, size, { ghost: true });
            P(ex + 2, y + 2, size - 4, 1, 'r'); P(ex + 2, y + size - 3, size - 4, 1, 'r');
            Px.drawText(ctx, 'X', ex + Math.floor(size / 2) - 1, y + Math.floor(size / 2) - 2, 'r');
            tag(ex + size / 2, y - 2, `${esc(word('bounds'))}${outOfBounds.index != null ? ` <code>${esc(outOfBounds.index)}</code>` : ''}`, 'label st-fail', { anchor: 'bottom' });
          }
          if (a.tagBelow) tag(x + totalW / 2, y + (list.length - 1) * rowPitch + size + 13, `<code>${esc(path || '')}</code>${badge(path)}`, `label dim ${cls(path)}`, { anchor: 'top' });
          else tag(x + totalW / 2, y - 2, `<code>${esc(path || '')}</code>${badge(path)}`, `label dim ${cls(path)}`, { anchor: 'bottom' });
          nameTag(a, x + totalW / 2, y + list.length * rowPitch - 7, 'top');
          break;
        }
        case 'pointer': {
          const aim = !!(c && c.target);
          Px.pointerBox(ctx, x, y, aim);
          mark(path, x, y, 18, 10);
          let text = named(path, c);
          if (c && !c.target && !/null/i.test(show(c))) text += ` ${esc(word('null'))}`;
          if (c && c.dangling) text += ` ${esc(word('dangling'))}`;
          tag(x + 9, y + 12, text + badge(path), cls(path));
          if (c && c.target) links.push({ from: { x: x + 18, y: y + 5 }, target: c.target, broken: c.dangling, path });
          else if (c) Px.ground(ctx, x + 20, y + 1);
          nameTag(a, x + 9, y - 2);
          break;
        }
        case 'stack': {
          const frames = mem.frames || [], sw = a.w || 75, sh = a.h || 48;
          const rowH = Math.max(12, Math.min(18, Math.floor(sh / Math.max(3, frames.length))));
          const slots = Math.max(frames.length, Math.floor(sh / rowH));
          P(x - 1, y + sh, sw + 2, 2, 'k');
          for (let i = 0; i < slots; i++) {
            const ry = y + sh - (i + 1) * rowH;
            if (i >= frames.length) { Px.crate(ctx, x, ry, sw, rowH - 1, { ghost: true }); continue; }
            const f = frames[i], top = i === frames.length - 1;
            Px.stackRoom(ctx, x, ry, sw, rowH - 1, top);
            const parts = (f.vars || []).map(v => {
              const st = status(v.path), mk = v.kind === 'ref' ? '&' : '';
              return `<span class="hl ${st === 'change' ? 'change' : st === 'read' ? 'read' : ''}">${mk}${esc(v.name)} <b>${esc(show(v))}</b></span>`;
            });
            tag(x + sw / 2, ry + 2, `<code>${esc(f.fn || f.key || '')}</code>${parts.length ? ' · ' : ''}${parts.join(' ')}`, 'var', { fixed: true });
            (f.vars || []).forEach((v, j) => {
              const vx = x + 3 + j * 8, vy = ry + rowH - 8;
              P(vx, vy, 6, 4, v.kind === 'ref' ? 's' : 'l'); P(vx, vy + 3, 6, 1, 'k');
              mark(v.path, vx, vy, 6, 4, { weak: true });
              if (v.kind === 'ref' && v.target) links.push({ from: { x: vx + 6, y: vy + 2 }, target: v.target, broken: v.dangling, path: v.path });
            });
          }
          break;
        }
        case 'objects': {
          const freed = (mem.heap || []).filter(b => b.freed).map(b => b.id);
          const objects = Array.from(cells.values()).filter(o => o.kind === 'object' && !freed.some(id => matches(o.path, id)) && (!a.class || o.class === a.class || (o.bases || []).includes(a.class)));
          const ow = a.w || 88, px = a.pitchX || 32, py = a.pitchY || 38, cols = Math.max(1, Math.floor(ow / px));
          for (let i = objects.length; i < (a.slots || 0); i++) {
            const gx = x + (i % cols) * px, gy = y + Math.floor(i / cols) * py;
            Px.pad(ctx, gx - 3, gy + 13, 22); Px.crate(ctx, gx, gy, 16, 13, { ghost: true });
          }
          objects.forEach((o, i) => {
            const ox = x + (i % cols) * px, born = events.some(e => e.type === 'construct' && e.path === o.path);
            let oy = y + Math.floor(i / cols) * py;
            const active = events.some(e => (e.type === 'call' || e.type === 'dispatch') && e.object === o.path);
            const dying = events.some(e => e.type === 'destruct' && e.path === o.path);
            Px.pad(ctx, ox - 3, oy + 13, 22);
            const lift = born && !S.reduce ? Math.round((1 - S.p) * 14) : 0;
            const body = (o.bases || []).length > 1 ? 'g' : (o.bases || []).length ? 'o' : (a.body || 'c');
            const rs = dying ? 'sad' : S.robotState({ active: active || born ? 'work' : null });
            Px.robot(ctx, ox, oy - lift, Object.assign({ body }, Px.robotFrame(rs, S.t, S.reduce)));
            mark(o.path, ox, oy, 16, 16);
            if (active) Px.brackets(ctx, ox, oy, 16, 16, 'change', S.t, S.reduce);
            if (born && !S.reduce && S.rawP < 1) Px.sparkle(ctx, ox + 3 + (Math.floor(S.t / 120) % 3) * 5, oy + 3, Math.floor(S.t / 120));
            (o.fields || []).forEach(field => { if (!anchors.has(field.path)) anchors.set(field.path, rectOf(ox + 4, oy + 8, 8, 6)); });
            if (a.battery) {
              const field = (o.fields || []).find(f => f.name === a.battery);
              if (field) { const lv = tween(field.path, field); Px.battery(ctx, ox + 21, oy + 1, 6, 15, lv === undefined ? undefined : lv / (a.max || 100)); mark(field.path, ox + 21, oy + 1, 6, 15); }
            }
            let label = `<code>${esc(o.path)}</code> <i>${esc(o.class || o.type || '')}</i>${badge(o.path)}`;
            const ev = events.find(e => e.type === 'dispatch' && e.object === o.path);
            if (ev) label += ` <em class="b-output">${esc(word(ev.virtual ? 'virtual' : 'direct'))}</em>`;
            tag(ox + 8, oy + 19, label, cls(o.path));
          });
          break;
        }
        case 'heap': {
          const blocks = mem.heap || [], hw = a.w || 80, px = a.pitchX || 26, py = a.pitchY || 32, cols = Math.max(1, Math.floor(hw / px));
          const nSlots = Math.max(a.slots || 3, blocks.length);
          for (let i = 0; i < nSlots; i++) Px.floorDeco(ctx, 'bay', x + (i % cols) * px - 2, y + Math.floor(i / cols) * py - 2, 22, 24);
          const ended = step.kind === 'end' || (step.kind === 'return' && !(step.depth > 0));
          blocks.forEach((b, i) => {
            const bx = x + (i % cols) * px, by = y + Math.floor(i / cols) * py;
            const count = b.cell && b.cell.elems ? b.cell.elems.length : 1;
            const stateName = b.freed ? 'freed' : ended ? 'leaked' : 'alive';
            Px.bay(ctx, bx, by, stateName, S.t, S.reduce, count);
            heapIds.add(b.id);
            mark(b.id, bx, by, 18, 20);
            (function anchorTree(cell, ax, ay) { if (!cell) return; if (cell.path && !anchors.has(cell.path)) anchors.set(cell.path, rectOf(ax, ay, 18, 20)); (cell.fields || []).forEach(f => anchorTree(f, ax, ay)); (cell.elems || []).forEach(f => anchorTree(f, ax, ay)); })(b.cell, bx, by);
            const value = b.freed ? '' : b.cell ? ` <b>${esc(show(b.cell))}</b>` : '';
            tag(bx + 9, by + 22, `<code>${esc(b.id)}</code> ${esc(word(stateName))}${value}`, stateName === 'leaked' ? 'label st-fail' : stateName === 'freed' ? 'label dim' : 'var');
          });
          break;
        }
        case 'files': {
          const entries = Object.entries(mem.files || {}), fe = events.find(e => e.type === 'file');
          Px.cabinetBig(ctx, x, y, entries.length);
          anchors.set('files', rectOf(x, y, 18, 24));
          if (fe) Px.brackets(ctx, x, y + 2, 18, 22, fe.op === 'read' ? 'read' : 'change', S.t, S.reduce);
          if (entries.length) entries.forEach(([name, content], i) => tag(x + 22, y + 3 + i * 9, `<code>${esc(name)}</code> <b>${esc(content).replace(/\n/g, ' ↵ ') || esc(word('empty'))}</b>`, 'var', { left: true, fixed: true }));
          else tag(x + 9, y + 26, esc(word('empty')), 'label dim');
          break;
        }
        case 'set': {
          const elems = c && c.elems || [], n = Math.max(elems.length, a.slots || 3), bw = n * 14 + 4;
          Px.sortBin(ctx, x, y + 6, bw, 18);
          elems.forEach((el, i) => {
            const ex = x + 2 + i * 14, ey = y + 9;
            Px.crate(ctx, ex, ey, 12, 12, { body: 'c', dark: 'B' });
            mark(el.path || `${path}[${i}]`, ex, ey, 12, 12);
            const st = status(el.path || `${path}[${i}]`);
            tag(ex + 6, ey + 6, esc(show(el)), `cell ink ${st ? `is-${st}` : ''}`, { anchor: 'mid' });
          });
          mark(path, x, y + 6, bw, 18, { quiet: true });
          tag(x + bw / 2, y + 4, `<code>${esc(path || '')}</code> <i>${esc(word('sorted'))} →</i>${badge(path)}`, `label dim ${cls(path)}`, { anchor: 'bottom' });
          break;
        }
        case 'alarm': {
          // 지금까지 실행된 단계 중 마지막 throw/catch 를 보여 준다(past 는 현재 단계 포함). 이번 단계에서 일어났을 때만 강조한다.
          const seen = (m.past || []).flatMap(p => p.events || []).concat(m.past && m.past.length ? [] : events);
          const ev = [...seen].reverse().find(e => e.type === 'catch' || e.type === 'throw');
          const caught = ev && ev.type === 'catch', thrown = ev && ev.type === 'throw';
          Px.sirenLight(ctx, x, y, caught ? 'caught' : thrown ? 'thrown' : 'idle', S.t, S.reduce);
          if (events.some(e => e.type === 'throw' || e.type === 'catch')) Px.brackets(ctx, x, y, 16, 16, 'change', S.t, S.reduce);
          const text = ev ? `${esc(word(caught ? 'caught' : 'thrown'))}${ev.exception ? ` <code>${esc(ev.exception)}</code>` : ''}${ev.what ? ` ${esc(ev.what)}` : ''}` : esc(word('idle'));
          tag(x + 8, y + 18, text, ev ? (caught ? 'label st-ok' : 'label st-fail') : 'label dim');
          break;
        }
      }
    }

    // 입력은 단말에서 바뀐 변수로, 출력은 읽은 값에서 화면으로 날아간다
    if (!S.reduce && S.rawP < 1) {
      const fly = (from, to, itemName) => {
        const fx = from.cx - 4, fy = from.cy - 4, tx = to.cx - 4, ty = to.cy - 4, p = S.p;
        sprite(itemName, fx + (tx - fx) * p, fy + (ty - fy) * p - Math.sin(Math.PI * p) * 8);
      };
      const dest = anchorOf((step.changed || [])[0]);
      if ((step.kind === 'cin' || (step.inputs || []).length) && refs.terminal && dest) fly(refs.terminal, dest, 'letters');
      const src = anchorOf((step.reads || [])[0]);
      if (step.kind === 'cout' && refs.monitor && src) fly(src, refs.monitor, 'scroll');
    }

    for (const link of links) {
      const target = anchorOf(link.target), a = link.from;
      if (link.broken) {
        const end = Math.round(a.x + 8), ay = Math.round(a.y);
        Px.cable(ctx, [[Math.round(a.x), ay], [end, ay]], true, S.t, S.reduce, 'r');
        P(end, ay - 2, 1, 5, 'r'); P(end - 2, ay, 5, 1, 'r');
      } else if (target) {
        const ax = Math.round(a.x), ay = Math.round(a.y), ty = Math.round(target.cy);
        let pts, dir;
        if (target.y >= ay + 10 && target.w <= 20 && target.h <= 20 && target.cx >= ax + 3) {
          pts = [[ax, ay], [Math.round(target.cx), ay], [Math.round(target.cx), Math.round(target.y) - 1]]; dir = 2;
        } else if (target.y + target.h <= ay - 6 && target.w <= 20 && target.h <= 20 && target.cx >= ax + 3) {
          pts = [[ax, ay], [Math.round(target.cx), ay], [Math.round(target.cx), Math.round(target.y + target.h)]]; dir = -2;
        } else if (target.x >= ax + 3) {
          const mid = Math.round((ax + target.x) / 2), ex = Math.round(target.x) - 1;
          pts = [[ax, ay], [mid, ay], [mid, ty], [ex, ty]]; dir = 1;
        } else {
          const below = target.cy >= ay, by = Math.round(below ? target.y + target.h + 4 : target.y - 4), ex = Math.round(target.cx);
          pts = [[ax, ay], [ax + 3, ay], [ax + 3, by], [ex, by], [ex, Math.round(below ? target.y + target.h : target.y - 1)]]; dir = below ? -2 : 2;
          if (!below) dir = 2;
        }
        Px.cable(ctx, pts, !!(status(link.path) || status(link.target)), S.t, S.reduce, 's', 'c');
        const end = pts[pts.length - 1];
        Px.arrowHead(ctx, end[0], end[1], dir === -2 ? -2 : dir, 's');
      }
    }
    renderTags(tags);
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
    const badge = st === 'change' ? `<em class="b-change">${esc(global.I18N.t('scene.changed'))}</em>` : st === 'read' ? `<em class="b-read">${esc(global.I18N.t('scene.read'))}</em>` : '';
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
    if (m.phase === 'compileError') body = `<span class="scr-err">${esc(global.I18N.t(m.buildFail === 'link' ? 'scene.linkFailed' : 'scene.compileFailed'))}</span><span class="scr-dim">${esc(global.I18N.t('scene.noExecutable'))}</span>`;
    else if (!S.step && m.phase === 'edit') body = `<span class="scr-dim">${esc(o.idle || global.I18N.t('scene.waiting'))}</span>`;
    else body = shown.map((l) => `<span>${esc(l) || '&nbsp;'}</span>`).join('') || `<span class="scr-dim">${esc(global.I18N.t('scene.noOutput'))}</span>`;
    return { x, y, w, h, anchor: 'box', cls: `screen ${isOut ? 'is-output' : ''} ${o.big ? 'big' : ''}`, html: body };
  }

  function outputBadge(S, x, y) {
    if (!S.step || S.step.kind !== 'cout') return null;
    return { x, y, anchor: 'bottom', cls: 'var is-output', html: `<em class="b-output">${esc(global.I18N.t('scene.outputOnly'))}</em> ${esc(global.I18N.t('scene.variablesUnchanged'))}` };
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
      let dist = 'broken';
      if (m.phase === 'running') dist = 'working';
      else if (m.phase === 'pass' || (m.phase === 'edit' && m.restored)) dist = 'restored';
      const out = [
        label(30, 62, global.I18N.t('scene.generator'), 'top'),
        varTag(S, 'total', 30, 39, 'bottom'),
        label(62, 60, global.I18N.t('scene.distributorStatus', { status: facilityText(dist) }), 'top', `st-${dist}`),
        varTag(S, 'share', midX, 31, 'bottom') || label(midX, 31, global.I18N.t('scene.batteryShare'), 'bottom', 'dim'),
        varTag(S, 'robots', midX, 69, 'top') || label(midX, 69, global.I18N.t('scene.robotCount', { count: L.n }), 'top', 'dim'),
        screenTag(S, R13.mon[0] + 2, R13.mon[1] + 2, R13.mon[2] - 4, R13.mon[3] - 5, { idle: global.I18N.t('scene.coutScreen') }),
        outputBadge(S, R13.mon[0] + R13.mon[2] / 2, R13.mon[1] - 1),
      ];
      if (share !== undefined && S.rawP >= 1) {
        const lost = L.total - share * L.n;
        if (lost > 1e-9) out.push({ x: 62, y: 68, anchor: 'top', cls: 'var is-warn', html: `<em class="b-warn">${esc(global.I18N.t('scene.loss'))}</em> ${esc(global.I18N.t('scene.undistributedPower'))} <b>${esc(fmt(lost, 'double'))}</b>` });
        else if (lost < -1e-9) out.push({ x: 62, y: 68, anchor: 'top', cls: 'var is-warn', html: `<em class="b-warn">${esc(global.I18N.t('scene.excess'))}</em> ${esc(global.I18N.t('scene.powerNotInGenerator'))} <b>${esc(fmt(-lost, 'double'))}</b>` });
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
  const facilityText = (state) => global.I18N.t({ broken: 'scene.broken', working: 'scene.working', restored: 'scene.restored' }[state]);
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
        if (i === T.failAt) return label(x + w / 2, ty, global.I18N.t('scene.flowInterrupted', { label: c.label }), below ? 'top' : 'bottom', 'st-fail');
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
      const idle = fac === 'restored' ? global.I18N.t('scene.lastSignal', { target: m.target }) : global.I18N.t('scene.turnedOff');
      return [
        label(x + w / 2, y - 1, global.I18N.t('scene.targetSignal', { target: m.target }), 'bottom'),
        screenTag(S, x + 3, y + 3, w - 6, h - 7, { idle, lines: 3, big: true }),
        label(x + w / 2, y + h + 3, global.I18N.t('scene.controlScreenStatus', { status: facilityText(fac) }), 'top', `st-${fac}`),
        outputBadge(S, R12.robot[0] + 8, R12.robot[1] - 2),
        label(R12.mast[0] + 4, R12.mast[1] + 50, global.I18N.t('scene.antenna'), 'top', 'dim'),
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
        varTag(S, 'energy', bx + bw / 2, by - 3, 'bottom') || label(bx + bw / 2, by - 3, global.I18N.t('scene.batteryEnergy'), 'bottom', 'dim'),
        varTag(S, 'usage', R14.base[0] + 16, R14.base[1] - 9, 'bottom') || label(R14.base[0] + 16, R14.base[1] - 9, global.I18N.t('scene.operatingPowerUsage'), 'bottom', 'dim'),
        label(R14.base[0] + 16, R14.base[1] + 26, global.I18N.t('scene.baseStatus', { status: facilityText(base) }), 'top', `st-${base}`),
        label(R14.kb[0] + 8, R14.kb[1] + 9, global.I18N.t('scene.inputTerminal', { input: m.input ? `(${m.input})` : '' }), 'top', 'dim'),
        screenTag(S, R14.mon[0] + 2, R14.mon[1] + 2, R14.mon[2] - 4, R14.mon[3] - 5, { idle: global.I18N.t('scene.coutScreen') }),
        outputBadge(S, R14.mon[0] + R14.mon[2] / 2, R14.mon[1] - 1),
      ];
      if (e !== undefined && e < 0) out.push({ x: R14.base[0] + 16, y: R14.base[1] + 34, anchor: 'top', cls: 'var is-warn', html: `<em class="b-warn">${esc(global.I18N.t('scene.shortage'))}</em> ${esc(global.I18N.t('scene.notEnoughPower'))}` });
      return out;
    },
  };

  global.Scene = { mount, set, resize, setReduceMotion, SCENES, W, H, STEP_MS, helpers: { varTag, label, screenTag, outputBadge, fmt, esc } };
})(this);
