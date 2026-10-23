// The Bellwright: a clockwork giant hanging from a rail in the bell chamber.
//
// It is awake only in THEN. Its attacks:
//   slam  — raises its hammer, drops low and drives it into the floor, sending shockwaves along it.
//           While the hammer is stuck, the key on its crown is exposed: land on it to hurt it.
//   gears — throws spinning gears that bounce.
//   toll  — rings itself. A ring of sound sweeps the whole chamber; only NOW is safe.
// In NOW it is a rusted hulk, with a faint echo showing where it is in THEN.
import { Entity, overlaps } from './entities.js';
import { TILE, NOW, THEN } from './level.js';
import { drawGear } from './render.js';

const PATTERNS = [
  ['slam', 'slam', 'toll'],
  ['slam', 'gears', 'toll', 'slam', 'gears'],
  ['gears', 'slam', 'toll', 'gears', 'slam', 'toll'],
];
const DROP = 54;          // how far it sinks when the hammer strikes
const STUCK_TIME = [3.4, 3.0, 2.6];
const KEY_REACH = 18;     // how close to the centre of its crown you must land

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

export class Bellwright extends Entity {
  constructor(tx, ty, arena) {
    super(tx, ty, 56, 52);
    this.home = tx * TILE + 8;
    this.yHigh = ty * TILE;
    this.yLow = this.yHigh + DROP;
    this.left = arena.x0 * TILE;
    this.right = (arena.x1 + 1) * TILE;
    this.ceil = arena.y0 * TILE;
    this.floorY = arena.floor * TILE;
    this.isBoss = true;
    this.maxHp = 3;
    this.reset();
  }

  reset() {
    this.hp = this.maxHp;
    this.state = 'dormant';
    this.t = 0;
    this.setCx(this.home);
    this.y = this.yHigh;
    this.vy = 0;
    this.hammer = 0;
    this.vulnerable = false;
    this.flash = 0;
    this.shakeT = 0;
    this.pat = 0;
    this.fired = 0;
    this.eyes = 0;
    this.keyAngle = 0;
    this.tilt = 0;
    this.toldKey = false;
    this.toldToll = false;
  }

  setCx(cx) { this.x = cx - this.w / 2; }
  get cx() { return this.x + this.w / 2; }
  get phase() { return Math.min(3, this.maxHp - this.hp + 1); }
  get spd() { return 1 + 0.25 * (this.phase - 1); }
  get active() { return !['dormant', 'dying', 'falling', 'wreck'].includes(this.state); }
  get angry() { return this.state === 'slam' || (this.state === 'toll' && this.t < 1.5); }
  existsIn() { return true; }

  body() { return { x: this.x + 5, y: this.y + 10, w: this.w - 10, h: this.h - 10 }; }
  hammerHead() { return { x: this.cx - 12, y: this.y + this.h + this.hammer, w: 24, h: 12 }; }

  go(state) { this.state = state; this.t = 0; this.fired = 0; }

  wake(game) {
    this.go('intro');
    game.sound.play('bossWake');
    game.shake(1.2, 2);
  }

