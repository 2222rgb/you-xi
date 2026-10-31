/* =========================================================
   render.js — 像素渲染器
   内部 320x180，整数倍放大到窗口，保证像素锐利。
   ========================================================= */
(function (root) {
  'use strict';

  const W = 320, H = 180;
  const D = root.DATA, CFG = D.CONFIG;

  let canvas, ctx, scale = 1;
  let camX = 0, camY = 0;
  let shakeT = 0, shakeMag = 0;

  const cache = {};      // name -> {normal, flash}
  let floorTiles = [];
  let townTiles = [];
  let hurtVig = null;
  let vignette = null;
  let dust = [];

  /* ---------------- 烘焙 ---------------- */
  function bake(spr) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, spr.w);
    c.height = Math.max(1, spr.h);
    const g = c.getContext('2d');
    for (let y = 0; y < spr.h; y++) {
      for (let x = 0; x < spr.w; x++) {
        const ch = spr.rows[y][x];
        if (ch === '.' || ch === ' ') continue;
        const col = spr.pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    const f = document.createElement('canvas');
    f.width = c.width; f.height = c.height;
    const fg = f.getContext('2d');
    fg.drawImage(c, 0, 0);
    fg.globalCompositeOperation = 'source-atop';
    fg.fillStyle = '#ffffff';
    fg.fillRect(0, 0, f.width, f.height);
    return { normal: c, flash: f, w: spr.w, h: spr.h };
  }

  function buildSprites() {
    for (const k in root.SPRITES) cache[k] = bake(root.SPRITES[k]);
  }

  function buildFloor() {
    const variants = [
      ['#22222f', '#282838', '#1d1d29'],
      ['#202030', '#26263a', '#1c1c2a'],
      ['#232333', '#29293d', '#1e1e2c'],
      ['#212130', '#272739', '#1d1d2b']
    ];
    floorTiles = variants.map(function (pal, idx) { return makeTile(pal, idx); });

    const townPal = [
      ['#2e2a26', '#37322c', '#24201c'],
      ['#2b2723', '#343029', '#211d19'],
      ['#312c27', '#3a342d', '#262119'],
      ['#2d2823', '#36312a', '#231f1a']
    ];
    townTiles = townPal.map(function (pal, idx) { return makeTile(pal, idx + 10); });

    // 暗角
    vignette = document.createElement('canvas');
    vignette.width = W; vignette.height = H;
    const vg = vignette.getContext('2d');
    const grad = vg.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.86);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, W, H);

    hurtVig = document.createElement('canvas');
    hurtVig.width = W; hurtVig.height = H;
    const hg = hurtVig.getContext('2d');
    const hgrad = hg.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.82);
    hgrad.addColorStop(0, 'rgba(255,0,0,0)');
    hgrad.addColorStop(1, 'rgba(210,20,20,0.95)');
    hg.fillStyle = hgrad;
    hg.fillRect(0, 0, W, H);

    dust = [];
    for (let i = 0; i < 26; i++) {
      dust.push({ x: Math.random() * W, y: Math.random() * H, s: 0.3 + Math.random(), p: Math.random() * 6.28 });
    }
  }

  function makeTile(pal, idx) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = pal[0];
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = pal[2];
    g.fillRect(0, 15, 16, 1);
    g.fillRect(15, 0, 1, 16);
    let seed = 1337 + idx * 977;
    const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 5; i++) {
      g.fillStyle = pal[1];
      g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 2), 1);
    }
    return c;
  }

  /* ---------------- 初始化 ---------------- */
  function init(cv) {
    canvas = cv;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    buildSprites();
    buildFloor();
    resize();
  }

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.max(1, Math.floor(Math.min(vw / W, vh / H)));
    canvas.style.width = (W * scale) + 'px';
    canvas.style.height = (H * scale) + 'px';
  }

  /* ---------------- 工具 ---------------- */
  function sx(x) { return Math.round(x - camX); }
  function sy(y) { return Math.round(y - camY); }

  function blit(name, x, y, flip, flash) {
    const s = cache[name];
    if (!s) return;
    const img = flash ? s.flash : s.normal;
    const px = Math.round(x) - (s.w >> 1);
    const py = Math.round(y) - s.h;
    if (flip) {
      ctx.save();
      ctx.translate(px + s.w, py);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(img, px, py);
    }
  }

  function blitRaw(name, x, y) {
    const s = cache[name];
    if (!s) return;
    ctx.drawImage(s.normal, Math.round(x), Math.round(y));
  }

  /* 世界坐标 → 屏幕坐标后再绘制 */
  function blitWorld(name, wx, wy, flip, flash) {
    blit(name, wx - camX, wy - camY, flip, flash);
  }

  function drawText(str, x, y, color, scalePx) {
    const sc = scalePx || 1;
    const S = root.DIGITS;
    let w = 0;
    for (let i = 0; i < str.length; i++) w += (S[str[i]] ? 3 : 2) + 1;
    w -= 1;
    let px = Math.round(x - w / 2);
    ctx.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const g = S[str[i]];
      if (g) {
        for (let gy = 0; gy < 5; gy++) {
          for (let gx = 0; gx < 3; gx++) {
            if (g[gy][gx] === '1') ctx.fillRect(px + gx * sc, y + gy * sc, sc, sc);
          }
        }
        px += 4 * sc;
      } else {
        px += 3 * sc;
      }
    }
  }

  function shadow(x, y, r, a) {
    ctx.globalAlpha = a === undefined ? 0.32 : a;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), r, Math.max(1, r * 0.4), 0, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ---------------- 主绘制 ---------------- */
  function draw(st, time) {
    const p = st.player;
    const isTown = st.phase === 'town';
    const worldW = isTown ? D.TOWN.w : CFG.worldSize;
    const worldH = isTown ? D.TOWN.h : CFG.worldSize;

    camX = Math.max(0, Math.min(worldW - W, p.x - W / 2));
    camY = Math.max(0, Math.min(worldH - H, p.y - H / 2));

    let ox = 0, oy = 0;
    if (shakeT > 0) {
      ox = (Math.random() - 0.5) * shakeMag;
      oy = (Math.random() - 0.5) * shakeMag;
    }
    ctx.save();
    ctx.translate(Math.round(ox), Math.round(oy));

    drawFloor(isTown ? townTiles : floorTiles);
    drawDust(time);

    // 拾取物（最底层）
    for (let i = 0; i < st.pickups.length; i++) {
      const pk = st.pickups[i];
      const bob = Math.sin(time * 5 + pk.t * 3) * 1.2;
      const left = pk.life !== undefined ? pk.life - pk.t : 999;
      ctx.globalAlpha = left < 8 ? (Math.floor(time * 6) % 2 === 0 ? 0.25 : 1) : 1;

      if (pk.kind === 'xp') {
        blitWorld('gem', pk.x, pk.y + bob, false, false);
      } else if (pk.kind === 'gold') {
        blitWorld('coin', pk.x, pk.y + bob, false, false);
      } else if (pk.kind === 'gem') {
        const spr = D.SKILLS[pk.gem] ? D.SKILLS[pk.gem].icon : 'gem';
        ctx.globalAlpha *= 0.6;
        ctx.fillStyle = '#c9a0ff';
        ctx.fillRect(sx(pk.x) - 1, sy(pk.y) - 12, 2, 11);
        ctx.globalAlpha = left < 8 ? (Math.floor(time * 6) % 2 === 0 ? 0.3 : 1) : 1;
        blitWorld(spr, pk.x, pk.y + bob, false, false);
      } else if (pk.kind === 'item') {
        const iRar = pk.item ? pk.item.rarity : 0;
        const col = D.RARITY_COLOR[iRar];
        const bh = 12 + iRar * 9;
        const pulse = 0.55 + 0.45 * Math.sin(time * (3 + iRar));
        // 地面光晕
        ctx.globalAlpha = 0.10 + iRar * 0.05;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(sx(pk.x), sy(pk.y) + 3, 7 + iRar * 2, 3 + iRar, 0, 0, 6.2832);
        ctx.fill();
        // 光柱
        ctx.globalAlpha = (0.28 + iRar * 0.13) * pulse;
        ctx.fillRect(sx(pk.x) - 1 - iRar, sy(pk.y) - bh, 2 + iRar * 2, bh);
        ctx.globalAlpha = 0.85 * pulse;
        ctx.fillStyle = col;
        ctx.fillRect(sx(pk.x), sy(pk.y) - bh, 1, bh);
        // 稀有度越高，光柱顶端越亮
        if (iRar >= 2) {
          ctx.globalAlpha = 0.7 * pulse;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(sx(pk.x), sy(pk.y) - bh - 2, 1, 2);
        }
        // 飘浮微粒
        for (let sp = 0; sp < 3; sp++) {
          const ph = (time * 1.4 + sp * 0.33 + (pk.x % 7) * 0.1) % 1;
          ctx.globalAlpha = (1 - ph) * (0.35 + iRar * 0.15);
          ctx.fillStyle = col;
          ctx.fillRect(sx(pk.x) + Math.sin(time * 2 + sp * 2.1) * 3, sy(pk.y) - ph * (bh + 4), 1, 1);
        }
        ctx.globalAlpha = left < 8 ? (Math.floor(time * 6) % 2 === 0 ? 0.3 : 1) : 1;
        blitWorld('chest', pk.x, pk.y + bob, false, false);
      } else {
        blitWorld('heart', pk.x, pk.y + bob, false, false);
      }
      ctx.globalAlpha = 1;
    }

    // 区域预警
    for (let i = 0; i < st.zones.length; i++) {
      const z = st.zones[i];
      const k = Math.min(1, z.t / z.delay);
      ctx.globalAlpha = 0.15 + k * 0.25;
      ctx.fillStyle = '#ff6b2b';
      ctx.beginPath();
      ctx.arc(sx(z.x), sy(z.y), z.r * (0.4 + 0.6 * k), 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,120,60,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx(z.x), sy(z.y), z.r, 0, 6.2832);
      ctx.stroke();
    }

    // 敌人按 y 排序
    const drawables = [];
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      if (e.dead) continue;
      if (Math.abs(e.x - p.x) > W || Math.abs(e.y - p.y) > H) continue;
      drawables.push(e);
    }
    drawables.sort(function (a, b) { return a.y - b.y; });
    for (let i = 0; i < drawables.length; i++) drawEnemy(drawables[i], time);

    // 主角永远画在最上层，避免被怪群淹没
    drawOthers(st, time);
    drawPlayer(st, time);
    drawMinimap(st, time);

    if (isTown) drawNpcs(st, time);

    // 弹道
    for (let i = 0; i < st.shots.length; i++) drawShot(st.shots[i]);

    // 敌方弹道
    if (st.eshots) {
      for (let i = 0; i < st.eshots.length; i++) {
        const s = st.eshots[i];
        ctx.fillStyle = '#7fd66b';
        ctx.globalAlpha = 0.85;
        ctx.fillRect(sx(s.x) - 1, sy(s.y) - 1, 3, 3);
        ctx.globalAlpha = 0.35;
        ctx.fillRect(sx(s.x) - 2, sy(s.y) - 2, 5, 5);
        ctx.globalAlpha = 1;
      }
    }

    // 特效
    for (let i = 0; i < st.fx.length; i++) drawFx(st.fx[i]);

    // 伤害数字
    for (let i = 0; i < st.texts.length; i++) {
      const t = st.texts[i];
      const k = t.t / t.life;
      if (k > 1) continue;
      const yy = sy(t.y) - Math.round(k * 12);
      ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      drawText(String(t.v), sx(t.x), yy, t.color, t.crit ? 2 : 1);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // 暗角
    ctx.drawImage(vignette, 0, 0);

    // 受伤红屏（边缘泛红，不糊中心）
    if (p.hurtFlash > 0) {
      ctx.globalAlpha = Math.max(0, p.hurtFlash / 0.22) * 0.7;
      ctx.drawImage(hurtVig, 0, 0);
      ctx.globalAlpha = 1;
    }

    if (shakeT > 0) shakeT -= 1 / 60;
  }

  function drawFloor(set) {
    const startX = Math.floor(camX / 16), startY = Math.floor(camY / 16);
    const cols = Math.ceil(W / 16) + 1, rows = Math.ceil(H / 16) + 1;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const wx = startX + tx, wy = startY + ty;
        const v = ((wx * 73856093) ^ (wy * 19349663)) & 3;
        ctx.drawImage(set[v], wx * 16 - camX, wy * 16 - camY);
      }
    }
  }

  function drawDust(time) {
    ctx.fillStyle = 'rgba(180,190,220,0.10)';
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      const x = (d.x * W + Math.sin(time * 0.3 + d.p) * 12) % W;
      const y = (d.y * H + time * 4 * d.s) % H;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  function drawNpcs(st, time) {
    // 装饰：石柱与火把
    const pillars = [[90, 80], [470, 80], [90, 290], [470, 290]];
    for (let i = 0; i < pillars.length; i++) {
      const px = sx(pillars[i][0]), py = sy(pillars[i][1]);
      ctx.fillStyle = '#1a1713';
      ctx.fillRect(px - 5, py - 22, 10, 24);
      ctx.fillStyle = '#2e2822';
      ctx.fillRect(px - 4, py - 21, 8, 22);
      ctx.fillStyle = '#3b342c';
      ctx.fillRect(px - 6, py - 24, 12, 3);
    }
    const torches = [[280, 58], [60, 190], [500, 190]];
    for (let i = 0; i < torches.length; i++) {
      const tx = sx(torches[i][0]), ty = sy(torches[i][1]);
      const f = 0.12 + 0.05 * Math.sin(time * 7 + i);
      ctx.globalAlpha = f;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.arc(tx, ty - 6, 16, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#3b342c';
      ctx.fillRect(tx - 1, ty - 6, 2, 7);
      ctx.fillStyle = '#ffd9a0';
      ctx.fillRect(tx - 1, ty - 9, 2, 2);
    }

    const list = D.TOWN.npcs.slice().sort(function (a, b) { return a.y - b.y; });
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      shadow(n.x, n.y + 1, 7, 0.3);
      const bob = Math.sin(time * 2 + n.x * 0.1) * 0.8;

      if (n.id === 'portal') {
        ctx.globalAlpha = 0.16 + 0.08 * Math.sin(time * 3);
        ctx.fillStyle = '#8a5ad9';
        ctx.beginPath();
        ctx.arc(sx(n.x), sy(n.y) - 6, 17, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      blitWorld(n.sprite, n.x, n.y + bob, false, false);

      if (st.nearNpc === n.id) {
        const yb = sy(n.y) - 26 + Math.sin(time * 6) * 1.5;
        ctx.fillStyle = '#e0c060';
        ctx.fillRect(sx(n.x) - 1, yb, 2, 2);
        ctx.fillRect(sx(n.x) - 2, yb + 3, 4, 2);
        ctx.fillRect(sx(n.x) - 1, yb + 6, 2, 2);
      }
    }
  }

  function drawEnemy(e, time) {
    const flash = e.flash > 0;
    shadow(e.x, e.y + 1, e.r, 0.3);

    if (e.elite) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(time * 6);
      ctx.fillStyle = '#e0c060';
      ctx.beginPath();
      ctx.arc(sx(e.x), sy(e.y) - 4, e.r + 3, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const bob = e.wobble ? Math.sin(time * 8 + e.seed) * 1.5 : 0;
    blitWorld(e.sprite, e.x, e.y + bob, false, flash);

    if (e.chill > 0) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#7fdcff';
      ctx.fillRect(sx(e.x) - e.r, sy(e.y) - 10, e.r * 2, 2);
      ctx.globalAlpha = 1;
    }
    if (e.burn > 0) {
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 12);
      ctx.fillStyle = '#ff8a3d';
      ctx.fillRect(sx(e.x) - 1, sy(e.y) - 14, 2, 2);
      ctx.globalAlpha = 1;
    }

    // 精英/首领血条
    if ((e.elite || e.boss) && e.hp < e.maxHp) {
      const w = e.boss ? 26 : 14;
      const hx = sx(e.x) - w / 2, hy = sy(e.y) - (e.boss ? 26 : 16);
      ctx.fillStyle = '#0a0a10';
      ctx.fillRect(hx - 1, hy - 1, w + 2, 3);
      ctx.fillStyle = e.boss ? '#c0392b' : '#e0c060';
      ctx.fillRect(hx, hy, Math.max(0, w * (e.hp / e.maxHp)), 1);
    }
  }

  function drawOthers(st, time) {
    const me = st.player;
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p === me || !p.alive) continue;
      shadow(p.x, p.y + 1, 6, 0.3);
      const bob = p.moving ? Math.sin(p.walkT) * 1.2 : Math.sin(time * 2 + i) * 0.5;
      ctx.globalAlpha = p.downed ? 0.45 : 0.92;
      blitWorld('hero', p.x, p.y + bob, p.face < 0, false);
      ctx.globalAlpha = 1;

      const cx = sx(p.x), cy = sy(p.y);
      const w = 11;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(cx - w / 2, cy - 13, w, 2);
      ctx.fillStyle = p.downed ? '#c0392b' : '#6fdc8f';
      ctx.fillRect(cx - w / 2, cy - 13, Math.max(0, w * (p.hp / p.maxHp)), 2);

      const COL = ['#7fdcff', '#ffb347', '#b07cff', '#6fdc8f'];
      ctx.fillStyle = p.downed ? '#ff6b6b' : COL[i % 4];
      ctx.beginPath();
      ctx.moveTo(cx, cy - 15);
      ctx.lineTo(cx - 3, cy - 19);
      ctx.lineTo(cx + 3, cy - 19);
      ctx.closePath();
      ctx.fill();

      if (p.downed) {
        ctx.globalAlpha = 0.45 + Math.sin(time * 8) * 0.25;
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, 6.2832);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPlayer(st, time) {
    const p = st.player;
    // 柔和光晕，保证在怪堆里也能一眼看到自己
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#a8c4e8';
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.y) - 4, 12, 7, 0, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.ellipse(sx(p.x), sy(p.y) - 4, 18, 11, 0, 0, 6.2832);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (p.downed) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 13, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    shadow(p.x, p.y + 1, 6, 0.35);
    const bob = p.moving ? Math.sin(p.walkT) * 1.2 : Math.sin(time * 2) * 0.5;
    const frame = p.moving && Math.floor(p.walkT / 3) % 2 === 0 ? 'hero2' : 'hero';
    blitWorld(frame, p.x, p.y + bob, p.face < 0, p.invuln > 0 && Math.floor(time * 20) % 2 === 0);

    // 拾取范围提示（很淡）
    if (st.phase !== 'town') {
      ctx.globalAlpha = 0.05;
      ctx.strokeStyle = '#7ef5ea';
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), p.pickup, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawShot(s) {
    if (s.kind === 'boomerang') {
      ctx.save();
      ctx.translate(sx(s.x), sy(s.y));
      ctx.rotate(s.spin);
      blit('icon_axe', 0, 3, false, false);
      ctx.restore();
      return;
    }
    const x = sx(s.x), y = sy(s.y);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd9a0';
    ctx.fillRect(x, y, 1, 1);
    // 尾迹
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ff6b2b';
    ctx.fillRect(x - Math.round(s.vx * 0.03), y - Math.round(s.vy * 0.03), 1, 1);
    ctx.globalAlpha = 1;
  }

  function drawFx(f) {
    const k = Math.min(1, f.t / f.dur);
    if (f.kind === 'ring') {
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(f.x), sy(f.y), Math.max(1, f.r * (0.3 + 0.7 * k)), 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'spark') {
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = f.color;
      ctx.fillRect(sx(f.x), sy(f.y), f.size || 1, f.size || 1);
      ctx.globalAlpha = 1;
    } else if (f.kind === 'slash') {
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx(f.x), sy(f.y), f.r * (0.7 + 0.3 * k), f.ang - 0.7, f.ang + 0.7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'bolt') {
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(f.x), sy(f.y));
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        ctx.lineTo(
          sx(f.x + (f.x2 - f.x) * t) + (Math.random() - 0.5) * 4,
          sy(f.y + (f.y2 - f.y) * t) + (Math.random() - 0.5) * 4
        );
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (f.kind === 'hit') {
      ctx.globalAlpha = (1 - k) * 0.6;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx(f.x), sy(f.y), f.r * (0.5 + k), 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  let minimapOn = true;

  function drawMinimap(st, time) {
    if (!minimapOn) return;
    const M = 58, pad = 6;
    const x0 = W - M - pad, y0 = pad;
    const isTown = st.phase === 'town';
    const worldW = isTown ? D.TOWN.w : CFG.worldSize;
    const worldH = isTown ? D.TOWN.h : CFG.worldSize;
    const k = M / Math.max(worldW, worldH);

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(x0, y0, M, M);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#2e2e3c';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, M - 1, M - 1);

    const mx = function (wx) { return x0 + wx * k; };
    const my = function (wy) { return y0 + wy * k; };

    // 掉落物（按稀有度上色）
    for (let i = 0; i < st.pickups.length; i++) {
      const pk = st.pickups[i];
      if (pk.dead) continue;
      let col = null;
      if (pk.kind === 'item') col = D.RARITY_COLOR[pk.item ? pk.item.rarity : 0];
      else if (pk.kind === 'gold') col = '#e0c060';
      else if (pk.kind === 'heal') col = '#6fdc8f';
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(mx(pk.x)), Math.round(my(pk.y)), 1, 1);
    }

    // 敌人
    for (let i = 0; i < st.enemies.length; i++) {
      const e = st.enemies[i];
      if (e.dead) continue;
      if (e.boss) {
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(mx(e.x) - 1, my(e.y) - 1, 3, 3);
      } else {
        ctx.fillStyle = e.elite ? '#b07cff' : '#7a3a3a';
        ctx.fillRect(Math.round(mx(e.x)), Math.round(my(e.y)), 1, 1);
      }
    }

    // 队友
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p === st.player || !p.alive) continue;
      ctx.fillStyle = '#7fdcff';
      ctx.fillRect(Math.round(mx(p.x)) - 1, Math.round(my(p.y)) - 1, 2, 2);
    }

    // 自己
    const me = st.player;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(mx(me.x)) - 1, Math.round(my(me.y)) - 1, 2, 2);

    // 视口框
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.strokeRect(mx(camX) + 0.5, my(camY) + 0.5, W * k, H * k);
  }
  function addShake(mag) {
    shakeMag = mag;
    shakeT = 0.12;
  }

  root.RENDER = {
    init: init, resize: resize, draw: draw, addShake: addShake,
    toggleMinimap: function () { minimapOn = !minimapOn; return minimapOn; },
    W: W, H: H, blitRaw: blitRaw,
    worldAt: function (clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      return { x: (clientX - r.left) / scale + camX, y: (clientY - r.top) / scale + camY };
    },
    getScale: function () { return scale; },
    debugInfo: function () {
      return {
        cacheKeys: Object.keys(cache),
        scale: scale,
        camX: camX, camY: camY,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0
      };
    }
  };
})(window);
