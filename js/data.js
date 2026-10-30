/* =========================================================
   data.js — 内容数据：技能 / 词缀 / 装备 / 怪物 / 时间轴
   ========================================================= */
(function (root) {
  'use strict';

  const TYPE_CN = { phys: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌', all: '全部', elemental: '元素' };
  const ELE = ['fire', 'cold', 'lightning'];

  /* ---------------- 技能 ----------------
     tags 决定词缀能否作用（火焰词缀只影响带 fire 的技能）
  */
  const SKILLS = {
    dagger: {
      id: 'dagger', name: '影刃', icon: 'icon_dagger', color: '#cfd8e8',
      kind: 'melee', tags: ['phys', 'melee', 'strike'],
      base: { phys: [7, 11] }, perLevel: 1.22,
      rate: 2.1, range: 46, arc: 1.5,
      desc: '向最近的敌人挥出一记快速的弧形斩击。'
    },
    fireball: {
      id: 'fireball', name: '炎爆', icon: 'icon_fire', color: '#ff8a3d',
      kind: 'projectile', tags: ['fire', 'projectile', 'area'],
      base: { fire: [13, 19] }, perLevel: 1.26,
      rate: 1.05, speed: 190, radius: 26, range: 300,
      desc: '掷出火球，命中后爆炸并点燃范围内的敌人。'
    },
    frostnova: {
      id: 'frostnova', name: '霜环', icon: 'icon_frost', color: '#7fdcff',
      kind: 'aura', tags: ['cold', 'area', 'spell'],
      base: { cold: [11, 17] }, perLevel: 1.24,
      rate: 0.85, radius: 58,
      desc: '以自身为中心爆发寒冰，减速命中的敌人。'
    },
    bolt: {
      id: 'bolt', name: '链雷', icon: 'icon_bolt', color: '#ffe066',
      kind: 'chain', tags: ['lightning', 'spell'],
      base: { lightning: [7, 13] }, perLevel: 1.28,
      rate: 1.25, chain: 2, chainRange: 74, range: 220,
      desc: '闪电在敌人之间跳跃，每次跳跃伤害递减。'
    },
    axe: {
      id: 'axe', name: '回旋斧', icon: 'icon_axe', color: '#c0c8d8',
      kind: 'boomerang', tags: ['phys', 'projectile', 'area'],
      base: { phys: [15, 22] }, perLevel: 1.24,
      rate: 0.75, speed: 160, radius: 22, range: 220, pierce: 4,
      desc: '掷出会回旋的战斧，穿透路径上的所有敌人。'
    },
    meteor: {
      id: 'meteor', name: '陨星', icon: 'icon_meteor', color: '#ff6b2b',
      kind: 'meteor', tags: ['fire', 'area', 'spell'],
      base: { fire: [26, 38] }, perLevel: 1.30,
      rate: 0.5, radius: 44, delay: 0.55,
      desc: '在敌群中召唤陨石，短暂延迟后砸下。'
    }
  };

  const SKILL_IDS = Object.keys(SKILLS);
  const MAX_SKILL_LEVEL = 5;

  /* ---------------- 词缀 ----------------
     pct: true 表示数值要除以 100 再进入乘区
     slots: 可出现的部位
  */
  const AFFIXES = [
    { id: 'life', slots: ['helm', 'body', 'ring', 'amulet'], m: { k: 'life' }, fmt: '+{v} 生命', tiers: [[14, 20, 1], [22, 32, 6], [34, 46, 11], [48, 64, 16]] },
    { id: 'inc_all', slots: ['ring', 'amulet'], m: { k: 'inc', t: 'all' }, pct: true, fmt: '+{v}% 全部伤害', tiers: [[6, 9, 1], [10, 14, 6], [15, 20, 11], [21, 28, 16]] },
    { id: 'inc_fire', slots: ['helm', 'ring', 'amulet'], m: { k: 'inc', t: 'fire' }, pct: true, fmt: '+{v}% 火焰伤害', tiers: [[10, 16, 1], [17, 24, 6], [25, 34, 11], [35, 46, 16]] },
    { id: 'inc_cold', slots: ['helm', 'ring', 'amulet'], m: { k: 'inc', t: 'cold' }, pct: true, fmt: '+{v}% 冰霜伤害', tiers: [[10, 16, 1], [17, 24, 6], [25, 34, 11], [35, 46, 16]] },
    { id: 'inc_light', slots: ['helm', 'ring', 'amulet'], m: { k: 'inc', t: 'lightning' }, pct: true, fmt: '+{v}% 闪电伤害', tiers: [[10, 16, 1], [17, 24, 6], [25, 34, 11], [35, 46, 16]] },
    { id: 'inc_phys', slots: ['helm', 'body', 'ring'], m: { k: 'inc', t: 'phys' }, pct: true, fmt: '+{v}% 物理伤害', tiers: [[10, 16, 1], [17, 24, 6], [25, 34, 11], [35, 46, 16]] },
    { id: 'inc_area', slots: ['helm', 'body'], m: { k: 'inc', t: 'area' }, pct: true, fmt: '+{v}% 范围伤害', tiers: [[8, 14, 1], [15, 21, 6], [22, 30, 11], [31, 40, 16]] },
    { id: 'inc_proj', slots: ['ring', 'amulet'], m: { k: 'inc', t: 'projectile' }, pct: true, fmt: '+{v}% 投射物伤害', tiers: [[8, 14, 1], [15, 21, 6], [22, 30, 11], [31, 40, 16]] },
    { id: 'inc_melee', slots: ['body', 'ring'], m: { k: 'inc', t: 'melee' }, pct: true, fmt: '+{v}% 近战伤害', tiers: [[8, 14, 1], [15, 21, 6], [22, 30, 11], [31, 40, 16]] },
    { id: 'crit', slots: ['ring', 'amulet'], m: { k: 'crit' }, pct: true, fmt: '+{v}% 暴击率', tiers: [[6, 10, 1], [11, 16, 6], [17, 23, 11], [24, 32, 16]] },
    { id: 'critmulti', slots: ['amulet'], m: { k: 'critMulti' }, pct: true, fmt: '+{v}% 暴击伤害', tiers: [[12, 20, 1], [21, 30, 6], [31, 44, 11], [45, 60, 16]] },
    { id: 'speed', slots: ['helm', 'ring', 'amulet'], m: { k: 'speed' }, pct: true, fmt: '+{v}% 攻击速度', tiers: [[5, 8, 1], [9, 12, 6], [13, 17, 11], [18, 23, 16]] },
    { id: 'flat_fire', slots: ['ring', 'amulet'], m: { k: 'flat', t: 'fire' }, fmt: '附加 {v} 火焰伤害', tiers: [[3, 5, 1], [6, 9, 6], [10, 14, 11], [15, 20, 16]] },
    { id: 'flat_cold', slots: ['ring', 'amulet'], m: { k: 'flat', t: 'cold' }, fmt: '附加 {v} 冰霜伤害', tiers: [[3, 5, 1], [6, 9, 6], [10, 14, 11], [15, 20, 16]] },
    { id: 'flat_light', slots: ['ring', 'amulet'], m: { k: 'flat', t: 'lightning' }, fmt: '附加 {v} 闪电伤害', tiers: [[3, 5, 1], [6, 9, 6], [10, 14, 11], [15, 20, 16]] },
    { id: 'proj', slots: ['amulet'], m: { k: 'proj', v: 1 }, fmt: '+1 投射物', tiers: [[1, 1, 8]] },
    { id: 'pierce', slots: ['ring'], m: { k: 'pierce', v: 1 }, fmt: '+1 穿透', tiers: [[1, 1, 5]] },
    { id: 'pickup', slots: ['helm', 'body', 'ring'], m: { k: 'pickup' }, pct: true, fmt: '+{v}% 拾取范围', tiers: [[10, 18, 1], [19, 28, 6], [29, 40, 11], [41, 55, 16]] },
    { id: 'move', slots: ['body'], m: { k: 'move' }, pct: true, fmt: '+{v}% 移动速度', tiers: [[4, 7, 1], [8, 11, 6], [12, 16, 11], [17, 22, 16]] },
    { id: 'cdr', slots: ['helm'], m: { k: 'cdr' }, pct: true, fmt: '+{v}% 技能冷却缩减', tiers: [[4, 6, 1], [7, 10, 6], [11, 14, 11], [15, 20, 16]] }
  ];

  const SLOTS = ['helm', 'body', 'ring', 'amulet'];
  const SLOT_CN = { helm: '头部', body: '护甲', ring: '戒指', amulet: '护符' };
  const SLOT_ICON = { helm: 'icon_helm', body: 'icon_body', ring: 'icon_ring', amulet: 'icon_amulet' };
  const RARITY_CN = ['普通', '魔法', '稀有'];
  const RARITY_COLOR = ['#9aa4b8', '#6f8cff', '#e0c060'];

  const BASE_NAMES = {
    helm: ['皮革兜帽', '铁面盔', '灰烬头冠'],
    body: ['布甲', '锁子甲', '暗纹长袍'],
    ring: ['铜环', '血玉指环', '白骨戒'],
    amulet: ['兽牙护符', '黑曜石坠', '余烬吊坠']
  };

  /* ---------------- 怪物 ---------------- */
  const ENEMIES = {
    slime: { id: 'slime', name: '腐质', sprite: 'slime', hp: 11, dmg: 3, speed: 34, r: 5, xp: 1, mass: 1 },
    bat: { id: 'bat', name: '夜蝠', sprite: 'bat', hp: 7, dmg: 3, speed: 60, r: 5, xp: 1, mass: 0.6, wobble: true },
    skel: { id: 'skel', name: '骸骨', sprite: 'skel', hp: 19, dmg: 6, speed: 42, r: 5, xp: 2, mass: 1.2 },
    wraith: { id: 'wraith', name: '幽魂', sprite: 'wraith', hp: 14, dmg: 5, speed: 54, r: 5, xp: 2, mass: 0.8 },
    brute: { id: 'brute', name: '巨兽', sprite: 'brute', hp: 58, dmg: 10, speed: 30, r: 7, xp: 6, mass: 3 },
    boss: { id: 'boss', name: '深渊之眼', sprite: 'boss', hp: 900, dmg: 16, speed: 18, r: 11, xp: 80, mass: 12, boss: true }
  };

  /* 精英词缀 */
  const ELITE_MODS = [
    { id: 'swift', name: '迅捷', spd: 1.5 },
    { id: 'tough', name: '坚韧', hp: 2.2 },
    { id: 'vicious', name: '凶暴', dmg: 1.6 },
    { id: 'giant', name: '巨大', scale: 1.45, hp: 1.6 }
  ];

  /* ---------------- 时间轴 ----------------
     每 30 秒一段，配置该段的刷新权重与总量
  */
  const WAVES = [
    { t: 0, rate: 3.4, cap: 55, pool: { slime: 10, bat: 4 } },
    { t: 30, rate: 4.2, cap: 75, pool: { slime: 8, bat: 7, skel: 4 } },
    { t: 60, rate: 5.2, cap: 100, pool: { slime: 5, bat: 7, skel: 7, wraith: 3 } },
    { t: 90, rate: 6.0, cap: 130, pool: { bat: 6, skel: 8, wraith: 6 } },
    { t: 120, rate: 6.8, cap: 160, pool: { skel: 7, wraith: 8, brute: 2 } },
    { t: 150, rate: 7.4, cap: 185, pool: { bat: 6, skel: 7, wraith: 6, brute: 3 } },
    { t: 180, rate: 8.0, cap: 210, pool: { skel: 6, wraith: 8, brute: 4 } },
    { t: 210, rate: 8.6, cap: 235, pool: { bat: 8, wraith: 8, brute: 4 } },
    { t: 240, rate: 9.2, cap: 260, pool: { skel: 6, wraith: 8, brute: 6 } },
    { t: 270, rate: 10.0, cap: 280, pool: { wraith: 8, brute: 6, skel: 4 } }
  ];

  const CONFIG = {
    runTime: 600,            // 一局 10 分钟
    bossTime: 480,           // 8 分钟出 Boss
    maxLevel: 60,
    baseHp: 120,
    hpPerLevel: 9,
    baseSpeed: 74,
    pickupRange: 26,
    invulnTime: 0.8,
    xpCurve: function (lvl) { return Math.floor(5 + lvl * 4 + Math.pow(lvl, 1.6)); },
    worldSize: 2600
  };

  root.DATA = {
    ELE, TYPE_CN, SKILLS, SKILL_IDS, MAX_SKILL_LEVEL,
    AFFIXES, SLOTS, SLOT_CN, SLOT_ICON, RARITY_CN, RARITY_COLOR, BASE_NAMES,
    ENEMIES, ELITE_MODS, WAVES, CONFIG
  };
})(window);
