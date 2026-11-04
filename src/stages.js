// The stages of the game, with their maps, hints and starting abilities.
import { MAP } from './level.js';
import { MAP2 } from './stage2map.js';
import { MAP3 } from './stage3map.js';
import { STORY } from './story.js';

// World hints, in tile coordinates. `touch` replaces the text on phones and tablets.
const HINTS1 = [
  { tx: 1.3, ty: 15.4, lines: ['ARROWS / WASD  move', 'Z / SPACE  jump', '(hold for higher)'], touch: ['Hold JUMP for', 'a higher jump'] },
  { tx: 12, ty: 19.2, lines: ['In water: hold jump', 'to swim up'] },
  { tx: 22.3, ty: 16.6, lines: ['X / SHIFT', 'turn the watch'], touch: ['Tap the watch', 'button'], cond: (g) => g.hasWatch },
  { tx: 41, ty: 4.5, lines: ['The watch can be', 'turned mid-jump'], cond: (g) => g.hasWatch },
  { tx: 38.3, ty: 18.3, lines: ['< squeeze through'] },
  { tx: 65.2, ty: 6.5, lines: ['FLOODGATE 7', 'v  v  v'] },
];

const HINTS2 = [
  { tx: 15, ty: 53.5, lines: ['The tower is too high', 'to climb... for now'], cond: (g) => !g.hasHarpoon },
  { tx: 15, ty: 53.5, lines: ['C / J  fire the harpoon', 'at a ring above you'], touch: ['HOOK fires the', 'harpoon at a ring'], cond: (g) => g.hasHarpoon },
  { tx: 41.5, ty: 51.5, lines: ['THE CLOCKWORKS  >'] },
  { tx: 94.5, ty: 58, lines: ['C / J  harpoon', 'Hold UP  climb the line', 'JUMP  let go'], touch: ['HOOK  harpoon', 'Hold UP  climb', 'JUMP  let go'], cond: (g) => g.hasHarpoon },
  { tx: 82, ty: 43.4, lines: ['Swing with', '< and >'], cond: (g) => g.hasHarpoon },
  { tx: 70.5, ty: 41.6, lines: ['Some rings only', 'exist in one time'], cond: (g) => g.hasHarpoon },
  { tx: 31.3, ty: 11.6, lines: ['THE BELLWRIGHT'] },
];

const HINTS3 = [
  { tx: 9.5, ty: 55.5, lines: ['Walk into a ballast', 'block to push it.', 'It only moves in THEN.'] },
  { tx: 47.6, ty: 54.2, lines: ['A weight on the plate', 'holds the door open'] },
  { tx: 83, ty: 55.5, lines: ['Far above, the Great', 'Bell is tolling'] },
  { tx: 85.6, ty: 47.6, lines: ['Its toll only', 'shakes the THEN'] },
  { tx: 81.4, ty: 38.4, lines: ['Hanging from a ring,', 'you can still turn', 'the watch'] },
];

export const STAGES = [
  {
    name: 'The Drowned Quarter',
    map: MAP,
    hints: HINTS1,
    ...STORY[0],
    startWithWatch: false,
  },
  {
    name: 'The Bell Tower',
    map: MAP2,
    hints: HINTS2,
    ...STORY[1],
    startWithWatch: true,
    // the boss arena, in tiles: interior columns and rows, plus the floor row
    arena: { x0: 41, x1: 70, y0: 3, floor: 17, triggerX: 43 },
  },
  {
    name: 'The Great Bell',
    map: MAP3,
    hints: HINTS3,
    ...STORY[2],
    startWithWatch: true,
    startWithHarpoon: true,
    background: 'belfry',
    arena: { x0: 106, x1: 135, y0: 4, floor: 19, triggerX: 107 },
    // the Great Bell tolls far overhead while you climb the counterweight shaft
    tolls: { x0: 81, x1: 99, y0: 15, y1: 61, origin: [90.5, 2], period: 4.8, warn: 1.4, speed: 900, maxR: 1100 },
    final: true,
  },
];
