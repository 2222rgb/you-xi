/* =========================================================
   engine.js — 纯数值内核（无 DOM、无时间、无副作用）
     伤害流水线：基础 → 附加 → ×(1+Σ增加) → ×Π(1+更多) → 暴击期望 → 抗性
   ========================================================= */
(function (root) {
  'use strict';

  const D = root.DATA;
  const CFG = D.CONFIG;
  const ELE = D.ELE;

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
      more: [], moreSpeed: [],
      speed: 0, cdr: 0, crit: 0, critMulti: 0,
      life: 0, lifePct: 0, move: 0, pickup: 0, gold: 0,
      proj: 0, pierce: 0, chain: 0, ampAil: 0, shockChance: 0
    };
  }

  function applyMod(agg, m) {
    if (!m || !m.k) return;
    const v = m.v;
    switch (m.k) {
      case 'flat': if (agg.flat[m.t] !== undefined) agg.flat[m.t] += v; break;
      case 'inc': agg.inc[m.t] = (agg.inc[m.t] || 0) + v; break;
      case 'more': agg.more.push({ v: v, t: m.t || 'all' }); break;
      case 'moreSpeed': agg.moreSpeed.push(v); break;
      case 'speed': agg.speed += v; break;
      case 'cdr': agg.cdr += v; break;
      case 'crit': agg.crit += v; break;
      case 'critMulti': agg.critMulti += v; break;
      case 'life': agg.life += v; break;
      case 'lifePct': agg.lifePct += v; break;
      case 'move': agg.move += v; break;
      case 'pickup': agg.pickup += v; break;
      case 'gold': agg.gold += v; break;
      case 'proj': agg.proj += v; break;
      case 'pierce': agg.pierce += v; break;
      case 'chain': agg.chain += v; break;
      case 'ampAil': agg.ampAil += v; break;
      case 'shockChance': agg.shockChance += v; break;
      default: break;
    }
  }

  function gearAgg(gear) {
    const agg = emptyAgg();
    for (let i = 0; i < D.SLOTS.length; i++) {
      const it = gear[D.SLOTS[i]];
      if (!it) continue;
      const plus = it.plus || 0;
      const pmul = 1 + plus * 0.05;
      for (let j = 0; j < it.mods.length; j++) {
        const m = it.mods[j];
        if (plus > 0 && m.v) applyMod(agg, { k: m.k, t: m.t, v: m.v * pmul });
        else applyMod(agg, m);
      }
    }
    return agg;
  }

  /** 天赋按「等级」放大：ranks = { nodeId: rank } */
  function talentAgg(ranks) {
    const agg = emptyAgg();
    if (!ranks) return agg;
    for (const id in ranks) {
      const entry = D.TALENT_INDEX[id];
      if (!entry) continue;
      const r = ranks[id] || 0;
      if (r <= 0) continue;
      const mods = entry.node.mods || [];
      for (let i = 0; i < mods.length; i++) {
        const m = mods[i];
        applyMod(agg, { k: m.k, t: m.t, v: m.v * r });
      }
    }
    return agg;
  }

  /** 装备 + 天赋 + 药水等临时加成，合并成一个聚合体 */
  function buildAgg(gear, talentIds, extraMods) {
    const agg = gearAgg(gear);
    const t = talentAgg(talentIds);
    for (const k in agg.inc) agg.inc[k] += t.inc[k] || 0;
    for (const k in agg.flat) agg.flat[k] += t.flat[k] || 0;
    agg.more = agg.more.concat(t.more);
    agg.moreSpeed = agg.moreSpeed.concat(t.moreSpeed);
    agg.speed += t.speed; agg.cdr += t.cdr;
    agg.crit += t.crit; agg.critMulti += t.critMulti;
    agg.life += t.life; agg.lifePct += t.lifePct;
    agg.move += t.move; agg.pickup += t.pickup; agg.gold += t.gold;
    agg.proj += t.proj; agg.pierce += t.pierce; agg.chain += t.chain;
    agg.ampAil += t.ampAil; agg.shockChance += t.shockChance;
    if (extraMods) for (let i = 0; i < extraMods.length; i++) applyMod(agg, extraMods[i]);
    return agg;
  }

  /* ---------------- 标签匹配 ---------------- */
  function typeMatches(t, type) {
    if (!t || t === 'all') return true;
    if (t === 'elemental') return ELE.indexOf(type) >= 0;
    return t === type;
  }

  function incFor(agg, type, tags) {
    let v = (agg.inc.all || 0) + (agg.inc[type] || 0);
    if (ELE.indexOf(type) >= 0) v += agg.inc.elemental || 0;
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

    let moreSpeed = 1;
    for (let i = 0; i < agg.moreSpeed.length; i++) moreSpeed *= (1 + agg.moreSpeed[i]);
    const cdr = clamp(agg.cdr, 0, 0.6);
    const rate = sk.rate * (1 + agg.speed) * moreSpeed / (1 - cdr);

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
      chain: (sk.chain || 0) + agg.chain,
      radius: sk.radius || 0,
      tags: sk.tags
    };
  }

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
  const PREFIX = ['腐化', '暗影', '灰烬', '血咒', '风暴', '凝结', '破碎', '幽邃', '炽热', '缄默', '枯骨', '裂纹'];
  const SUFFIX = ['之怒', '之守', '之噬', '之歌', '之终', '之痕', '之誓', '之息', '之印', '之赐', '之葬'];

  function pickTier(tiers, ilvl, rng) {
    let best = null;
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i][2] <= ilvl) best = tiers[i];
    }
    if (!best) best = tiers[0];
    if (rng() < 0.28 && tiers.length > 1) {
      for (let i = tiers.length - 1; i >= 0; i--) {
        if (tiers[i][2] <= ilvl && tiers[i] !== best) { best = tiers[i]; break; }
      }
    }
    return best;
  }

  function affixPool(slot) {
    return D.AFFIXES.filter(function (a) { return a.slots.indexOf(slot) >= 0; });
  }

  function rollAffix(slot, ilvl, rng, used) {
    const pool = affixPool(slot);
    let a = null, guard = 0;
    do {
      a = pool[Math.floor(rng() * pool.length)];
      guard++;
    } while (a && used[a.id] && guard < 40);
    if (!a || used[a.id]) return null;
    used[a.id] = true;
    const tier = pickTier(a.tiers, Math.max(1, ilvl), rng);
    let raw = Math.round(tier[0] + (tier[1] - tier[0]) * rng());
    const v = a.pct ? raw / 100 : (a.m.v !== undefined ? a.m.v : raw);
    return { k: a.m.k, t: a.m.t, v: v, label: a.fmt.replace('{v}', raw), affix: a.id };
  }

  function makeLegendary(l, ilvl) {
    return {
      slot: l.slot, name: l.name, base: l.base, rarity: 3, ilvl: ilvl,
      mods: l.mods.map(function (m) { return { k: m.k, t: m.t, v: m.v, label: m.label }; }),
      flavor: l.flavor
    };
  }

  function rollItem(slot, ilvl, rng, forceRarity) {
    const out = rollItemRaw(slot, ilvl, rng, forceRarity);
    if (out) out.plus = 0;
    return out;
  }

  function rollItemRaw(slot, ilvl, rng, forceRarity) {
    let rarity = forceRarity;
    if (rarity === undefined) {
      const r = rng();
      if (r < 0.02) rarity = 3;
      else if (r < 0.14) rarity = 2;
      else if (r < 0.46) rarity = 1;
      else rarity = 0;
    }
    if (rarity === 3) {
      const pool = D.LEGENDARIES.filter(function (l) { return l.slot === slot; });
      if (pool.length) return makeLegendary(pool[Math.floor(rng() * pool.length)], ilvl);
      rarity = 2;
    }

    const used = {};
    let count = rarity === 0 ? 0 : (rarity === 1 ? 1 + (rng() < 0.45 ? 1 : 0) : 3 + (rng() < 0.5 ? 1 : 0));
    const mods = [];
    for (let i = 0; i < count; i++) {
      const m = rollAffix(slot, ilvl, rng, used);
      if (m) mods.push(m);
    }
    const names = D.BASE_NAMES[slot];
    const base = names[Math.floor(rng() * names.length)];
    let name = base;
    if (rarity === 1) name = PREFIX[Math.floor(rng() * PREFIX.length)] + base;
    else if (rarity === 2) name = PREFIX[Math.floor(rng() * PREFIX.length)] + base + SUFFIX[Math.floor(rng() * SUFFIX.length)];

    return { slot: slot, name: name, base: base, rarity: rarity, ilvl: ilvl, mods: mods };
  }

  /* ---------------- 打造 ---------------- */
  function craftReroll(item, rng) {
    const used = {};
    const count = item.mods.length;
    const mods = [];
    for (let i = 0; i < count; i++) {
      const m = rollAffix(item.slot, item.ilvl, rng, used);
      if (m) mods.push(m);
    }
    return Object.assign({}, item, { mods: mods });
  }

  function craftAdd(item, rng) {
    const cap = item.rarity === 0 ? 1 : (item.rarity === 1 ? 3 : 5);
    if (item.mods.length >= cap) return null;
    const used = {};
    for (let i = 0; i < item.mods.length; i++) if (item.mods[i].affix) used[item.mods[i].affix] = true;
    const m = rollAffix(item.slot, item.ilvl, rng, used);
    if (!m) return null;
    return Object.assign({}, item, { mods: item.mods.concat([m]) });
  }

  function craftUpgrade(item, rng) {
    if (item.rarity >= 2) return null;
    const used = {};
    for (let i = 0; i < item.mods.length; i++) if (item.mods[i].affix) used[item.mods[i].affix] = true;
    const extra = item.rarity === 0 ? 2 : 2;
    const mods = item.mods.slice();
    for (let i = 0; i < extra; i++) {
      const m = rollAffix(item.slot, item.ilvl, rng, used);
      if (m) mods.push(m);
    }
    return Object.assign({}, item, { rarity: item.rarity + 1, mods: mods });
  }

  function itemPrice(item) { return D.PRICES.sell(item); }

  /** 强化费用：随 +N 指数上涨 */
  function enhanceCost(item) {
    return Math.round((80 + item.ilvl * 35) * Math.pow(1.35, item.plus || 0));
  }

  /* ---------------- 怪物 ---------------- */
  function enemyStats(typeId, phaseT, cycle) {
    const b = D.ENEMIES[typeId];
    const t = phaseT / 60;
    const c = Math.max(0, (cycle || 1) - 1) * CFG.enemyScalePerCycle;
    const hpMul = (1 + t * 0.55) * (1 + c);
    const dmgMul = (1 + t * 0.28) * (1 + c * 2.0);
    return {
      id: b.id, name: b.name, sprite: b.sprite, boss: !!b.boss,
      hp: Math.round(b.hp * hpMul),
      dmg: b.dmg * dmgMul,
      speed: b.speed,
      r: b.r,
      xp: Math.max(1, Math.round(b.xp * (1 + t * 0.2) * (1 + c * 0.5))),
      gold: Math.max(1, Math.round(b.gold * (1 + c * 0.22))),
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

    const a2 = emptyAgg(); applyMod(a2, { k: 'inc', t: 'all', v: 0.2 }); applyMod(a2, { k: 'inc', t: 'all', v: 0.2 });
    const s2 = computeSkill('fireball', 1, a2);
    T('增加为加法', Math.abs(s2.dps / s1.dps - 1.4) < 1e-6, '倍率=' + (s2.dps / s1.dps).toFixed(3));

    const a3 = emptyAgg(); applyMod(a3, { k: 'more', v: 0.2 }); applyMod(a3, { k: 'more', v: 0.2 });
    const s3 = computeSkill('fireball', 1, a3);
    T('更多为乘法', Math.abs(s3.dps / s1.dps - 1.44) < 1e-6, '倍率=' + (s3.dps / s1.dps).toFixed(3));

    const a4 = emptyAgg(); applyMod(a4, { k: 'inc', t: 'phys', v: 1.0 });
    const s4 = computeSkill('fireball', 1, a4);
    T('标签隔离（物理不影响火焰）', Math.abs(s4.dps - s1.dps) < 1e-6);

    const a5 = emptyAgg(); a5.crit = 100;
    const s5 = computeSkill('fireball', 1, a5);
    T('暴击率封顶 100%', s5.crit <= 1 + 1e-9, (s5.crit * 100).toFixed(0) + '%');

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

    // 天赋确实进入乘区
    const ring = { slot: 'ring', name: 'x', rarity: 2, ilvl: 20, mods: [{ k: 'inc', t: 'fire', v: 0.5, label: '+50%' }] };
    const ga = buildAgg({ ring: ring }, []);
    const s6 = computeSkill('fireball', 1, ga);
    T('火焰词缀只影响火焰技能', s6.dps > s1.dps &&
      Math.abs(computeSkill('dagger', 1, ga).dps - computeSkill('dagger', 1, emptyAgg()).dps) < 1e-6);

    const tg = buildAgg({}, { b2: 5, b9: 1 }, null);
    const s7 = computeSkill('dagger', 1, tg);
    T('天赋树按等级生效（锋芒5级+血怒）', s7.dps > s1.dps * 1.3, '倍率=' + (s7.dps / computeSkill('dagger', 1, emptyAgg()).dps).toFixed(2));

    const s8 = computeSkill('fireball', 5, emptyAgg());
    T('技能升级有收益', s8.dps > s1.dps * 2, 'Lv1→Lv5 = ' + (s8.dps / s1.dps).toFixed(2) + '×');

    // 传奇必须能 Roll 出来
    const leg = rollItem('ring', 20, mulberry32(9), 3);
    T('传奇生成', leg.rarity === 3 && leg.mods.length > 0, leg.name);

    return out;
  }

  root.ENGINE = {
    mulberry32: mulberry32, clamp: clamp,
    emptyAgg: emptyAgg, applyMod: applyMod, gearAgg: gearAgg, talentAgg: talentAgg, buildAgg: buildAgg,
    computeSkill: computeSkill, rollHit: rollHit,
    rollItem: rollItem, itemPrice: itemPrice, enhanceCost: enhanceCost,
    craftReroll: craftReroll, craftAdd: craftAdd, craftUpgrade: craftUpgrade,
    enemyStats: enemyStats, xpForLevel: xpForLevel,
    selfTest: selfTest
  };
})(window);
