// Things that live in the level: lanterns, notes, the valve, enemies and the bell.
import { TILE, NOW, THEN } from './level.js';

export const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

class Entity {
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
    if (this.lit) { game.checkpoint = this.spawnPoint(game); return; }
    this.lit = true;
    this.flare = 1;
    game.checkpoint = this.spawnPoint(game);
    game.hearts = game.maxHearts;
    game.toast('Lantern lit — checkpoint');
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
      return;
    }
    if (game.era === NOW) {
      game.toast('Rusted solid. It has not turned in fifty years.');
      return;
    }
    game.level.flooded = true;
    this.spin = 1.2;
    game.shake(0.6, 3);
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
      game.burst(this.x + this.w / 2, this.y + this.h / 2, '#e0aa55', 14);
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

export function spawnEntities(level) {
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
    }
  }
  return { list, start };
}
