/* =========================================================
   sim.js — 世界模拟（纯逻辑，不碰 DOM）
   固定步长推进；所有实体的状态都在 st 里，便于以后做快照同步。
   ========================================================= */
(function (root) {
  'use strict';

  const D = root.DATA, E = root.ENGINE, CFG = D.CONFIG;
  const TAU = Math.PI * 2;

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

  /* ---------------- 创建 ---------------- */
  function create(seed) {
    const st = {
      seed: seed || 1,
      rngS: (seed || 1) | 0,
      t: 0,
      phase: 'run',
      paused: false,

      player: {
        x: CFG.worldSize / 2, y: CFG.worldSize / 2,
        hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: E.xpForLevel(1),
        speed: CFG.baseSpeed, face: 1, invuln: 0, walkT: 0, moving: false,
        skills: [], runMods: [], pendingLevels: 0
      },
      gear: { helm: null, body: null, ring: null, amulet: null },
      bag: [],

      enemies: [], nextId: 1,
      shots: [], zones: [], pickups: [], texts: [], fx: [],
      toasts: [],

      kills: 0, gold: 0,
      spawnAcc: 0, bossSpawned: false, bossId: 0,
      endT: 0,

      agg: null, aggVer: 0,
      skills: {}          // id -> computed
    };
    recompute(st);
    st.player.hp = st.player.maxHp;
    // 起手技能
    addSkill(st, 'dagger');
    return st;
  }

  /* ---------------- 属性重算 ---------------- */
  function recompute(st) {
    const agg = E.gearAgg(st.gear);
    for (let i = 0; i < st.player.runMods.length; i++) E.applyMod(agg, st.player.runMods[i]);
    st.agg = agg;

    const p = st.player;
    const maxHp = Math.round(CFG.baseHp + CFG.hpPerLevel * (p.level - 1) + agg.life);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = maxHp;
    p.hp = Math.min(maxHp, Math.max(1, Math.round(maxHp * ratio)));
    p.speed = CFG.baseSpeed * (1 + agg.move);
    p.pickup = CFG.pickupRange * (1 + agg.pickup);

    st.skills = {};
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      st.skills[s.id] = E.computeSkill(s.id, s.level, agg);
    }
    st.aggVer++;
  }

  function addSkill(st, id) {
    if (st.player.skills.length >= 3) return false;
    if (st.player.skills.some(function (s) { return s.id === id; })) return false;
    st.player.skills.push({ id: id, level: 1, cd: 0 });
    recompute(st);
    return true;
  }

  function levelUpSkill(st, id) {
    const s = st.player.skills.find(function (x) { return x.id === id; });
    if (!s || s.level >= D.MAX_SKILL_LEVEL) return false;
    s.level++;
    recompute(st);
    return true;
  }

  /* ---------------- 提示 ---------------- */
  function toast(st, text, kind) {
    st.toasts.push({ text: text, kind: kind || '', t: 0 });
    if (st.toasts.length > 5) st.toasts.shift();
  }

  function addText(st, x, y, val, crit, color) {
    if (st.texts.length > 60) st.texts.shift();
    st.texts.push({
      x: x + (rand(st) - 0.5) * 4, y: y - 6,
      v: val, crit: !!crit, t: 0, life: 0.55,
      color: color || (crit ? '#ffe066' : '#e8e2d0')
    });
  }

  function addFx(st, kind, x, y, r, color, dur, data) {
    if (st.fx.length > 90) st.fx.shift();
    const f = { kind: kind, x: x, y: y, r: r, color: color, t: 0, dur: dur || 0.3 };
    if (data) for (const k in data) f[k] = data[k];
    st.fx.push(f);
  }

  /* ---------------- 战斗 ---------------- */
  function damageEnemy(st, e, dmg, crit, type) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.1;
    addText(st, e.x, e.y, Math.round(dmg), crit, crit ? '#ffe066' : null);
    if (e.hp <= 0) killEnemy(st, e);
  }

  function killEnemy(st, e) {
    if (e.dead) return;
    e.dead = true;
    st.kills++;
    // 经验
    const n = e.boss ? 12 : (e.elite ? 4 : 1);
    for (let i = 0; i < n; i++) {
      st.pickups.push({
        kind: 'xp', value: Math.max(1, Math.round(e.xp / (e.boss ? 12 : (e.elite ? 4 : 1)))),
        x: e.x + (rand(st) - 0.5) * 12, y: e.y + (rand(st) - 0.5) * 12, t: 0, vx: 0, vy: 0
      });
    }
    // 掉落
    let dropChance = 0.012;
    if (e.elite) dropChance = 0.35;
    if (e.boss) dropChance = 1;
    if (rand(st) < dropChance) {
      const ilvl = Math.min(20, 1 + Math.floor(st.t / 30));
      const slot = pick(st, D.SLOTS);
      const item = E.rollItem(slot, ilvl, rand.bind(null, st));
      st.pickups.push({ kind: 'item', item: item, x: e.x, y: e.y, t: 0, vx: 0, vy: 0 });
    }
    if (e.boss) {
      for (let i = 0; i < 4; i++) {
        const item = E.rollItem(pick(st, D.SLOTS), 20, rand.bind(null, st), 2);
        st.pickups.push({ kind: 'item', item: item, x: e.x + rr(st, -20, 20), y: e.y + rr(st, -20, 20), t: 0, vx: 0, vy: 0 });
      }
      st.phase = 'win';
      toast(st, '深渊之眼已被击溃', 'good');
    }
    // 少量红心，提供续航
    if (!e.boss && rand(st) < 0.035) {
      st.pickups.push({ kind: 'heal', x: e.x, y: e.y, t: 0, vx: 0, vy: 0 });
    }
    for (let i = 0; i < (e.boss ? 26 : 5); i++) {
      st.fx.push({
        kind: 'spark', x: e.x, y: e.y,
        vx: Math.cos(rand(st) * TAU) * rr(st, 20, 90),
        vy: Math.sin(rand(st) * TAU) * rr(st, 20, 90),
        color: e.dead ? '#8a3a3a' : '#a8423c', t: 0, dur: rr(st, 0.25, 0.5), size: e.boss ? 2 : 1
      });
    }
    if (st.fx.length > 140) st.fx.splice(0, st.fx.length - 140);
  }

  function hurtPlayer(st, dmg) {
    const p = st.player;
    if (p.invuln > 0 || st.phase !== 'run') return;
    p.hp -= dmg;
    p.invuln = CFG.invulnTime;
    p.hurtFlash = 0.22;
    addFx(st, 'hit', p.x, p.y, 12, '#ff4d4d', 0.25);
    if (p.hp <= 0) {
      p.hp = 0;
      st.phase = 'dead';
      st.endT = st.t;
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

  /* ---------------- 技能释放 ---------------- */
  function fireSkill(st, slot, forcedTarget) {
    const p = st.player;
    const s = p.skills[slot];
    if (!s) return false;
    const calc = st.skills[s.id];
    if (!calc) return false;

    const sk = calc.skill;
    let target = forcedTarget;
    if (!target) {
      const range = sk.range || (sk.radius ? sk.radius + 40 : 70);
      target = nearestEnemy(st, p.x, p.y, range);
    }

    if (sk.kind === 'melee') {
      const hit = enemiesNear(st, p.x, p.y, sk.range);
      if (!hit.length) return false;
      const aim = Math.atan2(target.y - p.y, target.x - p.x);
      let any = false;
      for (let i = 0; i < hit.length; i++) {
        const e = hit[i];
        const ang = Math.atan2(e.y - p.y, e.x - p.x);
        let diff = Math.abs(ang - aim);
        if (diff > Math.PI) diff = TAU - diff;
        if (diff > sk.arc / 2 + 0.35) continue;
        const h = E.rollHit(calc, rand.bind(null, st));
        damageEnemy(st, e, h.dmg, h.crit, calc.parts[0].type);
        any = true;
      }
      if (!any) return false;
      addFx(st, 'slash', p.x, p.y, sk.range, '#e8e2d0', 0.16, { ang: aim });
      return true;
    }

    if (sk.kind === 'aura') {
      const hit = enemiesNear(st, p.x, p.y, sk.radius);
      if (!hit.length) return false;
      for (let i = 0; i < hit.length; i++) {
        const h = E.rollHit(calc, rand.bind(null, st));
        damageEnemy(st, hit[i], h.dmg, h.crit, 'cold');
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
      const jumps = 1 + (sk.chain || 0);
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
      st.zones.push({
        kind: 'meteor', x: target.x, y: target.y, r: sk.radius,
        t: 0, delay: sk.delay, calc: calc, done: false
      });
      return true;
    }

    // projectile / boomerang
    if (!target) {
      target = nearestEnemy(st, p.x, p.y, 320);
      if (!target) return false;
    }
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    const n = calc.proj;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i - (n - 1) / 2) * 0.22 : 0;
      const a = ang + spread;
      st.shots.push({
        kind: sk.kind, x: p.x, y: p.y - 4,
        vx: Math.cos(a) * sk.speed, vy: Math.sin(a) * sk.speed,
        r: sk.kind === 'boomerang' ? 6 : 5,
        ttl: (sk.range || 260) / sk.speed,
        calc: calc, pierce: calc.pierce, hitSet: {},
        angle: a, spin: 0, home: sk.kind === 'boomerang',
        born: st.t
      });
    }
    p.face = Math.cos(ang) >= 0 ? 1 : -1;
    return true;
  }

  /* ---------------- 爆炸 ---------------- */
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

  /* ---------------- 主循环 ---------------- */
  function step(st, dt, input) {
    if (st.phase !== 'run') return;
    st.t += dt;
    const p = st.player;

    /* 玩家移动 */
    let mx = input.mx, my = input.my;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      p.x += mx * p.speed * dt;
      p.y += my * p.speed * dt;
      p.face = mx >= 0 ? 1 : -1;
      p.walkT += dt * 9;
      p.moving = true;
    } else {
      p.moving = false;
    }
    const W = CFG.worldSize;
    p.x = E.clamp(p.x, 12, W - 12);
    p.y = E.clamp(p.y, 12, W - 12);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;

    /* 技能冷却与释放 */
    for (let i = 0; i < p.skills.length; i++) {
      const s = p.skills[i];
      s.cd -= dt;
      if (s.cd <= 0) {
        const calc = st.skills[s.id];
        if (calc) {
          const ok = fireSkill(st, i);
          if (ok) s.cd = 1 / calc.rate;
          else s.cd = 0.08;
        }
      }
    }

    /* 刷怪 */
    spawnStep(st, dt);

    /* 敌人 */
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      if (e.dead) continue;
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

      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = e.speed * (e.chill > 0 ? 0.5 : 1);
      if (d > 2) {
        let wob = 0;
        if (e.wobble) wob = Math.sin(e.t * 6 + e.seed) * 0.5;
        const ang = Math.atan2(dy, dx) + wob;
        e.x += Math.cos(ang) * spd * dt;
        e.y += Math.sin(ang) * spd * dt;
      }

      // 接触伤害
      const touch = e.r + 6;
      if (d < touch) {
        e.hitCd = (e.hitCd || 0) - dt;
        if (e.hitCd <= 0) {
          e.hitCd = 0.75;
          hurtPlayer(st, e.dmg);
        }
      } else if (e.hitCd > 0) {
        e.hitCd -= dt * 0.5;
      }
    }

    /* 弹道 */
    for (let i = 0; i < st.shots.length; i++) {
      const s = st.shots[i];
      if (s.dead) continue;
      s.t += dt;
      s.spin += dt * 14;
      if (s.home && s.t > (s.ttl || 1.5) * 0.5) {
        // 回旋
        const ax = p.x - s.x, ay = p.y - s.y;
        const ad = Math.hypot(ax, ay) || 1;
        s.vx += (ax / ad) * 900 * dt;
        s.vy += (ay / ad) * 900 * dt;
        const sp = Math.hypot(s.vx, s.vy);
        const maxSp = 220;
        if (sp > maxSp) { s.vx = s.vx / sp * maxSp; s.vy = s.vy / sp * maxSp; }
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

    /* 区域技能（陨石） */
    for (let i = 0; i < st.zones.length; i++) {
      const z = st.zones[i];
      z.t += dt;
      if (!z.done && z.t >= z.delay) {
        z.done = true;
        explode(st, z.x, z.y, z.r, z.calc, 'fire');
        addFx(st, 'ring', z.x, z.y, z.r * 1.1, '#ff6b2b', 0.3);
      }
    }

    /* 拾取物 */
    for (let i = 0; i < st.pickups.length; i++) {
      const pk = st.pickups[i];
      if (pk.dead) continue;
      pk.t += dt;
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd < p.pickup) {
        const pull = 260 * dt / Math.max(6, dd);
        pk.x += dx * pull * 3;
        pk.y += dy * pull * 3;
      }
      if (dd < 10) {
        pk.dead = true;
        if (pk.kind === 'xp') {
          gainXp(st, pk.value);
        } else if (pk.kind === 'item') {
          if (st.bag.length < 8) {
            st.bag.push(pk.item);
            toast(st, '获得 ' + pk.item.name, pk.item.rarity === 2 ? 'rare' : '');
          } else {
            gainXp(st, 3);
            toast(st, '背包已满，转化为经验', 'bad');
          }
        } else if (pk.kind === 'heal') {
          p.hp = Math.min(p.maxHp, p.hp + 25);
          toast(st, '+25 生命', 'good');
        }
      }
    }

    /* 特效与文字 */
    for (let i = 0; i < st.fx.length; i++) {
      const f = st.fx[i];
      f.t += dt;
      if (f.kind === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.92; f.vy *= 0.92; }
    }
    for (let i = 0; i < st.texts.length; i++) { st.texts[i].t += dt; }
    for (let i = 0; i < st.toasts.length; i++) st.toasts[i].t += dt;

    /* 清理 */
    st.cleanAcc = (st.cleanAcc || 0) + dt;
    if (st.cleanAcc >= 0.4) {
      st.cleanAcc = 0;
      st.enemies = st.enemies.filter(function (e) { return !e.dead; });
    }
    st.shots = st.shots.filter(function (s) { return !s.dead; });
    st.zones = st.zones.filter(function (z) { return z.t < z.delay + 0.4; });
    st.pickups = st.pickups.filter(function (pk) { return !pk.dead && pk.t < 90; });
    st.fx = st.fx.filter(function (f) { return f.t < f.dur; });
    st.texts = st.texts.filter(function (t2) { return t2.t < t2.life; });
    st.toasts = st.toasts.filter(function (t2) { return t2.t < 2.6; });

    /* 升级打断 */
    if (p.pendingLevels > 0 && st.phase === 'run') st.phase = 'levelup';

    /* 首领与结束 */
    if (!st.bossSpawned && st.t >= CFG.bossTime) {
      st.bossSpawned = true;
      spawnEnemy(st, 'boss', false);
      toast(st, '深渊之眼降临', 'bad');
    }
    if (st.t >= CFG.runTime && st.phase === 'run') {
      // 超时不结束，继续打，直到击杀首领
    }
  }

  /* ---------------- 刷怪 ---------------- */
  function waveAt(t) {
    let w = D.WAVES[0];
    for (let i = 0; i < D.WAVES.length; i++) if (t >= D.WAVES[i].t) w = D.WAVES[i];
    return w;
  }

  function spawnStep(st, dt) {
    const w = waveAt(st.t);
    if (st.enemies.length >= w.cap) return;
    st.spawnAcc += w.rate * dt;
    while (st.spawnAcc >= 1 && st.enemies.length < w.cap) {
      st.spawnAcc -= 1;
      const pool = w.pool;
      let total = 0;
      for (const k in pool) total += pool[k];
      let r = rand(st) * total;
      let typeId = 'slime';
      for (const k in pool) { r -= pool[k]; if (r <= 0) { typeId = k; break; } }
      const elite = st.t > 90 && rand(st) < 0.045;
      spawnEnemy(st, typeId, elite);
    }
  }

  function spawnEnemy(st, typeId, elite) {
    const stats = E.enemyStats(typeId, st.t);
    const p = st.player;
    const ang = rand(st) * TAU;
    const rad = 230 + rand(st) * 70;
    let x = p.x + Math.cos(ang) * rad;
    let y = p.y + Math.sin(ang) * rad;
    const W = CFG.worldSize;
    x = E.clamp(x, 10, W - 10);
    y = E.clamp(y, 10, W - 10);

    const e = {
      id: st.nextId++,
      type: typeId, sprite: stats.sprite, boss: stats.boss,
      x: x, y: y, hp: stats.hp, maxHp: stats.hp,
      dmg: stats.dmg, speed: stats.speed, r: stats.r,
      xp: stats.xp, mass: stats.mass, wobble: stats.wobble,
      elite: !!elite, flash: 0, chill: 0, burn: 0, burnDps: 0,
      t: 0, seed: rand(st) * 10, hitCd: 0, dead: false
    };
    if (elite) {
      const m = D.ELITE_MODS[ri(st, 0, D.ELITE_MODS.length - 1)];
      e.eliteName = m.name;
      if (m.hp) { e.hp *= m.hp; e.maxHp = e.hp; }
      if (m.spd) e.speed *= m.spd;
      if (m.dmg) e.dmg *= m.dmg;
      if (m.scale) { e.r *= m.scale; }
      e.xp *= 3;
    }
    st.enemies.push(e);
    if (e.boss) st.bossId = e.id;
    return e;
  }

  /* ---------------- 经验与升级 ---------------- */
  function gainXp(st, v) {
    const p = st.player;
    p.xp += v;
    while (p.xp >= p.xpNext && p.level < CFG.maxLevel) {
      p.xp -= p.xpNext;
      p.level++;
      p.pendingLevels++;
      p.xpNext = E.xpForLevel(p.level);
    }
    if (p.level >= CFG.maxLevel) p.xp = Math.min(p.xp, p.xpNext);
  }

  /* ---------------- 升级选项 ---------------- */
  const STAT_POOL = [
    { id: 'hp', name: '生命泉涌', icon: 'heart', desc: '+20 最大生命并立刻治疗', apply: function (p) { p.runMods.push({ k: 'life', v: 20 }); } },
    { id: 'dmg', name: '战意', icon: 'icon_dagger', desc: '+10% 全部伤害', apply: function (p) { p.runMods.push({ k: 'inc', t: 'all', v: 0.10 }); } },
    { id: 'spd', name: '疾行', icon: 'icon_boot', desc: '+8% 移动速度', apply: function (p) { p.runMods.push({ k: 'move', v: 0.08 }); } },
    { id: 'aspd', name: '迅捷', icon: 'icon_bolt', desc: '+10% 攻击速度', apply: function (p) { p.runMods.push({ k: 'speed', v: 0.10 }); } },
    { id: 'crit', name: '致命', icon: 'icon_ring', desc: '+8% 暴击率', apply: function (p) { p.runMods.push({ k: 'crit', v: 0.08 }); } },
    { id: 'pickup', name: '磁力', icon: 'gem', desc: '+25% 拾取范围', apply: function (p) { p.runMods.push({ k: 'pickup', v: 0.25 }); } },
    { id: 'cdr', name: '专注', icon: 'icon_frost', desc: '+8% 冷却缩减', apply: function (p) { p.runMods.push({ k: 'cdr', v: 0.08 }); } },
    { id: 'area', name: '扩散', icon: 'icon_fire', desc: '+15% 范围伤害', apply: function (p) { p.runMods.push({ k: 'inc', t: 'area', v: 0.15 }); } }
  ];

  function rollChoices(st) {
    const p = st.player;
    const pool = [];

    // 新技能
    if (p.skills.length < 3) {
      for (let i = 0; i < D.SKILL_IDS.length; i++) {
        const id = D.SKILL_IDS[i];
        if (!p.skills.some(function (s) { return s.id === id; })) {
          pool.push({ kind: 'new', id: id, weight: 34 });
        }
      }
    }
    // 升级技能
    for (let i = 0; i < p.skills.length; i++) {
      if (p.skills[i].level < D.MAX_SKILL_LEVEL) {
        pool.push({ kind: 'up', id: p.skills[i].id, weight: 46 });
      }
    }
    // 属性
    for (let i = 0; i < STAT_POOL.length; i++) {
      pool.push({ kind: 'stat', id: STAT_POOL[i].id, weight: 20 });
    }

    const out = [];
    const used = {};
    let guard = 0;
    while (out.length < 3 && guard++ < 60) {
      let total = 0;
      for (let i = 0; i < pool.length; i++) if (!used[pool[i].kind + pool[i].id]) total += pool[i].weight;
      if (total <= 0) break;
      let r = rand(st) * total;
      let chosen = null;
      for (let i = 0; i < pool.length; i++) {
        const it = pool[i];
        if (used[it.kind + it.id]) continue;
        r -= it.weight;
        if (r <= 0) { chosen = it; break; }
      }
      if (!chosen) break;
      used[chosen.kind + chosen.id] = true;
      out.push(chosen);
    }
    return out;
  }

  function applyChoice(st, choice) {
    const p = st.player;
    if (choice.kind === 'new') addSkill(st, choice.id);
    else if (choice.kind === 'up') levelUpSkill(st, choice.id);
    else {
      const s = STAT_POOL.find(function (x) { return x.id === choice.id; });
      if (s) s.apply(p);
      recompute(st);
    }
    p.pendingLevels--;
    if (p.pendingLevels <= 0) st.phase = 'run';
    else st.phase = 'levelup';
  }

  /* ---------------- 装备 ---------------- */
  function equip(st, item) {
    const old = st.gear[item.slot];
    st.gear[item.slot] = item;
    if (old) st.bag.push(old);
    recompute(st);
    return old;
  }

  function unequip(st, slot) {
    const it = st.gear[slot];
    if (!it) return;
    st.gear[slot] = null;
    st.bag.push(it);
    recompute(st);
  }

  function previewEquip(st, item) {
    const fake = {
      helm: st.gear.helm, body: st.gear.body, ring: st.gear.ring, amulet: st.gear.amulet
    };
    fake[item.slot] = item;
    const agg = E.gearAgg(fake);
    for (let i = 0; i < st.player.runMods.length; i++) E.applyMod(agg, st.player.runMods[i]);
    let dps = 0;
    for (let i = 0; i < st.player.skills.length; i++) {
      const s = st.player.skills[i];
      const c = E.computeSkill(s.id, s.level, agg);
      if (c) dps += c.dps;
    }
    const hp = Math.round(CFG.baseHp + CFG.hpPerLevel * (st.player.level - 1) + agg.life);
    return { dps: dps, hp: hp };
  }

  root.SIM = {
    create: create, step: step, recompute: recompute,
    addSkill: addSkill, rollChoices: rollChoices, applyChoice: applyChoice,
    equip: equip, unequip: unequip, previewEquip: previewEquip,
    fireSkill: fireSkill, gainXp: gainXp, waveAt: waveAt,
    rand: rand, STAT_POOL: STAT_POOL
  };
})(window);
