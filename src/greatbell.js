// The Great Bell: the final encounter. It hangs from the headstock beam of the bell chamber and
// rings in two times at once.
//
//   gold toll  — the bell rings in THEN. The ring only exists in THEN, so be in NOW when it passes.
//   blue echo  — its answer, fifty years later. Only exists in NOW, so be in THEN.
// Three damper levers in the chamber (they only move in THEN) each silence part of it. Every damper
// makes the rest of the bell ring harder: gold only, then gold and blue in turn, then both at once.
import { Entity } from './entities.js';
import { TILE, NOW, THEN } from './level.js';
import { TollRing } from './boss.js';

const WIND = [1.5, 1.3, 1.2];         // warning time before each toll, per phase
const REST = [2.3, 1.9, 2.4];         // quiet time between volleys
const PAIR_GAP = 0.85;                // phase 3: the second ring of a pair follows this soon
const RING = { speed: 250, maxR: 430 };

export class GreatBell extends Entity {
  constructor(tx, ty) {
    super(tx, ty, 56, 50);
    this.isBoss = true;
    this.title = 'THE GREAT BELL';
    this.subtitle = 'It rings in two times at once';
    this.wakeEra = null;              // walking in during either era starts it
    this.pivotX = (tx + 1) * TILE;
    this.pivotY = ty * TILE;
    this.x = this.pivotX - this.w / 2;
    this.y = this.pivotY;
    this.maxHp = 3;
    this.hp = 3;
    this.dampers = [];                // which slots ('left', 'top', 'right') are damped
    this.told = {};
    this.clock = 0;
    this.reset();
  }

  // Dying keeps the dampers you have already dropped; the bell just goes quiet until you come back.
  reset() {
    this.state = this.hp <= 0 ? 'silent' : 'dormant';
    this.t = 0;
    this.pending = [];
    this.nextVolley = 0;
    this.alt = false;
    this.flash = 0;
    this.shudder = 0;
  }

  get phase() { return Math.min(3, this.maxHp - this.hp + 1); }
  get active() { return ['intro', 'ring', 'damped'].includes(this.state); }
  get mouth() { return { x: this.pivotX, y: this.pivotY + 42 }; }
  existsIn() { return true; }
  touch() {}

  go(state) { this.state = state; this.t = 0; }

  wake(game) {
    this.go('intro');
    game.sound.play('bellWake');
    game.shake(1.0, 2);
  }

  // Restore from a save: how many dampers are already down.
  restore(levers) {
    const pulled = levers.filter((l) => l.pulled);
    this.hp = this.maxHp - pulled.length;
    this.dampers = pulled.map((l) => this.slotFor(l));
    this.reset();
  }

  slotFor(lever) {
    const dx = lever.x + lever.w / 2 - this.pivotX;
    return dx < -40 ? 'left' : dx > 40 ? 'right' : 'top';
  }

  damp(game, lever) {
    this.hp--;
    this.dampers.push(this.slotFor(lever));
    this.pending = [];
    this.flash = 1;
    this.shudder = 1.4;
    game.hearts = game.maxHearts;
    game.hitstop = 0.12;
    game.shake(0.6, 3);
    game.sound.play('damp');
    game.fx.burst(this.pivotX, this.pivotY + 30, { n: 26, speed: [50, 160], color: '#ffe3a0', g: 200, life: 0.8, size: 2, era: THEN });
    game.fx.ring(this.pivotX, this.pivotY + 30, '255,227,160', 50, 0.6, 3);
    game.saveResume();
    if (this.hp <= 0) {
      this.thudded = false;
      this.go('silencing');
      game.toast('The last damper falls into place...', 3);
      return;
    }
    this.go('damped');
    game.toast(this.hp === 2
      ? 'A damper bites. Somewhere fifty years away, the bell answers.'
      : 'Two dampers down. Now it rings in both times at once!', 3.5);
  }

