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
      const c = level.get(tx, ty);
      if (c === 'G') {
        const ang = era === THEN ? t * 4 : 0.4;
        drawGear(ctx, tx * TILE + 8, ty * TILE + 9, 6, ang, era);
      } else if (c === '|') {
        drawGate(ctx, tx * TILE, ty * TILE, level.gatesClosed, level.get(tx, ty - 1) !== '|', era);
      } else if (c === ':') {
        drawSeal(ctx, tx * TILE, ty * TILE, level.sealOpen, level.get(tx, ty - 1) !== ':', era);
      } else if (c === '_') {
        drawPlate(ctx, tx * TILE, ty * TILE, level.plateAt(tx, ty), era);
      } else if (c === '=') {
        drawDoor(ctx, level, tx, ty, era);
      }
    }
  }
}

// The arena portcullis: iron bars that drop while the boss is awake.
function drawGate(ctx, px, py, closed, top, era) {
  ctx.fillStyle = era === NOW ? '#1c2a2e' : '#3a2a1a';
  if (top) ctx.fillRect(px, py, TILE, 3);
  if (!closed) return;
  ctx.fillStyle = era === NOW ? '#3c4c50' : '#5a5048';
  for (let i = 1; i < TILE; i += 5) ctx.fillRect(px + i, py, 2, TILE);
  ctx.fillRect(px, py + 7, TILE, 2);
  ctx.fillStyle = era === NOW ? '#6a5a4a' : '#c9973f';
  for (let i = 1; i < TILE; i += 5) ctx.fillRect(px + i, py + TILE - 3, 2, 3);
}

// The sealed brass door to the Great Bell.
function drawSeal(ctx, px, py, open, top, era) {
  if (open) {
    if (top) { ctx.fillStyle = era === NOW ? '#1c2a2e' : '#3a2a1a'; ctx.fillRect(px, py, TILE, 3); }
    return;
  }
  ctx.fillStyle = era === NOW ? '#2f4440' : '#8a6326';
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = era === NOW ? '#3f5a52' : '#c9973f';
  ctx.fillRect(px + 2, py, 2, TILE);
  ctx.fillRect(px + 12, py, 2, TILE);
  if (top) {
    ctx.fillStyle = era === NOW ? '#5fae8e' : '#ffd36b';
    ctx.beginPath(); ctx.arc(px + 8, py + 9, 3, Math.PI, 0); ctx.fill();
    ctx.fillRect(px + 5, py + 9, 6, 2);
  }
}

// A pressure plate set into the floor. It sinks and lights up while something heavy is on it.
function drawPlate(ctx, px, py, plate, era) {
  const down = plate && plate.pressed;
  const now = era === NOW;
  ctx.fillStyle = now ? '#18262b' : '#4a3424';
  ctx.fillRect(px, py + 12, TILE, 4);
  ctx.fillStyle = down ? (now ? '#5fae8e' : '#ffd36b') : (now ? '#3c4c48' : '#a8742f');
  ctx.fillRect(px + 1, py + (down ? 13 : 11), TILE - 2, 2);
  ctx.fillStyle = now ? '#2c3a3c' : '#6b4520';
  ctx.fillRect(px + 1, py + (down ? 15 : 13), TILE - 2, 1);
  if (down) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = now ? 'rgba(95,174,142,0.25)' : 'rgba(255,211,107,0.25)';
    ctx.fillRect(px - 2, py + 8, TILE + 4, 6);
    ctx.restore();
  }
}

// A weighted door: an iron shutter that rolls up into the lintel while a plate is pressed.
function drawDoor(ctx, level, tx, ty, era) {
  let top = ty, bot = ty;
  while (level.get(tx, top - 1) === '=') top--;
  while (level.get(tx, bot + 1) === '=') bot++;
  const px = tx * TILE, py = ty * TILE;
  const bottom = top * TILE + (bot - top + 1) * TILE * (1 - level.doorAnim);
  const h = Math.min(TILE, bottom - py);
  const now = era === NOW;
  if (h > 0) {
    ctx.fillStyle = now ? '#24302f' : '#3b3632';
    ctx.fillRect(px + 2, py, TILE - 4, h);
    ctx.fillStyle = now ? '#2f4440' : '#56504a';
    for (let y = 0; y < h; y += 4) ctx.fillRect(px + 2, py + y, TILE - 4, 1);
    ctx.fillStyle = now ? '#3d7a5c' : '#a8742f';
    ctx.fillRect(px + 2, py, 2, h);
    ctx.fillRect(px + TILE - 4, py, 2, h);
    if (py + h >= bottom - 0.5) {
      ctx.fillStyle = now ? '#5a3d2e' : '#c9973f';
      ctx.fillRect(px + 2, py + h - 2, TILE - 4, 2);
    }
  }
  if (ty === top) {
    ctx.fillStyle = now ? '#1c2a2e' : '#3a2a1a';
    ctx.fillRect(px, py, TILE, 3);
  }
}

