/* 선택 효과음: WebAudio 사각파로 즉석 합성한다(음원 파일 없음). 기본값은 꺼짐. */
(function (global) {
  'use strict';

  let ac = null;
  let enabled = false;

  const PATTERNS = {
    step: [[660, 0.04]],
    change: [[520, 0.05], [780, 0.06]],
    place: [[440, 0.05]],
    error: [[220, 0.09], [165, 0.14]],
    success: [[523, 0.08], [659, 0.08], [784, 0.08], [1046, 0.16]],
  };

  function play(name) {
    if (!enabled || !PATTERNS[name]) return;
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      let at = ac.currentTime;
      for (const [freq, dur] of PATTERNS[name]) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.05, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start(at);
        osc.stop(at + dur);
        at += dur;
      }
    } catch (e) {
      enabled = false;
    }
  }

  global.Sfx = {
    play,
    setEnabled(on) { enabled = !!on; },
    get enabled() { return enabled; },
  };
})(this);
