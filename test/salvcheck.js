/* 诊断：点击背包里的「回」按钮，看材料是否增加 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9470;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

(async function () {
  const prof = process.env.TEMP + '\\sv_' + Date.now();
  const file = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const url = file + '?bag=1&panel=bag&notut=1&cls=0';
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

  const before = await cmd('Runtime.evaluate', {
    expression: 'JSON.stringify({mats: document.getElementById("matnum").textContent, bag: document.querySelectorAll(".irow[data-act=eq]").length, minis: document.querySelectorAll(".mini").length, eq: document.querySelectorAll("[data-act=uneq]").length})',
    returnByValue: true
  });
  console.log('点击前 ' + before.result.result.value);

  const probe = await cmd('Runtime.evaluate', {
    expression: 'JSON.stringify((function(){var b=document.querySelector(".mini"); var box=document.getElementById("modalbox"); return {found:!!b, hasOnclick: !!(b&&b.onclick), parentAct: b&&b.parentElement?b.parentElement.getAttribute("data-act"):null, boxHasHandler: !!(box&&box.onclick), boxTag: box?box.tagName:null, inBox: !!(b&&box&&box.contains(b))};})())',
    returnByValue: true
  });
  console.log('探针 ' + probe.result.result.value);

  const rectRes = await cmd('Runtime.evaluate', {
    expression: 'JSON.stringify((function(){var b=document.querySelector(".mfoot .btn"); if(!b) return null; var r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};})())',
    returnByValue: true
  });
  const rp = JSON.parse(rectRes.result.result.value);
  console.log("按钮坐标 " + JSON.stringify(rp));
  await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: rp.x, y: rp.y, button: 'left', clickCount: 1 });
  await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rp.x, y: rp.y, button: 'left', clickCount: 1 });
  const clickRes = { result: { result: { value: 'real-mouse' } } };
  console.log('点击结果 ' + clickRes.result.result.value);
  await sleep(800);

  const after = await cmd('Runtime.evaluate', {
    expression: 'JSON.stringify({mats: document.getElementById("matnum").textContent, pMats: window.__st().player.mats, bag: window.__st().player.bag.length, eq: document.querySelectorAll("[data-act=uneq]").length, toast: (document.getElementById("toasts")||{}).textContent, err: document.getElementById("err").textContent})',
    returnByValue: true
  });
  console.log('点击后 ' + after.result.result.value);

  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
