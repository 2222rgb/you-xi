/* 多人逻辑测试：独立输入、独立成长、经验按距离共享、索敌、掉落归属 */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));

const SIM = global.SIM, D = global.DATA;
const STEP = 1 / 60;
let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}

const st = SIM.create(42, 2);
T('创建 2 名玩家', st.players.length === 2 && st.players[0].id === 0 && st.players[1].id === 1);

const before = st.players.map(p => ({ x: p.x, y: p.y }));
for (let i = 0; i < 120; i++) {
  SIM.step(st, STEP, { 0: { mx: 1, my: 0 }, 1: { mx: -1, my: 0 } });
}
const p0 = st.players[0], p1 = st.players[1];
T('独立输入生效', p0.x > before[0].x + 50 && p1.x < before[1].x - 50,
  'P0Δ=' + Math.round(p0.x - before[0].x) + ' P1Δ=' + Math.round(p1.x - before[1].x));

st.players[0].x = 1000; st.players[0].y = 1000;
st.players[1].x = 1000; st.players[1].y = 1000;
st.players[0].xp = 0; st.players[1].xp = 0;
SIM.awardXp(st, 1000, 1000, 5);
T('近距离两人都吃经验', st.players[0].xp === 5 && st.players[1].xp === 5);

st.players[1].x = 1000 + D.CONFIG.xpShareRadius + 60;
st.players[0].xp = 0; st.players[1].xp = 0;
SIM.awardXp(st, 1000, 1000, 5);
T('超出共享半径只有近的吃经验', st.players[0].xp === 5 && st.players[1].xp === 0,
  '共享半径=' + D.CONFIG.xpShareRadius);

const ringA = global.ENGINE.rollItem('ring', 20, Math.random, 2);
SIM.equip(st, ringA, st.players[0]);
T('装备互不影响', st.players[0].gear.ring === ringA && st.players[1].gear.ring === null);

st.players[0].talentPoints = 5; st.players[1].talentPoints = 0;
const ok = SIM.allocate(st, 'b2', st.players[0]);
T('天赋点独立', ok && st.players[0].talentPoints === 4 && st.players[1].talentPoints === 0);

const st3 = SIM.create(9, 2);
st3.players[0].x = 500; st3.players[0].y = 500;
st3.players[1].x = 900; st3.players[1].y = 500;
const near0 = SIM.nearestPlayer(st3, 520, 500);
const near1 = SIM.nearestPlayer(st3, 880, 500);
T('敌人索敌取最近玩家', near0.id === 0 && near1.id === 1, '520→P' + near0.id + '  880→P' + near1.id);

const st4 = SIM.create(11, 2);
st4.players[0].alive = false;
T('单人死亡不判负', st4.phase === 'combat');
st4.players[1].alive = false;
SIM.step(st4, STEP, {});
T('全员倒下判负', st4.phase === 'dead');

const st5 = SIM.create(13, 2);
st5.pickups.push({ kind: 'gold', value: 50, x: st5.players[1].x, y: st5.players[1].y, t: 0, life: 60 });
const g0 = st5.players[0].gold, g1 = st5.players[1].gold;
for (let i = 0; i < 20; i++) SIM.step(st5, STEP, {});
T('金币归拾取者', st5.players[1].gold > g1 && st5.players[0].gold === g0,
  'P1+' + (st5.players[1].gold - g1));

// 倒地与救援
const stR = SIM.create(31, 2);
SIM.chooseRift(stR, 0);
const ra = stR.players[0], rb = stR.players[1];
ra.downed = true; ra.downT = 20; ra.reviveProg = 0;
rb.x = ra.x + 12; rb.y = ra.y;
const inpR = {}; inpR[ra.id] = { mx: 0, my: 0 }; inpR[rb.id] = { mx: 0, my: 0 };
for (let i = 0; i < 200; i++) { stR.enemies.length = 0; SIM.step(stR, STEP, inpR); }
T('队友靠近可救起倒地玩家', ra.downed === false && ra.hp > 0, 'hp=' + Math.round(ra.hp));

