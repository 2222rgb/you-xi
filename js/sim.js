/* =========================================================
   sim.js — 世界模拟（纯逻辑，不碰 DOM）
   支持 N 个玩家（联机时主机跑这一份）。两段循环：战斗 180s → 主城 60s。
   ========================================================= */
(function (root) {
  'use strict';

  const D = root.DATA, E = root.ENGINE, CFG = D.CONFIG;
  const TAU = Math.PI * 2;
  const BAG_CAP = 24;

  /* ---------------- 随机 ---------------- */
  function rand(st) {
    st.rngS = (st.rngS + 0x6D2B79F5) | 0;
    let t = Math.imul(st.rngS ^ (st.rngS >>> 15), 1 | st.rngS);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rr(st, a, b) { return a + (b - a) * rand(st); }
  function ri(st, a, b) { return Math.floor(rr(st, a, b + 1)); }
  function pick(st, arr) { return arr[Math.floor(rand(st) * arr.length)]; }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  /* ---------------- 玩家 ---------------- */
  function classOf(p) {
    for (let i = 0; i < D.CLASSES.length; i++) if (D.CLASSES[i].id === p.cls) return D.CLASSES[i];
    return D.CLASSES[0];
  }

  function makePlayer(st, id, name, classId) {
    const cls = D.CLASSES[(classId === undefined || classId === null) ? id % D.CLASSES.length : classId] || D.CLASSES[0];
    const p = {
      id: id, name: name || ('流亡者' + (id + 1)),
      x: CFG.worldSize / 2 + (id - 1) * 28,
      y: CFG.worldSize / 2 + 20,
      hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: E.xpForLevel(1),
      speed: CFG.baseSpeed, pickup: CFG.pickupRange,
      face: 1, invuln: 2, hurtFlash: 0, walkT: 0, moving: false,
      skills: [], talents: {}, treeSpent: { blade: 0, ember: 0, storm: 0 }, talentPoints: 0,
      gold: 0, potions: 2, potionCd: 0, frenzy: 0, frenzyT: 0, boxes: 0,
      downed: false, downT: 0, reviveProg: 0,
      gear: { helm: null, body: null, ring: null, amulet: null },
      bag: [],
      alive: true
    };
    p.cls = cls.id;
    p.speed = CFG.baseSpeed * (cls.speed || 1);
    p.talents = {};
    p.talents[cls.talent] = 1;
    p.treeSpent = { blade: 0, ember: 0, storm: 0 };
    const entry = D.TALENT_INDEX && D.TALENT_INDEX[cls.talent];
    if (entry && entry.tree) p.treeSpent[entry.tree] = 1;
    p.skills = [{ id: cls.skill, rank: 1, cd: 0 }];
    return p;
  }

  function setClass(st, pid, classId) {
    let p = null;
    for (let i = 0; i < st.players.length; i++) if (st.players[i].id === pid) p = st.players[i];
    if (!p) return false;
    const cls = D.CLASSES[classId % D.CLASSES.length];
    if (!cls) return false;
    p.cls = cls.id;
    p.speed = CFG.baseSpeed * (cls.speed || 1);
    p.talents = {};
    p.talents[cls.talent] = 1;
    p.treeSpent = { blade: 0, ember: 0, storm: 0 };
    const entry = D.TALENT_INDEX && D.TALENT_INDEX[cls.talent];
    if (entry && entry.tree) p.treeSpent[entry.tree] = 1;
    p.skills = [{ id: cls.skill, rank: 1, cd: 0 }];
    recompute(st, p);
    p.hp = p.maxHp;
    return true;
  }

  function create(seed, playerCount, metaBonus) {
    const n = Math.max(0, Math.min(4, playerCount === undefined ? 1 : playerCount));
    const st = {
      seed: seed || 1,
      rngS: (seed || 1) | 0,
      t: 0,
      phase: 'combat',
      phaseT: 0,
      cycle: 1,

      players: [],
      localId: 0,
      stash: [],

      enemies: [], eshots: [], nextId: 1, events: [], hitCount: 0,
      shots: [], zones: [], pickups: [], texts: [], fx: [], toasts: [],

      kills: 0, goldEarned: 0,
      spawnAcc: 0, bossSpawned: false, bossId: 0,
      nearNpc: null,

      shop: [], marketStock: [],
      rift: null, riftChoices: [], bossKills: 0, dailyKey: '', started: false,
      event: null, eventCd: 40,
      meta: metaBonus || { startGold: 0, goldMul: 0, hp: 0, talent: 0, drop: 0, riftChoice: 0, heirloom: 0, frenzy: 0 },
      agg: null, skills: {}, depth: 1,
      cleanAcc: 0
    };
    for (let i = 0; i < n; i++) st.players.push(makePlayer(st, i, '流亡者' + (i + 1)));
    for (let i = 0; i < n; i++) {
      const p = st.players[i];
      p.gold = st.meta.startGold || 0;
      p.talentPoints = (p.talentPoints || 0) + (st.meta.talent || 0);
      if (st.meta.heirloom) {
        const it = E.rollItem(pick(st, D.SLOTS), 8, rand.bind(null, st), 2);
        p.bag.push(it);
      }
    }
    st.player = st.players[0] || null;
    for (let i = 0; i < n; i++) recompute(st, st.players[i]);
    for (let i = 0; i < n; i++) st.players[i].hp = st.players[i].maxHp;
    rollShop(st);
    return st;
  }

  function localPlayer(st) { return st.players[st.localId] || st.players[0] || null; }
  function setLocal(st, id) { st.localId = id; st.player = localPlayer(st); }
  function alivePlayers(st) {
    const out = [];
    for (let i = 0; i < st.players.length; i++) if (st.players[i].alive) out.push(st.players[i]);
    return out;
  }

  /* ---------------- 属性重算 ---------------- */
  function tagCounts(gear) {
    const counts = {};
    for (let i = 0; i < D.SLOTS.length; i++) {
      const it = gear[D.SLOTS[i]];
      if (!it) continue;
      for (let j = 0; j < it.mods.length; j++) {
        const m = it.mods[j];
        if (!m.t) continue;
        counts[m.t] = (counts[m.t] || 0) + 1;
      }
    }
    return counts;
  }

  function resonanceMods(gear) {
    const counts = tagCounts(gear);
    const out = [];
    const active = [];
    for (const tag in D.RESONANCE) {
      const def = D.RESONANCE[tag];
      const n = counts[tag] || 0;
      def.tiers.forEach(function (t) {
        if (n >= t.n) {
          for (let i = 0; i < t.mods.length; i++) out.push(t.mods[i]);
          active.push({ tag: tag, n: t.n, label: t.label });
        }
      });
    }
    return { mods: out, active: active, counts: counts };
  }

  function recompute(st, p) {
    if (!p) p = localPlayer(st);
    const res = resonanceMods(p.gear);
    p.resonance = res.active;
    const cls = classOf(p);
    const agg = E.buildAgg(p.gear, p.talents, res.mods.concat(cls.mods || []));
    p.agg = agg;
    const maxHp = Math.max(1, Math.round((CFG.baseHp + CFG.hpPerLevel * (p.level - 1) + agg.life + ((st.meta && st.meta.hp) || 0)) * (1 + agg.lifePct) * (cls.hp || 1)));
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = maxHp;
    p.hp = Math.min(maxHp, Math.max(1, Math.round(maxHp * ratio)));
    p.speed = CFG.baseSpeed * (1 + agg.move);
    p.pickup = CFG.pickupRange * (1 + agg.pickup);
    p.skillCalc = {};
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      p.skillCalc[s.id] = E.computeSkill(s.id, skillLevel(p, s), agg);
    }
    if (p === localPlayer(st)) {
      st.agg = agg;
      st.skills = p.skillCalc;
    }
  }

  function recomputeAll(st) {
    for (let i = 0; i < st.players.length; i++) recompute(st, st.players[i]);
    st.agg = localPlayer(st).agg;
    st.skills = localPlayer(st).skillCalc;
  }

  function skillLevel(p, s) { return Math.min(D.MAX_SKILL_LEVEL, s.rank || 1); }

  function syncSkillRank(p, skillId, rank) {
    const s = p.skills.find(function (x) { return x.id === skillId; });
    if (!s) { p.skills.push({ id: skillId, rank: rank, cd: 0 }); return; }
    s.rank = rank;
  }

  function addSkill(st, p, id) {
    if (!p) p = localPlayer(st);
    if (p.skills.length >= 3) return false;
    if (p.skills.some(function (s) { return s.id === id; })) return false;
    p.skills.push({ id: id, rank: 1, cd: 0 });
    recompute(st, p);
    return true;
  }

  /* ---------------- 提示 ---------------- */
  function toast(st, text, kind) {
    st.toasts.push({ text: text, kind: kind || '', t: 0 });
    if (st.toasts.length > 6) st.toasts.shift();
  }

  function addText(st, x, y, val, crit, color) {
    if (st.texts.length > 60) st.texts.shift();
    st.texts.push({
      x: x + (rand(st) - 0.5) * 4, y: y - 6,
      v: val, crit: !!crit, t: 0, life: 0.55,
      color: color || (crit ? '#ffe066' : '#e8e2d0')
    });
  }

  function ev(st, type, data) {
    if (st.events.length > 16) return;
    const e = { t: type };
    if (data) for (const k in data) e[k] = data[k];
    st.events.push(e);
  }

  function addFx(st, kind, x, y, r, color, dur, data) {
    if (st.fx.length > 120) st.fx.shift();
    const f = { kind: kind, x: x, y: y, r: r, color: color, t: 0, dur: dur || 0.3 };
    if (data) for (const k in data) f[k] = data[k];
    st.fx.push(f);
  }

  /* ---------------- 阶段切换 ---------------- */
  function startCombat(st) {
    st.phase = 'combat';
    st.phaseT = 0;
    for (let k = 0; k < st.players.length; k++) { st.players[k].frenzy = 0; st.players[k].frenzyT = 0; }
    st.bossSpawned = false;
    st.bossId = 0;
    st.enemies = [];
    st.shots = [];
    st.zones = [];
    st.spawnAcc = 0;
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      p.x = CFG.worldSize / 2 + (i - (st.players.length - 1) / 2) * 30;
      p.y = CFG.worldSize / 2 + 20;
      p.invuln = 2;
      p.alive = true;
    }
    toast(st, '第 ' + st.cycle + ' 层 · 战斗开始', 'good');
  }

  function startTown(st) {
    st.phase = 'town';
    st.phaseT = 0;
    st.enemies = [];
    st.shots = [];
    st.zones = [];
    st.pickups = [];
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      p.x = D.TOWN.spawn.x + (i - (st.players.length - 1) / 2) * 24;
      p.y = D.TOWN.spawn.y + (i % 2) * 22;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.35);
      p.alive = true;
    }
    rollShop(st);
    rollMarket(st);
    toast(st, '返回主城 · 60 秒整理时间', 'good');
  }

  function rollShop(st) {
    const ilvl = 3 + st.cycle * 2;
    st.shop = [];
    for (let i = 0; i < 5; i++) st.shop.push(E.rollItem(pick(st, D.SLOTS), ilvl, rand.bind(null, st)));
  }

  function rollMarket(st) {
    const ilvl = 6 + st.cycle * 3;
    st.marketStock = [E.rollItem(pick(st, D.SLOTS), ilvl, rand.bind(null, st), 2)];
  }

  /* ---------------- 战斗 ---------------- */
  function damageEnemy(st, e, dmg, crit, type) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.1;
    st.hitCount = (st.hitCount || 0) + 1;
    if (crit) ev(st, 'crit');
    else if (st.hitCount % 3 === 0) ev(st, 'hit');
    addText(st, e.x, e.y, Math.round(dmg), crit, crit ? '#ffe066' : null);
    if (e.hp <= 0) killEnemy(st, e);
  }

  function killEnemy(st, e) {
    if (e.dead) return;
    e.dead = true;
    st.kills++;
    ev(st, 'kill');

    // 经验：范围内的玩家都吃（屏蔽外不吃）
    awardXp(st, e.x, e.y, e.xp * ((st.rift && st.rift.xp) || 1));
    // 裂魂体：死亡分裂成两只更小的
    if (e.split > 0 && e.typeId === 'splitter') {
      for (let si = 0; si < 2; si++) {
        const child = spawnEnemy(st, 'splitter', false);
        child.x = e.x + (si ? 11 : -11);
        child.y = e.y + (si ? -7 : 7);
        child.maxHp = Math.max(6, Math.round(e.maxHp * 0.34));
        child.hp = child.maxHp;
        child.r = Math.max(3, e.r * 0.68);
        child.split = e.split - 1;
        child.xp = Math.max(1, Math.round(e.xp * 0.3));
        child.gold = Math.max(1, Math.round(e.gold * 0.3));
        child.dmg = e.dmg * 0.7;
      }
      addFx(st, 'ring', e.x, e.y, 20, '#6fdc8f', 0.3);
    }

    const killer = nearestPlayer(st, e.x, e.y);
    if (killer) {
      killer.frenzy = Math.min(100, killer.frenzy + 2.5);
      if (killer.frenzy >= 100 && killer.frenzyT <= 0) { killer.frenzy = 0; killer.frenzyT = 8 + ((st.meta && st.meta.frenzy) || 0); ev(st, 'level'); }
    }

    // 金币：落在地上，谁捡谁得
    const bm = st.event && st.event.type === 'bloodmoon' ? 2 : 1;
    const goldMul = (1 + 0.4) * ((st.rift && st.rift.gold !== undefined) ? st.rift.gold : 1) * (1 + ((st.meta && st.meta.goldMul) || 0)) * bm;
    if (goldMul > 0) {
      st.pickups.push({
        kind: 'gold', value: Math.max(1, Math.round(e.gold * goldMul)),
        x: e.x + rr(st, -6, 6), y: e.y + rr(st, -6, 6), t: 0, life: CFG.lootLife
      });
    }

    if (st.players.length && rand(st) < 0.0015) {
      const bn = nearestPlayer(st, e.x, e.y);
      if (bn) { bn.boxes = (bn.boxes || 0) + 1; toast(st, '魔盒！' + bn.name + ' 获得了魔盒', 'rare'); ev(st, 'level'); }
    }
    if (e.flee) {
      for (let g = 0; g < 3; g++) {
        const gi = E.rollItem(D.SLOTS[ri(st, 0, 3)], Math.min(20, 6 + st.cycle * 2), rand.bind(null, st), 2);
        st.pickups.push({ kind: 'item', item: gi, x: e.x + rr(st, -10, 10), y: e.y + rr(st, -10, 10), t: 0, life: CFG.lootLife, value: 0 });
      }
      toast(st, '地精掉落了 3 件装备', 'rare');
    }
    let dropChance = 0.014 * ((st.rift && st.rift.drop) || 1) * (1 + ((st.meta && st.meta.drop) || 0));
    if (e.elite) dropChance = 0.30;
    if (e.boss) dropChance = 1;
    if (rand(st) < dropChance) {
      const ilvl = Math.min(20, 2 + Math.floor(st.t / 45) + st.cycle + ((st.rift && st.rift.loot) || 0));
      const item = E.rollItem(pick(st, D.SLOTS), ilvl, rand.bind(null, st));
      st.pickups.push({ kind: 'item', item: item, x: e.x, y: e.y, t: 0, life: CFG.lootLife });
    }

    if (e.boss) {
      st.bossKills = (st.bossKills || 0) + 1;
      for (let i = 0; i < st.players.length; i++) st.players[i].talentPoints += 2;
      for (let i = 0; i < 3; i++) {
        const item = E.rollItem(pick(st, D.SLOTS), 20, rand.bind(null, st), i === 0 ? 3 : 2);
        st.pickups.push({ kind: 'item', item: item, x: e.x + rr(st, -26, 26), y: e.y + rr(st, -26, 26), t: 0, life: CFG.lootLife });
      }
      st.pickups.push({ kind: 'heal', x: e.x, y: e.y, t: 0, life: CFG.lootLife });
      toast(st, '首领被击溃 · 全员 +2 天赋点', 'good');
    }

    if (!e.boss && rand(st) < 0.03) {
      st.pickups.push({ kind: 'heal', x: e.x, y: e.y, t: 0, life: CFG.lootLife });
    }

    for (let i = 0; i < (e.boss ? 26 : 5); i++) {
      st.fx.push({
        kind: 'spark', x: e.x, y: e.y,
        vx: Math.cos(rand(st) * TAU) * rr(st, 20, 90),
        vy: Math.sin(rand(st) * TAU) * rr(st, 20, 90),
        color: '#a8423c', t: 0, dur: rr(st, 0.25, 0.5), size: e.boss ? 2 : 1
      });
    }
    if (st.fx.length > 160) st.fx.splice(0, st.fx.length - 160);
  }

  function hurtPlayer(st, p, dmg) {
    if (!p.alive || p.invuln > 0 || st.phase !== 'combat') return;
    p.hp -= dmg;
    p.invuln = CFG.invulnTime;
    p.hurtFlash = 0.22;
    ev(st, 'hurt');
    addFx(st, 'hit', p.x, p.y, 12, '#ff4d4d', 0.25);
    if (p.hp <= 0) {
      p.hp = 0;
      if (!p.downed) downPlayer(st, p);
      if (!st.players.some(function (q) { return q.alive; })) st.phase = 'dead';
    }
  }

  function enemiesNear(st, x, y, r) {
    const out = [];
    const r2 = r * r;
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      if (e.dead) continue;
      if (dist2(e.x, e.y, x, y) <= r2) out.push(e);
    }
    return out;
  }

  function nearestEnemy(st, x, y, maxR) {
    let best = null, bd = maxR * maxR;
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      if (e.dead) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function nearestPlayer(st, x, y) {
    let best = null, bd = Infinity;
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (!p.alive || p.downed) continue;
      const d = dist2(p.x, p.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /* ---------------- 技能释放 ---------------- */
  function fireSkill(st, p, slot) {
    const s = p.skills[slot];
    if (!s) return false;
    const calc = p.skillCalc[s.id];
    if (!calc) return false;
    const sk = calc.skill;

    let target = nearestEnemy(st, p.x, p.y, sk.range || (sk.radius ? sk.radius + 40 : 80));

    if (sk.kind === 'melee') {
      const hit = enemiesNear(st, p.x, p.y, sk.range);
      if (!hit.length) return false;
      const aim = Math.atan2(target.y - p.y, target.x - p.x);
      let any = false;
      let dealt = 0;
      for (let i = 0; i < hit.length; i++) {
        const e = hit[i];
        const ang = Math.atan2(e.y - p.y, e.x - p.x);
        let diff = Math.abs(ang - aim);
        if (diff > Math.PI) diff = TAU - diff;
        if (diff > sk.arc / 2 + 0.35) continue;
        const h = E.rollHit(calc, rand.bind(null, st));
        damageEnemy(st, e, h.dmg, h.crit, calc.parts[0].type);
        dealt += h.dmg;
        any = true;
      }
      if (!any) return false;
      if (sk.lifesteal && dealt > 0) {
        const heal = dealt * sk.lifesteal;
        p.hp = Math.min(p.maxHp, p.hp + heal);
        addText(st, p.x, p.y, Math.round(heal), false, '#6fdc8f');
      }
      addFx(st, 'slash', p.x, p.y, sk.range, '#e8e2d0', 0.16, { ang: aim });
      return true;
    }

    if (sk.kind === 'aura') {
      const hit = enemiesNear(st, p.x, p.y, sk.radius);
      if (!hit.length) return false;
      for (let i = 0; i < hit.length; i++) {
        const h = E.rollHit(calc, rand.bind(null, st));
        damageEnemy(st, hit[i], h.dmg, h.crit, calc.parts[0].type);
        if (sk.dot) {
          const dps = calc.parts[0].max * sk.dot;
          hit[i].burn = Math.max(hit[i].burn || 0, sk.dotDur || 3);
          hit[i].burnDps = Math.max(hit[i].burnDps || 0, dps);
        }
        hit[i].chill = Math.max(hit[i].chill || 0, 1.2);
      }
      addFx(st, 'ring', p.x, p.y, sk.radius, '#7fdcff', 0.34);
      return true;
    }

    if (sk.kind === 'chain') {
      if (!target) return false;
      let cur = target, from = { x: p.x, y: p.y };
      const seen = {};
      let mult = 1;
      const jumps = 1 + calc.chain;
      for (let i = 0; i < jumps; i++) {
        if (!cur) break;
        addFx(st, 'bolt', from.x, from.y, 0, '#ffe066', 0.12, { x2: cur.x, y2: cur.y });
        const h = E.rollHit(calc, rand.bind(null, st));
        damageEnemy(st, cur, h.dmg * mult, h.crit, 'lightning');
        seen[cur.id] = true;
        from = { x: cur.x, y: cur.y };
        mult *= 0.85;
        let nx = null, nd = sk.chainRange * sk.chainRange;
        for (let k = 0; k < st.enemies.length; k++) {
          const e = st.enemies[k];
          if (e.dead || seen[e.id]) continue;
          const d = dist2(e.x, e.y, from.x, from.y);
          if (d < nd) { nd = d; nx = e; }
        }
        cur = nx;
      }
      return true;
    }

    if (sk.kind === 'meteor') {
      if (!target) return false;
      st.zones.push({ kind: 'meteor', x: target.x, y: target.y, r: sk.radius, t: 0, delay: sk.delay, calc: calc, done: false, owner: p.id });
      return true;
    }

    if (!target) target = nearestEnemy(st, p.x, p.y, 320);
    if (!target) return false;
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    const n = calc.proj;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i - (n - 1) / 2) * 0.22 : 0;
      const a = ang + spread;
      st.shots.push({
        kind: sk.kind, owner: p.id, x: p.x, y: p.y - 4,
        vx: Math.cos(a) * sk.speed, vy: Math.sin(a) * sk.speed,
        r: sk.kind === 'boomerang' ? 6 : 5,
        ttl: (sk.range || 260) / sk.speed,
        calc: calc, pierce: calc.pierce, hitSet: {},
        spin: 0, home: sk.kind === 'boomerang', t: 0
      });
    }
    p.face = Math.cos(ang) >= 0 ? 1 : -1;
    return true;
  }

  function explode(st, x, y, radius, calc, type) {
    const hit = enemiesNear(st, x, y, radius);
    const burnDps = calc.parts[0].max * 0.22;
    for (let i = 0; i < hit.length; i++) {
      const h = E.rollHit(calc, rand.bind(null, st));
      damageEnemy(st, hit[i], h.dmg, h.crit, type);
      if (type === 'fire') {
        hit[i].burn = Math.max(hit[i].burn || 0, 1.5);
        hit[i].burnDps = Math.max(hit[i].burnDps || 0, burnDps);
      }
    }
    addFx(st, 'ring', x, y, radius, type === 'fire' ? '#ff8a3d' : '#ffe066', 0.28);
  }

  /* ---------------- 主更新 ---------------- */
  function normalizeInputs(st, inputs) {
    if (!inputs) return {};
    if (inputs.mx !== undefined || inputs.my !== undefined) {
      const o = {};
      o[st.localId] = inputs;
      return o;
    }
    return inputs;
  }

  function step(st, dt, inputs) {
    if (st.phase === 'dead') return;
    if (!alivePlayers(st).length) { st.phase = 'dead'; return; }
    st.t += dt;
    st.phaseT += dt;
    const inp = normalizeInputs(st, inputs);

    if (st.phase === 'combat') {
      stepPlayers(st, dt, inp);
      stepSkills(st, dt);
      spawnStep(st, dt);
      stepEnemies(st, dt);
      stepShots(st, dt);
      stepEvent(st, dt);
      stepEnemyShots(st, dt);
      stepZones(st, dt);
      stepPickups(st, dt);
      const ct = (st.rift && st.rift.time) || CFG.combatTime;
      const bt = Math.min(Math.max(40, CFG.bossAt - ((st.rift && st.rift.bossEarly) || 0)), ct - 25);
      if (st.phaseT >= bt && !st.bossSpawned) {
        st.bossSpawned = true;
        const bossType = ['boss', 'boss2', 'boss3'][st.cycle % 3];
        const b = spawnEnemy(st, bossType, false);
        if (b) toast(st, '深渊之眼降临', 'bad');
      }
      if (st.phaseT >= ((st.rift && st.rift.time) || CFG.combatTime)) startTown(st);
    } else if (st.phase === 'town') {
      stepPlayers(st, dt, inp);
      stepTown(st, dt);
      if (st.phaseT >= CFG.townTime) openRiftChoice(st);
    }

    stepFx(st, dt);
  }

  function downPlayer(st, p) {
    p.downed = true;
    p.downT = CFG.downTime || 20;
    p.reviveProg = 0;
    p.hp = 0;
    p.frenzy = 0;
    p.frenzyT = 0;
    addFx(st, 'ring', p.x, p.y, 30, '#c0392b', 0.5);
    ev(st, 'down');
    toast(st, p.name + ' 倒下了 — 靠近 2.5 秒可救起', 'bad');
  }

  function stepDowned(st, p, dt) {
    p.downT -= dt;
    let helpers = 0;
    for (let i = 0; i < st.players.length; i++) {
      const q = st.players[i];
      if (q === p || !q.alive || q.downed) continue;
      if (dist2(q.x, q.y, p.x, p.y) < 44 * 44) helpers++;
    }
    if (helpers > 0) {
      p.reviveProg += dt * helpers;
      if (p.reviveProg >= 2.5) {
        p.downed = false;
        p.reviveProg = 0;
        p.hp = Math.round(p.maxHp * 0.45);
        p.invuln = 1.8;
        ev(st, 'revive');
        toast(st, p.name + ' 被救起', 'good');
        return;
      }
    } else {
      p.reviveProg = Math.max(0, p.reviveProg - dt * 0.6);
    }
    if (p.downT <= 0 && p.downed) {
      p.downed = false;
      p.alive = false;
      ev(st, 'kill');
      if (!st.players.some(function (q) { return q.alive; })) st.phase = 'dead';
    }
  }

  function stepPlayers(st, dt, inp) {
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (!p.alive) continue;
      if (p.downed) { stepDowned(st, p, dt); continue; }
      const v = inp[p.id] || { mx: 0, my: 0 };
      let mx = v.mx || 0, my = v.my || 0;
      const len = Math.hypot(mx, my);
      if (len > 0.01) {
        mx /= len; my /= len;
        const spd = p.speed * (p.frenzyT > 0 ? 1.2 : 1);
        p.x += mx * spd * dt;
        p.y += my * spd * dt;
        p.face = mx >= 0 ? 1 : -1;
        p.walkT += dt * 9;
        p.moving = true;
      } else {
        p.moving = false;
      }
      if (p.frenzyT > 0) p.frenzyT -= dt;
      else if (p.frenzy > 0) p.frenzy = Math.max(0, p.frenzy - 4 * dt);
      const W = st.phase === 'town' ? D.TOWN.w : CFG.worldSize;
      const H = st.phase === 'town' ? D.TOWN.h : CFG.worldSize;
      p.x = E.clamp(p.x, 14, W - 14);
      p.y = E.clamp(p.y, 14, H - 14);
      if (p.invuln > 0) p.invuln -= dt;
      if (p.hurtFlash > 0) p.hurtFlash -= dt;
      if (p.potionCd > 0) p.potionCd -= dt;
    }
  }

  function stepSkills(st, dt) {
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (!p.alive || p.downed) continue;
      for (let j = 0; j < p.skills.length; j++) {
        const s = p.skills[j];
        s.cd -= dt;
        if (s.cd <= 0) {
          const calc = p.skillCalc[s.id];
          if (calc) {
            const ok = fireSkill(st, p, j);
            s.cd = (ok ? 1 / calc.rate : 0.08) * (p.frenzyT > 0 ? 0.65 : 1);
          }
        }
      }
    }
  }

  function stepEnemies(st, dt) {
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      if (e.dead) continue;
      if (e.boss && !e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true;
        e.speed *= 1.18;
        e.dmg *= 1.10;
        e.r *= 1.10;
        for (let k = 0; k < 3; k++) {
          const a = k * 2.0944;
          const add = spawnEnemy(st, 'skel', false);
          add.x = e.x + Math.cos(a) * 34;
          add.y = e.y + Math.sin(a) * 34;
        }
        addFx(st, 'ring', e.x, e.y, 60, '#ff6b2b', 0.6);
        toast(st, '首领暴怒 — 小心！', 'bad');
        ev(st, 'boss');
      }
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.chill > 0) e.chill -= dt;
      if (e.burn > 0) {
        e.burn -= dt;
        e.hp -= e.burnDps * dt;
        e.burnAcc = (e.burnAcc || 0) + dt;
        if (e.burnAcc > 0.35) { e.burnAcc = 0; addText(st, e.x, e.y, Math.round(e.burnDps * 0.35), false, '#ff8a3d'); }
        if (e.hp <= 0) { killEnemy(st, e); continue; }
      }

      const target = nearestPlayer(st, e.x, e.y);
      if (!target) continue;
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      // 唤骸者：定期召唤小怪
      if (e.summoner) {
        e.sumCd -= dt;
        if (e.sumCd <= 0 && st.enemies.length < 190) {
          e.sumCd = 6.5;
          const m = spawnEnemy(st, 'slime', false);
          m.x = e.x + rr(st, -14, 14);
          m.y = e.y + rr(st, -14, 14);
          addFx(st, 'ring', e.x, e.y, 18, '#b07cff', 0.3);
        }
      }
      // 腐化祭司：治疗附近敌人
      if (e.healer) {
        e.healCd -= dt;
        if (e.healCd <= 0) {
          e.healCd = 3.5;
          const grp = enemiesNear(st, e.x, e.y, 74);
          let healed = false;
          for (let gi = 0; gi < grp.length; gi++) {
            const q = grp[gi];
            if (q.hp < q.maxHp) { q.hp = Math.min(q.maxHp, q.hp + q.maxHp * 0.12); healed = true; }
          }
          if (healed) addFx(st, 'ring', e.x, e.y, 26, '#6fdc8f', 0.35);
        }
      }

      // 虚空之心：环形弹幕
      if (e.caster) {
        e.castCd -= dt;
        if (e.castCd <= 0) {
          e.castCd = 3.4;
          for (let k = 0; k < 8; k++) {
            const a = k * 0.7854 + e.t * 0.6;
            st.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 108, vy: Math.sin(a) * 108, dmg: e.dmg * 0.4, r: 4, t: 0, dead: false });
          }
          addFx(st, 'ring', e.x, e.y, 34, '#b07cff', 0.4);
          ev(st, 'hit');
        }
      }

      // 冲锋者：蓄力 → 冲刺 → 冷却
      if (e.charger) {
        e.cd = (e.cd || 0) - dt;
        if (e.cstate === 'wind') {
          e.st -= dt;
          e.flash = 0.06;
          if (e.st <= 0) {
            e.cstate = 'dash';
            e.st = 0.42;
            e.cdir = Math.atan2(dy, dx);
            ev(st, 'hit');
          }
          continue;
        }
        if (e.cstate === 'dash') {
          e.st -= dt;
          e.x += Math.cos(e.cdir) * 250 * dt;
          e.y += Math.sin(e.cdir) * 250 * dt;
          e.flash = 0.08;
          if (dist2(e.x, e.y, target.x, target.y) < 256) {
            hurtPlayer(st, target, e.dmg);
            e.cstate = null;
            e.cd = 2.6;
            addFx(st, 'ring', e.x, e.y, 18, '#ff8a3d', 0.3);
            continue;
          }
          if (e.st <= 0) { e.cstate = null; e.cd = 2.6; }
          continue;
        }
        if (e.cd <= 0 && d < 170) {
          e.cstate = 'wind';
          e.st = 0.55;
          continue;
        }
      }

      const spd = e.speed * (e.chill > 0 ? 0.5 : 1);
      if (d > 2) {
        let wob = 0;
        if (e.wobble) wob = Math.sin(e.t * 6 + e.seed) * 0.5;
        const ang = Math.atan2(dy, dx) + wob;
        e.x += Math.cos(ang) * spd * dt;
        e.y += Math.sin(ang) * spd * dt;
      }

      if (e.flee) {
        const away = Math.atan2(-dy, -dx);
        e.x += Math.cos(away) * e.speed * dt;
        e.y += Math.sin(away) * e.speed * dt;
      }
      if (e.ranged) {
        e.shotCd = (e.shotCd || 0) - dt;
        if (d < (e.range || 180) && e.shotCd <= 0) {
          e.shotCd = e.shotCdMax || 2.3;
          const a2 = Math.atan2(dy, dx);
          st.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a2) * (e.shotSpeed || 130), vy: Math.sin(a2) * (e.shotSpeed || 130), dmg: e.dmg, r: 4, t: 0, dead: false });
        }
      }

      const touch = e.r + 6;
      if (d < touch) {
        e.hitCd = (e.hitCd || 0) - dt;
        if (e.hitCd <= 0) { e.hitCd = 0.75; hurtPlayer(st, target, e.dmg); }
      } else if (e.hitCd > 0) {
        e.hitCd -= dt * 0.5;
      }
    }
  }

  function stepShots(st, dt) {
    for (let i = 0; i < st.shots.length; i++) {
      const s = st.shots[i];
      if (s.dead) continue;
      s.t += dt;
      s.spin += dt * 14;
      if (s.home && s.t > (s.ttl || 1.5) * 0.5) {
        const owner = st.players[s.owner] || localPlayer(st);
        const ax = owner.x - s.x, ay = owner.y - s.y;
        const ad = Math.hypot(ax, ay) || 1;
        s.vx += (ax / ad) * 900 * dt;
        s.vy += (ay / ad) * 900 * dt;
        const sp = Math.hypot(s.vx, s.vy);
        if (sp > 220) { s.vx = s.vx / sp * 220; s.vy = s.vy / sp * 220; }
        if (ad < 10) s.dead = true;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t > (s.ttl || 2) * 1.6) s.dead = true;

      for (let k = 0; k < st.enemies.length; k++) {
        const e = st.enemies[k];
        if (e.dead || s.hitSet[e.id]) continue;
        const rr2 = (s.r + e.r) * (s.r + e.r);
        if (dist2(e.x, e.y, s.x, s.y) > rr2) continue;
        s.hitSet[e.id] = true;
        const h = E.rollHit(s.calc, rand.bind(null, st));
        damageEnemy(st, e, h.dmg, h.crit, s.calc.parts[0].type);
        if (s.calc.skill.kind === 'fireball') {
          explode(st, s.x, s.y, s.calc.radius, s.calc, 'fire');
          s.dead = true;
          break;
        }
        if (s.pierce > 0) s.pierce--;
        else { s.dead = true; break; }
      }
    }
  }

  /* ---------------- 随机战斗事件 ---------------- */
  function stepEvent(st, dt) {
    if (st.event) {
      st.event.t -= dt;
      if (st.event.t <= 0) { st.event = null; st.eventCd = rr(st, 50, 80); }
      return;
    }
    st.eventCd -= dt;
    if (st.eventCd > 0) return;
    const roll = rand(st);
    if (roll < 0.4) {
      const a = rand(st) * 6.2832;
      const g = spawnEnemy(st, 'goblin', false);
      g.x = st.players[0].x + Math.cos(a) * 220;
      g.y = st.players[0].y + Math.sin(a) * 220;
      toast(st, '宝藏地精出现了 — 杀掉它！', 'rare');
      ev(st, 'boss');
      st.event = { type: 'goblin', t: 22 };
    } else if (roll < 0.75) {
      st.event = { type: 'bloodmoon', t: 16 };
      toast(st, '血月升起 — 敌人更多，金币翻倍', 'bad');
      ev(st, 'boss');
    } else {
      const a2 = rand(st) * 6.2832;
      st.pickups.push({ kind: 'cache', x: st.players[0].x + Math.cos(a2) * 90, y: st.players[0].y + Math.sin(a2) * 90, t: 0, life: 40, value: 0 });
      toast(st, '一个补给箱掉在了附近', 'good');
      ev(st, 'gold');
      st.event = { type: 'cache', t: 20 };
    }
  }

  function stepEnemyShots(st, dt) {
    for (let i = 0; i < st.eshots.length; i++) {
      const s = st.eshots[i];
      if (s.dead) continue;
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t > 3) { s.dead = true; continue; }
      for (let j = 0; j < st.players.length; j++) {
        const p = st.players[j];
        if (!p.alive) continue;
        if (dist2(p.x, p.y, s.x, s.y) < 110) { s.dead = true; hurtPlayer(st, p, s.dmg); break; }
      }
    }
    st.eshots = st.eshots.filter(function (s) { return !s.dead; });
  }

  function stepZones(st, dt) {
    for (let i = 0; i < st.zones.length; i++) {
      const z = st.zones[i];
      z.t += dt;
      if (!z.done && z.t >= z.delay) {
        z.done = true;
        explode(st, z.x, z.y, z.r, z.calc, 'fire');
        addFx(st, 'ring', z.x, z.y, z.r * 1.1, '#ff6b2b', 0.3);
      }
    }
  }

  function stepPickups(st, dt) {
    for (let i = 0; i < st.pickups.length; i++) {
      const pk = st.pickups[i];
      if (pk.dead) continue;
      pk.t += dt;
      if (pk.life !== undefined && pk.t > pk.life) { pk.dead = true; continue; }

      // 找最近的玩家吸附
      let near = null, nd = Infinity;
      for (let j = 0; j < st.players.length; j++) {
        const p = st.players[j];
        if (!p.alive) continue;
        const d = dist2(p.x, p.y, pk.x, pk.y);
        if (d < nd) { nd = d; near = p; }
      }
      if (!near) continue;
      const dd = Math.sqrt(nd) || 1;
      if (dd < near.pickup) {
        const pull = 300 * dt / Math.max(6, dd);
        pk.x += (near.x - pk.x) * pull * 3;
        pk.y += (near.y - pk.y) * pull * 3;
      }
      if (dd < 11) {
        pk.dead = true;
        if (pk.kind === 'xp') awardXp(st, pk.x, pk.y, pk.value);
        else if (pk.kind === 'cache') {
          const it = E.rollItem(D.SLOTS[ri(st, 0, 3)], Math.min(20, 6 + st.cycle * 2), rand.bind(null, st), 2);
          near.bag.push(it);
          near.gold += 40 * Math.max(1, st.cycle);
          ev(st, 'item', { r: it.rarity });
          toast(st, '补给箱：' + it.name, 'rare');
        }
        else if (pk.kind === 'gold') { near.gold += pk.value; st.goldEarned += pk.value; ev(st, 'gold'); }
        else if (pk.kind === 'item') {
          // 装备不再自动拾取：落地后按 E 拾取
        } else if (pk.kind === 'heal') {
          near.hp = Math.min(near.maxHp, near.hp + 30);
          ev(st, 'heal');
          toast(st, near.name + ' +30 生命', 'good');
        }
      }
    }
  }

  /** 附近地上的装备：返回最近的，供 UI 提示 */
  function nearestGroundItem(st, x, y, r) {
    const rr2 = (r || 30) * (r || 30);
    let best = null, bd = rr2;
    for (let i = 0; i < st.pickups.length; i++) {
      const pk = st.pickups[i];
      if (pk.dead || pk.kind !== 'item') continue;
      const d = dist2(pk.x, pk.y, x, y);
      if (d < bd) { bd = d; best = pk; }
    }
    return best;
  }

  /** E 拾取最近的装备 */
  function takeItem(st, p) {
    if (!p) p = localPlayer(st);
    const pk = nearestGroundItem(st, p.x, p.y, 34);
    if (!pk) return { ok: false, msg: '附近没有可拾取的装备' };
    if (p.bag.length >= BAG_CAP) return { ok: false, msg: '背包已满' };
    pk.dead = true;
    p.bag.push(pk.item);
    ev(st, 'item', { r: pk.item.rarity });
    toast(st, '拾取 ' + pk.item.name, pk.item.rarity >= 2 ? 'rare' : '');
    return { ok: true, item: pk.item };
  }

  /** 开魔盒 */
  function openBox(st, p) {
    if (!p) p = localPlayer(st);
    if (!p.boxes) return { ok: false, msg: '没有魔盒' };
    if (p.bag.length >= BAG_CAP) return { ok: false, msg: '背包已满' };
    p.boxes--;
    const it = E.rollItem(D.SLOTS[ri(st, 0, 3)], Math.min(20, 10 + st.cycle * 2), rand.bind(null, st), 3);
    p.bag.push(it);
    ev(st, 'item', { r: 3 });
    toast(st, '魔盒开出：' + it.name, 'rare');
    return { ok: true, item: it };
  }

  function stepTown(st, dt) {
    const lp = localPlayer(st);
    let near = null, nd = 46 * 46;
    for (let i = 0; i < D.TOWN.npcs.length; i++) {
      const n = D.TOWN.npcs[i];
      const d = dist2(lp.x, lp.y, n.x, n.y);
      if (d < nd) { nd = d; near = n.id; }
    }
    st.nearNpc = near;
  }

  function stepFx(st, dt) {
    for (let i = 0; i < st.fx.length; i++) {
      const f = st.fx[i];
      f.t += dt;
      if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    }
    for (let i = 0; i < st.texts.length; i++) st.texts[i].t += dt;
    for (let i = 0; i < st.toasts.length; i++) st.toasts[i].t += dt;

    st.cleanAcc += dt;
    if (st.cleanAcc >= 0.4) {
      st.cleanAcc = 0;
      st.enemies = st.enemies.filter(function (e) { return !e.dead; });
    }
    st.shots = st.shots.filter(function (s) { return !s.dead; });
    st.zones = st.zones.filter(function (z) { return z.t < z.delay + 0.4; });
    st.pickups = st.pickups.filter(function (pk) { return !pk.dead; });
    st.fx = st.fx.filter(function (f) { return f.t < f.dur; });
    st.texts = st.texts.filter(function (t2) { return t2.t < t2.life; });
    st.toasts = st.toasts.filter(function (t2) { return t2.t < 2.6; });
  }

  /* ---------------- 刷怪 ---------------- */
  function waveAt(t) {
    let w = D.WAVES[0];
    for (let i = 0; i < D.WAVES.length; i++) if (t >= D.WAVES[i].t) w = D.WAVES[i];
    return w;
  }

  function spawnStep(st, dt) {
    const w = waveAt(st.phaseT);
    const R = st.rift;
    const bloodmoon = st.event && st.event.type === 'bloodmoon' ? 1.8 : 1;
    const rate = w.rate * ((R && R.spawn && R.spawn.rate) || 1) * bloodmoon;
    const cap = Math.round(w.cap * ((R && R.spawn && R.spawn.cap) || 1));
    if (st.enemies.length >= cap) return;
    st.spawnAcc += rate * dt;
    while (st.spawnAcc >= 1 && st.enemies.length < cap) {
      st.spawnAcc -= 1;
      const pool = w.pool;
      let total = 0;
      for (const k in pool) total += pool[k];
      let r = rand(st) * total;
      let typeId = 'slime';
      for (const k in pool) { r -= pool[k]; if (r <= 0) { typeId = k; break; } }
      const eliteMul = (st.rift && st.rift.elite) || 1;
      const elite = st.phaseT > 40 && rand(st) < Math.min(0.35, 0.05 * eliteMul);
      spawnEnemy(st, typeId, elite);
    }
  }

  function spawnEnemy(st, typeId, elite) {
    const stats = E.enemyStats(typeId, st.phaseT, st.cycle);
    const center = localPlayer(st);
    const ang = rand(st) * TAU;
    const rad = 230 + rand(st) * 70;
    const W = CFG.worldSize;
    const x = E.clamp(center.x + Math.cos(ang) * rad, 10, W - 10);
    const y = E.clamp(center.y + Math.sin(ang) * rad, 10, W - 10);

    const e = {
      id: st.nextId++, type: typeId, sprite: stats.sprite, boss: stats.boss,
      x: x, y: y, hp: stats.hp, maxHp: stats.hp,
      dmg: stats.dmg, speed: stats.speed, r: stats.r,
      xp: stats.xp, gold: stats.gold, mass: stats.mass, wobble: stats.wobble,
      ranged: !!(D.ENEMIES[typeId] && D.ENEMIES[typeId].ranged),
      flee: !!(D.ENEMIES[typeId] && D.ENEMIES[typeId].flee),
      charger: !!(D.ENEMIES[typeId] && D.ENEMIES[typeId].charger),
      caster: !!(D.ENEMIES[typeId] && D.ENEMIES[typeId].caster), castCd: 2.5,
      split: (D.ENEMIES[typeId] && D.ENEMIES[typeId].split) || 0,
      summoner: !!(D.ENEMIES[typeId] && D.ENEMIES[typeId].summoner), sumCd: 3,
      healer: !!(D.ENEMIES[typeId] && D.ENEMIES[typeId].healer), healCd: 2.5,
      cstate: null, cd: 1.5, st: 0, cdir: 0,
      range: (D.ENEMIES[typeId] && D.ENEMIES[typeId].range) || 0,
      shotSpeed: (D.ENEMIES[typeId] && D.ENEMIES[typeId].shotSpeed) || 0,
      shotCdMax: (D.ENEMIES[typeId] && D.ENEMIES[typeId].shotCd) || 2.3,
      elite: !!elite, flash: 0, chill: 0, burn: 0, burnDps: 0,
      t: 0, seed: rand(st) * 10, hitCd: 0, dead: false
    };
    if (st.rift && st.rift.enemy) {
      const R = st.rift.enemy;
      if (R.hp) { e.hp *= R.hp; e.maxHp = e.hp; }
      if (R.dmg) e.dmg *= R.dmg;
      if (R.speed) e.speed *= R.speed;
    }
    if (elite) {
      const m = D.ELITE_MODS[ri(st, 0, D.ELITE_MODS.length - 1)];
      if (m.hp) { e.hp *= m.hp; e.maxHp = e.hp; }
      if (m.spd) e.speed *= m.spd;
      if (m.dmg) e.dmg *= m.dmg;
      if (m.scale) e.r *= m.scale;
      e.xp *= 3; e.gold *= 3;
    }
    st.enemies.push(e);
    if (e.boss) { st.bossId = e.id; ev(st, 'boss'); }
    return e;
  }

  /* ---------------- 经验（屏内共享） ---------------- */
  function awardXp(st, x, y, v) {
    const r2 = CFG.xpShareRadius * CFG.xpShareRadius;
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (!p.alive) continue;
      if (dist2(p.x, p.y, x, y) <= r2) gainXp(st, p, v);
    }
  }

  function gainXp(st, p, v) {
    p.xp += v;
    while (p.xp >= p.xpNext && p.level < CFG.maxLevel) {
      p.xp -= p.xpNext;
      p.level++;
      p.talentPoints++;
      ev(st, 'level');
      toast(st, p.name + ' 等级 ' + p.level + ' · +1 天赋点', 'good');
      p.xpNext = E.xpForLevel(p.level);
    }
    if (p.level >= CFG.maxLevel) p.xp = Math.min(p.xp, p.xpNext);
    recompute(st, p);
  }

  /* ---------------- 深渊裂隙 ---------------- */
  function openRiftChoice(st) {
    st.phase = 'rift';
    st.riftChoices = [];
    const opening = st.cycle === 1 && !st.started;
    const pool = opening ? D.RIFTS.filter(function (r) { return r.mild; }) : D.RIFTS.slice();
    const want = 3 + ((st.meta && st.meta.riftChoice) || 0);
    for (let i = 0; i < want && pool.length; i++) {
      const idx = Math.floor(rand(st) * pool.length);
      st.riftChoices.push(pool.splice(idx, 1)[0]);
    }
  }

  function chooseRift(st, i) {
    const r = st.riftChoices[i];
    if (!r) return false;
    st.rift = r;
    if (st.started) st.cycle++;
    st.started = true;
    st.riftChoices = [];
    startCombat(st);
    return true;
  }

  /* ---------------- 天赋 ---------------- */
  function allocate(st, id, p) {
    if (!p) p = localPlayer(st);
    const entry = D.TALENT_INDEX[id];
    if (!entry) return false;
    const node = entry.node;
    const cur = p.talents[id] || 0;
    if (cur >= node.max) return false;
    if (p.talentPoints <= 0) return false;
    if ((p.treeSpent[entry.tree] || 0) < D.TIER_GATE[node.tier]) return false;

    if (node.kind === 'active' && cur === 0 && !p.skills.some(function (s) { return s.id === node.skill; }) && p.skills.length >= 3) {
      return false;
    }

    p.talents[id] = cur + 1;
    p.treeSpent[entry.tree] = (p.treeSpent[entry.tree] || 0) + 1;
    p.talentPoints--;

    if (node.kind === 'active') syncSkillRank(p, node.skill, p.talents[id]);
    recompute(st, p);
    return true;
  }

  function resetTalents(st, p) {
    if (!p) p = localPlayer(st);
    let refund = 0;
    for (const k in p.talents) refund += p.talents[k];
    refund = Math.max(0, refund - 1);
    p.talents = { b1: 1 };
    p.treeSpent = { blade: 1, ember: 0, storm: 0 };
    p.skills = [{ id: 'dagger', rank: 1, cd: 0 }];
    p.talentPoints += refund;
    recompute(st, p);
    return refund;
  }

  /* ---------------- 药水 ---------------- */
  function drinkPotion(st, p) {
    if (p.downed) return false;
    if (!p) p = localPlayer(st);
    if (p.potions <= 0 || p.potionCd > 0 || !p.alive) return false;
    p.potions--;
    p.potionCd = 1.2;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.45 * ((st.rift && st.rift.heal) || 1));
    addFx(st, 'ring', p.x, p.y, 26, '#ff6b6b', 0.3);
    return true;
  }

  /* ---------------- 装备 ---------------- */
  function equip(st, item, p) {
    if (!p) p = localPlayer(st);
    const old = p.gear[item.slot];
    p.gear[item.slot] = item;
    if (old && p.bag.length < BAG_CAP) p.bag.push(old);
    recompute(st, p);
    return old;
  }

  function unequip(st, slot, p) {
    if (!p) p = localPlayer(st);
    const it = p.gear[slot];
    if (!it) return;
    p.gear[slot] = null;
    if (p.bag.length < BAG_CAP) p.bag.push(it);
    recompute(st, p);
  }

  function sellItem(st, index, p) {
    if (!p) p = localPlayer(st);
    const it = p.bag[index];
    if (!it) return 0;
    const price = E.itemPrice(it);
    p.bag.splice(index, 1);
    p.gold += price;
    return price;
  }

  function buyItem(st, index, p) {
    if (!p) p = localPlayer(st);
    const it = st.shop[index];
    if (!it) return false;
    const price = Math.round(E.itemPrice(it) * D.PRICES.buyMul);
    if (p.gold < price) return false;
    if (p.bag.length >= BAG_CAP) return false;
    p.gold -= price;
    st.shop.splice(index, 1);
    p.bag.push(it);
    return true;
  }

  function buyPotion(st, p) {
    if (!p) p = localPlayer(st);
    const price = D.PRICES.potion;
    if (p.gold < price) return false;
    if (p.potions >= 9) return false;
    p.gold -= price;
    p.potions++;
    return true;
  }

  function craft(st, index, kind, p) {
    if (!p) p = localPlayer(st);
    const it = p.bag[index];
    if (!it) return { ok: false, msg: '没有物品' };
    const cost = D.PRICES.craft[kind](it.ilvl);
    if (p.gold < cost) return { ok: false, msg: '金币不足' };
    let res = null;
    if (kind === 'reroll') res = E.craftReroll(it, rand.bind(null, st));
    else if (kind === 'addAffix') res = E.craftAdd(it, rand.bind(null, st));
    else if (kind === 'upgrade') res = E.craftUpgrade(it, rand.bind(null, st));
    if (!res) return { ok: false, msg: '无法继续打造' };
    p.gold -= cost;
    p.bag[index] = res;
    return { ok: true, item: res, cost: cost };
  }

  function stashIn(st, index, p) {
    if (!p) p = localPlayer(st);
    if (st.stash.length >= 24) return false;
    const it = p.bag[index];
    if (!it) return false;
    st.stash.push(it);
    p.bag.splice(index, 1);
    return true;
  }

  function stashOut(st, index, p) {
    if (!p) p = localPlayer(st);
    if (p.bag.length >= BAG_CAP) return false;
    const it = st.stash[index];
    if (!it) return false;
    p.bag.push(it);
    st.stash.splice(index, 1);
    return true;
  }

  function previewEquip(st, item, p) {
    if (!p) p = localPlayer(st);
    const fake = Object.assign({}, p.gear);
    fake[item.slot] = item;
    const agg = E.buildAgg(fake, p.talents, null);
    let dps = 0;
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      const c = E.computeSkill(s.id, skillLevel(p, s), agg);
      if (c) dps += c.dps;
    }
    const hp = Math.max(1, Math.round((CFG.baseHp + CFG.hpPerLevel * (p.level - 1) + agg.life) * (1 + agg.lifePct)));
    return { dps: dps, hp: hp };
  }

  /* ---------------- 主城交互 ---------------- */
  function interact(st) {
    const id = st.nearNpc;
    if (!id) return null;
    if (id === 'portal') {
      openRiftChoice(st);
      return 'portal';
    }
    return id;
  }

  /** 强化：+1 级，费用随等级指数上涨 */
  function enhance(st, slot, p) {
    if (!p) p = localPlayer(st);
    const it = p.gear[slot];
    if (!it) return { ok: false, msg: '该部位没有装备' };
    if ((it.plus || 0) >= 15) return { ok: false, msg: '已达 +15 上限' };
    const cost = E.enhanceCost(it);
    if (p.gold < cost) return { ok: false, msg: '金币不足（需 ' + cost + '）' };
    p.gold -= cost;
    it.plus = (it.plus || 0) + 1;
    recompute(st, p);
    ev(st, 'item', { r: it.rarity });
    toast(st, it.name + ' 强化至 +' + it.plus, 'good');
    return { ok: true, plus: it.plus, cost: cost };
  }

  function gamble(st, slot, p) {
    if (!p) p = localPlayer(st);
    const ilvl = 12 + st.cycle * 3;
    const price = D.PRICES.gamble(ilvl);
    if (p.gold < price) return { ok: false, msg: '金币不足' };
    if (p.bag.length >= BAG_CAP) return { ok: false, msg: '背包已满' };
    p.gold -= price;
    const item = E.rollItem(slot, ilvl, rand.bind(null, st), 2);
    p.bag.push(item);
    ev(st, 'item', { r: item.rarity });
    return { ok: true, item: item, cost: price };
  }

  function marketBuy(st, index, p) {
    if (!p) p = localPlayer(st);
    const it = st.marketStock[index];
    if (!it) return false;
    const price = Math.round(E.itemPrice(it) * 4.5);
    if (p.gold < price) return false;
    if (p.bag.length >= BAG_CAP) return false;
    p.gold -= price;
    st.marketStock.splice(index, 1);
    p.bag.push(it);
    return true;
  }

  /** 从网络明细恢复一个玩家（房主迁移用） */
  function applyPlayerDetails(st, id, d) {
    if (!d) return null;
    let p = st.players.find(function (x) { return x.id === id; });
    if (!p) p = addPlayer(st, d.n || ('玩家' + id), id);
    if (!p) return null;
    p.level = d.lv || 1;
    p.xp = d.xp || 0;
    p.xpNext = d.xpN || 1;
    p.gold = d.g || 0;
    p.potions = d.po || 0;
    p.talentPoints = d.tp || 0;
    p.gear = d.ge || { helm: null, body: null, ring: null, amulet: null };
    p.bag = d.bg || [];
    p.talents = d.tl || {};
    p.treeSpent = d.ts || { blade: 0, ember: 0, storm: 0 };
    p.skills = (d.sk || []).map(function (s) { return { id: s.i, rank: s.r, cd: 0 }; });
    if (!p.skills.length) p.skills = [{ id: 'dagger', rank: 1, cd: 0 }];
    recompute(st, p);
    p.maxHp = p.maxHp;
    p.hp = p.maxHp;
    return p;
  }

  /* ---------------- 玩家管理（联机用） ---------------- */
  function addPlayer(st, name, wantId) {
    if (st.players.length >= 4) return null;
    let id = wantId;
    if (id === undefined) {
      id = 0;
      while (st.players.some(function (p) { return p.id === id; })) id++;
    } else if (st.players.some(function (p) { return p.id === id; })) {
      return st.players.find(function (p) { return p.id === id; });
    }
    const p = makePlayer(st, id, name);
    p.x = CFG.worldSize / 2 + (id - 1) * 28;
    p.y = CFG.worldSize / 2 + 20;
    if (st.phase === 'town') { p.x = D.TOWN.spawn.x + (id - 1) * 24; p.y = D.TOWN.spawn.y; }
    st.players.push(p);
    recompute(st, p);
    p.hp = p.maxHp;
    toast(st, p.name + ' 加入了', 'good');
    return p;
  }

  function removePlayer(st, id) {
    const i = st.players.findIndex(function (p) { return p.id === id; });
    if (i < 0) return;
    st.players.splice(i, 1);
    if (st.localId === id) setLocal(st, st.players.length ? st.players[0].id : 0);
  }

  root.SIM = {
    create: create, step: step,
    recompute: recompute, recomputeAll: recomputeAll, skillLevel: skillLevel,
    localPlayer: localPlayer, setLocal: setLocal, alivePlayers: alivePlayers,
    addPlayer: addPlayer, removePlayer: removePlayer, applyPlayerDetails: applyPlayerDetails,
    classOf: classOf, setClass: setClass, enhance: enhance,
    addSkill: addSkill,
    allocate: allocate, resetTalents: resetTalents, drinkPotion: drinkPotion,
    equip: equip, unequip: unequip, sellItem: sellItem, buyItem: buyItem, buyPotion: buyPotion,
    craft: craft, stashIn: stashIn, stashOut: stashOut, gamble: gamble,
    previewEquip: previewEquip, interact: interact, marketBuy: marketBuy,
    awardXp: awardXp, gainXp: gainXp, fireSkill: fireSkill, nearestPlayer: nearestPlayer,
    startCombat: startCombat, startTown: startTown, waveAt: waveAt,
    openRiftChoice: openRiftChoice, chooseRift: chooseRift,
    takeItem: takeItem, openBox: openBox, nearestGroundItem: nearestGroundItem,
    resonanceInfo: function (p) { return resonanceMods(p.gear); },
    rand: rand
  };
})(window);
