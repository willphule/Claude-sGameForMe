// Drowned Bell — game loop, states, camera, HUD and the time-shift.
import { Level, TILE, NOW, THEN, ERA_NAME } from './level.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { spawnEntities, overlaps } from './entities.js';
import {
  VIEW_W, VIEW_H, buildTileLayer, drawBackground, drawDynamicTiles, drawWater, drawVignette, drawHeart,
} from './render.js';
import { NOTES, ENDING } from './story.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const FONT = '8px Silkscreen, monospace';
const $ = (id) => document.getElementById(id);

const isTouch = matchMedia('(pointer: coarse)').matches;

// World hints, in tile coordinates.
const HINTS = [
  { tx: 1.3, ty: 15.4, lines: ['ARROWS / WASD  move', 'Z / SPACE  jump', '(hold for higher)'], touch: ['Hold JUMP for', 'a higher jump'] },
  { tx: 12, ty: 19.2, lines: ['In water: hold jump', 'to swim up'] },
  { tx: 22.3, ty: 16.6, lines: ['X / SHIFT', 'turn the watch'], touch: ['Tap the watch', 'button'], cond: (g) => g.hasWatch },
  { tx: 41, ty: 4.5, lines: ['The watch can be', 'turned mid-jump'], cond: (g) => g.hasWatch },
  { tx: 38.3, ty: 18.3, lines: ['< squeeze through'] },
  { tx: 65.2, ty: 6.5, lines: ['FLOODGATE 7', 'v  v  v'] },
];

class Game {
  constructor() {
    this.input = new Input();
    this.state = 'title';
    this.t = 0;
    this.newGame();
  }

  newGame() {
    this.level = new Level();
    this.layers = [buildTileLayer(this.level, NOW), buildTileLayer(this.level, THEN)];
    const { list, start } = spawnEntities(this.level);
    this.entities = list;
    this.player = new Player(start.x, start.y);
    this.era = NOW;
    this.checkpoint = { x: start.x, y: start.y, era: NOW };
    this.maxHearts = 3;
    this.hearts = 3;
    this.hasWatch = false;
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
    this.particles = [];
    this.cam = { x: 0, y: 0 };

    // Developer shortcuts for testing, e.g. ?at=60,8&watch&era=then
    if (params.has('watch')) this.hasWatch = true;
    if (params.has('at')) {
      const [tx, ty] = params.get('at').split(',').map(Number);
      this.player.x = tx * TILE + 3;
      this.player.y = ty * TILE + 2;
    }
    if (params.get('era') === 'then') this.era = THEN;
    if (params.has('flooded')) this.level.flooded = true;
    this.snapCamera();
  }

  setState(s) {
    this.state = s;
    $('title').classList.toggle('hidden', s !== 'title');
    $('note').classList.toggle('hidden', s !== 'note');
    $('pause').classList.toggle('hidden', s !== 'paused');
    $('end').classList.toggle('hidden', s !== 'end');
  }

  // ---------- update ----------

  update(dt) {
    const inp = this.input;
    inp.update();
    this.t += dt;
    switch (this.state) {
      case 'title':
        if (inp.anyPressed('jump', 'interact', 'shift')) this.setState('play');
        break;
      case 'note':
        this.noteTimer += dt;
        if (this.noteTimer > 0.35 && inp.anyPressed('jump', 'interact', 'pause')) this.closeNote();
        break;
      case 'paused':
        if (inp.anyPressed('pause', 'jump', 'interact')) this.setState('play');
        break;
      case 'end':
        this.endTimer += dt;
        if (this.endTimer > 1 && inp.anyPressed('jump', 'interact')) this.restart();
        break;
      case 'play':
        this.updatePlay(dt);
        break;
    }
  }

