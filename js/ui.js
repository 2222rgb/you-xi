/* =========================================================
   ui.js — DOM 界面：HUD / 升级卡 / 背包 / 结算
   ========================================================= */
(function (root) {
  'use strict';

  const D = root.DATA;
  const $ = function (id) { return document.getElementById(id); };

  const UI = {
    mode: 'none',
    st: null,
    cb: {},
    skillEls: [],
    gearEls: [],
    lastHp: -1, lastXp: -1, lastLv: -1, lastKills: -1, lastDps: -1, lastT: -1,
    selItem: null
  };
  root.UI = UI;

  /* ---------------- 图标 ---------------- */
  function makeIcon(name, px) {
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const spr = root.SPRITES[name];
    if (!spr) return c;
    const s = px / Math.max(spr.w, spr.h);
    for (let y = 0; y < spr.h; y++) {
      for (let x = 0; x < spr.w; x++) {
        const ch = spr.rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        const col = spr.pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(s), Math.ceil(s));
      }
    }
    return c;
  }
  UI.makeIcon = makeIcon;

  /* ---------------- 初始化 ---------------- */
  UI.init = function (st, cbs) {
    UI.st = st;
    UI.cb = cbs || {};
    buildSkills(st);
    buildGear(st);
    bindKeys();
    UI.tick(st, true);
  };

  function buildSkills(st) {
    const wrap = $('skills');
    wrap.innerHTML = '';
    UI.skillEls = [];
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot empty';
      const cd = document.createElement('div');
      cd.className = 'cd';
      const iconWrap = document.createElement('div');
      const lv = document.createElement('div');
      lv.className = 'lv';
      const hint = document.createElement('div');
      hint.className = 'keyhint';
      hint.textContent = (i + 1);
      slot.appendChild(iconWrap);
      slot.appendChild(cd);
      slot.appendChild(lv);
      slot.appendChild(hint);
      wrap.appendChild(slot);
      UI.skillEls.push({ slot: slot, iconWrap: iconWrap, cd: cd, lv: lv, sig: '' });
    }
  }

  function buildGear(st) {
    const wrap = $('gear');
    wrap.innerHTML = '';
    UI.gearEls = [];
    for (let i = 0; i < D.SLOTS.length; i++) {
      const slotName = D.SLOTS[i];
      const row = document.createElement('div');
      row.className = 'gslot';
      const label = document.createElement('span');
      label.textContent = D.SLOT_CN[slotName];
      const icon = document.createElement('div');
      icon.className = 'icon';
      row.appendChild(label);
      row.appendChild(icon);
      wrap.appendChild(row);
      UI.gearEls.push({ slot: slotName, row: row, icon: icon, sig: '' });
    }
  }

  /* ---------------- 每帧 ---------------- */
  UI.tick = function (st, force) {
    const p = st.player;

    // 血
    const hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp));
    if (force || Math.abs(hpPct - UI.lastHp) > 0.002) {
      $('hpfill').style.width = (hpPct * 100).toFixed(1) + '%';
      $('hptext').textContent = Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp);
      UI.lastHp = hpPct;
    }
    // 经验
    const xpPct = Math.min(1, p.xp / p.xpNext);
    if (force || Math.abs(xpPct - UI.lastXp) > 0.002) {
      $('xpfill').style.width = (xpPct * 100).toFixed(1) + '%';
      UI.lastXp = xpPct;
    }
    // 时间
    const tsec = Math.floor(st.t);
    if (force || tsec !== UI.lastT) {
      const m = Math.floor(tsec / 60), s = tsec % 60;
      $('timer').textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      UI.lastT = tsec;
    }
    // 击杀
    if (force || st.kills !== UI.lastKills) {
      $('killnum').textContent = st.kills;
      UI.lastKills = st.kills;
    }
    // DPS
    let dps = 0;
    for (let i = 0; i < p.skills.length; i++) {
      const c = st.skills[p.skills[i].id];
      if (c) dps += c.dps;
    }
    const dpsInt = Math.round(dps);
    if (force || dpsInt !== UI.lastDps) {
      $('dpsnum').textContent = dpsInt;
      UI.lastDps = dpsInt;
    }
    // 背包
    $('bagcount').textContent = st.bag.length;

    // 技能槽
    for (let i = 0; i < UI.skillEls.length; i++) {
      const el = UI.skillEls[i];
      const s = p.skills[i];
      if (!s) {
        if (el.sig !== 'empty') {
          el.slot.className = 'slot empty';
          el.iconWrap.innerHTML = '';
          el.lv.textContent = '';
          el.cd.style.height = '0%';
          el.sig = 'empty';
        }
        continue;
      }
      const sig = s.id + ':' + s.level;
      if (sig !== el.sig) {
        el.slot.className = 'slot';
        el.iconWrap.innerHTML = '';
        el.iconWrap.appendChild(makeIcon(D.SKILLS[s.id].icon, 24));
        el.lv.textContent = s.level;
        el.sig = sig;
      }
      const calc = st.skills[s.id];
      const full = calc ? 1 / calc.rate : 1;
      const pct = Math.max(0, Math.min(1, s.cd / full));
      el.cd.style.height = (pct * 100).toFixed(0) + '%';
    }

    // 装备槽
    for (let i = 0; i < UI.gearEls.length; i++) {
      const el = UI.gearEls[i];
      const it = st.gear[el.slot];
      const sig = it ? it.name + it.rarity : 'none';
      if (sig === el.sig) continue;
      el.sig = sig;
      el.icon.innerHTML = '';
      if (it) {
        el.row.classList.add('filled');
        el.row.style.color = D.RARITY_COLOR[it.rarity];
        el.icon.appendChild(makeIcon(D.SLOT_ICON[el.slot], 16));
      } else {
        el.row.classList.remove('filled');
        el.row.style.color = '';
      }
    }

    // 提示
    UI.syncToasts(st);
  };

  UI.showToasts = function () {};

  /* ---------------- 模态 ---------------- */
  function openModal(html, cls) {
    const box = $('modalbox');
    box.className = cls || '';
    box.innerHTML = html;
    $('modal').classList.remove('hidden');
    UI.mode = 'open';
  }

  UI.close = function () {
    $('modal').classList.add('hidden');
    $('modalbox').innerHTML = '';
    UI.mode = 'none';
  };
  UI.isOpen = function () { return UI.mode !== 'none'; };

  /* ---------------- 升级卡 ---------------- */
  UI.showLevelUp = function (st, choices, onPick) {
    const p = st.player;
    let html = '<div class="mtitle">等级提升</div>';
    html += '<div class="msub">Lv.' + p.level + ' — 选择一项强化</div>';
    html += '<div class="cards">';
    for (let i = 0; i < choices.length; i++) {
      const c = choices[i];
      let icon = 'gem', name = '', desc = '', kind = 'new', kindText = '新技能';
      if (c.kind === 'new') {
        const s = D.SKILLS[c.id];
        icon = s.icon; name = s.name; desc = s.desc; kind = 'new'; kindText = '新技能';
      } else if (c.kind === 'up') {
        const s = D.SKILLS[c.id];
        const cur = p.skills.find(function (x) { return x.id === c.id; });
        icon = s.icon; name = s.name;
        const next = root.ENGINE.computeSkill(c.id, (cur ? cur.level : 1) + 1, st.agg);
        desc = '等级 ' + ((cur ? cur.level : 1)) + ' → ' + ((cur ? cur.level : 1) + 1) + '，伤害提升';
        kind = 'up'; kindText = '技能升级';
      } else {
        const s = root.SIM.STAT_POOL.find(function (x) { return x.id === c.id; });
        icon = s.icon; name = s.name; desc = s.desc; kind = 'stat'; kindText = '属性';
      }
      html += '<div class="card" data-idx="' + i + '">' +
        '<div class="ckey">' + (i + 1) + '</div>' +
        iconToHtml(icon, 32) +
        '<div class="cname">' + name + '</div>' +
        '<div class="cdesc">' + desc + '</div>' +
        '<div class="ckind ' + kind + '">' + kindText + '</div>' +
        '</div>';
    }
    html += '</div>';
    openModal(html);
    hydrateIcons($('modalbox'));

    const box = $('modalbox');
    const pick = function (idx) {
      if (idx < 0 || idx >= choices.length) return;
      UI.close();
      onPick(choices[idx]);
    };
    box.onclick = function (ev) {
      let el = ev.target;
      while (el && el !== box && el.getAttribute('data-idx') === null) el = el.parentNode;
      if (el && el !== box) pick(parseInt(el.getAttribute('data-idx'), 10));
    };
    UI._keys = pick;
    UI._choiceCount = choices.length;
  };

  function iconToHtml(name, px) {
    return '<canvas class="cicon" data-spr="' + name + '" data-px="' + px + '"></canvas>';
  }

  // 每次打开模态后把 canvas 填充好
  function hydrateIcons(container) {
    const list = container.querySelectorAll('canvas[data-spr]');
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const name = c.getAttribute('data-spr');
      const px = parseInt(c.getAttribute('data-px'), 10) || 24;
      const src = makeIcon(name, px);
      c.width = px; c.height = px;
      c.getContext('2d').drawImage(src, 0, 0);
    }
  }

  /* ---------------- 背包 ---------------- */
  UI.showInventory = function (st, onEquip, onUnequip) {
    UI.st = st;
    renderInv(st, onEquip, onUnequip);
  };

  function renderInv(st, onEquip, onUnequip) {
    const p = st.player;
    let html = '<div class="mtitle">背包</div>';
    html += '<div class="msub">总共 ' + st.bag.length + ' / 8 件 · 点击装备</div>';
    html += '<div class="invgrid">';

    html += '<div class="invleft"><div class="sect">已装备</div>';
    for (let i = 0; i < D.SLOTS.length; i++) {
      const sl = D.SLOTS[i];
      const it = st.gear[sl];
      html += '<div class="eqrow" data-uneq="' + sl + '">' +
        '<div class="icon">' + (it ? iconToHtml(D.SLOT_ICON[sl], 16) : '') + '</div>' +
        '<span class="nm"' + (it ? ' style="color:' + D.RARITY_COLOR[it.rarity] + '"' : '') + '>' +
        (it ? it.name : '—') + '</span>' +
        '<span class="sl">' + D.SLOT_CN[sl] + '</span></div>';
    }
    html += '</div>';

    html += '<div class="invright"><div class="sect">背包</div><div class="baglist">';
    if (!st.bag.length) {
      html += '<div style="color:#4a4f62;font-size:11px;padding:8px">空</div>';
    }
    for (let i = 0; i < st.bag.length; i++) {
      const it = st.bag[i];
      const pv = root.SIM.previewEquip(st, it);
      let curDps = 0;
      for (let k = 0; k < p.skills.length; k++) {
        const c = st.skills[p.skills[k].id];
        if (c) curDps += c.dps;
      }
      const curHp = p.maxHp;
      const dd = pv.dps - curDps;
      const dh = pv.hp - curHp;
      const tag = dd > 1 ? '<span class="up">▲DPS</span>' : (dh > 1 ? '<span class="up">▲生命</span>' : '');
      html += '<div class="bagrow" data-bag="' + i + '">' +
        '<div class="icon">' + iconToHtml(D.SLOT_ICON[it.slot], 16) + '</div>' +
        '<span class="nm" style="color:' + D.RARITY_COLOR[it.rarity] + '">' + it.name + '</span>' +
        tag + '</div>';
    }
    html += '</div>';

    if (UI.selItem && st.bag.indexOf(UI.selItem) >= 0) {
      html += itemDetail(st, UI.selItem);
    } else if (UI.selEquipped) {
      html += itemDetail(st, UI.selEquipped, true);
    }
    html += '</div></div>';

    html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (TAB)</button></div>';
    openModal(html);
    hydrateIcons($('modalbox'));

    const box = $('modalbox');
    box.onclick = function (ev) {
      let el = ev.target;
      while (el && el !== box && !el.getAttribute('data-close') && !el.getAttribute('data-bag') && !el.getAttribute('data-uneq')) {
        el = el.parentNode;
      }
      if (!el || el === box) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const bi = el.getAttribute('data-bag');
      if (bi !== null) {
        const item = st.bag[parseInt(bi, 10)];
        UI.selItem = item;
        UI.selEquipped = null;
        const old = onEquip(item);
        UI.selItem = null;
        renderInv(st, onEquip, onUnequip);
        return;
      }
      const us = el.getAttribute('data-uneq');
      if (us) {
        onUnequip(us);
        renderInv(st, onEquip, onUnequip);
        return;
      }
    };
    UI._keys = null;
  }

  function itemDetail(st, it, equipped) {
    let html = '<div class="detail"><h3 style="color:' + D.RARITY_COLOR[it.rarity] + '">' + it.name + '</h3>';
    html += '<div class="sub">' + D.RARITY_CN[it.rarity] + ' · ' + D.SLOT_CN[it.slot] + ' · 物品等级 ' + it.ilvl + '</div>';
    for (let i = 0; i < it.mods.length; i++) {
      html += '<div class="mod">' + it.mods[i].label + '</div>';
    }
    if (!it.mods.length) html += '<div class="mod" style="color:#4a4f62">（无词缀）</div>';

    if (!equipped) {
      const pv = root.SIM.previewEquip(st, it);
      let curDps = 0;
      for (let k = 0; k < st.player.skills.length; k++) {
        const c = st.skills[st.player.skills[k].id];
        if (c) curDps += c.dps;
      }
      const dd = pv.dps - curDps;
      const dh = pv.hp - st.player.maxHp;
      html += '<div class="cmp">' +
        '<div class="row"><span>DPS</span><b class="' + (dd >= 0 ? 'up' : 'down') + '">' +
        (dd >= 0 ? '+' : '') + Math.round(dd) + '</b></div>' +
        '<div class="row"><span>最大生命</span><b class="' + (dh >= 0 ? 'up' : 'down') + '">' +
        (dh >= 0 ? '+' : '') + dh + '</b></div>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ---------------- 结算 ---------------- */
  UI.showEnd = function (st, win, onRestart) {
    const m = Math.floor(st.t / 60), s = Math.floor(st.t % 60);
    let html = '<div class="endbox">';
    html += '<h2 class="' + (win ? 'win' : 'dead') + '">' + (win ? '深渊已寂' : '你已陨落') + '</h2>';
    html += '<div class="msub">' + (win ? '你击溃了深渊之眼' : '灰烬吞没了你') + '</div>';
    html += '<div class="stats">' +
      '<div class="s"><div class="n">' + m + ':' + (s < 10 ? '0' : '') + s + '</div><div class="l">存活时间</div></div>' +
      '<div class="s"><div class="n">' + st.kills + '</div><div class="l">击杀</div></div>' +
      '<div class="s"><div class="n">' + st.player.level + '</div><div class="l">等级</div></div>' +
      '</div>';
    html += '<div class="mfoot" style="justify-content:center"><button class="btn primary" data-restart="1">再来一局 (R)</button></div>';
    html += '</div>';
    openModal(html);
    const box = $('modalbox');
    box.onclick = function (ev) {
      let el = ev.target;
      while (el && el !== box && !el.getAttribute('data-restart')) el = el.parentNode;
      if (el && el !== box) onRestart();
    };
    UI._keys = null;
    UI._restart = onRestart;
  };

  /* ---------------- 键盘 ---------------- */
  function bindKeys() {
    window.addEventListener('keydown', function (ev) {
      const k = ev.key;
      if (UI.mode === 'open' && UI._choiceCount) {
        if (k >= '1' && k <= '3') {
          const idx = parseInt(k, 10) - 1;
          if (idx < UI._choiceCount && UI._keys) UI._keys(idx);
          ev.preventDefault();
          return;
        }
      }
      if (UI._restart && (k === 'r' || k === 'R')) {
        UI._restart();
        return;
      }
    });
  }

  /* 吐司渲染（在主循环里调用） */
  const seen = {};
  UI.syncToasts = function (st) {
    const wrap = $('toasts');
    for (let i = 0; i < st.toasts.length; i++) {
      const t = st.toasts[i];
      if (t.spawned) continue;
      t.spawned = true;
      const el = document.createElement('div');
      el.className = 'toast ' + (t.kind || '');
      el.textContent = t.text;
      wrap.appendChild(el);
      setTimeout(function () {
        el.style.transition = 'opacity .4s';
        el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
      }, 1700);
    }
  };
})(window);
