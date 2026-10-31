/* 端到端：1 个 Node 房主 + 2 个浏览器客户端，同时进同一房间 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const NODE = process.execPath;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const SRV_PORT = 8210;
const ROOM = 'E2E';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function T(n, c, d) { if (c) { pass++; console.log('  PASS  ' + n + (d ? '   ' + d : '')); } else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); } }

function getJSON(u) {
  return new Promise((res, rej) => { http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej); });
}

async function openClient(name, dbgPort) {
  const prof = process.env.TEMP + '\\e2e_' + dbgPort + '_' + Date.now();
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + dbgPort, '--user-data-dir=' + prof, '--window-size=1440,900',
    'http://127.0.0.1:' + SRV_PORT + '/index.html?room=' + ROOM + '&name=' + name], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { await sleep(250); try { targets = await getJSON('http://127.0.0.1:' + dbgPort + '/json'); } catch (e) {} }
  const page = targets && targets.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
  if (!page) return null;
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => { ws.onopen = r; });
  return { proc, ws, cmd, name };
}

const EXPR = 'JSON.stringify({mode:(window.__mode&&window.__mode())||"?",snaps:window.__snaps||0,' +
  'players:(window.__view&&window.__view()&&window.__view().players.length)||0,' +
  'enemies:(window.__view&&window.__view()&&window.__view().enemies.length)||0,' +
  'hp:document.getElementById("hptext").textContent,invite:(function(){var b=document.getElementById("invite");return b&&!b.classList.contains("hidden")?b.textContent:"";})(),err:document.getElementById("err").textContent})';

(async function () {
  const srv = spawn(NODE, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(SRV_PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let port = null;
  srv.stdout.on('data', d => { const m = String(d).match(/localhost:(\d+)/); if (m && !port) port = parseInt(m[1], 10); });
  for (let i = 0; i < 100 && !port; i++) await sleep(50);
  if (!port) { console.log('服务器未启动'); srv.kill(); process.exit(1); }

  const host = spawn(NODE, ['test/hostbot.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(SRV_PORT), ROOM: ROOM, SECS: '120' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let hostLog = '';
  host.stdout.on('data', d => { hostLog += String(d); });
  await sleep(1500);

  const A = await openClient('ALPHA', 9401);
  const B = await openClient('BETA', 9402);
  T('两个浏览器客户端都连上了', !!A && !!B);

  await sleep(6000);
  const sa = await A.cmd('Runtime.evaluate', { expression: EXPR, returnByValue: true });
  const sb = await B.cmd('Runtime.evaluate', { expression: EXPR, returnByValue: true });
  const va = JSON.parse(sa.result.result.value);
  const vb = JSON.parse(sb.result.result.value);
  console.log('  ALPHA: ' + JSON.stringify(va));
  console.log('  BETA : ' + JSON.stringify(vb));

  T('两个客户端都收到快照', va.snaps > 10 && vb.snaps > 10, va.snaps + '/' + vb.snaps);
  T('客户端看到 3 个玩家（房主+2）', va.players === 3 && vb.players === 3, va.players + '/' + vb.players);
  T('客户端看到怪物', va.enemies > 0 && vb.enemies > 0, va.enemies + '/' + vb.enemies);
  T('无运行错误', !va.err && !vb.err, va.err || vb.err || '');
  T('游戏内出现邀请按钮', !!va.invite && va.invite.indexOf(ROOM) >= 0, va.invite || 'none');

  const shot = await A.cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'shot_coop.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  截图已保存 shot_coop.png');

  console.log('  房主日志片段: ' + hostLog.split('\n').filter(l => l.indexOf('玩家列表') >= 0).slice(-2).join(' | '));

  A.ws.close(); B.ws.close(); A.proc.kill(); B.proc.kill(); host.kill(); srv.kill();
  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
