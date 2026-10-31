/* 联机协议测试：用 Node 自带 WebSocket 客户端连真实服务器 */
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function T(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.msgs = [];
    ws.onmessage = (e) => { try { ws.msgs.push(JSON.parse(e.data)); } catch (err) {} };
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(new Error('ws error'));
    ws.sendJSON = (o) => ws.send(JSON.stringify(o));
    ws.wait = async function (pred, ms) {
      const deadline = Date.now() + (ms || 2000);
      while (Date.now() < deadline) {
        for (let i = 0; i < this.msgs.length; i++) if (pred(this.msgs[i])) return this.msgs[i];
        await sleep(20);
      }
      return null;
    };
  });
}

(async function () {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: '8199' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let port = null;
  srv.stdout.on('data', (d) => {
    const m = String(d).match(/localhost:(\d+)/);
    if (m && !port) port = parseInt(m[1], 10);
  });

  for (let i = 0; i < 100 && !port; i++) await sleep(50);
  if (!port) { console.log('服务器未启动'); srv.kill(); process.exit(1); }
  console.log('  服务器端口 ' + port + '\n');

  const url = 'ws://127.0.0.1:' + port + '/';
  const A = await connect(url);
  const B = await connect(url);

  A.sendJSON({ t: 'join', room: 'TEST', name: '甲' });
  const ja = await A.wait(m => m.t === 'joined');
  T('A 加入并成为房主', ja && ja.host === ja.id && ja.players.length === 1, ja ? 'id=' + ja.id : 'none');

  B.sendJSON({ t: 'join', room: 'TEST', name: '乙' });
  const jb = await B.wait(m => m.t === 'joined');
  T('B 加入，主机仍是 A', jb && jb.host === ja.id && jb.players.length === 2,
    jb ? 'id=' + jb.id + ' host=' + jb.host : 'none');

  const peersA = await A.wait(m => m.t === 'peers' && m.players.length === 2);
  T('A 收到 peers 更新', !!peersA, peersA ? peersA.players.map(p => p.name).join(',') : '');

  // B 的输入只转发给主机
  B.sendJSON({ t: 'input', mx: 1, my: 0 });
  const inp = await A.wait(m => m.t === 'input');
  T('B 的输入转发到主机', inp && inp.mx === 1 && inp.id === jb.id);

  // A 的快照广播给 B
  A.sendJSON({ t: 'snap', d: { p: [[0, 10, 20]] } });
  const snap = await B.wait(m => m.t === 'snap');
  T('主机快照广播给客户端', snap && snap.d.p[0][1] === 10);

  // 客户端不能广播快照
  B.msgs.length = 0;
  B.sendJSON({ t: 'snap', d: { hack: 1 } });
  await sleep(120);
  T('客户端无法伪造快照', !A.msgs.some(m => m.t === 'snap' && m.d && m.d.hack));

  // 命令转发
  B.sendJSON({ t: 'cmd', c: 'allocate', a: ['b2'] });
  const cmd = await A.wait(m => m.t === 'cmd');
  T('命令转发到主机', cmd && cmd.c === 'allocate' && cmd.id === jb.id);

  // B 离开
  B.close();
  const leftMsg = await A.wait(m => m.t === 'left', 3000);
  T('B 掉线后 A 收到 left 通知（B 保留 30 秒可重连）', !!leftMsg);

  // 房主离开 → 剩余玩家接管
  const C = await connect(url);
  C.sendJSON({ t: 'join', room: 'TEST', name: '丙' });
  await C.wait(m => m.t === 'joined');
  A.close();
  const hostMsg = await C.wait(m => m.t === 'host', 3000);
  T('房主离开后自动移交', !!hostMsg, hostMsg ? '新主机=' + hostMsg.id : '');

  // 断线重连：同 token 恢复原 pid
  const R1 = await connect(url);
  R1.sendJSON({ t: 'join', room: 'RC', name: 'E', token: 'tok-e' });
  const r1 = await R1.wait(m => m.t === 'joined');
  R1.close();
  await sleep(300);
  const R2 = await connect(url);
  R2.sendJSON({ t: 'join', room: 'RC', name: 'E', token: 'tok-e' });
  const r2 = await R2.wait(m => m.t === 'joined');
  T('断线重连恢复原 pid', !!(r2 && r2.id === r1.id && r2.rejoin === 1), r2 ? ('id=' + r2.id + ' rejoin=' + r2.rejoin) : 'none');
  R2.close();
  await sleep(150);
  // 第五个人被拒
  const socks = [];
  for (let i = 0; i < 4; i++) socks.push(await connect(url));
  for (let i = 0; i < 4; i++) {
    socks[i].sendJSON({ t: 'join', room: 'FULL', name: 'p' + i });
    await socks[i].wait(m => m.t === 'joined' || m.t === 'full', 1500);
  }
  const extra = await connect(url);
  extra.sendJSON({ t: 'join', room: 'FULL', name: 'x' });
  const full = await extra.wait(m => m.t === 'full', 2000);
  T('房间上限 4 人', !!full);

  socks.forEach(s => s.close());
  extra.close();
  C.close();
  await sleep(150);

  srv.kill();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('测试异常:', e && e.message);
  process.exit(1);
});
