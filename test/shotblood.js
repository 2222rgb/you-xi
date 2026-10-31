/* 截图：切到「血」天赋页 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9451;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

(async function () {
  const prof = process.env.TEMP + '\\tt_' + Date.now();
  const file = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const url = file + '?panel=talent&notut=1&cls=3';
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1440,900', url], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { await sleep(250); try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json'); } catch (e) {} }
  const page = targets.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => { ws.onopen = r; });

  await sleep(2500);
  await cmd('Runtime.evaluate', { expression: 'var b=document.querySelector(\'[data-tab="blood"]\'); if(b) b.click(); "ok"' });
  await sleep(700);
  const shot = await cmd('Page.captureScreenshot', { format: 'png' });
  const out = path.join(__dirname, '..', 'shot_blood.png');
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved ' + fs.statSync(out).size);
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
