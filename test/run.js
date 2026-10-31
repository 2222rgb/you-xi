const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));

const E = global.ENGINE;
const D = global.DATA;
let pass = 0;
const res = E.selfTest();
for (const r of res) {
  if (r.pass) pass++;
  console.log((r.pass ? '  PASS  ' : '  FAIL  ') + r.name + '   ' + (r.detail || ''));
}
// 异常增伤词缀进入聚合
const itA = { slot: 'ring', ilvl: 10, rarity: 2, plus: 0, name: 'T', mods: [{ k: 'ampAil', v: 0.25 }, { k: 'shockChance', v: 0.4 }] };
const aggA = E.buildAgg({ ring: itA });
const okA = Math.abs(aggA.ampAil - 0.25) < 1e-9 && Math.abs(aggA.shockChance - 0.4) < 1e-9;
console.log((okA ? '  PASS  ' : '  FAIL  ') + '异常增伤词缀进入聚合   ampAil=' + aggA.ampAil + ' shock=' + aggA.shockChance);
if (okA) pass++;
const total = res.length + 2;

// 元素反应表完整性
const R = D.REACTIONS || [];
const okR = R.length >= 6 && R.every(function (r) { return r.a && r.b && r.name && r.mult > 1; });
console.log((okR ? '  PASS  ' : '  FAIL  ') + '元素反应表完整   ' + R.length + ' 条');
if (okR) pass++;

console.log('\n' + pass + '/' + total + ' passed');

/* ---- 数值曲线体检 ---- */
console.log('\n--- 技能 DPS 随等级（无装备） ---');
for (const id of D.SKILL_IDS) {
  const row = [1, 3, 5].map(l => Math.round(E.computeSkill(id, l, E.emptyAgg()).dps));
  console.log('  ' + D.SKILLS[id].name.padEnd(4) + '  Lv1 ' + String(row[0]).padStart(4) + '  Lv3 ' + String(row[1]).padStart(4) + '  Lv5 ' + String(row[2]).padStart(4));
}

console.log('\n--- 装备成长模拟（3 件稀有，ilvl 递增）---');
const rng = E.mulberry32(7);
for (const ilvl of [1, 6, 11, 16]) {
  const gear = {
    helm: E.rollItem('helm', ilvl, rng, 2),
    ring: E.rollItem('ring', ilvl, rng, 2),
    amulet: E.rollItem('amulet', ilvl, rng, 2)
  };
  const agg = E.gearAgg(gear);
  const d = E.computeSkill('fireball', Math.min(5, 1 + Math.floor(ilvl / 4)), agg);
  console.log('  ilvl ' + String(ilvl).padStart(2) + '  DPS ' + String(Math.round(d.dps)).padStart(5) +
    '   +生命 ' + Math.round(agg.life) + '   暴击 ' + (d.crit * 100).toFixed(0) + '%');
}

console.log('\n--- 敌人血量 vs 时间 ---');
for (const t of [0, 120, 240, 360, 480]) {
  const s = E.enemyStats('slime', t);
  const b = E.enemyStats('brute', t);
  console.log('  ' + String(t).padStart(3) + 's  腐质 ' + String(s.hp).padStart(4) + '  巨兽 ' + String(b.hp).padStart(4) + '  首领 ' + E.enemyStats('boss', t).hp);
}

process.exit(pass === total ? 0 : 1);
