// Things that live in the level: lanterns, notes, the valve, enemies, blocks, levers and the bell.
import { TILE, NOW, THEN } from './level.js';

export const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Entity {
  constructor(tx, ty, w, h) {
    this.w = w;
    this.h = h;
    // sit on the bottom of the tile, centred
    this.x = tx * TILE + (TILE - w) / 2;
    this.y = ty * TILE + TILE - h;
    this.era = null; // null = exists in both eras
    this.dead = false;
  }
  existsIn(era) { return !this.dead && (this.era === null || this.era === era); }
  update() {}
  touch() {}
}

export class Checkpoint extends Entity {
  constructor(tx, ty) { super(tx, ty, 8, 16); this.lit = false; this.flare = 0; }
  update(game, dt) { this.flare = Math.max(0, this.flare - dt); }
  touch(game) {
    if (this.lit) { game.setCheckpoint(this.spawnPoint(game)); return; }
    this.lit = true;
    this.flare = 1;
    game.setCheckpoint(this.spawnPoint(game));
    game.hearts = game.maxHearts;
    game.toast('Lantern lit — checkpoint');
    game.sound.play('checkpoint');
    game.fx.burst(this.x + 4, this.y + 3, { n: 14, speed: [20, 60], angle: -Math.PI / 2, spread: 2.2, color: '#ffc46b', kind: 'ember', g: -20, life: 1.2, size: 1 });
    game.fx.ring(this.x + 4, this.y + 3, '255,200,100', 22, 0.5, 2);
  }
  spawnPoint(game) { return { x: this.x - 1, y: this.y + this.h - game.player.h, era: game.era }; }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(x + 3, y + 4, 2, 12);
    ctx.fillRect(x + 1, y + 15, 6, 1);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, 8, 7);
    if (this.lit) {
      const p = 0.75 + 0.25 * Math.sin(t * 6 + x);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x + 4, y + 3, 1, x + 4, y + 3, 26 + this.flare * 30);
      g.addColorStop(0, `rgba(255,200,100,${0.35 * p})`);
      g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 60, y - 60, 128, 128);
      ctx.restore();
      ctx.fillStyle = '#ffd36b';
    } else {
      ctx.fillStyle = game.era === NOW ? '#2f4c55' : '#6a5a4a';
    }
    ctx.fillRect(x + 1, y + 1, 6, 5);
  }
}

export class Note extends Entity {
  constructor(tx, ty, index) { super(tx, ty, 8, 10); this.index = index; this.y -= 3; }
  touch(game) {
    this.dead = true;
    game.collectNote(this.index);
  }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y + Math.sin(t * 2 + this.index) * 1.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x + 4, y + 5, 1, x + 4, y + 5, 14);
    g.addColorStop(0, 'rgba(255,240,190,0.35)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 12, y - 12, 32, 34);
    ctx.restore();
    ctx.fillStyle = game.era === NOW ? '#cfd8c4' : '#f1e4c2';
    ctx.fillRect(x, y, 8, 10);
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(x + 1, y + 2, 6, 1);
    ctx.fillRect(x + 1, y + 4, 5, 1);
    ctx.fillRect(x + 1, y + 6, 6, 1);
    ctx.fillStyle = '#b0453a';
    ctx.fillRect(x + 5, y + 7, 2, 2);
  }
}

export class Valve extends Entity {
  constructor(tx, ty) { super(tx, ty, 14, 16); this.angle = 0; this.spin = 0; this.interactable = true; }
  update(game, dt) {
    if (this.spin > 0) { this.angle += dt * 9; this.spin -= dt; }
  }
  interact(game) {
    if (game.level.flooded) {
      game.toast(game.era === THEN ? 'Floodgate 7 is open.' : 'The valve is open — rusted in place.');
      game.sound.play('rusted');
      return;
    }
    if (game.era === NOW) {
      game.toast('Rusted solid. It has not turned in fifty years.');
      game.sound.play('rusted');
      game.fx.burst(this.x + 7, this.y + 6, { n: 6, speed: [10, 30], color: '#8a5a3a', g: 60, life: 0.6, size: 1, era: NOW });
      return;
    }
    game.level.flooded = true;
    this.spin = 1.2;
    game.shake(2.2, 2);
    game.sound.play('valve');
    // dust shaken loose from the ceiling
    for (let i = 0; i < 50; i++) {
      game.fx.add({
        x: game.cam.x + Math.random() * 480, y: game.cam.y + Math.random() * 30, vx: 0, vy: 10 + Math.random() * 30,
        g: 40, drag: 1, life: 1.5 + Math.random() * 1.5, size: 1, color: '#a8957a', era: THEN,
      });
    }
    game.toast('Far below, Floodgate 7 groans open... In the NOW, something has changed.', 4.5);
  }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const then = game.era === THEN;
    ctx.fillStyle = then ? '#6b5a4a' : '#2d3a3a';
    ctx.fillRect(x + 5, y + 8, 4, 8);
    ctx.fillRect(x + 2, y + 14, 10, 2);
    ctx.save();
    ctx.translate(x + 7, y + 6);
    ctx.rotate(game.level.flooded ? (then ? this.angle : 2.2) : 0);
    ctx.strokeStyle = then ? '#d4a147' : '#7a4a35';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(0, -5); ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.restore();
  }
}

