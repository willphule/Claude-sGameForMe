// Drowned Bell — game loop, states, camera, HUD and the time-shift.
import { Level, TILE, NOW, THEN, ERA_NAME } from './level.js';
import { Input } from './input.js';
import { Player, HOOK } from './player.js';
import { spawnEntities, overlaps, Checkpoint, Note, Lever } from './entities.js';
import { Bellwright, TollRing } from './boss.js';
import { GreatBell } from './greatbell.js';
import { STAGES } from './stages.js';
import { LAST_LETTER } from './story.js';
import { Save, formatTime } from './save.js';
import { Menu } from './menu.js';
import {
  VIEW_W, VIEW_H, buildTileLayer, drawBackground, drawDynamicTiles, drawWater, drawVignette, drawHeart, drawDawn,
} from './render.js';
import { Sound } from './audio.js';
import { FX } from './fx.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const FONT = '8px Silkscreen, monospace';
const $ = (id) => document.getElementById(id);

const isTouch = matchMedia('(pointer: coarse)').matches;
const ENDING_TIME = 2.6;
const FINALE_TIME = 4.2;   // from the last turn of the watch to the dawn
const INTRO_TIME = 3.6;    // the stage title card
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

class Game {
  constructor() {
    this.input = new Input();
    this.sound = new Sound();
    Save.load();
    this.menu = new Menu($('menu'), this.sound);
    this.menu.onRender = () => $('title').classList.toggle('sub-page', this.menu.depth > 1);
    this.pauseMenu = new Menu($('pause-menu'), this.sound);
    this.state = 'title';
    this.t = 0;
    this.applySettings();
    const devStage = Number(params.get('stage')) - 1;
    const r = Save.data.resume;
    this.loadStage(devStage >= 0 && devStage < STAGES.length ? devStage : r ? r.stage : 0);
  }

  loadStage(index, snap = null) {
    this.stageIndex = index;
    this.stage = STAGES[index];
    this.level = new Level(this.stage.map);
    this.layers = [buildTileLayer(this.level, NOW), buildTileLayer(this.level, THEN)];
    const { list, start } = spawnEntities(this.level, {
      W: (tx, ty) => new Bellwright(tx, ty, this.stage.arena),
      Q: (tx, ty) => new GreatBell(tx, ty),
    });
    this.entities = list;
    this.crates = list.filter((e) => e.isCrate);
    for (const c of this.crates) c.settle(this.level, c.tx, c.ty);
    this.levers = list.filter((e) => e instanceof Lever);
    this.lanterns = list.filter((e) => e instanceof Checkpoint);
    this.boss = list.find((e) => e.isBoss) || null;
    this.fight = false;
    this.bannerT = 0;
    this.finaleReady = false;
    this.finale = 0;
    this.player = new Player(start.x, start.y);
    this.era = NOW;
    this.checkpoint = { x: start.x, y: start.y, era: NOW };
    this.cpCrates = this.crateState();
    this.maxHearts = Save.settings.hearts;
    this.hearts = this.maxHearts;
    this.hasWatch = !!this.stage.startWithWatch;
    this.hasHarpoon = !!this.stage.startWithHarpoon;
    this.hookTarget = null;
    this.notes = new Set();
    this.time = 0;
    this.deaths = 0;
    this.shiftCooldown = 0;
    this.trans = null;
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.flash = 0;
    this.fade = 0;
    this.dying = 0;
    this.toasts = [];
    this.fx = new FX();
    this.hitstop = 0;
    this.ending = 0;
    this.cam = { x: 0, y: 0 };
    this.gears = [];
    for (let ty = 0; ty < this.level.h; ty++)
      for (let tx = 0; tx < this.level.w; tx++)
        if (this.level.get(tx, ty) === 'G') this.gears.push({ x: tx * TILE, y: ty * TILE });
    this.tollT = this.stage.tolls ? this.stage.tolls.period : 0;
    this.tollWarned = false;
    this.tollWarn = 0;
    this.toldToll = false;
    this.pushT = 0;
    this.pushCrate = null;
    this.crustT = 0;
    this.stuckPushes = 0;
    this.toldStuck = false;
    this.introT = 0;
    if (snap) this.applySnapshot(snap);

    // Developer shortcuts for testing, e.g. ?stage=2&at=60,8&watch&harpoon&era=then
    if (params.has('watch')) this.hasWatch = true;
    if (params.has('harpoon')) this.hasHarpoon = true;
    if (params.has('at')) {
      const [tx, ty] = params.get('at').split(',').map(Number);
      this.player.x = tx * TILE + 3;
      this.player.y = ty * TILE + 2;
    }
    if (params.get('era') === 'then') this.era = THEN;
    if (params.has('flooded')) this.level.flooded = true;
    this.sound.setEra(this.era, true);
    this.sound.setUnderwater(false);
    this.sound.setBoss(false);
    $('touch').classList.toggle('has-hook', this.hasHarpoon);
    this.snapCamera();
  }

  startStage(index, snap = null) {
    this.loadStage(index, snap);
    this.sound.setDawn(false);
    this.setState('play');
    this.introT = snap && snap.cp ? INTRO_TIME - 1.2 : INTRO_TIME;
    if (!snap || !snap.cp) this.saveResume(); // Continue starts you here until you light a lantern
  }

  // ---------- saving ----------

  crateState() { return this.crates.map((c) => [c.tx, c.ty]); }

  restoreCrates(state) {
    this.level.crate.fill(0);
    this.crates.forEach((c, i) => {
      const [tx, ty] = state[i];
      c.tx = tx; c.ty = ty;
      c.x = tx * TILE; c.y = ty * TILE;
      c.ox = c.oy = c.vy = 0;
      c.falling = false;
      this.level.setCrate(tx, ty, true);
    });
  }

  // Lanterns call this. A new place to come back to also saves the game.
  setCheckpoint(cp) {
    const c = this.checkpoint;
    const moved = !c || cp.x !== c.x || cp.y !== c.y || cp.era !== c.era;
    this.checkpoint = cp;
    if (moved) {
      this.cpCrates = this.crateState();
      this.saveResume();
    }
  }

  saveResume() {
    if (params.has('nosave')) return;
    const b = this.boss;
    Save.data.resume = {
      stage: this.stageIndex,
      cp: { ...this.checkpoint },
      hasWatch: this.hasWatch,
      hasHarpoon: this.hasHarpoon,
      flooded: this.level.flooded,
      notes: [...this.notes],
      lit: this.lanterns.map((l) => l.lit),
      crates: this.cpCrates,
      bossDone: !!b && (b.state === 'wreck' || b.state === 'silent'),
      levers: this.levers.map((l) => l.pulled),
      time: this.time,
      deaths: this.deaths,
    };
    Save.write();
  }

  applySnapshot(s) {
    if (!s.cp) return; // the start of the stage
    this.hasWatch = !!s.hasWatch || !!this.stage.startWithWatch;
    this.hasHarpoon = !!s.hasHarpoon || !!this.stage.startWithHarpoon;
    this.level.flooded = !!s.flooded;
    this.time = s.time || 0;
    this.deaths = s.deaths || 0;
    this.notes = new Set(s.notes || []);
    for (const e of this.entities) if (e instanceof Note && this.notes.has(e.index)) e.dead = true;
    (s.lit || []).forEach((on, i) => { if (on && this.lanterns[i]) this.lanterns[i].lit = true; });
    if (s.crates && s.crates.length === this.crates.length) this.restoreCrates(s.crates);
    this.cpCrates = this.crateState();
    (s.levers || []).forEach((on, i) => this.levers[i] && this.levers[i].setPulled(on));
    const b = this.boss;
    if (b instanceof GreatBell) {
      b.restore(this.levers);
      if (b.hp <= 0) this.finaleReady = true;
    } else if (b && s.bossDone) {
      b.state = 'wreck';
      b.y = b.floorY - b.h;
      b.tilt = 0.5;
      this.level.sealOpen = true;
    }
    this.checkpoint = { ...s.cp };
    this.player.reset(s.cp.x, s.cp.y);
    this.era = s.cp.era;
  }