export function drawWater(ctx, level, era, cam, t, alpha = 1) {
  if (era !== NOW || alpha <= 0) return;
  if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
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
  if (alpha < 1) ctx.restore();
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

export function drawBackground(ctx, era, cam, t, kind = 'city') {
  if (kind === 'belfry') { drawBelfry(ctx, era, cam, t); return; }
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

// Inside the belfry: tall arched windows onto the storm, and the great timber frame that holds the bells.
function drawBelfry(ctx, era, cam, t) {
  const now = era === NOW;
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  if (now) { grad.addColorStop(0, '#0b2a35'); grad.addColorStop(1, '#020b10'); }
  else { grad.addColorStop(0, '#24161e'); grad.addColorStop(1, '#3e2320'); }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // arched windows, far back
  const par = 0.18;
  for (let i = -1; i < 4; i++) {
    const wx = Math.floor((cam.x * par) / 200) * 200 + i * 200;
    const sx = wx - cam.x * par + 60, sy = 60 - ((cam.y * par) % 320);
    for (const oy of [0, 320]) {
      const y = sy + oy;
      ctx.fillStyle = now ? '#0e3a47' : '#5a3036';
      ctx.beginPath();
      ctx.moveTo(sx, y + 110); ctx.lineTo(sx, y + 20); ctx.arc(sx + 20, y + 20, 20, Math.PI, 0); ctx.lineTo(sx + 40, y + 110);
      ctx.fill();
      if (!now) {
        // rain beyond the glass
        ctx.strokeStyle = 'rgba(210,200,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let r = 0; r < 6; r++) {
          const rx = sx + 4 + ((hash(i + r, oy) * 32 + t * 30) % 32);
          const ry = y + 10 + ((hash(r, i) * 90 + t * 260) % 90);
          ctx.moveTo(rx, ry); ctx.lineTo(rx - 2, ry + 7);
        }
        ctx.stroke();
      }
      ctx.fillStyle = now ? '#082630' : '#2a1820';
      ctx.fillRect(sx + 19, y + 2, 2, 108);
      ctx.fillRect(sx, y + 60, 40, 2);
    }
  }

  // the timber frame
  const par2 = 0.4;
  const beam = now ? '#081f27' : '#1e1216';
  const edge = now ? '#0f2f3a' : '#33202a';
  for (let i = -1; i < 5; i++) {
    const wx = Math.floor((cam.x * par2) / 150) * 150 + i * 150;
    const sx = wx - cam.x * par2;
    const seed = Math.round(wx / 150);
    ctx.fillStyle = beam;
    ctx.fillRect(sx, 0, 12, VIEW_H);
    ctx.fillStyle = edge;
    ctx.fillRect(sx, 0, 2, VIEW_H);
    // braces and cross beams
    for (let j = -1; j < 3; j++) {
      const by = j * 140 - ((cam.y * par2) % 140);
      const broken = now && hash(seed, j) > 0.6;
      ctx.fillStyle = beam;
      ctx.fillRect(sx, by, broken ? 70 : 150, 10);
      ctx.save();
      ctx.translate(sx + 12, by + 10);
      ctx.rotate(0.75);
      ctx.fillRect(0, 0, broken ? 60 : 180, 8);
      ctx.restore();
    }
  }

  if (now) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const sx = ((i * 200 - cam.x * 0.25) % 600 + 600) % 600 - 60 + Math.sin(t * 0.3 + i) * 10;
      ctx.fillStyle = 'rgba(90,200,230,0.03)';
      ctx.beginPath();
      ctx.moveTo(sx, 0); ctx.lineTo(sx + 26, 0); ctx.lineTo(sx + 80, VIEW_H); ctx.lineTo(sx + 16, VIEW_H);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(180,240,255,0.3)';
    for (let i = 0; i < 30; i++) {
      const sx = ((hash(i, 7) * 600 - cam.x * 0.5) % 520 + 520) % 520 - 20;
      const sy = ((hash(i, 8) * 320 - t * (5 + hash(i, 9) * 7) - cam.y * 0.5) % 300 + 300) % 300 - 15;
      ctx.fillRect(sx, sy, 1, 1);
    }
  } else {
    // dust shaken loose by the bells
    ctx.fillStyle = 'rgba(230,200,160,0.25)';
    for (let i = 0; i < 24; i++) {
      const sx = ((hash(i, 3) * 600 - cam.x * 0.5 + Math.sin(t + i) * 4) % 520 + 520) % 520 - 20;
      const sy = ((hash(i, 4) * 320 + t * (8 + hash(i, 5) * 10) - cam.y * 0.5) % 300 + 300) % 300 - 15;
      ctx.fillRect(sx, sy, 1, 1);
    }
  }
}

