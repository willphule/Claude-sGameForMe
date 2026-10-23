// Level data and tile rules for Drowned Bell.
//
// Map legend
//   #  stone (solid in both eras)
//   P  brass platform (solid only in THEN — it rotted away by NOW)
//   F  rubble / coral (solid only in NOW — it fell after the flood)
//   ~  water (NOW only)
//   D  floodable water: dry until Floodgate 7 is opened in THEN
//   ^  spikes (both eras)
//   G  grinding gear (hazard in THEN, seized and harmless in NOW)
//   @  player start   N note   C checkpoint lantern   V valve
//   K  clockwork crawler (THEN)   J jellyfish (NOW)   E the bell (exit)
//   O  harpoon ring (both eras)   A ring in THEN only   B ring in NOW only
//   H  the harpoon (ability pickup)   W the Bellwright (boss)
//   |  arena gate: open, but slams shut while the boss fight is on
//   :  sealed door: solid until the boss is defeated

export const TILE = 16;
export const NOW = 0;
export const THEN = 1;
export const ERA_NAME = ['NOW', 'THEN'];

export const MAP = [
  '########################################################################################################',
  '#                                                                                        #             #',
  '#                                                                                        #             #',
  '#                                                                                        #           E #',
  '#                                                                                        #DDDDDDDD######',
  '#                                                                                        #DDDDDDDD######',
  '#                                                                                        #DDDDDDDD######',
  '#                                                                                        #DDDDDDDD######',
  '#                                      C         FFFF          C                         #DDDDDDDD######',
  '#                                  #######PPPPP        PPP   ########                    #DDDDDDDD######',
  '#                                  #######                  #####                        #DDDDDDDD######',
  '#                                  ###                      #####                        #DDDDDDDD######',
  '#                              PPP ###                      #####  ###                   #DDDDDDDD######',
  '#                                  ###                      #####                        #DDDDDDDD######',
  '#                                  ###                      #####~~~~~~~~~G~~~~~~~~~~~~~~#DDDDDDDD######',
  '#                          PPP     ###                      #####~~~~~~~PPPPP~~~~~~~~~~~~#DDDDDDDD######',
  '#                                  ###                      #####~~~~~~~~~~~~~~~~~~~~~~~~#DDDDDDDD######',
  '#                                  ###                      #####~~~~~~~~~~~~~~~~G~~~~~~~#DDDDDDDD######',
  '#                              PPP ###                      #####~~~~~~~~~~~~~~PPPPP~~~~~#DDDDDDDD######',
  '#  @                               ###                      #####~~~~~~~~~~~J~~~~~~~~~~~~#DDDDDDDD######',
  '###########                  N                    N         #####~~~~~~~~~~~~~~~~~~~~~~~~#DDDDDDDD######',
  '###########            ##########################################~~~~~~~~~~~~~~~~~~~~~~~~#DDDDDDDD######',
  '###########~~~~~~~~~~~~##########################################~~~~~~~PPPPP~~~~~~~~~~~~#DDDDDDDD######',
  '###########~~~~~~~~~~~~##########################################~~~~~~~~~~~~~~~~~~~~~~~~#DDDDDDDD######',
  '###########~~~~~~~~~~~~##########################################~~~~~~~~~~~~~~~~~~J~~~~~#DDDDDDDD######',
  '###########~~~~~~~~~~~~##########################################~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDD######',
  '###########~~~~~~~~~~~~##########################################~~~~~~~~~~~~~~~~~~~~~~~~DDDDDDDDD######',
  '###########~~~~~~~~~~~~##########################################~N~~~~~~~K~~~~C~~^^~~V~~DDDDDDDDD######',
  '########################################################################################################',
  '########################################################################################################'
];

const OVERLAY = 'PG@NCVKJEOABHW|:';
const SPAWNS = '@NCVKJEOABHW';

export class Level {
  constructor(rows = MAP) {
    this.h = rows.length;
    this.w = rows[0].length;
    this.pxW = this.w * TILE;
    this.pxH = this.h * TILE;
    this.tiles = [];
    this.water = []; // '' | '~' | 'D'
    this.spawns = [];
    this.flooded = false;
    this.gatesClosed = false;   // '|' tiles
    this.sealOpen = false;      // ':' tiles
    for (let y = 0; y < this.h; y++) {
      const row = rows[y];
      for (let x = 0; x < this.w; x++) {
        let c = row[x];
        // Water sits "behind" overlay tiles: find the first non-overlay tile to the left.
        let wx = x;
        while (wx > 0 && OVERLAY.includes(row[wx])) wx--;
        const w = row[wx] === '~' || row[wx] === 'D' ? row[wx] : '';
        if (SPAWNS.includes(c)) {
          this.spawns.push({ type: c, tx: x, ty: y });
          c = w || ' ';
        }
        this.tiles.push(c);
        this.water.push(c === '~' || c === 'D' ? c : w);
      }
    }
  }

  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return '#';
    return this.tiles[ty * this.w + tx];
  }

  isSolid(tx, ty, era) {
    const c = this.get(tx, ty);
    return c === '#' || (c === 'P' && era === THEN) || (c === 'F' && era === NOW)
      || (c === '|' && this.gatesClosed) || (c === ':' && !this.sealOpen);
  }

  isWater(tx, ty, era) {
    if (era !== NOW || tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    if (this.isSolid(tx, ty, era)) return false;
    const w = this.water[ty * this.w + tx];
    return w === '~' || (w === 'D' && this.flooded);
  }

  isWaterAt(px, py, era) {
    return this.isWater(Math.floor(px / TILE), Math.floor(py / TILE), era);
  }

  isHazard(tx, ty, era) {
    const c = this.get(tx, ty);
    return c === '^' || (c === 'G' && era === THEN);
  }

  // Does a pixel rectangle overlap any solid tile in the given era?
  rectSolid(x, y, w, h, era) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (this.isSolid(tx, ty, era)) return true;
    return false;
  }

  rectHazard(x, y, w, h, era) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (this.isHazard(tx, ty, era)) return { tx, ty };
    return null;
  }
}