  applySettings() {
    const st = Save.settings;
    this.sound.setVolumes(st.music / 10, st.sfx / 10);
    if (this.maxHearts && this.maxHearts !== st.hearts) {
      this.hearts = clamp(this.hearts + st.hearts - this.maxHearts, 1, st.hearts);
      this.maxHearts = st.hearts;
    }
    Save.write();
  }

  // keepMenu: coming back from reading a note in the journal, so stay on the same menu page
  setState(s, keepMenu = false) {
    if (s === 'play' && this.state === 'title') this.sound.play('start');
    if (s === 'paused' || (s === 'play' && this.state === 'paused')) this.sound.play('ui');
    this.sound.duck(s === 'note' || s === 'paused' || s === 'end');
    this.state = s;
    if (s === 'title' && !keepMenu) this.openTitle();
    if (s === 'paused' && !keepMenu) this.openPause();
    $('title').classList.toggle('hidden', s !== 'title');
    $('note').classList.toggle('hidden', s !== 'note');
    $('pause').classList.toggle('hidden', s !== 'paused');
    $('end').classList.toggle('hidden', s !== 'end');
    $('credits').classList.toggle('hidden', s !== 'credits');
    $('pause-btn').classList.toggle('hidden', s !== 'play');
    $('touch').classList.toggle('idle', s !== 'play');
  }

  // ---------- update ----------

  update(dt) {
    const inp = this.input;
    inp.update();
    this.t += dt;
    switch (this.state) {
      case 'title':
        this.menu.handle(inp);
        break;
      case 'note':
        this.noteTimer += dt;
        if (this.noteTimer > 0.35 && inp.anyPressed('jump', 'interact', 'pause', 'hook')) this.closeNote();
        break;
      case 'paused':
        if (this.pauseMenu.handle(inp)) this.setState('play');
        break;
      case 'credits':
        this.updateCredits(dt);
        break;
      case 'end':
        this.endTimer += dt;
        if (this.endTimer > 1 && inp.anyPressed('jump', 'interact')) this.afterEnd();
        break;
      case 'play':
        this.updatePlay(dt);
        break;
    }
  }

  updatePlay(dt) {
    const inp = this.input;
    const p = this.player;
    if (inp.pressed('pause') && this.ending <= 0 && this.finale <= 0) { this.setState('paused'); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; } // a tiny freeze sells a hit

    this.time += dt;
    this.introT = Math.max(0, this.introT - dt);
    this.crustT = Math.max(0, this.crustT - dt);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.trans) {
      this.trans.t += dt;
      if (this.trans.t >= this.trans.dur) this.trans = null;
    }
    this.updateToasts(dt);
    this.fx.update(dt, this);
    this.sound.tick(dt);
    this.sound.setUnderwater(this.era === NOW && p.inWater && this.dying <= 0);

    if (this.ending > 0) {
      this.ending -= dt;
      for (const e of this.entities) if (!e.dead) e.update(this, dt);
      if (this.ending <= 0) this.setState('end');
      return;
    }

    if (this.finale > 0) {
      this.finale -= dt;
      for (const e of this.entities) if (!e.dead) e.update(this, dt);
      this.updateCamera(dt);
      if (this.finale <= 0) this.rollCredits();
      return;
    }

    if (this.dying > 0) {
      this.dying -= dt;
      this.fade = Math.min(1, this.fade + dt * 2.5);
      if (this.dying <= 0) this.respawn();
      return;
    }
    this.fade = Math.max(0, this.fade - dt * 2.5);

    if (inp.pressed('shift')) this.tryShift();
    this.updateHarpoon();

    p.update(dt, inp, this.level, this.era);
    this.playerEvents();
    this.updatePush(dt);
    this.updatePlates(dt);
    this.updateTolls(dt);
    this.updateBossFight(dt);

    // Spikes and gears use a slightly smaller hitbox, to be forgiving
    const hz = this.level.rectHazard(p.x + 2, p.y + 3, p.w - 4, p.h - 3, this.era);
    if (hz) this.hurt(hz.tx * TILE + TILE / 2);

    for (const e of this.entities) {
      if (e.dead) continue;
      e.update(this, dt);
      if (this.state === 'play' && e.existsIn(this.era) && overlaps(p, e)) e.touch(this);
    }
    if (this.entities.some((e) => e.dead && e.projectile)) this.entities = this.entities.filter((e) => !(e.dead && e.projectile));

    const near = this.nearInteractable();
    if (near && (inp.pressed('interact') || (inp.pressed('up') && !p.inWater))) near.interact(this);