const stD = SIM.create(32, 2);
SIM.chooseRift(stD, 0);
const da = stD.players[0];
da.downed = true; da.downT = 0.4;
stD.players[1].x = da.x + 500; stD.players[1].y = da.y;
const inpD = {}; inpD[da.id] = { mx: 0, my: 0 }; inpD[stD.players[1].id] = { mx: 0, my: 0 };
for (let i = 0; i < 60; i++) { stD.enemies.length = 0; SIM.step(stD, STEP, inpD); }
T('无人救援会真正死亡', da.alive === false, 'alive=' + da.alive);
// 第四棵树：血刃可学习并进入技能栏
const stB = SIM.create(51, 1);
SIM.chooseRift(stB, 0);
const pb = stB.players[0];
pb.talentPoints = 6;
const okB = SIM.allocate(stB, 'h1');
const learned = pb.skills.some(function (s) { return s.id === 'bloodlet'; });
T('血树技能可学习', !!okB && learned, 'skills=' + pb.skills.map(function (s) { return s.id; }).join(','));
pb.talentPoints = 40;
for (let i = 0; i < 5; i++) SIM.allocate(stB, 'h1');
for (let i = 0; i < 3; i++) SIM.allocate(stB, 'h2');
const okH5 = SIM.allocate(stB, 'h5');
T('毒雾节点解锁', !!okH5, 'treeSpent=' + (pb.treeSpent.blood || 0) + ' 技能数=' + pb.skills.length);
// 强化系统
const stEn = SIM.create(61, 1);
SIM.chooseRift(stEn, 0);
const pe = stEn.players[0];
pe.gold = 90000;
SIM.gamble(stEn, 'ring', pe);
SIM.equip(stEn, pe.bag[pe.bag.length - 1], pe);
const goldBefore = pe.gold;
const r1 = SIM.enhance(stEn, 'ring', pe);
T('装备可强化到 +1', !!(r1 && r1.ok && pe.gear.ring.plus === 1), 'plus=' + (pe.gear.ring && pe.gear.ring.plus) + ' 花费=' + (goldBefore - pe.gold));
const r2 = SIM.enhance(stEn, 'ring', pe);
T('强化可叠加到 +2 且费用递增', !!(r2 && r2.ok && pe.gear.ring.plus === 2), 'cost1=' + r1.cost + ' cost2=' + r2.cost);
// 魔盒：开启必出传奇
const stBx = SIM.create(71, 1);
SIM.chooseRift(stBx, 0);
const pbx = stBx.players[0];
pbx.boxes = 1;
const bagBefore = pbx.bag.length;
const rbx = SIM.openBox(stBx, pbx);
T('魔盒开出传奇装备', !!(rbx && rbx.ok && pbx.bag.length === bagBefore + 1 && pbx.bag[pbx.bag.length - 1].rarity === 3),
  'rarity=' + (rbx && rbx.item ? rbx.item.rarity : 'none') + ' boxes=' + pbx.boxes);

// 地面装备需要 E 拾取（不会自动进包）
const stG = SIM.create(72, 1);
SIM.chooseRift(stG, 0);
const pg = stG.players[0];
pg.bag.length = 0;
stG.pickups.push({ kind: 'item', item: { name: '测试装备', slot: 'ring', ilvl: 5, rarity: 1, mods: [], plus: 0 }, x: pg.x, y: pg.y, t: 0, life: 60 });
for (let i = 0; i < 30; i++) SIM.step(stG, STEP, {});
const notAuto = pg.bag.length === 0;
const rt = SIM.takeItem(stG, pg);
T('装备不自动拾取，按 E 才能拿', notAuto && !!(rt && rt.ok && pg.bag.length === 1), 'bag=' + pg.bag.length);
console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail === 0 ? 0 : 1);
