/* 用「会捡经验、会贴身打」的机器人跑完整一局 */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));

const SIM = global.SIM, D = global.DATA;
const STEP = 1 / 60;

function botStep(st, tt) {
  const p = st.player;
  let fx = 0, fy = 0;

  // 远离贴身敌人
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

  // 吸经验
  let best = null, bd = 240 * 240;
  for (const pk of st.pickups) {
    if (pk.kind !== 'xp' && pk.kind !== 'heal') continue;
    const d = (pk.x - p.x) * (pk.x - p.x) + (pk.y - p.y) * (pk.y - p.y);
    if (d < bd) { bd = d; best = pk; }
  }
  if (best) {
    const dx = best.x - p.x, dy = best.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    fx += (dx / d) * 1.3;
    fy += (dy / d) * 1.3;
  }

  // 轻微绕圈，避免站死
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

function run(seed, verbose) {
  const st = SIM.create(seed);
  const marks = [];
  for (let i = 0; i < 60 * 700; i++) {
    if (st.phase === 'levelup') {
      const ch = SIM.rollChoices(st);
      if (ch.length) SIM.applyChoice(st, ch[0]); else st.phase = 'run';
      continue;
    }
    if (st.phase !== 'run') break;
    SIM.step(st, STEP, botStep(st, i / 60));
    if (i % (60 * 60) === 0) {
      let dps = 0;
      for (const s of st.player.skills) { const c = st.skills[s.id]; if (c) dps += c.dps; }
      marks.push({
        t: Math.round(st.t), lv: st.player.level,
        hp: Math.round(st.player.hp) + '/' + st.player.maxHp,
        enemies: st.enemies.length, kills: st.kills, dps: Math.round(dps),
        skills: st.player.skills.map(s => s.id + s.level).join(' ')
      });
    }
  }
  if (verbose) {
    const st2 = st.phase === 'win' ? '★ 通关' : (st.phase === 'dead' ? '✝ 死于 ' + st.t.toFixed(0) + 's' : '未结束');
    console.log('seed ' + seed + '  ' + st2);
    for (const m of marks) {
      console.log('  ' + String(m.t).padStart(3) + 's Lv' + String(m.lv).padStart(2) +
        '  HP ' + m.hp.padEnd(9) + ' 敌 ' + String(m.enemies).padStart(3) +
        ' 杀 ' + String(m.kills).padStart(4) + ' DPS ' + String(m.dps).padStart(5) +
        '  [' + m.skills + ']');
    }
  }
  return { phase: st.phase, t: st.t, kills: st.kills, level: st.player.level };
}

console.log('=== 单个种子详表 ===');
run(12345, true);

console.log('\n=== 20 个种子统计 ===');
let win = 0, die = 0, sumT = 0, sumK = 0, sumL = 0;
for (let s = 1; s <= 20; s++) {
  const r = run(s * 7919, false);
  if (r.phase === 'win') win++;
  if (r.phase === 'dead') die++;
  sumT += r.t; sumK += r.kills; sumL += r.level;
}
console.log('通关 ' + win + '/20   死亡 ' + die + '/20   平均时长 ' + (sumT / 20).toFixed(0) +
  's   平均击杀 ' + (sumK / 20).toFixed(0) + '   平均等级 ' + (sumL / 20).toFixed(1));