export class Crawler extends Entity {
  constructor(tx, ty) {
    super(tx, ty, 14, 8);
    this.era = THEN;
    this.vx = 32;
    this.t = 0;
  }
  update(game, dt) {
    if (game.era !== THEN) return; // frozen in time while you're away
    this.t += dt;
    const lvl = game.level;
    const nx = this.x + this.vx * dt;
    const front = this.vx > 0 ? nx + this.w : nx;
    const ftx = Math.floor(front / TILE);
    const midTy = Math.floor((this.y + this.h / 2) / TILE);
    const footTy = Math.floor((this.y + this.h + 1) / TILE);
    const blocked = lvl.isSolid(ftx, midTy, THEN) || lvl.isHazard(ftx, midTy, THEN);
    const edge = !lvl.isSolid(ftx, footTy, THEN);
    if (blocked || edge) this.vx = -this.vx;
    else this.x = nx;
  }
  touch(game) {
    const p = game.player;
    const stomp = p.vy > 0 && p.y + p.h - p.vy / 60 <= this.y + 4;
    if (stomp) {
      this.dead = true;
      p.vy = -260;
      p.jumping = false;
      game.shake(0.2, 2);
      game.hitstop = 0.05;
      game.sound.play('stomp');
      // springs and cogs everywhere
      game.fx.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 12, speed: [50, 130], angle: -Math.PI / 2, spread: 2.4, color: '#e0aa55', g: 420, life: 0.8, size: 2 });
      game.fx.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 6, speed: [30, 90], angle: -Math.PI / 2, spread: 2, color: '#d4c09a', g: 420, life: 0.8, size: 1 });
      game.fx.ring(this.x + this.w / 2, this.y + this.h / 2, '255,220,140', 18, 0.35, 2);
    } else {
      game.hurt(this.x + this.w / 2);
    }
  }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const f = this.vx > 0 ? 1 : -1;
    // legs
    ctx.fillStyle = '#4a3420';
    for (let i = 0; i < 3; i++) {
      const lift = Math.sin(this.t * 14 + i * 2) > 0 ? 1 : 0;
      ctx.fillRect(x + 2 + i * 4, y + 6 - lift, 1, 2 + lift);
    }
    // shell
    ctx.fillStyle = '#b8863b';
    ctx.beginPath(); ctx.ellipse(x + 7, y + 5, 7, 4, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(x, y + 5, 14, 2);
    ctx.fillStyle = '#e0c070';
    ctx.fillRect(x + 3, y + 2, 6, 1);
    // wind-up key
    ctx.save();
    ctx.translate(x + 7, y);
    ctx.scale(Math.cos(this.t * 6), 1);
    ctx.fillStyle = '#d4c09a';
    ctx.fillRect(-3, -3, 6, 2);
    ctx.restore();
    ctx.fillStyle = '#d4c09a';
    ctx.fillRect(x + 6, y - 1, 2, 2);
    // eye
    ctx.fillStyle = '#ff5a3a';
    ctx.fillRect(f > 0 ? x + 11 : x + 2, y + 4, 2, 1);
  }
}

