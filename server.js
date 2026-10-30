/* =========================================================
   server.js — 零依赖静态服务器
   用途：局域网/手机试玩；后续联机会在这里挂 WebSocket。
   运行：node server.js        （默认从 8123 开始找空端口）
        PORT=9000 node server.js
   ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const START_PORT = parseInt(process.env.PORT || '8123', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(root, clean);
  if (!full.startsWith(root)) return null;
  return full;
}

function handler(req, res) {
  const p = req.url === '/' ? '/index.html' : req.url;
  const file = safeJoin(ROOT, p);

  if (!file) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(file, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 ' + p);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
}

function banner(port) {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name in nets) {
    for (const ni of nets[name]) {
      if (ni.family === 'IPv4' && !ni.internal) addrs.push(ni.address);
    }
  }
  console.log('');
  console.log('  ASHFALL dev server');
  console.log('  ------------------');
  console.log('  本机   http://localhost:' + port);
  for (const a of addrs) {
    console.log('  局域网 http://' + a + ':' + port + '   （手机同 WiFi 可直接打开）');
  }
  console.log('');
  console.log('  Ctrl+C 停止');
}

function tryListen(port, attempt) {
  const s = http.createServer(handler);
  s.once('error', function (err) {
    if (err.code === 'EADDRINUSE' && attempt < 12) {
      tryListen(port + 1, attempt + 1);
    } else {
      console.error('启动失败：' + err.message);
      process.exit(1);
    }
  });
  s.listen(port, '0.0.0.0', function () {
    banner(s.address().port);
  });
}

tryListen(START_PORT, 0);