    this.updateCamera(dt);
  }

  // ---------- ballast blocks, plates and doors ----------

  // Walking into a block for a moment shoves it one tile — but only in THEN.
  updatePush(dt) {
    const p = this.player, inp = this.input;
    const dir = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
    let target = null;
    if (dir && p.onGround && !p.hook && !p.inWater && p.knock <= 0) {
      for (const c of this.crates) {
        if (c.ox || c.oy || c.falling) continue;
        const touching = dir > 0 ? Math.abs(p.x + p.w - c.x) < 0.5 : Math.abs(c.x + TILE - p.x) < 0.5;
        if (touching && p.y < c.y + TILE - 1 && p.y + p.h > c.y + 2) { target = c; break; }
      }
    }
    if (!target) { this.pushT = 0; this.pushCrate = null; return; }
    if (this.era === NOW) {
      if (this.crustT <= 0) {
        this.toast('Crusted to the floor with fifty years of coral. In the THEN it would move.', 3);
        this.sound.play('rusted');
        this.crustT = 4;
      }
      return;
    }
    if (this.pushCrate !== target) { this.pushCrate = target; this.pushT = 0; }
    this.pushT += dt;
    if (this.pushT >= 0.2) {
      this.pushT = 0;
      if (target.push(this, dir)) this.stuckPushes = 0;
      else if (++this.stuckPushes === 6 && !this.toldStuck) {
        this.toldStuck = true;
        this.toast('Block stuck? Pause and pick Restart from lantern to put it back.', 5);
      }
    }
  }

  // Plates hold every weighted door in the level open while something is on them.
  updatePlates(dt) {
    const lvl = this.level;
    if (!lvl.plates.length) return;
    const p = this.player;
    let any = false;
    for (const pl of lvl.plates) {
      const box = { x: pl.tx * TILE, y: pl.ty * TILE + 8, w: TILE, h: 8 };
      const was = pl.pressed;
      pl.pressed = lvl.hasCrate(pl.tx, pl.ty) || (this.dying <= 0 && overlaps(p, box));
      if (pl.pressed !== was) this.sound.play('plate', pl.pressed);
      any = any || pl.pressed;
    }
    if (any !== lvl.doorsOpen && (any || !this.inDoorway())) {
      lvl.doorsOpen = any;
      this.sound.play('door', any);
      this.shake(0.25, 1);
    }
    lvl.doorAnim = approach(lvl.doorAnim, lvl.doorsOpen ? 1 : 0, dt * (lvl.doorsOpen ? 2.5 : 6));
  }

  inDoorway() {
    const p = this.player, lvl = this.level;
    const x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.001) / TILE);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (lvl.get(tx, ty) === '=') return true;
    return false;
  }

  // ---------- the distant toll ----------

  // While you climb the counterweight shaft, the Great Bell tolls far above. Its toll is only in THEN.
  updateTolls(dt) {
    const z = this.stage.tolls;
    if (!z) return;
    const p = this.player;
    const inside = p.cx >= z.x0 * TILE && p.cx < (z.x1 + 1) * TILE && p.cy >= z.y0 * TILE && p.cy < (z.y1 + 1) * TILE;
    if (!inside) {
      // a moment's grace whenever you come back in
      this.tollT = Math.max(this.tollT, z.warn + 1.5);
      this.tollWarned = false;
      this.tollWarn = 0;
      return;
    }
    this.tollT -= dt;
    if (this.tollT <= z.warn && !this.tollWarned) {
      this.tollWarned = true;
      this.sound.play('distantWind');
      if (!this.toldToll) {
        this.toldToll = true;
        this.toast('The Great Bell is about to toll. It only shakes the THEN!', 3.5);
      }
    }
    this.tollWarn = this.tollWarned ? clamp(1 - this.tollT / z.warn, 0, 1) : 0;
    if (this.tollT <= 0) {
      const bounds = { x: z.x0 * TILE, y: z.y0 * TILE, w: (z.x1 - z.x0 + 1) * TILE, h: (z.y1 - z.y0 + 1) * TILE };
      this.entities.push(new TollRing(z.origin[0] * TILE, z.origin[1] * TILE, { era: THEN, speed: z.speed, maxR: z.maxR, bounds }));
      this.sound.play('distantToll');
      this.shake(0.6, 1.5);
      this.tollT = z.period;
      this.tollWarned = false;
      this.tollWarn = 0;
    }
  }

  // ---------- the harpoon ----------

  updateHarpoon() {
    const p = this.player;
    if (!this.hasHarpoon) { this.hookTarget = null; return; }
    this.hookTarget = p.hook ? null : this.findAnchor();
    if (!this.input.pressed('hook')) return;
    if (p.hook) { p.detach('unhook'); return; }
    const a = this.hookTarget;
    if (!a) { this.sound.play('hookMiss'); return; }
    p.attach(a);
    a.pulse = 1;
    this.sound.play('hook');
    this.fx.burst(a.cx, a.cy, { n: 8, speed: [30, 90], color: '#ffe3a0', g: 200, life: 0.3, size: 1 });
  }

  // The best ring to fire at: in range, in sight, above-ish, preferring the way you face.
  findAnchor() {
    const p = this.player;
    let best = null, bestScore = Infinity;
    for (const e of this.entities) {
      if (!e.isAnchor || !e.existsIn(this.era)) continue;
      if (e === p.lastAnchor && p.lastAnchorT > 0) continue;
      const dx = e.cx - p.cx, dy = e.cy - p.cy;
      const d = Math.hypot(dx, dy);
      if (d > HOOK.RANGE || dy > 8) continue;
      if (!this.lineOfSight(p.cx, p.cy, e.cx, e.cy)) continue;
      const score = d + (dx * p.facing < -8 ? 60 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  lineOfSight(x0, y0, x1, y1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let i = 1; i < steps - 1; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
      if (this.level.isSolid(Math.floor(x / TILE), Math.floor(y / TILE), this.era)) return false;
    }
    return true;
  }

  // ---------- the boss ----------

  updateBossFight(dt) {
    this.bannerT = Math.max(0, this.bannerT - dt);
    const b = this.boss;
    if (!b || this.fight || b.state !== 'dormant' || (b.wakeEra != null && this.era !== b.wakeEra)) return;
    const a = this.stage.arena, p = this.player;
    if (p.cx > a.triggerX * TILE && p.cx < (a.x1 + 1) * TILE && p.cy < (a.floor + 1) * TILE && p.cy > a.y0 * TILE) {
      this.fight = true;
      this.level.gatesClosed = true;
      this.sound.play('gate');
      this.sound.setBoss(true);
      this.bannerT = 3;
      b.wake(this);
    }
  }

  onBossDefeated() {
    this.fight = false;
    this.level.gatesClosed = false;
    this.sound.setBoss(false);
    this.sound.play('gate');
    if (this.stage.final) {
      this.finaleReady = true;
      this.toast('The Great Bell is silent. Turn the watch, one last time.', 6);
    } else {
      this.level.sealOpen = true;
      this.toast('The way to the Great Bell is open.', 4);
    }
    this.saveResume();
  }

  nearInteractable() {
    const p = this.player;
    const box = { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 };
    return this.entities.find((e) => e.interactable && e.existsIn(this.era) && overlaps(box, e));
  }

  tryShift() {
    if (!this.hasWatch || this.shiftCooldown > 0) return;
    const p = this.player;
    const to = 1 - this.era;
    if (this.level.rectSolid(p.x, p.y, p.w, p.h, to)) {
      this.shiftCooldown = 0.2;
      this.shake(0.15, 2);
      this.toast(`Something stands here in the ${ERA_NAME[to]}.`, 1.6);
      this.burst(p.cx, p.cy, '#ff6a5a', 6);
      this.sound.play('blocked');
      return;
    }
    if (p.hook && !p.hook.anchor.existsIn(to)) {
      p.detach('snap');
      this.toast('The ring is not there in the ' + ERA_NAME[to] + ' — the line goes slack.', 2.5);
    }
    this.trans = { t: 0, dur: 0.45, from: this.era, to };
    this.era = to;
    this.shiftCooldown = 0.25;
    p.inWater = this.level.isWaterAt(p.cx, p.cy, to); // no splash sound when the water appears around you
    this.sound.play('shift', to);
    this.sound.setEra(to);
    const color = to === NOW ? '#7ff3ff' : '#ffd36b';
    this.fx.eraFlash = 1;
    this.fx.eraFlashColor = to === NOW ? '127,243,255' : '255,211,107';
    this.fx.burst(p.cx, p.cy, { n: 18, speed: [90, 180], kind: 'streak', color, g: 0, drag: 5, life: 0.45 });
    this.fx.burst(p.cx, p.cy, { n: 10, speed: [10, 40], color, g: -20, life: 0.8, size: 1 });
    if (this.finaleReady && to === NOW) this.beginFinale();
  }

  // Turn what the player did this frame into sound and dust.
  playerEvents() {
    const p = this.player, fx = this.fx, snd = this.sound;
    const dust = this.era === NOW ? '#6a8a88' : '#c49a68';
    for (const ev of p.events) {
      if (ev === 'jump') {
        snd.play('jump');
        fx.burst(p.cx, p.y + p.h, { n: 5, speed: [15, 45], angle: -Math.PI / 2, spread: 2.6, g: 40, drag: 4, life: 0.35, color: dust });
      } else if (ev === 'land') {
        const k = p.landImpact;
        snd.play('land', k);
        fx.burst(p.cx - 3, p.y + p.h, { n: 2 + Math.round(5 * k), speed: [20, 60 * k + 20], angle: Math.PI, spread: 0.6, g: 30, drag: 5, life: 0.4, color: dust });
        fx.burst(p.cx + 3, p.y + p.h, { n: 2 + Math.round(5 * k), speed: [20, 60 * k + 20], angle: 0, spread: 0.6, g: 30, drag: 5, life: 0.4, color: dust });
        if (k > 0.8) this.shake(0.12, 1.5);
      } else if (ev === 'step') {
        snd.play('step', p.stepAlt);
        if (Math.random() < 0.7) fx.add({ x: p.cx - p.facing * 3, y: p.y + p.h - 1, vx: -p.facing * 15, vy: -12, g: 20, drag: 4, life: 0.3, size: 2, color: dust });
      } else if (ev === 'stroke') {
        snd.play('stroke');
        fx.bubbles(p.cx - p.facing * 2, p.y + 6, 3);
      } else if (ev === 'unhook' || ev === 'release' || ev === 'snap') {
        snd.play(ev === 'snap' ? 'snap' : 'unhook');
      } else if (ev === 'splashIn' || ev === 'splashOut') {
        const big = ev === 'splashIn' ? Math.min(1, 0.4 + Math.abs(p.vy) / 150) : 0.5;
        snd.play('splash', big);
        const sy = this.surfaceY(p.cx, p.cy);
        fx.burst(p.cx, sy, { n: Math.round(14 * big), speed: [40, 120], angle: -Math.PI / 2, spread: 1.4, g: 500, life: 0.55, size: 2, color: 'rgba(170,235,255,0.9)', era: NOW });
        fx.ring(p.cx, sy, '170,235,255', 16, 0.5, 1);
        if (ev === 'splashIn') fx.bubbles(p.cx, p.cy + 4, 6);
      }
    }
  }

  surfaceY(px, py) {
    let ty = Math.floor(py / TILE);
    while (ty > 0 && this.level.isWater(Math.floor(px / TILE), ty - 1, NOW)) ty--;
    return ty * TILE + 2;
  }

  hurt(srcX) {
    const p = this.player;
    if (p.invuln > 0 || this.dying > 0) return;
    p.detach('release');
    this.hearts--;
    p.invuln = 1.2;
    p.knock = 0.25;
    const dir = p.cx < srcX ? -1 : 1;
    p.vx = dir * 150;
    p.vy = -230;
    p.jumping = false;
    this.shake(0.3, 3);
    this.flash = 0.25;
    this.hitstop = 0.07;
    this.burst(p.cx, p.cy, '#ff7a6a', 10);
    if (this.hearts <= 0) {
      this.dying = 1.2;
      this.deaths++;
      this.sound.play('die');
      // the diver comes apart into brass, glass and bubbles
      for (const color of ['#c9973f', '#3e6670', '#9ff6ff', '#8a6326']) {
        this.fx.burst(p.cx, p.cy, { n: 8, speed: [20, 90], color, g: p.inWater ? -30 : 250, drag: 2, life: 1.1, size: 2 });
      }
      if (p.inWater) this.fx.bubbles(p.cx, p.cy, 12);
    } else {
      this.sound.play('hurt');
    }
  }

  respawn() {
    const c = this.checkpoint;
    this.player.reset(c.x, c.y);
    this.player.invuln = 1.0;
    this.era = c.era;
    this.hearts = this.maxHearts;
    this.trans = null;
    this.sound.setEra(c.era, true);
    this.sound.play('checkpoint');
    this.restoreCrates(this.cpCrates);
    if (this.stage.tolls) { this.tollT = this.stage.tolls.period; this.tollWarned = false; this.tollWarn = 0; }
    if (this.fight || (this.boss && !['dormant', 'wreck', 'silent'].includes(this.boss.state))) {
      // a fresh attempt at the boss
      this.fight = false;
      this.boss.reset();
      this.level.gatesClosed = false;
      this.entities = this.entities.filter((e) => !e.projectile);
      this.sound.setBoss(false);
      // fell while the last damper was settling: the bell is silent all the same
      if (this.stage.final && this.boss.state === 'silent' && !this.finaleReady) this.onBossDefeated();
    }
    this.fx.ring(this.player.cx, this.player.cy, '255,211,107', 30, 0.6, 2);
    this.snapCamera();
  }

  collectNote(i) {
    this.notes.add(i);
    Save.addNote(this.stageIndex, i);
    const n = this.stage.notes[i];
    if (n.unlocksWatch) this.hasWatch = true;
    if (n.ability === 'harpoon') {
      this.hasHarpoon = true;
      $('touch').classList.add('has-hook');
    }
    this.currentNote = n;
    this.sound.play('note');
    const p = this.player;
    this.fx.burst(p.cx, p.cy, { n: 16, speed: [30, 80], color: '#fff1c0', g: -10, drag: 3, life: 0.9, size: 1 });
    this.fx.ring(p.cx, p.cy, '255,241,192', 26, 0.5, 2);
    this.showNote(n);
  }

  // from: 'title' or 'paused' when reading from the journal, so closing goes back there
  showNote(n, from = null) {
    $('note-from').textContent = n.from;
    $('note-text').innerHTML = '';
    for (const para of n.text) {
      const el = document.createElement('p');
      el.textContent = para;
      $('note-text').appendChild(el);
    }
    $('note-continue').textContent = from ? 'Jump or tap to go back' : 'Jump or tap to continue';
    this.noteTimer = 0;
    this.reading = from;
    if (from) this.sound.play('note');
    this.setState('note');
  }

  closeNote() {
    this.sound.play('ui');
    if (this.reading) {
      const back = this.reading;
      this.reading = null;
      this.setState(back, true);
      return;
    }
    this.setState('play');
    if (this.currentNote && this.currentNote.unlocksWatch) {
      this.toast(isTouch ? 'You took the watch. Tap the watch button to turn it.' : 'You took the watch. Press X or Shift to turn it.', 5);
    }
    if (this.currentNote && this.currentNote.ability === 'harpoon') {
      this.sound.play('pickup');
      this.toast(isTouch ? 'You took the harpoon. Tap HOOK near a ring.' : 'You took the harpoon. Press C or J near a ring.', 5);
    }
    this.currentNote = null;
  }

  finish() {
    if (this.state === 'end' || this.ending > 0) return;
    // the bell tolls, then the ending card
    this.ending = ENDING_TIME;
    this.sound.play('bell');
    this.shake(0.8, 2);
    const p = this.player;
    this.fx.ring(p.cx, p.cy - 6, '159,246,255', 160, 2.2, 3);
    this.fx.ring(p.cx, p.cy - 6, '159,246,255', 90, 1.5, 2);
    this.fx.bubbles(p.cx, p.cy, 10);
    const [found, total] = this.noteCount();
    const prevBest = Save.stage(this.stageIndex).best;
    Save.finishStage(this.stageIndex, this.time);
    const next = this.stageIndex + 1 < STAGES.length;
    if (next) Save.data.resume = { stage: this.stageIndex + 1 };
    Save.write();
    $('end-title').textContent = this.stage.ending.title;
    $('end-text').textContent = this.stage.ending.text;
    $('end-banner').textContent = `End of Stage ${this.stageIndex + 1}`;
    const record = prevBest != null && this.time < prevBest ? '  ·  New best!' : '';
    $('end-stats').textContent =
      `Time ${formatTime(this.time)}  ·  Notes ${found}/${total}  ·  Falls ${this.deaths}${record}`;
    $('end-next').textContent = next
      ? `Press Jump or tap to continue to Stage ${this.stageIndex + 2}`
      : 'Press Jump or tap to return to the title.';
    this.endTimer = 0; // the ending card appears when the bell sequence finishes (see updatePlay)
  }

  afterEnd() {
    if (this.stageIndex + 1 < STAGES.length) this.startStage(this.stageIndex + 1);
    else this.setState('title');
  }

  noteCount() {
    const real = this.stage.notes.map((n, i) => (n.ability ? -1 : i)).filter((i) => i >= 0);
    return [real.filter((i) => this.notes.has(i)).length, real.length];
  }

  // ---------- menus ----------

  openTitle() {
    this.confirmNew = false;
    this.confirmErase = false;
    const [found, total] = Save.totals();
    $('title-sub').innerHTML = Save.data.completed
      ? 'The Great Bell of Carillon is silent, and the sea stayed where it was.<br>' + (found < total ? `You found ${found} of ${total} notes. The watch may still hold a secret.` : 'You found every note. Thank you for listening.')
      : 'The city of Carillon sank fifty years ago, the night its great bell rang.<br>You are the first diver to go looking for it.';
    this.menu.open(this.titleRoot());
  }

  titleRoot() {
    const r = Save.data.resume;
    const progress = Save.hasProgress();
    const items = [];
    if (r) {
      items.push({ label: 'Continue', note: `Stage ${r.stage + 1} · ${STAGES[r.stage].name}`, action: () => this.startStage(r.stage, r) });
    }
    items.push({
      label: () => (this.confirmNew ? 'Start again from the beginning?' : progress ? 'New game' : 'Begin'),
      note: () => (this.confirmNew ? 'Press again' : progress ? 'Chapters stay unlocked' : ''),
      action: () => {
        if (r && r.cp && !this.confirmNew) { this.confirmNew = true; this.menu.refresh(); this.sound.play('ui'); return; }
        this.startStage(0);
      },
    });
    if (Save.data.unlocked > 0 || Save.data.completed) items.push({ label: 'Chapters', action: () => this.menu.push(this.chaptersPage()) });
    if (Save.totals()[0] > 0) {
      items.push({ label: 'Journal', note: () => `${Save.totals()[0]}/${Save.totals()[1]} notes`, action: () => this.menu.push(this.journalPage('title')) });
    }
    items.push({ label: 'Options', action: () => this.menu.push(this.optionsPage(this.menu, true)) });
    if (Save.data.completed) items.push({ label: 'Credits', action: () => this.playCredits(false) });
    return { items };
  }

  chaptersPage() {
    const items = STAGES.slice(0, Save.data.unlocked + 1).map((st, i) => {
      const rec = Save.stage(i);
      return {
        label: `${i + 1}. ${st.name}`,
        note: `${Save.notesFound(i)}/${Save.realNotes(i).length} notes · ${rec.done ? 'best ' + formatTime(rec.best) : 'unfinished'}`,
        action: () => this.startStage(i),
      };
    });
    items.push({ label: 'Back', action: () => this.menu.pop() });
    return { title: 'Chapters', items };
  }

  journalPage(from) {
    const menu = from === 'title' ? this.menu : this.pauseMenu;
    const items = [];
    STAGES.forEach((st, si) => {
      const found = Save.stage(si).notes;
      const list = st.notes.filter((n, i) => !n.ability && found.includes(i));
      if (!list.length) return;
      items.push({ label: `${si + 1} · ${st.name}`, header: true });
      for (const n of list) items.push({ label: n.from, action: () => this.showNote(n, from) });
    });
    if (Save.data.completed && Save.allNotesFound()) {
      items.push({ label: 'The watch', header: true });
      items.push({ label: LAST_LETTER.from, action: () => this.showNote(LAST_LETTER, from) });
    }
    items.push({ label: 'Back', action: () => menu.pop() });
    const [found, total] = Save.totals();
    return { title: 'Journal', text: `${found} of ${total} notes found`, items };
  }

  optionsPage(menu, fromTitle) {
    const st = Save.settings;
    const bar = (v) => '■'.repeat(v) + '□'.repeat(10 - v);
    const items = [
      { label: 'Music', value: () => bar(st.music), adjust: (d) => { st.music = clamp(st.music + d, 0, 10); this.applySettings(); } },
      {
        label: 'Sound effects',
        value: () => bar(st.sfx),
        adjust: (d) => { st.sfx = clamp(st.sfx + d, 0, 10); this.applySettings(); this.sound.play('checkpoint'); },
      },
      { label: 'Screen shake', value: () => (st.shake ? 'On' : 'Off'), adjust: () => { st.shake = !st.shake; this.applySettings(); } },
      { label: 'Hearts', value: () => (st.hearts === 5 ? '5 · Gentle' : '3 · Standard'), adjust: () => { st.hearts = st.hearts === 5 ? 3 : 5; this.applySettings(); } },
      { label: 'Controls', action: () => menu.push(this.controlsPage(menu)) },
    ];
    if (fromTitle) {
      items.push({
        label: () => (this.confirmErase ? 'Really erase everything?' : 'Erase saved game'),
        note: () => (this.confirmErase ? 'Press again' : ''),
        action: () => {
          if (!this.confirmErase) { this.confirmErase = true; this.menu.refresh(); this.sound.play('blocked'); return; }
          Save.erase();
          this.loadStage(0);
          this.openTitle();
          this.toast('Saved game erased', 2);
        },
      });
    }
    items.push({ label: 'Back', action: () => { this.confirmErase = false; menu.pop(); } });
    return { title: 'Options', items };
  }

  controlsPage(menu) {
    return {
      title: 'Controls',
      text: isTouch
        ? ['◀ ▶ move · JUMP jump and swim · ▼ dive', '◷ turn the watch · HOOK harpoon · USE use things', 'Hold JUMP for a higher jump. Hold ▲ on the line to climb it.']
        : [
          'Arrows / WASD — move · Z / Space — jump, swim up',
          'X / Shift — turn the watch · C / J — harpoon',
          'Up / Down — climb or lower the line · E / Up — use',
          'Esc / P — pause · M — sound on or off',
          'Gamepad: stick to move, A jump, X turn the watch, B harpoon, Y use, Start pause',
        ],
      items: [{ label: 'Back', action: () => menu.pop() }],
    };
  }

  openPause() {
    const items = [
      { label: 'Resume', action: () => this.setState('play') },
      {
        label: 'Restart from lantern',
        disabled: () => !!this.boss && ['dying', 'falling', 'silencing'].includes(this.boss.state),
        action: () => { this.setState('play'); this.respawn(); },
      },
    ];
    if (Save.totals()[0] > 0) items.push({ label: 'Journal', action: () => this.pauseMenu.push(this.journalPage('paused')) });
    items.push({ label: 'Options', action: () => this.pauseMenu.push(this.optionsPage(this.pauseMenu, false)) });
    items.push({ label: 'Quit to title', note: 'Saved at your last lantern', action: () => this.quitToTitle() });
    this.pauseMenu.open({ items });
  }

  quitToTitle() {
    this.saveResume();
    this.sound.setBoss(false);
    this.loadStage(this.stageIndex, Save.data.resume);
    this.setState('title');
  }

  // ---------- the finale and the credits ----------

  beginFinale() {
    this.finale = FINALE_TIME;
    this.finaleReady = false;
    this.toasts = [];
    this.sound.setBoss(false);
    this.sound.play('dawn');
    this.sound.setDawn(true);
    Save.finishStage(this.stageIndex, this.time);
    Save.data.completed = true;
    Save.data.resume = null;
    Save.write();
    this.trueEnding = Save.allNotesFound();
  }

  rollCredits() {
    const end = this.stage.ending;
    const pages = [{ kind: 'text', title: end.title, text: end.text }];
    if (this.trueEnding) pages.push({ kind: 'letter' });
    pages.push({ kind: 'roll' }, { kind: 'thanks' });
    this.playCredits(true, pages);
  }

  // fromEnding: straight after the finale. Otherwise the Credits item on the title screen.
  playCredits(fromEnding, pages = [{ kind: 'roll' }, { kind: 'thanks' }]) {
    this.creditPages = pages;
    this.creditPage = -1;
    this.creditsT = 0;
    this.creditsFromEnding = fromEnding;
    if (!fromEnding) this.sound.setDawn(true);
    this.setState('credits');
    this.nextCreditPage();
  }

  nextCreditPage() {
    this.creditPage++;
    this.pageT = 0;
    const page = this.creditPages[this.creditPage];
    if (!page) { this.leaveCredits(); return; }
    const el = $('credits-page');
    el.innerHTML = '';
    el.style.animation = 'none';
    void el.offsetHeight; // restart the fade-in
    el.style.animation = '';
    const add = (tag, text, cls) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      e.textContent = text;
      el.appendChild(e);
      return e;
    };
    let next = 'Jump or tap to continue';
    if (page.kind === 'text') {
      add('h2', page.title);
      for (const line of page.text) add('p', line, 'sub');
    } else if (page.kind === 'letter') {
      const paper = add('div', '', 'paper');
      const from = document.createElement('div');
      from.id = 'credits-from';
      from.className = 'from';
      from.textContent = LAST_LETTER.from;
      paper.appendChild(from);
      for (const line of LAST_LETTER.text) {
        const p = document.createElement('p');
        p.textContent = line;
        paper.appendChild(p);
      }
    } else if (page.kind === 'roll') {
      el.appendChild(this.creditRoll());
      next = 'Jump or tap to skip';
    } else if (page.kind === 'thanks') {
      add('h2', 'The bell is silent');
      add('p', 'Thank you for playing.', 'sub');
      const [found, total] = Save.totals();
      add('p', `Notes found ${found} of ${total}`, 'stats');
      if (found < total) add('p', 'Some say the watch case holds one more, for whoever reads every note.', 'tiny');
      next = 'Jump or tap to return to the title';
    }
    $('credits-next').textContent = next;
  }

  creditRoll() {
    const roll = document.createElement('div');
    roll.className = 'roll';
    const inner = document.createElement('div');
    inner.className = 'roll-inner';
    roll.appendChild(inner);
    const sec = (title, ...lines) => {
      if (title) { const h = document.createElement('h3'); h.textContent = title; inner.appendChild(h); }
      for (const l of lines) { const p = document.createElement('p'); p.textContent = l; inner.appendChild(p); }
    };
    const big = document.createElement('p');
    big.className = 'big';
    big.textContent = 'DROWNED BELL';
    inner.appendChild(big);
    sec(null, 'An exploration platformer in three stages');
    sec('MADE BY', 'Claude');
    sec('FOR', 'willphule');
    sec('ART, MUSIC AND SOUND', 'Every picture drawn and every note played', 'live by your browser, from code.', 'No image or sound files were used.');
    sec('WITH THANKS TO THE GAMES THAT INSPIRED IT', 'Metroid · Castlevania · Soul Reaver', 'Prince of Persia · BioShock · Myst · Oddworld');
    sec('THE PEOPLE OF CARILLON', 'Ilse Varga, clockmaker', 'Teodor, who went up to stop the Bellwright', 'The Bellwright, who did its job', 'The Council, who took the credit');
    sec('YOUR JOURNEY', ...STAGES.map((st, i) => `${st.name} — ${formatTime(Save.stage(i).best)}`));
    sec(null, '', 'And the diver, who carried the watch back.');
    return roll;
  }

  updateCredits(dt) {
    this.creditsT += dt;
    this.pageT += dt;
    this.sound.tick(dt);
    const page = this.creditPages[this.creditPage];
    if (!page) return;
    const auto = page.kind === 'roll' ? 27 : null;
    if ((this.pageT > 1.2 && this.input.anyPressed('jump', 'interact', 'pause')) || (auto && this.pageT > auto)) this.nextCreditPage();
  }

  leaveCredits() {
    this.sound.setDawn(false);
    const r = Save.data.resume;
    this.loadStage(r ? r.stage : 0, r);
    this.setState('title');
  }

  // ---------- effects ----------

  shake(time, amp) {
    if (!Save.settings.shake) return;
    this.shakeT = Math.max(this.shakeT, time);
    this.shakeAmp = amp;
  }

  toast(text, dur = 2.5) {
    const existing = this.toasts.find((t) => t.text === text);
    if (existing) { existing.life = dur; return; }
    this.toasts.push({ text, life: dur });
    if (this.toasts.length > 2) this.toasts.shift();
  }

  updateToasts(dt) {
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
  }

  burst(x, y, color, n, vyBias = 0) {
    this.fx.burst(x, y, { color, n, vyBias });
  }

  // ---------- camera ----------

  camTarget() {
    const p = this.player;
    // during the boss fight the camera frames the whole chamber
    const a = this.stage.arena;
    if (a && this.fight) return { x: a.x0 * TILE, y: (a.y0 - 1) * TILE };
    return { x: p.cx - VIEW_W / 2 + p.facing * 24, y: p.cy - VIEW_H / 2 - 8 };
  }

  clampCam() {
    this.cam.x = Math.max(0, Math.min(this.level.pxW - VIEW_W, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.level.pxH - VIEW_H, this.cam.y));
  }

  updateCamera(dt) {
    const tg = this.camTarget();
    this.cam.x += (tg.x - this.cam.x) * (1 - Math.exp(-dt * 5));
    this.cam.y += (tg.y - this.cam.y) * (1 - Math.exp(-dt * 7));
    this.clampCam();
  }

  snapCamera() {
    const tg = this.camTarget();
    this.cam.x = tg.x;
    this.cam.y = tg.y;
    this.clampCam();
  }

  // ---------- render ----------

  render() {
    if (this.state === 'credits' || (this.state === 'title' && Save.data.completed)) {
      drawDawn(ctx, this.t);
      if (this.state === 'credits' && this.creditsFromEnding && this.creditsT < 2.5) {
        ctx.fillStyle = `rgba(255,248,230,${1 - this.creditsT / 2.5})`;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      return;
    }
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      sx = (Math.random() - 0.5) * 2 * this.shakeAmp;
      sy = (Math.random() - 0.5) * 2 * this.shakeAmp;
    }
    const cam = { x: Math.round(this.cam.x + sx), y: Math.round(this.cam.y + sy) };
    cam.x = Math.max(0, Math.min(this.level.pxW - VIEW_W, cam.x));
    cam.y = Math.max(0, Math.min(this.level.pxH - VIEW_H, cam.y));

    if (this.trans) {
      const tr = this.trans;
      const k = 1 - Math.pow(1 - tr.t / tr.dur, 3);
      const px = this.player.cx - cam.x, py = this.player.cy - cam.y;
      this.renderWorld(tr.from, cam);
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, k * 560, 0, Math.PI * 2);
      ctx.clip();
      this.renderWorld(tr.to, cam);
      ctx.restore();
      ctx.strokeStyle = tr.to === NOW ? 'rgba(127,243,255,0.85)' : 'rgba(255,211,107,0.85)';
      ctx.lineWidth = 1 + 3 * (1 - k);
      ctx.beginPath();
      ctx.arc(px, py, k * 560, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      this.renderWorld(this.era, cam);
    }

    this.fx.drawEraFlash(ctx);
    if (this.ending > 0) {
      ctx.fillStyle = `rgba(200,250,255,${(1 - this.ending / ENDING_TIME) * 0.7})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,60,60,${this.flash * 0.8})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.finale > 0) {
      const k = 1 - this.finale / FINALE_TIME;
      ctx.fillStyle = `rgba(255,248,230,${Math.min(1, k * k * 1.15)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.state !== 'title' && this.finale <= 0) this.renderHUD();
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  renderWorld(era, cam) {
    const realEra = this.era;
    this.era = era; // entities colour themselves by the era being drawn
    drawBackground(ctx, era, cam, this.t, this.stage.background);
    this.fx.drawOverlay(ctx, era); // lightning lights up the sky behind the city
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(this.layers[era], cam.x, cam.y, VIEW_W, VIEW_H, cam.x, cam.y, VIEW_W, VIEW_H);
    drawDynamicTiles(ctx, this.level, era, cam, this.t);
    this.drawHints();
    for (const e of this.entities) {
      if (e.existsIn(era)) e.draw(ctx, this, this.t);
      else if (e.drawGhost && !e.dead) e.drawGhost(ctx, this);
    }
    this.drawRope();

    const near = this.state === 'play' && this.nearInteractable();
    if (near) {
      const bx = Math.round(near.x + near.w / 2), by = Math.round(near.y - 12 + Math.sin(this.t * 5));
      ctx.fillStyle = 'rgba(10,20,25,0.8)';
      ctx.fillRect(bx - 9, by - 6, 18, 10);
      ctx.fillStyle = '#ffe9b0';
      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.fillText(isTouch ? 'USE' : 'E', bx, by + 2);
    }

    if (this.dying <= 0) this.player.draw(ctx, this.t, this.hasWatch);
    this.fx.draw(ctx, era);

    // in the finale the water drains away as the city forgets it ever drowned
    const waterAlpha = this.finale > 0 ? clamp((this.finale - 1.4) / (FINALE_TIME - 1.4), 0, 1) : 1;
    drawWater(ctx, this.level, era, cam, this.t, waterAlpha);
    ctx.restore();

    if (era === NOW) {
      // soft light from the diver's visor
      const p = this.player;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gx = p.cx - cam.x, gy = p.y + 4 - cam.y;
      const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, 70);
      g.addColorStop(0, 'rgba(110,220,240,0.14)');
      g.addColorStop(1, 'rgba(110,220,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(gx - 70, gy - 70, 140, 140);
      ctx.restore();
    }
    drawVignette(ctx, era);
    this.era = realEra;
  }

  drawRope() {
    const p = this.player;
    if (p.hook) {
      const a = p.hook.anchor;
      const hx = p.cx + p.facing * 3, hy = p.y + 7;
      const slack = Math.max(0, p.hook.len - Math.hypot(a.cx - hx, a.cy - hy));
      ctx.strokeStyle = '#d9c08a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo((hx + a.cx) / 2, (hy + a.cy) / 2 + slack * 0.6, a.cx, a.cy);
      ctx.stroke();
    } else if (this.hookTarget && this.state === 'play' && this.dying <= 0) {
      // corner brackets around the ring you would hit
      const a = this.hookTarget, r = 8 + Math.sin(this.t * 8);
      ctx.strokeStyle = 'rgba(255,241,192,0.85)';
      ctx.lineWidth = 1;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(a.cx + sx * r, a.cy + sy * (r - 3));
        ctx.lineTo(a.cx + sx * r, a.cy + sy * r);
        ctx.lineTo(a.cx + sx * (r - 3), a.cy + sy * r);
        ctx.stroke();
      }
    }
  }

  drawHints() {
    ctx.font = FONT;
    ctx.textAlign = 'left';
    for (const h of this.stage.hints) {
      if (h.cond && !h.cond(this)) continue;
      const lines = isTouch && h.touch ? h.touch : h.lines;
      ctx.fillStyle = this.era === NOW ? 'rgba(190,235,245,0.7)' : 'rgba(255,230,190,0.75)';
      lines.forEach((line, i) => ctx.fillText(line, Math.round(h.tx * TILE), Math.round(h.ty * TILE + i * 10)));
    }
  }

  drawBossHUD() {
    const b = this.boss;
    if (!b) return;
    if (this.bannerT > 0) {
      const a = Math.min(1, this.bannerT, (3 - this.bannerT) * 2);
      ctx.textAlign = 'center';
      ctx.font = '16px Silkscreen, monospace';
      ctx.fillStyle = `rgba(255,207,107,${a})`;
      ctx.fillText(b.title, VIEW_W / 2, 80);
      ctx.font = FONT;
      ctx.fillStyle = `rgba(230,220,200,${a * 0.8})`;
      ctx.fillText(b.subtitle, VIEW_W / 2, 94);
    }
    if (!this.fight) return;
    const w = 160, x = VIEW_W / 2 - w / 2, y = 20;
    ctx.fillStyle = 'rgba(5,12,16,0.7)';
    ctx.fillRect(x - 4, y - 12, w + 8, 22);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf6b';
    ctx.fillText(b.title, VIEW_W / 2, y - 3);
    for (let i = 0; i < b.maxHp; i++) {
      const sw = (w - (b.maxHp - 1) * 4) / b.maxHp;
      ctx.fillStyle = i < b.hp ? '#e0aa55' : '#3a3f48';
      ctx.fillRect(Math.round(x + i * (sw + 4)), y + 1, Math.round(sw), 5);
    }
  }

  // The stage title card, drawn over the first few seconds of a stage.
  drawIntro() {
    if (this.introT <= 0 || this.state !== 'play') return;
    const a = Math.min(1, this.introT / 0.8, (INTRO_TIME - this.introT) / 0.6);
    if (a <= 0) return;
    ctx.fillStyle = `rgba(3,10,14,${0.55 * a})`;
    ctx.fillRect(0, 92, VIEW_W, 46);
    ctx.textAlign = 'center';
    ctx.font = FONT;
    ctx.fillStyle = `rgba(255,211,107,${a})`;
    ctx.fillText(`STAGE ${this.stageIndex + 1}`, VIEW_W / 2, 108);
    ctx.font = '16px Silkscreen, monospace';
    ctx.fillStyle = `rgba(230,245,245,${a})`;
    ctx.fillText(this.stage.name.toUpperCase(), VIEW_W / 2, 128);
  }

  // A gold glow creeping down from the top of the screen as the distant bell gathers itself.
  drawTollWarning() {
    if (this.tollWarn <= 0) return;
    const k = this.tollWarn;
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 14);
    const g = ctx.createLinearGradient(0, 0, 0, 90);
    g.addColorStop(0, `rgba(255,200,100,${(this.era === THEN ? 0.45 : 0.18) * k * pulse})`);
    g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, 90);
    if (this.era === THEN) {
      ctx.textAlign = 'center';
      ctx.font = FONT;
      ctx.fillStyle = `rgba(255,230,170,${k})`;
      ctx.fillText('THE BELL IS ABOUT TO TOLL', VIEW_W / 2, 20);
    }
  }

  drawFinalePrompt() {
    if (!this.finaleReady || this.state !== 'play') return;
    const a = 0.6 + 0.4 * Math.sin(this.t * 3);
    ctx.textAlign = 'center';
    ctx.font = '16px Silkscreen, monospace';
    ctx.fillStyle = `rgba(255,236,190,${a})`;
    ctx.fillText('TURN THE WATCH', VIEW_W / 2, 70);
    ctx.font = FONT;
    ctx.fillStyle = `rgba(230,240,240,${a * 0.8})`;
    ctx.fillText(isTouch ? 'tap the watch button' : 'X / SHIFT', VIEW_W / 2, 84);
  }

  renderHUD() {
    this.drawTollWarning();
    ctx.save();
    ctx.scale(2, 2);
    for (let i = 0; i < this.maxHearts; i++) drawHeart(ctx, 5 + i * 9, 5, i < this.hearts);
    ctx.restore();

    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(230,240,240,0.8)';
    const [found, total] = this.noteCount();
    ctx.fillText(`NOTES ${found}/${total}`, 10, 38);
    if (this.hasHarpoon) {
      ctx.fillStyle = '#c9973f';
      ctx.fillRect(10, 45, 10, 3);
      ctx.fillStyle = '#d4dde0';
      ctx.fillRect(20, 46, 3, 1);
      ctx.fillStyle = 'rgba(230,240,240,0.8)';
      ctx.fillText('HARPOON', 27, 50);
    }
    this.drawBossHUD();

    if (this.hasWatch) {
      const now = this.era === NOW;
      const label = now ? 'NOW' : 'THEN';
      const color = now ? '#7ff3ff' : '#ffd36b';
      const x = VIEW_W - 64, y = 10;
      ctx.fillStyle = 'rgba(5,15,20,0.6)';
      ctx.fillRect(x, y, 54, 18);
      // watch face
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 10, y + 9, 6, 0, Math.PI * 2); ctx.stroke();
      const a = this.t * (now ? 1 : -1) * 2;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 9); ctx.lineTo(x + 10 + Math.cos(a) * 4, y + 9 + Math.sin(a) * 4); ctx.stroke();
      ctx.fillStyle = this.shiftCooldown > 0 ? 'rgba(255,255,255,0.4)' : color;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 21, y + 13);
    }

    this.drawIntro();
    this.drawFinalePrompt();
    ctx.font = FONT;
    ctx.textAlign = 'center';
    this.toasts.forEach((t, i) => {
      const y = VIEW_H - 22 - (this.toasts.length - 1 - i) * 16;
      const a = Math.min(1, t.life * 2);
      const w = ctx.measureText(t.text).width + 16;
      ctx.fillStyle = `rgba(5,12,16,${0.75 * a})`;
      ctx.fillRect(Math.round(VIEW_W / 2 - w / 2), y - 10, Math.round(w), 14);
      ctx.fillStyle = `rgba(255,240,210,${a})`;
      ctx.fillText(t.text, VIEW_W / 2, y);
    });
  }
}

