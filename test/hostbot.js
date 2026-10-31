/* 主机机器人：以房主身份跑真实模拟并广播快照（用于端到端验证） */
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'engine.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));
require(path.join(__dirname, '..', 'js', 'hostcore.js'));

const SIM = global.SIM, D = global.DATA;
const HC = global.HOSTCORE;
const STEP = 1 / 60;

const PORT = process.env.PORT || 8123;
const ROOM = process.env.ROOM || 'TEST';
const SECONDS = parseFloat(process.env.SECS || '90');

const st = SIM.create(2024, 1);
const inputs = { 0: { mx: 0, my: 0 } };

function bot(i) {
  const p = st.players[0];
  if (!p || !p.alive) return { mx: 0, my: 0 };
  const t = i / 60;
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
    if (pk.kind !== 'gold' && pk.kind !== 'heal') continue;
    const d = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
    if (d < bd) { bd = d; best = pk; }
  }
  if (best) {
    const dx = best.x - p.x, dy = best.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    fx += (dx / d) * 1.3; fy += (dy / d) * 1.3;
  }
  fx += Math.cos(t * 0.5) * 0.3;
  fy += Math.sin(t * 0.5) * 0.3;
  const W = D.CONFIG.worldSize;
  if (p.x < 160) fx += 1.2;
  if (p.x > W - 160) fx -= 1.2;
  if (p.y < 160) fy += 1.2;
  if (p.y > W - 160) fy -= 1.2;
  const len = Math.hypot(fx, fy);
  if (len > 0.001) { fx /= len; fy /= len; }
  return { mx: fx, my: fy };
}

const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/');
let joined = false;

ws.onopen = () => {
  ws.send(JSON.stringify({ t: 'join', room: ROOM, name: 'BOT' }));
};

ws.onmessage = (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.t === 'joined') {
    joined = true;
    console.log('[host] 已创建房间 ' + m.room + '  host=' + m.host + '  id=' + m.id);
  } else if (m.t === 'peers') {
    console.log('[host] 玩家列表: ' + m.players.map(p => p.id + ':' + p.name).join(', '));
    // 同步玩家
    for (const info of m.players) {
      if (!st.players.some(p => p.id === info.id)) {
        SIM.addPlayer(st, info.name, info.id);
        inputs[info.id] = { mx: 0, my: 0 };
        console.log('[host] 加入玩家 ' + info.name + ' (id ' + info.id + ')');
      }
    }
    const ids = new Set(m.players.map(p => p.id));
    for (let i = st.players.length - 1; i >= 0; i--) {
      const p = st.players[i];
      if (p.id !== m.players[0].id && !ids.has(p.id)) SIM.removePlayer(st, p.id);
    }
  } else if (m.t === 'input') {
    inputs[m.id] = { mx: m.mx, my: m.my };
  } else if (m.t === 'cmd') {
    const p = st.players.find(x => x.id === m.id);
    if (p) {
      const ACTSIM = SIM;
      // 直接执行常用命令
      const a = m.a || [];
      if (m.c === 'allocate') ACTSIM.allocate(st, a[0], p);
      else if (m.c === 'buy') ACTSIM.buyItem(st, a[0], p);
      else if (m.c === 'potion') ACTSIM.drinkPotion(st, p);
    }
  }
};

ws.onerror = () => { console.log('[host] ws error'); };

let frame = 0;
const total = SECONDS * 60;
const timer = setInterval(() => {
  if (!joined) return;
  if (st.phase === 'rift') { SIM.chooseRift(st, 0); }
  const inp = bot(frame);
  inputs[0] = inp;
  // 其他玩家的输入来自网络
  SIM.step(st, STEP, inputs);
  frame++;
  if (frame % 4 === 0) { // 15Hz
    ws.send(JSON.stringify({ t: 'snap', d: HC.snapshot(st) }));
  }
  if (frame % 30 === 0) { // 2Hz
    ws.send(JSON.stringify(HC.details(st)));
  }
  if (frame % 600 === 0) {
    console.log('[host] t=' + Math.round(st.t) + 's 玩家=' + st.players.length +
      ' 敌人=' + st.enemies.length + ' 击杀=' + st.kills + ' P0hp=' + Math.round(st.players[0].hp));
  }
  if (frame >= total) {
    clearInterval(timer);
    console.log('[host] 结束');
    ws.close();
    process.exit(0);
  }
}, 1000 / 60);
