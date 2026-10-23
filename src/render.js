// All the world art is drawn with code — no image files needed.
import { TILE, NOW, THEN } from './level.js';

export const VIEW_W = 480;
export const VIEW_H = 270;

export function hash(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// ---------- Static tile layers (pre-rendered once per era) ----------

function drawStone(g, level, tx, ty, era) {
  const px = tx * TILE, py = ty * TILE;
  const open = !level.isSolid(tx, ty - 1, era);
  if (era === NOW) {
    g.fillStyle = '#1f3036';
    g.fillRect(px, py, TILE, TILE);
    for (let i = 0; i < 4; i++) {
      const r = hash(tx * 7 + i, ty * 13 + i);
      g.fillStyle = r > 0.5 ? '#283d44' : '#18262b';
      g.fillRect(px + Math.floor(r * 14), py + Math.floor(hash(tx + i, ty) * 14), 2, 2);
    }
    if (open) {
      g.fillStyle = '#3d7a5c';
      g.fillRect(px, py, TILE, 2);
      g.fillStyle = '#2c5a45';
      for (let i = 0; i < TILE; i += 2) {
        const d = Math.floor(hash(tx * 16 + i, ty) * 4);
        g.fillRect(px + i, py + 2, 1, d);
      }
    }
  } else {
    g.fillStyle = '#7a573a';
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = '#5e4129';
    g.fillRect(px, py + 7, TILE, 1);
    g.fillRect(px, py + 15, TILE, 1);
    const off = ty % 2 ? 4 : 12;
    g.fillRect(px + off, py, 1, 7);
    g.fillRect(px + ((off + 8) % 16), py + 8, 1, 7);
    g.fillStyle = '#8a6646';
    g.fillRect(px + Math.floor(hash(tx, ty) * 12), py + 2, 3, 2);
    if (open) {
      g.fillStyle = '#c4935c';
      g.fillRect(px, py, TILE, 2);
    }
  }
}

function drawBrass(g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  g.fillStyle = '#5a3a1a';
  g.fillRect(px, py, TILE, 7);
  g.fillStyle = '#a8742f';
  g.fillRect(px, py, TILE, 5);
  g.fillStyle = '#e0aa55';
  g.fillRect(px, py, TILE, 2);
  g.fillStyle = '#ffd98a';
  g.fillRect(px + 3, py + 3, 1, 1);
  g.fillRect(px + 12, py + 3, 1, 1);
  // little support strut
  g.fillStyle = '#6b4520';
  g.fillRect(px + 7, py + 7, 2, 3);
}

function drawRubble(g, tx, ty) {
  const px = tx * TILE, py = ty * TILE;
  g.fillStyle = '#2c3a3c';
  g.fillRect(px, py + 2, TILE, 10);
  for (let i = 0; i < 5; i++) {
    const r = hash(tx * 11 + i, ty * 3);
    g.fillStyle = r > 0.5 ? '#3f5052' : '#24302f';
    g.fillRect(px + Math.floor(r * 12), py + 2 + Math.floor(hash(i, tx) * 7), 4, 3);
  }
  g.fillStyle = '#3d7a5c';
  g.fillRect(px, py + 1, TILE, 2);
  // coral and anemones
  for (let i = 0; i < 3; i++) {
    const r = hash(tx + i * 5, ty + 9);
    g.fillStyle = i === 1 ? '#e6b85c' : '#d9776b';
    g.fillRect(px + 2 + Math.floor(r * 11), py - 1 + Math.floor(hash(tx, i) * 2), 2, 2);
  }
  g.fillStyle = '#1a2526';
  g.fillRect(px, py + 11, TILE, 2);
}

function drawSpikes(g, tx, ty, era) {
  const px = tx * TILE, py = ty * TILE;
  g.fillStyle = era === NOW ? '#5c4a40' : '#9aa3a8';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(px + i * 4, py + TILE);
    g.lineTo(px + i * 4 + 2, py + 6);
    g.lineTo(px + i * 4 + 4, py + TILE);
    g.fill();
  }
  g.fillStyle = era === NOW ? '#8a6a52' : '#e6edf0';
  for (let i = 0; i < 4; i++) g.fillRect(px + i * 4 + 2, py + 6, 1, 3);
}

