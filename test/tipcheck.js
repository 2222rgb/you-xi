/* 悬停验证：打开商店，把鼠标移到第一行装备上，检查 #tip 是否显示 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9462;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

(async function () {
  const prof = process.env.TEMP + '\\tip_' + Date.now();
  const file = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const url = file + '?scene=town&panel=shop&notut=1';
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

  const rectRes = await cmd('Runtime.evaluate', {
    expression: 'JSON.stringify((function(){var r=document.querySelector(".irow"); if(!r) return null; var b=r.getBoundingClientRect(); return {x: b.left + b.width/2, y: b.top + b.height/2, n: document.querySelectorAll(".irow").length};})())',
    returnByValue: true
  });
  const rect = JSON.parse(rectRes.result.result.value);
  console.log('商店行数=' + (rect ? rect.n : 0) + ' 目标=' + JSON.stringify(rect));

  if (rect) {
    await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, buttons: 0 });
    await sleep(500);
    const tipRes = await cmd('Runtime.evaluate', {
      expression: 'JSON.stringify((function(){var t=document.getElementById("tip"); return {hidden: t.classList.contains("hidden"), text: t.textContent.slice(0,80)};})())',
      returnByValue: true
    });
    console.log('提示框: ' + tipRes.result.result.value);
    const shot = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', 'shot_tooltip.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('saved shot_tooltip.png');
  }
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
