/* 诊断：技能面板 / 符文面板 / 祭坛 是否真的生效 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9480;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

(async function () {
  const prof = process.env.TEMP + '\\diag_' + Date.now();
  const file = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
  const url = file + '?notut=1&cls=0&panel=skills';
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--window-size=1440,900', url], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 60 && !targets; i++) { await sleep(250); try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json'); } catch (e) {} }
  const page = targets.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (method, params) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return 'EXC:' + JSON.stringify(r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await new Promise(r => { ws.onopen = r; });
  await sleep(2500);

  // ---------- 技能面板 ----------
  console.log('技能面板按钮数: ' + await ev('document.querySelectorAll("#modalbox [data-sup]").length'));
  console.log('点击前 skillCalc 条数: ' + await ev('window.__st() ? Object.keys(window.__st().player.skillCalc).length : -1'));
  const sup = JSON.parse(await ev('JSON.stringify((function(){var b=document.querySelector("#modalbox [data-sup]"); if(!b) return null; var r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,id:b.getAttribute("data-sup")};})())'));
  console.log('第一个辅助按钮: ' + JSON.stringify(sup));
  if (sup) {
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: sup.x, y: sup.y, button: 'left', clickCount: 1 });
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sup.x, y: sup.y, button: 'left', clickCount: 1 });
    await sleep(500);
    console.log('点击后 supports: ' + await ev('JSON.stringify(window.__st().player.supports)'));
    console.log('点击后 skillCalc.dagger.rate: ' + await ev('window.__st().player.skillCalc.dagger ? window.__st().player.skillCalc.dagger.rate.toFixed(3) : "none"'));
  }

  // ---------- 符文面板 ----------
  await ev('UI.close(); UI.showRunes(window.__st()); "ok"');
  await sleep(400);
  console.log('符文按钮数: ' + await ev('document.querySelectorAll("#modalbox [data-rune]").length'));
  console.log('材料(设置前): ' + await ev('window.__st().player.mats'));
  await ev('window.__st().player.mats = 500; "ok"');
  const rune = JSON.parse(await ev('JSON.stringify((function(){var b=document.querySelectorAll("#modalbox [data-rune]")[2]; if(!b) return null; var r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,id:b.getAttribute("data-rune")};})())'));
  console.log('第二个符文按钮: ' + JSON.stringify(rune));
  if (rune) {
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: rune.x, y: rune.y, button: 'left', clickCount: 1 });
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rune.x, y: rune.y, button: 'left', clickCount: 1 });
    await sleep(500);
    console.log('点击后 runeOf: ' + await ev('JSON.stringify(window.__st().player.runeOf)'));
    console.log('点击后 mats: ' + await ev('window.__st().player.mats'));
  }

  // ---------- 祭坛 ----------
  await ev('UI.close(); UI.showAltar(); "ok"');
  await sleep(400);
  console.log('祭坛行数: ' + await ev('document.querySelectorAll("#modalbox .altar-row").length'));
  console.log('META 精华: ' + await ev('window.META ? window.META.essence : "no META"'));
  console.log('当前 meta 加成: ' + await ev('JSON.stringify(window.__st().meta)'));

  console.log('报错: [' + await ev('document.getElementById("err").textContent') + ']');
  ws.close(); edge.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