export class Jelly extends Entity {
  constructor(tx, ty) {
    super(tx, ty, 10, 10);
    this.era = NOW;
    this.baseX = this.x;
    this.baseY = this.y;
    this.t = tx * 0.7;
  }
  update(game, dt) {
    this.t += dt;
    this.inWater = game.level.isWaterAt(this.x + 5, this.y + 5, NOW);
    this.x = this.baseX + Math.sin(this.t * 0.6) * 18;
    this.y = this.baseY + Math.sin(this.t * 1.3) * 10;
  }
  existsIn(era) {
    return super.existsIn(era) && this.inWater;
  }
  touch(game) { game.hurt(this.x + this.w / 2); }
  draw(ctx, game, t) {
    const x = this.x, y = this.y;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x + 5, y + 4, 1, x + 5, y + 4, 16);
    g.addColorStop(0, 'rgba(255,120,200,0.35)');
    g.addColorStop(1, 'rgba(255,120,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 12, y - 12, 34, 34);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,170,220,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const sx = x + 2 + i * 2;
      ctx.moveTo(sx, y + 5);
      ctx.quadraticCurveTo(sx + Math.sin(this.t * 4 + i) * 2, y + 9, sx + Math.sin(this.t * 3 + i) * 1.5, y + 13);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,210,0.85)';
    ctx.beginPath(); ctx.ellipse(x + 5, y + 5, 5, 4.5 + Math.sin(this.t * 4) * 0.6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,245,0.9)';
    ctx.fillRect(Math.round(x + 3), Math.round(y + 2), 2, 1);
  }
}

export class Bell extends Entity {
  constructor(tx, ty) { super(tx, ty, 20, 22); }
  touch(game) { game.finish(); }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y + Math.sin(t * 1.4) * 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x + 10, y + 10, 2, x + 10, y + 10, 40);
    g.addColorStop(0, 'rgba(120,240,255,0.35)');
    g.addColorStop(1, 'rgba(120,240,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 30, y - 30, 80, 80);
    ctx.restore();
    ctx.fillStyle = '#4f8a78';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 18);
    ctx.quadraticCurveTo(x + 4, y + 2, x + 10, y + 2);
    ctx.quadraticCurveTo(x + 16, y + 2, x + 16, y + 18);
    ctx.lineTo(x + 19, y + 20);
    ctx.lineTo(x + 1, y + 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7fc4a8';
    ctx.fillRect(x + 7, y + 5, 2, 10);
    ctx.fillStyle = '#2a4a40';
    ctx.fillRect(x + 9, y + 20, 3, 2);
    ctx.fillRect(x + 9, y, 2, 2);
  }
}

// A ballast block: an iron counterweight from the belfry. You can shove it along in THEN;
// fifty years on it is crusted to the floor, but it stays wherever you left it.
export class Crate extends Entity {
  constructor(tx, ty) {
    super(tx, ty, TILE, TILE);
    this.isCrate = true;
    this.tx = tx;
    this.ty = ty;
    this.ox = 0;      // drawing offset while sliding into the new tile
    this.oy = 0;
    this.vy = 0;
    this.falling = false;
  }

  // Put the block in a tile, keeping the level's collision grid in step.
  place(level, tx, ty) {
    level.setCrate(this.tx, this.ty, false);
    this.tx = tx;
    this.ty = ty;
    level.setCrate(tx, ty, true);
    this.x = tx * TILE;
    this.y = ty * TILE;
  }

  settle(level, tx, ty) {
    this.place(level, tx, ty);
    this.ox = this.oy = this.vy = 0;
    this.falling = false;
  }

  push(game, dir) {
    const lvl = game.level;
    const nx = this.tx + dir;
    if (this.ox || this.oy || !lvl.crateFree(nx, this.ty) || lvl.hasCrate(this.tx, this.ty - 1)) {
      if (!game.stuckPushes) game.sound.play('blocked');
      return false;
    }
    this.place(lvl, nx, this.ty);
    this.ox = -dir * TILE;
    game.sound.play('push');
    game.fx.burst(this.x + (dir > 0 ? 0 : TILE), this.y + TILE - 1, { n: 4, speed: [10, 30], angle: -Math.PI / 2 - dir * 0.8, spread: 0.8, g: 60, life: 0.4, size: 1, color: '#b08a5e', era: THEN });
    return true;
  }

  update(game, dt) {
    const lvl = game.level;
    if (this.ox) this.ox = this.ox > 0 ? Math.max(0, this.ox - 90 * dt) : Math.min(0, this.ox + 90 * dt);
    if (this.ox) return;
    if (this.falling) {
      this.vy = Math.min(this.vy + 900 * dt, 420);
      this.oy += this.vy * dt;
      if (this.oy < 0) return;
      this.oy = 0;
    }
    // drop into the tile below if nothing holds it up (and you are not standing in the way)
    const p = game.player;
    const below = { x: this.tx * TILE, y: (this.ty + 1) * TILE, w: TILE, h: TILE };
    if (lvl.crateFree(this.tx, this.ty + 1) && !overlaps(p, below)) {
      if (!this.falling) { this.falling = true; this.vy = 60; }
      this.place(lvl, this.tx, this.ty + 1);
      this.oy -= TILE;
    } else if (this.falling) {
      this.falling = false;
      const k = Math.min(1, this.vy / 300);
      this.vy = 0;
      game.sound.play('crateLand', k);
      game.shake(0.15 + 0.15 * k, 1 + 2 * k);
      for (const s of [-1, 1]) {
        game.fx.burst(this.x + 8 + s * 7, this.y + TILE, { n: 5, speed: [20, 60], angle: s > 0 ? 0 : Math.PI, spread: 0.7, g: 40, drag: 4, life: 0.5, color: game.era === NOW ? '#6a8a88' : '#c49a68' });
      }
    }
  }

