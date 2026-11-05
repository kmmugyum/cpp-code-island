/* 화면·진행·저장. 미션 데이터와 채점은 missions.js, C++ 실행은 cppsim.js, 장면 그림은 scene.js 가 맡는다. */
(function () {
  'use strict';

  const Sim = window.CppSim;
  const M = window.Missions;
  const Px = window.Pixel;
  const Scene = window.Scene;
  const Sfx = window.Sfx;
  const { MISSIONS, CHAPTERS, ERROR_TYPES, ERROR_LABEL } = M;

  const PROGRESS_KEY = 'cpp-code-island/progress/v1';
  const WORK_KEY = 'cpp-code-island/work/v1';
  const SETTINGS_KEY = 'cpp-code-island/settings/v1';
  const HINT_STEPS = ['관찰할 곳', '필요한 개념', '일부 코드', '해설'];
  const $ = (sel) => document.querySelector(sel);

  // ------------------------------------------------------------ storage

  let storageOk = true;
  function readStore(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      storageOk = false;
      return null;
    }
  }
  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  // ------------------------------------------------------------ settings

  const settings = Object.assign({ sound: false, motion: 'auto' }, readStore(SETTINGS_KEY) || {});
  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduceMotion = () => settings.motion === 'reduce' || (settings.motion === 'auto' && !!motionQuery && motionQuery.matches);
  function applySettings() {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion());
    Scene.setReduceMotion(reduceMotion());
    Sfx.setEnabled(settings.sound);
  }
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', () => { applySettings(); renderTools(); });

  // ------------------------------------------------------------ progress

  function emptyRecord() {
    return { status: 'none', applied: false, attempts: 0, hintLevel: 0, errors: {}, predictions: [], reflection: '' };
  }

  function emptyProgress() {
    const missions = {};
    for (const m of MISSIONS) missions[m.id] = emptyRecord();
    return { version: 1, missions, updatedAt: null };
  }

  function normalizeProgress(data) {
    if (!data || data.version !== 1 || typeof data.missions !== 'object' || data.missions === null) {
      throw new Error('C++ 코드섬 진도 파일(version 1)이 아닙니다.');
    }
    const out = emptyProgress();
    for (const m of MISSIONS) {
      const r = data.missions[m.id];
      if (!r || typeof r !== 'object') continue;
      const rec = out.missions[m.id];
      if (['none', 'trying', 'done'].includes(r.status)) rec.status = r.status;
      rec.applied = r.applied === true;
      rec.attempts = Number.isInteger(r.attempts) && r.attempts >= 0 ? r.attempts : 0;
      rec.hintLevel = Number.isInteger(r.hintLevel) ? Math.max(0, Math.min(4, r.hintLevel)) : 0;
      if (r.errors && typeof r.errors === 'object') {
        for (const [k, v] of Object.entries(r.errors)) if (k in ERROR_TYPES && Number.isInteger(v) && v > 0) rec.errors[k] = v;
      }
      if (Array.isArray(r.predictions)) rec.predictions = r.predictions.filter((p) => p && typeof p.q === 'string').slice(-20);
      if (typeof r.reflection === 'string') rec.reflection = r.reflection.slice(0, 500);
    }
    out.updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : null;
    return out;
  }

  let progress;
  try {
    const stored = readStore(PROGRESS_KEY);
    progress = stored ? normalizeProgress(stored) : emptyProgress();
  } catch (e) {
    progress = emptyProgress();
  }

  function saveProgress() {
    progress.updatedAt = new Date().toISOString();
    writeStore(PROGRESS_KEY, progress);
    renderSaveState();
  }

  const rec = (m) => progress.missions[m.id];
  function markTrying(m) { if (rec(m).status === 'none') rec(m).status = 'trying'; }
  function recordError(m, type) {
    if (!type) return;
    const r = rec(m);
    r.errors[type] = (r.errors[type] || 0) + 1;
  }

  // ------------------------------------------------------------ work state (미션별 작업 상태)

  function freshWork(m) {
    const w = { run: null, feedback: null, applyReport: null, successKey: null };
    if (m.kind === 'order') {
      w.placed = [];
      w.pool = shuffled(m.cards.map((c) => c.id));
      w.orderResult = null;
      w.lastCheck = null;
      w.quiz = {};
    }
    if (m.kind === 'blanks') {
      w.variant = 'base';
      w.choices = {};
      for (const v of m.variants) w.choices[v.id] = {};
      w.testIndex = 0;
      w.activeBlank = null;
    }
    if (m.kind === 'editor') {
      w.code = m.starter;
      w.editing = true;
      w.input = m.tests[0].input;
    }
    w.phase = m.predict ? 'predict' : 'task';
    w.predict = { answers: [], submitted: false, actual: null, revealed: false };
    return w;
  }

  function shuffled(ids) {
    const a = ids.slice();
    do {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
    } while (a.every((id, i) => id === ids[i]));
    return a;
  }

  const work = {};
  (function restoreWork() {
    const saved = readStore(WORK_KEY) || {};
    for (const m of MISSIONS) {
      const w = freshWork(m);
      const s = saved[m.id];
      if (s && typeof s === 'object') {
        if (m.kind === 'blanks' && s.choices && typeof s.choices === 'object') {
          for (const v of m.variants) {
            const c = s.choices[v.id] || {};
            for (const key of Object.keys(v.blanks)) {
              if (Number.isInteger(c[key]) && c[key] >= 0 && c[key] < v.blanks[key].length) w.choices[v.id][key] = c[key];
            }
          }
        }
        if (m.kind === 'editor' && typeof s.code === 'string') w.code = s.code;
        if (m.kind === 'editor' && typeof s.input === 'string') w.input = s.input;
        if (m.predict && s.predict && s.predict.submitted) {
          w.predict = { answers: Array.isArray(s.predict.answers) ? s.predict.answers : [], submitted: true, actual: s.predict.actual || null, revealed: true };
          w.phase = 'task';
        }
      }
      work[m.id] = w;
    }
  })();

  let saveWorkTimer = null;
  function saveWork() {
    clearTimeout(saveWorkTimer);
    saveWorkTimer = setTimeout(() => {
      const out = {};
      for (const m of MISSIONS) {
        const w = work[m.id];
        out[m.id] = { choices: w.choices, code: w.code, input: w.input, predict: w.predict };
      }
      writeStore(WORK_KEY, out);
    }, 300);
  }

  // ------------------------------------------------------------ ui state

  const ui = {
    missionId: firstOpenMission(),
    drawer: null, // hints | tools | lecture
    drawerMission: null,
    pane: 'code', // 좁은 화면의 탭: scene | code | result
    resultUnseen: false,
  };

  function firstOpenMission() {
    const m = MISSIONS.find((x) => progress.missions[x.id].status !== 'done');
    return (m || MISSIONS[0]).id;
  }

  const mission = () => MISSIONS.find((m) => m.id === ui.missionId);
  const W = () => work[ui.missionId];
  const narrow = () => window.matchMedia('(max-width: 599px)').matches;

  // ------------------------------------------------------------ helpers

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function icon(name, color, scale) {
    const s = scale || 2;
    return `<img class="px-ico" src="${Px.iconURL(name, s, color || 'k')}" width="${8 * s}" height="${8 * s}" alt="">`;
  }
  function itemImg(name, scale, mono) {
    const s = scale || 3;
    return `<img class="px-item" src="${Px.itemURL(name, s, mono)}" width="${8 * s}" height="${8 * s}" alt="">`;
  }
  function pixText(text, color, scale) {
    const s = scale || 3;
    return `<img class="px-text" src="${Px.textURL(text, s, color || 'k')}" height="${5 * s}" alt="${esc(text)}">`;
  }

  const KEYWORDS = new Set(['int', 'double', 'char', 'bool', 'void', 'return', 'using', 'namespace', 'true', 'false']);
  const LIBNAMES = new Set(['std', 'cout', 'cin', 'endl', 'main']);

  // marks: { change: [이름], read: [이름] } — 실행 중인 줄에서 바뀐/읽은 변수 이름을 표시한다
  function highlight(text, marks) {
    const re = /(\/\/.*$)|("(?:\\.|[^"\\])*"?)|('(?:\\.|[^'\\])*'?)|(#\s*\w+\s*<[^>]*>?|#\s*\w+)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      const t = m[0];
      let cls = null;
      if (m[1]) cls = 'c-com';
      else if (m[2] || m[3]) cls = 'c-str';
      else if (m[4]) cls = 'c-pp';
      else if (m[5]) cls = 'c-num';
      else if (KEYWORDS.has(t)) cls = 'c-kw';
      else if (LIBNAMES.has(t)) cls = 'c-lib';
      if (m[6] && marks && marks.change.includes(t)) out += `<mark class="tok-change" title="이 줄에서 값이 바뀜">${esc(t)}</mark>`;
      else if (m[6] && marks && marks.read.includes(t)) out += `<mark class="tok-read" title="이 줄에서 값을 읽기만 함">${esc(t)}</mark>`;
      else out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t);
      last = m.index + t.length;
    }
    return out + esc(text.slice(last));
  }

  function codeView(lines, opts) {
    const o = opts || {};
    return `<ol class="code" aria-label="코드">${lines.map((line, i) => {
      const no = i + 1;
      const active = no === o.activeLine;
      const error = no === o.errorLine;
      const mk = error ? `${icon('cross', 'r')}<span class="sr">오류 줄</span>` : active ? `${icon('arrow', 'y')}<span class="sr">현재 실행 줄</span>` : '';
      return `<li class="${active ? 'active' : ''} ${error ? 'error' : ''}" data-line="${no}"><span class="gut"><span class="mk">${mk}</span><span class="ln">${no}</span></span><code>${renderLine(line, o, active ? o.marks : null)}</code></li>`;
    }).join('')}</ol>`;
  }

  function renderLine(line, o, marks) {
    if (!o.blanks) return highlight(line, marks) || ' ';
    const parts = line.split(/\{(\w+)\}/);
    let html = '';
    parts.forEach((part, i) => {
      if (i % 2 === 0) { html += highlight(part, marks); return; }
      if (o.blanks[part]) {
        const idx = o.choices[part];
        const opt = idx === undefined ? null : o.blanks[part][idx];
        const shown = opt ? (opt.code === '' ? '‹비움›' : opt.code) : '▢';
        const n = Object.keys(o.blanks).indexOf(part) + 1;
        html += `<button class="blank ${opt ? 'filled' : 'empty'} ${o.activeBlank === part ? 'active' : ''}" data-blank="${part}" aria-pressed="${o.activeBlank === part}" aria-label="빈칸 ${n}: ${opt ? esc(shown) : '비어 있음'}${o.activeBlank === part ? ' (선택됨)' : ''}">${esc(shown)}</button>`;
      } else if (o.params && part in o.params) {
        html += `<span class="param" title="검사 입력값">${esc(o.params[part])}</span>`;
      } else {
        html += esc(`{${part}}`);
      }
    });
    return html || ' ';
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // ------------------------------------------------------------ running code

  function currentVariant(m, w) {
    return m.variants.find((v) => v.id === w.variant);
  }

  function currentTest(m, w) {
    if (m.kind === 'editor') {
      const fixed = m.tests.find((t) => t.input === w.input.trim());
      return fixed || { input: w.input, label: `입력 ${w.input.trim() || '(없음)'}` };
    }
    const v = currentVariant(m, w);
    return v.tests ? v.tests[w.testIndex] : null;
  }

  function sourceFor(m, w, test) {
    if (m.kind === 'editor') return w.code;
    const v = currentVariant(m, w);
    return M.buildBlankSource(v, w.choices[v.id], test ? test.params : null);
  }

  function totalSteps(run) {
    return run.result.steps.length + (run.result.error && run.result.stage === 'runtime' ? 1 : 0);
  }

  // ---- 재생기: 타이머는 하나뿐이고, 모든 수동 조작이 먼저 멈춘다
  const player = { timer: null };
  let runCounter = 0;
  const isPlaying = () => !!player.timer;
  function stopPlay() {
    clearTimeout(player.timer);
    player.timer = null;
  }
  function schedule() {
    stopPlay();
    player.timer = setTimeout(tick, reduceMotion() ? 600 : Scene.STEP_MS + 400);
  }
  function tick() {
    player.timer = null;
    const w = W();
    if (!w.run || w.run.stepIndex < 0) { render(); return; }
    const last = totalSteps(w.run) - 1;
    if (w.run.stepIndex >= last) { render(); return; }
    if (w.run.stepIndex + 1 < last) schedule();
    stepTo(w.run.stepIndex + 1);
  }

  function atEnd(run) {
    return run && run.stepIndex >= totalSteps(run) - 1;
  }

  function play() {
    const m = mission();
    const w = W();
    if (isPlaying()) { stopPlay(); render(); return; }
    if (m.kind === 'order') { checkOrderNow(); return; }
    if (w.phase === 'predict') {
      if (!w.run) return;
      if (atEnd(w.run)) { w.run.stepIndex = 0; w.run.key = ++runCounter; }
      if (!atEnd(w.run)) schedule();
      render();
      return;
    }
    if (!w.run || w.run.stepIndex < 0 || atEnd(w.run)) { startRun(true); return; }
    schedule();
    render();
  }

  function stepForward() {
    const m = mission();
    const w = W();
    stopPlay();
    if (m.kind === 'order') return;
    if (!w.run) { if (w.phase !== 'predict') startRun(false); return; }
    stepTo(w.run.stepIndex + 1);
  }

  function resetRun() {
    const m = mission();
    const w = W();
    stopPlay();
    if (m.kind === 'order') {
      w.pool = w.pool.concat(w.placed.filter(Boolean));
      w.placed = [];
      w.orderResult = null;
      w.lastCheck = null;
      w.feedback = null;
      render();
      return;
    }
    if (w.phase === 'predict') {
      if (w.run) { w.run.stepIndex = 0; w.run.key = ++runCounter; }
    } else {
      w.run = null;
      w.feedback = null;
      w.applyReport = null;
      w.successKey = null;
      if (m.kind === 'editor') w.editing = true;
    }
    render();
  }

  function invalidateRun(w) {
    stopPlay();
    w.run = null;
    w.feedback = null;
    w.applyReport = null;
    w.successKey = null;
  }

  function startRun(auto) {
    const m = mission();
    const w = W();
    stopPlay();
    if (m.kind === 'blanks') {
      const v = currentVariant(m, w);
      if (!M.blanksFilled(v, w.choices[v.id])) {
        const firstEmpty = Object.keys(v.blanks).find((k) => w.choices[v.id][k] === undefined);
        w.activeBlank = firstEmpty;
        w.feedback = { tone: 'info', title: '빈칸이 남아 있습니다', message: '▢ 칸을 모두 채운 뒤 실행하세요. 비어 있는 첫 칸을 선택해 두었습니다.', fix: { type: 'blank', key: firstEmpty } };
        render();
        return;
      }
    }
    const test = currentTest(m, w);
    const source = sourceFor(m, w, test);
    const result = Sim.run(source, { input: test && test.input !== undefined ? test.input : '' });
    rec(m).attempts += 1;
    markTrying(m);
    w.applyReport = null;
    w.successKey = null;
    w.run = { kind: 'task', key: ++runCounter, source, result, test, stepIndex: 0, graded: false, pass: false };
    if (result.stage === 'compile' || result.stage === 'link') {
      w.run.stepIndex = -1;
      gradeRun(m, w);
    } else if (totalSteps(w.run) === 1) {
      gradeRun(m, w);
    } else {
      w.feedback = null;
      sfxForStep(w);
      if (auto) schedule();
    }
    if (m.kind === 'editor' && w.run.stepIndex >= 0) w.editing = false;
    saveProgress();
    render();
  }

  function sfxForStep(w) {
    const st = stepState(w);
    if (!st) return;
    if (st.error) Sfx.play('error');
    else Sfx.play(st.changed.length ? 'change' : 'step');
  }

  function stepTo(index) {
    const m = mission();
    const w = W();
    if (!w.run || w.run.stepIndex < 0) return;
    const last = totalSteps(w.run) - 1;
    const next = Math.max(0, Math.min(last, index));
    if (next === w.run.stepIndex) { render(); return; }
    w.run.stepIndex = next;
    if (next === last && w.run.kind === 'snippet') w.predict.revealed = true;
    if (next === last && !w.run.graded && w.run.kind === 'task') gradeRun(m, w);
    else sfxForStep(w);
    render();
  }

  function gradeRun(m, w) {
    stopPlay();
    const run = w.run;
    run.graded = true;
    const result = run.result;
    let verdict;
    if (m.id === '1-2') verdict = M.checkSignal(currentVariant(m, w), result);
    else if (m.id === '1-3') verdict = M.checkShare(run.test, result);
    else verdict = M.checkBase(run.test, result);
    run.pass = verdict.pass;

    if (!verdict.pass) {
      w.feedback = failureFeedback(m, w, verdict);
      Sfx.play('error');
      noteResult();
      saveProgress();
      return;
    }

    const r = rec(m);
    const isBaseRun = m.id === '1-2' ? w.variant === 'base' : m.id === '1-3' ? w.testIndex === 0 : true;
    const firstDone = isBaseRun && r.status !== 'done';
    if (isBaseRun) r.status = 'done';
    if (m.id === '1-2' && w.variant === 'apply') r.applied = true;
    w.successKey = Date.now();
    Sfx.play('success');

    const details = [];
    if (m.id === '1-4' && w.predict.submitted) {
      const guess = w.predict.answers[0];
      details.push(`처음 예상한 잔량: ${guess === '' || guess === undefined ? '(빈칸)' : guess} · 입력 100 의 실제 잔량: 65`);
    }
    let next;
    if (m.id === '1-2') {
      next = w.variant === 'base' ? '응용 신호 GO 를 보내 보세요. 작업대 위의 "응용: GO" 탭이 열렸습니다.' : '두 신호 모두 보냈습니다. 다음 미션으로 이동하세요.';
    } else if (r.applied) {
      next = '이 미션은 적용 확인까지 끝났습니다.';
    } else {
      next = '"다른 입력으로 검사"로 값이 달라져도 맞는지 확인하세요.';
    }
    w.feedback = {
      tone: 'success',
      title: firstDone ? `미션 완료 · ${m.reward.name} 획득` : '성공',
      message: verdict.message,
      details,
      reuse: m.reuse,
      next,
      action: m.id === '1-2' && w.variant === 'base' ? { label: '응용: GO 로 가기', variant: 'apply' } : (!r.applied && m.id !== '1-2' ? { label: '다른 입력으로 검사', apply: true } : null),
      reflect: r.status === 'done',
    };
    noteResult();
    saveProgress();
  }

  // 오답일 때 고칠 위치(빈칸 / 줄 / 카드 칸)를 고른다
  function fixTarget(m, w, verdict) {
    if (m.kind === 'blanks') {
      const v = currentVariant(m, w);
      const keys = Object.keys(v.blanks);
      const byWhy = keys.find((k) => { const o = v.blanks[k][w.choices[v.id][k]]; return o && o.why; });
      if (verdict.kind === 'logic' && byWhy) return { type: 'blank', key: byWhy };
      if (verdict.line) {
        const lineText = v.template.split('\n')[verdict.line - 1] || '';
        const onLine = keys.find((k) => lineText.includes(`{${k}}`));
        if (onLine) return { type: 'blank', key: onLine };
      }
      return { type: 'blank', key: byWhy || keys[0] };
    }
    if (m.kind === 'editor') {
      if (verdict.line) return { type: 'line', line: verdict.line };
      const lines = w.code.split('\n');
      const idx = lines.findIndex((l) => /return\s+0/.test(l));
      return { type: 'line', line: idx >= 0 ? idx + 1 : lines.length };
    }
    return null;
  }

  function failureFeedback(m, w, verdict) {
    const fix = fixTarget(m, w, verdict);
    if (verdict.kind !== 'logic') {
      recordError(m, verdict.errorType);
      const label = ERROR_LABEL[verdict.kind] || '오류';
      const next = verdict.kind === 'unsupported'
        ? '이 시뮬레이터가 지원하는 1장 문법으로 바꿔 쓰세요.'
        : verdict.kind === 'compile' || verdict.kind === 'link'
          ? `${verdict.line}번 줄을 고친 뒤 다시 실행하세요. 실행 파일이 없으면 장면은 움직이지 않습니다.`
          : '오류가 난 줄과 그때의 변수 값을 확인하세요.';
      const note = verdict.kind === 'ub' || verdict.kind === 'runtime'
        ? '학습 검사기가 여기서 멈춘 것은 교육용 진단입니다. 실제 C++ 프로그램이 항상 같은 방식으로 멈추지는 않습니다.'
        : null;
      return { tone: 'error', title: label, message: verdict.message, details: note ? [note] : [], next, fix };
    }
    const details = [];
    if (m.kind === 'blanks') {
      const v = currentVariant(m, w);
      const choices = w.choices[v.id];
      for (const key of Object.keys(v.blanks)) {
        const opt = v.blanks[key][choices[key]];
        if (opt && opt.why) {
          details.push(`${opt.code}: ${opt.why}`);
          recordError(m, opt.errorType);
        }
      }
    } else {
      recordError(m, verdict.errorType || 'syntax');
    }
    return {
      tone: 'warn',
      title: '실행은 됐지만 목표와 다릅니다',
      message: verdict.message,
      details,
      next: m.id === '1-3' ? '장면의 배터리와 변수 표에서 share 의 타입과 값을 보고, 표시된 빈칸을 다시 고르세요.' : '출력 칸과 변수 표를 목표와 비교해 고칠 줄을 찾으세요.',
      fix,
    };
  }

  function runApplyCheck() {
    const m = mission();
    const w = W();
    stopPlay();
    const tests = m.kind === 'editor' ? m.tests : currentVariant(m, w).tests;
    if (m.kind === 'blanks' && !M.blanksFilled(currentVariant(m, w), w.choices[w.variant])) {
      w.feedback = { tone: 'info', title: '빈칸이 남아 있습니다', message: '빈칸을 모두 채운 뒤 검사하세요.' };
      render();
      return;
    }
    const report = tests.map((test) => {
      const result = Sim.run(sourceFor(m, w, test), { input: test.input || '' });
      const verdict = m.id === '1-3' ? M.checkShare(test, result) : M.checkBase(test, result);
      return { test, verdict };
    });
    w.applyReport = report;
    rec(m).attempts += 1;
    markTrying(m);
    const failures = report.filter((x) => !x.verdict.pass);
    if (!failures.length) {
      rec(m).applied = true;
      if (rec(m).status !== 'done') rec(m).status = 'done';
      w.successKey = Date.now();
      Sfx.play('success');
      w.feedback = {
        tone: 'success', title: '적용 확인', message: `검사 입력 ${report.length}개 모두에서 목표를 달성했습니다.`,
        reuse: m.reuse, next: nextMission(m) ? '다음 미션으로 이동하세요.' : '1장 미션을 모두 마쳤습니다.', reflect: true,
      };
    } else {
      const details = [];
      const baseOk = report[0].verdict.pass;
      let hardcode = false;
      if (m.kind === 'blanks') {
        const v = currentVariant(m, w);
        for (const key of Object.keys(v.blanks)) {
          const opt = v.blanks[key][w.choices[v.id][key]];
          if (opt && opt.why) { details.push(`${opt.code}: ${opt.why}`); recordError(m, opt.errorType); if (opt.errorType === 'hardcode') hardcode = true; }
        }
      } else if (baseOk && M.diagnoseApply(failures.map((f) => f.verdict)) === 'hardcode') {
        hardcode = true;
        details.push('입력이 달라져도 같은 숫자가 출력됩니다. 결과를 숫자로 직접 적지 말고, 계산한 변수를 출력하세요.');
        recordError(m, 'hardcode');
      } else {
        for (const f of failures) if (f.verdict.errorType) recordError(m, f.verdict.errorType);
      }
      Sfx.play('error');
      w.feedback = {
        tone: 'warn',
        title: baseOk ? '처음 입력에서만 맞습니다' : '목표와 다른 입력이 있습니다',
        message: `${report.length}개 중 ${report.length - failures.length}개 통과. ${hardcode ? '값이 바뀌어도 같은 규칙으로 계산되는지 확인하세요.' : '아래 표에서 틀린 입력을 골라 한 단계씩 실행해 보세요.'}`,
        details,
        next: '표의 "이 입력으로 실행"을 누르면 장면에서 어느 단계부터 값이 달라지는지 볼 수 있습니다.',
        fix: fixTarget(m, w, { kind: 'logic' }),
      };
    }
    noteResult();
    saveProgress();
    render();
  }

  function nextMission(m) {
    const i = MISSIONS.indexOf(m);
    return MISSIONS[i + 1] || null;
  }

  function noteResult() {
    if (narrow() && ui.pane !== 'result') ui.resultUnseen = true;
  }

  // ------------------------------------------------------------ predictions

  function submitPrediction() {
    const m = mission();
    const w = W();
    const answers = m.predict.questions.map((q, i) => (w.predict.answers[i] === undefined ? '' : String(w.predict.answers[i]).trim()));
    if (answers.some((a) => a === '')) {
      w.feedback = { tone: 'info', title: '예상을 먼저 골라 주세요', message: '정답이 아니어도 괜찮습니다. 실행 전에 예상해 두면 결과와 비교할 수 있습니다.' };
      render();
      return;
    }
    w.predict.submitted = true;
    w.predict.answers = answers;
    markTrying(m);
    if (m.predict.program) {
      const result = Sim.run(m.predict.program, {});
      const actual = m.predict.answersFrom(result);
      w.predict.actual = actual;
      m.predict.questions.forEach((q, i) => {
        const correct = answers[i] === actual[i];
        rec(m).predictions.push({ q: q.label, answer: answers[i], actual: actual[i], correct });
        if (!correct) recordError(m, 'intDivision');
      });
      w.run = { kind: 'snippet', key: ++runCounter, source: m.predict.program, result, test: null, stepIndex: 0, graded: true, pass: false };
      w.feedback = { tone: 'info', title: '예상을 기록했습니다', message: '실행 또는 한 단계로 마지막 줄까지 진행하면 출력 화면의 실제 결과와 내 예상을 나란히 보여 줍니다.' };
      sfxForStep(w);
    } else {
      const actual = m.predict.answersFrom();
      w.predict.actual = actual;
      m.predict.questions.forEach((q, i) => {
        rec(m).predictions.push({ q: q.label, answer: answers[i], actual: actual[i], correct: Number(answers[i]) === Number(actual[i]) });
      });
      w.phase = 'task';
      w.feedback = { tone: 'info', title: '예상을 기록했습니다', message: '이제 코드를 고쳐 실행해 보세요. 성공하면 예상과 비교해 보여 줍니다.' };
    }
    saveProgress();
    saveWork();
    render();
  }

  // ------------------------------------------------------------ order mission (1-1)

  function placeCard(id) {
    const w = W();
    w.pool = w.pool.filter((x) => x !== id);
    const hole = w.placed.indexOf(null);
    if (hole >= 0) w.placed[hole] = id;
    else w.placed.push(id);
    w.orderResult = null;
    w.feedback = null;
    Sfx.play('place');
    render();
    const nextCard = document.querySelector('[data-place]');
    if (nextCard) nextCard.focus();
  }

  function unplaceCard(index) {
    const w = W();
    const id = w.placed[index];
    w.placed[index] = null;
    w.pool.push(id);
    w.orderResult = null;
    w.feedback = null;
    Sfx.play('place');
    render();
  }

  function checkOrderNow() {
    const m = mission();
    const w = W();
    if (!w.placed.some(Boolean)) return;
    const result = M.checkOrder(w.placed);
    w.orderResult = result;
    markTrying(m);
    const full = w.placed.filter(Boolean).length === m.cards.length;
    if (full) {
      rec(m).attempts += 1;
      w.lastCheck = { key: Date.now(), placed: w.placed.slice(), prefix: result.correctPrefix, pass: result.pass };
    }
    if (result.pass) {
      const first = rec(m).status !== 'done';
      rec(m).status = 'done';
      w.successKey = Date.now();
      Sfx.play('success');
      w.feedback = {
        tone: 'success', title: first ? `미션 완료 · ${m.reward.name} 획득` : '성공', message: result.message,
        reuse: m.reuse, next: '작업대 아래 상황 질문 2개로 적용을 확인하세요.', reflect: true,
      };
    } else if (full) {
      recordError(m, 'order');
      Sfx.play('error');
      w.feedback = { tone: 'warn', title: '흐름이 끊긴 곳이 있습니다', message: result.message, next: '표시된 칸의 카드를 빼고 알맞은 카드를 놓으세요.', fix: { type: 'slot', index: result.wrongIndex } };
    } else {
      w.feedback = { tone: 'info', title: '아직 다 놓지 않았습니다', message: result.message };
    }
    noteResult();
    saveProgress();
    render();
  }

  function answerQuiz(qi, oi) {
    const m = mission();
    const w = W();
    if (w.quiz[qi] !== undefined && m.quiz[qi].options[w.quiz[qi]].ok) return;
    w.quiz[qi] = oi;
    const ok = m.quiz[qi].options[oi].ok;
    if (!ok) recordError(m, 'order');
    Sfx.play(ok ? 'change' : 'error');
    if (m.quiz.every((q, i) => w.quiz[i] !== undefined && q.options[w.quiz[i]].ok)) {
      rec(m).applied = true;
      w.successKey = Date.now();
      Sfx.play('success');
      w.feedback = {
        tone: 'success', title: '적용 확인', message: '빌드 과정을 실제 상황에 적용했습니다.',
        reuse: m.reuse, next: '다음 미션에서 직접 코드를 실행해 봅니다.', reflect: true,
      };
      noteResult();
    }
    saveProgress();
    render();
  }

  // ------------------------------------------------------------ step state & scene model

  function stepState(w) {
    const run = w.run;
    if (!run || run.stepIndex < 0) return null;
    const steps = run.result.steps;
    if (run.stepIndex < steps.length) {
      const s = steps[run.stepIndex];
      return { line: s.line, kind: s.kind, before: s.before, after: s.after, outAfter: s.outAfter, outBefore: s.outBefore, printed: s.printed, notes: s.notes, changed: s.changed, reads: s.reads, inputs: s.inputs, error: null };
    }
    const lastStep = steps[steps.length - 1];
    const vars = lastStep ? lastStep.after : [];
    const out = lastStep ? lastStep.outAfter : '';
    const e = run.result.error;
    return { line: e.line, kind: 'error', before: vars, after: vars, outAfter: out, outBefore: out, printed: '', notes: [e.message], changed: [], reads: e.reads || [], inputs: [], error: e };
  }

  function phaseOf(m, w) {
    const run = w.run;
    if (!run) return w.feedback && w.feedback.tone === 'success' && w.successKey ? 'pass' : 'edit';
    if (run.result.stage === 'compile' || run.result.stage === 'link') return 'compileError';
    const st = stepState(w);
    if (st && st.error) return 'runtimeError';
    if (run.kind === 'task' && run.graded) return run.pass ? 'pass' : 'fail';
    return 'running';
  }

  function sceneModel(m, w) {
    const st = stepState(w);
    const run = w.run;
    const model = {
      id: m.id,
      phase: phaseOf(m, w),
      restored: rec(m).status === 'done',
      step: st,
      stepKey: run ? `${run.key}:${run.stepIndex}` : `idle:${m.id}`,
      successKey: w.successKey,
      buildFail: run && (run.result.stage === 'compile' || run.result.stage === 'link') ? run.result.stage : null,
      // 지금 단계까지 실행된 문장들(장면이 '이미 일어난 일'을 그릴 때 사용)
      past: run && run.stepIndex >= 0 ? run.result.steps.slice(0, run.stepIndex + 1).map((s) => ({ kind: s.kind, changed: s.changed, reads: s.reads })) : [],
    };
    if (m.id === '1-1') {
      model.check = w.lastCheck;
      model.checkKey = w.lastCheck ? w.lastCheck.key : null;
      model.cards = m.cards;
    }
    if (m.id === '1-2') model.target = currentVariant(m, w).target;
    if (m.id === '1-3') {
      const v = currentVariant(m, w);
      model.params = run && run.kind === 'task' && run.test ? run.test.params : v.tests[w.testIndex].params;
    }
    if (m.id === '1-4') model.input = run && run.test ? run.test.input : w.input;
    return model;
  }

  // ------------------------------------------------------------ rendering

  function render() {
    renderTopbar();
    renderGoal();
    renderScene();
    renderWorkbench();
    renderResult();
    renderControls();
    renderPaneTabs();
    renderDrawer();
    renderSaveState();
  }

  function statusIcon(r) {
    if (r.applied && r.status === 'done') return `${icon('star', 'y')}<span class="sr">적용 확인</span>`;
    if (r.status === 'done') return `${icon('dot', 'G')}<span class="sr">미션 완료</span>`;
    if (r.status === 'trying') return `${icon('half', 'o')}<span class="sr">시도 중</span>`;
    return `${icon('ring', 'l')}<span class="sr">미시도</span>`;
  }

  function renderTopbar() {
    $('#missionTabs').innerHTML = MISSIONS.map((m) => `
      <button class="tab ${m.id === ui.missionId ? 'on' : ''}" data-mission="${m.id}" ${m.id === ui.missionId ? 'aria-current="page"' : ''}>
        ${statusIcon(rec(m))}<span class="tab-id">${m.id}</span><span class="tab-name">${esc(m.title)}</span>
      </button>`).join('');
    const done = MISSIONS.filter((m) => rec(m).status === 'done').length;
    $('#chapterHud').innerHTML = `
      <span class="hud-label">1장 시작 기지</span>
      <span class="hud-bar" role="img" aria-label="미션 ${done}/${MISSIONS.length} 완료">${MISSIONS.map((m) => `<span class="seg ${rec(m).status === 'done' ? 'on' : ''} ${rec(m).applied ? 'star' : ''}"></span>`).join('')}</span>
      <span class="hud-num">${done}/${MISSIONS.length}</span>`;
    renderTools();
  }

  function renderTools() {
    const t = $('#tools');
    const labels = { hints: ['hint', '힌트'], tools: ['card', '개념'], lecture: ['book', '강의'] };
    t.querySelectorAll('[data-drawer]').forEach((b) => {
      const [ic, label] = labels[b.dataset.drawer];
      b.innerHTML = `${icon(ic, 'w')}<span>${label}</span>`;
      b.setAttribute('aria-pressed', String(ui.drawer === b.dataset.drawer));
    });
    t.querySelector('[data-action="open-map"]').innerHTML = `${icon('map', 'w')}<span>지도</span>`;
    t.querySelector('[data-action="open-record"]').innerHTML = `${icon('record', 'w')}<span>기록</span>`;
    const s = t.querySelector('[data-action="toggle-sound"]');
    s.innerHTML = `${icon(settings.sound ? 'soundOn' : 'soundOff', 'w')}<span>소리 ${settings.sound ? '켬' : '끔'}</span>`;
    s.setAttribute('aria-pressed', String(settings.sound));
    const mo = t.querySelector('[data-action="toggle-motion"]');
    mo.innerHTML = `${icon('motion', 'w')}<span>움직임 ${reduceMotion() ? '줄임' : '보통'}</span>`;
    mo.setAttribute('aria-pressed', String(reduceMotion()));
  }

  function renderGoal() {
    const m = mission();
    const r = rec(m);
    const allDone = MISSIONS.every((x) => rec(x).status === 'done');
    $('#goalbar').innerHTML = `
      <div class="goal-id">${pixText(m.id, 'k', 4)}</div>
      <div class="goal-main">
        <h1 class="goal-title">${esc(m.title)} <small>${esc(m.zone)}</small></h1>
        <p class="goal-text">${esc(m.goal)}</p>
        <details class="goal-done" ${narrow() ? '' : 'open'}><summary>완료 조건</summary><p>${esc(m.done)}</p></details>
      </div>
      <div class="goal-badges">
        <span class="badge ${r.status === 'done' ? 'ok' : ''}">${icon(r.status === 'done' ? 'check' : 'ring', r.status === 'done' ? 'e' : 'g')} 미션 완료${r.status === 'done' ? '' : ' 전'}</span>
        <span class="badge ${r.applied ? 'ok' : ''}">${icon(r.applied ? 'star' : 'ring', r.applied ? 'o' : 'g')} 적용 확인${r.applied ? '' : ' 전'}</span>
        <button class="btn small ghost" data-action="restart" title="진도 기록은 그대로 두고 이 미션의 작업만 처음 상태로 돌립니다">${icon('reset')}<span>미션 다시 시작</span></button>
      </div>
      ${allDone ? `<div class="chapter-clear">${itemImg('house', 3)}<span><b>1장 시작 기지 복구 완료!</b> 적용 확인 ${MISSIONS.filter((x) => rec(x).applied).length}/${MISSIONS.length} · 2장 자동문과 운송로는 제작 예정입니다.</span></div>` : ''}`;
  }

  function renderScene() {
    const m = mission();
    const w = W();
    $('#sceneTitle').innerHTML = `${itemImg(m.reward.item, 2)}<span>${esc(m.zone)}</span>`;
    Scene.set(sceneModel(m, w));
    $('#sceneCaption').innerHTML = sceneCaption(m, w);
    $('#inventory').innerHTML = `<p class="inv-title">획득한 도구 <small>눌러서 개념 보기</small></p><div class="inv-slots">${MISSIONS.map((x) => {
      const got = rec(x).status === 'done';
      return `<button class="inv-slot ${got ? 'got' : 'locked'}" data-inventory="${x.id}" aria-label="${esc(x.reward.name)}: ${got ? '획득함, 개념 보기' : '아직 잠김'}">
        ${got ? itemImg(x.reward.item, 3) : icon('lock', 'g', 3)}<span>${got ? esc(x.reward.name) : `${x.id} 잠김`}</span></button>`;
    }).join('')}</div>`;
  }

  function sceneCaption(m, w) {
    const run = w.run;
    if (m.kind === 'order') {
      const c = w.lastCheck;
      if (!c) return esc(m.sceneIdle);
      return c.pass ? '로봇이 모든 기계를 순서대로 지나 기지를 켰습니다.' : `로봇이 ${c.prefix + 1}번째 기계에서 멈췄습니다. 그 칸의 카드가 흐름에 맞지 않습니다.`;
    }
    if (!run) return esc(rec(m).status === 'done' ? `${m.zone} 복구됨. 다시 실행해 보거나 다음 미션으로 이동하세요.` : m.sceneIdle);
    if (run.stepIndex < 0) return `<b class="cap-err">${run.result.stage === 'link' ? '링크' : '컴파일'} 실패</b> 실행 파일이 만들어지지 않아 장면의 어떤 상태도 바뀌지 않았습니다.`;
    const st = stepState(w);
    const parts = [`<b>${st.line}번 줄</b>`];
    if (st.error) parts.push(`<span class="cap-err">여기서 멈춤</span>`);
    for (const name of st.changed) {
      const b = st.before.find((x) => x.name === name);
      const a = st.after.find((x) => x.name === name);
      parts.push(`<span class="cap-change"><code>${esc(name)}</code> ${b && b.value !== undefined ? `${esc(b.shown)} → ` : ''}${esc(a.value === undefined ? '값 없음' : a.shown)} <em>변경</em></span>`);
    }
    const readOnly = st.reads.filter((n) => !st.changed.includes(n));
    if (readOnly.length) parts.push(`<span class="cap-read">${readOnly.map((n) => `<code>${esc(n)}</code>`).join(', ')} <em>읽음</em></span>`);
    if (st.kind === 'cout') parts.push('<span class="cap-out"><em>출력만</em> 화면에 글자가 나왔고 변수는 그대로입니다</span>');
    if (st.inputs && st.inputs.length) parts.push(`<span>입력 ${st.inputs.map((x) => `${esc(x.text)} → <code>${esc(x.name)}</code>`).join(', ')}</span>`);
    if (st.kind === 'return' || st.kind === 'end') parts.push('<span>프로그램 종료</span>');
    return parts.join(' · ');
  }

  // ---- workbench

  function renderWorkbench() {
    const m = mission();
    const w = W();
    let html = '';
    if (m.kind === 'order') html = orderBench(m, w);
    else if (w.phase === 'predict') html = predictBench(m, w);
    else if (m.kind === 'blanks') html = blanksBench(m, w);
    else html = editorBench(m, w);
    $('#workbench').innerHTML = html;
    const ta = $('#editor');
    if (ta) syncGutter(ta);
  }

  function benchHead(title, desc) {
    return `<div class="bench-head"><h2>${title}</h2><p>${desc}</p></div>`;
  }

  function orderBench(m, w) {
    const res = w.orderResult;
    const slots = m.cards.map((_, i) => {
      const id = w.placed[i];
      const card = id && m.cards.find((c) => c.id === id);
      const state = res && card ? (i < res.correctPrefix ? 'right' : i === res.wrongIndex ? 'wrong' : '') : '';
      const stateText = state === 'right' ? `${icon('check', 'e')}<span class="sr">맞음</span>` : state === 'wrong' ? `${icon('cross', 'r')}<span class="sr">흐름이 끊김</span>` : '';
      return `<li class="slot ${card ? 'filled' : ''} ${state}">
        <span class="slot-no">${i + 1}</span>
        ${card ? `<button class="card placed" data-unplace="${i}" aria-label="${i + 1}번째 칸: ${esc(card.label)}. 누르면 빠집니다">${itemImg(card.item, 3)}<span><b>${esc(card.label)}</b><small>${esc(card.sub)}</small></span>${stateText}</button>` : '<span class="slot-empty">빈 칸</span>'}
      </li>`;
    }).join('');
    const pool = w.pool.map((id) => {
      const card = m.cards.find((c) => c.id === id);
      return `<button class="card" data-place="${id}" aria-label="${esc(card.label)} 카드를 다음 빈 칸에 놓기">${itemImg(card.item, 3)}<span><b>${esc(card.label)}</b><small>${esc(card.sub)}</small></span></button>`;
    }).join('');
    const done = rec(m).status === 'done';
    let quiz = '';
    if (done) {
      quiz = `<div class="quiz"><h3>상황 질문 · 다른 상황에 적용하기</h3>${m.quiz.map((q, qi) => {
        const chosen = w.quiz[qi];
        return `<div class="q"><p>${qi + 1}. ${esc(q.q)}</p><div class="q-options">${q.options.map((o, oi) => {
          const cls = chosen === oi ? (o.ok ? 'right' : 'wrong') : '';
          return `<button class="btn opt ${cls}" data-quiz="${qi}:${oi}" aria-pressed="${chosen === oi}">${chosen === oi ? icon(o.ok ? 'check' : 'cross', o.ok ? 'e' : 'r') : ''}${esc(o.t)}</button>`;
        }).join('')}</div>${chosen !== undefined ? `<p class="why ${q.options[chosen].ok ? 'ok' : 'no'}">${q.options[chosen].ok ? '맞습니다. ' : '다시 생각해 보세요. '}${esc(q.options[chosen].why)}</p>` : ''}</div>`;
      }).join('')}</div>`;
    }
    return `${benchHead('빌드 순서 카드', '카드를 누르면 다음 빈 칸에 놓입니다. 놓은 카드를 누르면 빠집니다. 다 놓은 뒤 아래 순서 확인을 누르세요.')}
      <ol class="slots">${slots}</ol>
      <p class="tray-title">남은 카드</p>
      <div class="pool">${pool || '<p class="muted">모든 카드를 놓았습니다.</p>'}</div>
      ${quiz}`;
  }

  function predictBench(m, w) {
    const p = m.predict;
    const qs = p.questions.map((q, i) => {
      const val = w.predict.answers[i];
      const input = q.number
        ? `<input type="number" inputmode="numeric" class="px-input predict-input" data-predict="${i}" value="${val === undefined ? '' : esc(val)}" ${w.predict.submitted ? 'disabled' : ''} aria-label="${esc(q.label)}">`
        : `<div class="q-options" role="group" aria-label="${esc(q.label)}">${q.options.map((o) => `<button class="btn opt ${val === o ? 'chosen' : ''}" data-predict-opt="${i}" data-value="${esc(o)}" aria-pressed="${val === o}" ${w.predict.submitted ? 'disabled' : ''}>${val === o ? icon('check') : ''}<code>${esc(o)}</code></button>`).join('')}</div>`;
      return `<div class="q"><p>${esc(q.label)}</p>${input}</div>`;
    }).join('');
    let compare = '';
    if (w.predict.submitted && w.predict.actual && !w.predict.revealed) {
      compare = '<p class="muted">아래 조작 막대의 실행 또는 한 단계로 마지막 줄까지 진행하세요. 끝나면 예상과 실제를 비교합니다.</p>';
    } else if (w.predict.submitted && w.predict.actual) {
      compare = `<div class="compare"><h3>예상과 실제</h3><table><tr><th>질문</th><th>내 예상</th><th>실제 출력</th></tr>${p.questions.map((q, i) => {
        const ok = w.predict.answers[i] === w.predict.actual[i];
        return `<tr class="${ok ? 'ok' : 'no'}"><td>${esc(q.label)}</td><td>${esc(w.predict.answers[i])}</td><td>${esc(w.predict.actual[i])} ${ok ? '✓ 일치' : '✗ 다름'}</td></tr>`;
      }).join('')}</table>
      <p>5 와 2 는 둘 다 정수라 <code>5 / 2</code> 는 소수점 아래를 버린 2 가 됩니다. 한쪽이 실수인 <code>5 / 2.0</code> 은 2.5 입니다. (강의 p.6)</p>
      <button class="btn primary" data-action="to-task">${icon('arrow')}배분 장치 고치러 가기</button></div>`;
    }
    const st = stepState(w);
    const code = p.program ? codeView(p.program.split('\n'), { activeLine: st ? st.line : null, marks: st ? { change: st.changed, read: st.reads } : null }) : '';
    return `${benchHead('실행 전에 예상하기', esc(p.intro))}
      ${code}
      <div class="predict">${qs}</div>
      ${w.predict.submitted ? '' : `<div class="bench-actions"><button class="btn primary" data-action="submit-predict">${icon('check')}예상 확정</button></div>`}
      ${compare}`;
  }

  function blanksBench(m, w) {
    const v = currentVariant(m, w);
    const st = stepState(w);
    const choices = w.choices[v.id];
    const keys = Object.keys(v.blanks);
    if (!w.activeBlank || !v.blanks[w.activeBlank]) w.activeBlank = keys.find((k) => choices[k] === undefined) || null;
    const tabs = m.variants.length > 1 ? `<div class="variant-tabs" role="tablist">${m.variants.map((x) => {
      const locked = x.id === 'apply' && rec(m).status !== 'done';
      return `<button class="btn small vtab ${x.id === w.variant ? 'on' : ''}" role="tab" aria-selected="${x.id === w.variant}" data-variant="${x.id}" ${locked ? 'disabled title="기본 미션을 끝내면 열립니다"' : ''}>${locked ? icon('lock') : ''}${esc(x.label)}${locked ? '<span class="sr"> (잠김)</span>' : ''}</button>`;
    }).join('')}</div>` : '';
    const params = v.tests ? (w.run && w.run.kind === 'task' && w.run.test ? w.run.test.params : v.tests[w.testIndex].params) : null;
    const err = w.run && w.run.result.error;
    const active = w.activeBlank;
    const tray = active
      ? `<div class="tray" aria-label="코드 카드"><p class="tray-title">빈칸 ${keys.indexOf(active) + 1}에 넣을 코드 카드</p><div class="cards">${v.blanks[active].map((opt, idx) => `
          <button class="code-card ${choices[active] === idx ? 'chosen' : ''}" data-card="${idx}" aria-pressed="${choices[active] === idx}">
            <code>${esc(opt.code === '' ? '‹비움›' : opt.code)}</code>${choices[active] === idx ? `<span class="chosen-mark">${icon('check')}<span class="sr">넣은 카드</span></span>` : ''}
          </button>`).join('')}</div></div>`
      : '<div class="tray"><p class="tray-title">모든 빈칸을 채웠습니다. 바꾸려면 코드의 칸을 누르세요.</p></div>';
    const tests = v.tests ? `<div class="test-row"><span class="test-label">검사 입력</span>${v.tests.map((t, i) => `<button class="btn small chip ${i === w.testIndex ? 'on' : ''}" data-test="${i}" aria-pressed="${i === w.testIndex}">${esc(t.label)}${i === 0 ? ' (기본)' : ''}</button>`).join('')}
      <button class="btn small" data-action="apply-check" ${rec(m).status === 'done' ? '' : 'disabled title="기본 입력에서 먼저 성공하세요"'}>${icon('star')}다른 입력으로 검사</button></div>` : '';
    return `${benchHead('코드 작업대', '코드의 ▢ 칸을 누르고 아래 코드 카드를 고르세요. 칸을 채우면 다음 빈칸으로 넘어갑니다.')}
      ${tabs}
      <div class="code-scroll">${codeView(v.template.split('\n'), { blanks: v.blanks, choices, params, activeBlank: active, activeLine: st && !st.error ? st.line : null, errorLine: err ? err.line : null, marks: st ? { change: st.changed, read: st.reads } : null })}</div>
      ${tray}
      ${tests}`;
  }

  function editorBench(m, w) {
    const err = w.run && w.run.result.error;
    const inputRow = `<div class="test-row"><label class="test-label" for="cinInput">입력(cin)</label><input id="cinInput" class="px-input" inputmode="numeric" value="${esc(w.input)}" size="6">
      ${m.tests.map((t) => `<button class="btn small chip ${t.input === w.input.trim() ? 'on' : ''}" data-input="${esc(t.input)}" aria-pressed="${t.input === w.input.trim()}">${esc(t.input)}</button>`).join('')}
      <button class="btn small" data-action="apply-check" ${rec(m).status === 'done' ? '' : 'disabled title="기본 입력에서 먼저 성공하세요"'}>${icon('star')}다른 입력으로 검사</button></div>`;
    if (!w.editing && w.run) {
      const st = stepState(w);
      return `${benchHead('코드 작업대 · 실행 보기', '실행 중인 줄과 그 줄에서 바뀐 변수(노란 밑줄)·읽은 변수(파란 점선)가 표시됩니다.')}
        <div class="code-scroll">${codeView(w.run.source.split('\n'), { activeLine: st && !st.error ? st.line : null, errorLine: err ? err.line : null, marks: st ? { change: st.changed, read: st.reads } : null })}</div>
        <div class="bench-actions"><button class="btn" data-action="edit">${icon('edit')}코드 고치기</button></div>
        ${inputRow}`;
    }
    const lines = w.code.split('\n');
    const gutter = lines.map((l, i) => {
      const no = i + 1;
      const isErr = err && err.line === no;
      return `<span class="${isErr ? 'err' : ''} ${/수정할 코드/.test(l) ? 'fix' : ''}">${isErr ? '✗' : ''}${no}</span>`;
    }).join('');
    return `${benchHead('코드 작업대 · 짧은 코드 완성', "'수정할 코드' 줄을 고치고 출력 문장을 직접 쓰세요. Ctrl/⌘+Enter 로 실행합니다. 1장 문법만 실행됩니다.")}
      <div class="editor-wrap"><div class="gutter" id="gutter" aria-hidden="true">${gutter}</div>
      <textarea id="editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="C++ 코드 편집">${esc(w.code)}</textarea></div>
      <div class="bench-actions"><button class="btn small ghost" data-action="reset-code">${icon('reset')}처음 코드로 되돌리기</button></div>
      ${inputRow}`;
  }

  function syncGutter(ta) {
    const g = $('#gutter');
    if (g) g.scrollTop = ta.scrollTop;
  }

  // ---- result pane

  function renderResult() {
    const m = mission();
    const w = W();
    const el = $('#resultPane');
    if (m.kind === 'order') {
      el.innerHTML = `${feedbackHtml(w.feedback)}<div class="px-panel result-note">이 미션은 코드를 실행하지 않고 빌드 과정을 연결합니다. 다음 미션부터 코드를 한 단계씩 실행합니다.</div>`;
      return;
    }
    const run = w.run;
    const st = stepState(w);
    const total = run ? totalSteps(run) : 0;
    const lines = run ? run.source.split('\n') : [];
    const marks = st ? { change: st.changed, read: st.reads } : null;
    const lineBox = !run
      ? '<p class="muted">실행하면 첫 줄부터 한 단계씩 진행합니다. 실행 중인 줄, 장면에서 바뀐 대상, 변수 표의 바뀐 값이 함께 표시됩니다.</p>'
      : !st
        ? `<p class="err-text">${icon('cross', 'r')} ${esc(ERROR_LABEL[run.result.error.kind] || '오류')} · ${run.result.error.line}번 줄</p><pre class="src-line">${esc((lines[run.result.error.line - 1] || '').trim())}</pre><p>${esc(run.result.error.message)}</p><p class="muted small">실행 파일이 만들어지지 않아 한 줄도 실행되지 않았습니다.</p>`
        : `<p class="step-no">${pixText(`STEP ${run.stepIndex + 1}/${total}`, 'k', 2)} <b>${st.line}번 줄</b>${st.error ? ` · <span class="err-text">${icon('cross', 'r')}여기서 멈춤</span>` : ''}</p>
           <pre class="src-line">${highlight((lines[st.line - 1] || '').trim(), marks)}</pre>
           <ul class="notes">${st.notes.map((n) => `<li class="${st.error ? 'err-text' : ''}">${esc(n)}</li>`).join('')}</ul>`;

    const outText = st ? st.outAfter : '';
    const newPart = st ? st.printed : '';
    const outBox = `<pre class="terminal" aria-label="출력">${esc(outText.slice(0, outText.length - newPart.length))}<span class="new">${esc(newPart)}</span><span class="cursor">_</span></pre>
      ${run && run.test && run.test.input !== undefined ? `<p class="muted small">입력(cin): <code>${esc(run.test.input || '(없음)')}</code></p>` : ''}
      ${st && st.kind === 'cout' ? '<p class="small out-note"><em class="b-output">출력만</em> 화면에 글자를 보냈을 뿐 변수와 장면 상태는 그대로입니다.</p>' : ''}`;

    const varRows = st && st.after.length
      ? st.after.map((v) => {
        const before = st.before.find((b) => b.name === v.name);
        const changed = st.changed.includes(v.name);
        const read = !changed && st.reads.includes(v.name);
        const badge = changed ? '<em class="b-change">변경</em>' : read ? '<em class="b-read">읽음</em>' : '';
        return `<tr class="${changed ? 'changed' : read ? 'read' : ''}"><td><code>${esc(v.name)}</code>${badge}</td><td>${v.type}</td><td>${before ? esc(shownValue(before)) : '<span class="muted">없음</span>'}</td><td><b>${esc(shownValue(v))}</b></td></tr>`;
      }).join('')
      : '<tr><td colspan="4" class="muted">아직 만든 변수가 없습니다.</td></tr>';

    el.innerHTML = `${feedbackHtml(w.feedback)}
      ${w.applyReport ? applyTable(w.applyReport) : ''}
      <div class="result-grid">
        <section class="px-panel"><h3>실행 줄</h3>${lineBox}</section>
        <section class="px-panel"><h3>출력 (cout)</h3>${outBox}</section>
        <section class="px-panel"><h3>변수 상태 <small>이 줄 실행 전 → 후</small></h3><div class="table-scroll"><table class="vars"><tr><th>이름</th><th>타입</th><th>전</th><th>후</th></tr>${varRows}</table></div></section>
      </div>`;
    const ref = $('#reflection');
    if (ref) ref.value = rec(m).reflection;
  }

  function shownValue(v) {
    return v.value === undefined ? '? (값 없음)' : v.shown;
  }

  function applyTable(report) {
    return `<div class="table-scroll px-panel"><table class="apply"><tr><th>검사 입력</th><th>결과</th><th>설명</th></tr>${report.map((r, i) => `
      <tr class="${r.verdict.pass ? 'ok' : 'no'}"><td>${esc(r.test.label)}</td><td>${r.verdict.pass ? `${icon('check', 'e')} 통과` : `${icon('cross', 'r')} 다름`}</td>
      <td>${esc(r.verdict.message)} ${r.verdict.pass ? '' : `<button class="btn small" data-retest="${i}">${icon('play')}이 입력으로 실행</button>`}</td></tr>`).join('')}</table></div>`;
  }

  function feedbackHtml(f) {
    if (!f) return '';
    const m = mission();
    const nm = nextMission(m);
    const ic = { success: icon('star', 'o'), error: icon('cross', 'r'), warn: icon('cross', 'o'), info: icon('hint') }[f.tone];
    return `<div class="feedback px-panel ${f.tone}" role="status">
      <p class="fb-title">${ic}${esc(f.title)}</p>
      <p>${esc(f.message)}</p>
      ${f.details && f.details.length ? `<ul>${f.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      ${f.reuse ? `<p class="reuse"><b>다시 쓸 상황</b> ${esc(f.reuse)}</p>` : ''}
      ${f.next ? `<p class="next"><b>다음</b> ${esc(f.next)}</p>` : ''}
      <div class="fb-actions">
        ${f.fix ? `<button class="btn primary" data-action="fix">${icon('arrow')}고칠 곳으로 이동</button>` : ''}
        ${f.action && f.action.variant ? `<button class="btn primary" data-variant="${f.action.variant}">${icon('arrow')}${esc(f.action.label)}</button>` : ''}
        ${f.action && f.action.apply ? `<button class="btn" data-action="apply-check">${icon('star')}${esc(f.action.label)}</button>` : ''}
        ${f.tone === 'success' && nm && rec(m).status === 'done' ? `<button class="btn primary" data-mission="${nm.id}">${icon('arrow')}다음 미션 ${nm.id} ${esc(nm.title)}</button>` : ''}
      </div>
      ${f.reflect ? `<label class="reflect">왜 이 코드를 골랐는지 한 문장으로 적어 보세요 (선택, 튜터 기록에 남습니다)<input id="reflection" class="px-input" maxlength="200" placeholder="예: ○○ 때문에 이 줄을 이렇게 바꿨다"></label>` : ''}
    </div>`;
  }

  // ---- controls bar (모든 화면 크기에서 아래쪽 고정)

  function renderControls() {
    const m = mission();
    const w = W();
    const el = $('#controls');
    if (m.kind === 'order') {
      const placedN = w.placed.filter(Boolean).length;
      el.innerHTML = `<div class="ctrl-buttons">
          <button class="btn primary" data-action="play" ${placedN ? '' : 'disabled'} aria-keyshortcuts="k">${icon('check')}<span>순서 확인</span></button>
          <button class="btn" data-action="reset-run" ${placedN ? '' : 'disabled'} aria-keyshortcuts="r">${icon('reset')}<span>카드 모두 빼기</span></button>
        </div>
        <div class="ctrl-status" aria-live="polite">${orderStatus(m, w, placedN)}</div>`;
      return;
    }
    const run = w.run;
    const can = run && run.stepIndex >= 0;
    const end = can && atEnd(run);
    const start = can && run.stepIndex <= 0;
    const predictWaiting = w.phase === 'predict' && !run;
    let playLabel = '실행';
    let playIcon = 'play';
    if (isPlaying()) { playLabel = '일시정지'; playIcon = 'pause'; }
    else if (run && (end || run.stepIndex < 0)) playLabel = '다시 실행';
    else if (run) playLabel = '계속';
    el.innerHTML = `<div class="ctrl-buttons">
        <button class="btn primary" data-action="play" ${predictWaiting ? 'disabled' : ''} aria-keyshortcuts="k" title="실행/일시정지 (K)">${icon(playIcon)}<span>${playLabel}</span></button>
        <button class="btn" data-action="step-next" ${predictWaiting || (can && end) ? 'disabled' : ''} aria-keyshortcuts="n" title="한 단계 (N)">${icon('step')}<span>한 단계</span></button>
        <button class="btn" data-action="step-prev" ${can && !start ? '' : 'disabled'} aria-keyshortcuts="b" title="한 단계 뒤로 (B)">${icon('back')}<span>뒤로</span></button>
        <button class="btn" data-action="step-last" ${can && !end ? '' : 'disabled'} title="끝까지">${icon('end')}<span>끝까지</span></button>
        <button class="btn" data-action="reset-run" ${run ? '' : 'disabled'} aria-keyshortcuts="r" title="초기화 (R)">${icon('reset')}<span>초기화</span></button>
      </div>
      <div class="ctrl-status" aria-live="polite">${runStatus(m, w)}</div>
      <span class="sim-tag">교육용 시뮬레이터 · 1장 문법만 · 실제 컴파일러 아님</span>`;
  }

  function orderStatus(m, w, placedN) {
    const c = w.lastCheck;
    if (c && c.pass) return `${icon('check', 'G')}<b>배선 완료</b>`;
    if (c && w.orderResult) return `${icon('cross', 'o')}<b>${c.prefix + 1}번째 칸에서 끊김</b>`;
    return `카드 <b>${placedN}/${m.cards.length}</b> 배치`;
  }

  function runStatus(m, w) {
    const run = w.run;
    if (!run) {
      if (w.phase === 'predict') return w.predict.submitted ? '준비 완료' : '먼저 작업대에서 결과를 예상하세요';
      return '준비: 실행 또는 한 단계를 누르세요';
    }
    if (run.stepIndex < 0) return `${icon('cross', 'r')}<b>${run.result.stage === 'link' ? '링크' : '컴파일'} 오류 · ${run.result.error.line}번 줄</b>`;
    const st = stepState(w);
    const total = totalSteps(run);
    let what = '';
    if (st.error) what = `${icon('cross', 'r')}멈춤`;
    else if (st.changed.length) what = st.changed.map((n) => { const a = st.after.find((x) => x.name === n); return `<code>${esc(n)}</code>=${esc(a.value === undefined ? '?' : a.shown)}`; }).join(' ');
    else if (st.kind === 'cout') what = '출력만';
    else if (st.kind === 'return' || st.kind === 'end') what = '종료';
    let verdict = '';
    if (run.kind === 'task' && run.graded) verdict = run.pass ? ` ${icon('check', 'G')}<b>성공</b>` : ` ${icon('cross', 'o')}<b>목표와 다름</b>`;
    return `<span class="st-step">${st.line}번 줄 · ${run.stepIndex + 1}/${total}</span> <span class="st-what">${what}</span>${verdict}${isPlaying() ? ' <span class="st-play">재생 중</span>' : ''}`;
  }

  function renderPaneTabs() {
    const el = $('#paneTabs');
    const tabs = [['scene', '장면'], ['code', '코드'], ['result', '결과']];
    el.innerHTML = tabs.map(([id, label]) => `<button class="pane-tab ${ui.pane === id ? 'on' : ''}" role="tab" aria-selected="${ui.pane === id}" aria-controls="pane-${id}" data-pane-tab="${id}">${label}${id === 'result' && ui.resultUnseen ? ' <em class="new-dot">새 결과</em>' : ''}</button>`).join('');
    $('#layout').dataset.pane = ui.pane;
  }

  // ---- drawer

  function renderDrawer() {
    const d = $('#drawer');
    renderTools();
    if (!ui.drawer) { d.hidden = true; return; }
    d.hidden = false;
    const m = MISSIONS.find((x) => x.id === (ui.drawerMission || ui.missionId));
    let body = '';
    if (ui.drawer === 'tools') {
      body = `<p class="muted small">${esc(m.id)} ${esc(m.title)} · 대상 → 입력 → 결과 → 바뀌는 상태 → 사용 상황 순서로 읽으세요.</p>${m.tools.map((t) => `
        <div class="tool px-panel"><h3><code>${esc(t.name)}</code></h3><dl>
          <dt>대상</dt><dd>${esc(t.target)}</dd><dt>입력</dt><dd>${esc(t.input)}</dd><dt>결과</dt><dd>${esc(t.result)}</dd>
          <dt>바뀌는 상태</dt><dd>${esc(t.change)}</dd><dt>사용 상황</dt><dd>${esc(t.when)}</dd></dl></div>`).join('')}`;
    } else if (ui.drawer === 'hints') {
      const level = rec(m).hintLevel;
      body = `<p class="muted small">힌트는 관찰할 곳 → 필요한 개념 → 일부 코드 → 해설 순서로 열립니다. 힌트를 봐도 실패로 기록하지 않습니다.</p>
        ${m.hints.slice(0, level).map((h, i) => `<div class="hint px-panel"><b>${i + 1}. ${HINT_STEPS[i]}</b><p>${esc(h).replace(/\n/g, '<br>')}</p></div>`).join('')}
        ${level < m.hints.length ? `<button class="btn primary" data-action="open-hint">${icon('hint')}${level + 1}단계 힌트 열기: ${HINT_STEPS[level]}</button>` : '<p class="muted">모든 힌트를 열었습니다.</p>'}`;
    } else {
      body = `<p><b>MIT 6.096 ${esc(m.lecture.pages)}</b></p>${m.lecture.quotes.map((q) => `<blockquote>“${esc(q)}”</blockquote>`).join('')}
        <p class="muted small">원문 인용입니다. 게임 미션은 이 강의를 참고한 별도 설계이며 MIT 가 만들거나 승인한 게임이 아닙니다.</p>`;
    }
    const tabs = [['hints', '힌트', 'hint'], ['tools', '개념', 'card'], ['lecture', '강의', 'book']];
    d.innerHTML = `<div class="drawer-head"><div class="drawer-tabs" role="tablist">${tabs.map(([id, label, ic]) => `<button class="btn small ${ui.drawer === id ? 'on' : ''}" role="tab" aria-selected="${ui.drawer === id}" data-drawer="${id}">${icon(ic)}${label}</button>`).join('')}</div>
      <button class="btn small ghost close" data-action="close-drawer" aria-label="닫기">${icon('close')}</button></div><div class="drawer-body">${body}</div>`;
  }

  function renderSaveState() {
    const el = $('#saveState');
    if (!el) return;
    el.textContent = storageOk ? (progress.updatedAt ? '저장됨' : '') : '브라우저 저장 불가 · 기록 내보내기 사용';
    el.className = storageOk ? 'save-ok' : 'save-bad';
  }

  // ---- dialogs

  function openMap() {
    const dlg = $('#mapDialog');
    dlg.querySelector('.dlg-body').innerHTML = `<h2>${icon('map')} 섬 지도 · MIT 6.096 강의 순서</h2>
      <p class="muted small">강의 하나가 섬의 구역 하나입니다. 지금은 1장만 플레이할 수 있고, 나머지는 순서대로 제작할 예정입니다.</p>
      <ol class="chapters">${CHAPTERS.map((c) => {
        const done = c.playable && MISSIONS.every((x) => rec(x).status === 'done');
        return `<li class="${c.playable ? 'open' : 'locked'}"><span class="ch-no">${pixText(String(c.no), c.playable ? 'k' : 'g', 3)}</span>
          <div><b>${esc(c.zone)}</b> <span class="muted">Lecture ${c.no} ${esc(c.lecture)} · ${esc(c.pages)}</span><br><small>${esc(c.action)}</small></div>
          <span class="ch-state">${c.playable ? (done ? `${icon('check', 'e')}복구 완료` : `${icon('play')}플레이 가능`) : `${icon('lock', 'g')}제작 예정`}</span></li>`;
      }).join('')}</ol>`;
    if (!dlg.open) dlg.showModal();
  }

  function openRecord() {
    const dlg = $('#recordDialog');
    const rows = MISSIONS.map((m) => {
      const r = rec(m);
      const errs = Object.entries(r.errors).map(([k, v]) => `${ERROR_TYPES[k]} ${v}`).join(', ') || '–';
      const status = { none: '미시도', trying: '시도 중', done: '완료' }[r.status];
      return `<tr><td>${m.id} ${esc(m.title)}</td><td>${status}</td><td>${r.applied ? '확인' : '–'}</td><td>${r.attempts}</td><td>${r.hintLevel ? `${r.hintLevel}단계 (${HINT_STEPS[r.hintLevel - 1]})` : '안 봄'}</td><td>${esc(errs)}</td><td>${esc(r.reflection || '–')}</td></tr>`;
    }).join('');
    dlg.querySelector('.dlg-body').innerHTML = `<h2>${icon('record')} 학습 기록</h2>
      <p class="muted small">이 기록은 이 브라우저에만 저장됩니다. 튜터에게 보내려면 파일로 내보내세요. 서버가 없어 자동으로 전달되지 않습니다.</p>
      <div class="table-scroll"><table class="record"><tr><th>미션</th><th>진행</th><th>다른 입력 적용</th><th>실행/확인 횟수</th><th>마지막 힌트</th><th>오류 유형</th><th>마무리 설명</th></tr>${rows}</table></div>
      <div class="bench-actions">
        <button class="btn primary" data-action="export">진도 내보내기 (.json)</button>
        <label class="btn">진도 불러오기<input type="file" id="importFile" accept="application/json,.json" class="sr"></label>
        <button class="btn" data-action="summary">튜터용 요약 (.txt)</button>
        <button class="btn ghost danger" data-action="reset-all">기록 전체 지우기</button>
      </div>
      <p id="recordMsg" class="muted small" role="status"></p>
      <details class="credits"><summary>그래픽·소리 출처</summary>
        <p>캐릭터·타일·건물·아이콘·글꼴은 모두 이 프로젝트 코드(src/pixel.js)로 직접 그린 픽셀 아트이며 외부 이미지 파일을 쓰지 않습니다. 색은 Sweetie 16 팔레트(GrafxKid, lospec.com) 16색을 참고했습니다. 효과음은 브라우저 WebAudio 로 즉석 합성합니다.</p></details>`;
    if (!dlg.open) dlg.showModal();
  }

  function summaryText() {
    const lines = ['C++ 코드섬: 로봇 복구대 — 1장 학습 요약', `기록 시각: ${progress.updatedAt || '기록 없음'}`, ''];
    for (const m of MISSIONS) {
      const r = rec(m);
      lines.push(`[${m.id} ${m.title}]`);
      lines.push(`  진행: ${{ none: '미시도', trying: '시도 중', done: '미션 완료' }[r.status]} / 다른 입력 적용: ${r.applied ? '확인' : '미확인'}`);
      lines.push(`  실행·확인 횟수: ${r.attempts} / 마지막 힌트: ${r.hintLevel ? `${r.hintLevel}단계(${HINT_STEPS[r.hintLevel - 1]})` : '보지 않음'}`);
      const errs = Object.entries(r.errors).map(([k, v]) => `${ERROR_TYPES[k]} ${v}회`).join(', ');
      lines.push(`  오류 유형: ${errs || '없음'}`);
      for (const p of r.predictions) lines.push(`  예상: ${p.q} → 예상 ${p.answer}, 실제 ${p.actual} (${p.correct ? '일치' : '불일치'})`);
      lines.push(`  마무리 설명: ${r.reflection || '(없음)'}`);
      lines.push('');
    }
    lines.push('미션 완료와 다른 입력 적용 확인은 따로 기록합니다. 한 번의 플레이로 숙련을 판단하지 말고 다음 학습 때 짧게 다시 확인하세요.');
    return lines.join('\n');
  }

  // ------------------------------------------------------------ navigation helpers

  function goMission(id) {
    stopPlay();
    ui.missionId = id;
    ui.drawerMission = null;
    ui.resultUnseen = false;
    if (narrow()) ui.pane = 'code';
    render();
    window.scrollTo(0, 0);
  }

  function goFix() {
    const m = mission();
    const w = W();
    const f = w.feedback && w.feedback.fix;
    if (!f) return;
    stopPlay();
    if (narrow()) ui.pane = 'code';
    if (f.type === 'blank') {
      w.activeBlank = f.key;
      render();
      const b = document.querySelector(`[data-blank="${f.key}"]`);
      if (b) { b.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); b.focus({ preventScroll: true }); b.classList.add('flash'); }
    } else if (f.type === 'line') {
      w.editing = true;
      render();
      focusLine(f.line);
    } else if (f.type === 'slot') {
      render();
      const s = document.querySelector(`[data-unplace="${f.index}"]`);
      if (s) { s.scrollIntoView({ block: 'center' }); s.focus({ preventScroll: true }); s.classList.add('flash'); }
    }
    void m;
  }

  function focusLine(line) {
    const ta = $('#editor');
    if (!ta) return;
    const lines = ta.value.split('\n');
    const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
    const end = start + (lines[line - 1] || '').length;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.scrollTop = Math.max(0, (line - 4) * lh);
    syncGutter(ta);
    ta.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  function chooseCard(idx) {
    const m = mission();
    const w = W();
    const v = currentVariant(m, w);
    const key = w.activeBlank;
    if (!key) return;
    w.choices[v.id][key] = idx;
    invalidateRun(w);
    Sfx.play('place');
    const keys = Object.keys(v.blanks);
    const order = keys.slice(keys.indexOf(key) + 1).concat(keys.slice(0, keys.indexOf(key)));
    w.activeBlank = order.find((k) => w.choices[v.id][k] === undefined) || key;
    saveWork();
    render();
    const target = document.querySelector(w.activeBlank !== key ? `[data-blank="${w.activeBlank}"]` : `[data-card="${idx}"]`);
    if (target) target.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ events

  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t || t.disabled) return;
    const m = mission();
    const w = W();
    const d = t.dataset;
    if (d.mission) { if (t.closest('dialog')) t.closest('dialog').close(); goMission(d.mission); return; }
    if (d.drawer) { ui.drawer = ui.drawer === d.drawer && !t.closest('#drawer') ? null : d.drawer; if (!t.closest('#drawer')) ui.drawerMission = null; renderDrawer(); return; }
    if (d.inventory) {
      const x = MISSIONS.find((y) => y.id === d.inventory);
      if (rec(x).status !== 'done') return;
      ui.drawer = 'tools';
      ui.drawerMission = x.id;
      renderDrawer();
      $('#drawer').querySelector('button').focus();
      return;
    }
    if (d.paneTab) { ui.pane = d.paneTab; if (d.paneTab === 'result') ui.resultUnseen = false; renderPaneTabs(); if (d.paneTab === 'scene') Scene.resize(); return; }
    if (d.place) { placeCard(d.place); return; }
    if (d.unplace !== undefined) { unplaceCard(Number(d.unplace)); return; }
    if (d.quiz) { const [qi, oi] = d.quiz.split(':').map(Number); answerQuiz(qi, oi); return; }
    if (d.blank) { w.activeBlank = d.blank; renderWorkbench(); const c = document.querySelector('[data-card]'); if (c) c.focus({ preventScroll: true }); return; }
    if (d.card !== undefined) { chooseCard(Number(d.card)); return; }
    if (d.variant) { invalidateRun(w); w.variant = d.variant; w.activeBlank = null; if (narrow()) ui.pane = 'code'; render(); return; }
    if (d.test !== undefined) { invalidateRun(w); w.testIndex = Number(d.test); render(); return; }
    if (d.input !== undefined) { invalidateRun(w); w.input = d.input; saveWork(); render(); return; }
    if (d.predictOpt !== undefined) { w.predict.answers[Number(d.predictOpt)] = d.value; renderWorkbench(); return; }
    if (d.retest !== undefined) {
      const test = w.applyReport[Number(d.retest)].test;
      if (m.kind === 'editor') w.input = test.input;
      else w.testIndex = currentVariant(m, w).tests.indexOf(test);
      startRun(false);
      if (narrow()) { ui.pane = 'scene'; renderPaneTabs(); Scene.resize(); }
      return;
    }
    switch (d.action) {
      case 'play': play(); break;
      case 'step-next': stepForward(); break;
      case 'step-prev': stopPlay(); if (w.run) stepTo(w.run.stepIndex - 1); break;
      case 'step-last': stopPlay(); if (w.run) stepTo(totalSteps(w.run) - 1); break;
      case 'reset-run': resetRun(); break;
      case 'apply-check': runApplyCheck(); break;
      case 'fix': goFix(); break;
      case 'submit-predict': submitPrediction(); break;
      case 'to-task': invalidateRun(w); w.phase = 'task'; saveWork(); render(); break;
      case 'edit': stopPlay(); w.editing = true; render(); break;
      case 'reset-code':
        if (window.confirm('작성한 코드를 지우고 처음 코드로 되돌릴까요?')) { invalidateRun(w); w.code = m.starter; w.editing = true; saveWork(); render(); }
        break;
      case 'restart':
        if (window.confirm(`${m.id} 미션의 작업을 처음 상태로 돌립니다. 진도 기록은 유지됩니다.`)) {
          stopPlay();
          work[m.id] = freshWork(m);
          saveWork();
          render();
        }
        break;
      case 'open-hint': {
        const target = MISSIONS.find((x) => x.id === (ui.drawerMission || ui.missionId));
        const r = rec(target);
        r.hintLevel = Math.min(target.hints.length, r.hintLevel + 1);
        markTrying(target);
        saveProgress();
        renderDrawer();
        renderTopbar();
        break;
      }
      case 'close-drawer': ui.drawer = null; ui.drawerMission = null; renderDrawer(); break;
      case 'toggle-sound': settings.sound = !settings.sound; writeStore(SETTINGS_KEY, settings); applySettings(); renderTools(); Sfx.play('change'); break;
      case 'toggle-motion': settings.motion = reduceMotion() ? 'normal' : 'reduce'; writeStore(SETTINGS_KEY, settings); applySettings(); render(); break;
      case 'open-map': openMap(); break;
      case 'open-record': openRecord(); break;
      case 'close-dialog': t.closest('dialog').close(); break;
      case 'export': download(`cpp-code-island-progress-${today()}.json`, JSON.stringify(progress, null, 2), 'application/json'); break;
      case 'summary': download(`cpp-code-island-summary-${today()}.txt`, summaryText(), 'text/plain'); break;
      case 'reset-all':
        if (window.confirm('모든 미션의 진도 기록과 작업을 지웁니다. 먼저 내보내기를 했는지 확인하세요. 지울까요?')) {
          stopPlay();
          progress = emptyProgress();
          for (const x of MISSIONS) work[x.id] = freshWork(x);
          saveProgress();
          saveWork();
          openRecord();
          render();
        }
        break;
      default:
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'importFile' && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          progress = normalizeProgress(JSON.parse(reader.result));
          saveProgress();
          openRecord();
          $('#recordMsg').textContent = '진도를 불러왔습니다.';
          render();
        } catch (e) {
          const msg = $('#recordMsg');
          if (msg) msg.textContent = `불러오지 못했습니다: ${e.message}`;
        }
      };
      reader.readAsText(t.files[0]);
    }
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    const w = W();
    if (t.id === 'editor') {
      w.code = t.value;
      if (w.run) { invalidateRun(w); renderResult(); renderControls(); renderScene(); }
      const g = $('#gutter');
      const n = t.value.split('\n').length;
      if (g && g.children.length !== n) g.innerHTML = Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('');
      saveWork();
    } else if (t.id === 'cinInput') {
      if (w.run) { invalidateRun(w); renderResult(); renderControls(); renderScene(); }
      w.input = t.value;
      document.querySelectorAll('[data-input]').forEach((b) => b.classList.toggle('on', b.dataset.input === t.value.trim()));
      saveWork();
    } else if (t.dataset.predict !== undefined) {
      w.predict.answers[Number(t.dataset.predict)] = t.value;
    } else if (t.id === 'reflection') {
      rec(mission()).reflection = t.value;
      clearTimeout(t._timer);
      t._timer = setTimeout(saveProgress, 400);
    }
  });

  document.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (t.id === 'editor' && ev.key === 'Tab' && !ev.shiftKey) {
      ev.preventDefault();
      const s = t.selectionStart;
      t.value = `${t.value.slice(0, s)}    ${t.value.slice(t.selectionEnd)}`;
      t.selectionStart = t.selectionEnd = s + 4;
      t.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (t.id === 'editor' && (ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); startRun(false); return; }
    if (t.id === 'cinInput' && ev.key === 'Enter') { startRun(false); return; }
    if (ev.key === 'Escape' && ui.drawer) { ui.drawer = null; renderDrawer(); return; }
    // 단축키: 입력 칸·대화상자 밖에서만
    if (ev.metaKey || ev.ctrlKey || ev.altKey || t.closest('input, textarea, select, dialog')) return;
    const key = ev.key.toLowerCase();
    if (key === 'k') { ev.preventDefault(); play(); }
    else if (key === 'n') { ev.preventDefault(); stepForward(); }
    else if (key === 'b') { const w = W(); stopPlay(); if (w.run) stepTo(w.run.stepIndex - 1); }
    else if (key === 'r') resetRun();
  });

  document.addEventListener('scroll', (ev) => {
    if (ev.target.id === 'editor') syncGutter(ev.target);
  }, true);

  let wasNarrow = narrow();
  window.addEventListener('resize', () => {
    const n = narrow();
    if (n !== wasNarrow) { wasNarrow = n; render(); }
  });

  // ------------------------------------------------------------ start
  $('#logo').src = Px.textURL('CODE ISLAND', 3, 'y');
  document.querySelectorAll('dialog .close').forEach((b) => { b.innerHTML = icon('close'); });
  Scene.mount($('#sceneStage'));
  const controlsEl = $('#controls');
  const syncCtrlH = () => document.body.style.setProperty('--ctrl-h', `${controlsEl.offsetHeight}px`);
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncCtrlH).observe(controlsEl);
  applySettings();
  render();
})();
