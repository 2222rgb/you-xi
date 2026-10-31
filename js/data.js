/* =========================================================
   data.js — 内容数据：技能 / 词缀 / 传奇 / 天赋树 / 怪物 / 主城 / 经济
   ========================================================= */
(function (root) {
  'use strict';

  const TYPE_CN = { phys: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌', all: '全部', elemental: '元素' };
  const ELE = ['fire', 'cold', 'lightning'];

  /* ---------------- 技能 ---------------- */
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
     数值成长比之前更激进（用户要求「加强构筑成长」）
  */
  const AFFIXES = [
    { id: 'life', slots: ['helm', 'body', 'ring', 'amulet'], m: { k: 'life' }, fmt: '+{v} 生命', tiers: [[16, 24, 1], [26, 38, 5], [40, 56, 9], [58, 80, 13], [82, 110, 17]] },
    { id: 'inc_all', slots: ['ring', 'amulet'], m: { k: 'inc', t: 'all' }, pct: true, fmt: '+{v}% 全部伤害', tiers: [[7, 10, 1], [11, 16, 5], [17, 24, 9], [25, 34, 13], [35, 48, 17]] },
    { id: 'inc_fire', slots: ['helm', 'ring', 'amulet'], m: { k: 'inc', t: 'fire' }, pct: true, fmt: '+{v}% 火焰伤害', tiers: [[12, 18, 1], [19, 28, 5], [29, 42, 9], [43, 58, 13], [59, 80, 17]] },
    { id: 'inc_cold', slots: ['helm', 'ring', 'amulet'], m: { k: 'inc', t: 'cold' }, pct: true, fmt: '+{v}% 冰霜伤害', tiers: [[12, 18, 1], [19, 28, 5], [29, 42, 9], [43, 58, 13], [59, 80, 17]] },
    { id: 'inc_light', slots: ['helm', 'ring', 'amulet'], m: { k: 'inc', t: 'lightning' }, pct: true, fmt: '+{v}% 闪电伤害', tiers: [[12, 18, 1], [19, 28, 5], [29, 42, 9], [43, 58, 13], [59, 80, 17]] },
    { id: 'inc_phys', slots: ['helm', 'body', 'ring'], m: { k: 'inc', t: 'phys' }, pct: true, fmt: '+{v}% 物理伤害', tiers: [[12, 18, 1], [19, 28, 5], [29, 42, 9], [43, 58, 13], [59, 80, 17]] },
    { id: 'inc_area', slots: ['helm', 'body'], m: { k: 'inc', t: 'area' }, pct: true, fmt: '+{v}% 范围伤害', tiers: [[10, 16, 1], [17, 25, 5], [26, 38, 9], [39, 54, 13], [55, 72, 17]] },
    { id: 'inc_proj', slots: ['ring', 'amulet'], m: { k: 'inc', t: 'projectile' }, pct: true, fmt: '+{v}% 投射物伤害', tiers: [[10, 16, 1], [17, 25, 5], [26, 38, 9], [39, 54, 13], [55, 72, 17]] },
    { id: 'inc_melee', slots: ['body', 'ring'], m: { k: 'inc', t: 'melee' }, pct: true, fmt: '+{v}% 近战伤害', tiers: [[10, 16, 1], [17, 25, 5], [26, 38, 9], [39, 54, 13], [55, 72, 17]] },
    { id: 'crit', slots: ['ring', 'amulet'], m: { k: 'crit' }, pct: true, fmt: '+{v}% 暴击率', tiers: [[7, 11, 1], [12, 18, 5], [19, 27, 9], [28, 38, 13], [39, 52, 17]] },
    { id: 'critmulti', slots: ['amulet'], m: { k: 'critMulti' }, pct: true, fmt: '+{v}% 暴击伤害', tiers: [[14, 22, 1], [23, 34, 5], [35, 50, 9], [51, 70, 13], [71, 95, 17]] },
    { id: 'speed', slots: ['helm', 'ring', 'amulet'], m: { k: 'speed' }, pct: true, fmt: '+{v}% 攻击速度', tiers: [[6, 9, 1], [10, 14, 5], [15, 20, 9], [21, 28, 13], [29, 38, 17]] },
    { id: 'flat_fire', slots: ['ring', 'amulet'], m: { k: 'flat', t: 'fire' }, fmt: '附加 {v} 火焰伤害', tiers: [[3, 6, 1], [7, 11, 5], [12, 17, 9], [18, 25, 13], [26, 36, 17]] },
    { id: 'flat_cold', slots: ['ring', 'amulet'], m: { k: 'flat', t: 'cold' }, fmt: '附加 {v} 冰霜伤害', tiers: [[3, 6, 1], [7, 11, 5], [12, 17, 9], [18, 25, 13], [26, 36, 17]] },
    { id: 'flat_light', slots: ['ring', 'amulet'], m: { k: 'flat', t: 'lightning' }, fmt: '附加 {v} 闪电伤害', tiers: [[3, 6, 1], [7, 11, 5], [12, 17, 9], [18, 25, 13], [26, 36, 17]] },
    { id: 'proj', slots: ['amulet'], m: { k: 'proj', v: 1 }, fmt: '+1 投射物', tiers: [[1, 1, 7]] },
    { id: 'pierce', slots: ['ring'], m: { k: 'pierce', v: 1 }, fmt: '+1 穿透', tiers: [[1, 1, 4]] },
    { id: 'pickup', slots: ['helm', 'body', 'ring'], m: { k: 'pickup' }, pct: true, fmt: '+{v}% 拾取范围', tiers: [[12, 20, 1], [21, 32, 5], [33, 46, 9], [47, 64, 13], [65, 85, 17]] },
    { id: 'move', slots: ['body'], m: { k: 'move' }, pct: true, fmt: '+{v}% 移动速度', tiers: [[4, 7, 1], [8, 12, 5], [13, 18, 9], [19, 25, 13], [26, 34, 17]] },
    { id: 'cdr', slots: ['helm'], m: { k: 'cdr' }, pct: true, fmt: '+{v}% 技能冷却缩减', tiers: [[4, 7, 1], [8, 11, 5], [12, 16, 9], [17, 22, 13], [23, 30, 17]] },
    { id: 'more_phys', slots: ['ring'], m: { k: 'more', t: 'phys' }, pct: true, fmt: '{v}% 更多物理伤害', tiers: [[4, 6, 9], [7, 10, 15]] },
    { id: 'more_fire', slots: ['amulet'], m: { k: 'more', t: 'fire' }, pct: true, fmt: '{v}% 更多火焰伤害', tiers: [[4, 6, 9], [7, 10, 15]] },
    { id: 'more_cold', slots: ['helm'], m: { k: 'more', t: 'cold' }, pct: true, fmt: '{v}% 更多冰霜伤害', tiers: [[4, 6, 9], [7, 10, 15]] },
    { id: 'more_light', slots: ['ring'], m: { k: 'more', t: 'lightning' }, pct: true, fmt: '{v}% 更多闪电伤害', tiers: [[4, 6, 9], [7, 10, 15]] },
    { id: 'gold', slots: ['ring', 'amulet', 'helm'], m: { k: 'gold' }, pct: true, fmt: '+{v}% 金币获取', tiers: [[8, 14, 1], [15, 24, 5], [25, 36, 9], [37, 52, 13], [53, 70, 17]] }
  ];

  const SLOTS = ['helm', 'body', 'ring', 'amulet'];
  const SLOT_CN = { helm: '头部', body: '护甲', ring: '戒指', amulet: '护符' };
  const SLOT_ICON = { helm: 'icon_helm', body: 'icon_body', ring: 'icon_ring', amulet: 'icon_amulet' };
  const RARITY_CN = ['普通', '魔法', '稀有', '传奇'];
  const RARITY_COLOR = ['#9aa4b8', '#6f8cff', '#e0c060', '#e08a3c'];

  const BASE_NAMES = {
    helm: ['皮革兜帽', '铁面盔', '灰烬头冠', '苦修者面纱'],
    body: ['布甲', '锁子甲', '暗纹长袍', '殉道者胸甲'],
    ring: ['铜环', '血玉指环', '白骨戒', '裂纹指环'],
    amulet: ['兽牙护符', '黑曜石坠', '余烬吊坠', '沉默之链']
  };

  /* ---------------- 传奇 ---------------- */
  const LEGENDARIES = [
    {
      id: 'slayer', slot: 'ring', name: '屠戮者', base: '裂纹指环',
      mods: [
        { k: 'more', t: 'phys', v: 0.55, label: '55% 更多物理伤害' },
        { k: 'speed', v: -0.25, label: '-25% 攻击速度' }
      ],
      flavor: '它只记得砍下去的那一下。'
    },
    {
      id: 'emberheart', slot: 'amulet', name: '焚心', base: '余烬吊坠',
      mods: [
        { k: 'more', t: 'fire', v: 0.65, label: '65% 更多火焰伤害' },
        { k: 'life', v: -35, label: '-35 生命' }
      ],
      flavor: '胸口那点热度，是它唯一还活着的地方。'
    },
    {
      id: 'thunderfall', slot: 'helm', name: '雷罚', base: '灰烬头冠',
      mods: [
        { k: 'chain', v: 1, label: '+1 连锁' },
        { k: 'inc', t: 'lightning', v: 0.5, label: '+50% 闪电伤害' }
      ],
      flavor: '抬头的人，都挨过它。'
    },
    {
      id: 'undying', slot: 'body', name: '不朽', base: '殉道者胸甲',
      mods: [
        { k: 'life', v: 160, label: '+160 生命' },
        { k: 'move', v: 0.18, label: '+18% 移动速度' }
      ],
      flavor: '死过七次，一次也没成。'
    }
  ];

  /* ---------------- 天赋树（火炬之光式） ----------------
     三棵树，每棵 5 层。每层需要在该树投入 N 点才解锁。
     节点可以升多级；主动技能节点升到 1 级即解锁该技能。
  */
  const TIER_GATE = { 1: 0, 2: 4, 3: 8, 4: 12, 5: 16 };

  const TREES = [
    {
      id: 'blade', name: '刃', color: '#cfd8e8',
      nodes: [
        { id: 'b1', tier: 1, name: '影刃', kind: 'active', skill: 'dagger', max: 5, icon: 'icon_dagger', desc: '解锁影刃，每级提升技能等级。' },
        { id: 'b2', tier: 1, name: '锋芒', kind: 'passive', max: 5, icon: 'icon_axe', mods: [{ k: 'inc', t: 'phys', v: 0.10 }], desc: '每级 +10% 物理伤害。' },
        { id: 'b3', tier: 2, name: '重击', kind: 'passive', max: 5, icon: 'icon_axe', mods: [{ k: 'inc', t: 'melee', v: 0.12 }], desc: '每级 +12% 近战伤害。' },
        { id: 'b4', tier: 2, name: '嗜血', kind: 'passive', max: 3, icon: 'icon_ring', mods: [{ k: 'crit', v: 0.08 }], desc: '每级 +8% 暴击率。' },
        { id: 'b5', tier: 3, name: '回旋斧', kind: 'active', skill: 'axe', max: 5, icon: 'icon_axe', desc: '解锁回旋斧，每级提升技能等级。' },
        { id: 'b6', tier: 3, name: '裂甲', kind: 'passive', max: 5, icon: 'icon_dagger', mods: [{ k: 'inc', t: 'phys', v: 0.15 }], desc: '每级 +15% 物理伤害。' },
        { id: 'b7', tier: 4, name: '屠戮', kind: 'passive', max: 3, icon: 'icon_ring', mods: [{ k: 'critMulti', v: 0.12 }], desc: '每级 +12% 暴击伤害。' },
        { id: 'b8', tier: 4, name: '狂怒', kind: 'passive', max: 5, icon: 'icon_bolt', mods: [{ k: 'speed', v: 0.06 }], desc: '每级 +6% 攻击速度。' },
        { id: 'b9', tier: 5, name: '血怒', kind: 'keystone', max: 1, icon: 'icon_fire', mods: [{ k: 'more', t: 'all', v: 0.5 }, { k: 'lifePct', v: -0.3 }], desc: '50% 更多全部伤害，但最大生命 -30%。' },
        { id: 'b10', tier: 5, name: '断骨', kind: 'passive', max: 5, icon: 'icon_axe', mods: [{ k: 'inc', t: 'all', v: 0.08 }], desc: '每级 +8% 全部伤害。' }
      ]
    },
    {
      id: 'ember', name: '焰', color: '#ff8a3d',
      nodes: [
        { id: 'e1', tier: 1, name: '炎爆', kind: 'active', skill: 'fireball', max: 5, icon: 'icon_fire', desc: '解锁炎爆，每级提升技能等级。' },
        { id: 'e2', tier: 1, name: '炽心', kind: 'passive', max: 5, icon: 'icon_fire', mods: [{ k: 'inc', t: 'fire', v: 0.10 }], desc: '每级 +10% 火焰伤害。' },
        { id: 'e3', tier: 2, name: '扩散', kind: 'passive', max: 5, icon: 'icon_meteor', mods: [{ k: 'inc', t: 'area', v: 0.10 }], desc: '每级 +10% 范围伤害。' },
        { id: 'e4', tier: 2, name: '余烬', kind: 'passive', max: 3, icon: 'icon_fire', mods: [{ k: 'inc', t: 'projectile', v: 0.12 }], desc: '每级 +12% 投射物伤害。' },
        { id: 'e5', tier: 3, name: '陨星', kind: 'active', skill: 'meteor', max: 5, icon: 'icon_meteor', desc: '解锁陨星，每级提升技能等级。' },
        { id: 'e6', tier: 3, name: '薪柴', kind: 'passive', max: 5, icon: 'icon_amulet', mods: [{ k: 'life', v: 40 }], desc: '每级 +40 最大生命。' },
        { id: 'e7', tier: 4, name: '焚尽', kind: 'passive', max: 3, icon: 'icon_fire', mods: [{ k: 'more', t: 'fire', v: 0.08 }], desc: '每级 8% 更多火焰伤害。' },
        { id: 'e8', tier: 4, name: '火种', kind: 'passive', max: 5, icon: 'icon_meteor', mods: [{ k: 'flat', t: 'fire', v: 6 }], desc: '每级附加 6 点火焰伤害。' },
        { id: 'e9', tier: 5, name: '不灭之焰', kind: 'keystone', max: 1, icon: 'icon_fire', mods: [{ k: 'more', t: 'fire', v: 0.7 }, { k: 'lifePct', v: -0.2 }], desc: '70% 更多火焰伤害，但最大生命 -20%。' },
        { id: 'e10', tier: 5, name: '燎原', kind: 'passive', max: 5, icon: 'icon_bolt', mods: [{ k: 'speed', v: 0.05 }], desc: '每级 +5% 攻击速度。' }
      ]
    },
    {
      id: 'storm', name: '雷', color: '#ffe066',
      nodes: [
        { id: 's1', tier: 1, name: '链雷', kind: 'active', skill: 'bolt', max: 5, icon: 'icon_bolt', desc: '解锁链雷，每级提升技能等级。' },
        { id: 's2', tier: 1, name: '雷引', kind: 'passive', max: 5, icon: 'icon_bolt', mods: [{ k: 'inc', t: 'lightning', v: 0.10 }], desc: '每级 +10% 闪电伤害。' },
        { id: 's3', tier: 2, name: '寒触', kind: 'passive', max: 5, icon: 'icon_frost', mods: [{ k: 'inc', t: 'cold', v: 0.10 }], desc: '每级 +10% 冰霜伤害。' },
        { id: 's4', tier: 2, name: '锐目', kind: 'passive', max: 5, icon: 'icon_ring', mods: [{ k: 'crit', v: 0.05 }], desc: '每级 +5% 暴击率。' },
        { id: 's5', tier: 3, name: '霜环', kind: 'active', skill: 'frostnova', max: 5, icon: 'icon_frost', desc: '解锁霜环，每级提升技能等级。' },
        { id: 's6', tier: 3, name: '风步', kind: 'passive', max: 5, icon: 'icon_boot', mods: [{ k: 'move', v: 0.04 }], desc: '每级 +4% 移动速度。' },
        { id: 's7', tier: 4, name: '雷暴', kind: 'passive', max: 3, icon: 'icon_bolt', mods: [{ k: 'inc', t: 'lightning', v: 0.10 }, { k: 'critMulti', v: 0.10 }], desc: '每级 +10% 闪电伤害，+10% 暴击伤害。' },
        { id: 's8', tier: 4, name: '迅捷', kind: 'passive', max: 5, icon: 'icon_boot', mods: [{ k: 'speed', v: 0.05 }], desc: '每级 +5% 攻击速度。' },
        { id: 's9', tier: 5, name: '疾影', kind: 'keystone', max: 1, icon: 'icon_frost', mods: [{ k: 'moreSpeed', v: 0.35 }, { k: 'more', t: 'all', v: -0.15 }], desc: '35% 更多攻速，但伤害 -15%。' },
        { id: 's10', tier: 5, name: '静电', kind: 'passive', max: 5, icon: 'icon_bolt', mods: [{ k: 'inc', t: 'lightning', v: 0.15 }], desc: '每级 +15% 闪电伤害。' }
      ]
    }
  ];

  const TALENT_INDEX = {};
  TREES.forEach(function (t) {
    t.nodes.forEach(function (n) { TALENT_INDEX[n.id] = { tree: t.id, node: n }; });
  });

  /* ---------------- 怪物 ---------------- */
  const ENEMIES = {
    slime: { id: 'slime', name: '腐质', sprite: 'slime', hp: 11, dmg: 3, speed: 34, r: 5, xp: 1, gold: 2, mass: 1 },
    bat: { id: 'bat', name: '夜蝠', sprite: 'bat', hp: 7, dmg: 3, speed: 60, r: 5, xp: 1, gold: 2, mass: 0.6, wobble: true },
    skel: { id: 'skel', name: '骸骨', sprite: 'skel', hp: 19, dmg: 6, speed: 42, r: 5, xp: 2, gold: 4, mass: 1.2 },
    wraith: { id: 'wraith', name: '幽魂', sprite: 'wraith', hp: 14, dmg: 5, speed: 54, r: 5, xp: 2, gold: 4, mass: 0.8 },
    brute: { id: 'brute', name: '巨兽', sprite: 'brute', hp: 58, dmg: 10, speed: 30, r: 7, xp: 6, gold: 14, mass: 3 },
    boss: { id: 'boss', name: '深渊之眼', sprite: 'boss', hp: 700, dmg: 16, speed: 18, r: 11, xp: 80, gold: 200, mass: 12, boss: true },
    boss3: { id: 'boss3', name: '虚空之心', sprite: 'boss', hp: 760, dmg: 13, speed: 15, r: 12, xp: 95, gold: 260, mass: 15, boss: true, caster: true },
    boss2: { id: 'boss2', name: '骸骨之王', sprite: 'boss2', hp: 820, dmg: 19, speed: 22, r: 11, xp: 90, gold: 240, mass: 14, boss: true },
    charger: { id: 'charger', name: '冲锋者', sprite: 'wraith', hp: 30, dmg: 6.5, speed: 30, r: 6, xp: 4, gold: 9, mass: 3, charger: true },
    goblin: { id: 'goblin', name: '宝藏地精', sprite: 'slime', hp: 55, dmg: 4, speed: 62, r: 6, xp: 30, gold: 140, mass: 2, flee: true },
    spitter: { id: 'spitter', name: '腐化喷吐者', sprite: 'spitter', hp: 14, dmg: 2.6, speed: 28, r: 5, xp: 2, gold: 5, mass: 1, ranged: true, shotSpeed: 118, shotCd: 3.2, range: 165 }
  };

  const ELITE_MODS = [
    { id: 'swift', name: '迅捷', spd: 1.5 },
    { id: 'tough', name: '坚韧', hp: 2.2 },
    { id: 'vicious', name: '凶暴', dmg: 1.6 },
    { id: 'giant', name: '巨大', scale: 1.45, hp: 1.6 },
    { id: 'ancient', name: '远古', hp: 3.5, dmg: 1.3, spd: 0.92 },
    { id: 'berserk', name: '狂暴', dmg: 2.0, spd: 1.25, hp: 0.85 },
    { id: 'colossal', name: '庞然', scale: 1.8, hp: 2.5, spd: 0.82 }
  ];

  /* 战斗段内的刷怪曲线（相对 180 秒） */
  const WAVES = [
    { t: 0, rate: 3.4, cap: 55, pool: { slime: 10, bat: 4 } },
    { t: 25, rate: 4.2, cap: 75, pool: { slime: 8, bat: 7, skel: 4 } },
    { t: 50, rate: 5.2, cap: 100, pool: { slime: 5, bat: 7, skel: 7, wraith: 3, spitter: 2, charger: 3 } },
    { t: 75, rate: 6.0, cap: 130, pool: { bat: 6, skel: 8, wraith: 6, spitter: 2, charger: 4 } },
    { t: 100, rate: 6.8, cap: 160, pool: { skel: 7, wraith: 8, brute: 2 } },
    { t: 125, rate: 7.6, cap: 190, pool: { bat: 6, skel: 7, wraith: 6, brute: 3 } },
    { t: 150, rate: 8.4, cap: 220, pool: { skel: 6, wraith: 8, brute: 4 } }
  ];

  /* ---------------- 主城 ---------------- */
  const TOWN = {
    w: 560, h: 360,
    spawn: { x: 280, y: 200 },
    npcs: [
      { id: 'smith', name: '铁匠 格罗姆', sprite: 'npc_smith', x: 150, y: 140, desc: '重铸 / 附魔 / 升阶' },
      { id: 'stash', name: '仓库', sprite: 'chest', x: 280, y: 118, desc: '存放装备' },
      { id: 'merchant', name: '商人 卡兰', sprite: 'npc_merchant', x: 410, y: 140, desc: '买卖装备与药水' },
      { id: 'market', name: '交易行', sprite: 'npc_market', x: 150, y: 268, desc: '出售与竞拍' },
      { id: 'gambler', name: '赌徒 维奇', sprite: 'npc_market', x: 280, y: 268, desc: '花钱买一件指定部位的稀有装备' },
      { id: 'portal', name: '裂隙之门', sprite: 'portal', x: 410, y: 268, desc: '提前返回战场' }
    ]
  };

  /* ---------------- 经济 ---------------- */
  const PRICES = {
    sell: function (item) { return Math.round((2 + item.ilvl * 1.5) * [1, 2.4, 6, 18][item.rarity]); },
    buyMul: 3.2,
    craft: {
      reroll: function (ilvl) { return Math.round(80 + ilvl * 28); },
      addAffix: function (ilvl) { return Math.round(220 + ilvl * 52); },
      upgrade: function (ilvl) { return Math.round(420 + ilvl * 90); }
    },
    potion: 25,
    gamble: function (ilvl) { return Math.round(400 + ilvl * 180); }
  };

  /* ---------------- 深渊裂隙：每一层开始前从三选一 ----------------
     effect 字段：
       enemy {hp,dmg,speed}   spawn {rate,cap}   loot 品质加成
       gold/xp/drop 倍率       time 覆盖战斗时长   elite 精英率倍率
  */
  const RIFTS = [
    { id: 'swift', name: '疾行', mild: true, color: '#7fdcff', desc: '敌人移速 +35%，掉落品质 +1',
      enemy: { speed: 1.35 }, loot: 1 },
    { id: 'bloodmoon', name: '血月', color: '#c0392b', desc: '敌人伤害 +45%，金币 +90%',
      enemy: { dmg: 1.45 }, gold: 1.9 },
    { id: 'barren', name: '贫瘠', mild: true, color: '#8a8a7a', desc: '不再掉落金币，装备掉落 +160%',
      gold: 0, drop: 2.6 },
    { id: 'swarm', name: '狂潮', color: '#e0c060', desc: '敌人数量 +50%，经验 +50%',
      spawn: { rate: 1.5, cap: 1.4 }, xp: 1.5 },
    { id: 'hunt', name: '精英狩猎', color: '#b07cff', desc: '精英出现率 ×3，精英必掉装备',
      elite: 3, drop: 1.5 },
    { id: 'haste', name: '时限', mild: true, color: '#6fdc8f', desc: '战斗缩短到 120 秒，掉落品质 +2',
      time: 120, loot: 2, gold: 1.4 },
    { id: 'gaze', name: '深渊凝视', color: '#ff6b2b', desc: '首领提前 60 秒出现，生命 -25%',
      bossEarly: 60, enemy: { hp: 0.75 }, loot: 2 },
    { id: 'greed', name: '贪婪', color: '#ffd54f', desc: '治疗效果 -50%，金币 +150%',
      heal: 0.5, gold: 2.5 },
    { id: 'frenzy', name: '躁动', color: '#ff8a3d', desc: '敌人攻速更快但血量 -20%，掉落品质 +1',
      enemy: { dmg: 1.25, hp: 0.8, speed: 1.15 }, loot: 1 },
    { id: 'calm', name: '静水', mild: true, color: '#9fd7ff', desc: '敌人变慢，但金币减半',
      enemy: { speed: 0.7, dmg: 0.85 }, gold: 0.5, loot: 1 }
  ];

  /* ---------------- 词缀共鸣：同一标签堆到阈值就解锁效果 ---------------- */
  const RESONANCE = {
    fire: { name: '火焰', color: '#ff8a3d', tiers: [
      { n: 3, label: '点燃伤害 +60%', mods: [{ k: 'inc', t: 'dot', v: 0.6 }] },
      { n: 5, label: '12% 更多火焰伤害', mods: [{ k: 'more', t: 'fire', v: 0.12 }] },
      { n: 8, label: '再 25% 更多火焰伤害', mods: [{ k: 'more', t: 'fire', v: 0.25 }] }
    ] },
    cold: { name: '冰霜', color: '#7fdcff', tiers: [
      { n: 3, label: '冰缓更强', mods: [{ k: 'inc', t: 'cold', v: 0.3 }] },
      { n: 5, label: '12% 更多冰霜伤害', mods: [{ k: 'more', t: 'cold', v: 0.12 }] },
      { n: 8, label: '再 25% 更多冰霜伤害', mods: [{ k: 'more', t: 'cold', v: 0.25 }] }
    ] },
    lightning: { name: '闪电', color: '#ffe066', tiers: [
      { n: 3, label: '连锁 +1', mods: [{ k: 'chain', v: 1 }] },
      { n: 5, label: '12% 更多闪电伤害', mods: [{ k: 'more', t: 'lightning', v: 0.12 }] },
      { n: 8, label: '再 25% 更多闪电伤害', mods: [{ k: 'more', t: 'lightning', v: 0.25 }] }
    ] },
    phys: { name: '物理', color: '#cfc6b4', tiers: [
      { n: 3, label: '15% 更多物理伤害', mods: [{ k: 'more', t: 'phys', v: 0.15 }] },
      { n: 5, label: '再 15% 更多物理伤害', mods: [{ k: 'more', t: 'phys', v: 0.15 }] },
      { n: 8, label: '再 30% 更多物理伤害', mods: [{ k: 'more', t: 'phys', v: 0.3 }] }
    ] },
    projectile: { name: '投射物', color: '#b39ddb', tiers: [
      { n: 3, label: '+1 投射物', mods: [{ k: 'proj', v: 1 }] },
      { n: 5, label: '20% 更多投射物伤害', mods: [{ k: 'more', t: 'projectile', v: 0.2 }] },
      { n: 8, label: '+2 穿透', mods: [{ k: 'pierce', v: 2 }] }
    ] },
    area: { name: '范围', color: '#ffab40', tiers: [
      { n: 3, label: '25% 更多范围伤害', mods: [{ k: 'more', t: 'area', v: 0.25 }] },
      { n: 5, label: '再 20% 更多范围伤害', mods: [{ k: 'more', t: 'area', v: 0.2 }] },
      { n: 8, label: '再 30% 更多范围伤害', mods: [{ k: 'more', t: 'area', v: 0.3 }] }
    ] }
  };

  /* ---------------- 可选职业 ---------------- */
  const CLASSES = [
    { id: 'blade', name: '刃行者', color: '#e05c4a', skill: 'dagger', talent: 'b1',
      desc: '近战物理，暴击高，血厚一点',
      hp: 1.12, speed: 1.0, mods: [{ k: 'inc', t: 'phys', v: 0.18 }, { k: 'crit', v: 0.06 }] },
    { id: 'ember', name: '焚术士', color: '#ff8a3d', skill: 'fireball', talent: 'e1',
      desc: '火焰爆发，清怪快，但很脆',
      hp: 0.84, speed: 1.02, mods: [{ k: 'inc', t: 'fire', v: 0.28 }, { k: 'more', t: 'fire', v: 0.08 }] },
    { id: 'frost', name: '霜卫', color: '#7fdcff', skill: 'frostnova', talent: 's1',
      desc: '冰霜控场，最肉，移速略慢',
      hp: 1.28, speed: 0.93, mods: [{ k: 'inc', t: 'cold', v: 0.22 }, { k: 'life', v: 40 }] },
    { id: 'storm', name: '雷游侠', color: '#ffe066', skill: 'bolt', talent: 's2',
      desc: '闪电连锁，跑得最快',
      hp: 0.94, speed: 1.14, mods: [{ k: 'inc', t: 'lightning', v: 0.22 }, { k: 'rate', v: 0.08 }] }
  ];

  const CONFIG = {
    combatTime: 180,
    townTime: 60,
    bossAt: 150,
    maxLevel: 99,
    baseHp: 120,
    hpPerLevel: 16,
    baseSpeed: 74,
    pickupRange: 26,
    invulnTime: 0.8,
    lootLife: 60,
    xpShareRadius: 320,
    worldSize: 2200,
    enemyScalePerCycle: 1.45
  };

  root.DATA = {
    ELE, TYPE_CN, SKILLS, SKILL_IDS, MAX_SKILL_LEVEL,
    AFFIXES, SLOTS, SLOT_CN, SLOT_ICON, RARITY_CN, RARITY_COLOR, BASE_NAMES, LEGENDARIES,
    TREES: TREES, TALENT_INDEX: TALENT_INDEX, TIER_GATE: TIER_GATE,
    RIFTS: RIFTS, RESONANCE: RESONANCE, CLASSES: CLASSES,
    ENEMIES, ELITE_MODS, WAVES, TOWN, PRICES, CONFIG
  };
})(window);
