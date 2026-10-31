/* 用机器人跑完整循环（战斗 180s → 主城 60s），量化成长与难度 */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));

const SIM = global.SIM, D = global.DATA, E = global.ENGINE;
const STEP = 1 / 60;

function botStep(st, tt) {
  if (st.phase === 'town') return { mx: 0, my: 0 };
  const p = st.player;
  let fx = 0, fy = 0;
  for (const e of st.enemies) {
    if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 44 && d > 0.01) {
      const w = (44 - d) / 44;
      fx += (dx / d) * w * 1.6;
      fy += (dy / d) * w * 1.6;
    }
  }
  let best = null, bd = 240 * 240;
  for (const pk of st.pickups) {
    if (pk.kind !== 'gold' && pk.kind !== 'heal' && pk.kind !== 'gem') continue;
    const d = (pk.x - p.x) * (pk.x - p.x) + (pk.y - p.y) * (pk.y - p.y);
    if (d < bd) { bd = d; best = pk; }
  }
  if (best) {
    const dx = best.x - p.x, dy = best.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    fx += (dx / d) * 1.3;
    fy += (dy / d) * 1.3;
  }
  fx += Math.cos(tt * 0.5) * 0.3;
  fy += Math.sin(tt * 0.5) * 0.3;
  const world = D.CONFIG.worldSize;
  if (p.x < 160) fx += 1.2;
  if (p.x > world - 160) fx -= 1.2;
  if (p.y < 160) fy += 1.2;
  if (p.y > world - 160) fy -= 1.2;
  const len = Math.hypot(fx, fy);
  if (len > 0.001) { fx /= len; fy /= len; }
  return { mx: fx, my: fy };
}

// 自动加点：优先新技能 > 关键 > 被动
function autoTalent(st) {
  const p = st.player;
  let guard = 0;
  while (p.talentPoints > 0 && guard++ < 80) {
    let best = null;
    for (const tree of D.TREES) {
      const spent = p.treeSpent[tree.id] || 0;
      for (const n of tree.nodes) {
        const rank = p.talents[n.id] || 0;
        if (rank >= n.max) continue;
        if (spent < D.TIER_GATE[n.tier]) continue;
        if (n.kind === 'active' && rank === 0 && p.skills.length >= 3) continue;
        const pri = (n.kind === 'active' && rank === 0) ? 3 : (n.kind === 'keystone' ? 2 : 1);
        if (!best || pri > best.pri) best = { id: n.id, pri: pri };
      }
    }
    if (!best) break;
    if (!SIM.allocate(st, best.id)) break;
  }
}

// 主城：买 → 换 → 卖
function autoShop(st) {
  const p = st.player;
  const price = (it) => Math.round(E.itemPrice(it) * D.PRICES.buyMul);
  for (let i = st.shop.length - 1; i >= 0; i--) {
    if (st.player.bag.length >= 8) break;
    if (p.gold >= price(st.shop[i])) SIM.buyItem(st, i);
  }
  let curDps = 0;
  for (const s of p.skills) { const c = st.skills[s.id]; if (c) curDps += c.dps; }
  for (let i = st.player.bag.length - 1; i >= 0; i--) {
    const it = st.player.bag[i];
    const pv = SIM.previewEquip(st, it);
    const better = !st.player.gear[it.slot] || pv.dps > curDps * 1.02 || (pv.dps >= curDps && pv.hp > p.maxHp + 20);
    if (better) {
      st.player.bag.splice(i, 1);
      SIM.equip(st, it);
      curDps = pv.dps;
    }
  }
  while (st.player.bag.length > 4) SIM.sellItem(st, 0);
  while (p.gold > 3000 && p.potions < 8) SIM.buyPotion(st);
}

function run(seed, seconds, verbose) {
  const st = SIM.create(seed);
  const marks = [];
  let lastCycle = 0;
  for (let i = 0; i < 60 * seconds; i++) {
    if (st.phase === 'dead') break;
    if (st.phase === 'rift') { SIM.chooseRift(st, 0); continue; }
    if (st.phase === 'combat' && st.players[0] && st.players[0].bag.length < 20) {
      const g = SIM.nearestGroundItem(st, st.players[0].x, st.players[0].y, 34);
      if (g) SIM.takeItem(st, st.players[0]);
    }
    for (let ci = 0; ci < st.players[0].skills.length; ci++) SIM.castSkill(st, ci, st.players[0]);
    SIM.step(st, STEP, botStep(st, i / 60));
    if (st.player.talentPoints > 0) autoTalent(st);
    // 主城自动：买装备 + 卖垃圾 + 补药水
    if (st.phase === 'town' && st.phaseT < 0.1) autoShop(st);
    if (st.phase === 'town' && st.player.gold >= D.PRICES.potion && st.player.potions < 5) {
      SIM.buyPotion(st);
    }
    if (st.cycle !== lastCycle && st.phase === 'combat') {
      lastCycle = st.cycle;
      let dps = 0;
      for (const s of st.player.skills) { const c = st.skills[s.id]; if (c) dps += c.dps; }
      marks.push({
        c: st.cycle, t: Math.round(st.t), lv: st.player.level,
        hp: Math.round(st.player.hp) + '/' + st.player.maxHp,
        dps: Math.round(dps), gold: st.player.gold, kills: st.kills,
        tal: Object.keys(st.player.talents).reduce(function (a, k) { return a + st.player.talents[k]; }, 0)
      });
    }
  }
  if (verbose) {
    console.log('seed ' + seed + (st.phase === 'dead' ? '  ✝ 死于第 ' + st.cycle + ' 层 (' + Math.round(st.t) + 's)' : '  存活 ' + seconds + 's'));
    for (const m of marks) {
      console.log('  第' + String(m.c).padStart(2) + '层  Lv' + String(m.lv).padStart(2) +
        '  HP ' + m.hp.padEnd(9) + ' DPS ' + String(m.dps).padStart(5) +
        '  天赋 ' + String(m.tal).padStart(2) + '  金币 ' + String(m.gold).padStart(5) +
        '  击杀 ' + m.kills);
    }
  }
  return { cycle: st.cycle, t: st.t, kills: st.kills, level: st.player.level, dead: st.phase === 'dead' };
}

console.log('=== 单种子详表（30 分钟）===');
run(12345, 1800, true);

console.log('\n=== 20 种子统计（30 分钟）===');
let dead = 0, sumC = 0, sumK = 0, sumL = 0;
for (let s = 1; s <= 20; s++) {
  const r = run(s * 7919, 1800, false);
  if (r.dead) dead++;
  sumC += r.cycle; sumK += r.kills; sumL += r.level;
}
console.log('死亡 ' + dead + '/20   平均到达第 ' + (sumC / 20).toFixed(1) + ' 层   平均击杀 ' +
  (sumK / 20).toFixed(0) + '   平均等级 ' + (sumL / 20).toFixed(1));