// The ending: Carillon at dawn, dry and upright, the way it was meant to be.
export function drawDawn(ctx, t) {
  const HZ = 186; // the horizon
  const sky = ctx.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#6f9fc8');
  sky.addColorStop(0.6, '#e9c3a6');
  sky.addColorStop(1, '#ffe1b0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // the sun, just clearing the sea
  const sx = 132, sy = HZ - 8 - Math.min(18, t * 0.5);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(sx, sy, 6, sx, sy, 150);
  g.addColorStop(0, 'rgba(255,240,200,0.65)');
  g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(sx, sy, 16, 0, Math.PI * 2); ctx.fill();

  // slow clouds
  ctx.fillStyle = 'rgba(255,240,230,0.5)';
  for (let i = 0; i < 6; i++) {
    const cx = ((hash(i, 1) * 600 + t * (3 + i)) % 640) - 80;
    const cy = 18 + hash(i, 2) * 70;
    const w = 36 + hash(i, 3) * 56;
    ctx.beginPath(); ctx.ellipse(cx, cy, w, 5 + hash(i, 4) * 4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // the calm sea, and a path of light across it
  const sea = ctx.createLinearGradient(0, HZ, 0, VIEW_H);
  sea.addColorStop(0, '#a9c6cc');
  sea.addColorStop(1, '#4a7890');
  ctx.fillStyle = sea;
  ctx.fillRect(0, HZ, VIEW_W, VIEW_H - HZ);
  ctx.fillStyle = 'rgba(255,245,215,0.85)';
  for (let i = 0; i < 30; i++) {
    const gy = HZ + 2 + hash(i, 8) * 40;
    const spread = 8 + (gy - HZ) * 0.9;
    const gx = sx + (hash(i, 9) - 0.5) * spread * 2 + Math.sin(t * 1.3 + i) * 3;
    if (Math.sin(t * 2 + i * 1.7) > 0.1) ctx.fillRect(gx, gy, 3 + hash(i, 7) * 6, 1);
  }

  // the city on the shore, upright and dry: far roofs, then near ones
  const TX = 368; // the bell tower
  for (let layer = 0; layer < 2; layer++) {
    const base = VIEW_H;
    const n = 20;
    for (let i = 0; i < n; i++) {
      const x = i * 26 + (layer ? 13 : 0) + hash(i, layer) * 8 - 12;
      const w = 18 + hash(i, layer + 5) * 14;
      const h = (layer ? 22 : 42) + hash(i, layer + 9) * (layer ? 26 : 34);
      if (layer === 0 && Math.abs(x + w / 2 - TX) < 22) continue;
      const top = base - h;
      ctx.fillStyle = layer ? '#5a3a46' : '#8a6070';
      ctx.fillRect(x, top, w, h);
      ctx.beginPath(); ctx.moveTo(x - 2, top); ctx.lineTo(x + w / 2, top - 8 - hash(i, 3) * 7); ctx.lineTo(x + w + 2, top); ctx.fill();
      for (let wy = top + 6; wy < base - 4; wy += 9) {
        for (let wx = x + 3; wx < x + w - 3; wx += 6) {
          const r = hash(Math.floor(wx) + layer * 99, Math.floor(wy));
          if (r > 0.72) { ctx.fillStyle = r > 0.93 ? '#ffe7a8' : layer ? '#7a5060' : '#b98a8a'; ctx.fillRect(wx, wy, 2, 3); }
        }
      }
    }
  }
  // the bell tower, with the Great Bell hanging silent in its arch
  const ty = 92;
  ctx.fillStyle = '#7a5262';
  ctx.fillRect(TX - 12, ty, 24, VIEW_H - ty);
  ctx.beginPath(); ctx.moveTo(TX - 16, ty); ctx.lineTo(TX, ty - 30); ctx.lineTo(TX + 16, ty); ctx.fill();
  ctx.fillStyle = '#4a2e3a';
  ctx.beginPath(); ctx.moveTo(TX - 8, ty + 30); ctx.lineTo(TX - 8, ty + 14); ctx.arc(TX, ty + 14, 8, Math.PI, 0); ctx.lineTo(TX + 8, ty + 30); ctx.fill();
  ctx.fillStyle = '#d9a24f';
  ctx.beginPath(); ctx.moveTo(TX - 5, ty + 27); ctx.quadraticCurveTo(TX - 5, ty + 15, TX, ty + 15); ctx.quadraticCurveTo(TX + 5, ty + 15, TX + 5, ty + 27); ctx.fill();
  ctx.fillStyle = '#ffe3a0';
  ctx.fillRect(TX - 3, ty + 18, 1, 6);
  ctx.fillStyle = '#5a3a46';
  ctx.fillRect(TX - 10, ty + 50, 20, 3);
  ctx.fillStyle = '#ffe7a8';
  ctx.beginPath(); ctx.arc(TX, ty + 66, 5, 0, Math.PI * 2); ctx.fill(); // the clock face, stopped
  ctx.fillStyle = '#5a3a46';
  ctx.fillRect(TX - 0.5, ty + 62, 1, 4);
  ctx.fillRect(TX, ty + 66, 3, 1);

  // gulls
  ctx.strokeStyle = 'rgba(60,50,60,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const gx = ((hash(i, 11) * 500 + t * (12 + i * 3)) % 560) - 40;
    const gy = 40 + hash(i, 12) * 80 + Math.sin(t * 0.8 + i) * 5;
    const flap = Math.sin(t * 6 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(gx - 4, gy - flap); ctx.quadraticCurveTo(gx - 2, gy - 2, gx, gy);
    ctx.quadraticCurveTo(gx + 2, gy - 2, gx + 4, gy - flap);
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
