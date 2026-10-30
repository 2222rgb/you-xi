/* =========================================================
   engine.js — 纯数值内核（无 DOM、无时间、无副作用）
     伤害流水线：基础 → 附加 → ×(1+Σ增加) → ×Π(1+更多) → 暴击期望 → 抗性
   ========================================================= */
(function (root) {
  'use strict';

  const D = root.DATA;
  const CFG = D.CONFIG;
  const ELE = D.ELE;

  /* ---------------- 随机数 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- 聚合器 ---------------- */
  function emptyAgg() {
    return {
      flat: { phys: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
      inc: {
        all: 0, phys: 0, fire: 0, cold: 0, lightning: 0, chaos: 0,
        elemental: 0, area: 0, projectile: 0, melee: 0, spell: 0, strike: 0
      },
      more: [],
      speed: 0, cdr: 0, crit: 0, critMulti: 0,
      life: 0, move: 0, pickup: 0,
      proj: 0, pierce: 0
    };
  }

  function applyMod(agg, m) {
    if (!m || !m.k) return;
    const v = m.v;
    switch (m.k) {
      case 'flat': if (agg.flat[m.t] !== undefined) agg.flat[m.t] += v; break;
      case 'inc': agg.inc[m.t] = (agg.inc[m.t] || 0) + v; break;
      case 'more': agg.more.push({ v: v, t: m.t || 'all' }); break;
      case 'speed': agg.speed += v; break;
      case 'cdr': agg.cdr += v; break;
      case 'crit': agg.crit += v; break;
      case 'critMulti': agg.critMulti += v; break;
      case 'life': agg.life += v; break;
      case 'move': agg.move += v; break;
      case 'pickup': agg.pickup += v; break;
      case 'proj': agg.proj += v; break;
      case 'pierce': agg.pierce += v; break;
      default: break;
    }
  }

  function gearAgg(gear) {
    const agg = emptyAgg();
    for (let i = 0; i < D.SLOTS.length; i++) {
      const it = gear[D.SLOTS[i]];
      if (!it) continue;
      for (let j = 0; j < it.mods.length; j++) applyMod(agg, it.mods[j]);
    }
    return agg;
  }

  /* ---------------- 标签匹配 ---------------- */
  function typeMatches(t, type) {
    if (!t || t === 'all') return true;
    if (t === 'elemental') return ELE.indexOf(type) >= 0;
    return t === type;
  }

  function incFor(agg, type, tags) {
    let v = agg.inc.all + (agg.inc[type] || 0);
    if (ELE.indexOf(type) >= 0) v += agg.inc.elemental;
    for (let i = 0; i < tags.length; i++) v += (agg.inc[tags[i]] || 0);
    return v;
  }

  function moreFor(agg, type) {
    let m = 1;
    for (let i = 0; i < agg.more.length; i++) {
      if (!typeMatches(agg.more[i].t, type)) continue;
      m *= (1 + agg.more[i].v);
    }
    return m;
  }

  /* ---------------- 技能计算 ---------------- */
  function computeSkill(skillId, level, agg) {
    const sk = D.SKILLS[skillId];
    if (!sk) return null;
    const lv = clamp(level || 1, 1, D.MAX_SKILL_LEVEL);
    const scale = Math.pow(sk.perLevel, lv - 1);

    const parts = [];
    for (const t in sk.base) {
      const lo = sk.base[t][0] * scale;
      const hi = sk.base[t][1] * scale;
      const flat = agg.flat[t] || 0;
      const inc = incFor(agg, t, sk.tags);
      const more = moreFor(agg, t);
      parts.push({
        type: t,
        min: (lo + flat) * (1 + inc) * more,
        max: (hi + flat) * (1 + inc) * more,
        inc: inc, more: more, flat: flat
      });
    }

    let crit = 0.05 * (1 + agg.crit);
    crit = clamp(crit, 0, 1);
    const critMulti = 1.5 * (1 + agg.critMulti);
    const critExpected = 1 + crit * (critMulti - 1);

    const cdr = clamp(agg.cdr, 0, 0.6);
    const rate = sk.rate * (1 + agg.speed) / (1 - cdr);

    let dmgMin = 0, dmgMax = 0, dmgAvg = 0;
    for (let i = 0; i < parts.length; i++) {
      dmgMin += parts[i].min;
      dmgMax += parts[i].max;
      dmgAvg += (parts[i].min + parts[i].max) / 2;
    }
    const hitAvg = dmgAvg * critExpected;
    const dps = hitAvg * rate;

    return {
      id: sk.id, name: sk.name, level: lv, skill: sk, parts: parts,
      min: dmgMin, max: dmgMax, avg: dmgAvg,
      hitAvg: hitAvg, dps: dps, rate: rate,
      crit: crit, critMulti: critMulti, critExpected: critExpected,
      proj: 1 + agg.proj,
      pierce: (sk.pierce || 0) + agg.pierce,
      radius: (sk.radius || 0),
      tags: sk.tags
    };
  }

  /* 掷一次具体命中 */
  function rollHit(computed, rng) {
    let dmg = 0;
    const isCrit = rng() < computed.crit;
    for (let i = 0; i < computed.parts.length; i++) {
      const p = computed.parts[i];
      let v = p.min + (p.max - p.min) * rng();
      if (isCrit) v *= computed.critMulti;
      dmg += v;
    }
    return { dmg: dmg, crit: isCrit };
  }

  /* ---------------- 装备生成 ---------------- */
  const PREFIX = ['腐化', '暗影', '灰烬', '血咒', '风暴', '凝结', '破碎', '幽邃', '炽热', '缄默', '枯骨'];
  const SUFFIX = ['之怒', '之守', '之噬', '之歌', '之终', '之痕', '之誓', '之息', '之印', '之赐', '之葬'];

  function pickTier(tiers, ilvl, rng) {
    let best = null;
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i][2] <= ilvl) best = tiers[i];
    }
    if (!best) best = tiers[0];
    // 有几率降一档，避免永远拿最高
    if (rng() < 0.25 && tiers.length > 1) {
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (tiers[i][2] <= ilvl && tiers[i] !== best) { best = tiers[i]; break; }
      }
    }
    return best;
  }

  function rollItem(slot, ilvl, rng, forceRarity) {
    const pool = D.AFFIXES.filter(function (a) { return a.slots.indexOf(slot) >= 0; });
    let rarity = forceRarity;
    if (rarity === undefined) {
      const r = rng();
      if (r < 0.13) rarity = 2;
      else if (r < 0.46) rarity = 1;
      else rarity = 0;
    }
    const count = rarity === 0 ? 0 : (rarity === 1 ? (1 + (rng() < 0.45 ? 1 : 0)) : (3 + (rng() < 0.5 ? 1 : 0)));
    const mods = [];
    const used = {};
    let guard = 0;
    while (mods.length < count && guard++ < 50) {
      const a = pool[Math.floor(rng() * pool.length)];
      if (!a || used[a.id]) continue;
      used[a.id] = true;
      const tier = pickTier(a.tiers, Math.max(1, ilvl), rng);
      let raw = tier[0] + (tier[1] - tier[0]) * rng();
      raw = Math.round(raw);
      const v = a.pct ? raw / 100 : (a.m.v !== undefined ? a.m.v : raw);
      const mod = { k: a.m.k, t: a.m.t, v: v, label: a.fmt.replace('{v}', raw) };
      mods.push(mod);
    }

    const names = D.BASE_NAMES[slot];
    const base = names[Math.floor(rng() * names.length)];
    let name = base;
    if (rarity === 1) name = PREFIX[Math.floor(rng() * PREFIX.length)] + base;
    else if (rarity === 2) name = PREFIX[Math.floor(rng() * PREFIX.length)] + base + SUFFIX[Math.floor(rng() * SUFFIX.length)];

    return {
      slot: slot, name: name, base: base, rarity: rarity, ilvl: ilvl, mods: mods
    };
  }

  /* ---------------- 怪物 ---------------- */
  function enemyStats(typeId, timeSec) {
    const b = D.ENEMIES[typeId];
    const t = timeSec / 60;
    const hpMul = 1 + t * 0.62;
    const dmgMul = 1 + t * 0.30;
    return {
      id: b.id, name: b.name, sprite: b.sprite, boss: !!b.boss,
      hp: Math.round(b.hp * hpMul),
      dmg: b.dmg * dmgMul,
      speed: b.speed,
      r: b.r,
      xp: Math.max(1, Math.round(b.xp * (1 + t * 0.25))),
      mass: b.mass || 1,
      wobble: !!b.wobble
    };
  }

  function xpForLevel(lvl) {
    return Math.floor(5 + lvl * 4 + Math.pow(lvl, 1.6));
  }

  /* ---------------- 自检 ---------------- */
  function selfTest() {
    const out = [];
    const T = function (n, c, d) { out.push({ name: n, pass: !!c, detail: d || '' }); };

    const agg = emptyAgg();
    const s1 = computeSkill('fireball', 1, agg);
    T('技能可计算', s1 && s1.dps > 0, s1 ? 'DPS=' + Math.round(s1.dps) : 'null');

    // 两个 20% inc = 1.4 倍（加法）
    const a2 = emptyAgg(); applyMod(a2, { k: 'inc', t: 'all', v: 0.2 }); applyMod(a2, { k: 'inc', t: 'all', v: 0.2 });
    const s2 = computeSkill('fireball', 1, a2);
    T('增加为加法', Math.abs(s2.dps / s1.dps - 1.4) < 1e-6, '倍率=' + (s2.dps / s1.dps).toFixed(3));

    // 两个 20% more = 1.44 倍（乘法）
    const a3 = emptyAgg(); applyMod(a3, { k: 'more', v: 0.2 }); applyMod(a3, { k: 'more', v: 0.2 });
    const s3 = computeSkill('fireball', 1, a3);
    T('更多为乘法', Math.abs(s3.dps / s1.dps - 1.44) < 1e-6, '倍率=' + (s3.dps / s1.dps).toFixed(3));

    // 标签隔离：物理词缀不该影响火焰技能
    const a4 = emptyAgg(); applyMod(a4, { k: 'inc', t: 'phys', v: 1.0 });
    const s4 = computeSkill('fireball', 1, a4);
    T('标签隔离（物理不影响火焰）', Math.abs(s4.dps - s1.dps) < 1e-6);

    // 暴击封顶
    const a5 = emptyAgg(); a5.crit = 100;
    const s5 = computeSkill('fireball', 1, a5);
    T('暴击率封顶 100%', s5.crit <= 1 + 1e-9, (s5.crit * 100).toFixed(0) + '%');

    // 百分比词缀换算
    let rng = mulberry32(12345);
    let bad = null;
    for (let i = 0; i < 60; i++) {
      const it = rollItem('ring', 12, rng, 2);
      for (let j = 0; j < it.mods.length; j++) {
        const m = it.mods[j];
        if ((m.k === 'inc' || m.k === 'crit' || m.k === 'speed' || m.k === 'critMulti') && m.v > 3) bad = m;
      }
    }
    T('百分比词缀已换算', !bad, bad ? bad.label : '抽样 60 件全部合法');

    // 词缀确实影响对应技能
    const ring = { slot: 'ring', name: 'x', rarity: 2, ilvl: 20, mods: [{ k: 'inc', t: 'fire', v: 0.5, label: '+50%' }] };
    const ga = gearAgg({ ring: ring });
    const s6 = computeSkill('fireball', 1, ga);
    const s7 = computeSkill('dagger', 1, ga);
    T('火焰词缀只影响火焰技能', s6.dps > s1.dps && Math.abs(s7.dps - computeSkill('dagger', 1, emptyAgg()).dps) < 1e-6);

    // 升级曲线
    const s8 = computeSkill('fireball', 5, emptyAgg());
    T('技能升级有收益', s8.dps > s1.dps * 2, 'Lv1→Lv5 = ' + (s8.dps / s1.dps).toFixed(2) + '×');

    return out;
  }

  root.ENGINE = {
    mulberry32: mulberry32, clamp: clamp,
    emptyAgg: emptyAgg, applyMod: applyMod, gearAgg: gearAgg,
    computeSkill: computeSkill, rollHit: rollHit,
    rollItem: rollItem, enemyStats: enemyStats, xpForLevel: xpForLevel,
    selfTest: selfTest
  };
})(window);
