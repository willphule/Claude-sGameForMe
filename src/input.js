// Keyboard, gamepad and touch input, merged into simple named actions.

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'shift', 'interact', 'pause'];

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
  KeyX: 'shift', ShiftLeft: 'shift', ShiftRight: 'shift', KeyL: 'shift',
  KeyE: 'interact', KeyC: 'interact', Enter: 'interact',
  Escape: 'pause', KeyP: 'pause',
};

export class Input {
  constructor() {
    this.keys = new Set();   // key codes currently held
    this.taps = new Set();   // actions pressed since the last update (catches very quick taps)
    this.tapsNow = new Set();
    this.touch = {};
    this.pad = {};
    this.cur = {};
    this.prev = {};

    addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) this.taps.add(a);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.touch = {}; });
  }

  setTouch(action, on) {
    this.touch[action] = on;
    if (on) this.taps.add(action);
  }

  pollGamepad() {
    this.pad = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.4 || b(14)) this.pad.left = true;
      if (ax > 0.4 || b(15)) this.pad.right = true;
      if (ay < -0.5 || b(12)) this.pad.up = true;
      if (ay > 0.5 || b(13)) this.pad.down = true;
      if (b(0)) this.pad.jump = true;
      if (b(2) || b(4) || b(5)) this.pad.shift = true;
      if (b(1) || b(3)) this.pad.interact = true;
      if (b(9)) this.pad.pause = true;
    }
  }

  // Call once per fixed game step.
  update() {
    this.pollGamepad();
    const cur = {};
    for (const a of ACTIONS) cur[a] = false;
    for (const code of this.keys) cur[KEYS[code]] = true;
    for (const a in this.touch) if (this.touch[a]) cur[a] = true;
    for (const a in this.pad) if (this.pad[a]) cur[a] = true;
    this.prev = this.cur;
    this.cur = cur;
    this.tapsNow = this.taps;
    this.taps = new Set();
  }

  down(a) { return !!this.cur[a] || this.tapsNow.has(a); }
  pressed(a) { return (!!this.cur[a] && !this.prev[a]) || this.tapsNow.has(a); }
  anyPressed(...as) { return as.some((a) => this.pressed(a)); }
}
