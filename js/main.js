/* =========================================================
   main.js — 启动、输入、主循环（单机 / 主机 / 客户端）
   ========================================================= */
(function () {
  'use strict';

  const D = DATA;
  const STEP = 1 / 60;

  const canvas = document.getElementById('world');
  let st = null;               // 单机 / 主机
  let view = null;             // 客户端渲染状态
  let acc = 0, last = 0;
  let lastPhase = '';
  let mode = 'solo';           // solo | host | client | lobby
  let uiReady = false;
  let netStarted = false;

  const keys = {};
  const remoteInputs = {};
  let snapT = 0, detailT = 0;

  const params = new URLSearchParams(location.search);
  window.__forceTouch = params.get('touch') === '1';
  const BOT = params.get('bot') === '1';
  const FF = parseFloat(params.get('ff') || '0');
  const SCENE = params.get('scene');
  const ROOM = (params.get('room') || '').toUpperCase();
  const NAMEP = params.get('name') || '';

  function keyVec() {
    let mx = 0, my = 0;
    if (keys['w'] || keys['arrowup']) my -= 1;
    if (keys['s'] || keys['arrowdown']) my += 1;
    if (keys['a'] || keys['arrowleft']) mx -= 1;
    if (keys['d'] || keys['arrowright']) mx += 1;
    return { mx: mx, my: my };
  }

  function botStep(state, tt) {
    for (let bi = 0; bi < state.players[0].skills.length; bi++) SIM.castSkill(state, bi, state.players[0]);
    if (state.phase === 'combat' && state.players[0] && state.players[0].bag.length < 20) {
      const gi = SIM.nearestGroundItem(state, state.players[0].x, state.players[0].y, 34);
      if (gi) SIM.takeItem(state, state.players[0]);
    }
    if (state.phase === 'town') return { mx: 0, my: 0 };
    const p = state.player;
    if (!p) return { mx: 0, my: 0 };
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
      if (pk.kind !== 'gold' && pk.kind !== 'heal') continue;
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

  function localInput() {
    if (BOT) return botStep(st, performance.now() / 1000);
    const tv = UI.touchVector();
    if (tv) return tv;
    return keyVec();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    window.addEventListener('error', function (ev) {
      const el = document.getElementById('err');
      if (el) {
        el.classList.remove('hidden');
        el.textContent = '错误：' + (ev.message || ev) + ' @ ' + String(ev.filename || '').split('/').pop() + ':' + (ev.lineno || '');
      }
    });

    const DAILY = params.get('daily') === '1' && !!window.META;
    const seed = DAILY ? window.META.seedFor(window.META.dailyKey()) : 12345;
    const PARTY = Math.max(1, Math.min(4, parseInt(params.get('party') || '1', 10) || 1));
    st = SIM.create(seed, PARTY, (window.META ? window.META.bonus() : null));
    for (let i = 0; i < st.players.length; i++) {
      st.players[i].name = ['流亡者', '拾荒者', '守夜人', '旅商'][i] || ('队友' + i);
      st.players[i].x += (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 26;
      st.players[i].y += (i % 2 === 0 ? -1 : 1) * 16;
    }
    if (DAILY) st.dailyKey = window.META.dailyKey();
    RENDER.init(canvas);
    if (!ROOM) { UI.init(st); uiReady = true; } else { uiReady = false; }
    VIEWINIT();

    if (SCENE === 'town') { SIM.startTown(st); st.cycle = 2; }
    if (SCENE === 'rift') { SIM.openRiftChoice(st); }
    // 调试：?loot=1 在脚边撒几件不同稀有度的装备
    // 调试：?bag=1 背包里塞四件装备，方便看回收/丢弃按钮

    if (params.get('bag') === '1') {
      const slotsB = ['helm', 'body', 'ring', 'amulet'];
      for (let bi = 0; bi < 4; bi++) {
        st.players[0].bag.push(window.ENGINE.rollItem(slotsB[bi], 9, Math.random, bi));
      }
    }
    if (params.get('loot') === '1') {
      const me = st.players[0];
      const slots = ['helm', 'body', 'ring', 'amulet'];
      for (let li = 0; li < 4; li++) {
        const it = window.ENGINE.rollItem(slots[li], 8, Math.random, li);
        st.pickups.push({ kind: 'item', item: it, x: me.x + (li - 1.5) * 22, y: me.y - 34, t: 0, life: 60000, value: 0 });
      }
    }

    // 调试：?panel=talent|shop|smith|stash|market|bag|settings|gambler
    const panel = params.get('panel');
    if (panel) {
      if (panel === 'talent') UI.showTalent(st);
      else if (panel === 'shop') UI.showShop(st);
      else if (panel === 'smith') UI.showSmith(st);
      else if (panel === 'stash') UI.showStash(st);
      else if (panel === 'market') UI.showMarket(st);
      else if (panel === 'bag') UI.showBag(st);
      else if (panel === 'gambler') UI.showGambler(st);
      else if (panel === 'settings') UI.showSettings();
      else if (panel === 'altar') UI.showAltar();
      else if (panel === 'rune') UI.showRunes(st);
      else if (panel === 'skills') UI.showSkills(st);
      else if (panel === 'roster') UI.showRoster(st);
    }
    let sawTut = params.get('notut') === '1';
    try { sawTut = sawTut || localStorage.getItem('ashfall.tutorial') === '1'; } catch (e) {}
    let savedCls = null;
    try { const v = localStorage.getItem('ashfall.cls'); if (v !== null) savedCls = parseInt(v, 10); } catch (e) {}
    const CLSP = params.get('cls');
    const openRift = function () { SIM.openRiftChoice(st); };

    if (ROOM) {
      openRift();
    } else if (SCENE === 'town') {
      // 直接进主城
    } else if (BOT) {
      if (CLSP !== null) SIM.setClass(st, 0, parseInt(CLSP, 10));
      openRift();
    } else {
      const chooseClass = function () {
        const done = function (i) {
          SIM.setClass(st, 0, i);
          try { localStorage.setItem('ashfall.cls', String(i)); } catch (e) {}
          openRift();
        };
        if (CLSP !== null) { done(parseInt(CLSP, 10)); return; }
        if (savedCls !== null && sawTut) { done(savedCls); return; }
        UI.showClasses(done);
      };
      const startSolo = function () {
        if (!sawTut) UI.showTutorial(chooseClass);
        else chooseClass();
      };
      if (params.get('quick') === '1') { UI.hideStartMenu(); startSolo(); }
      else UI.showStartMenu(startSolo);
    }
    if (FF > 0) fastForward(FF);

    window.addEventListener('resize', function () { RENDER.resize(); });
    window.addEventListener('pointerdown', function () { AUDIO.unlock(); }, { once: true });
    window.addEventListener('keydown', function () { AUDIO.unlock(); }, { once: true });
    window.addEventListener('keydown', function (ev) {
      const k = ev.key.toLowerCase();
      keys[k] = true;
      if (UI.isOpen()) return;
      if (k === ' ') {
        if (st.player && st.player.downed) { ACT.run(st, 'giveup', []); }
        return;
      }
      if (k === 'f') {
        const rs = ACT.run(st, 'statue', []);
        if (rs && !rs.ok && rs.msg) UI.toast(rs.msg, 'bad');
        return;
      }
      if (k === 'm') { RENDER.toggleMinimap(); return; }
      if (k === '1' || k === '2' || k === '3') {
        const slot = parseInt(k, 10) - 1;
        if (st.player && st.player.rogueChoices && UI.isOpen()) {
          ACT.run(st, 'rogue', [slot]);
          UI.close();
          return;
        }
        const r = ACT.run(st, 'cast', [slot]);
        if (r && !r.ok && r.msg) UI.toast(r.msg, 'bad');
        return;
      }
      if (k === 'e') {
        if (st.phase === 'combat') {
          const g = SIM.nearestGroundItem(st, st.player.x, st.player.y, 34);
          if (g) {
            const r = ACT.run(st, 'take', []);
            if (r && r.ok) UI.playSfx('item');
            else if (r) UI.toast(r.msg, 'bad');
          } else doInteract();
        } else doInteract();
      }
      if (k === 'q') { if (ACT.run(st, 'potion', [])) UI.toast('饮下药水'); }
    });
    window.addEventListener('keyup', function (ev) { keys[ev.key.toLowerCase()] = false; });
    window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

    document.getElementById('gear-btn').onclick = function () { UI.showSettings(); };
    document.getElementById('tpbtn').onclick = function () { UI.showTalent(st); };
    const ab = document.getElementById('altar-btn');
    if (ab) ab.onclick = function () { UI.showAltar(); };
    document.getElementById('bagbtn').onclick = function () { UI.showBag(st); };
    document.getElementById('prompt').onclick = doInteract;

    // 地面物品悬停详情
    const cvEl = document.getElementById('world');
    if (cvEl) {
      cvEl.addEventListener('mousemove', function (ev) {
        if (st.phase !== 'combat' || (UI.isOpen && UI.isOpen())) { UI._tipHold = false; UI.hideTip(); return; }
        if (!RENDER.worldAt) return;
        const w = RENDER.worldAt(ev.clientX, ev.clientY);
        const pk = SIM.nearestGroundItem(st, w.x, w.y, 11);
        if (pk) {
          UI._tipHold = true;
          UI.showTip(UI.itemTipHTML(pk.item), ev.clientX, ev.clientY);
        } else {
          UI._tipHold = false;
          UI.hideTip();
        }
      });
      cvEl.addEventListener('mouseleave', function () { UI._tipHold = false; UI.hideTip(); });
    }
    const altarBtn = document.getElementById('altar-btn');
    if (altarBtn) altarBtn.onclick = function () { UI.showAltar(); };
    const runeBtn = document.getElementById('runebtn');
    if (runeBtn) runeBtn.onclick = function () { UI.showRunes(st); };
    const skillBtn = document.getElementById('skillbtn');
    if (skillBtn) skillBtn.onclick = function () { UI.showSkills(st); };

    if (ROOM && location.protocol !== 'file:') startNet();

    last = 0;
    requestAnimationFrame(frame);
  }

  function VIEWINIT() {}

  function doInteract() {
    if (UI.isOpen() || st.phase !== 'town') return;
    const id = SIM.interact(st);
    if (!id) { UI.toast('走近商人 / 铁匠 / 赌徒再按 E', 'bad'); return; }
    if (id === 'merchant') UI.showShop(st);
    else if (id === 'smith') UI.showSmith(st);
    else if (id === 'stash') UI.showStash(st);
    else if (id === 'market') UI.showMarket(st);
    else if (id === 'gambler') UI.showGambler(st);
  }

  function playEvent(e) {
    if (!e) return;
    if (e.t === 'item') AUDIO.play('item', { rarity: e.r });
    else AUDIO.play(e.t);

    // 打击反馈：震屏强度按事件类型分级
    if (window.RENDER && window.RENDER.addShake) {
      if (e.t === 'hurt') window.RENDER.addShake(2.4);
      else if (e.t === 'down') window.RENDER.addShake(6);
      else if (e.t === 'boss') window.RENDER.addShake(4.2);
      else if (e.t === 'crit') window.RENDER.addShake(0.8);
    }
  }

  function flushAudio(state) {
    if (!state || !state.events) return;
    for (let i = 0; i < state.events.length; i++) playEvent(state.events[i]);
    state.events.length = 0;
  }

  /* ---------------- 联机 ---------------- */
  function startNet() {
    mode = 'lobby';
    netStarted = true;
    UI.showLobby('连接中…', ROOM);

    NET.onJoined = function (m) {
      if (NET.isHost) becomeHost(m);
      else becomeClient(m);
      showInvite(m.room);
    };
    NET.onPeers = function (players) {
      UI.updateLobby(players, NET.id);
      if (mode === 'host') syncPlayers(players);
    };
    NET.onHost = function (id) {
      if (id === NET.id && mode === 'client') { rebuildAsHost(); return; }
      UI.toast(id === NET.id ? '你成为房主' : '房主已切换', 'good');
    };
    NET.onInput = function (m) {
      remoteInputs[m.id] = { mx: m.mx, my: m.my };
    };
    NET.onCmd = function (m) {
      if (mode !== 'host') return;
      const p = st.players.find(function (x) { return x.id === m.id; });
      if (!p) return;
      ACT.applyLocal(st, m.c, m.a, p);
    };
    NET.onSnap = function (d) {
      if (d.ev) for (let i = 0; i < d.ev.length; i++) playEvent(d.ev[i]);
      HOSTCORE.applySnapshot(view, d, NET.id);
      if (!uiReady) { UI.init(view); uiReady = true; }
    };
    NET.onDetails = function (m) {
      HOSTCORE.applyDetails(view, m);
    };
    NET.onFull = function () { UI.showLobby('房间已满（最多 4 人）', ROOM); };

    NET.join({ room: ROOM, name: NAMEP });
  }

  function showInvite(room) {
    const btn = document.getElementById('invite');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.textContent = '邀请队友 · ' + room;
    btn.onclick = function () {
      const url = location.origin + location.pathname + '?room=' + room;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { UI.toast('邀请链接已复制', 'good'); })
          .catch(function () { window.prompt('复制这个链接', url); });
      } else {
        window.prompt('复制这个链接', url);
      }
    };
  }

  function becomeHost(m) {
    mode = 'host';
    ACT.client = false;
    st = SIM.create((Date.now() % 100000) | 0, 1);
    SIM.setLocal(st, 0);
    if (m && m.id !== 0) st.players[0].id = m.id;
    remoteInputs[st.players[0].id] = { mx: 0, my: 0 };
    SIM.openRiftChoice(st);
    UI.hideLobby();
    UI.toast('房间 ' + ROOM + ' · 你是房主', 'good');
    lastPhase = '';
    acc = 0;
  }

  /* 房主掉线后，由客户端用明细重建世界 */
  function rebuildAsHost() {
    const det = (view && view.details) || null;
    st = SIM.create((Date.now() % 100000) | 0, 0);
    SIM.setLocal(st, NET.id);
    let n = 0;
    if (det) {
      const ids = Object.keys(det);
      for (let i = 0; i < ids.length; i++) {
        if (SIM.applyPlayerDetails(st, parseInt(ids[i], 10), det[ids[i]])) n++;
      }
    }
    if (!n) SIM.addPlayer(st, '玩家', NET.id);
    SIM.setLocal(st, NET.id);
    mode = 'host';
    ACT.client = false;
    UI.hideLobby();
    UI.toast('房主已离开，你接管了世界（从当前层继续）', 'good');
    lastPhase = '';
    acc = 0;
  }

  function becomeClient(m) {
    mode = 'client';
    ACT.client = true;
    view = HOSTCORE.makeView();
    view.localId = NET.id;
    UI.hideLobby();
    UI.toast('已加入房间 ' + ROOM, 'good');
  }

  function syncPlayers(list) {
    // 主机按 pid 维护玩家
    for (let i = 0; i < list.length; i++) {
      const info = list[i];
      const has = st.players.some(function (p) { return p.id === info.id; });
      if (!has) SIM.addPlayer(st, info.name, info.id);
    }
    const ids = {};
    for (let i = 0; i < list.length; i++) ids[list[i].id] = true;
    for (let i = st.players.length - 1; i >= 0; i--) {
      const p = st.players[i];
      if (p.id === NET.id) continue;
      if (!ids[p.id]) SIM.removePlayer(st, p.id);
    }
  }

  function hostBroadcast(ts) {
    if (mode !== 'host') return;
    if (ts - snapT > 66) {
      snapT = ts;
      NET.sendSnap(HOSTCORE.snapshot(st));
    }
    if (ts - detailT > 500) {
      detailT = ts;
      NET.sendDetails(HOSTCORE.details(st));
    }
  }

  /* ---------------- 快进（调试） ---------------- */
  function fastForward(seconds) {
    const n = Math.floor(seconds * 60);
    for (let i = 0; i < n; i++) {
      if (st.phase === 'dead') break;
      if (st.phase === 'rift') { SIM.chooseRift(st, 0); continue; }
      SIM.step(st, STEP, botStep(st, i / 60));
    }
  }

  /* ---------------- 主循环 ---------------- */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.25) dt = 0.25;

    if (mode === 'lobby') {
      RENDER.draw(st, ts / 1000);
      return;
    }

    if (mode === 'client') {
      const inp = localInput();
      NET.sendInput(ts, inp.mx, inp.my);
      HOSTCORE.smoothStep(view, Math.min(0.35, dt * 12));
      if (!view.player) return;
      RENDER.draw(view, ts / 1000);
      if (uiReady) UI.tick(view);
      document.title = 'C ' + (view.phaseT|0) + ' k' + view.kills + ' p' + view.players.length + ' e' + view.enemies.length;
      return;
    }

    const paused = UI.isOpen() || st.phase === 'dead' || st.phase === 'rift' || window.__menuOpen;

    if (!paused) {
      acc += dt;
      let guard = 0;
      const inp = localInput();
      while (acc >= STEP && guard++ < 5) {
        if (mode === 'host') {
          remoteInputs[st.players[0] ? st.players[0].id : 0] = inp;
          SIM.step(st, STEP, remoteInputs);
        } else {
          SIM.step(st, STEP, inp);
        }
        acc -= STEP;
        if (st.phase === 'dead') break;
      }
    } else {
      acc = 0;
    }

    RENDER.draw(st, ts / 1000);
    UI.tick(st);
    drawLootLabels(st);
    hostBroadcast(ts);
    flushAudio(st);
    handlePhase();
  }

  window.__st = function () { return st; };
  /* 地面掉落标签：用 DOM 渲染，比画布文字清晰 */
  const labelPool = [];
  function drawLootLabels(state) {
    const box = document.getElementById('labels');
    if (!box) return;
    if (!state || !state.pickups || state.phase === 'town') {
      if (box.childNodes.length) box.innerHTML = '';
      return;
    }
    const me = state.player;
    let used = 0;
    for (let i = 0; i < state.pickups.length && used < labelPool.length + 6; i++) {
      const pk = state.pickups[i];
      if (pk.dead || pk.kind !== 'item' || !pk.item) continue;
      if (me && Math.abs(pk.x - me.x) + Math.abs(pk.y - me.y) > 260) continue;
      const sp = window.RENDER && window.RENDER.worldToScreen ? window.RENDER.worldToScreen(pk.x, pk.y - 16) : null;
      if (!sp) continue;
      let el = labelPool[used];
      if (!el) {
        el = document.createElement('div');
        el.className = 'dlabel';
        box.appendChild(el);
        labelPool.push(el);
      }
      el.style.left = sp.x.toFixed(1) + 'px';
      el.style.top = sp.y.toFixed(1) + 'px';
      el.textContent = pk.item.name || '';
      el.style.color = (window.DATA && window.DATA.RARITY_COLOR[pk.item.rarity || 0]) || '#cfd8e8';
      el.style.display = '';
      used++;
    }
    for (let i = used; i < labelPool.length; i++) labelPool[i].style.display = 'none';
  }

  let rogueDebugDone = false;
  let statueDebugDone = false;
  function handlePhase() {
    if (params.get('statue') === '1' && !statueDebugDone && st.statue) {
      statueDebugDone = true;
      const sp = st.players[0];
      sp.x = st.statue.x + 10;
      sp.y = st.statue.y + 10;
      SIM.activateStatue(st, sp);
    }
    if (params.get('rogue') === '1' && st.phase === 'rift' && st.riftChoices && st.riftChoices.length) { SIM.chooseRift(st, 0); return; }
    if (params.get('rogue') === '1' && !rogueDebugDone && st.phase === 'combat' && st.player && SIM.classOf(st.player).rogue) {
      rogueDebugDone = true;
      SIM.gainXp(st, st.player, st.player.xpNext + 1);
    }
    if (BOT && st.player && st.player.rogueChoices) { SIM.pickRogue(st, 0, st.player); return; }
    if (st.phase === 'combat' && st.player && st.player.rogueChoices && st.player.rogueChoices.length && !UI.isOpen()) {
      UI.showRogue(st, function (i) {
        ACT.run(st, 'rogue', [i]);
        if (st.player) st.player.rogueChoices = null;
      });
      return;
    }
    if (BOT && st.phase === 'rift') { SIM.chooseRift(st, 0); lastPhase = ''; return; }
    if (mode !== 'client' && st.phase === 'rift' && !UI.isOpen()) {
      lastPhase = 'rift';
      UI.showRift(st, st.riftChoices, function (i) {
        UI.close();
        SIM.chooseRift(st, i);
        lastPhase = '';
      });
      return;
    }
    if (st.phase === 'dead' && lastPhase !== 'dead') {
      lastPhase = 'dead';
      let reward = null;
      if (window.META) reward = window.META.record(st);
      UI.showEnd(st, function () { location.reload(); }, reward);
    }
  }

  /* 调试 */
  window.__st = function () { return st; };
  window.__view = function () { return view; };
  window.__mode = function () { return mode; };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
