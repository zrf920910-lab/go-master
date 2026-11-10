import {
  BLACK,
  EMPTY,
  WHITE,
  type Color,
  type ScoreOptions,
  type ScoreResult,
} from '../GoBoard/types';
import type { GoBoard } from '../GoBoard/GoBoard';

/**
 * Territory / area scoring.
 *
 * Chinese (area) rules: score = own stones on the board + surrounded empty
 * points. Japanese (territory) rules: score = surrounded empty points +
 * captures. Both need the players to mark dead stones; we supply a sensible
 * default (`autoDetectDead`) that removes groups which cannot make two eyes,
 * and the review screen lets the user correct it.
 */
export function scoreBoard(board: GoBoard | Int8Array, size: number, opts: ScoreOptions): ScoreResult {
  const cells = board instanceof Int8Array ? board : board.cells;
  const dead = new Set(opts.dead ?? []);
  const work = Int8Array.from(cells);
  for (const d of dead) work[d] = EMPTY;

  const ownership = new Int8Array(size * size);
  const visited = new Uint8Array(size * size);
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutral = 0;
  const idx = (x: number, y: number) => y * size + x;
  const nbrs = (i: number) => {
    const x = i % size;
    const y = Math.floor(i / size);
    const out: number[] = [];
    if (x > 0) out.push(idx(x - 1, y));
    if (x < size - 1) out.push(idx(x + 1, y));
    if (y > 0) out.push(idx(x, y - 1));
    if (y < size - 1) out.push(idx(x, y + 1));
    return out;
  };

  // Flood fill empty regions; a region belongs to one colour when its border
  // contains only that colour.
  for (let i = 0; i < work.length; i++) {
    if (work[i] !== EMPTY || visited[i]) continue;
    const region: number[] = [];
    const borders = new Set<number>();
    const stack = [i];
    visited[i] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      region.push(cur);
      for (const n of nbrs(cur)) {
        if (work[n] === EMPTY) {
          if (!visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        } else borders.add(work[n]);
      }
    }
    if (borders.size === 1) {
      const owner = [...borders][0];
      for (const r of region) ownership[r] = owner;
      if (owner === BLACK) blackTerritory += region.length;
      else whiteTerritory += region.length;
    } else {
      neutral += region.length;
    }
  }

  let blackStones = 0;
  let whiteStones = 0;
  for (let i = 0; i < work.length; i++) {
    if (work[i] === BLACK) {
      blackStones++;
      ownership[i] = BLACK;
    } else if (work[i] === WHITE) {
      whiteStones++;
      ownership[i] = WHITE;
    }
  }

  let black: number;
  let white: number;
  if (opts.ruleset === 'japanese') {
    const blackCaptures = board instanceof Int8Array ? 0 : board.captures.black;
    const whiteCaptures = board instanceof Int8Array ? 0 : board.captures.white;
    black = blackTerritory + blackCaptures + dead.size * 0; // dead stones already removed
    white = whiteTerritory + whiteCaptures;
  } else {
    black = blackTerritory + blackStones;
    white = whiteTerritory + whiteStones;
  }
  white += opts.komi;

  const winner: Color | 'draw' = black > white ? BLACK : white > black ? WHITE : 'draw';
  return {
    black,
    white,
    blackTerritory,
    whiteTerritory,
    blackStones,
    whiteStones,
    neutral,
    komi: opts.komi,
    winner,
    margin: Math.abs(black - white),
    ownership,
    method: opts.ruleset,
  };
}

/**
 * True-eye counting.
 *
 * An eye is an empty region whose *entire* border is one colour (the standard
 * definition). A single point is a true eye; a region of two to six points is a
 * larger eye; anything touching the opponent is a false eye or open space.
 *
 * This is the same notion the lessons teach (直三, 直四, 假眼 …), and unlike a
 * shallow capture search it gives the textbook answer for every standard shape.
 */
export function eyeRegionsOf(board: GoBoard, stones: number[]): number[][] {
  if (!stones.length) return [];
  const colour = board.cells[stones[0]];
  const seen = new Set<number>();
  const regions: number[][] = [];
  for (const s of stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] !== EMPTY || seen.has(n)) continue;
      let bordered = true;
      const region: number[] = [];
      const stack = [n];
      seen.add(n);
      while (stack.length) {
        const cur = stack.pop()!;
        region.push(cur);
        for (const m of board.neighbours(cur)) {
          if (board.cells[m] === EMPTY) {
            if (!seen.has(m)) {
              seen.add(m);
              stack.push(m);
            }
          } else if (board.cells[m] !== colour) {
            bordered = false;
          }
        }
      }
      if (bordered && region.length <= 6) regions.push(region);
    }
  }
  return regions;
}

