/* =========================================================
   audio.js — WebAudio 合成音效（零素材）
   所有声音都是振荡器 + 噪声现场算出来的。
   ========================================================= */
(function (root) {
  'use strict';

  const A = {
    ctx: null,
    master: null,
    vol: 0.55,
    muted: false,
    lastTime: {},
    ready: false
  };

  function ensure() {
    if (A.ctx) return A.ctx;
    const C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    try {
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : A.vol;
      A.master.connect(A.ctx.destination);
      A.ready = true;
    } catch (e) { A.ctx = null; }
    return A.ctx;
  }

  A.unlock = function () {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  };

  A.setVolume = function (v) {
    A.vol = Math.max(0, Math.min(1, v));
    if (A.master) A.master.gain.value = A.muted ? 0 : A.vol;
    try { localStorage.setItem('ashfall.vol', String(A.vol)); } catch (e) {}
  };

  A.toggleMute = function () {
    A.muted = !A.muted;
    if (A.master) A.master.gain.value = A.muted ? 0 : A.vol;
    try { localStorage.setItem('ashfall.muted', A.muted ? '1' : '0'); } catch (e) {}
    return A.muted;
  };

  /* ---------------- 基础发声 ---------------- */
  function env(gain, t0, attack, decay, peak) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(opt) {
    const c = A.ctx;
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    const t0 = c.currentTime + (opt.delay || 0);
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t0 + (opt.dur || 0.12));
    env(g, t0, opt.attack || 0.004, opt.dur || 0.12, opt.vol || 0.2);
    o.connect(g);
    g.connect(A.master);
    o.start(t0);
    o.stop(t0 + (opt.dur || 0.12) + 0.06);
  }

  function noiseBurst(opt) {
    const c = A.ctx;
    if (!c) return;
    const len = Math.floor(c.sampleRate * (opt.dur || 0.12));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = opt.filter || 'lowpass';
    f.frequency.setValueAtTime(opt.cut || 900, c.currentTime);
    if (opt.cutTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, opt.cutTo), c.currentTime + (opt.dur || 0.12));
    const g = c.createGain();
    env(g, c.currentTime, 0.003, opt.dur || 0.12, opt.vol || 0.15);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start();
  }

  /* ---------------- 配方 ---------------- */
  const RECIPES = {
    hit: function (o) {
      tone({ freq: 200 + (o && o.pitch || 0), to: 120, dur: 0.07, vol: 0.10, type: 'square' });
      noiseBurst({ dur: 0.05, vol: 0.05, cut: 1800, cutTo: 400 });
    },
    crit: function () {
      tone({ freq: 520, to: 260, dur: 0.10, vol: 0.16, type: 'sawtooth' });
      tone({ freq: 780, dur: 0.06, vol: 0.10, type: 'square', delay: 0.02 });
      noiseBurst({ dur: 0.08, vol: 0.08, cut: 3200, cutTo: 800 });
    },
    kill: function () {
      noiseBurst({ dur: 0.16, vol: 0.10, cut: 900, cutTo: 120 });
      tone({ freq: 110, to: 60, dur: 0.14, vol: 0.09, type: 'triangle' });
    },
    hurt: function () {
      tone({ freq: 220, to: 80, dur: 0.22, vol: 0.18, type: 'sawtooth' });
      noiseBurst({ dur: 0.14, vol: 0.10, cut: 600 });
    },
    gold: function () {
      tone({ freq: 880, dur: 0.05, vol: 0.07, type: 'sine' });
      tone({ freq: 1320, dur: 0.06, vol: 0.06, type: 'sine', delay: 0.045 });
    },
    item: function (o) {
      const r = (o && o.rarity) || 0;
      const base = [520, 600, 660, 760][Math.min(3, r)];
      tone({ freq: base, dur: 0.08, vol: 0.09, type: 'triangle' });
      tone({ freq: base * 1.5, dur: 0.10, vol: 0.08, type: 'triangle', delay: 0.06 });
      if (r >= 2) tone({ freq: base * 2, dur: 0.14, vol: 0.09, type: 'sine', delay: 0.13 });
    },
    level: function () {
      const seq = [523, 659, 784, 1046];
      for (let i = 0; i < seq.length; i++) {
        tone({ freq: seq[i], dur: 0.12, vol: 0.10, type: 'triangle', delay: i * 0.075 });
      }
    },
    boss: function () {
      tone({ freq: 70, to: 42, dur: 0.9, vol: 0.20, type: 'sawtooth' });
      noiseBurst({ dur: 0.9, vol: 0.10, cut: 400, cutTo: 80 });
    },
    cast: function (o) {
      const s = (o && o.skill) || 'fireball';
      if (s === 'fireball') { tone({ freq: 300, to: 520, dur: 0.9, vol: 0.05, type: 'sawtooth' }); }
      else if (s === 'bolt') { tone({ freq: 900, to: 400, dur: 0.10, vol: 0.06, type: 'square' }); }
      else if (s === 'frostnova') { tone({ freq: 700, to: 240, dur: 0.30, vol: 0.07, type: 'sine' }); }
      else if (s === 'meteor') { tone({ freq: 160, to: 60, dur: 0.5, vol: 0.08, type: 'sawtooth' }); }
      else { tone({ freq: 420, to: 300, dur: 0.07, vol: 0.05, type: 'triangle' }); }
    },
    ui: function () { tone({ freq: 620, dur: 0.04, vol: 0.05, type: 'square' }); },
    buy: function () {
      tone({ freq: 660, dur: 0.06, vol: 0.08, type: 'triangle' });
      tone({ freq: 990, dur: 0.09, vol: 0.07, type: 'triangle', delay: 0.06 });
    },
    craft: function () {
      noiseBurst({ dur: 0.10, vol: 0.10, cut: 2400, cutTo: 600 });
      tone({ freq: 300, to: 700, dur: 0.18, vol: 0.08, type: 'square', delay: 0.05 });
    },
    portal: function () {
      tone({ freq: 180, to: 720, dur: 0.5, vol: 0.10, type: 'sine' });
    }
  };

  /* 节流：同名音效 35ms 内只响一次 */
  A.play = function (name, opt) {
    if (!A.ready || A.muted) return;
    const c = A.ctx;
    if (!c || c.state === 'suspended') return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const last = A.lastTime[name] || 0;
    if (now - last < 35) return;
    A.lastTime[name] = now;
    const fn = RECIPES[name];
    if (fn) { try { fn(opt); } catch (e) {} }
  };

  try {
    const v = localStorage.getItem('ashfall.vol');
    if (v !== null) A.vol = parseFloat(v) || 0.55;
    A.muted = localStorage.getItem('ashfall.muted') === '1';
  } catch (e) {}

  root.AUDIO = A;
})(window);
