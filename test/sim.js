const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));

const SIM = global.SIM;
const STEP = 1 / 60;

const st = SIM.create(12345);
console.log('创建成功: hp', st.player.hp, '/', st.player.maxHp, ' 技能', st.player.skills.map(s => s.id).join(','));

for (let i = 0; i < 60 * 40; i++) {
  const a = i / 60;
  if (st.phase === 'levelup') {
    const ch = SIM.rollChoices(st);
    if (ch.length) SIM.applyChoice(st, ch[0]);
    continue;
  }
  if (st.phase !== 'run') break;
  SIM.step(st, STEP, { mx: Math.cos(a * 0.7), my: Math.sin(a * 0.7) });
}

console.log('40 秒后: t=' + st.t.toFixed(1) + ' 敌人=' + st.enemies.length +
  ' 击杀=' + st.kills + ' 等级=' + st.player.level +
  ' hp=' + Math.round(st.player.hp) + '/' + st.player.maxHp);
console.log('技能:', st.player.skills.map(s => s.id + ' Lv' + s.level).join(', '));
console.log('掉落物:', st.pickups.length, ' 子弹:', st.shots.length, ' 背包:', st.bag.length);
console.log('相位:', st.phase);

// 前 3 个敌人的位置
console.log('敌人样本:', st.enemies.slice(0, 3).map(e => e.type + '@' + Math.round(e.x) + ',' + Math.round(e.y) + ' hp' + Math.round(e.hp)));
console.log('玩家位置:', Math.round(st.player.x), Math.round(st.player.y));
console.log('世界尺寸:', global.DATA.CONFIG.worldSize);
