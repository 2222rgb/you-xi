/* 通过 CDP 抓取客户端真实截图并读取 HUD 状态 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9336;
const ROOM = process.argv[2] || 'P4';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

const EXPR = 'JSON.stringify({' +
  'mode:(window.__mode&&window.__mode())||"?",' +
  'snaps:window.__snaps||0,' +
  'slots:document.querySelectorAll("#skills .slot").length,' +
  'icons:document.querySelectorAll("#skills .slot canvas").length,' +
  'gold:document.getElementById("goldnum").textContent,' +
  'pot:document.getElementById("potnum").textContent,' +
  'dps:document.getElementById("dpsnum").textContent,' +
  'hp:document.getElementById("hptext").textContent,' +
  'err:document.getElementById("err").textContent' +
  '})';

(async function () {
  const prof = process.env.TEMP + '\\edgecdp_' + Date.now();
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + prof,
    '--window-size=1440,900',
    'http://127.0.0.1:8201/index.html?room=' + ROOM + '&name=SHOT'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { await sleep(250); try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json'); } catch (e) {} }
  if (!targets) { console.log('CDP 连接失败'); edge.kill(); process.exit(1); }
  const page = targets.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
  if (!page) { console.log('未找到页面'); edge.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => { ws.onopen = r; });

  await sleep(7000);
  const st = await cmd('Runtime.evaluate', { expression: EXPR, returnByValue: true });
  console.log('STATE ' + (st.result && st.result.result && st.result.result.value));

  const shot = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('shot_client.png', Buffer.from(shot.result.data, 'base64'));
  console.log('saved ' + fs.statSync('shot_client.png').size);

  ws.close();
  edge.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
