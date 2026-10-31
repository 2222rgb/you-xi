/* =========================================================
   ui.js — DOM 界面：HUD / 主城 / 天赋树 / 背包 / 设置 / 触屏
   ========================================================= */
(function (root) {
  'use strict';

  const D = root.DATA, E = root.ENGINE, SIM = root.SIM;
  const $ = function (id) { return document.getElementById(id); };

  const UI = {
    mode: 'none',
    st: null,
    skillEls: [],
    gearEls: [],
    last: {},
    selBag: null,
    touch: { active: false, dx: 0, dy: 0, id: null },
    controls: 'auto'
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

  function iconToHtml(name, px) {
    return '<canvas class="cicon" data-spr="' + name + '" data-px="' + px + '"></canvas>';
  }
  function hydrateIcons(container) {
    const list = container.querySelectorAll('canvas[data-spr]');
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const src = makeIcon(c.getAttribute('data-spr'), parseInt(c.getAttribute('data-px'), 10) || 24);
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
    }
  }

  /* ---------------- 初始化 ---------------- */
  UI.init = function (st) {
    document.addEventListener('mousemove', function (ev) {
      if (UI._noRowTip) return;
      const row = ev.target && ev.target.closest ? ev.target.closest('.irow') : null;
      if (row && UI._tipItems) {
        const it = UI._tipItems[parseInt(row.getAttribute('data-idx'), 10)];
        if (it) { UI.showTip(UI.itemTipHTML(it), ev.clientX, ev.clientY); return; }
      }
      if (!UI._tipHold) UI.hideTip();
    });
    document.addEventListener('mouseleave', function () { UI.hideTip(); });
    // 把提示框挂到 body，避免被弹窗所在的层叠上下文盖住
    const tipEl = document.getElementById('tip');
    if (tipEl && tipEl.parentElement !== document.body) document.body.appendChild(tipEl);

    UI.st = st;
    buildSkills();
    buildGear();
    bindKeys();
    bindTouch();
    loadSettings();
    UI.tick(st, true);
  };

  function buildSkills() {
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
      slot.appendChild(iconWrap);
      slot.appendChild(cd);
      slot.appendChild(lv);
      wrap.appendChild(slot);
      UI.skillEls.push({ slot: slot, iconWrap: iconWrap, cd: cd, lv: lv, sig: '' });
    }
  }

  function buildGear() {
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
    const L = UI.last;

    const hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp));
    if (force || Math.abs(hpPct - (L.hp || 0)) > 0.002) {
      $('hpfill').style.width = (hpPct * 100).toFixed(1) + '%';
      $('hptext').textContent = Math.ceil(p.hp) + ' / ' + Math.round(p.maxHp);
      L.hp = hpPct;
    }
    const xpPct = Math.min(1, p.xp / p.xpNext);
    if (force || Math.abs(xpPct - (L.xp || 0)) > 0.002) {
      $('xpfill').style.width = (xpPct * 100).toFixed(1) + '%';
      L.xp = xpPct;
    }

    const remain = st.phase === 'town' ? (D.CONFIG.townTime - st.phaseT) : (D.CONFIG.combatTime - st.phaseT);
    const tsec = Math.max(0, Math.ceil(remain));
    const key = st.phase + tsec + st.cycle;
    if (force || key !== L.timer) {
      const m = Math.floor(tsec / 60), s = tsec % 60;
      $('timer').textContent = (st.phase === 'town' ? '主城 ' : '第' + st.cycle + '层 ') +
        (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      $('timer').className = st.phase === 'town' ? 'town' : '';
      L.timer = key;
    }

    if (force || st.kills !== L.kills) { $('killnum').textContent = st.kills; L.kills = st.kills; }
    if (force || p.gold !== L.gold) { $('goldnum').textContent = p.gold; L.gold = p.gold; }
    if (force || p.potions !== L.pot) { $('potnum').textContent = p.potions; L.pot = p.potions; }
    if (root.META && (force || root.META.essence !== L.ess)) {
      const ee = $('essnum');
      if (ee) ee.textContent = root.META.essence;
      L.ess = root.META.essence;
    }

    if (force || p.talentPoints !== L.tp) {
      $('tpnum').textContent = p.talentPoints;
      $('tpbtn').classList.toggle('hot', p.talentPoints > 0);
      L.tp = p.talentPoints;
    }

    let dps = 0;
    for (let i = 0; i < p.skills.length; i++) {
      const c = st.skills[p.skills[i].id];
      if (c) dps += c.dps;
    }
    const dpsInt = Math.round(dps);
    if (force || dpsInt !== L.dps) { $('dpsnum').textContent = dpsInt; L.dps = dpsInt; }

    const mn = document.getElementById('matnum');
    if (mn && mn.textContent != String(p.mats || 0)) mn.textContent = p.mats || 0;

    // 狂潮条
    const fz = p.frenzy || 0, ft = p.frenzyT || 0;
    const frenzyOn = ft > 0;
    const fEl = $('frenzyfill');
    if (fEl) {
      fEl.style.width = (((frenzyOn ? ft / 8 : fz / 100)) * 100).toFixed(0) + '%';
      $('frenzy').classList.toggle('on', frenzyOn);
    }

    // 职业 + 等级
    const cl = $('clstext');
    if (cl) {
      const cdef = root.SIM && p.cls ? root.SIM.classOf(p) : null;
      cl.textContent = (cdef ? cdef.name : '流亡者') + ' · Lv ' + p.level;
    }

    // 打宝评分
    const rk = $('rankchip');
    if (rk) {
      const rank = st.rateRank || 0;
      const on = st.statueOn || (st.statue && st.statue.on);
      if (on) {
        rk.classList.remove('hidden');
        rk.textContent = D.RANKS[rank] + '  ' + (st.rateScore || (st.rate && st.rate.score) || 0);
        rk.style.color = D.RANK_COLOR[rank];
      } else if (!rk.classList.contains('hidden')) {
        rk.classList.add('hidden');
      }
    }

    // 事件提示
    const chip = $('evchip');
    if (chip) {
      const evt = st.event;
      const etype = evt ? (Array.isArray(evt) ? evt[0] : evt.type) : null;
      if (etype) {
        const names = { bloodmoon: '血月', goblin: '宝藏地精', cache: '补给箱' };
        const eleft = Array.isArray(evt) ? evt[1] : Math.max(0, Math.round(evt.t));
        const cls = etype === 'bloodmoon' ? 'blood' : (etype === 'goblin' ? 'gob' : 'cache');
        chip.className = cls;
        chip.textContent = (names[etype] || etype) + ' · ' + eleft + 's';
      } else if (!chip.classList.contains('hidden')) {
        chip.className = 'hidden';
      }
    }

    // 倒地
    const dn = $('downed');
    if (dn) {
      if (p.downed) {
        dn.classList.remove('hidden');
        $('downsub').textContent = (st.players.length > 1 ? '队友靠近 2.5 秒可以救起' : '没有人能救你') + ' · ' + Math.ceil(p.downT || 0) + 's';
        $('downfill').style.width = Math.min(100, ((p.reviveProg || 0) / 2.5) * 100).toFixed(0) + '%';
      } else {
        dn.classList.add('hidden');
      }
    }

    if (force || st.player.bag.length !== L.bag) { $('bagcount').textContent = st.player.bag.length; L.bag = st.player.bag.length; }

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
      const lv = SIM.skillLevel(st, s);
      const sig = s.id + ':' + lv;
      if (sig !== el.sig) {
        el.slot.className = 'slot';
        el.iconWrap.innerHTML = '';
        el.iconWrap.appendChild(makeIcon(D.SKILLS[s.id].icon, 24));
        el.lv.textContent = lv;
        el.sig = sig;
      }
      const calc = st.skills[s.id];
      const full = calc ? 1 / calc.rate : 1;
      el.cd.style.height = (Math.max(0, Math.min(1, s.cd / full)) * 100).toFixed(0) + '%';
    }

    for (let i = 0; i < UI.gearEls.length; i++) {
      const el = UI.gearEls[i];
      const it = st.player.gear[el.slot];
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

    // 主城交互提示
    const prompt = $('prompt');
    const psig = st.phase + ':' + (st.nearNpc || '');
    if (force || psig !== L.psig) {
      L.psig = psig;
      if (st.phase === 'town' && st.nearNpc) {
        const npc = D.TOWN.npcs.find(function (n) { return n.id === st.nearNpc; });
        prompt.classList.remove('hidden');
        prompt.innerHTML = '<b>E</b> ' + npc.name + ' <em>' + npc.desc + '</em>';
      } else if (st.phase === 'town') {
        prompt.classList.remove('hidden');
        prompt.innerHTML = '<em>走近商人 / 铁匠 / 仓库 / 交易行，按 E 交互</em>';
      } else if (st.phase === 'rift') {
        prompt.classList.remove('hidden');
        prompt.innerHTML = '<em>等待房主选择裂隙…</em>';
      } else {
        prompt.classList.add('hidden');
      }
    }

    UI.syncToasts(st);
  };

  /* ---------------- 吐司 ---------------- */
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

  /* ---------------- 模态 ---------------- */
  function openModal(html, cls) {
    const box = $('modalbox');
    box.className = cls || '';
    box.innerHTML = html;
    $('modal').classList.remove('hidden');
    UI.mode = 'open';
    hydrateIcons(box);
  }
  UI.openModal = openModal;

  UI.close = function () {
    $('modal').classList.add('hidden');
    $('modalbox').innerHTML = '';
    UI.mode = 'none';
    UI._onClose = null;
  };
  UI.isOpen = function () { return UI.mode !== 'none'; };

  function coin(n) { return '<span class="coin">' + n + '</span>'; }

  /* ---------------- 天赋树（画布旧版，保留但不再调用） ---------------- */
  UI.showTalentLegacy = function (st) {
    const p = st.player;
    let html = '<div class="mtitle">天赋</div>';
    html += '<div class="msub">可用点数 <b class="gold">' + p.talentPoints + '</b> · 已点亮 ' + p.talents.length + '</div>';
    html += '<canvas id="tree-canvas" width="900" height="620"></canvas>';
    html += '<div class="mfoot"><span class="treehint" id="tree-hint">点击相邻节点投入 1 点</span>' +
      '<button class="btn" data-reset="1">洗点</button>' +
      '<button class="btn" data-close="1">关闭 (P)</button></div>';
    openModal(html, 'wide');

    const cv = $('tree-canvas');
    drawTree(st, cv);

    cv.onclick = function (ev) {
      const rect = cv.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (cv.width / rect.width);
      const y = (ev.clientY - rect.top) * (cv.height / rect.height);
      for (let i = 0; i < D.TALENTS.length; i++) {
        const n = D.TALENTS[i];
        const r = n.kind === 'keystone' ? 20 : 15;
        if (Math.hypot(n.x - x, n.y - y) <= r) {
          if (n.id === 'origin') return;
          if (SIM.allocate(st, n.id)) drawTree(st, cv);
          return;
        }
      }
    };
    cv.onmousemove = function (ev) {
      const rect = cv.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (cv.width / rect.width);
      const y = (ev.clientY - rect.top) * (cv.height / rect.height);
      let found = null;
      for (let i = 0; i < D.TALENTS.length; i++) {
        const n = D.TALENTS[i];
        if (Math.hypot(n.x - x, n.y - y) <= (n.kind === 'keystone' ? 20 : 15)) { found = n; break; }
      }
      $('tree-hint').innerHTML = found
        ? '<b style="color:#e0c060">' + found.name + '</b> — ' + found.desc +
        (p.talents.indexOf(found.id) >= 0 ? ' <em style="color:#6fdc8f">（已点亮）</em>' : '')
        : '点击相邻节点投入 1 点';
    };

    $('modalbox').onclick = function (ev) {
      let el = ev.target;
      while (el && el !== $('modalbox') && !el.getAttribute('data-close') && !el.getAttribute('data-reset')) el = el.parentNode;
      if (!el || el === $('modalbox')) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      if (el.getAttribute('data-reset')) {
        const n = ACT.run(st, 'resetTalents', []);
        UI.toast('返还 ' + n + ' 点');
        UI.showTalent(st);
      }
    };
  };

  /* ---------------- 天赋树（火炬之光式：三棵树 × 五层 × 多级） ---------------- */
  UI.showTalent = function (st) {
    const p = st.player;

    function render() {
      let html = '<div class="mtitle">天赋</div>';
      html += '<div class="msub">可用 <b class="gold">' + p.talentPoints + '</b> 点 · 点击节点加点，层级按该树投入点数解锁</div>';

      const info = root.SIM.resonanceInfo(p);
      html += '<div class="resbar">';
      for (const tag in D.RESONANCE) {
        const def = D.RESONANCE[tag];
        const n = info.counts[tag] || 0;
        const top = def.tiers[def.tiers.length - 1].n;
        let on = 0;
        for (let ti = 0; ti < def.tiers.length; ti++) if (n >= def.tiers[ti].n) on = def.tiers[ti].n;
        html += '<span class="rt' + (on ? ' on' : '') + '" style="--rc:' + def.color + '">' +
          def.name + ' <b>' + n + '</b>/' + top + (on ? ' · ' + on : '') + '</span>';
      }
      html += '</div>';
      const tabId = (UI.talentTab && D.TREES.some(function (x) { return x.id === UI.talentTab; })) ? UI.talentTab : D.TREES[0].id;
      html += '<div class="ttabs">';
      for (let t = 0; t < D.TREES.length; t++) {
        const tr = D.TREES[t];
        html += '<button class="ttab' + (tr.id === tabId ? ' on' : '') + '" data-tab="' + tr.id + '" style="--tc:' + tr.color + '">' +
          tr.name + '<span>' + (p.treeSpent[tr.id] || 0) + '</span></button>';
      }
      html += '</div>';

      html += '<div class="tcols">';

      {
        const tree = D.TREES.find(function (x) { return x.id === tabId; });
        const spent = p.treeSpent[tree.id] || 0;
        html += '<div class="tcol" style="--tc:' + tree.color + '">';
        html += '<div class="thead">' + tree.name + '<span>' + spent + ' 点</span></div>';

        for (let tier = 1; tier <= 5; tier++) {
          const gate = D.TIER_GATE[tier];
          const open = spent >= gate;
          html += '<div class="ttier' + (open ? '' : ' locked') + '">';
          if (gate > 0) html += '<div class="tgate">' + (open ? '· 已解锁 ·' : '需 ' + gate + ' 点解锁') + '</div>';
          for (let i = 0; i < tree.nodes.length; i++) {
            const n = tree.nodes[i];
            if (n.tier !== tier) continue;
            const rank = p.talents[n.id] || 0;
            const maxed = rank >= n.max;
            const can = open && !maxed && p.talentPoints > 0;
            html += '<div class="tnode' + (can ? ' can' : '') + (maxed ? ' maxed' : '') + (rank > 0 ? ' has' : '') +
              '" data-node="' + n.id + '">' +
              '<div class="ticon">' + iconToHtml(n.icon || 'icon_ring', 20) + '</div>' +
              '<div class="tbody"><div class="tname">' + n.name +
              (n.kind === 'active' ? '<i class="tag">技能</i>' : (n.kind === 'keystone' ? '<i class="tag k">关键</i>' : '')) +
              '<span class="rank">' + rank + '/' + n.max + '</span></div>' +
              '<div class="tdesc">' + n.desc + '</div></div></div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';

      html += '<div class="mfoot"><span class="treehint" id="tree-hint">技能节点升到 1 级即学会该技能（最多同时装备 3 个）</span>' +
        '<button class="btn" data-reset="1">洗点</button>' +
        '<button class="btn primary" data-close="1">关闭 (P)</button></div>';
      openModal(html, 'wide');
      $('modalbox').onclick = onClick;
    }

    function onClick(ev) {
      let el = ev.target;
      const box = $('modalbox');
      while (el && el !== box && !el.getAttribute('data-node') && !el.getAttribute('data-close') && !el.getAttribute('data-reset') && !el.getAttribute('data-tab')) {
        el = el.parentNode;
      }
      if (!el || el === box) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      if (el.getAttribute('data-tab')) { UI.talentTab = el.getAttribute('data-tab'); render(); return; }
      if (el.getAttribute('data-reset')) {
        const n = ACT.run(st, 'resetTalents', []);
        UI.toast('返还 ' + n + ' 点');
        render();
        return;
      }
      const id = el.getAttribute('data-node');
      if (ACT.run(st, 'allocate', [id])) {
        render();
      } else {
        const entry = D.TALENT_INDEX[id];
        const node = entry && entry.node;
        if (node && (p.talents[id] || 0) >= node.max) UI.toast('已满级', 'bad');
        else if (node && (p.treeSpent[entry.tree] || 0) < D.TIER_GATE[node.tier]) UI.toast('需要先在' + D.TREES.find(function (x) { return x.id === entry.tree; }).name + '树投入 ' + D.TIER_GATE[node.tier] + ' 点', 'bad');
        else UI.toast('没有天赋点', 'bad');
      }
    }

    render();
  };


  /* ---------------- 物品悬浮详情 ---------------- */
  UI.itemTipHTML = function (it) {
    if (!it) return '';
    const rc = D.RARITY_COLOR[it.rarity] || '#cfd8e8';
    let html = '<div class="tn" style="color:' + rc + '">' + it.name + '</div>';
    html += '<div class="tm">' + (D.SLOT_CN[it.slot] || it.slot) + ' · ' + (D.RARITY_CN[it.rarity] || '') + ' · ilvl ' + it.ilvl + '</div>';
    for (let i = 0; i < it.mods.length; i++) {
      html += '<div class="tmod">· ' + (it.mods[i].label || '') + '</div>';
    }
    html += '<div class="tline"></div>';
    html += '<div class="tfoot">售价 ' + E.itemPrice(it) + ' 金币</div>';
    return html;
  };

  UI.showTip = function (html, x, y) {
    const el = $('tip');
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove('hidden');
    const w = el.offsetWidth, h = el.offsetHeight;
    let px = x + 16, py = y + 16;
    if (px + w > window.innerWidth - 8) px = x - w - 16;
    if (py + h > window.innerHeight - 8) py = Math.max(8, window.innerHeight - h - 8);
    el.style.left = px + 'px';
    el.style.top = py + 'px';
  };

  UI.hideTip = function () {
    const el = $('tip');
    if (el) el.classList.add('hidden');
  };

  /* ---------------- 通用物品行 ---------------- */
  function priceOf(it) { return E.itemPrice(it); }

  function itemRow(it, extra, act, idx) {
    return '<div class="irow" data-act="' + act + '" data-idx="' + idx + '">' +
      '<div class="ico">' + iconToHtml(D.SLOT_ICON[it.slot], 16) + '</div>' +
      '<span class="nm" style="color:' + D.RARITY_COLOR[it.rarity] + '">' + it.name + '</span>' +
      '<span class="lvl">' + D.SLOT_CN[it.slot] + ' ' + it.ilvl + '</span>' +
      (extra || '') + '</div>';
  }

  /* ---------------- 商人 ---------------- */
  UI.showShop = function (st) {
    UI._tipItems = st.shop;
    const p = st.player;
    let html = '<div class="mtitle">商人 卡兰</div>';
    html += '<div class="msub">金币 ' + coin(p.gold) + ' · 药水 ' + p.potions + '/9</div>';
    html += '<div class="town2col">';

    html += '<div><div class="sect">货架</div>';
    if (!st.shop.length) html += '<div class="empty">今天没有货了。</div>';
    for (let i = 0; i < st.shop.length; i++) {
      const it = st.shop[i];
      const price = Math.round(priceOf(it) * D.PRICES.buyMul);
      html += itemRow(it, '<span class="price">' + coin(price) + '</span>', 'buy', i);
    }
    html += '<div class="irow" data-act="potion" data-idx="0">' +
      '<div class="ico">' + iconToHtml('heart', 16) + '</div>' +
      '<span class="nm">治疗药水</span><span class="lvl">F 使用</span>' +
      '<span class="price">' + coin(D.PRICES.potion) + '</span></div>';
    html += '</div>';

    html += '<div><div class="sect">出售（点击出售）</div>';
    if (!st.player.bag.length) html += '<div class="empty">背包是空的。</div>';
    for (let i = 0; i < st.player.bag.length; i++) {
      html += itemRow(st.player.bag[i], '<span class="price sell">+' + coin(priceOf(st.player.bag[i])) + '</span>', 'sell', i);
    }
    html += '</div></div>';

    html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (E)</button></div>';
    openModal(html);

    $('modalbox').onclick = function (ev) {
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const act = el.getAttribute('data-act');
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      if (act === 'buy') {
        if (ACT.run(st, 'buy', [idx])) UI.showShop(st);
        else UI.toast(st.player.gold < 1 ? '没有金币' : '金币不足或背包已满', 'bad');
      } else if (act === 'potion') {
        if (ACT.run(st, 'buyPotion', [])) UI.showShop(st);
        else UI.toast('金币不足或药水已满', 'bad');
      } else if (act === 'sell') {
        const gain = ACT.run(st, 'sell', [idx]);
        UI.toast('售出 +' + gain + ' 金币');
        UI.showShop(st);
      }
    };
  };

  function pickRow(ev) {
    let el = ev.target;
    const box = $('modalbox');
    while (el && el !== box && !el.getAttribute('data-act') && !el.getAttribute('data-close')) el = el.parentNode;
    if (!el || el === box) return null;
    if (el.getAttribute('data-close')) return el;
    return el;
  }

  /* ---------------- 铁匠 ---------------- */
  UI.showSmith = function (st) {
    UI._tipItems = st.player.bag;
    const p = st.player;
    let html = '<div class="mtitle">铁匠 格罗姆</div>';
    html += '<div class="msub">金币 ' + coin(p.gold) + ' · 选择一件装备进行打造</div>';

    // 强化区：已装备部位 +N
    html += '<div class="sect">强化（+N，每级 +5% 词缀效果）</div>';
    for (let si = 0; si < D.SLOTS.length; si++) {
      const sl = D.SLOTS[si];
      const it = p.gear[sl];
      if (!it) {
        html += '<div class="irow"><div class="ico"></div><span class="nm">' + D.SLOT_CN[sl] + ' · 未装备</span></div>';
        continue;
      }
      const cost = E.enhanceCost(it);
      const maxed = (it.plus || 0) >= 15;
      html += '<div class="irow" data-act="enh" data-slot="' + sl + '">' +
        '<div class="ico">' + iconToHtml(D.SLOT_ICON[sl], 16) + '</div>' +
        '<span class="nm" style="color:' + D.RARITY_COLOR[it.rarity] + '">' + it.name + ' <b style="color:#e0c060">+' + (it.plus || 0) + '</b></span>' +
        '<span class="lvl">' + (maxed ? '已满' : cost + ' 金币') + '</span></div>';
    }
    html += '<div class="sect">打造（PoE 式，第 3 层后解锁）</div>';

    if (UI.selBag === null || !st.player.bag[UI.selBag]) {
      html += '<div class="sect">背包</div>';
      if (!st.player.bag.length) html += '<div class="empty">背包是空的。</div>';
      for (let i = 0; i < st.player.bag.length; i++) {
        html += itemRow(st.player.bag[i], '<span class="price">' + D.RARITY_CN[st.player.bag[i].rarity] + '</span>', 'pick', i);
      }
      html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (E)</button></div>';
      openModal(html);
      $('modalbox').onclick = function (ev) {
        const el = pickRow(ev);
        if (!el) return;
        if (el.getAttribute('data-close')) { UI.close(); return; }
        if (el.getAttribute('data-act') === 'enh') {
          const r = ACT.run(st, 'enhance', [el.getAttribute('data-slot')]);
          if (r && r.ok) { UI.playSfx('craft'); UI.toast('强化成功 +' + r.plus, 'good'); }
          else if (r) UI.toast(r.msg, 'bad');
          UI.showSmith(st);
          return;
        }
        if (el.getAttribute('data-act') === 'pick') {
          UI.selBag = parseInt(el.getAttribute('data-idx'), 10);
          UI.showSmith(st);
        }
      };
      return;
    }

    const it = st.player.bag[UI.selBag];
    const c = D.PRICES.craft;
    html += '<div class="detail"><h3 style="color:' + D.RARITY_COLOR[it.rarity] + '">' + it.name + '</h3>';
    html += '<div class="sub">' + D.RARITY_CN[it.rarity] + ' · ' + D.SLOT_CN[it.slot] + ' · ilvl ' + it.ilvl + '</div>';
    for (let i = 0; i < it.mods.length; i++) html += '<div class="mod">' + it.mods[i].label + '</div>';
    if (!it.mods.length) html += '<div class="mod" style="color:#5a5048">（无词缀）</div>';
    html += '</div>';

    const canAdd = it.rarity === 0 ? it.mods.length < 1 : (it.rarity === 1 ? it.mods.length < 3 : it.mods.length < 5);
    const canUp = it.rarity < 2;

    if (st.cycle < 3) {
      html += '<div class="note" style="color:#e0c060">附魔与重铸在第 3 层后解锁。现在先把装备强化上去。</div>';
    } else {
    html += '<div class="craftlist">';
    html += '<button class="btn craft" data-craft="reroll" ' + (p.gold < c.reroll(it.ilvl) ? 'disabled' : '') + '>' +
      '重铸词缀 <span class="price">' + coin(c.reroll(it.ilvl)) + '</span></button>';
    html += '<button class="btn craft" data-craft="addAffix" ' + (!canAdd || p.gold < c.addAffix(it.ilvl) ? 'disabled' : '') + '>' +
      '增加词缀 <span class="price">' + coin(c.addAffix(it.ilvl)) + '</span></button>';
    html += '<button class="btn craft" data-craft="upgrade" ' + (!canUp || p.gold < c.upgrade(it.ilvl) ? 'disabled' : '') + '>' +
      '提升品质 <span class="price">' + coin(c.upgrade(it.ilvl)) + '</span></button>';
    html += '</div>';
    }

    html += '<div class="mfoot"><button class="btn" data-back="1">换一件</button><button class="btn primary" data-close="1">完成</button></div>';
    openModal(html);

    $('modalbox').onclick = function (ev) {
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); UI.selBag = null; return; }
      if (el.getAttribute('data-back')) { UI.selBag = null; UI.showSmith(st); return; }
      const kind = el.getAttribute('data-craft');
      if (!kind) return;
      const r = ACT.run(st, 'craft', [UI.selBag, kind]);
      if (!r.ok) { UI.toast(r.msg, 'bad'); return; }
      UI.toast('打造完成 · -' + r.cost + ' 金币', 'good');
      UI.showSmith(st);
    };
  };

  /* ---------------- 仓库 ---------------- */
  UI.showStash = function (st) {
    let html = '<div class="mtitle">仓库</div>';
    html += '<div class="msub">背包 ' + st.player.bag.length + '/8 · 仓库 ' + st.stash.length + '/24</div>';
    html += '<div class="town2col">';

    html += '<div><div class="sect">背包 → 仓库存入</div>';
    if (!st.player.bag.length) html += '<div class="empty">空</div>';
    for (let i = 0; i < st.player.bag.length; i++) html += itemRow(st.player.bag[i], '<span class="price sell">存入 →</span>', 'in', i);
    html += '</div>';

    html += '<div><div class="sect">仓库 → 背包取出</div>';
    if (!st.stash.length) html += '<div class="empty">空</div>';
    for (let i = 0; i < st.stash.length; i++) html += itemRow(st.stash[i], '<span class="price sell">← 取出</span>', 'out', i);
    html += '</div></div>';

    html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (E)</button></div>';
    openModal(html, 'wide');

    $('modalbox').onclick = function (ev) {
      const mnTarget = ev.target;
      const mini = mnTarget && mnTarget.getAttribute ? mnTarget.getAttribute('data-mini') : null;
      if (mini) {
        const mi = parseInt(mnTarget.getAttribute('data-i'), 10);
        if (mini === 'salv') {
          const rs = ACT.run(st, 'salvage', [mi]);
          if (rs && rs.ok) { UI.toast('回收获得 ' + rs.mats + ' 材料', 'good'); UI.playSfx('buy'); }
          else if (rs) UI.toast(rs.msg, 'bad');
        } else {
          const rd = ACT.run(st, 'drop', [mi]);
          if (rd && rd.ok) UI.toast('已丢在地上', 'good');
        }
        UI.showBag(st);
        return;
      }
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const act = el.getAttribute('data-act');
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      if (act === 'in') { if (!ACT.run(st, 'stashIn', [idx])) UI.toast('仓库已满', 'bad'); UI.showStash(st); }
      if (act === 'out') { if (!ACT.run(st, 'stashOut', [idx])) UI.toast('背包已满', 'bad'); UI.showStash(st); }
    };
  };

  /* ---------------- 交易行 ---------------- */
  UI.showMarket = function (st) {
    UI._tipItems = st.marketStock;
    const p = st.player;
    let html = '<div class="mtitle">交易行</div>';
    html += '<div class="msub">金币 ' + coin(p.gold) + ' · 出售装备，或竞拍一件稀有品</div>';
    html += '<div class="town2col">';

    html += '<div><div class="sect">挂售</div>';
    if (!st.player.bag.length) html += '<div class="empty">没有可卖的东西。</div>';
    for (let i = 0; i < st.player.bag.length; i++) {
      html += itemRow(st.player.bag[i], '<span class="price sell">+' + coin(priceOf(st.player.bag[i])) + '</span>', 'sell', i);
    }
    html += '</div>';

    html += '<div><div class="sect">竞拍</div>';
    for (let i = 0; i < st.marketStock.length; i++) {
      const it = st.marketStock[i];
      const price = Math.round(priceOf(it) * 4.5);
      html += itemRow(it, '<span class="price">' + coin(price) + '</span>', 'bid', i);
    }
    if (!st.marketStock.length) html += '<div class="empty">已售罄。</div>';
    html += '<div class="note">交易行在联机版里会变成玩家之间的市场；现在由系统供货。</div>';
    html += '</div></div>';

    html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (E)</button></div>';
    openModal(html);

    $('modalbox').onclick = function (ev) {
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const act = el.getAttribute('data-act');
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      if (act === 'sell') { const g = ACT.run(st, 'sell', [idx]); UI.toast('售出 +' + g); UI.showMarket(st); }
      if (act === 'bid') {
        if (ACT.run(st, 'marketBuy', [idx])) { UI.toast('竞拍成功', 'good'); UI.showMarket(st); }
        else UI.toast('金币不足或背包已满', 'bad');
      }
    };
  };

  /* ---------------- 背包 ---------------- */
  UI.showBag = function (st) {
    UI._tipItems = st.player.bag;
    let html = '<div class="mtitle">背包</div>';
    html += '<div class="msub">点击装备 · ' + st.player.bag.length + '/24' + (st.player.boxes ? ' · 魔盒 ' + st.player.boxes : '') + '</div>';
    html += '<div class="town2col">';
    html += '<div><div class="sect">已装备</div>';
    for (let i = 0; i < D.SLOTS.length; i++) {
      const sl = D.SLOTS[i];
      const it = st.player.gear[sl];
      html += '<div class="irow" data-act="uneq" data-idx="' + i + '">' +
        '<div class="ico">' + (it ? iconToHtml(D.SLOT_ICON[sl], 16) : '') + '</div>' +
        '<span class="nm"' + (it ? ' style="color:' + D.RARITY_COLOR[it.rarity] + '"' : '') + '>' +
        (it ? it.name : '—') + '</span><span class="lvl">' + D.SLOT_CN[sl] + '</span></div>';
    }
    html += '</div><div><div class="sect">背包</div>';
    if (st.player.boxes > 0) {
      html += '<div class="irow box" data-act="openbox" data-idx="0">' +
        '<div class="ico">' + iconToHtml('icon_ring', 16) + '</div>' +
        '<span class="nm" style="color:#ffd54f">魔盒 ×' + st.player.boxes + '</span>' +
        '<span class="lvl">点击开启</span></div>';
    }
    if (!st.player.bag.length) html += '<div class="empty">空</div>';
    for (let i = 0; i < st.player.bag.length; i++) {
      html += itemRow(st.player.bag[i],
        '<span class="mini" data-mini="salv" data-i="' + i + '" title="回收成材料">回</span>' +
        '<span class="mini" data-mini="drop" data-i="' + i + '" title="丢到地上">丢</span>', 'eq', i);
    }
    html += '</div></div>';
    html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (TAB)</button></div>';
    openModal(html);

    $('modalbox').onclick = function (ev) {
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const act = el.getAttribute('data-act');
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      if (act === 'openbox') {
        const r = ACT.run(st, 'openBox', []);
        if (r && r.ok) { UI.toast('开出 ' + r.item.name, 'rare'); UI.playSfx('item'); }
        else if (r) UI.toast(r.msg, 'bad');
        UI.showBag(st);
        return;
      }
      if (act === 'eq') { ACT.run(st, 'equip', [idx]); UI.showBag(st); }
      if (act === 'uneq') { ACT.run(st, 'unequip', [D.SLOTS[idx]]); UI.showBag(st); }
    };
  };

  /* ---------------- 设置 ---------------- */
  UI.showSettings = function () {
    let html = '<div class="mtitle">设置</div>';
    const A = root.AUDIO || { vol: 0.55, muted: false };
    html += '<div class="msub">音量</div>';
    html += '<div class="opts">';
    const vols = [[0.25, '小'], [0.55, '中'], [0.85, '大']];
    for (let vi = 0; vi < vols.length; vi++) {
      html += '<button class="opt' + (Math.abs(A.vol - vols[vi][0]) < 0.05 && !A.muted ? ' on' : '') +
        '" data-vol="' + vols[vi][0] + '">' + vols[vi][1] + '</button>';
    }
    html += '<button class="opt' + (A.muted ? ' on' : '') + '" data-mute="1">' + (A.muted ? '已静音' : '静音') + '</button>';
    html += '</div>';
    html += '<div class="msub" style="margin-top:16px">操作方式</div>';
    html += '<div class="msub">操作方式</div>';
    html += '<div class="opts">';
    const opts = [['auto', '自动识别'], ['keyboard', '键盘鼠标'], ['touch', '触屏']];
    for (let i = 0; i < opts.length; i++) {
      html += '<button class="opt' + (UI.controls === opts[i][0] ? ' on' : '') + '" data-ctl="' + opts[i][0] + '">' + opts[i][1] + '</button>';
    }
    html += '</div>';
    html += '<div class="note">触屏模式会在左下角显示虚拟摇杆，右下角显示交互按钮。</div>';
    html += '<div class="mfoot"><button class="btn" data-close="1">关闭</button></div>';
    openModal(html);

    $('modalbox').onclick = function (ev) {
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const vol = el.getAttribute('data-vol');
      if (vol) { if (root.AUDIO) { root.AUDIO.muted = false; root.AUDIO.setVolume(parseFloat(vol)); root.AUDIO.unlock(); root.AUDIO.play('ui'); } UI.showSettings(); return; }
      if (el.getAttribute('data-mute')) { if (root.AUDIO) root.AUDIO.toggleMute(); UI.showSettings(); return; }
      const ctl = el.getAttribute('data-ctl');
      if (ctl) {
        UI.controls = ctl;
        localStorage.setItem('ashfall.controls', ctl);
        UI.applyControls();
        UI.showSettings();
      }
    };
  };

  function loadSettings() {
    const saved = localStorage.getItem('ashfall.controls');
    if (saved) UI.controls = saved;
    UI.applyControls();
  }

  UI.applyControls = function () {
    const touch = UI.controls === 'touch' || (UI.controls === 'auto' && ('ontouchstart' in window));
    document.body.classList.toggle('touch', touch);
    $('joystick').classList.toggle('hidden', !touch);
  };

  /* ---------------- 触屏摇杆 ---------------- */
  function bindTouch() {
    const stick = $('joystick');
    const knob = $('knob');
    let startX = 0, startY = 0, cx = 0, cy = 0;

    function start(ev) {
      const t = ev.changedTouches ? ev.changedTouches[0] : ev;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      startX = t.clientX; startY = t.clientY;
      UI.touch.active = true;
      stick.classList.add('on');
      ev.preventDefault();
    }
    function move(ev) {
      if (!UI.touch.active) return;
      const t = ev.changedTouches ? ev.changedTouches[0] : ev;
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const max = 46;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      UI.touch.dx = dx / max;
      UI.touch.dy = dy / max;
      ev.preventDefault();
    }
    function end(ev) {
      UI.touch.active = false;
      UI.touch.dx = 0; UI.touch.dy = 0;
      knob.style.transform = 'translate(0,0)';
      stick.classList.remove('on');
      if (ev) ev.preventDefault();
    }

    if (window.PointerEvent) {
      stick.addEventListener('pointerdown', function (e) { start(e); stick.setPointerCapture(e.pointerId); });
      stick.addEventListener('pointermove', move);
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    } else {
      stick.addEventListener('touchstart', start, { passive: false });
      stick.addEventListener('touchmove', move, { passive: false });
      stick.addEventListener('touchend', end, { passive: false });
    }
  }

  UI.touchVector = function () {
    if (!UI.touch.active) return null;
    return { mx: UI.touch.dx, my: UI.touch.dy };
  };

  /* ---------------- 结算 ---------------- */
  UI.showEnd = function (st, onRestart, reward) {
    const m = Math.floor(st.t / 60), s = Math.floor(st.t % 60);
    let html = '<div class="endbox">';
    html += '<h2 class="dead">你已陨落</h2>';
    html += '<div class="msub">灰烬吞没了你</div>';
    html += '<div class="stats">' +
      '<div class="s"><div class="n">' + st.cycle + '</div><div class="l">层数</div></div>' +
      '<div class="s"><div class="n">' + m + ':' + (s < 10 ? '0' : '') + s + '</div><div class="l">总时长</div></div>' +
      '<div class="s"><div class="n">' + st.kills + '</div><div class="l">击杀</div></div>' +
      '<div class="s"><div class="n">' + st.player.level + '</div><div class="l">等级</div></div>' +
      '</div>';
    if (reward) html += '<div class="msub" style="color:#e0c060;margin-top:10px">获得深渊精华 +' + reward.gain + '</div>';
    html += '<div class="mfoot" style="justify-content:center"><button class="btn primary" data-restart="1">再来一局 (R)</button></div>';
    html += '</div>';
    openModal(html);
    $('modalbox').onclick = function (ev) {
      let el = ev.target;
      while (el && el !== $('modalbox') && !el.getAttribute('data-restart')) el = el.parentNode;
      if (el && el !== $('modalbox')) onRestart();
    };
    UI._restart = onRestart;
  };

  /* ---------------- 键盘 ---------------- */
  function bindKeys() {
    window.addEventListener('keydown', function (ev) {
      const k = ev.key.toLowerCase();
      if (UI._restart && (k === 'r')) { UI._restart(); return; }
      if (UI.isOpen()) {
        if (k === 'escape') UI.close();
        if (k === 'p' && UI.mode === 'open') UI.close();
        return;
      }
      if (k === 'p') { UI.showTalent(UI.st); ev.preventDefault(); }
      if (k === 'tab') { UI.showBag(UI.st); ev.preventDefault(); }
      if (k === 't') { UI.showSettings(); ev.preventDefault(); }
    });
  }

  UI.toast = function (text, kind) {
    const wrap = $('toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .4s';
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    }, 1500);
  };
  /* ---------------- 赌徒 ---------------- */
  UI.showGambler = function (st) {
    const p = st.player;
    const ilvl = 10 + st.cycle * 2;
    const price = D.PRICES.gamble(ilvl);
    let html = '<div class="mtitle">赌徒 维奇</div>';
    html += '<div class="msub">金币 ' + coin(p.gold) + ' · 每件 ' + coin(price) + ' · ilvl ' + ilvl + ' 稀有</div>';
    html += '<div class="sect">选一个部位</div>';
    html += '<div class="opts">';
    for (let i = 0; i < D.SLOTS.length; i++) {
      const sl = D.SLOTS[i];
      html += '<button class="opt" data-slot="' + sl + '">' + D.SLOT_CN[sl] + '</button>';
    }
    html += '</div>';
    html += '<div class="note">只保证稀有度，不保证词缀。金币在这里才有去处。</div>';
    html += '<div class="mfoot"><button class="btn" data-close="1">关闭 (E)</button></div>';
    openModal(html);

    $('modalbox').onclick = function (ev) {
      const el = pickRow(ev);
      if (!el) return;
      if (el.getAttribute('data-close')) { UI.close(); return; }
      const slot = el.getAttribute('data-slot');
      if (!slot) return;
      const r = ACT.run(st, 'gamble', [slot]);
      if (r && r.ok) {
        UI.toast('获得 ' + r.item.name + '（-' + r.cost + ' 金币）', 'rare');
        UI.playSfx('buy');
        UI.showGambler(st);
      } else if (r) {
        UI.toast(r.msg || '失败', 'bad');
      } else {
        UI.toast('已下单，等待房主结算', 'good');
        UI.close();
      }
    };
  };

  UI.playSfx = function (name) {
    if (root.AUDIO) root.AUDIO.play(name);
  };
  /* ---------------- 选择职业 ---------------- */
  UI.showClasses = function (onPick) {
    let html = '<div class="mtitle">选择你的流亡者</div>';
    html += '<div class="msub">每个人的起始技能与体格都不同</div>';
    html += '<div class="riftcards">';
    for (let i = 0; i < D.CLASSES.length; i++) {
      const c = D.CLASSES[i];
      const sk = D.SKILLS[c.skill];
      html += '<div class="riftcard" data-cls="' + i + '">' +
        '<div class="rn" style="color:' + c.color + '">' + c.name + '</div>' +
        '<div class="rd">' + c.desc + '<br><span style="color:#6f7a90">起始 · ' + (sk ? sk.name : c.skill) + '</span></div>' +
        '<div class="rk">按 ' + (i + 1) + ' 选择</div></div>';
    }
    html += '</div>';
    openModal(html, 'wide');
    $('modalbox').onclick = function (ev) {
      let el = ev.target;
      const box = $('modalbox');
      while (el && el !== box && el.getAttribute('data-cls') === null) el = el.parentNode;
      if (!el || el === box) return;
      UI.close();
      if (onPick) onPick(parseInt(el.getAttribute('data-cls'), 10));
    };
  };

  /* ---------------- 新手引导 ---------------- */
  UI.showTutorial = function (onDone) {
    let html = '<div class="mtitle">灰烬降临</div>';
    html += '<div class="msub">你在一座被遗忘的主城醒来，脚下是通往深渊的裂隙。</div>';
    html += '<div class="tut">';
    html += '<div class="trow"><b>移动</b><span>WASD / 方向键；触屏用左下摇杆</span></div>';
    html += '<div class="trow"><b>战斗</b><span>技能自动索敌释放，你只负责走位</span></div>';
    html += '<div class="trow"><b>裂隙</b><span>每层开始前选一张卡，它会改变整层的规则</span></div>';
    html += '<div class="trow"><b>主城</b><span>每 3 分钟回城 1 分钟：买、造、赌、存</span></div>';
    html += '<div class="trow"><b>成长</b><span>P 天赋树 · TAB 背包 · 祭坛用精华买永久加成</span></div>';
    html += '<div class="trow"><b>狂潮</b><span>连杀不受伤会攒满，触发后攻速移速暴涨</span></div>';
    html += '</div>';
    html += '<div class="mfoot" style="justify-content:center"><button class="btn primary" data-go="1">开始</button></div>';
    openModal(html, 'wide');
    $('modalbox').onclick = function (ev) {
      let el = ev.target;
      const box = $('modalbox');
      while (el && el !== box && !el.getAttribute('data-go')) el = el.parentNode;
      if (!el || el === box) return;
      UI.close();
      try { localStorage.setItem('ashfall.tutorial', '1'); } catch (e) {}
      if (onDone) onDone();
    };
  };

  /* ---------------- 变数：局内 3 选 1 ---------------- */
  UI.showRogue = function (st, onPick) {
    const p = st.player;
    const picks = p.rogueChoices;
    if (!picks) return;
    let html = '<div class="mtitle">变数</div>';
    html += '<div class="msub">每级三选一，波次结束全部重置 —— 选错就是这一轮的下限</div>';
    html += '<div class="riftcards">';
    for (let i = 0; i < picks.length; i++) {
      let up = null;
      for (let k = 0; k < D.ROGUE_UPGRADES.length; k++) if (D.ROGUE_UPGRADES[k].id === picks[i]) up = D.ROGUE_UPGRADES[k];
      if (!up) continue;
      html += '<div class="riftcard" data-rg="' + i + '">' +
        '<div class="rn" style="color:' + up.color + '">' + up.name + '</div>' +
        '<div class="rd">' + up.desc + '</div>' +
        '<div class="rk">按 ' + (i + 1) + ' 选择</div></div>';
    }
    html += '</div>';
    openModal(html, 'wide');
    $('modalbox').onclick = function (ev) {
      let el = ev.target;
      const box = $('modalbox');
      while (el && el !== box && el.getAttribute('data-rg') === null) el = el.parentNode;
      if (!el || el === box) return;
      UI.close();
      if (onPick) onPick(parseInt(el.getAttribute('data-rg'), 10));
    };
  };

  /* ---------------- 技能面板（辅助插槽） ---------------- */
  UI.showSkills = function (st) {
    const p = st.player;
    function render() {
      let html = '<div class="mtitle">技能</div>';
      html += '<div class="msub">按 <b>1 / 2 / 3</b> 手动施放；插「触媒·自动」后自动释放。每技能最多 3 个辅助。</div>';
      for (let si = 0; si < 3; si++) {
        const s = p.skills[si];
        if (!s) {
          html += '<div class="sect">技能栏 ' + (si + 1) + '</div><div class="empty">空</div>';
          continue;
        }
        const def = D.SKILLS[s.id];
        const sup = (p.supports && p.supports[s.id]) || [];
        const auto = root.SIM.autoCast(p, s.id);
        html += '<div class="sect">技能栏 ' + (si + 1) + ' · ' + def.name + ' Lv' + s.rank +
          '<span style="color:' + (auto ? '#6fdc8f' : '#6f7a90') + ';font-size:10px"> · ' + (auto ? '自动释放' : '手动释放') + '</span></div>';
        html += '<div class="opts">';
        for (let k = 0; k < D.SUPPORTS.length; k++) {
          const sp = D.SUPPORTS[k];
          const on = sup.indexOf(sp.id) >= 0;
          html += '<button class="opt' + (on ? ' on' : '') + '" data-sup="' + s.id + '|' + sp.id + '" title="' + sp.desc + '">' + sp.name + '</button>';
        }
        html += '</div>';
      }
      html += '<div class="note">' + D.SUPPORTS.map(function (x) { return '<b>' + x.name + '</b> ' + x.desc; }).join('<br>') + '</div>';
      html += '<div class="mfoot"><button class="btn primary" data-close="1">关闭</button></div>';
      openModal(html, 'wide');
      $('modalbox').onclick = function (ev) {
        let el = ev.target;
        const box = $('modalbox');
        while (el && el !== box && !el.getAttribute('data-sup') && !el.getAttribute('data-close')) el = el.parentNode;
        if (!el || el === box) return;
        if (el.getAttribute('data-close')) { UI.close(); return; }
        const parts = el.getAttribute('data-sup').split('|');
        const r = ACT.run(st, 'support', [parts[0], parts[1]]);
        if (r && r.ok) UI.playSfx('ui');
        else if (r) UI.toast(r.msg, 'bad');
        render();
      };
    }
    render();
  };

  /* ---------------- 技能符文 ---------------- */
  UI.showRunes = function (st) {
    const p = st.player;
    function render() {
      let html = '<div class="mtitle">技能符文</div>';
      html += '<div class="msub">材料 <b class="gold">' + (p.mats || 0) + '</b> · 首次解锁需要材料，之后可自由切换</div>';
      if (!p.skills.length) html += '<div class="empty">还没学会任何技能</div>';
      for (let si = 0; si < p.skills.length; si++) {
        const s = p.skills[si];
        const def = D.SKILLS[s.id];
        if (!def) continue;
        const cur = (p.runeOf && p.runeOf[s.id]) || null;
        html += '<div class="sect" style="color:' + (def.color || '#cfd8e8') + '">' + def.name + ' Lv' + s.rank +
          '<span style="color:#6f7a90;font-size:10px"> · ' + (cur ? '已装备符文' : '无符文') + '</span></div>';
        html += '<div class="opts">';
        html += '<button class="opt' + (!cur ? ' on' : '') + '" data-rune="' + s.id + '|">无</button>';
        for (let ri = 0; ri < def.runes.length; ri++) {
          const r = def.runes[ri];
          const key = s.id + ':' + r.id;
          const unlocked = p.runeUnlocked && p.runeUnlocked[key];
          const on = cur === r.id;
          html += '<button class="opt' + (on ? ' on' : '') + '" data-rune="' + s.id + '|' + r.id + '" title="' + r.desc + '">' +
            r.name + (unlocked ? '' : ' <span style="color:#e0c060">' + r.cost + '</span>') + '</button>';
        }
        html += '</div>';
        html += '<div class="note" style="margin:2px 0 10px">';
        for (let ri = 0; ri < def.runes.length; ri++) html += def.runes[ri].name + '：' + def.runes[ri].desc + '<br>';
        html += '</div>';
      }
      html += '<div class="mfoot"><button class="btn primary" data-close="1">关闭</button></div>';
      openModal(html, 'wide');
      $('modalbox').onclick = function (ev) {
        let el = ev.target;
        const box = $('modalbox');
        while (el && el !== box && !el.getAttribute('data-rune') && !el.getAttribute('data-close')) el = el.parentNode;
        if (!el || el === box) return;
        if (el.getAttribute('data-close')) { UI.close(); return; }
        const parts = el.getAttribute('data-rune').split('|');
        const r = ACT.run(st, 'rune', [parts[0], parts[1] || null]);
        if (r && r.ok) {
          UI.playSfx('craft');
          UI.toast(r.cost ? '解锁符文 -' + r.cost + ' 材料' : '已切换符文', 'good');
        } else if (r) UI.toast(r.msg, 'bad');
        render();
      };
    }
    render();
  };

  /* ---------------- 深渊祭坛 ---------------- */
  UI.showAltar = function () {
    const M = root.META;
    if (!M) { UI.toast('没有存档'); return; }
    function render() {
      let html = '<div class="mtitle">深渊祭坛</div>';
      html += '<div class="msub">精华 <b class="gold">' + M.essence + '</b> · 永久生效，跨局保留' +
        ' · 已跑 ' + M.runs + ' 局 · 最深第 ' + M.best.depth + ' 层</div>';
      html += '<div class="altarlist">';
      for (let i = 0; i < M.ALTAR.length; i++) {
        const a = M.ALTAR[i];
        const lv = M.level(a.id);
        const cost = M.costOf(a.id);
        const maxed = cost === null;
        const can = !maxed && M.essence >= cost;
        html += '<div class="altar-row' + (maxed ? ' maxed' : '') + (can ? ' can' : '') + '" data-id="' + a.id + '">' +
          '<span class="an">' + a.name + '</span>' +
          '<span class="ad">' + a.desc + '</span>' +
          '<span class="al">' + lv + '/' + a.max + '</span>' +
          '<span class="ac">' + (maxed ? '已满' : cost + ' ◆') + '</span></div>';
      }
      html += '</div>';
      html += '<div class="note">精华在每局结束时结算：层数 ×12 + 击杀/80 + 首领 ×25。</div>';
      const dk = M.dailyKey();
      const dr = M.dailyRecord();
      html += '<div class="note">今日裂隙 ' + dk + (dr ? ' · 最好成绩 第 ' + dr.depth + ' 层（' + dr.kills + ' 杀）' : ' · 还没打过') + '</div>';
      html += '<div class="mfoot"><button class="btn" data-daily="1">今日裂隙</button><button class="btn primary" data-close="1">关闭</button></div>';
      openModal(html, 'wide');
      $('modalbox').onclick = function (ev) {
        let el = ev.target;
        const box = $('modalbox');
        while (el && el !== box && !el.getAttribute('data-id') && !el.getAttribute('data-close')) el = el.parentNode;
        if (!el || el === box) return;
        if (el.getAttribute('data-close')) { UI.close(); return; }
      if (el.getAttribute('data-tab')) { UI.talentTab = el.getAttribute('data-tab'); render(); return; }
        if (el.getAttribute('data-daily')) { location.href = location.pathname + '?daily=1'; return; }
        if (M.buy(el.getAttribute('data-id'))) { UI.playSfx('craft'); render(); }
        else UI.toast('精华不足', 'bad');
      };
    }
    render();
  };

  /* ---------------- 深渊裂隙 ---------------- */
  UI.showRift = function (st, choices, onPick) {
    let html = '<div class="mtitle">深渊裂隙</div>';
    html += '<div class="msub">选择下一层的规则 —— 风险越大，回报越高</div>';
    html += '<div class="riftcards">';
    for (let i = 0; i < choices.length; i++) {
      const r = choices[i];
      html += '<div class="riftcard" data-i="' + i + '">' +
        '<div class="rn" style="color:' + r.color + '">' + r.name + '</div>' +
        '<div class="rd">' + r.desc + '</div>' +
        '<div class="rk">按 ' + (i + 1) + ' 进入</div></div>';
    }
    html += '</div>';
    openModal(html, 'wide');
    $('modalbox').onclick = function (ev) {
      let el = ev.target;
      const box = $('modalbox');
      while (el && el !== box && el.getAttribute('data-i') === null) el = el.parentNode;
      if (!el || el === box) return;
      onPick(parseInt(el.getAttribute('data-i'), 10));
    };
  };

  /* ---------------- 联机大厅 ---------------- */
  UI.showLobby = function (sub, room) {
    $('lobby').classList.remove('hidden');
    $('lobby-sub').textContent = sub || '';
    $('lobby-room').textContent = room ? ('房间 ' + room) : '';
    $('lobby-copy').onclick = function () {
      const url = root.NET.roomLink(root.NET.isHost);
      try { navigator.clipboard.writeText(url); UI.toast('邀请链接已复制'); }
      catch (e) { window.prompt('复制链接', url); }
    };
    $('lobby-start').onclick = function () {
      if (!root.NET.isHost) { UI.toast('只有房主能开始', 'bad'); return; }
      UI.hideLobby();
    };
  };
  UI.updateLobby = function (players, myId) {
    const lw = $('lobby-players');
    if (lw) {
      lw.innerHTML = players.map(function (p) {
        return '<div class="lp' + (p.id === myId ? ' me' : '') + '">' +
          (p.id === 0 ? '★ ' : '') + p.name + '</div>';
      }).join('');
    }
    const tw = $('party');
    if (tw) {
      if (players.length <= 1) { tw.innerHTML = ''; return; }
      tw.innerHTML = players.map(function (p) {
        return '<div class="pm' + (p.id === myId ? ' me' : '') + '">' + p.name + '</div>';
      }).join('');
    }
  };
  UI.hideLobby = function () { $('lobby').classList.add('hidden'); };
})(window);
