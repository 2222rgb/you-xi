/* 20 分钟浏览器 soak：自动重开、每 30 秒采样，检查报错 / 实体数 / 内存增长 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9411;
const MINUTES = parseFloat(process.env.SOAK_MIN || '20');
const OUT = path.join(__dirname, '..', 'soak.json');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

const STATE = 'JSON.stringify({' +
  'err:document.getElementById("err").textContent,' +
  'kills:document.getElementById("killnum").textContent,' +
  'hp:document.getElementById("hptext").textContent,' +
  't:(window.__st&&window.__st()&&window.__st().t)||0,' +
  'cycle:(window.__st&&window.__st()&&window.__st().cycle)||0,' +
  'phase:(window.__st&&window.__st()&&window.__st().phase)||"?",' +
  'enemies:(window.__st&&window.__st()&&window.__st().enemies.length)||0,' +
  'players:(window.__st&&window.__st()&&window.__st().players.length)||0' +
  '})';

const RESTART = '(function(){var b=document.querySelector("[data-restart]");if(b){b.click();return 1;}return 0;})()';

(async function () {
  const prof = process.env.TEMP + '\\soak2_' + Date.now();
  const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/') + '?bot=1';
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof,
    '--window-size=1280,720', url], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) {
    await sleep(250);
    try { targets = await getJSON('http://127.0.0.1:' + PORT + '/json'); } catch (e) {}
  }
  if (!targets) { console.log('CDP 连接失败'); edge.kill(); process.exit(1); }
  const page = targets.find(t => t.type === 'page' && t.url.indexOf('index.html') >= 0);
  if (!page) { console.log('没有页面'); edge.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const cmd = (method, params) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise(r => { ws.onopen = r; });

  const samples = [];
  let errors = 0, deaths = 0;
  const totalSec = MINUTES * 60;

  for (let sec = 3; sec <= totalSec; sec += 3) {
    await sleep(3000);
    let v = null;
    try {
      const r = await cmd('Runtime.evaluate', { expression: STATE, returnByValue: true });
      v = JSON.parse(r.result.result.value);
    } catch (e) { v = { err: 'evaluate failed', phase: '?', t: 0, enemies: 0, kills: '0' }; }

    if (v.phase === 'dead') {
      deaths++;
      try { await cmd('Runtime.evaluate', { expression: RESTART }); } catch (e) {}
      // 页面会 reload，稍等
      await sleep(2500);
      continue;
    }
    if (v.err) errors++;

    if (sec % 30 === 0) {
      let heap = null;
      try {
        const h = await cmd('Runtime.getHeapUsage', {});
        heap = Math.round(h.result.usedSize / 1048576 * 10) / 10;
      } catch (e) {}
      samples.push({ sec: sec, phase: v.phase, t: Math.round(v.t), cycle: v.cycle, kills: v.kills, enemies: v.enemies, heapMB: heap, err: v.err });
      if ((sec % 120) === 0) {
        console.log('[' + sec + 's] phase=' + v.phase + ' 层=' + v.cycle + ' t=' + Math.round(v.t) +
          ' 击杀=' + v.kills + ' 敌=' + v.enemies + ' 堆=' + heap + 'MB' + (v.err ? ' ERR:' + v.err : ''));
      }
    }
  }

  const first = samples[0] || null;
  const last = samples[samples.length - 1] || null;
  const report = {
    minutes: MINUTES,
    samples: samples.length,
    errors: errors,
    deaths: deaths,
    heapFirst: first ? first.heapMB : null,
    heapLast: last ? last.heapMB : null,
    heapGrowthMB: (first && last && first.heapMB && last.heapMB) ? Math.round((last.heapMB - first.heapMB) * 10) / 10 : null,
    maxEnemies: samples.reduce((m, s) => Math.max(m, s.enemies), 0),
    maxCycle: samples.reduce((m, s) => Math.max(m, s.cycle), 0),
    ok: errors === 0 && samples.length > 0
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('\nSOAK: ' + JSON.stringify(report));
  ws.close(); edge.kill();
  process.exit(report.ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
