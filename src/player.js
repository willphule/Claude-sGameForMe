// The diver: running, jumping, swimming and tile collision.
import { TILE, NOW } from './level.js';

export const PHYS = {
  RUN: 120,          // px/s
  ACCEL: 1100,
  DECEL: 1500,
  AIR_ACCEL: 850,
  GRAV: 950,
  JUMP_V: 345,       // about 3.9 tiles of height with the button held
  JUMP_CUT: 0.45,    // releasing jump early gives a short hop
  MAX_FALL: 420,
  COYOTE: 0.1,       // grace time to jump after leaving a ledge
  BUFFER: 0.12,      // jump pressed slightly before landing still counts
  SWIM_SPEED: 85,
  SWIM_ACCEL: 520,
  SWIM_STROKE: 165,
  SINK: 25,
};

export const HOOK = {
  RANGE: 150,     // how far the harpoon reaches
  MIN: 20,        // shortest rope
  MAX: 150,       // longest rope
  REEL: 150,      // px/s when reeling in or out
  PUMP: 300,      // swing push from left/right
  MAX_V: 360,
  RELEASE_V: 340, // letting go with jump is a full jump
};

const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

export class Player {
  constructor(x, y) {
    this.w = 10;
    this.h = 14;
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.inWater = false;
    this.coyote = 0;
    this.buffer = 0;
    this.jumping = false;
    this.leap = 0;     // time after leaping out of water during which swim physics are off
    this.knock = 0;    // time after being hit during which steering is off
    this.invuln = 0;
    this.anim = 0;
    this.events = [];  // things that happened this frame, for sound and effects
    this.sx = 1;       // squash and stretch
    this.sy = 1;
    this.stepT = 0;
    this.stepAlt = false;
    this.hook = null;   // { anchor, len, t } while swinging on the harpoon line
  }

  attach(anchor) {
    const d = Math.hypot(this.cx - anchor.cx, this.cy - anchor.cy);
    this.hook = { anchor, len: Math.max(HOOK.MIN, Math.min(HOOK.MAX, d - 24, d * 0.7)), t: 0 };
    if (this.onGround) this.vy = Math.min(this.vy, -120);
    this.jumping = false;
    this.events.push('hook');
  }

  detach(event = 'unhook') {
    if (!this.hook) return;
    this.hook = null;
    this.events.push(event);
  }

  // Swinging: gravity and a push from left/right, then the rope pulls you back onto a circle.
  updateHook(dt, input, level, era, dir) {
    const h = this.hook;
    h.t += dt;
    if (input.down('up')) h.len = Math.max(HOOK.MIN, h.len - HOOK.REEL * dt);
    if (input.down('down')) h.len = Math.min(HOOK.MAX, h.len + HOOK.REEL * dt);

    this.vy += (this.inWater ? 350 : PHYS.GRAV) * dt;
    this.vx += dir * HOOK.PUMP * dt;
    if (!dir) this.vx *= 1 - 1.2 * dt; // settle when you're not pumping
    if (this.inWater) { this.vx *= 1 - 2 * dt; this.vy *= 1 - 2 * dt; }

    const ax = h.anchor.cx, ay = h.anchor.cy;
    let nx = this.cx + this.vx * dt, ny = this.cy + this.vy * dt;
    const dx = nx - ax, dy = ny - ay;
    const d = Math.hypot(dx, dy);
    if (d > h.len) {
      // pulled in gently when reeling, so it never yanks through walls
      const target = Math.max(h.len, d - HOOK.REEL * 2 * dt);
      nx = ax + (dx / d) * target;
      ny = ay + (dy / d) * target;
    }
    const ox = this.x, oy = this.y;
    this.moveX(nx - this.cx, level, era);
    this.moveY(ny - this.cy, level, era);
    this.vx = (this.x - ox) / dt;
    this.vy = (this.y - oy) / dt;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > HOOK.MAX_V) { this.vx *= HOOK.MAX_V / sp; this.vy *= HOOK.MAX_V / sp; }