// Faint outline of things that only exist in the other era.
function drawGhost(g, level, tx, ty, ch, color) {
  const px = tx * TILE, py = ty * TILE;
  g.fillStyle = color.replace('A', '0.07');
  g.fillRect(px, py, TILE, TILE / 2);
  g.fillStyle = color.replace('A', '0.35');
  if (level.get(tx, ty - 1) !== ch) g.fillRect(px, py, TILE, 1);
  if (level.get(tx - 1, ty) !== ch) g.fillRect(px, py, 1, TILE / 2);
  if (level.get(tx + 1, ty) !== ch) g.fillRect(px + TILE - 1, py, 1, TILE / 2);
  for (let i = 0; i < TILE; i += 4) g.fillRect(px + i, py + TILE / 2, 2, 1);
}

export function buildTileLayer(level, era) {
  const c = document.createElement('canvas');
  c.width = level.pxW;
  c.height = level.pxH;
  const g = c.getContext('2d');
  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) {
      const ch = level.get(tx, ty);
      if (ch === '#') drawStone(g, level, tx, ty, era);
      else if (ch === 'P') {
        if (era === THEN) drawBrass(g, tx, ty);
        else drawGhost(g, level, tx, ty, 'P', 'rgba(255,190,110,A)');
      } else if (ch === 'F') {
        if (era === NOW) drawRubble(g, tx, ty);
        else drawGhost(g, level, tx, ty, 'F', 'rgba(130,230,240,A)');
      } else if (ch === '^') drawSpikes(g, tx, ty, era);
    }
  }
  return c;
}

// ---------- Animated tiles ----------

export function drawGear(ctx, x, y, r, angle, era) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = era === THEN ? '#d4a147' : '#4e3428';
  const teeth = 8;
  for (let i = 0; i < teeth; i++) {
    ctx.save();
    ctx.rotate((i / teeth) * Math.PI * 2);
    ctx.fillRect(-1.5, -r - 2, 3, 4);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = era === THEN ? '#8a6326' : '#2e1f19';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
  if (era === THEN) {
    ctx.fillStyle = '#ffe3a0';
    ctx.fillRect(-1, -r + 1, 2, 2);
  }
  ctx.restore();
}

export function drawDynamicTiles(ctx, level, era, cam, t) {
  const x0 = Math.max(0, Math.floor(cam.x / TILE)), x1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (level.get(tx, ty) === 'G') {
        const ang = era === THEN ? t * 4 : 0.4;
        drawGear(ctx, tx * TILE + 8, ty * TILE + 9, 6, ang, era);
      }
    }
  }
}

export function drawWater(ctx, level, era, cam, t) {
  if (era !== NOW) return;
  const x0 = Math.max(0, Math.floor(cam.x / TILE)), x1 = Math.min(level.w - 1, Math.floor((cam.x + VIEW_W) / TILE));
  const y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(level.h - 1, Math.floor((cam.y + VIEW_H) / TILE));
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!level.isWater(tx, ty, era)) continue;
      const px = tx * TILE, py = ty * TILE;
      const surface = !level.isWater(tx, ty - 1, era) && !level.isSolid(tx, ty - 1, era);
      if (surface) {
        for (let i = 0; i < TILE; i += 2) {
          const wx = px + i;
          const wy = py + 2 + Math.sin(wx * 0.15 + t * 2.2) * 1.2;
          ctx.fillStyle = 'rgba(40,140,170,0.42)';
          ctx.fillRect(wx, wy, 2, py + TILE - wy);
          ctx.fillStyle = 'rgba(170,235,255,0.55)';
          ctx.fillRect(wx, wy, 2, 1);
        }
      } else {
        ctx.fillStyle = 'rgba(30,115,150,0.42)';
        ctx.fillRect(px, py, TILE, TILE);
        // drifting caustic glints
        const r = hash(tx, ty);
        const glint = Math.sin(t * 1.5 + r * 30);
        if (glint > 0.85) {
          ctx.fillStyle = 'rgba(160,230,255,0.18)';
          ctx.fillRect(px + Math.floor(r * 12), py + Math.floor(hash(ty, tx) * 12), 3, 1);
        }
      }
    }
  }
}

// ---------- Backgrounds ----------

const towers = [];
for (let i = 0; i < 40; i++) {
  towers.push({
    x: i * 70 + hash(i, 1) * 40,
    w: 24 + hash(i, 2) * 30,
    h: 80 + hash(i, 3) * 140,
    tilt: (hash(i, 4) - 0.5) * 0.25,
    seed: i,
  });
}

