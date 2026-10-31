/* =========================================================
   hostcore.js — 主机侧的状态打包（浏览器与 Node 共用）
   快照只带渲染需要的字段，明细带 UI 需要的字段。
   ========================================================= */
(function (root) {
  'use strict';

  const SPRITE_R = { slime: 5, bat: 5, skel: 5, wraith: 5, brute: 7, boss: 11 };

  function r1(v) { return Math.round(v * 10) / 10; }

  /** 15Hz 实体快照 */
  function snapshot(st) {
    const ps = [];
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      ps.push([p.id, r1(p.x), r1(p.y), Math.round(p.hp), Math.round(p.maxHp), p.face, p.alive ? 1 : 0, r1(p.pickup || 26), Math.round(p.frenzy || 0), r1(p.frenzyT || 0), p.downed ? 1 : 0, Math.round(p.downT || 0), Math.round((p.reviveProg || 0) * 10) / 10]);
    }
    const es = [];
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      es.push([e.id, r1(e.x), r1(e.y), Math.round((e.hp / e.maxHp) * 100), e.sprite, e.elite ? 1 : 0, e.boss ? 1 : 0, e.chill > 0 ? 1 : 0, e.burn > 0 ? 1 : 0]);
    }
    const ss = [];
    for (let i = 0; i < st.shots.length; i++) {
      const s = st.shots[i];
      ss.push([r1(s.x), r1(s.y), s.kind, Math.round(s.vx), Math.round(s.vy), r1(s.spin)]);
    }
    const gs = [];
    for (let i = 0; i < st.pickups.length; i++) {
      const g = st.pickups[i];
      gs.push([r1(g.x), r1(g.y), g.kind, g.item ? g.item.rarity : 0, g.item ? g.item.name : '']);
    }
    return {
      t: st.phase, pt: r1(st.phaseT), cy: st.cycle, near: st.nearNpc || 0, k: st.kills,
      ps: ps, es: es, ss: ss, gs: gs, ev: (st.events || []).slice(0, 12), rf: st.rift ? st.rift.name : '',
      rk: st.rate ? st.rate.rank : 0, ron: st.statue && st.statue.on ? 1 : 0, rs: st.rate ? Math.round(st.rate.score) : 0,
      evt: st.event ? [st.event.type, Math.max(0, Math.round(st.event.t))] : null,
      eh: (st.eshots || []).map(function (s) { return [r1(s.x), r1(s.y)]; })
    };
  }

  /** 2Hz 玩家明细（客户端 UI 用） */
  function details(st) {
    const out = {};
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      out[p.id] = {
        n: p.name, lv: p.level, xp: Math.round(p.xp), xpN: p.xpNext,
        g: p.gold, po: p.potions, tp: p.talentPoints,
        sk: p.skills.map(function (s) { return { i: s.id, r: s.rank, cd: r1(s.cd) }; }),
        tl: p.talents, ts: p.treeSpent,
        ge: p.gear, bg: p.bag
      };
    }
    return { t: 'details', d: out, shop: st.shop, stash: st.stash };
  }

  /* ---------------- 客户端：把快照变成可渲染的 view ---------------- */
  function makeView() {
    return {
      phase: 'combat', phaseT: 0, cycle: 1, nearNpc: null,
      players: [], enemies: [], shots: [], pickups: [], zones: [], fx: [], texts: [],
      player: null, localId: 0, details: null, shop: [], stash: [], kills: 0, skills: {}, agg: {}, toasts: [], eshots: []
    };
  }

  function applySnapshot(view, snap, localId) {
    view.phase = snap.t;
    view.phaseT = snap.pt;
    view.kills = snap.k || 0;
    view.riftName = snap.rf || '';
    view.rateRank = snap.rk || 0;
    view.statueOn = !!snap.ron;
    view.rateScore = snap.rs || 0;
    view.event = snap.evt || null;
    view.cycle = snap.cy;
    view.nearNpc = snap.near || null;

    const players = [];
    for (let i = 0; i < snap.ps.length; i++) {
      const a = snap.ps[i];
      const d = (view.details && view.details[a[0]]) || null;
      players.push({
        id: a[0], x: a[1], y: a[2], hp: a[3], maxHp: a[4],
        face: a[5], alive: !!a[6], pickup: a[7], frenzy: a[8] || 0, frenzyT: a[9] || 0, downed: !!a[10], downT: a[11] || 0, reviveProg: a[12] || 0,
        name: (d && d.n) || ('P' + a[0]),
        level: (d && d.lv) || 1,
        moving: false, invuln: 0, hurtFlash: 0, walkT: 0,
        xp: (d && d.xp) || 0, xpNext: (d && d.xpN) || 1,
        gold: (d && d.g) || 0, potions: (d && d.po) || 0, talentPoints: (d && d.tp) || 0,
        skills: (d && d.sk.map(function (s) { return { id: s.i, rank: s.r, cd: s.cd }; })) || [],
        bag: (d && d.bg) || [], gear: (d && d.ge) || {},
        talents: (d && d.tl) || {}, treeSpent: (d && d.ts) || {}
      });
    }
    view.players = players;
    view.localId = localId;
    view.player = players.find(function (p) { return p.id === localId; }) || players[0];

    const enemies = [];
    for (let i = 0; i < snap.es.length; i++) {
      const a = snap.es[i];
      enemies.push({
        id: a[0], x: a[1], y: a[2], hp: a[3], maxHp: 100, hpPct: a[3],
        sprite: a[4], r: SPRITE_R[a[4]] || 5,
        elite: !!a[5], boss: !!a[6], chill: a[7], burn: a[8],
        flash: 0, wobble: a[4] === 'bat', seed: a[0] % 6.28, t: 0
      });
    }
    view.enemies = enemies;

    const shots = [];
    for (let i = 0; i < snap.ss.length; i++) {
      const a = snap.ss[i];
      shots.push({ x: a[0], y: a[1], kind: a[2], vx: a[3], vy: a[4], spin: a[5], r: 5, color: '#ff8a3d' });
    }
    view.shots = shots;

    const picks = [];
    for (let i = 0; i < snap.gs.length; i++) {
      const a = snap.gs[i];
      picks.push({ x: a[0], y: a[1], kind: a[2], t: 0, item: { rarity: a[3] || 0, name: a[4] || '' } });
    }
    view.pickups = picks;

    const eh = [];
    if (snap.eh) for (let i = 0; i < snap.eh.length; i++) eh.push({ x: snap.eh[i][0], y: snap.eh[i][1] });
    view.eshots = eh;
  }

  function applyDetails(view, msg) {
    view.details = msg.d;
    view.shop = msg.shop || [];
    view.stash = msg.stash || [];
    // 把明细塞回本地玩家，供 UI 使用
    const me = view.players.find(function (p) { return p.id === view.localId; });
    if (!me) return;
    const d = msg.d[view.localId];
    if (!d) return;
    me.name = d.n; me.level = d.lv; me.xp = d.xp; me.xpNext = d.xpN;
    me.gold = d.g; me.potions = d.po; me.talentPoints = d.tp;
    me.skills = d.sk.map(function (s) { return { id: s.i, rank: s.r, cd: s.cd }; });
    me.talents = d.tl; me.treeSpent = d.ts;
    me.gear = d.ge; me.bag = d.bg;
  }

  /* 在原始快照应用之上加一层插值：保留旧位置，记录目标位置 */
  function applySnapshotSmooth(view, snap, localId) {
    const prevP = {}, prevE = {}, prevS = view.shots.slice();
    for (let i = 0; i < view.players.length; i++) prevP[view.players[i].id] = view.players[i];
    for (let i = 0; i < view.enemies.length; i++) prevE[view.enemies[i].id] = view.enemies[i];

    applySnapshot(view, snap, localId);

    for (let i = 0; i < view.players.length; i++) {
      const p = view.players[i], o = prevP[p.id];
      p.tx = p.x; p.ty = p.y;
      if (o) { p.x = o.x; p.y = o.y; }
    }
    for (let i = 0; i < view.enemies.length; i++) {
      const e = view.enemies[i], o = prevE[e.id];
      e.tx = e.x; e.ty = e.y;
      if (o) { e.x = o.x; e.y = o.y; }
    }
    for (let i = 0; i < view.shots.length; i++) {
      const s = view.shots[i], o = prevS[i];
      s.tx = s.x; s.ty = s.y;
      if (o) { s.x = o.x; s.y = o.y; }
    }
  }

  function smoothStep(view, k) {
    for (let i = 0; i < view.players.length; i++) {
      const p = view.players[i];
      if (p.tx !== undefined) { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; }
    }
    for (let i = 0; i < view.enemies.length; i++) {
      const e = view.enemies[i];
      if (e.tx !== undefined) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
    }
    for (let i = 0; i < view.shots.length; i++) {
      const s = view.shots[i];
      if (s.tx !== undefined) { s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k; }
    }
  }

  root.HOSTCORE = {
    snapshot: snapshot, details: details,
    makeView: makeView, applySnapshot: applySnapshotSmooth, applyDetails: applyDetails,
    smoothStep: smoothStep, SPRITE_R: SPRITE_R
  };
})(typeof window !== 'undefined' ? window : globalThis);
