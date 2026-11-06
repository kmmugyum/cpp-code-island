/* 화면·진행·저장. 미션 데이터와 채점은 missions.js, C++ 실행은 cppsim.js, 장면 그림은 scene.js 가 맡는다. */
(function () {
  'use strict';

  const Sim = window.CppSim;
  const M = window.Missions;
  const Px = window.Pixel;
  const Scene = window.Scene;
  const Sfx = window.Sfx;
  const I18N = window.I18N;
  const tr = (key, params) => I18N.t(key, params);
  let MISSIONS, CHAPTERS, ERROR_TYPES, ERROR_LABEL;

  const PROGRESS_KEY = 'cpp-code-island/progress/v1';
  const WORK_KEY = 'cpp-code-island/work/v1';
  const SETTINGS_KEY = 'cpp-code-island/settings/v1';
  let HINT_STEPS;
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
  const requestedLang = new URLSearchParams(window.location.search).get('lang');
  const initialLang = ['ko', 'en'].includes(requestedLang) ? requestedLang
    : ['ko', 'en'].includes(settings.lang) ? settings.lang
      : /^ko/i.test(navigator.language || '') ? 'ko' : 'en';
  function loadLanguage(lang) {
    I18N.setLang(lang);
    Sim.setLang(lang);
    M.setLang(lang);
    MISSIONS = M.getMissions(lang);
    CHAPTERS = M.getChapters(lang);
    ERROR_TYPES = M.getErrorTypes(lang);
    ERROR_LABEL = M.getErrorLabels(lang);
    HINT_STEPS = ['hint.observe', 'hint.concept', 'hint.code', 'hint.explanation'].map((key) => tr(key));
    document.documentElement.lang = lang;
    document.title = tr('page.title');
  }
  loadLanguage(initialLang);
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
      throw new Error((tr("ui.thisIsNotACCode")));
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
  const chapterNo = m => Number(m.id.split('-')[0]);
  const chapterMissions = no => MISSIONS.filter(m => chapterNo(m) === no);
  const unlocked = no => no === 1 || settings.unlockAll || new URLSearchParams(window.location.search).get('unlock') === 'all' ||
    (chapterMissions(no - 1).length > 0 && chapterMissions(no - 1).every(m => rec(m).status === 'done'));
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
      w.input = m.tests[0].input || '';
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
    const m = MISSIONS.find((x) => unlocked(chapterNo(x)) && progress.missions[x.id].status !== 'done');
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
      if (m[6] && marks && marks.change.includes(t)) out += `<mark class="tok-change" title="${tr("ui.valueChangedOnThisLine")}">${esc(t)}</mark>`;
      else if (m[6] && marks && marks.read.includes(t)) out += `<mark class="tok-read" title="${tr("ui.valueOnlyReadOnThisLine")}">${esc(t)}</mark>`;
      else out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t);
      last = m.index + t.length;
    }
    return out + esc(text.slice(last));
  }

  function codeView(lines, opts) {
    const o = opts || {};
    return `<ol class="code" aria-label="${tr("ui.code")}">${lines.map((line, i) => {
      const no = i + 1;
      const active = no === o.activeLine;
      const error = no === o.errorLine;
      const mk = error ? `${icon('cross', 'r')}<span class="sr">${tr("ui.errorLine")}</span>` : active ? `${icon('arrow', 'y')}<span class="sr">${tr("ui.currentExecutionLine")}</span>` : '';
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
        const shown = opt ? (opt.code === '' ? (tr("ui.empty")) : M.fillTemplate(opt.code, o.params || {})) : '▢';
        const n = Object.keys(o.blanks).indexOf(part) + 1;
        html += `<button class="blank ${opt ? 'filled' : 'empty'} ${o.activeBlank === part ? 'active' : ''}" data-blank="${part}" aria-pressed="${o.activeBlank === part}" aria-label="${tr("ui.blank")} ${n}: ${opt ? esc(shown) : (tr("ui.empty2"))}${o.activeBlank === part ? (tr("ui.selected")) : ''}">${esc(shown)}</button>`;
      } else if (o.params && part in o.params) {
        html += `<span class="param" title="${tr("ui.testInputValue")}">${esc(o.params[part])}</span>`;
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
      const fixed = m.tests.find((t) => (t.input || '') === w.input.trim());
      return fixed || { ...m.tests[0], input: w.input, label: `${tr("ui.input")} ${w.input.trim() || (tr("ui.none"))}` };
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
        w.feedback = { tone: 'info', title: (tr("ui.someBlanksAreEmpty")), message: (tr("ui.fillInEveryBeforeRunningThe")), fix: { type: 'blank', key: firstEmpty } };
        render();
        return;
      }
    }
    const test = currentTest(m, w);
    const source = sourceFor(m, w, test);
    const result = Sim.run(source, { input: test && test.input !== undefined ? test.input : '', files: test && test.files || {}, lang: I18N.lang });
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
    const checker = m.kind === 'blanks' ? currentVariant(m, w).check : m.check;
    const verdict = checker(result, run.test, M.h);
    run.pass = verdict.pass;

    if (!verdict.pass) {
      w.feedback = failureFeedback(m, w, verdict);
      Sfx.play('error');
      noteResult();
      saveProgress();
      return;
    }
    if (m.apply === 'variant' && w.variant === 'apply' && currentVariant(m, w).tests.length > 1) {
      runApplyCheck(true);
      return;
    }

    const r = rec(m);
    const isBaseRun = m.kind === 'blanks' ? w.variant === 'base' && w.testIndex === 0 : run.test === m.tests[0] || run.test.input === m.tests[0].input;
    const firstDone = isBaseRun && r.status !== 'done';
    if (isBaseRun) r.status = 'done';
    if (isBaseRun && w.predict.submitted && !w.predict.actual && m.predict) {
      const actual = m.predict.answersFrom(result);
      w.predict.actual = actual;
      m.predict.questions.forEach((q, i) => rec(m).predictions.push({ q: q.label, answer: w.predict.answers[i], actual: actual[i], correct: String(w.predict.answers[i]) === String(actual[i]) }));
      saveWork();
    }
    if (m.apply === 'variant' && w.variant === 'apply' && r.status === 'done') r.applied = true;
    w.successKey = Date.now();
    Sfx.play('success');

    const details = [];
    if (m.predict && m.predict.summary && w.predict.submitted) {
      const guess = w.predict.answers[0];
      details.push(`${tr("ui.initialRemainingAmountPrediction")}${guess === '' || guess === undefined ? tr("ui.blank2") : guess}${tr("ui.actualRemainingAmountWithInput100")}`);
    }
    const next = r.applied ? tr("ui.youHaveCompletedThisMissionAnd") :
      m.apply === 'variant' ? tr("chapter.applyVariant") : tr("ui.useTestWithOtherInputsTo");
    w.feedback = {
      tone: 'success',
      title: firstDone ? `${tr("ui.missionComplete")}${m.reward.name}${tr("ui.acquired")}` : (tr("ui.success")),
      message: verdict.message,
      details,
      reuse: m.reuse,
      next,
      action: !r.applied ? (m.apply === 'variant' ? { label: tr('chapter.applyVariant'), variant: 'apply' } : { label: tr('ui.testWithOtherInputs'), apply: true }) : null,
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
        // 문장 끝 ; 오류는 그 줄의 마지막 빈칸, 나머지는 첫 빈칸이 원인일 가능성이 크다
        const onLine = keys.filter((k) => lineText.includes(`{${k}}`));
        if (onLine.length) return { type: 'blank', key: verdict.errorType === 'semicolon' ? onLine[onLine.length - 1] : onLine[0] };
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
      const label = ERROR_LABEL[verdict.kind] || (tr("ui.error"));
      const next = verdict.kind === 'unsupported'
        ? tr("chapter.unsupported")
        : verdict.kind === 'compile' || verdict.kind === 'link'
          ? tr('format.fixLine', { line: verdict.line })
          : (tr("ui.checkTheLineWithTheError"));
      const note = verdict.kind === 'ub' || verdict.kind === 'runtime'
        ? (tr("ui.theLearningCheckerStopsHereFor"))
        : null;
      return { tone: 'error', title: label, message: verdict.message, details: note ? [note] : [], next, fix };
    }
    const details = [];
    if (m.kind === 'blanks') {
      const v = currentVariant(m, w);
      const choices = w.choices[v.id];
      let recordedVerdictType = false;
      for (const key of Object.keys(v.blanks)) {
        const opt = v.blanks[key][choices[key]];
        if (opt && opt.why) {
          details.push(`${opt.code}: ${opt.why}`);
          recordError(m, opt.errorType);
          if (opt.errorType === verdict.errorType) recordedVerdictType = true;
        }
      }
      if (verdict.errorType && !recordedVerdictType) recordError(m, verdict.errorType);
    } else {
      recordError(m, verdict.errorType || 'syntax');
    }
    return {
      tone: 'warn',
      title: (tr("ui.theProgramRanButDidNot")),
      message: verdict.message,
      details,
      next: tr("ui.compareTheOutputAndVariableTable"),
      fix,
    };
  }

  function runApplyCheck(fromVariantRun = false) {
    const m = mission();
    const w = W();
    stopPlay();
    const tests = m.kind === 'editor' ? m.tests : currentVariant(m, w).tests;
    if (m.kind === 'blanks' && !M.blanksFilled(currentVariant(m, w), w.choices[w.variant])) {
      w.feedback = { tone: 'info', title: (tr("ui.someBlanksAreEmpty")), message: (tr("ui.fillInEveryBlankBeforeChecking")) };
      render();
      return;
    }
    const report = tests.map((test) => {
      const result = Sim.run(sourceFor(m, w, test), { input: test.input || '', files: test.files || {}, lang: I18N.lang });
      const checker = m.kind === 'blanks' ? currentVariant(m, w).check : m.check;
      const verdict = checker(result, test, M.h);
      return { test, verdict };
    });
    w.applyReport = report;
    rec(m).attempts += 1;
    markTrying(m);
    const failures = report.filter((x) => !x.verdict.pass);
    if (fromVariantRun && w.run) w.run.pass = failures.length === 0;
    if (!failures.length) {
      rec(m).applied = true;
      if (rec(m).status !== 'done') rec(m).status = 'done';
      w.successKey = Date.now();
      Sfx.play('success');
      w.feedback = {
        tone: 'success', title: (tr("ui.applicationCheck")), message: tr('format.applySuccess', { count: report.length }),
        reuse: m.reuse, next: nextMission(m) ? tr("ui.moveOnToTheNextMission") : tr("chapter.allComplete"), reflect: true,
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
        details.push((tr("ui.theSameNumberIsPrintedFor")));
        recordError(m, 'hardcode');
      } else {
        for (const f of failures) if (f.verdict.errorType) recordError(m, f.verdict.errorType);
      }
      Sfx.play('error');
      w.feedback = {
        tone: 'warn',
        title: baseOk ? (tr("ui.onlyTheInitialInputIsCorrect")) : (tr("ui.someInputsDoNotMeetThe")),
        message: `${tr('format.passed', { total: report.length, passed: report.length - failures.length })}${hardcode ? (tr("ui.checkThatTheSameRuleIs")) : (tr("ui.chooseAFailingInputInThe"))}`,
        details,
        next: (tr("ui.selectRunWithThisInputIn")),
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
      w.feedback = { tone: 'info', title: (tr("ui.chooseAPredictionFirst")), message: (tr("ui.itSOKIfYouRe")) };
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
        if (!correct && chapterNo(m) === 1) recordError(m, 'intDivision');
      });
      w.run = { kind: 'snippet', key: ++runCounter, source: m.predict.program, result, test: null, stepIndex: 0, graded: true, pass: false };
      w.feedback = { tone: 'info', title: (tr("ui.predictionRecorded")), message: (tr("ui.runOrStepThroughToThe")) };
      sfxForStep(w);
    } else {
      if (m.predict.answersFrom.length === 0) {
        const actual = m.predict.answersFrom();
        w.predict.actual = actual;
        m.predict.questions.forEach((q, i) => {
          rec(m).predictions.push({ q: q.label, answer: answers[i], actual: actual[i], correct: Number(answers[i]) === Number(actual[i]) });
        });
      }
      w.phase = 'task';
      w.feedback = { tone: 'info', title: (tr("ui.predictionRecorded")), message: (tr("ui.nowFixTheCodeAndRun")) };
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
    const result = m.check(w.placed, null, M.h);
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
        tone: 'success', title: first ? `${tr("ui.missionComplete")}${m.reward.name}${tr("ui.acquired")}` : (tr("ui.success")), message: result.message,
        reuse: m.reuse, next: (tr("ui.checkYourUnderstandingWithTheTwo")), reflect: true,
      };
    } else if (full) {
      recordError(m, 'order');
      Sfx.play('error');
      w.feedback = { tone: 'warn', title: (tr("ui.theSequenceIsBroken")), message: result.message, next: (tr("ui.removeTheCardFromTheMarked")), fix: { type: 'slot', index: result.wrongIndex } };
    } else {
      w.feedback = { tone: 'info', title: (tr("ui.notAllCardsHaveBeenPlaced")), message: result.message };
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
        tone: 'success', title: (tr("ui.applicationCheck")), message: (tr("ui.youAppliedTheBuildProcessTo")),
        reuse: m.reuse, next: (tr("ui.inTheNextMissionYouWill")), reflect: true,
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
      return { ...s, before: s.before || [], after: s.after || [], notes: s.notes || [], changed: s.changed || [], reads: s.reads || [], events: s.events || [], error: null };
    }
    const lastStep = steps[steps.length - 1];
    const vars = lastStep ? lastStep.after : [];
    const out = lastStep ? lastStep.outAfter : '';
    const e = run.result.error;
    return { line: e.line, kind: 'error', before: vars, after: vars, mem: lastStep && lastStep.mem, delta: {}, events: [], outAfter: out, outBefore: out, printed: '', notes: [e.message], changed: [], reads: e.reads || [], inputs: [], error: e };
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
      chapter: chapterNo(m),
      lang: I18N.lang,
      scene: m.scene && !m.scene.custom ? m.scene : null,
      phase: phaseOf(m, w),
      restored: rec(m).status === 'done',
      step: st,
      stepKey: run ? `${run.key}:${run.stepIndex}` : `idle:${m.id}`,
      successKey: w.successKey,
      buildFail: run && (run.result.stage === 'compile' || run.result.stage === 'link') ? run.result.stage : null,
      // 지금 단계까지 실행된 문장들(장면이 '이미 일어난 일'을 그릴 때 사용)
      past: run && run.stepIndex >= 0 ? run.result.steps.slice(0, run.stepIndex + 1).map((s) => ({ kind: s.kind, changed: s.changed, reads: s.reads, events: s.events || [], mem: s.mem })) : [],
      // main 이 return 했거나 끝까지 갔으면 장면은 끝나기 직전 메모리(finalMem)로 값을 보여 준다
      finalMem: run ? run.result.finalMem || null : null,
      mainDone: !!run && run.stepIndex >= 0 && run.result.steps.slice(0, run.stepIndex + 1).some((s) => s.depth === 0 && (s.kind === 'return' || s.kind === 'end')),
    };
    if (m.kind === 'order') {
      model.check = w.lastCheck;
      model.checkKey = w.lastCheck ? w.lastCheck.key : null;
      model.cards = m.cards;
    } else if (m.kind === 'blanks') {
      const v = currentVariant(m, w);
      model.target = v.target;
      model.params = run && run.kind === 'task' && run.test ? run.test.params : v.tests?.[w.testIndex]?.params;
      model.input = run && run.test ? run.test.input : v.tests?.[w.testIndex]?.input;
    } else model.input = run && run.test ? run.test.input : w.input;
    return model;
  }

  // ------------------------------------------------------------ rendering

  function renderStatic() {
    document.documentElement.lang = I18N.lang;
    document.title = tr('page.title');
    $('.skip').textContent = tr('page.skip');
    $('.brand-ko').innerHTML = `${esc(tr('page.brand'))} <small>${esc(tr('page.subtitle'))}</small>`;
    const labels = {
      '#missionTabs': 'page.missions', '#goalbar': 'page.goal', '#paneTabs': 'page.panes',
      '#pane-scene': 'page.scene', '#pane-code': 'page.workbench', '#pane-result': 'page.result',
      '#controls': 'page.controls', '#drawer': 'page.help',
    };
    for (const [selector, key] of Object.entries(labels)) $(selector).setAttribute('aria-label', tr(key));
    document.querySelectorAll('dialog .close').forEach((button) => button.setAttribute('aria-label', tr('page.close')));
  }

  function render() {
    renderStatic();
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
    if (r.applied && r.status === 'done') return `${icon('star', 'y')}<span class="sr">${tr("ui.applicationCheck")}</span>`;
    if (r.status === 'done') return `${icon('dot', 'G')}<span class="sr">${tr("ui.missionComplete2")}</span>`;
    if (r.status === 'trying') return `${icon('half', 'o')}<span class="sr">${tr("ui.inProgress")}</span>`;
    return `${icon('ring', 'l')}<span class="sr">${tr("ui.notAttempted")}</span>`;
  }

  function renderTopbar() {
    const no = chapterNo(mission());
    const list = chapterMissions(no);
    const chapter = CHAPTERS[no - 1];
    $('[data-i18n="chapter.select"]').textContent = tr('chapter.select');
    $('#chapterSelect').innerHTML = CHAPTERS.map(c => `<option value="${c.no}" ${c.no === no ? 'selected' : ''} ${!c.playable || !unlocked(c.no) ? 'disabled' : ''}>${esc(tr('chapter.number', { number: c.no }))} · ${esc(c.zone)}${!c.playable ? ` (${tr('chapter.later')})` : !unlocked(c.no) ? ` (${tr('chapter.locked')})` : ''}</option>`).join('');
    $('#missionTabs').innerHTML = list.map((m) => `
      <button class="tab ${m.id === ui.missionId ? 'on' : ''}" data-mission="${m.id}" ${m.id === ui.missionId ? 'aria-current="page"' : ''}>
        ${statusIcon(rec(m))}<span class="tab-id">${m.id}</span><span class="tab-name">${esc(m.title)}</span>
      </button>`).join('');
    const done = list.filter((m) => rec(m).status === 'done').length;
    $('#chapterHud').innerHTML = `
      <span class="hud-label">${esc(tr('chapter.number', { number: no }))} ${esc(chapter.zone)}</span>
      <span class="hud-bar" role="img" aria-label="${tr("ui.missions")}${done}/${list.length}${tr("ui.complete")}">${list.map((m) => `<span class="seg ${rec(m).status === 'done' ? 'on' : ''} ${rec(m).applied ? 'star' : ''}"></span>`).join('')}</span>
      <span class="hud-num">${done}/${list.length}</span>`;
    renderTools();
  }

  function renderTools() {
    const t = $('#tools');
    const labels = { hints: ['hint', (tr("ui.hints"))], tools: ['card', (tr("ui.concepts"))], lecture: ['book', (tr("ui.lecture"))] };
    t.querySelectorAll('[data-drawer]').forEach((b) => {
      const [ic, label] = labels[b.dataset.drawer];
      b.innerHTML = `${icon(ic, 'w')}<span>${label}</span>`;
      b.setAttribute('aria-pressed', String(ui.drawer === b.dataset.drawer));
    });
    t.querySelector('[data-action="open-map"]').innerHTML = `${icon('map', 'w')}<span>${tr("ui.map")}</span>`;
    t.querySelector('[data-action="open-record"]').innerHTML = `${icon('record', 'w')}<span>${tr("ui.record")}</span>`;
    const s = t.querySelector('[data-action="toggle-sound"]');
    s.innerHTML = `${icon(settings.sound ? 'soundOn' : 'soundOff', 'w')}<span>${tr("ui.sound")}${settings.sound ? (tr("ui.on")) : (tr("ui.off"))}</span>`;
    s.setAttribute('aria-pressed', String(settings.sound));
    const mo = t.querySelector('[data-action="toggle-motion"]');
    mo.innerHTML = `${icon('motion', 'w')}<span>${tr("ui.motion")}${reduceMotion() ? (tr("ui.reduced")) : (tr("ui.normal"))}</span>`;
    mo.setAttribute('aria-pressed', String(reduceMotion()));
    t.querySelector('[data-action="toggle-language"]').innerHTML = `${icon('book', 'w')}<span>${I18N.lang === 'ko' ? 'English' : '한국어'}</span>`;
  }

  function renderGoal() {
    const m = mission();
    const r = rec(m);
    const list = chapterMissions(chapterNo(m));
    const allDone = list.every((x) => rec(x).status === 'done');
    $('#goalbar').innerHTML = `
      <div class="goal-id">${pixText(m.id, 'k', 4)}</div>
      <div class="goal-main">
        <h1 class="goal-title">${esc(m.title)} <small>${esc(m.zone)}</small></h1>
        <p class="goal-text">${esc(m.goal)}</p>
        <details class="goal-done" ${narrow() ? '' : 'open'}><summary>${tr("ui.completionCriteria")}</summary><p>${esc(m.done)}</p></details>
      </div>
      <div class="goal-badges">
        <span class="badge ${r.status === 'done' ? 'ok' : ''}">${icon(r.status === 'done' ? 'check' : 'ring', r.status === 'done' ? 'e' : 'g')} ${tr("ui.missionComplete2")}${r.status === 'done' ? '' : (tr("ui.pending"))}</span>
        <span class="badge ${r.applied ? 'ok' : ''}">${icon(r.applied ? 'star' : 'ring', r.applied ? 'o' : 'g')} ${tr("ui.applicationCheck")}${r.applied ? '' : (tr("ui.pending"))}</span>
        <button class="btn small ghost" data-action="restart" title="${tr("ui.resetThisMissionSWorkWithout")}">${icon('reset')}<span>${tr("ui.restartMission")}</span></button>
      </div>
      ${allDone ? `<div class="chapter-clear">${itemImg('house', 3)}<span><b>${tr("chapter.clear")}</b> ${tr("ui.applicationCheck")} ${list.filter((x) => rec(x).applied).length}/${list.length}</span></div>` : ''}`;
  }

  function renderScene() {
    const m = mission();
    const w = W();
    $('#sceneTitle').innerHTML = `${itemImg(m.reward.item, 2)}<span>${esc(m.zone)}</span>`;
    Scene.set(sceneModel(m, w));
    $('#sceneCaption').innerHTML = sceneCaption(m, w);
    $('#inventory').innerHTML = `<p class="inv-title">${tr("ui.toolsAcquired")} <small>${tr("ui.selectToViewConcepts")}</small></p><div class="inv-slots">${chapterMissions(chapterNo(m)).map((x) => {
      const got = rec(x).status === 'done';
      return `<button class="inv-slot ${got ? 'got' : 'locked'}" data-inventory="${x.id}" aria-label="${esc(x.reward.name)}: ${got ? (tr("ui.acquiredViewConcept")) : (tr("ui.stillLocked"))}">
        ${got ? itemImg(x.reward.item, 3) : icon('lock', 'g', 3)}<span>${got ? esc(x.reward.name) : `${x.id}${tr("ui.locked")}`}</span></button>`;
    }).join('')}</div>`;
  }
  function eventText(e) {
    const label = tr(`event.${e.type}`);
    switch (e.type) {
      case 'call': return `${label} ${e.fn}(${(e.args || []).map(a => `${a.name}=${a.shown}${a.byRef && a.target ? ` → ${a.target}` : ''}`).join(', ')})`;
      case 'return': return `${label} ${e.fn}${e.value != null ? `: ${e.value}` : ''}`;
      case 'construct': case 'destruct': return `${label} ${e.class} ${e.path}`;
      case 'alloc': return `${label} ${e.id} ${e.allocatedType || ''}${e.count != null ? ` [${e.count}]` : ''}`;
      case 'free': return `${label} ${e.id}`;
      // 가상 함수가 아니면 정적·동적 타입이 같으므로 따로 설명할 것이 없다
      case 'dispatch': return e.virtual ? `${label} ${e.object || ''} ${e.method}: ${tr('event.static')} ${e.static} → ${tr('event.dynamic')} ${e.dynamic}` : '';
      case 'branch': return `${label}: ${tr(e.taken ? 'event.taken' : 'event.notTaken')}`;
      case 'loop': return `${label}: ${e.iteration} (${e.cond})`;
      case 'throw': case 'catch': return `${label} ${e.exception || ''} ${e.what || ''}`;
      case 'file': return `${label} ${tr(`event.${e.op}`)}: ${e.name}`;
      default: return '';
    }
  }


  function sceneCaption(m, w) {
    const run = w.run;
    if (m.kind === 'order') {
      const c = w.lastCheck;
      if (!c) return esc(m.sceneIdle);
      return c.pass ? (tr("ui.theRobotPassedThroughEveryMachine")) : `${tr("ui.theRobotStoppedAtMachine")}${c.prefix + 1}${tr("ui.theCardInThatSlotDoes")}`;
    }
    if (!run) return esc(rec(m).status === 'done' ? `${m.zone}${tr("ui.restoredRunAgainOrMoveOn")}` : m.sceneIdle);
    if (run.stepIndex < 0) return `<b class="cap-err">${run.result.stage === 'link' ? (tr("ui.link")) : (tr("ui.compile"))}${tr("ui.failed")}</b> ${tr("ui.noExecutableWasCreatedSoNothing")}`;
    const st = stepState(w);
    const parts = [`<b>${tr('format.line', { line: st.line })}</b>`];
    if (st.error) parts.push(`<span class="cap-err">${tr("ui.stoppedHere")}</span>`);
    for (const name of st.changed) {
      const b = st.before.find((x) => x.name === name);
      const a = st.after.find((x) => x.name === name);
      const d = st.delta && st.delta[name];
      parts.push(`<span class="cap-change"><code>${esc(name)}</code> ${d ? `${esc(d.from ?? '')} → ${esc(d.to ?? '')}` : `${b && b.value !== undefined ? `${esc(b.shown)} → ` : ''}${a ? esc(a.shown ?? tr("ui.noValue")) : ''}`} <em>${tr("ui.changed")}</em></span>`);
    }
    const readOnly = st.reads.filter((n) => !st.changed.includes(n));
    if (readOnly.length) parts.push(`<span class="cap-read">${readOnly.map((n) => `<code>${esc(n)}</code>`).join(', ')} <em>${tr("ui.read")}</em></span>`);
    if (st.kind === 'cout') parts.push(("<span class=\"cap-out\"><em>" + tr("ui.outputOnly") + "</em> " + tr("ui.textAppearedOnScreenVariablesAre") + "</span>"));
    if (st.inputs && st.inputs.length) parts.push(`<span>${tr("ui.input")} ${st.inputs.map((x) => `${esc(x.text)} → <code>${esc(x.path || x.name)}</code>`).join(', ')}</span>`);
    if ((st.kind === 'return' || st.kind === 'end') && !st.depth) parts.push(("<span>" + tr("ui.programEnded") + "</span>"));
    parts.push(...(st.events || []).map(eventText).filter(Boolean).map(text => `<span>${esc(text)}</span>`));
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
      const stateText = state === 'right' ? `${icon('check', 'e')}<span class="sr">${tr("ui.correct")}</span>` : state === 'wrong' ? `${icon('cross', 'r')}<span class="sr">${tr("ui.sequenceBroken")}</span>` : '';
      return `<li class="slot ${card ? 'filled' : ''} ${state}">
        <span class="slot-no">${i + 1}</span>
        ${card ? `<button class="card placed" data-unplace="${i}" aria-label="${tr('format.slot', { number: i + 1, label: esc(card.label) })}">${itemImg(card.item, 3)}<span><b>${esc(card.label)}</b><small>${esc(card.sub)}</small></span>${stateText}</button>` : ("<span class=\"slot-empty\">" + tr("ui.emptySlot") + "</span>")}
      </li>`;
    }).join('');
    const pool = w.pool.map((id) => {
      const card = m.cards.find((c) => c.id === id);
      return `<button class="card" data-place="${id}" aria-label="${esc(card.label)}${tr("ui.placeCardInTheNextEmpty")}">${itemImg(card.item, 3)}<span><b>${esc(card.label)}</b><small>${esc(card.sub)}</small></span></button>`;
    }).join('');
    const done = rec(m).status === 'done';
    let quiz = '';
    if (done) {
      quiz = `<div class="quiz"><h3>${tr("ui.scenarioQuestionsApplyInAnotherSituation")}</h3>${m.quiz.map((q, qi) => {
        const chosen = w.quiz[qi];
        return `<div class="q"><p>${qi + 1}. ${esc(q.q)}</p><div class="q-options">${q.options.map((o, oi) => {
          const cls = chosen === oi ? (o.ok ? 'right' : 'wrong') : '';
          return `<button class="btn opt ${cls}" data-quiz="${qi}:${oi}" aria-pressed="${chosen === oi}">${chosen === oi ? icon(o.ok ? 'check' : 'cross', o.ok ? 'e' : 'r') : ''}${esc(o.t)}</button>`;
        }).join('')}</div>${chosen !== undefined ? `<p class="why ${q.options[chosen].ok ? 'ok' : 'no'}">${q.options[chosen].ok ? (tr("ui.correct2")) : (tr("ui.thinkAgain"))}${esc(q.options[chosen].why)}</p>` : ''}</div>`;
      }).join('')}</div>`;
    }
    return `${benchHead((tr("ui.buildSequenceCards")), (tr("ui.selectACardToPlaceIt")))}
      <ol class="slots">${slots}</ol>
      <p class="tray-title">${tr("ui.remainingCards")}</p>
      <div class="pool">${pool || ("<p class=\"muted\">" + tr("ui.allCardsPlaced") + "</p>")}</div>
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
      compare = ("<p class=\"muted\">" + tr("ui.useRunOrStepOnThe") + "</p>");
    } else if (w.predict.submitted && w.predict.actual) {
      compare = `<div class="compare"><h3>${tr("ui.predictionAndResult")}</h3><table><tr><th>${tr("ui.question")}</th><th>${tr("ui.myPrediction")}</th><th>${tr("ui.actualOutput")}</th></tr>${p.questions.map((q, i) => {
        const ok = w.predict.answers[i] === w.predict.actual[i];
        return `<tr class="${ok ? 'ok' : 'no'}"><td>${esc(q.label)}</td><td>${esc(w.predict.answers[i])}</td><td>${esc(w.predict.actual[i])} ${ok ? (tr("ui.match")) : (tr("ui.different"))}</td></tr>`;
      }).join('')}</table>
      ${p.explanation ? `<p>${esc(p.explanation)}</p>` : ''}
      <button class="btn primary" data-action="to-task">${icon('arrow')}${p.explanation ? tr("ui.goFixTheDistributionDevice") : tr("chapter.goTask")}</button></div>`;
    }
    const st = stepState(w);
    const code = p.program ? `<div class="code-scroll">${codeView(p.program.split('\n'), { activeLine: st ? st.line : null, marks: st ? { change: st.changed, read: st.reads } : null })}</div>` : '';
    return `${benchHead((tr("ui.predictBeforeRunning")), esc(p.intro))}
      ${code}
      <div class="predict">${qs}</div>
      ${w.predict.submitted ? '' : `<div class="bench-actions"><button class="btn primary" data-action="submit-predict">${icon('check')}${tr("ui.submitPrediction")}</button></div>`}
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
      return `<button class="btn small vtab ${x.id === w.variant ? 'on' : ''}" role="tab" aria-selected="${x.id === w.variant}" data-variant="${x.id}" ${locked ? ("disabled title=\"" + tr("ui.unlocksAfterCompletingTheBaseMission") + "\"") : ''}>${locked ? icon('lock') : ''}${esc(x.label)}${locked ? ("<span class=\"sr\">" + tr("ui.locked2") + "</span>") : ''}</button>`;
    }).join('')}</div>` : '';
    const params = v.tests ? (w.run && w.run.kind === 'task' && w.run.test ? w.run.test.params : v.tests[w.testIndex].params) : null;
    const err = w.run && w.run.result.error;
    const active = w.activeBlank;
    const tray = active
      ? `<div class="tray" aria-label="${tr("ui.codeCards")}"><p class="tray-title">${tr('format.tray', { number: keys.indexOf(active) + 1 })}</p><div class="cards">${v.blanks[active].map((opt, idx) => `
          <button class="code-card ${choices[active] === idx ? 'chosen' : ''}" data-card="${idx}" aria-pressed="${choices[active] === idx}">
            <code>${esc(opt.code === '' ? (tr("ui.empty")) : opt.code)}</code>${choices[active] === idx ? `<span class="chosen-mark">${icon('check')}<span class="sr">${tr("ui.placedCard")}</span></span>` : ''}
          </button>`).join('')}</div></div>`
      : ("<div class=\"tray\"><p class=\"tray-title\">" + tr("ui.allBlanksAreFilledSelectA") + "</p></div>");
    const tests = v.tests ? `<div class="test-row"><span class="test-label">${tr("ui.testInput")}</span>${v.tests.map((t, i) => `<button class="btn small chip ${i === w.testIndex ? 'on' : ''}" data-test="${i}" aria-pressed="${i === w.testIndex}">${esc(t.label)}${i === 0 ? (tr("ui.default")) : ''}</button>`).join('')}
      ${m.apply === 'variant' ? '' : `<button class="btn small" data-action="apply-check" ${rec(m).status === 'done' ? '' : 'disabled'}>${icon('star')}${tr("ui.testWithOtherInputs")}</button>`}</div>` : '';
    return `${benchHead((tr("ui.codeWorkbench")), (tr("ui.selectAInTheCodeThen")))}
      ${tabs}
      <div class="code-scroll">${codeView(v.template.split('\n'), { blanks: v.blanks, choices, params, activeBlank: active, activeLine: st && !st.error ? st.line : null, errorLine: err ? err.line : null, marks: st ? { change: st.changed, read: st.reads } : null })}</div>
      ${tray}
      ${tests}`;
  }

  function editorBench(m, w) {
    const err = w.run && w.run.result.error;
    const inputRow = `<div class="test-row"><label class="test-label" for="cinInput">${tr("ui.inputCin")}</label><input id="cinInput" class="px-input" inputmode="numeric" value="${esc(w.input)}" size="6">
      ${m.tests.filter(t => t.input !== undefined).map((t) => `<button class="btn small chip ${t.input === w.input.trim() ? 'on' : ''}" data-input="${esc(t.input)}" aria-pressed="${t.input === w.input.trim()}">${esc(t.label || t.input)}</button>`).join('')}
      <button class="btn small" data-action="apply-check" ${rec(m).status === 'done' ? '' : ("disabled title=\"" + tr("ui.firstSucceedWithTheDefaultInput") + "\"")}>${icon('star')}${tr("ui.testWithOtherInputs")}</button></div>`;
    if (!w.editing && w.run) {
      const st = stepState(w);
      return `${benchHead((tr("ui.codeWorkbenchExecutionView")), (tr("ui.theCurrentLineAndVariablesChanged")))}
        <div class="code-scroll">${codeView(w.run.source.split('\n'), { activeLine: st && !st.error ? st.line : null, errorLine: err ? err.line : null, marks: st ? { change: st.changed, read: st.reads } : null })}</div>
        <div class="bench-actions"><button class="btn" data-action="edit">${icon('edit')}${tr("ui.editCode")}</button></div>
        ${inputRow}`;
    }
    const lines = w.code.split('\n');
    const gutter = lines.map((l, i) => {
      const no = i + 1;
      const isErr = err && err.line === no;
      return `<span class="${isErr ? 'err' : ''} ${l.includes(m.fixMark) ? 'fix' : ''}">${isErr ? '✗' : ''}${no}</span>`;
    }).join('');
    return `${benchHead((tr("ui.codeWorkbenchCompleteTheShortProgram")), (tr("ui.fixTheCodeToEditLine")))}
      <div class="editor-wrap"><div class="gutter" id="gutter" aria-hidden="true">${gutter}</div>
      <textarea id="editor" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="${tr("ui.editCCode")}">${esc(w.code)}</textarea></div>
      <div class="bench-actions"><button class="btn small ghost" data-action="reset-code">${icon('reset')}${tr("ui.restoreStarterCode")}</button></div>
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
      el.innerHTML = `${feedbackHtml(w.feedback)}<div class="px-panel result-note">${tr("ui.inThisMissionConnectTheBuild")}</div>`;
      return;
    }
    const run = w.run;
    const st = stepState(w);
    const total = run ? totalSteps(run) : 0;
    const lines = run ? run.source.split('\n') : [];
    const marks = st ? { change: st.changed, read: st.reads } : null;
    const lineBox = !run
      ? ("<p class=\"muted\">" + tr("ui.runToStepThroughFromThe") + "</p>")
      : !st
        ? `<p class="err-text">${icon('cross', 'r')} ${esc(ERROR_LABEL[run.result.error.kind] || (tr("ui.error")))} · ${tr('format.line', { line: run.result.error.line })}</p><pre class="src-line">${esc((lines[run.result.error.line - 1] || '').trim())}</pre><p>${esc(run.result.error.message)}</p><p class="muted small">${tr("ui.noExecutableWasCreatedSoNo")}</p>`
        : `<p class="step-no">${pixText(`STEP ${run.stepIndex + 1}/${total}`, 'k', 2)} <b>${tr('format.line', { line: st.line })}</b>${st.error ? ` · <span class="err-text">${icon('cross', 'r')}${tr("ui.stoppedHere")}</span>` : ''}</p>
           <pre class="src-line">${highlight((lines[st.line - 1] || '').trim(), marks)}</pre>
           <ul class="notes">${st.notes.map((n) => `<li class="${st.error ? 'err-text' : ''}">${esc(n)}</li>`).join('')}</ul>`;

    const outText = st ? st.outAfter : '';
    const newPart = st ? st.printed : '';
    const outBox = `<pre class="terminal" aria-label="${tr("ui.output")}">${esc(outText.slice(0, outText.length - newPart.length))}<span class="new">${esc(newPart)}</span><span class="cursor">_</span></pre>
      ${run && run.test && run.test.input !== undefined ? `<p class="muted small">${tr("ui.inputCin2")}<code>${esc(run.test.input || (tr("ui.none")))}</code></p>` : ''}
      ${st && st.kind === 'cout' ? ("<p class=\"small out-note\"><em class=\"b-output\">" + tr("ui.outputOnly") + "</em> " + tr("ui.textWasSentToTheScreen") + "</p>") : ''}`;

    const mem = st && st.mem;
    const frames = mem && mem.frames || [];
    const cells = frames.length ? [...(frames.length > 1 ? frames[0].vars : []), ...frames[frames.length - 1].vars, ...(mem.globals || []), ...(mem.heap || []).map(b => b.cell).filter(Boolean)] : st ? st.after : [];
    const flat = [];
    function flatten(cell) { flat.push(cell); for (const child of [...(cell.elems || []), ...(cell.fields || [])]) flatten(child); }
    cells.forEach(flatten);
    const varRows = flat.map(v => {
      const path = v.path || v.name;
      const d = st.delta && st.delta[path];
      const before = st.before.find(b => b.name === path);
      const changed = st.changed.includes(path), read = !changed && st.reads.includes(path);
      const badge = changed ? `<em class="b-change">${tr('ui.changed')}</em>` : read ? `<em class="b-read">${tr('ui.read')}</em>` : '';
      return `<tr class="${changed ? 'changed' : read ? 'read' : ''}"><td><code>${esc(path)}</code>${badge}</td><td>${esc(v.type || '')}</td><td>${esc(d ? d.from ?? tr('ui.none2') : before ? shownValue(before) : tr('ui.none2'))}</td><td><b>${esc(v.shown ?? shownValue(v))}</b></td></tr>`;
    }).join('') || `<tr><td colspan="4" class="muted">${tr('ui.noVariablesCreatedYet')}</td></tr>`;
    const memoryDetails = mem ? `<section class="px-panel"><h3>${tr('memory.stack')}</h3><ol>${frames.map(f => `<li><code>${esc(f.fn)}</code> · ${esc(f.line ?? '')}</li>`).join('')}</ol>
      <h3>${tr('memory.heap')}</h3><ul>${(mem.heap || []).map(b => `<li><code>${esc(b.id)}</code> ${esc(b.type)} ${b.freed ? tr('memory.freed') : (run && atEnd(run) && (run.result.leaks || []).some(l => l.id === b.id) ? tr('memory.leaked') : '')}</li>`).join('') || `<li>${tr('memory.empty')}</li>`}</ul>
      <h3>${tr('memory.files')}</h3><ul>${Object.entries(mem.files || {}).map(([name, content]) => `<li><code>${esc(name)}</code><pre>${esc(content)}</pre></li>`).join('') || `<li>${tr('memory.empty')}</li>`}</ul></section>` : '';

    el.innerHTML = `${feedbackHtml(w.feedback)}
      ${w.applyReport ? applyTable(w.applyReport) : ''}
      <div class="result-grid">
        <section class="px-panel"><h3>${tr("ui.executionLine")}</h3>${lineBox}</section>
        <section class="px-panel"><h3>${tr("ui.outputCout")}</h3>${outBox}</section>
        <section class="px-panel"><h3>${tr("ui.variableState")} <small>${tr("ui.beforeAfterThisLine")}</small></h3><div class="table-scroll"><table class="vars"><tr><th>${tr("ui.name")}</th><th>${tr("ui.type")}</th><th>${tr("ui.before")}</th><th>${tr("ui.after")}</th></tr>${varRows}</table></div></section>
        ${memoryDetails}
      </div>`;
    const ref = $('#reflection');
    if (ref) ref.value = rec(m).reflection;
  }

  function shownValue(v) {
    return v.value === undefined ? (tr("ui.noValue2")) : v.shown;
  }

  function applyTable(report) {
    return `<div class="table-scroll px-panel"><table class="apply"><tr><th>${tr("ui.testInput")}</th><th>${tr("ui.result")}</th><th>${tr("ui.explanation2")}</th></tr>${report.map((r, i) => `
      <tr class="${r.verdict.pass ? 'ok' : 'no'}"><td>${esc(r.test.label)}</td><td>${r.verdict.pass ? `${icon('check', 'e')}${tr("ui.passed")}` : `${icon('cross', 'r')}${tr("ui.different2")}`}</td>
      <td>${esc(r.verdict.message)} ${r.verdict.pass ? '' : `<button class="btn small" data-retest="${i}">${icon('play')}${tr("ui.runWithThisInput")}</button>`}</td></tr>`).join('')}</table></div>`;
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
      ${f.reuse ? `<p class="reuse"><b>${tr("ui.whenToReuse")}</b> ${esc(f.reuse)}</p>` : ''}
      ${f.next ? `<p class="next"><b>${tr("ui.next")}</b> ${esc(f.next)}</p>` : ''}
      <div class="fb-actions">
        ${f.fix ? `<button class="btn primary" data-action="fix">${icon('arrow')}${tr("ui.goToFix")}</button>` : ''}
        ${f.action && f.action.variant ? `<button class="btn primary" data-variant="${f.action.variant}">${icon('arrow')}${esc(f.action.label)}</button>` : ''}
        ${f.action && f.action.apply ? `<button class="btn" data-action="apply-check">${icon('star')}${esc(f.action.label)}</button>` : ''}
        ${f.tone === 'success' && nm && unlocked(chapterNo(nm)) && rec(m).status === 'done' ? `<button class="btn primary" data-mission="${nm.id}">${icon('arrow')}${tr("ui.nextMission")}${nm.id} ${esc(nm.title)}</button>` : ''}
      </div>
      ${f.reflect ? `<label class="reflect">${tr("ui.inOneSentenceExplainWhyYou")}<input id="reflection" class="px-input" maxlength="200" placeholder="${tr("ui.exampleIChangedThisLineBecause")}"></label>` : ''}
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
          <button class="btn primary" data-action="play" ${placedN ? '' : 'disabled'} aria-keyshortcuts="k">${icon('check')}<span>${tr("ui.checkSequence")}</span></button>
          <button class="btn" data-action="reset-run" ${placedN ? '' : 'disabled'} aria-keyshortcuts="r">${icon('reset')}<span>${tr("ui.removeAllCards")}</span></button>
        </div>
        <div class="ctrl-status" aria-live="polite">${orderStatus(m, w, placedN)}</div>`;
      return;
    }
    const run = w.run;
    const can = run && run.stepIndex >= 0;
    const end = can && atEnd(run);
    const start = can && run.stepIndex <= 0;
    const predictWaiting = w.phase === 'predict' && !run;
    let playLabel = (tr("ui.run"));
    let playIcon = 'play';
    if (isPlaying()) { playLabel = (tr("ui.pause")); playIcon = 'pause'; }
    else if (run && (end || run.stepIndex < 0)) playLabel = (tr("ui.runAgain"));
    else if (run) playLabel = (tr("ui.continue"));
    el.innerHTML = `<div class="ctrl-buttons">
        <button class="btn primary" data-action="play" ${predictWaiting ? 'disabled' : ''} aria-keyshortcuts="k" title="${tr("ui.runPauseK")}">${icon(playIcon)}<span>${playLabel}</span></button>
        <button class="btn" data-action="step-next" ${predictWaiting || (can && end) ? 'disabled' : ''} aria-keyshortcuts="n" title="${tr("ui.stepN")}">${icon('step')}<span>${tr("ui.step")}</span></button>
        <button class="btn" data-action="step-prev" ${can && !start ? '' : 'disabled'} aria-keyshortcuts="b" title="${tr("ui.stepBackB")}">${icon('back')}<span>${tr("ui.back")}</span></button>
        <button class="btn" data-action="step-last" ${can && !end ? '' : 'disabled'} title="${tr("ui.goToEnd")}">${icon('end')}<span>${tr("ui.goToEnd")}</span></button>
        <button class="btn" data-action="reset-run" ${run ? '' : 'disabled'} aria-keyshortcuts="r" title="${tr("ui.resetR")}">${icon('reset')}<span>${tr("ui.reset")}</span></button>
      </div>
      <div class="ctrl-status" aria-live="polite">${runStatus(m, w)}</div>
      <span class="sim-tag">${tr("chapter.simulator")}</span>`;
  }

  function orderStatus(m, w, placedN) {
    const c = w.lastCheck;
    if (c && c.pass) return `${icon('check', 'G')}<b>${tr("ui.wiringComplete")}</b>`;
    if (c && w.orderResult) return `${icon('cross', 'o')}<b>${tr('format.brokenSlot', { number: c.prefix + 1 })}</b>`;
    return `${tr("ui.cards")}<b>${placedN}/${m.cards.length}</b>${tr("ui.placed")}`;
  }

  function runStatus(m, w) {
    const run = w.run;
    if (!run) {
      if (w.phase === 'predict') return w.predict.submitted ? (tr("ui.ready")) : (tr("ui.firstPredictTheResultAtThe"));
      return (tr("ui.readySelectRunOrStep"));
    }
    if (run.stepIndex < 0) return `${icon('cross', 'r')}<b>${run.result.stage === 'link' ? (tr("ui.link")) : (tr("ui.compile"))}${tr("ui.error2")}${tr('format.line', { line: run.result.error.line })}</b>`;
    const st = stepState(w);
    const total = totalSteps(run);
    let what = '';
    if (st.error) what = `${icon('cross', 'r')}${tr("ui.stopped")}`;
    else if (st.events && st.events.length) what = st.events.map(eventText).filter(Boolean).map(esc).join(' · ');
    else if (st.changed.length) what = st.changed.map((n) => { const a = st.after.find((x) => x.name === n); const d = st.delta && st.delta[n]; return `<code>${esc(n)}</code>=${esc(d ? d.to : a ? a.shown : '?')}`; }).join(' ');
    else if (st.kind === 'cout') what = (tr("ui.outputOnly"));
    else if ((st.kind === 'return' || st.kind === 'end') && !st.depth) what = (tr("ui.ended"));
    else if (st.kind === 'return' || st.kind === 'exit') what = tr('event.return');
    let verdict = '';
    if (run.kind === 'task' && run.graded) verdict = run.pass ? ` ${icon('check', 'G')}<b>${tr("ui.success")}</b>` : ` ${icon('cross', 'o')}<b>${tr("ui.doesNotMeetGoal")}</b>`;
    return `<span class="st-step">${tr('format.line', { line: st.line })} · ${run.stepIndex + 1}/${total}</span> <span class="st-what">${what}</span>${verdict}${isPlaying() ? (" <span class=\"st-play\">" + tr("ui.playing") + "</span>") : ''}`;
  }

  function renderPaneTabs() {
    const el = $('#paneTabs');
    const tabs = [['scene', (tr("ui.scene"))], ['code', (tr("ui.code"))], ['result', (tr("ui.result"))]];
    el.innerHTML = tabs.map(([id, label]) => `<button class="pane-tab ${ui.pane === id ? 'on' : ''}" role="tab" aria-selected="${ui.pane === id}" aria-controls="pane-${id}" data-pane-tab="${id}">${label}${id === 'result' && ui.resultUnseen ? (" <em class=\"new-dot\">" + tr("ui.newResult") + "</em>") : ''}</button>`).join('');
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
      body = `<p class="muted small">${esc(m.id)} ${esc(m.title)}${tr("ui.readInOrderTargetInputResult")}</p>${m.tools.map((t) => `
        <div class="tool px-panel"><h3><code>${esc(t.name)}</code></h3><dl>
          <dt>${tr("ui.target")}</dt><dd>${esc(t.target)}</dd><dt>${tr("ui.input")}</dt><dd>${esc(t.input)}</dd><dt>${tr("ui.result")}</dt><dd>${esc(t.result)}</dd>
          <dt>${tr("ui.stateChanges")}</dt><dd>${esc(t.change)}</dd><dt>${tr("ui.useCases")}</dt><dd>${esc(t.when)}</dd></dl></div>`).join('')}`;
    } else if (ui.drawer === 'hints') {
      const level = rec(m).hintLevel;
      body = `<p class="muted small">${tr("ui.hintsUnlockInOrderWhereTo")}</p>
        ${m.hints.slice(0, level).map((h, i) => `<div class="hint px-panel"><b>${i + 1}. ${HINT_STEPS[i]}</b><p>${esc(h).replace(/\n/g, '<br>')}</p></div>`).join('')}
        ${level < m.hints.length ? `<button class="btn primary" data-action="open-hint">${icon('hint')}${tr('format.hintButton', { number: level + 1, name: HINT_STEPS[level] })}</button>` : ("<p class=\"muted\">" + tr("ui.allHintsUnlocked") + "</p>")}`;
    } else {
      body = `<p><b>MIT 6.096 ${esc(m.lecture.pages)}</b></p>${m.lecture.quotes.map((q) => `<blockquote>“${esc(q)}”</blockquote>`).join('')}
        <p class="muted small">${tr("ui.theseAreOriginalQuotationsTheMissions")}</p>`;
    }
    const tabs = [['hints', (tr("ui.hints")), 'hint'], ['tools', (tr("ui.concepts")), 'card'], ['lecture', (tr("ui.lecture")), 'book']];
    d.innerHTML = `<div class="drawer-head"><div class="drawer-tabs" role="tablist">${tabs.map(([id, label, ic]) => `<button class="btn small ${ui.drawer === id ? 'on' : ''}" role="tab" aria-selected="${ui.drawer === id}" data-drawer="${id}">${icon(ic)}${label}</button>`).join('')}</div>
      <button class="btn small ghost close" data-action="close-drawer" aria-label="${tr("ui.close")}">${icon('close')}</button></div><div class="drawer-body">${body}</div>`;
  }

  function renderSaveState() {
    const el = $('#saveState');
    if (!el) return;
    el.textContent = storageOk ? (progress.updatedAt ? (tr("ui.saved")) : '') : (tr("ui.browserStorageUnavailableExportYourRecord"));
    el.className = storageOk ? 'save-ok' : 'save-bad';
  }

  // ---- dialogs

  function openMap() {
    const dlg = $('#mapDialog');
    dlg.querySelector('.dlg-body').innerHTML = `<h2>${icon('map')} ${tr("ui.islandMapMIT6096Lecture")}</h2>
      <p class="muted small">${tr("ui.eachLectureCorrespondsToOneIsland")}</p>
      <ol class="chapters">${CHAPTERS.map((c) => {
        const list = chapterMissions(c.no);
        const available = c.playable && unlocked(c.no);
        const done = c.playable && list.every(x => rec(x).status === 'done');
        return `<li class="${available ? 'open' : 'locked'}"><span class="ch-no">${pixText(String(c.no), available ? 'k' : 'g', 3)}</span>
          <div><b>${esc(c.zone)}</b> <span class="muted">Lecture ${c.no} ${esc(c.lecture)} · ${esc(c.pages)}</span><br><small>${esc(c.action)}</small></div>
          <span class="ch-state">${available ? `<button class="btn small" data-mission="${list[0].id}">${done ? tr('ui.restored') : tr('ui.playable')}</button>` : c.playable ? tr('chapter.locked') : tr('chapter.later')}</span></li>`;
      }).join('')}</ol><p class="muted">${tr('chapter.optional')}</p>`;
    if (!dlg.open) dlg.showModal();
  }

  function openRecord() {
    const dlg = $('#recordDialog');
    const rows = MISSIONS.map((m) => {
      const r = rec(m);
      const errs = Object.entries(r.errors).map(([k, v]) => `${ERROR_TYPES[k]} ${v}`).join(', ') || '–';
      const status = { none: (tr("ui.notAttempted")), trying: (tr("ui.inProgress")), done: (tr("ui.complete2")) }[r.status];
      const heading = m === chapterMissions(chapterNo(m))[0] ? `<tr><th colspan="7">${esc(tr('chapter.number', { number: chapterNo(m) }))} · ${esc(CHAPTERS[chapterNo(m)-1].zone)}</th></tr>` : '';
      return `${heading}<tr><td>${m.id} ${esc(m.title)}</td><td>${status}</td><td>${r.applied ? (tr("ui.confirmed")) : '–'}</td><td>${r.attempts}</td><td>${r.hintLevel ? tr('format.hintLevel', { number: r.hintLevel, name: HINT_STEPS[r.hintLevel - 1] }) : (tr("ui.notViewed"))}</td><td>${esc(errs)}</td><td>${esc(r.reflection || '–')}</td></tr>`;
    }).join('');
    dlg.querySelector('.dlg-body').innerHTML = `<h2>${icon('record')} ${tr("ui.learningRecord")}</h2>
      <p class="muted small">${tr("ui.thisRecordIsStoredOnlyIn")}</p>
      <label class="btn"><input id="unlockAll" type="checkbox" ${settings.unlockAll ? 'checked' : ''}> ${tr('chapter.unlockAll')}</label>
      <div class="table-scroll"><table class="record"><tr><th>${tr("ui.mission")}</th><th>${tr("ui.progress")}</th><th>${tr("ui.appliedToOtherInputs")}</th><th>${tr("ui.runsChecks")}</th><th>${tr("ui.lastHint")}</th><th>${tr("ui.errorTypes")}</th><th>${tr("ui.finalExplanation")}</th></tr>${rows}</table></div>
      <div class="bench-actions">
        <button class="btn primary" data-action="export">${tr("ui.exportProgressJson")}</button>
        <label class="btn">${tr("ui.importProgress")}<input type="file" id="importFile" accept="application/json,.json" class="sr"></label>
        <button class="btn" data-action="summary">${tr("ui.tutorSummaryTxt")}</button>
        <button class="btn ghost danger" data-action="reset-all">${tr("ui.deleteAllRecords")}</button>
      </div>
      <p id="recordMsg" class="muted small" role="status"></p>
      <details class="credits"><summary>${tr("ui.graphicsAndSoundCredits")}</summary>
        <p>${tr("ui.charactersTilesBuildingsIconsAndFonts")}</p></details>`;
    if (!dlg.open) dlg.showModal();
  }

  function summaryText() {
    const lines = [(tr("ui.cCodeIslandRobotRecoveryTeam")), `${tr("ui.recordedAt")}${progress.updatedAt || (tr("ui.noRecord"))}`, ''];
    for (const m of MISSIONS) {
      if (m === chapterMissions(chapterNo(m))[0]) lines.push(`${tr('chapter.number', { number: chapterNo(m) })} · ${CHAPTERS[chapterNo(m)-1].zone}`);
      const r = rec(m);
      lines.push(`[${m.id} ${m.title}]`);
      lines.push(`${tr("ui.progress2")}${{ none: (tr("ui.notAttempted")), trying: (tr("ui.inProgress")), done: (tr("ui.missionComplete2")) }[r.status]}${tr("ui.appliedToOtherInputs2")}${r.applied ? (tr("ui.confirmed")) : (tr("ui.notConfirmed"))}`);
      lines.push(`${tr("ui.runsChecks2")}${r.attempts}${tr("ui.lastHint2")}${r.hintLevel ? tr('format.hintLevelSummary', { number: r.hintLevel, name: HINT_STEPS[r.hintLevel - 1] }) : (tr("ui.notViewed2"))}`);
      const errs = Object.entries(r.errors).map(([k, v]) => `${ERROR_TYPES[k]} ${v}${tr("ui.times")}`).join(', ');
      lines.push(`${tr("ui.errorTypes2")}${errs || (tr("ui.none2"))}`);
      for (const p of r.predictions) lines.push(`${tr("ui.question2")}${p.q}${tr("ui.predicted")}${p.answer}${tr("ui.actual")}${p.actual} (${p.correct ? (tr("ui.match2")) : (tr("ui.mismatch"))})`);
      lines.push(`${tr("ui.finalExplanation2")}${r.reflection || (tr("ui.none"))}`);
      lines.push('');
    }
    lines.push((tr("ui.missionCompletionAndApplicationToOther")));
    return lines.join('\n');
  }

  // ------------------------------------------------------------ navigation helpers

  function goMission(id) {
    const target = MISSIONS.find(m => m.id === id);
    if (!target || !unlocked(chapterNo(target))) return;
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
    if (d.variant) { invalidateRun(w); w.variant = d.variant; w.testIndex = 0; w.activeBlank = null; if (narrow()) ui.pane = 'code'; render(); return; }
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
        if (window.confirm((tr("ui.discardYourCodeAndRestoreThe")))) { invalidateRun(w); w.code = m.starter; w.editing = true; saveWork(); render(); }
        break;
      case 'restart':
        if (window.confirm(`${m.id}${tr("ui.missionWorkWillBeResetYour")}`)) {
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
      case 'toggle-language': {
        const oldMissions = MISSIONS;
        const lang = I18N.lang === 'ko' ? 'en' : 'ko';
        stopPlay();
        loadLanguage(lang);
        for (const old of oldMissions) {
          const current = MISSIONS.find((item) => item.id === old.id);
          const state = work[old.id];
          if (old.kind === 'editor' && state.code === old.starter) state.code = current.starter;
          invalidateRun(state);
          if (old.kind === 'order') { state.orderResult = null; state.lastCheck = null; }
          if (old.kind === 'editor') state.editing = true;
          if (state.phase === 'predict' && state.predict.submitted) {
            state.predict.submitted = false;
            state.predict.actual = null;
            state.predict.revealed = false;
          }
        }
        ui.resultUnseen = false;
        settings.lang = lang;
        writeStore(SETTINGS_KEY, settings);
        saveWork();
        render();
        if ($('#mapDialog').open) openMap();
        if ($('#recordDialog').open) openRecord();
        break;
      }
      case 'open-map': openMap(); break;
      case 'open-record': openRecord(); break;
      case 'close-dialog': t.closest('dialog').close(); break;
      case 'export': download(`cpp-code-island-progress-${today()}.json`, JSON.stringify(progress, null, 2), 'application/json'); break;
      case 'summary': download(`cpp-code-island-summary-${today()}.txt`, summaryText(), 'text/plain'); break;
      case 'reset-all':
        if (window.confirm((tr("ui.deleteProgressAndWorkForEvery")))) {
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
    if (t.id === 'chapterSelect') { const list = chapterMissions(Number(t.value)); if (list.length) goMission(list[0].id); return; }
    if (t.id === 'unlockAll') { settings.unlockAll = t.checked; writeStore(SETTINGS_KEY, settings); renderTopbar(); return; }
    if (t.id === 'importFile' && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          progress = normalizeProgress(JSON.parse(reader.result));
          saveProgress();
          openRecord();
          $('#recordMsg').textContent = (tr("ui.progressImported"));
          render();
        } catch (e) {
          const msg = $('#recordMsg');
          if (msg) msg.textContent = `${tr("ui.importFailed")}${e.message}`;
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