    // touching down lets go — unless you're climbing the line
    if (this.onGround && h.t > 0.25 && !input.down('up')) this.detach();
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  update(dt, input, level, era) {
    const dir = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    if (dir && this.knock <= 0) this.facing = dir;

    this.events.length = 0;
    const wasInWater = this.inWater;
    this.inWater = level.isWaterAt(this.cx, this.cy, era);
    if (this.inWater !== wasInWater && era === NOW) this.events.push(this.inWater ? 'splashIn' : 'splashOut');
    if (this.inWater && !wasInWater && this.vy > 0) this.vy *= 0.35;

    if (input.pressed('jump')) this.buffer = PHYS.BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);
    this.leap = Math.max(0, this.leap - dt);
    this.knock = Math.max(0, this.knock - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    // On the harpoon line
    if (this.hook) {
      if (input.pressed('jump') && this.hook.t > 0.05) {
        this.detach('release');
        this.vy = Math.min(this.vy, 0) - HOOK.RELEASE_V;
        this.buffer = 0;
        this.sx = 0.8; this.sy = 1.25;
      } else {
        this.updateHook(dt, input, level, era, dir);
        this.anim += dt * 4;
        this.relax(dt);
        return;
      }
    }

    const swimming = this.inWater && this.leap <= 0;

    // Horizontal movement
    if (this.knock <= 0) {
      const max = swimming ? PHYS.SWIM_SPEED : PHYS.RUN;
      let accel;
      if (swimming) accel = PHYS.SWIM_ACCEL;
      else if (this.onGround) accel = dir ? PHYS.ACCEL : PHYS.DECEL;
      else accel = PHYS.AIR_ACCEL;
      const flying = !swimming && !this.onGround && Math.abs(this.vx) > max
        && (dir === 0 || Math.sign(dir) === Math.sign(this.vx));
      if (flying) this.vx = approach(this.vx, Math.sign(this.vx) * max, 260 * dt); // keep some swing momentum
      else this.vx = approach(this.vx, dir * max, accel * dt);
    }

    // Vertical movement
    if (swimming) {
      const headOut = !level.isWaterAt(this.cx, this.y + 3, era);
      let target = PHYS.SINK;
      if (input.down('jump') || input.down('up')) target = -PHYS.SWIM_SPEED;
      else if (input.down('down')) target = PHYS.SWIM_SPEED * 1.15;
      if (headOut && target < 0) target = 0;

      if (headOut && (this.buffer > 0 || input.down('jump'))) {
        // Leap out of the water
        this.vy = -PHYS.JUMP_V * 0.9;
        this.leap = 0.3;
        this.buffer = 0;
        this.sx = 0.8; this.sy = 1.25;
      } else {
        if (input.pressed('jump') && !headOut) {
          this.vy = Math.min(this.vy, -PHYS.SWIM_STROKE);
          this.events.push('stroke');
        }
        this.vy = approach(this.vy, target, PHYS.SWIM_ACCEL * dt);
      }
      this.jumping = false;
      this.coyote = 0;
    } else {
      if (this.onGround) this.coyote = PHYS.COYOTE;
      else this.coyote = Math.max(0, this.coyote - dt);

      if (this.buffer > 0 && this.coyote > 0) {
        this.vy = -PHYS.JUMP_V;
        this.buffer = 0;
        this.coyote = 0;
        this.jumping = true;
        this.onGround = false;
        this.events.push('jump');
        this.sx = 0.75; this.sy = 1.3;
      }
      if (this.jumping && this.vy < 0 && !input.down('jump')) {
        this.vy *= PHYS.JUMP_CUT;
        this.jumping = false;
      }
      if (this.vy >= 0) this.jumping = false;
      this.vy = Math.min(this.vy + PHYS.GRAV * dt, PHYS.MAX_FALL);
    }

    const wasGrounded = this.onGround;
    this.moveX(this.vx * dt, level, era);
    this.moveY(this.vy * dt, level, era);
    if (this.onGround && !wasGrounded && this.impact > 120) {
      const k = Math.min(1, this.impact / PHYS.MAX_FALL);
      this.events.push('land');
      this.landImpact = k;
      this.sx = 1 + 0.35 * k; this.sy = 1 - 0.3 * k;
    }

    // footsteps
    if (this.onGround && !this.inWater && Math.abs(this.vx) > 30) {
      this.stepT -= dt * Math.abs(this.vx) / PHYS.RUN;
      if (this.stepT <= 0) {
        this.stepT = 0.26;
        this.stepAlt = !this.stepAlt;
        this.events.push('step');
      }
    } else {
      this.stepT = 0.05;
    }

    this.relax(dt);

    this.anim += dt * (this.onGround && Math.abs(this.vx) > 10 ? Math.abs(this.vx) / 12 : swimming ? 6 : 0);
  }

