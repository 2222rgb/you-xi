/* =========================================================
   main.js — 启动、输入、主循环
   ========================================================= */
(function () {
  'use strict';

  const D = DATA;
  const STEP = 1 / 60;

  const canvas = document.getElementById('world');
  let st = null;
  let acc = 0, last = 0;
  let paused = false;
  let lastPhase = '';
  let started = false;

  const input = { mx: 0, my: 0 };
  const keys = {};

  /* 调试参数：?bot=1 自动绕圈，&ff=45 快进 45 秒（用于无头截图验证） */
  const params = new URLSearchParams(location.search);
  const BOT = params.get('bot') === '1';
  const FF = parseFloat(params.get('ff') || '0');

  function keyVec() {
    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    return { mx: mx, my: my };
  }

  function botVec() {
    return botStep(st, performance.now() / 1000);
  }

  /* 测试机器人：捡经验 + 躲贴身，用来做无头截图与平衡验证 */
  function botStep(state, tt) {
    const p = state.player;
    let fx = 0, fy = 0;
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.dead) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 44 && d > 0.01) {
        const w = (44 - d) / 44;
        fx += (dx / d) * w * 1.6;
        fy += (dy / d) * w * 1.6;
      }
    }
    let best = null, bd = 240 * 240;
    for (let i = 0; i < state.pickups.length; i++) {
      const pk = state.pickups[i];
      if (pk.kind !== 'xp' && pk.kind !== 'heal') continue;
      const d = (pk.x - p.x) * (pk.x - p.x) + (pk.y - p.y) * (pk.y - p.y);
      if (d < bd) { bd = d; best = pk; }
    }
    if (best) {
      const dx = best.x - p.x, dy = best.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      fx += (dx / d) * 1.3;
      fy += (dy / d) * 1.3;
    }
    fx += Math.cos(tt * 0.5) * 0.3;
    fy += Math.sin(tt * 0.5) * 0.3;
    const world = D.CONFIG.worldSize;
    if (p.x < 160) fx += 1.2;
    if (p.x > world - 160) fx -= 1.2;
    if (p.y < 160) fy += 1.2;
    if (p.y > world - 160) fy -= 1.2;
    const len = Math.hypot(fx, fy);
    if (len > 0.001) { fx /= len; fy /= len; }
    return { mx: fx, my: fy };
  }

  function currentInput() {
    if (BOT) return botVec();
    return keyVec();
  }

  /* ---------------- 初始化 ---------------- */
  function newRun() {
    st = SIM.create((Date.now() % 100000) | 0);
    UI.close();
    UI.init(st, {});
    lastPhase = '';
    acc = 0;
    RENDER.init(canvas);
  }

  function boot() {
    window.addEventListener('error', function (ev) {
      const el = document.getElementById('err');
      if (el) {
        el.classList.remove('hidden');
        el.textContent = '错误：' + (ev.message || ev) + ' @ ' + String(ev.filename || '').split('/').pop() + ':' + (ev.lineno || '');
      }
    });

    RENDER.init(canvas);
    st = SIM.create(12345);
    UI.init(st, {});

    window.addEventListener('resize', function () { RENDER.resize(); });

    window.addEventListener('keydown', function (ev) {
      const k = ev.key.toLowerCase();
      keys[k] = true;
      if (k === 'tab') {
        ev.preventDefault();
        toggleBag();
      }
      if (k === 'escape' && UI.isOpen() && st.phase === 'run') {
        UI.close();
      }
    });
    window.addEventListener('keyup', function (ev) {
      keys[ev.key.toLowerCase()] = false;
    });
    window.addEventListener('blur', function () {
      for (const k in keys) keys[k] = false;
    });

    if (FF > 0) fastForward(FF);

    last = 0;
    requestAnimationFrame(frame);
  }

  function toggleBag() {
    if (st.phase !== 'run') return;
    if (UI.isOpen()) { UI.close(); return; }
    UI.showInventory(st,
      function (item) {
        const i = st.bag.indexOf(item);
        if (i >= 0) st.bag.splice(i, 1);
        return SIM.equip(st, item);
      },
      function (slot) { SIM.unequip(st, slot); }
    );
  }

  /* ---------------- 快进（仅调试） ---------------- */
  function fastForward(seconds) {
    const n = Math.floor(seconds * 60);
    for (let i = 0; i < n; i++) {
      if (st.phase === 'levelup') {
        const ch = SIM.rollChoices(st);
        if (ch.length) SIM.applyChoice(st, ch[0]);
        else st.phase = 'run';
        continue;
      }
      if (st.phase !== 'run') break;
      SIM.step(st, STEP, botStep(st, i / 60));
    }
    if (st.phase === 'levelup') {
      const ch = SIM.rollChoices(st);
      if (ch.length) SIM.applyChoice(st, ch[0]);
    }
    st.phase = st.phase === 'dead' || st.phase === 'win' ? st.phase : 'run';
  }

  /* ---------------- 主循环 ---------------- */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;

    paused = UI.isOpen() || st.phase !== 'run';

    if (!paused) {
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 5) {
        SIM.step(st, STEP, currentInput());
        acc -= STEP;
        if (st.phase !== 'run') break;
      }
    } else {
      acc = 0;
    }

    RENDER.draw(st, ts / 1000);
    UI.tick(st);
    UI.syncToasts(st);
    handlePhase();
  }

  function handlePhase() {
    if (st.phase === lastPhase) return;

    if (st.phase === 'levelup') {
      const choices = SIM.rollChoices(st);
      if (!choices.length) { st.phase = 'run'; return; }
      lastPhase = 'levelup';
      UI.showLevelUp(st, choices, function (choice) {
        SIM.applyChoice(st, choice);
        lastPhase = '';
      });
      return;
    }

    if (st.phase === 'dead' || st.phase === 'win') {
      lastPhase = st.phase;
      UI.showEnd(st, st.phase === 'win', function () {
        newRun();
      });
      return;
    }

    lastPhase = st.phase;
  }

  /* 供调试 */
  window.__st = function () { return st; };
  window.__sim = SIM;
  window.__render = RENDER;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