export function drawBackground(ctx, era, cam, t) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  if (era === NOW) {
    grad.addColorStop(0, '#0d3140');
    grad.addColorStop(1, '#03111a');
  } else {
    grad.addColorStop(0, '#2a2038');
    grad.addColorStop(0.55, '#6e3a3a');
    grad.addColorStop(1, '#c0703e');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // distant bell tower
  const bx = 1500 - cam.x * 0.08, by = 40 - cam.y * 0.05;
  ctx.save();
  ctx.translate(bx, by);
  if (era === NOW) ctx.rotate(0.12);
  ctx.fillStyle = era === NOW ? '#0a2733' : '#3a2433';
  ctx.fillRect(-14, 20, 28, 260);
  ctx.beginPath(); ctx.moveTo(-18, 20); ctx.lineTo(0, -10); ctx.lineTo(18, 20); ctx.fill();
  ctx.fillStyle = era === NOW ? '#0f3a47' : '#ffcf6b';
  ctx.beginPath(); ctx.arc(0, 34, 7, Math.PI, 0); ctx.lineTo(8, 42); ctx.lineTo(-8, 42); ctx.fill();
  ctx.restore();

  // city silhouettes, two parallax layers
  for (let layer = 0; layer < 2; layer++) {
    const par = layer === 0 ? 0.15 : 0.32;
    const base = VIEW_H + 40 - cam.y * par * 0.6 + layer * 30;
    for (const tw of towers) {
      if ((tw.seed + layer) % 2) continue;
      const sx = tw.x - cam.x * par + layer * 35;
      if (sx < -80 || sx > VIEW_W + 80) continue;
      ctx.save();
      ctx.translate(sx, base);
      if (era === NOW) ctx.rotate(tw.tilt);
      ctx.fillStyle = era === NOW ? (layer ? '#0a2a35' : '#0b2e3b') : (layer ? '#2c1c28' : '#43283a');
      ctx.fillRect(-tw.w / 2, -tw.h, tw.w, tw.h);
      ctx.fillRect(-tw.w / 2 - 3, -tw.h, tw.w + 6, 4);
      // windows
      for (let wy = -tw.h + 10; wy < -10; wy += 12) {
        for (let wx = -tw.w / 2 + 4; wx < tw.w / 2 - 4; wx += 8) {
          const r = hash(Math.floor(wx) + tw.seed * 31, Math.floor(wy) + layer);
          if (era === THEN && r > 0.55) {
            ctx.fillStyle = r > 0.85 ? '#ffd98a' : '#d98a4a';
            ctx.fillRect(wx, wy, 3, 4);
          } else if (era === NOW && r > 0.8) {
            ctx.fillStyle = '#123f4d';
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
      ctx.restore();
    }
  }

  if (era === NOW) {
    // light shafts from far above
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const sx = ((i * 160 - cam.x * 0.2) % 640 + 640) % 640 - 80 + Math.sin(t * 0.3 + i) * 12;
      ctx.fillStyle = 'rgba(90,200,230,0.035)';
      ctx.beginPath();
      ctx.moveTo(sx, 0); ctx.lineTo(sx + 30, 0); ctx.lineTo(sx + 90, VIEW_H); ctx.lineTo(sx + 20, VIEW_H);
      ctx.fill();
    }
    ctx.restore();
    // drifting motes
    ctx.fillStyle = 'rgba(180,240,255,0.35)';
    for (let i = 0; i < 40; i++) {
      const sx = ((hash(i, 7) * 600 - cam.x * 0.5 + Math.sin(t * 0.5 + i) * 6) % 520 + 520) % 520 - 20;
      const sy = ((hash(i, 8) * 320 - t * (6 + hash(i, 9) * 8) - cam.y * 0.5) % 300 + 300) % 300 - 15;
      ctx.fillRect(sx, sy, 1, 1);
    }
  } else {
    // rain
    ctx.strokeStyle = 'rgba(210,200,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const sx = ((hash(i, 5) * 560 + t * 60 - cam.x * 0.6) % 520 + 520) % 520 - 20;
      const sy = ((hash(i, 6) * 300 + t * 380) % 300) - 15;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 3, sy + 9);
    }
    ctx.stroke();
  }
}

export function drawVignette(ctx, era) {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 90, VIEW_W / 2, VIEW_H / 2, 300);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, era === NOW ? 'rgba(0,8,14,0.65)' : 'rgba(30,10,10,0.45)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// Pixel heart for the HUD
export function drawHeart(ctx, x, y, full) {
  const shape = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c] !== '#') continue;
      ctx.fillStyle = full ? (r === 0 || (r === 1 && c < 2) ? '#ff9a8a' : '#e0454a') : '#3a3f48';
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}