  update(game, dt) {
    this.t += dt;
    this.clock += dt;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.shudder = Math.max(0, this.shudder - dt);

    switch (this.state) {
      case 'intro':
        if (this.t > 2.6) {
          this.go('ring');
          this.nextVolley = this.clock + 0.4;
          if (!this.told.levers) {
            this.told.levers = true;
            game.toast('Pull the three damper levers. They only move in the THEN.', 4);
          }
        }
        break;
      case 'damped':
        if (this.t > 2.2) { this.go('ring'); this.nextVolley = this.clock + 0.3; }
        break;
      case 'ring':
        this.ring(game);
        break;
      case 'silencing':
        if (this.t > 0.9 && !this.thudded) {
          this.thudded = true;
          game.sound.play('bellSilence');
          game.shake(1.2, 3);
          game.fx.ring(this.mouth.x, this.mouth.y, '255,240,200', 120, 1.6, 2);
        }
        if (this.t > 3.2) {
          this.go('silent');
          game.onBossDefeated();
        }
        break;
    }
  }

  ring(game) {
    if (!this.pending.length && this.clock >= this.nextVolley) {
      const wind = WIND[this.phase - 1];
      let eras;
      if (this.phase === 1) eras = [THEN];
      else if (this.phase === 2) { eras = [this.alt ? NOW : THEN]; this.alt = !this.alt; }
      else eras = Math.random() < 0.5 ? [THEN, NOW] : [NOW, THEN];
      eras.forEach((era, i) => this.pending.push({ era, at: this.clock + wind + i * PAIR_GAP, warned: false }));
    }
    for (const r of this.pending) {
      if (!r.warned && r.at - this.clock <= WIND[this.phase - 1]) {
        r.warned = true;
        game.sound.play(r.era === THEN ? 'tollWind' : 'echoWind');
        this.firstWarning(game, r.era);
      }
      if (this.clock >= r.at) {
        r.done = true;
        const m = this.mouth;
        game.entities.push(new TollRing(m.x, m.y, { era: r.era, ...RING }));
        game.sound.play(r.era === THEN ? 'toll' : 'echoToll');
        game.shake(0.5, 2.5);
        this.shudder = 0.6;
      }
    }
    if (this.pending.some((r) => r.done)) {
      this.pending = this.pending.filter((r) => !r.done);
      if (!this.pending.length) this.nextVolley = this.clock + REST[this.phase - 1];
    }
  }

  firstWarning(game, era) {
    if (era === THEN && !this.told.gold) {
      this.told.gold = true;
      game.toast('A gold toll shakes the THEN. Be in the NOW when it passes!', 3.5);
    } else if (era === NOW && !this.told.blue) {
      this.told.blue = true;
      game.toast('A blue echo shakes the NOW. Be in the THEN when it passes!', 3.5);
    }
  }

  // How strongly the bell is gathering a toll in each era right now (0..1).
  charge(era) {
    let k = 0;
    for (const r of this.pending) {
      if (r.era !== era || !r.warned) continue;
      k = Math.max(k, 1 - (r.at - this.clock) / WIND[this.phase - 1]);
    }
    return k;
  }

  // ---------- drawing ----------