// ---------- layout, touch controls and the main loop ----------

function layout() {
  const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  const scale = s >= 2 ? Math.floor(s) : s;
  const stage = $('stage');
  stage.style.width = `${Math.floor(VIEW_W * scale)}px`;
  stage.style.height = `${Math.floor(VIEW_H * scale)}px`;
  stage.style.setProperty('--s', scale);
}

function setupTouch(game) {
  const pad = $('touch');
  if (isTouch) pad.classList.remove('hidden');
  for (const btn of pad.querySelectorAll('[data-action]')) {
    const action = btn.dataset.action;
    const on = (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); btn.classList.add('on'); game.input.setTouch(action, true); };
    const off = (e) => { e.preventDefault(); btn.classList.remove('on'); game.input.setTouch(action, false); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  }
  // Tap / click the overlays to continue (menus have their own buttons)
  $('note').addEventListener('click', () => game.state === 'note' && game.noteTimer > 0.35 && game.closeNote());
  $('end').addEventListener('click', () => game.state === 'end' && game.endTimer > 1 && game.afterEnd());
  $('credits').addEventListener('click', () => game.state === 'credits' && game.pageT > 1.2 && game.nextCreditPage());
  $('pause-btn').addEventListener('click', (e) => { e.stopPropagation(); if (game.state === 'play') game.setState('paused'); });
}

