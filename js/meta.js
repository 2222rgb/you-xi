/* =========================================================
   meta.js — 跨局进度：深渊精华 / 祭坛 / 每日种子 / 履历
   存在 localStorage，失败时静默降级。
   ========================================================= */
(function (root) {
  'use strict';

  const KEY = 'ashfall.meta.v2';

  /* 祭坛：花精华买永久加成 */
  const ALTAR = [
    { id: 'purse', name: '启程之赐', max: 5, cost: function (l) { return 60 + l * 45; },
      desc: '初始金币 +250', bonus: { startGold: 250 } },
    { id: 'greed', name: '贪婪之血', max: 5, cost: function (l) { return 90 + l * 70; },
      desc: '金币获取 +10%', bonus: { goldMul: 0.10 } },
    { id: 'vigor', name: '强健体魄', max: 5, cost: function (l) { return 80 + l * 60; },
      desc: '初始生命 +18', bonus: { hp: 18 } },
    { id: 'insight', name: '天赋早慧', max: 3, cost: function (l) { return 150 + l * 120; },
      desc: '开局额外 1 天赋点', bonus: { talent: 1 } },
    { id: 'scavenger', name: '拾荒者', max: 5, cost: function (l) { return 100 + l * 80; },
      desc: '装备掉落 +8%', bonus: { drop: 0.08 } },
    { id: 'foresight', name: '先见', max: 2, cost: function (l) { return 220 + l * 180; },
      desc: '裂隙多一个选项', bonus: { riftChoice: 1 } },
    { id: 'heirloom', name: '传承', max: 1, cost: function () { return 400; },
      desc: '开局获得一件随机稀有装备', bonus: { heirloom: 1 } },
    { id: 'echo', name: '回响', max: 3, cost: function (l) { return 300 + l * 260; },
      desc: '狂潮持续 +2 秒', bonus: { frenzy: 2 } }
  ];

  function defaults() {
    return { essence: 0, unlocks: {}, best: { depth: 0, kills: 0, level: 0 }, runs: 0, daily: {} };
  }

  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') data = Object.assign(defaults(), parsed);
    }
  } catch (e) {}

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  const M = {
    ALTAR: ALTAR,
    get essence() { return data.essence; },
    get best() { return data.best; },
    get runs() { return data.runs; },
    get unlocks() { return data.unlocks; }
  };

  M.level = function (id) { return data.unlocks[id] || 0; };

  M.costOf = function (id) {
    const def = ALTAR.find(function (a) { return a.id === id; });
    if (!def) return 0;
    const lv = M.level(id);
    if (lv >= def.max) return null;
    return def.cost(lv);
  };

  M.buy = function (id) {
    const def = ALTAR.find(function (a) { return a.id === id; });
    if (!def) return false;
    const lv = M.level(id);
    if (lv >= def.max) return false;
    const cost = def.cost(lv);
    if (data.essence < cost) return false;
    data.essence -= cost;
    data.unlocks[id] = lv + 1;
    save();
    return true;
  };

  /** 汇总所有永久加成 */
  M.bonus = function () {
    const out = { startGold: 0, goldMul: 0, hp: 0, talent: 0, drop: 0, riftChoice: 0, heirloom: 0, frenzy: 0 };
    ALTAR.forEach(function (def) {
      const lv = M.level(def.id);
      if (!lv) return;
      for (const k in def.bonus) out[k] += def.bonus[k] * lv;
    });
    return out;
  };

  /** 结算：返回本次获得的精华 */
  M.record = function (st) {
    const depth = st.cycle;
    const kills = st.kills;
    const level = st.player ? st.player.level : 1;
    const bosses = st.bossKills || 0;
    const gain = Math.round(depth * 12 + kills / 80 + bosses * 25);
    data.essence += gain;
    data.runs++;
    if (depth > data.best.depth) { data.best.depth = depth; data.best.kills = kills; data.best.level = level; }
    else if (depth === data.best.depth && kills > data.best.kills) { data.best.kills = kills; data.best.level = level; }
    if (st.dailyKey) {
      const d = data.daily[st.dailyKey] || { depth: 0, kills: 0 };
      if (depth > d.depth || (depth === d.depth && kills > d.kills)) {
        data.daily[st.dailyKey] = { depth: depth, kills: kills };
      }
    }
    save();
    return { gain: gain, depth: depth };
  };

  M.reset = function () { data = defaults(); save(); };

  /* 每日种子：同一天所有人同一个种子 */
  M.dailyKey = function (d) {
    d = d || new Date();
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  };

  M.seedFor = function (key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) % 100000000;
  };

  M.dailyRecord = function () {
    const k = M.dailyKey();
    return data.daily[k] || null;
  };

  root.META = M;
})(window);
