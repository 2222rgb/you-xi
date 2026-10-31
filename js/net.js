/* =========================================================
   net.js — 浏览器端联机客户端
   主机：收 input / cmd，发 snap / details
   客户端：发 input / cmd，收 snap / details
   ========================================================= */
(function (root) {
  'use strict';

  const NET = {
    ws: null,
    id: null,
    hostId: null,
    room: null,
    players: [],
    isHost: false,
    connected: false,
    error: null,
    lastSent: 0,
    onSnap: null,
    onDetails: null,
    onPeers: null,
    onHost: null,
    onCmd: null,
    onInput: null,
    onJoined: null,
    onFull: null
  };

  let token = '';
  try { token = sessionStorage.getItem('ashfall.token') || ''; } catch (e) {}
  if (!token) {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { sessionStorage.setItem('ashfall.token', token); } catch (e) {}
  }
  NET.token = token;

  NET.join = function (opts) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = proto + '//' + location.host + '/ws';
    let ws;
    try { ws = new WebSocket(url); } catch (e) { NET.error = '无法连接'; return; }
    NET.ws = ws;

    ws.onopen = function () {
      NET.connected = true;
      NET.send({ t: 'join', room: opts.room, name: opts.name, token: NET.token });
    };
    ws.onmessage = function (ev) {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.t) {
        case 'joined':
          NET.id = m.id; NET.hostId = m.host; NET.room = m.room;
          NET.players = m.players;
          NET.isHost = (m.id === m.host);
          if (NET.onJoined) NET.onJoined(m);
          break;
        case 'peers':
          NET.players = m.players;
          if (NET.onPeers) NET.onPeers(m.players);
          break;
        case 'host':
          NET.hostId = m.id;
          NET.isHost = (m.id === NET.id);
          if (NET.onHost) NET.onHost(m.id);
          break;
        case 'snap':
          window.__snaps = (window.__snaps || 0) + 1;
          document.title = 'SNAP ' + window.__snaps + ' ps' + (m.d.ps ? m.d.ps.length : -1) + ' es' + (m.d.es ? m.d.es.length : -1);
          if (NET.onSnap) NET.onSnap(m.d);
          break;
        case 'details':
          if (NET.onDetails) NET.onDetails(m);
          break;
        case 'cmd':
          if (NET.onCmd) NET.onCmd(m);
          break;
        case 'input':
          if (NET.onInput) NET.onInput(m);
          break;
        case 'left':
          break;
        case 'full':
          NET.error = '房间已满';
          if (NET.onFull) NET.onFull();
          break;
        default: break;
      }
    };
    ws.onclose = function () {
      NET.connected = false;
      NET.error = '连接已断开';
    };
    ws.onerror = function () { NET.error = '连接失败'; };
  };

  NET.send = function (o) {
    if (!NET.ws || NET.ws.readyState !== 1) return;
    NET.ws.send(JSON.stringify(o));
  };

  NET.sendInput = function (now, mx, my) {
    if (now - NET.lastSent < 50) return; // 20Hz
    NET.lastSent = now;
    NET.send({ t: 'input', mx: mx, my: my });
  };

  NET.sendSnap = function (d) { NET.send({ t: 'snap', d: d }); };
  NET.sendDetails = function (payload) { NET.send(Object.assign({ t: 'details' }, payload)); };
  NET.sendCmd = function (c, a) { NET.send({ t: 'cmd', c: c, a: a }); };

  NET.leave = function () {
    if (NET.ws) { NET.send({ t: 'leave' }); NET.ws.close(); }
    NET.ws = null; NET.connected = false; NET.isHost = false;
  };

  NET.roomLink = function (host) {
    if (!NET.room) return '';
    return location.origin + location.pathname + '?room=' + NET.room + (host ? '&host=1' : '');
  };

  root.NET = NET;
})(window);
