/* =========================================================
   server.js — 零依赖静态服务器 + 联机房间（主机权威中继）
   运行：node server.js   （默认从 8123 开始找空端口）
   ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WS = require('./server/ws.js');

const ROOT = __dirname;
const START_PORT = parseInt(process.env.PORT || '8123', 10);
const MAX_PLAYERS = 4;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/* ---------------- 静态文件 ---------------- */
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
  const full = path.join(root, clean);
  if (!full.startsWith(root)) return null;
  return full;
}

function handler(req, res) {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = safeJoin(ROOT, p);
  if (!file) { res.writeHead(403); res.end('Forbidden'); return; }
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

/* ---------------- 房间 ---------------- */
const rooms = new Map();
let connSeq = 0;

function roomOf(id) { return rooms.get(id); }

const GHOST_MS = 30000;

function makeRoom(id) {
  const r = { id: id, clients: new Map(), hostId: null, nextPid: 0, created: Date.now() };
  rooms.set(id, r);
  return r;
}

function playersOf(room) {
  const out = [];
  room.clients.forEach(function (c) {
    out.push({ id: c.pid, name: c.name, off: c.conn ? 0 : 1 });
  });
  return out;
}

function broadcast(room, msg, except) {
  const text = JSON.stringify(msg);
  room.clients.forEach(function (c) {
    if (c === except || !c.conn) return;
    c.conn.send(text);
  });
}

function send(c, msg) {
  if (!c || !c.conn) return;
  c.conn.send(JSON.stringify(msg));
}

function onlineHost(room) {
  const c = room.clients.get(room.hostId);
  return c && c.conn ? c : null;
}

function pickHost(room) {
  let first = null;
  room.clients.forEach(function (c) { if (!first && c.conn) first = c; });
  room.hostId = first ? first.pid : null;
  if (first) broadcast(room, { t: 'host', id: first.pid });
}

function joinRoom(conn, name, roomId, token) {
  const id = String(roomId || 'L1').toUpperCase().slice(0, 12);
  let room = roomOf(id);
  if (!room) room = makeRoom(id);

  // 用 token 复活掉线玩家
  let revived = null;
  if (token) {
    room.clients.forEach(function (c) {
      if (!revived && !c.conn && c.token === token) revived = c;
    });
  }
  if (revived) {
    revived.conn = conn;
    revived.offlineAt = 0;
    conn.room = room;
    conn.pid = revived.pid;
    if (room.hostId === null) room.hostId = revived.pid;
    send(revived, { t: 'joined', id: revived.pid, host: room.hostId, room: room.id, players: playersOf(room), rejoin: 1 });
    broadcast(room, { t: 'peers', players: playersOf(room) }, revived);
    return revived;
  }

  let online = 0;
  room.clients.forEach(function (c) { if (c.conn) online++; });
  if (online >= MAX_PLAYERS) {
    send({ conn: conn }, { t: 'full' });
    return null;
  }

  const pid = room.nextPid++;
  const c = { pid: pid, name: (name || ('玩家' + pid)).slice(0, 12), conn: conn, token: token || '', offlineAt: 0 };
  room.clients.set(pid, c);
  conn.room = room;
  conn.pid = pid;

  if (room.hostId === null) room.hostId = pid;

  send(c, {
    t: 'joined', id: pid, host: room.hostId, room: room.id,
    players: playersOf(room), rejoin: 0
  });
  broadcast(room, { t: 'peers', players: playersOf(room) }, c);
  return c;
}

function dropRoom(room) {
  if (room.clients.size === 0) rooms.delete(room.id);
}

function markOffline(c) {
  const room = c.conn ? c.conn.room : (c.room || null);
  if (!room) return;
  c.conn = null;
  c.offlineAt = Date.now();
  if (room.hostId === c.pid) pickHost(room);
  broadcast(room, { t: 'peers', players: playersOf(room) });
  broadcast(room, { t: 'left', id: c.pid });
  dropRoom(room);
}

function leaveRoom(c) {
  const room = c.conn ? c.conn.room : null;
  if (!room) return;
  room.clients.delete(c.pid);
  c.conn.room = null;
  if (room.hostId === c.pid) pickHost(room);
  broadcast(room, { t: 'peers', players: playersOf(room) });
  broadcast(room, { t: 'left', id: c.pid });
  dropRoom(room);
}

setInterval(function () {
  const now = Date.now();
  rooms.forEach(function (room) {
    let changed = false;
    room.clients.forEach(function (c) {
      if (!c.conn && c.offlineAt && now - c.offlineAt > GHOST_MS) {
        room.clients.delete(c.pid);
        changed = true;
      }
    });
    if (changed) broadcast(room, { t: 'peers', players: playersOf(room) });
    dropRoom(room);
  });
}, 5000);
/* ---------------- WebSocket ---------------- */
function onConnection(conn) {
  let me = null;

  conn.onMessage = function (raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.t === 'join') {
      if (me) return;
      me = joinRoom(conn, msg.name, msg.room, msg.token);
      return;
    }
    if (!me) return;
    const room = conn.room;
    if (!room) return;

    switch (msg.t) {
      case 'input':
        // 客户端输入 → 只转发给主机
        if (me.pid !== room.hostId) {
          const host = room.clients.get(room.hostId);
          if (host) host.conn.send(JSON.stringify({ t: 'input', id: me.pid, mx: msg.mx, my: msg.my }));
        }
        break;
      case 'snap':
        if (me.pid === room.hostId) {
          broadcast(room, { t: 'snap', d: msg.d }, me);
        }
        break;
      case 'details':
        if (me.pid === room.hostId) {
          broadcast(room, { t: 'details', d: msg.d, shop: msg.shop, stash: msg.stash }, me);
        }
        break;
      case 'cmd':
        if (me.pid !== room.hostId) {
          const h = room.clients.get(room.hostId);
          if (h) h.conn.send(JSON.stringify({ t: 'cmd', id: me.pid, c: msg.c, a: msg.a }));
        }
        break;
      case 'leave':
        leaveRoom(me);
        me = null;
        conn.close();
        break;
      default:
        break;
    }
  };

  conn.onClose = function () {
    if (me) { markOffline(me); me = null; }
  };
}

/* ---------------- 启动 ---------------- */
function makeServer() {
  const srv = http.createServer(handler);
  WS.attach(srv, onConnection);
  return srv;
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
  console.log('  联机：打开 /?room=ABCD  （房主用 ?room=ABCD&host=1）');
  console.log('  Ctrl+C 停止');
}

function tryListen(port, attempt) {
  const s = makeServer();
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