  relax(dt) {
    const k = 1 - Math.exp(-dt * 14);
    this.sx += (1 - this.sx) * k;
    this.sy += (1 - this.sy) * k;
  }

  moveX(dx, level, era) {
    if (!dx) return;
    this.x += dx;
    const top = Math.floor(this.y / TILE);
    const bot = Math.floor((this.y + this.h - 0.001) / TILE);
    if (dx > 0) {
      const tx = Math.floor((this.x + this.w - 0.001) / TILE);
      for (let ty = top; ty <= bot; ty++) {
        if (level.isSolid(tx, ty, era)) { this.x = tx * TILE - this.w; this.vx = 0; return; }
      }
    } else {
      const tx = Math.floor(this.x / TILE);
      for (let ty = top; ty <= bot; ty++) {
        if (level.isSolid(tx, ty, era)) { this.x = (tx + 1) * TILE; this.vx = 0; return; }
      }
    }
  }

  moveY(dy, level, era) {
    this.onGround = false;
    if (!dy) return;
    this.y += dy;
    const l = Math.floor(this.x / TILE);
    const r = Math.floor((this.x + this.w - 0.001) / TILE);
    if (dy > 0) {
      const ty = Math.floor((this.y + this.h - 0.001) / TILE);
      for (let tx = l; tx <= r; tx++) {
        if (level.isSolid(tx, ty, era)) { this.y = ty * TILE - this.h; this.impact = this.vy; this.vy = 0; this.onGround = true; return; }
      }
    } else {
      const ty = Math.floor(this.y / TILE);
      for (let tx = l; tx <= r; tx++) {
        if (level.isSolid(tx, ty, era)) { this.y = (ty + 1) * TILE; this.vy = 0; this.jumping = false; return; }
      }
    }
  }

  draw(ctx, t, hasWatch) {
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) return;
    const x = Math.round(this.x), y = Math.round(this.y);
    const f = this.facing;
    ctx.save();
    ctx.translate(x + this.w / 2, y + this.h);
    ctx.scale(f * this.sx, this.sy);
    ctx.translate(0, -this.h);
    // local coords: x in [-5, 5], y in [0, 14]

    // legs
    const moving = this.onGround && Math.abs(this.vx) > 10;
    const swing = moving || this.inWater ? Math.sin(this.anim) * 1.5 : 0;
    ctx.fillStyle = '#26323a';
    if (!this.onGround && !this.inWater) {
      ctx.fillRect(-4, 10, 3, 3);
      ctx.fillRect(1, 9, 3, 3);
    } else {
      ctx.fillRect(-4 + swing, 10, 3, 4);
      ctx.fillRect(1 - swing, 10, 3, 4);
    }
    // air tank
    ctx.fillStyle = '#7f9298';
    ctx.fillRect(-6, 4, 3, 6);
    ctx.fillStyle = '#a9bcc2';
    ctx.fillRect(-6, 4, 1, 6);
    // body
    ctx.fillStyle = '#3e6670';
    ctx.fillRect(-4, 5, 8, 6);
    ctx.fillStyle = '#c9973f';
    ctx.fillRect(-4, 9, 8, 1);
    // arm + tidewatch
    ctx.fillStyle = '#335660';
    ctx.fillRect(2, 6, 2, 4);
    if (hasWatch) {
      const p = 0.6 + 0.4 * Math.sin(t * 4);
      ctx.fillStyle = `rgba(127,243,255,${p})`;
      ctx.fillRect(2, 8, 2, 2);
    }
    // helmet
    ctx.fillStyle = '#8a6326';
    ctx.beginPath(); ctx.arc(0, 4, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9973f';
    ctx.beginPath(); ctx.arc(0, 3.6, 4.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c070';
    ctx.fillRect(-3, 0, 2, 1);
    // visor
    ctx.fillStyle = '#1b3640';
    ctx.beginPath(); ctx.arc(1.5, 4, 2.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9ff6ff';
    ctx.beginPath(); ctx.arc(1.8, 4, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 3, 1, 1);
    ctx.restore();
  }
}
