/* =========================================================
   server/ws.js — 最小 RFC6455 WebSocket 服务端（零依赖）
   只做游戏需要的事：握手、文本帧、ping/pong、close。
   ========================================================= */
'use strict';

const crypto = require('crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

class Conn {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.fragOp = 0;
    this.fragBuf = [];
    this.onMessage = null;
    this.onClose = null;

    socket.setNoDelay(true);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
  }

  _closed() {
    if (!this.open) return;
    this.open = false;
    if (this.onClose) this.onClose();
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2);
        const lo = b.readUInt32BE(6);
        len = hi * 4294967296 + lo;
        off = 10;
      }
      let maskKey = null;
      if (masked) {
        if (b.length < off + 4) return;
        maskKey = b.slice(off, off + 4);
        off += 4;
      }
      if (b.length < off + len) return;

      let payload = b.slice(off, off + len);
      if (masked) {
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ maskKey[i & 3];
        payload = out;
      }
      this.buf = b.slice(off + len);

      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this._send(0xA, payload); continue; }
      if (opcode === 0xA) continue;

      if (opcode === 0x0) {
        this.fragBuf.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragBuf);
          this.fragBuf = [];
          if (this.onMessage) this.onMessage(full.toString('utf8'));
        }
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        if (!fin) {
          this.fragOp = opcode;
          this.fragBuf = [payload];
          continue;
        }
        if (this.onMessage) this.onMessage(payload.toString('utf8'));
      }
    }
  }

  _send(opcode, payload) {
    if (!this.open || this.socket.destroyed) return;
    try { this.socket.write(encodeFrame(opcode, payload)); } catch (e) { this._closed(); }
  }

  send(text) { this._send(0x1, Buffer.from(text, 'utf8')); }

  close() {
    if (!this.open) return;
    this._send(0x8, Buffer.alloc(0));
    this.open = false;
    try { this.socket.end(); } catch (e) {}
    if (this.onClose) this.onClose();
  }
}

/** 把 WebSocket 挂到已有的 http server 上 */
function attach(server, onConnection) {
  server.on('upgrade', function (req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + acceptKey(key)
    ];
    socket.write(headers.join('\r\n') + '\r\n\r\n');
    const conn = new Conn(socket, req);
    onConnection(conn, req);
  });
}

module.exports = { attach: attach, encodeFrame: encodeFrame };