  update(game, dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (!this.vulnerable) this.keyAngle += dt * 3 * this.spd;
    const p = game.player;
    const s = this.spd;

    switch (this.state) {
      case 'intro':
        this.eyes = Math.min(1, this.t / 1.2);
        if (this.t > 2.2) this.go('move');
        break;

      case 'move': {
        const target = clamp(p.cx, this.left + 110, this.right - 110); // stays clear of the galleries
        const dx = target - this.cx;
        this.setCx(this.cx + Math.sign(dx) * Math.min(Math.abs(dx), 70 * s * dt));
        this.y = approach(this.y, this.yHigh, 120 * dt);
        this.hammer = approach(this.hammer, 0, 200 * dt);
        if (this.t > 1.5 / s) {
          const list = PATTERNS[this.phase - 1];
          this.go(list[this.pat++ % list.length]);
          if (this.state === 'slam') game.sound.play('windup');
          if (this.state === 'toll') {
            game.sound.play('tollWind');
            if (!this.toldToll) { this.toldToll = true; game.toast('It is going to TOLL — turn the watch!', 3); }
          }
        }
        break;
      }

      case 'slam': // wind-up: the hammer draws up into its body
        this.hammer = -10 * Math.min(1, this.t / 0.3);
        if (this.t > 0.85 / s) this.go('slamDown');
        break;

      case 'slamDown': {
        this.y = approach(this.y, this.yLow, 420 * dt);
        this.hammer += 640 * dt;
        const reach = this.floorY - 12 - this.y - this.h;
        if (this.hammer >= reach) {
          this.hammer = reach;
          this.vulnerable = true;
          game.shake(0.45, 4);
          game.sound.play('slam');
          game.entities.push(new Shockwave(this.cx, this.floorY, -1, 170 * s), new Shockwave(this.cx, this.floorY, 1, 170 * s));
          game.fx.burst(this.cx, this.floorY - 2, { n: 18, speed: [40, 140], angle: -Math.PI / 2, spread: 2.6, g: 300, life: 0.6, size: 2, color: '#b08a5e', era: THEN });
          if (!this.toldKey) { this.toldKey = true; game.toast('Its key is exposed — get above it!', 3); }
          this.go('stuck');
        }
        break;
      }

      case 'stuck':
        this.y = approach(this.y, this.yLow, 420 * dt);
        this.hammer = this.floorY - 12 - this.y - this.h;
        if (this.t > STUCK_TIME[this.phase - 1]) {
          this.vulnerable = false;
          game.sound.play('retract');
          this.go('retract');
        }
        break;

      case 'retract':
        this.y = approach(this.y, this.yHigh, 90 * dt);
        this.hammer = approach(this.hammer, 0, 260 * dt);
        if (this.hammer === 0 && this.y === this.yHigh) this.go('move');
        break;

      case 'gears':
        if (this.t > 0.5 && this.fired < 3 && this.t > 0.5 + this.fired * 0.28) {
          const vx = clamp((p.cx - this.cx) / 1.1 + (this.fired - 1) * 45, -230, 230);
          game.entities.push(new GearShot(this.cx, this.y + this.h - 4, vx, -240));
          game.sound.play('gearThrow');
          this.fired++;
        }
        if (this.t > 1.8) this.go('move');
        break;

      case 'toll':
        if (this.t >= 1.5 && !this.fired) {
          this.fired = 1;
          game.entities.push(new TollRing(this.cx, this.y + 30));
          game.sound.play('toll');
          game.shake(0.7, 3);
        }
        if (this.t > 3.2) this.go('move');
        break;

      case 'hurt':
        this.y = approach(this.y, this.yHigh, 160 * dt);
        this.hammer = approach(this.hammer, 0, 400 * dt);
        if (this.t > 1.1) this.go('move');
        break;

      case 'dying':
        this.vulnerable = false;
        this.hammer = approach(this.hammer, 0, 200 * dt);
        if (Math.random() < dt * 8) {
          const ex = this.x + Math.random() * this.w, ey = this.y + 10 + Math.random() * (this.h - 10);
          game.fx.burst(ex, ey, { n: 10, speed: [40, 130], color: Math.random() < 0.5 ? '#ffd27a' : '#ff8a4a', g: 300, life: 0.5, size: 2, era: THEN });
          game.sound.play('spark');
        }
        if (this.t > 2.4) { this.go('falling'); game.sound.play('bossFall'); }
        break;

      case 'falling':
        this.vy += 700 * dt;
        this.y += this.vy * dt;
        this.tilt = Math.min(0.5, this.tilt + dt * 0.8);
        if (this.y + this.h >= this.floorY) {
          this.y = this.floorY - this.h;
          this.go('wreck');
          game.sound.play('crash');
          game.shake(1.0, 5);
          game.fx.burst(this.cx, this.floorY - 8, { n: 40, speed: [60, 220], angle: -Math.PI / 2, spread: 3, color: '#a87a35', g: 500, life: 1, size: 2, era: THEN });
          game.onBossDefeated();
        }
        break;
    }

    // the hammer head hurts while it is coming down
    if (this.state === 'slamDown' && game.era === THEN && overlaps(p, this.hammerHead())) game.hurt(this.cx);
  }

  touch(game) {
    if (game.era !== THEN || !this.active || this.state === 'intro') return;
    const p = game.player;
    const prevBottom = p.y + p.h - p.vy / 60;
    if (p.vy > 30 && prevBottom <= this.y + 10) {
      if (this.vulnerable && Math.abs(p.cx - this.cx) < KEY_REACH) { this.hit(game); return; }
      // bounce off its crown
      p.detach('release');
      p.vy = -260;
      p.jumping = false;
      game.sound.play('clang');
      game.fx.burst(p.cx, p.y + p.h, { n: 6, speed: [40, 100], angle: -Math.PI / 2, spread: 2, color: '#ffe3a0', g: 300, life: 0.3, size: 1, era: THEN });
      return;
    }
    if (overlaps(p, this.body())) game.hurt(this.cx);
  }

