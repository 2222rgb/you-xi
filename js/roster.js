/* =========================================================
   roster.js — 角色名册（多角色存档 / 切换）
   存在 localStorage：{ chars: [ ... ], activeId }
   ========================================================= */
(function (root) {
  'use strict';
  const KEY = 'ashfall.roster.v1';

  let data = { chars: [], activeId: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.chars)) data = p;
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  /** 从模拟状态里抽出一个角色的存档 */
  function snapshot(st) {
    const p = st.player;
    if (!p) return null;
    return {
      id: p.charId || ('c' + Date.now().toString(36)),
      name: p.name,
      cls: p.cls,
      level: p.level,
      xp: p.xp, xpNext: p.xpNext,
      gold: p.gold,
      potions: p.potions,
      mats: p.mats || 0,
      boxes: p.boxes || 0,
      talentPoints: p.talentPoints,
      talents: p.talents || {},
      treeSpent: p.treeSpent || {},
      skills: (p.skills || []).map(function (s) { return { id: s.id, rank: s.rank }; }),
      supports: p.supports || {},
      runeOf: p.runeOf || {},
      runeUnlocked: p.runeUnlocked || {},
      roguePicks: p.roguePicks || {},
      gear: p.gear || {},
      bag: p.bag || [],
      hp: Math.round(p.maxHp || 0),
      dps: (function () {
        let best = 0;
        for (const k in (p.skillCalc || {})) best += p.skillCalc[k].dps || 0;
        return Math.round(best);
      })(),
      gearCount: (function () { let n = 0; for (const s in (p.gear || {})) if (p.gear[s]) n++; return n; })(),
      savedAt: Date.now()
    };
  }

  /** 把存档写回角色 */
  function restore(st, rec) {
    const p = st.player;
    if (!p || !rec) return false;
    p.charId = rec.id;
    p.name = rec.name;
    if (rec.cls && root.SIM && root.SIM.setClass) {
      // 职业通过 setClass 重建技能组，再覆盖下面的字段
      const idx = root.DATA.CLASSES.findIndex(function (c) { return c.id === rec.cls; });
      if (idx >= 0) root.SIM.setClass(st, p.id, idx);
    }
    p.level = rec.level || 1;
    p.xp = rec.xp || 0;
    p.xpNext = rec.xpNext || 10;
    p.gold = rec.gold || 0;
    p.potions = rec.potions === undefined ? 2 : rec.potions;
    p.mats = rec.mats || 0;
    p.boxes = rec.boxes || 0;
    p.talentPoints = rec.talentPoints || 0;
    p.talents = rec.talents || {};
    p.treeSpent = rec.treeSpent || {};
    p.skills = (rec.skills || []).map(function (s) { return { id: s.id, rank: s.rank, cd: 0 }; });
    p.supports = rec.supports || {};
    p.runeOf = rec.runeOf || {};
    p.runeUnlocked = rec.runeUnlocked || {};
    p.roguePicks = rec.roguePicks || {};
    p.gear = Object.assign({ helm: null, body: null, ring: null, amulet: null, weapon: null, offhand: null }, rec.gear || {});
    p.bag = rec.bag || [];
    root.SIM.applyChar(st, p);
    return true;
  }

  const R = {
    list: function () { return data.chars.slice(); },
    activeId: function () { return data.activeId; },
    active: function () {
      for (let i = 0; i < data.chars.length; i++) if (data.chars[i].id === data.activeId) return data.chars[i];
      return null;
    },
    /** 保存当前角色（存在则更新，不存在则新增并设为当前） */
    saveCurrent: function (st) {
      const rec = snapshot(st);
      if (!rec) return null;
      let found = -1;
      for (let i = 0; i < data.chars.length; i++) if (data.chars[i].id === rec.id) found = i;
      if (found >= 0) data.chars[found] = rec;
      else data.chars.push(rec);
      data.activeId = rec.id;
      save();
      return rec;
    },
    /** 新建一个角色（新 id），并设为当前 */
    createNew: function (st, name) {
      const p = st.player;
      if (p) p.charId = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 100);
      const rec = snapshot(st);
      if (!rec) return null;
      if (name) rec.name = name;
      data.chars.push(rec);
      data.activeId = rec.id;
      save();
      return rec;
    },
    restore: restore,
    remove: function (id) {
      data.chars = data.chars.filter(function (c) { return c.id !== id; });
      if (data.activeId === id) data.activeId = data.chars.length ? data.chars[0].id : null;
      save();
    },
    save: save
  };

  root.ROSTER = R;
})(window);