function setupSound(game) {
  const unlock = () => game.sound.unlock();
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);
  addEventListener('touchend', unlock);
  const btn = $('sound-btn');
  const show = () => { btn.textContent = game.sound.muted ? 'SOUND OFF' : 'SOUND ON'; btn.classList.toggle('off', game.sound.muted); };
  const toggle = () => {
    game.sound.unlock();
    game.sound.toggleMute();
    show();
    if (game.state === 'play') game.toast(game.sound.muted ? 'Sound off' : 'Sound on', 1.2);
  };
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) toggle(); });
  // go quiet while the tab is in the background
  document.addEventListener('visibilitychange', () => {
    const c = game.sound.ctx;
    if (!c) return;
    if (document.hidden) c.suspend();
    else c.resume();
  });
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  show();
}

function mapPreview() {
  // ?map — draws the whole level in both eras, for checking level design.
  const stage = STAGES[Math.max(0, (Number(params.get('stage')) || 1) - 1)];
  const level = new Level(stage.map);
  level.flooded = params.get('map') === 'flooded';
  const c = canvas;
  c.width = level.pxW;
  c.height = level.pxH * 2 + 8;
  [NOW, THEN].forEach((era, i) => {
    const oy = i * (level.pxH + 8);
    ctx.fillStyle = era === NOW ? '#06222c' : '#5a3436';
    ctx.fillRect(0, oy, level.pxW, level.pxH);
    ctx.drawImage(buildTileLayer(level, era), 0, oy);
    for (let ty = 0; ty < level.h; ty++) {
      for (let tx = 0; tx < level.w; tx++) {
        if (level.isWater(tx, ty, era)) { ctx.fillStyle = 'rgba(40,150,190,0.45)'; ctx.fillRect(tx * TILE, oy + ty * TILE, TILE, TILE); }
        if (level.get(tx, ty) === 'G') { ctx.fillStyle = era === THEN ? '#d4a147' : '#4e3428'; ctx.fillRect(tx * TILE + 3, oy + ty * TILE + 3, 10, 10); }
      }
    }
    ctx.font = '10px monospace';
    for (const s of level.spawns) {
      ctx.fillStyle = '#ff0';
      ctx.fillText(s.type, s.tx * TILE + 4, oy + s.ty * TILE + 12);
    }
  });
  $('stage').style.width = 'auto';
  $('stage').style.height = 'auto';
  c.style.width = `${level.pxW}px`;
  c.style.height = `${c.height}px`;
  for (const id of ['title', 'touch']) $(id).classList.add('hidden');
}

async function boot() {
  try { await document.fonts.load(FONT); } catch { /* fall back to monospace */ }
  if (params.has('map')) { mapPreview(); return; }

  const game = new Game();
  window.game = game; // handy for debugging in the console
  layout();
  addEventListener('resize', layout);
  setupTouch(game);
  setupSound(game);
  game.setState(params.has('play') ? 'play' : 'title');
  if (params.has('manual')) { game.render(); return; } // automated tests step the game themselves

  const STEP = 1 / 60;
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      game.update(STEP);
      acc -= STEP;
    }
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