  hit(game) {
    const p = game.player;
    this.hp--;
    this.vulnerable = false;
    this.flash = 1;
    this.shakeT = 1;
    game.hitstop = 0.14;
    game.shake(0.5, 4);
    game.sound.play('bossHurt');
    p.detach('release');
    p.vy = -330;
    p.vx = (p.cx < this.cx ? -1 : 1) * 130;
    p.jumping = false;
    p.invuln = Math.max(p.invuln, 0.8);
    game.fx.burst(this.cx, this.y + 4, { n: 24, speed: [60, 180], color: '#ffe3a0', g: 300, life: 0.7, size: 2, era: THEN });
    game.fx.ring(this.cx, this.y + 4, '255,227,160', 40, 0.5, 3);
    if (this.hp <= 0) {
      this.go('dying');
      game.sound.play('bossDie');
      game.toast('The Bellwright is coming apart!', 3);
    } else {
      this.go('hurt');
      game.toast(this.hp === 2 ? 'It shudders — and grinds faster.' : 'One more strike!', 2.5);
    }
  }

  // ---------- drawing ----------

  draw(ctx, game, t) {
    if (game.era === NOW) { this.drawNow(ctx, game, t); return; }
    const shake = this.shakeT > 0 || this.state === 'dying' || (this.state === 'toll' && this.t < 1.5);
    const sx = shake ? Math.round((Math.random() - 0.5) * 3) : 0;
    const x = Math.round(this.x) + sx, y = Math.round(this.y);
    const cx = x + this.w / 2;

    if (this.state !== 'wreck' && this.state !== 'falling') this.drawChain(ctx, cx, y, '#5a4630');

    ctx.save();
    if (this.tilt) { ctx.translate(cx, y + this.h); ctx.rotate(this.tilt); ctx.translate(-cx, -(y + this.h)); }

    // hammer arm and head
    if (this.state !== 'wreck' && this.hammer > -11) {
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(cx - 3, y + this.h - 6, 6, this.hammer + 8);
      ctx.fillStyle = '#c9973f';
      ctx.fillRect(cx - 3, y + this.h - 6, 1, this.hammer + 8);
      const hy = y + this.h + this.hammer;
      ctx.fillStyle = '#3a3532';
      ctx.fillRect(cx - 12, hy, 24, 12);
      ctx.fillStyle = '#c9973f';
      ctx.fillRect(cx - 12, hy + 2, 24, 2);
      ctx.fillRect(cx - 12, hy + 8, 24, 2);
    }

    // the bell-shaped body
    const lit = this.flash > 0 && Math.floor(this.flash * 20) % 2 === 0;
    ctx.fillStyle = lit ? '#fff4d8' : '#a87a35';
    this.bellPath(ctx, cx, y);
    ctx.fill();
    ctx.fillStyle = lit ? '#fff' : '#d9a24f';
    ctx.fillRect(cx - 16, y + 13, 3, 24);
    ctx.fillStyle = '#6b4a20';
    ctx.fillRect(cx - 28, y + this.h - 7, 56, 5);

    // clock face for a chest
    ctx.fillStyle = '#efe2c0';
    ctx.beginPath(); ctx.arc(cx, y + 32, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2c1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, y + 32); ctx.lineTo(cx + Math.cos(t * 2 * this.spd) * 6, y + 32 + Math.sin(t * 2 * this.spd) * 6);
    ctx.moveTo(cx, y + 32); ctx.lineTo(cx + Math.cos(t * 0.3) * 4, y + 32 + Math.sin(t * 0.3) * 4);
    ctx.stroke();

    // eyes
    const eyeCol = this.state === 'dormant' ? '#3a2a1a' : this.angry ? '#ff4a2a' : `rgba(255,207,107,${0.4 + 0.6 * this.eyes})`;
    ctx.fillStyle = eyeCol;
    ctx.fillRect(cx - 11, y + 18, 6, 3);
    ctx.fillRect(cx + 5, y + 18, 6, 3);
    if (this.state !== 'dormant' && this.state !== 'wreck') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.angry ? 'rgba(255,80,40,0.35)' : 'rgba(255,200,100,0.2)';
      ctx.fillRect(cx - 13, y + 16, 10, 7);
      ctx.fillRect(cx + 3, y + 16, 10, 7);
      ctx.restore();
    }