  draw(ctx, game) {
    const x = Math.round(this.x + this.ox), y = Math.round(this.y + this.oy);
    if (game.era === THEN) {
      ctx.fillStyle = '#3b3632';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#56504a';
      ctx.fillRect(x + 1, y + 1, 14, 2);
      ctx.fillStyle = '#2a2522';
      ctx.fillRect(x, y + 14, 16, 2);
      ctx.fillStyle = '#a8742f';                  // brass bands
      ctx.fillRect(x, y + 4, 16, 2);
      ctx.fillRect(x, y + 10, 16, 2);
      ctx.fillStyle = '#e0aa55';
      for (const rx of [2, 7, 12]) { ctx.fillRect(x + rx, y + 4, 1, 1); ctx.fillRect(x + rx, y + 10, 1, 1); }
      ctx.fillStyle = '#d4c09a';                  // a stencilled weight
      ctx.fillRect(x + 6, y + 7, 4, 1);
    } else {
      ctx.fillStyle = '#1d2a2b';
      ctx.fillRect(x, y, 16, 16);
      ctx.fillStyle = '#2c4040';
      ctx.fillRect(x, y + 4, 16, 2);
      ctx.fillRect(x, y + 10, 16, 2);
      ctx.fillStyle = '#5a3d2e';
      ctx.fillRect(x + 3, y + 5, 4, 3);
      ctx.fillRect(x + 10, y + 11, 3, 3);
      ctx.fillStyle = '#3d7a5c';                  // weed and barnacles
      ctx.fillRect(x, y, 16, 2);
      ctx.fillStyle = '#d9776b';
      ctx.fillRect(x + 2, y - 1, 2, 2);
      ctx.fillRect(x + 12, y + 7, 2, 2);
      ctx.fillStyle = '#e6b85c';
      ctx.fillRect(x + 8, y - 1, 2, 2);
      ctx.fillStyle = '#9fb8b0';
      ctx.fillRect(x + 5, y + 13, 1, 1);
      ctx.fillRect(x + 11, y + 2, 1, 1);
    }
  }
}

// A lever that drops a felt damper onto the Great Bell. It only moves in THEN.
export class Lever extends Entity {
  constructor(tx, ty) {
    super(tx, ty, 10, 16);
    this.interactable = true;
    this.pulled = false;
    this.anim = 0;
  }
  update(game, dt) { if (this.pulled) this.anim = Math.min(1, this.anim + dt * 4); }
  interact(game) {
    if (game.era === NOW) {
      game.toast('Seized with rust. In the THEN it would still move.');
      game.sound.play('rusted');
      return;
    }
    if (!game.fight || !game.boss || !game.boss.active) {
      game.toast('The lever will not move while the bell is still.');
      game.sound.play('rusted');
      return;
    }
    this.pulled = true;
    this.interactable = false;
    game.sound.play('lever');
    game.fx.burst(this.x + 5, this.y + 4, { n: 10, speed: [30, 90], color: '#ffe3a0', g: 200, life: 0.5, size: 1, era: THEN });
    game.boss.damp(game, this);
  }
  setPulled(on) { this.pulled = on; this.interactable = !on; this.anim = on ? 1 : 0; }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y);
    const then = game.era === THEN;
    ctx.fillStyle = then ? '#4a3a2a' : '#1f2b2c';
    ctx.fillRect(x + 1, y + 12, 8, 4);
    ctx.fillStyle = then ? '#6b5a4a' : '#2d3a3a';
    ctx.fillRect(x + 2, y + 11, 6, 2);
    // the handle swings from up-left to down-right when pulled
    const a = then ? -0.7 + this.anim * 1.4 : (this.pulled ? 0.7 : -0.7);
    ctx.save();
    ctx.translate(x + 5, y + 12);
    ctx.rotate(a);
    ctx.fillStyle = then ? '#c9973f' : '#5a4a3a';
    ctx.fillRect(-1, -11, 2, 11);
    ctx.fillStyle = this.pulled ? (then ? '#7fd0a0' : '#3f6a55') : (then ? '#e0454a' : '#5a3434');
    ctx.fillRect(-2, -13, 4, 3);
    ctx.restore();
    if (then && !this.pulled && game.fight) {
      const p = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x + 5, y + 4, 1, x + 5, y + 4, 18);
      g.addColorStop(0, `rgba(255,120,90,${0.35 * p})`);
      g.addColorStop(1, 'rgba(255,120,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 14, y - 14, 38, 38);
      ctx.restore();
    }
  }
}