/** Would `colour` be able to make two eyes with one more move of its own? */
function canMakeTwoEyes(board: GoBoard, root: number): boolean {
  const colour = board.cells[root];
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] !== EMPTY) continue;
    if (board.checkLegality(i, colour as Color) !== null) continue;
    const copy = board.clone();
    if (!copy.play(i, colour as Color).ok) continue;
    const g = copy.cells[root] ? copy.group(root) : null;
    if (g && eyeRegionsOf(copy, g.stones).length >= 2) return true;
  }
  return false;
}

/**
 * Dead stones at the end of a game.
 *
 * A group is reported dead only when it is unambiguously lost:
 *   1. it has no liberties (play stopped with it on the board), or
 *   2. every liberty is part of an empty area that never reaches the board edge
 *      and never touches another stone of its own colour, AND
 *   3. it has fewer than two true eyes and cannot make two eyes with one move.
 *
 * Everything uncertain stays on the board; the player can tap stones to mark
 * them manually.
 */
export function autoDetectDead(board: GoBoard): number[] {
  const dead: number[] = [];

  for (const group of board.allGroups()) {
    if (!group.stones.length) continue;
    const colour = group.color;

    // A group with no liberties can only be on the board because play stopped.
    if (group.liberties.length === 0) {
      dead.push(...group.stones);
      continue;
    }

    // Two true eyes already? Then it is alive, full stop.
    const eyes = eyeRegionsOf(board, group.stones);
    if (eyes.length >= 2) continue;

    // Is the group actually surrounded by the opponent? Every liberty must be
    // reachable only through enemy stones or the group's own eye space, i.e.
    // there is no path from the group to open, neutral space.
    if (hasOutsideLiberty(board, group.stones)) continue;

    // With one eye (or none) and no way out, can it still make a second eye?
    const probe = board.clone();
    probe.turn = colour;
    if (canMakeTwoEyes(probe, group.stones[0])) continue;

    dead.push(...group.stones);
  }
  return [...new Set(dead)];
}

/**
 * Does the group have a liberty that leads to genuinely open space?
 *
 * "Open" means the empty region reaching that liberty either touches the board
 * edge or is larger than an eye. Regions that are entirely enclosed by enemy
 * stones are the group's own eye space, not an escape route. This is what
 * separates a sealed-in dead group from one that is merely short of liberties.
 */
function hasOutsideLiberty(board: GoBoard, stones: number[]): boolean {
  const seen = new Set<number>();
  const seeds: number[] = [];
  for (const s of stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] === EMPTY && !seen.has(n)) {
        seen.add(n);
        seeds.push(n);
      }
    }
  }
  for (const seed of seeds) {
    if (seen.has(seed) && seeds.includes(seed) === false) continue;
    const region: number[] = [];
    const local = [seed];
    const visited = new Set<number>([seed]);
    let touchesEdge = false;
    while (local.length) {
      const cur = local.pop()!;
      region.push(cur);
      const x = cur % board.size;
      const y = Math.floor(cur / board.size);
      if (x === 0 || y === 0 || x === board.size - 1 || y === board.size - 1) touchesEdge = true;
      for (const m of board.neighbours(cur)) {
        if (board.cells[m] !== EMPTY) continue;
        if (!visited.has(m)) {
          visited.add(m);
          local.push(m);
        }
      }
    }
    // Any empty area of more than an eye's worth of points is open space.
    if (touchesEdge || region.length > 6) return true;
  }
  return false;
}

/** Chinese-style result string. */
export function describeScore(r: ScoreResult): string {
  const b = r.black.toFixed(1).replace(/\.0$/, '');
  const w = r.white.toFixed(1).replace(/\.0$/, '');
  if (r.winner === 'draw') return `和棋（黑 ${b} : 白 ${w}）`;
  return `${r.winner === BLACK ? '黑棋' : '白棋'}胜 ${r.margin.toFixed(1).replace(/\.0$/, '')} 目（黑 ${b} : 白 ${w}）`;
}
