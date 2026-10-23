// Visual effects: particles, bubbles, rain splashes, lightning, embers and sparks.
import { TILE, NOW, THEN } from './level.js';
import { VIEW_W, VIEW_H } from './render.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor() {
    this.parts = [];
    this.lightning = 0;
    this.lightningTimer = rand(4, 9);
    this.eraFlash = 0;
    this.eraFlashColor = '255,255,255';
    this.bubbleTimer = 1;
  }

  add(p) {
    const q = {
      x: 0, y: 0, vx: 0, vy: 0, g: 200, drag: 0, life: 0.6, size: 2, color: '#fff', kind: 'dot', era: null, ...p,
    };
    q.max = q.life;
    this.parts.push(q);
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    return q;
  }

  burst(x, y, opts = {}) {
    const { n = 10, speed = [20, 80], vyBias = 0, spread = Math.PI * 2, angle = 0, ...rest } = opts;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = rand(speed[0], speed[1]);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + vyBias, life: rand(0.35, 0.8), ...rest });
    }
  }

  ring(x, y, color, maxR = 40, life = 0.5, width = 2) {
    this.add({ x, y, kind: 'ring', color, size: maxR, life, g: 0, width });
  }

  bubbles(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      this.add({ x: x + rand(-2, 2), y: y + rand(-2, 2), vx: rand(-8, 8), vy: rand(-20, -40), g: 0, kind: 'bubble', life: rand(1.5, 3), size: rand(1, 2.4), era: NOW, phase: Math.random() * 6 });
    }
  }

  // ---------- per-frame ----------

  update(dt, game) {
    const level = game.level;
    for (const q of this.parts) {
      q.life -= dt;
      if (q.kind === 'bubble') {
        q.vy += (-45 - q.vy) * Math.min(1, dt * 2);
        q.x += Math.sin(q.life * 6 + q.phase) * 10 * dt;
        q.y += q.vy * dt;
        if (!level.isWaterAt(q.x, q.y, NOW)) {
          q.life = 0; // pop at the surface
          if (game.era === NOW && level.isWaterAt(q.x, q.y + 3, NOW)) this.add({ x: q.x, y: q.y + 2, kind: 'ring', color: '170,235,255', size: 4, life: 0.3, g: 0, width: 1, era: NOW });
        }
        continue;
      }
      if (q.kind === 'ring') continue;
      q.vy += q.g * dt;
      if (q.drag) { q.vx *= 1 - q.drag * dt; q.vy *= 1 - q.drag * dt; }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind === 'ember') q.x += Math.sin(q.life * 9 + q.y) * 6 * dt;
    }
    this.parts = this.parts.filter((q) => q.life > 0);

    this.eraFlash = Math.max(0, this.eraFlash - dt * 2.5);
    this.lightning = Math.max(0, this.lightning - dt * 2.2);
    if (game.state === 'play') this.ambient(dt, game);
  }

  ambient(dt, game) {
    const { level, cam, era, player: p } = game;

    if (era === THEN) {
      // lightning, then thunder a moment later
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = rand(9, 20);
        this.lightning = 1;
        this.flicker = 0.12;
        game.sound.thunder(rand(0.4, 1.4));
      }
      if (this.flicker > 0) {
        this.flicker -= dt;
        if (this.flicker <= 0) this.lightning = Math.max(this.lightning, 0.7);
      }
      // raindrops bursting on rooftops
      for (let i = 0; i < 2; i++) {
        if (Math.random() > 0.35) continue;
        const x = cam.x + Math.random() * VIEW_W;
        const tx = Math.floor(x / TILE);
        for (let ty = Math.floor(cam.y / TILE); ty * TILE < cam.y + VIEW_H; ty++) {
          if (level.isSolid(tx, ty, THEN)) {
            if (!level.isSolid(tx, ty - 1, THEN)) {
              for (let k = 0; k < 2; k++) this.add({ x, y: ty * TILE - 1, vx: rand(-25, 25), vy: rand(-50, -20), g: 300, life: 0.25, size: 1, color: 'rgba(200,210,255,0.8)', era: THEN });
            }
            break;
          }
        }
      }
    }

    // the diver's breath, underwater
    if (era === NOW && p.inWater && game.dying <= 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubbleTimer = rand(0.7, 1.6);
        this.bubbles(p.cx + p.facing * 3, p.y + 2, Math.floor(rand(1, 4)));
      }
    }

    // embers from lit lanterns, sparks from turning gears
    for (const e of game.entities) {
      if (e.lit && Math.random() < dt * 2.5 && this.onScreen(e, cam)) {
        this.add({ x: e.x + 4 + rand(-2, 2), y: e.y + 1, vx: rand(-5, 5), vy: rand(-18, -30), g: 0, life: rand(0.8, 1.5), size: 1, color: '#ffc46b', kind: 'ember' });
      }
    }
    if (era === THEN) {
      for (const gpos of game.gears) {
        if (Math.random() < dt * 1.2 && this.onScreen(gpos, cam)) {
          this.burst(gpos.x + 8, gpos.y + 3, { n: 3, speed: [40, 90], angle: -Math.PI / 2, spread: 1.6, g: 400, life: 0.3, size: 1, color: '#ffd27a', era: THEN });
        }
      }
    }
  }

  onScreen(o, cam) {
    return o.x > cam.x - 20 && o.x < cam.x + VIEW_W + 20 && o.y > cam.y - 20 && o.y < cam.y + VIEW_H + 20;
  }

  // ---------- drawing ----------

  draw(ctx, era) {
    for (const q of this.parts) {
      if (q.era !== null && q.era !== era) continue;
      const a = Math.min(1, (q.life / q.max) * 2.5);
      if (q.kind === 'ring') {
        const k = 1 - q.life / q.max;
        ctx.strokeStyle = `rgba(${q.color},${(1 - k) * 0.9})`;
        ctx.lineWidth = q.width * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 2 + k * q.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (q.kind === 'bubble') {
        ctx.strokeStyle = `rgba(190,240,255,${Math.min(0.8, q.life)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (q.kind === 'streak') {
        ctx.strokeStyle = q.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.06, q.y - q.vy * 0.06);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = q.kind === 'ember' ? a * (0.6 + 0.4 * Math.sin(q.life * 20)) : a;
        ctx.fillStyle = q.color;
        const s = q.size;
        ctx.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), s, s);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Screen-space overlays drawn after the world.
  drawOverlay(ctx, era) {
    if (era === THEN && this.lightning > 0) {
      ctx.fillStyle = `rgba(220,225,255,${this.lightning * 0.35})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  drawEraFlash(ctx) {
    if (this.eraFlash > 0) {
      ctx.fillStyle = `rgba(${this.eraFlashColor},${this.eraFlash * 0.35})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}