// A brass ring the harpoon can bite into. era: null = both, THEN or NOW only.
export class Anchor extends Entity {
  constructor(tx, ty, era) {
    super(tx, ty, 12, 12);
    this.y = ty * TILE + 2;
    this.era = era;
    this.isAnchor = true;
    this.pulse = 0;
  }
  get cx() { return this.x + 6; }
  get cy() { return this.y + 6; }
  update(game, dt) { this.pulse = Math.max(0, this.pulse - dt * 2); }
  draw(ctx, game) {
    const x = this.cx, y = this.cy, now = game.era === NOW;
    // bracket into the wall above
    ctx.fillStyle = now ? '#2d3a3a' : '#6b4a2a';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 9, 2, 4);
    ctx.strokeStyle = now ? (this.era === NOW ? '#5fae8e' : '#7a6a52') : '#e0aa55';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.stroke();
    if (this.era === NOW) {
      ctx.fillStyle = '#d9776b';
      ctx.fillRect(Math.round(x) + 2, Math.round(y) + 2, 2, 2); // coral growing on it
    }
    if (this.pulse > 0) {
      ctx.strokeStyle = `rgba(255,240,190,${this.pulse})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 7 + (1 - this.pulse) * 6, 0, Math.PI * 2); ctx.stroke();
    }
  }
  // what the ring looks like from the other era
  drawGhost(ctx, game) {
    ctx.strokeStyle = game.era === NOW ? 'rgba(255,190,110,0.3)' : 'rgba(130,230,240,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.arc(this.cx, this.cy, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
}

// The harpoon gun, resting where its owner left it.
export class HarpoonPickup extends Note {
  constructor(tx, ty, index) { super(tx, ty, index); this.w = 14; this.x -= 3; }
  draw(ctx, game, t) {
    const x = Math.round(this.x), y = Math.round(this.y + Math.sin(t * 2) * 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x + 7, y + 5, 1, x + 7, y + 5, 22);
    g.addColorStop(0, 'rgba(255,220,140,0.45)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 20, y - 20, 54, 50);
    ctx.restore();
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(x + 1, y + 5, 4, 5);          // grip
    ctx.fillStyle = '#c9973f';
    ctx.fillRect(x, y + 2, 12, 4);             // barrel
    ctx.fillStyle = '#e8c070';
    ctx.fillRect(x, y + 2, 12, 1);
    ctx.fillStyle = '#d4dde0';
    ctx.fillRect(x + 12, y + 3, 3, 2);         // spear tip
    ctx.fillStyle = '#8a9aa0';
    ctx.fillRect(x + 4, y + 6, 4, 3);          // reel
  }
}

export function spawnEntities(level, extra = {}) {
  const list = [];
  let noteIndex = 0;
  let start = { x: 0, y: 0 };
  const spawns = [...level.spawns].sort((a, b) => a.tx - b.tx || a.ty - b.ty);
  for (const s of spawns) {
    switch (s.type) {
      case '@': start = { x: s.tx * TILE + 3, y: s.ty * TILE + 2 }; break;
      case 'C': list.push(new Checkpoint(s.tx, s.ty)); break;
      case 'N': list.push(new Note(s.tx, s.ty, noteIndex++)); break;
      case 'V': list.push(new Valve(s.tx, s.ty)); break;
      case 'K': list.push(new Crawler(s.tx, s.ty)); break;
      case 'J': list.push(new Jelly(s.tx, s.ty)); break;
      case 'E': list.push(new Bell(s.tx, s.ty)); break;
      case 'O': list.push(new Anchor(s.tx, s.ty, null)); break;
      case 'A': list.push(new Anchor(s.tx, s.ty, THEN)); break;
      case 'B': list.push(new Anchor(s.tx, s.ty, NOW)); break;
      case 'H': list.push(new HarpoonPickup(s.tx, s.ty, noteIndex++)); break;
      case 'X': list.push(new Crate(s.tx, s.ty)); break;
      case 'L': list.push(new Lever(s.tx, s.ty)); break;
      default: if (extra[s.type]) list.push(extra[s.type](s.tx, s.ty));
    }
  }
  return { list, start };
}