  updatePlay(dt) {
    const inp = this.input;
    const p = this.player;
    if (inp.pressed('pause')) { this.setState('paused'); return; }

    this.time += dt;
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flash = Math.max(0, this.flash - dt);
    if (this.trans) {
      this.trans.t += dt;
      if (this.trans.t >= this.trans.dur) this.trans = null;
    }
    this.updateToasts(dt);
    this.updateParticles(dt);

    if (this.dying > 0) {
      this.dying -= dt;
      this.fade = Math.min(1, this.fade + dt * 2.5);
      if (this.dying <= 0) this.respawn();
      return;
    }
    this.fade = Math.max(0, this.fade - dt * 2.5);

    if (inp.pressed('shift')) this.tryShift();

    p.update(dt, inp, this.level, this.era);
    if (p.splashed) this.burst(p.cx, p.y + 4, 'rgba(170,235,255,0.9)', 10, -60);
    if (p.landed && !p.inWater) this.burst(p.cx, p.y + p.h, this.era === NOW ? '#5a7a7a' : '#b08a5e', 4, -20);

    // Spikes and gears use a slightly smaller hitbox, to be forgiving
    const hz = this.level.rectHazard(p.x + 2, p.y + 3, p.w - 4, p.h - 3, this.era);
    if (hz) this.hurt(hz.tx * TILE + TILE / 2);

    for (const e of this.entities) {
      if (e.dead) continue;
      e.update(this, dt);
      if (this.state === 'play' && e.existsIn(this.era) && overlaps(p, e)) e.touch(this);
    }

    const near = this.nearInteractable();
    if (near && (inp.pressed('interact') || (inp.pressed('up') && !p.inWater))) near.interact(this);

    this.updateCamera(dt);
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
      return;
    }
    this.trans = { t: 0, dur: 0.45, from: this.era, to };
    this.era = to;
    this.shiftCooldown = 0.25;
    this.burst(p.cx, p.cy, to === NOW ? '#7ff3ff' : '#ffd36b', 16);
  }

  hurt(srcX) {
    const p = this.player;
    if (p.invuln > 0 || this.dying > 0) return;
    this.hearts--;
    p.invuln = 1.2;
    p.knock = 0.25;
    const dir = p.cx < srcX ? -1 : 1;
    p.vx = dir * 150;
    p.vy = -230;
    p.jumping = false;
    this.shake(0.3, 3);
    this.flash = 0.25;
    this.burst(p.cx, p.cy, '#ff7a6a', 10);
    if (this.hearts <= 0) {
      this.dying = 1.0;
      this.deaths++;
    }
  }

  respawn() {
    const c = this.checkpoint;
    this.player.reset(c.x, c.y);
    this.player.invuln = 1.0;
    this.era = c.era;
    this.hearts = this.maxHearts;
    this.trans = null;
    this.snapCamera();
  }

  collectNote(i) {
    this.notes.add(i);
    const n = NOTES[i];
    if (n.unlocksWatch) this.hasWatch = true;
    this.currentNote = n;
    $('note-from').textContent = n.from;
    $('note-text').innerHTML = '';
    for (const para of n.text) {
      const el = document.createElement('p');
      el.textContent = para;
      $('note-text').appendChild(el);
    }
    this.noteTimer = 0;
    this.setState('note');
  }

  closeNote() {
    this.setState('play');
    if (this.currentNote && this.currentNote.unlocksWatch) {
      this.toast(isTouch ? 'You took the watch. Tap the watch button to turn it.' : 'You took the watch. Press X or Shift to turn it.', 5);
    }
    this.currentNote = null;
  }

  finish() {
    if (this.state === 'end') return;
    const m = Math.floor(this.time / 60), s = Math.floor(this.time % 60);
    $('end-title').textContent = ENDING.title;
    $('end-text').textContent = ENDING.text;
    $('end-stats').textContent =
      `Time ${m}:${String(s).padStart(2, '0')}  ·  Notes ${this.notes.size}/${NOTES.length}  ·  Falls ${this.deaths}`;
    this.endTimer = 0;
    this.setState('end');
  }

  restart() {
    this.newGame();
    this.setState('play');
  }

  // ---------- effects ----------

  shake(time, amp) { this.shakeT = Math.max(this.shakeT, time); this.shakeAmp = amp; }

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
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 60;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + vyBias, life: 0.4 + Math.random() * 0.4, color,
      });
    }
  }

  updateParticles(dt) {
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy += 200 * dt;
      q.life -= dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
  }

  // ---------- camera ----------

  camTarget() {
    const p = this.player;
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

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,60,60,${this.flash * 0.8})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.state !== 'title') this.renderHUD();
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${this.fade})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  renderWorld(era, cam) {
    const realEra = this.era;
    this.era = era; // entities colour themselves by the era being drawn
    drawBackground(ctx, era, cam, this.t);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    ctx.drawImage(this.layers[era], cam.x, cam.y, VIEW_W, VIEW_H, cam.x, cam.y, VIEW_W, VIEW_H);
    drawDynamicTiles(ctx, this.level, era, cam, this.t);
    this.drawHints();
    for (const e of this.entities) if (e.existsIn(era)) e.draw(ctx, this, this.t);

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

    if (this.dying <= 0 || this.fade < 0.6) this.player.draw(ctx, this.t, this.hasWatch);

    for (const q of this.particles) {
      ctx.globalAlpha = Math.min(1, q.life * 2.5);
      ctx.fillStyle = q.color;
      ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
    }
    ctx.globalAlpha = 1;

    drawWater(ctx, this.level, era, cam, this.t);
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

  drawHints() {
    ctx.font = FONT;
    ctx.textAlign = 'left';
    for (const h of HINTS) {
      if (h.cond && !h.cond(this)) continue;
      const lines = isTouch && h.touch ? h.touch : h.lines;
      ctx.fillStyle = this.era === NOW ? 'rgba(190,235,245,0.7)' : 'rgba(255,230,190,0.75)';
      lines.forEach((line, i) => ctx.fillText(line, Math.round(h.tx * TILE), Math.round(h.ty * TILE + i * 10)));
    }
  }

  renderHUD() {
    ctx.save();
    ctx.scale(2, 2);
    for (let i = 0; i < this.maxHearts; i++) drawHeart(ctx, 5 + i * 9, 5, i < this.hearts);
    ctx.restore();

    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(230,240,240,0.8)';
    ctx.fillText(`NOTES ${this.notes.size}/${NOTES.length}`, 10, 38);

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
      ctx.fillText(label, x + 21, y + 13);
    }

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
  // Tap / click the overlays to continue
  $('title').addEventListener('click', () => game.state === 'title' && game.setState('play'));
  $('note').addEventListener('click', () => game.state === 'note' && game.noteTimer > 0.35 && game.closeNote());
  $('pause').addEventListener('click', () => game.state === 'paused' && game.setState('play'));
  $('end').addEventListener('click', () => game.state === 'end' && game.endTimer > 1 && game.restart());
  $('pause-btn').addEventListener('click', (e) => { e.stopPropagation(); if (game.state === 'play') game.setState('paused'); });
}

function mapPreview() {
  // ?map — draws the whole level in both eras, for checking level design.
  const level = new Level();
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
  if (params.has('play')) game.setState('play');
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