  draw(ctx, game, t) {
    const then = game.era === THEN;
    const px = this.pivotX, py = this.pivotY;
    const swinging = this.active || this.state === 'silencing';
    const amp = this.state === 'dormant' || this.state === 'silent' ? 0.02 : 0.05 + 0.03 * this.phase;
    let angle = then && swinging ? Math.sin(this.clock * 1.6) * amp : (then ? 0 : 0.04);
    if (this.shudder > 0) angle += (Math.random() - 0.5) * 0.04 * this.shudder;
    const gold = this.charge(THEN), blue = this.charge(NOW);

    // headstock: an oak yoke bolted under the beam
    ctx.fillStyle = then ? '#4a3220' : '#1e2a2a';
    ctx.fillRect(px - 20, py, 40, 4);
    ctx.fillStyle = then ? '#c9973f' : '#3c4c48';
    ctx.fillRect(px - 18, py + 1, 2, 2);
    ctx.fillRect(px + 16, py + 1, 2, 2);

    // charge halos: drawn in both eras, so you can always read what is coming
    this.drawCharge(ctx, gold, '255,205,110', then ? 1 : 0.55, t);
    this.drawCharge(ctx, blue, '130,230,255', then ? 0.55 : 1, t);

    ctx.save();
    ctx.translate(px, py + 2);
    ctx.rotate(angle);
    // clapper
    const clap = then && swinging ? Math.sin(this.clock * 1.6 - 0.7) * 0.25 : 0;
    ctx.save();
    ctx.rotate(clap);
    ctx.fillStyle = then ? '#3a2c1c' : '#1a2222';
    ctx.fillRect(-1, 8, 2, 40);
    ctx.beginPath(); ctx.arc(0, 48, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // body
    const lit = this.flash > 0 && Math.floor(this.flash * 16) % 2 === 0;
    ctx.fillStyle = lit ? '#fff4d8' : then ? '#a8743a' : '#2f5a50';
    this.bellPath(ctx);
    ctx.fill();
    ctx.fillStyle = then ? '#d9a24f' : '#4a7e6e';      // highlight
    ctx.fillRect(-12, 10, 3, 26);
    ctx.fillStyle = then ? '#6b4520' : '#1f3a34';      // bands
    ctx.fillRect(-17, 18, 34, 2);
    ctx.fillRect(-25, 44, 50, 3);
    ctx.fillStyle = then ? '#ffd98a' : '#7fb8a0';      // inscription
    for (let i = -13; i <= 13; i += 4) ctx.fillRect(i, 22, 2, 1);
    // crown loops
    ctx.fillStyle = then ? '#8a5a26' : '#24443c';
    ctx.fillRect(-6, 0, 4, 6);
    ctx.fillRect(2, 0, 4, 6);
    if (!then) {
      // fifty years under the sea: a crack, coral and weed
      ctx.strokeStyle = '#132420';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6, 12); ctx.lineTo(10, 24); ctx.lineTo(7, 32); ctx.lineTo(12, 44); ctx.stroke();
      ctx.fillStyle = '#d9776b';
      ctx.fillRect(-20, 40, 2, 2); ctx.fillRect(15, 36, 2, 2); ctx.fillRect(-8, 6, 2, 2);
      ctx.fillStyle = '#e6b85c';
      ctx.fillRect(20, 42, 2, 2);
      ctx.fillStyle = '#3d7a5c';
      ctx.fillRect(-26, 47, 2, 5); ctx.fillRect(10, 47, 1, 6); ctx.fillRect(24, 47, 1, 4);
    }
    // dampers: felt pads clamped to the lip (or a wedge holding the clapper)
    for (const slot of this.dampers) {
      ctx.fillStyle = then ? '#7a2a2a' : '#3a2424';
      if (slot === 'left') { ctx.fillRect(-29, 41, 7, 8); ctx.fillStyle = then ? '#c9973f' : '#4a4a3a'; ctx.fillRect(-29, 40, 7, 1); }
      if (slot === 'right') { ctx.fillRect(22, 41, 7, 8); ctx.fillStyle = then ? '#c9973f' : '#4a4a3a'; ctx.fillRect(22, 40, 7, 1); }
      if (slot === 'top') { ctx.fillRect(-9, 3, 18, 5); ctx.fillStyle = then ? '#c9973f' : '#4a4a3a'; ctx.fillRect(-9, 3, 18, 1); }
    }
    ctx.restore();

    if (this.state === 'silent' && then) {
      // gentle dust settling off the silent bell
      if (Math.random() < 0.08) game.fx.add({ x: px + (Math.random() - 0.5) * 50, y: py + 50, vx: 0, vy: 8, g: 10, life: 2, size: 1, color: '#c8b48a', era: THEN });
    }
  }

  drawCharge(ctx, k, rgb, alpha, t) {
    if (k <= 0) return;
    const m = this.mouth;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(m.x, m.y - 16, 4, m.x, m.y - 16, 50 + k * 30);
    g.addColorStop(0, `rgba(${rgb},${0.45 * k * alpha * (0.8 + 0.2 * Math.sin(t * 20))})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(m.x - 90, m.y - 110, 180, 180);
    ctx.restore();
    ctx.strokeStyle = `rgba(${rgb},${(0.3 + 0.6 * k) * alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y - 16, 60 - k * 40, 0, Math.PI * 2); ctx.stroke();
  }

  bellPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-13, 6);
    ctx.quadraticCurveTo(-17, 20, -19, 34);
    ctx.quadraticCurveTo(-21, 42, -28, 46);
    ctx.lineTo(-28, 50);
    ctx.lineTo(28, 50);
    ctx.lineTo(28, 46);
    ctx.quadraticCurveTo(21, 42, 19, 34);
    ctx.quadraticCurveTo(17, 20, 13, 6);
    ctx.closePath();
  }
}