    // damage
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (this.hp <= 2) { ctx.moveTo(cx + 8, y + 14); ctx.lineTo(cx + 13, y + 22); ctx.lineTo(cx + 11, y + 28); }
    if (this.hp <= 1) { ctx.moveTo(cx - 6, y + 40); ctx.lineTo(cx - 14, y + 44); ctx.moveTo(cx + 14, y + 36); ctx.lineTo(cx + 20, y + 42); }
    ctx.stroke();

    // the wind-up key on its crown
    ctx.fillStyle = '#8a6326';
    ctx.fillRect(cx - 1, y + 3, 2, 8);
    ctx.save();
    ctx.translate(cx, y + 3);
    ctx.scale(this.vulnerable ? 1 : Math.cos(this.keyAngle), 1);
    ctx.fillStyle = this.vulnerable ? '#fff1c0' : '#e0c070';
    ctx.fillRect(-7, -3, 14, 4);
    ctx.restore();
    if (this.vulnerable) {
      const pulse = 0.6 + 0.4 * Math.sin(t * 10);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, y + 2, 1, cx, y + 2, 26);
      g.addColorStop(0, `rgba(255,240,180,${0.7 * pulse})`);
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 26, y - 24, 52, 52);
      ctx.restore();
    }

    // charging up a toll
    if (this.state === 'toll' && this.t < 1.5) {
      const k = this.t / 1.5;
      ctx.strokeStyle = `rgba(255,220,140,${0.3 + 0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, y + 30, 40 - k * 24, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.state === 'wreck' && Math.random() < 0.3) {
      game.fx.add({ x: cx + (Math.random() - 0.5) * 30, y: y + 10, vx: (Math.random() - 0.5) * 8, vy: -15, g: -5, life: 1.5, size: 2, color: 'rgba(90,80,80,0.6)', era: THEN });
    }
    ctx.restore();
  }

  bellPath(ctx, cx, y) {
    ctx.beginPath();
    ctx.moveTo(cx - 13, y + 10);
    ctx.quadraticCurveTo(cx - 24, y + 18, cx - 26, y + this.h - 5);
    ctx.lineTo(cx + 26, y + this.h - 5);
    ctx.quadraticCurveTo(cx + 24, y + 18, cx + 13, y + 10);
    ctx.closePath();
  }

  drawChain(ctx, cx, y, color) {
    ctx.fillStyle = color;
    for (let cy = this.ceil; cy < y + 2; cy += 6) ctx.fillRect(cx - 2, cy, 4, 4);
  }

  // Fifty years on: a rusted shell hanging where it always hung (or lying where it fell).
  drawNow(ctx, game, t) {
    const fallen = this.state === 'wreck';
    const cx = fallen ? Math.round(this.cx) : this.home;
    const y = fallen ? this.floorY - this.h : this.yHigh;
    if (!fallen) this.drawChain(ctx, cx, y, '#2a3434');
    ctx.save();
    ctx.translate(cx, y + this.h);
    ctx.rotate(fallen ? 0.5 : 0.1);
    ctx.translate(-cx, -(y + this.h));
    ctx.fillStyle = '#2f3e3d';
    this.bellPath(ctx, cx, y);
    ctx.fill();
    ctx.fillStyle = '#5a3d2e';
    ctx.fillRect(cx - 20, y + 30, 8, 6);
    ctx.fillRect(cx + 8, y + 20, 6, 10);
    ctx.fillStyle = '#d9776b';
    ctx.fillRect(cx - 14, y + 44, 2, 2);
    ctx.fillRect(cx + 16, y + 40, 2, 2);
    ctx.fillStyle = '#e6b85c';
    ctx.fillRect(cx + 4, y + 46, 2, 2);
    ctx.fillStyle = '#141c1c';
    ctx.fillRect(cx - 11, y + 18, 6, 3);
    ctx.fillRect(cx + 5, y + 18, 6, 3);
    ctx.restore();

    // an echo of where it is in THEN, so you can time your return
    if (this.active || this.state === 'dying') {
      ctx.save();
      ctx.strokeStyle = this.vulnerable ? 'rgba(255,240,180,0.55)' : 'rgba(255,190,110,0.3)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      this.bellPath(ctx, this.cx, Math.round(this.y));
      ctx.stroke();
      if (this.hammer > 0) ctx.strokeRect(this.cx - 12, this.y + this.h + this.hammer, 24, 12);
      ctx.restore();
    }
  }
}

// A wave of force running along the floor after a hammer strike. Jump it.
export class Shockwave extends Entity {
  constructor(x, floorY, dir, speed) {
    super(0, 0, 12, 12);
    this.x = x - 6;
    this.y = floorY - 12;
    this.dir = dir;
    this.speed = speed;
    this.era = THEN;
    this.projectile = true;
    this.life = 4;
  }
  update(game, dt) {
    this.x += this.dir * this.speed * dt;
    this.life -= dt;
    const tx = Math.floor((this.dir > 0 ? this.x + this.w : this.x) / TILE);
    const ty = Math.floor((this.y + 6) / TILE);
    if (this.life <= 0 || game.level.isSolid(tx, ty, THEN)) this.dead = true;
    if (game.era === THEN && Math.random() < 0.5) {
      game.fx.add({ x: this.x + 6, y: this.y + 11, vx: -this.dir * 20, vy: -30 - Math.random() * 30, g: 200, life: 0.4, size: 2, color: '#b08a5e', era: THEN });
    }
  }
  touch(game) { game.hurt(this.x + 6); }
  draw(ctx) {
    const x = Math.round(this.x), y = Math.round(this.y);
    for (let i = 0; i < 4; i++) {
      const h = 12 - i * 3;
      ctx.fillStyle = i === 0 ? '#fff1c0' : `rgba(255,170,80,${0.8 - i * 0.2})`;
      ctx.fillRect(x + 6 - this.dir * i * 4, y + 12 - h, 3, h);
    }
  }
}

// A spinning gear flung by the Bellwright. Bounces a couple of times.
export class GearShot extends Entity {
  constructor(cx, cy, vx, vy) {
    super(0, 0, 12, 12);
    this.x = cx - 6;
    this.y = cy - 6;
    this.vx = vx;
    this.vy = vy;
    this.era = THEN;
    this.projectile = true;
    this.life = 4;
    this.bounces = 0;
    this.spin = 0;
  }
  update(game, dt) {
    const lvl = game.level;
    this.life -= dt;
    this.spin += dt * 12 * Math.sign(this.vx || 1);
    this.vy += 520 * dt;
    this.x += this.vx * dt;
    const side = Math.floor((this.vx > 0 ? this.x + this.w : this.x) / TILE);
    if (lvl.isSolid(side, Math.floor((this.y + 6) / TILE), THEN)) { this.vx = -this.vx * 0.6; this.x += this.vx * dt * 2; }
    this.y += this.vy * dt;
    const footTy = Math.floor((this.y + this.h) / TILE);
    if (this.vy > 0 && lvl.isSolid(Math.floor((this.x + 6) / TILE), footTy, THEN)) {
      this.y = footTy * TILE - this.h;
      this.vy = -this.vy * 0.5;
      this.bounces++;
      if (game.era === THEN) game.sound.play('gearBounce');
    }
    if (this.life <= 0 || this.bounces > 3) this.dead = true;
  }
  touch(game) { game.hurt(this.x + 6); }
  draw(ctx) { drawGear(ctx, this.x + 6, this.y + 6, 5, this.spin, THEN); }
}

// The toll: a ring of sound sweeping out across the chamber. It only exists in THEN.
export class TollRing extends Entity {
  constructor(cx, cy) {
    super(0, 0, 0, 0);
    this.cx0 = cx;
    this.cy0 = cy;
    this.r = 10;
    this.era = THEN;
    this.projectile = true;
    this.hitDone = false;
  }
  update(game, dt) {
    this.r += 250 * dt;
    const p = game.player;
    if (!this.hitDone && game.era === THEN && game.dying <= 0) {
      const d = Math.hypot(p.cx - this.cx0, p.cy - this.cy0);
      if (Math.abs(d - this.r) < 10) { this.hitDone = true; game.hurt(this.cx0); }
    }
    if (this.r > 700) this.dead = true;
  }
  draw(ctx) { this.rings(ctx, 1); }
  drawGhost(ctx) { this.rings(ctx, 0.25); }
  rings(ctx, a) {
    for (let i = 0; i < 3; i++) {
      const r = this.r - i * 7;
      if (r <= 0) continue;
      ctx.strokeStyle = `rgba(255,${210 - i * 30},${140 - i * 30},${a * (0.8 - i * 0.25)})`;
      ctx.lineWidth = 4 - i;
      ctx.beginPath(); ctx.arc(this.cx0, this.cy0, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
