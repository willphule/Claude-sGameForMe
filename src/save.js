// Saved progress and settings, kept in the browser's localStorage.
//
//   unlocked   highest stage you can pick from Chapters
//   stages[i]  { done, best (seconds), notes: [note indices ever found] }
//   resume     where Continue takes you: a snapshot taken at your last lantern
//   completed  you have finished the game
//   settings   volumes, screen shake, hearts
import { STAGES } from './stages.js';

const KEY = 'drownedbell-save';
const OLD_KEY = 'drownedbell-progress'; // Stages 1 and 2 only remembered the highest stage reached

export const DEFAULT_SETTINGS = { music: 8, sfx: 8, shake: true, hearts: 3 };

function fresh() {
  return { version: 1, unlocked: 0, stages: [], resume: null, completed: false, settings: { ...DEFAULT_SETTINGS } };
}

function read(key) { try { return localStorage.getItem(key); } catch { return null; } }

export const Save = {
  data: fresh(),

  load() {
    let d = null;
    try { d = JSON.parse(read(KEY)); } catch { d = null; }
    if (!d || typeof d !== 'object') {
      d = fresh();
      const old = Number(read(OLD_KEY)) || 0;
      if (old > 0) {
        d.unlocked = Math.min(STAGES.length - 1, old);
        d.resume = { stage: d.unlocked };
      }
    }
    d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    d.stages = Array.isArray(d.stages) ? d.stages : [];
    d.unlocked = Math.max(0, Math.min(STAGES.length - 1, Number(d.unlocked) || 0));
    if (d.resume && !(d.resume.stage >= 0 && d.resume.stage < STAGES.length)) d.resume = null;
    this.data = d;
    return d;
  },

  write() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage unavailable */ }
  },

  erase() {
    const settings = this.data.settings;
    this.data = fresh();
    this.data.settings = settings; // keep volumes and the like
    try { localStorage.removeItem(OLD_KEY); } catch { /* storage unavailable */ }
    this.write();
  },

  get settings() { return this.data.settings; },

  stage(i) {
    if (!this.data.stages[i]) this.data.stages[i] = { done: false, best: null, notes: [] };
    return this.data.stages[i];
  },

  addNote(stage, index) {
    const s = this.stage(stage);
    if (!s.notes.includes(index)) { s.notes.push(index); s.notes.sort((a, b) => a - b); }
    this.write();
  },

  finishStage(i, time) {
    const s = this.stage(i);
    s.done = true;
    s.best = s.best == null ? time : Math.min(s.best, time);
    this.data.unlocked = Math.max(this.data.unlocked, Math.min(STAGES.length - 1, i + 1));
    this.write();
  },

  // Real notes only: the harpoon's tag doesn't count.
  realNotes(stage) {
    return STAGES[stage].notes.map((n, i) => (n.ability ? -1 : i)).filter((i) => i >= 0);
  },

  notesFound(stage) {
    const found = this.stage(stage).notes;
    return this.realNotes(stage).filter((i) => found.includes(i)).length;
  },

  totals() {
    let found = 0, total = 0;
    STAGES.forEach((_, i) => { found += this.notesFound(i); total += this.realNotes(i).length; });
    return [found, total];
  },

  allNotesFound() {
    const [found, total] = this.totals();
    return found === total;
  },

  hasProgress() {
    return !!this.data.resume || this.data.unlocked > 0 || this.data.completed
      || this.data.stages.some((s) => s && s.notes && s.notes.length);
  },
};

export function formatTime(sec) {
  if (sec == null) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
