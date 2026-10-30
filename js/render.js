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
    floorTiles = variants.map(function (pal, idx) {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const g = c.getContext('2d');
      g.fillStyle = pal[0];
      g.fillRect(0, 0, 16, 16);
      // 砖缝
      g.fillStyle = pal[2];
      g.fillRect(0, 15, 16, 1);
      g.fillRect(15, 0, 1, 16);
      // 碎石
      let seed = 1337 + idx * 977;
      const rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      for (let i = 0; i < 5; i++) {
        g.fillStyle = pal[1];
        g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 1 + Math.floor(rnd() * 2), 1);
      }
      return c;
    });

    // 暗角
    vignette = document.createElement('canvas');
    vignette.width = W; vignette.height = H;
    const vg = vignette.getContext('2d');
    const grad = vg.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.86);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, W, H);

    dust = [];
    for (let i = 0; i < 26; i++) {
      dust.push({ x: Math.random() * W, y: Math.random() * H, s: 0.3 + Math.random(), p: Math.random() * 6.28 });
    }
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

    // 摄像机
    let tx = p.x - W / 2, ty = p.y - H / 2;
    const world = CFG.worldSize;
    camX = Math.max(0, Math.min(world - W, tx));
    camY = Math.max(0, Math.min(world - H, ty));

    let ox = 0, oy = 0;
    if (shakeT > 0) {
      ox = (Math.random() - 0.5) * shakeMag;
      oy = (Math.random() - 0.5) * shakeMag;
    }
    ctx.save();
    ctx.translate(Math.round(ox), Math.round(oy));

    drawFloor();
    drawDust(time);

    // 拾取物（最底层）
    for (let i = 0; i < st.pickups.length; i++) {
      const pk = st.pickups[i];
      const bob = Math.sin(time * 5 + pk.t * 3) * 1.2;
      if (pk.kind === 'xp') {
        blitWorld('gem', pk.x, pk.y + bob, false, false);
      } else if (pk.kind === 'item') {
        const col = D.RARITY_COLOR[pk.item.rarity];
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 6);
        ctx.fillStyle = col;
        ctx.fillRect(sx(pk.x) - 1, sy(pk.y) - 10, 2, 9);
        ctx.globalAlpha = 1;
        blitWorld('chest', pk.x, pk.y + bob, false, false);
      } else {
        blitWorld('heart', pk.x, pk.y + bob, false, false);
      }
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
    drawPlayer(st, time);

    // 弹道
    for (let i = 0; i < st.shots.length; i++) drawShot(st.shots[i]);

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

    // 受伤红屏（短促）
    if (p.hurtFlash > 0) {
      ctx.globalAlpha = Math.max(0, p.hurtFlash / 0.22) * 0.16;
      ctx.fillStyle = '#ff2b2b';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (shakeT > 0) shakeT -= 1 / 60;
  }

  function drawFloor() {
    const startX = Math.floor(camX / 16), startY = Math.floor(camY / 16);
    const cols = Math.ceil(W / 16) + 1, rows = Math.ceil(H / 16) + 1;
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const wx = startX + tx, wy = startY + ty;
        const v = ((wx * 73856093) ^ (wy * 19349663)) & 3;
        ctx.drawImage(floorTiles[v], wx * 16 - camX, wy * 16 - camY);
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

    shadow(p.x, p.y + 1, 6, 0.35);
    const bob = p.moving ? Math.sin(p.walkT) * 1.2 : Math.sin(time * 2) * 0.5;
    const frame = p.moving && Math.floor(p.walkT / 3) % 2 === 0 ? 'hero2' : 'hero';
    blitWorld(frame, p.x, p.y + bob, p.face < 0, p.invuln > 0 && Math.floor(time * 20) % 2 === 0);

    // 拾取范围提示（很淡）
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#7ef5ea';
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), p.pickup, 0, 6.2832);
    ctx.stroke();
    ctx.globalAlpha = 1;
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

  function addShake(mag) {
    shakeMag = mag;
    shakeT = 0.12;
  }

  root.RENDER = {
    init: init, resize: resize, draw: draw, addShake: addShake,
    W: W, H: H, blitRaw: blitRaw,
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
