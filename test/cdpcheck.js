/* 用 CDP 实时检查浏览器客户端是否收到快照（绕开 headless 的虚拟时间） */
const { spawn } = require('child_process');
const http = require('http');

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URLPAGE = process.argv[2] || 'http://127.0.0.1:8201/index.html?room=P3&name=CDP';
const PORT = 9333;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}

(async function () {
  const prof = process.env.TEMP + '\\edgecdp_' + Date.now();
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + prof,
    '--window-size=1440,900',
    URLPAGE
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) {
    await sleep(250);
    try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json'); } catch (e) {}
  }
  if (!targets) { console.log('无法连接 CDP'); edge.kill(); process.exit(1); }
  const page = targets.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
  if (!page) { console.log('没找到页面 target:', targets.map(t => t.url)); edge.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const cmd = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => ws.onopen = r);

  for (const wait of [2000, 4000, 6000]) {
    await sleep(wait === 2000 ? 2000 : 2000);
    const r = await cmd('Runtime.evaluate', {
      expression: `JSON.stringify({snaps:window.__snaps||0, mode:(window.__mode&&window.__mode())||'?', hp:document.getElementById('hptext').textContent, kills:document.getElementById('killnum').textContent, err:document.getElementById('err').textContent})`,
      returnByValue: true
    });
    console.log('[' + (wait / 1000) + 's] ' + (r.result && r.result.result && r.result.result.value));
  }

  ws.close();
  edge.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
