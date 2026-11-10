import { GoBoard } from '../GoBoard/GoBoard';
import { BLACK, EMPTY, WHITE, type Color } from '../GoBoard/types';

/**
 * Deterministic, seeded PRNG so AI games and daily training can be reproduced
 * (important for tests and for "try the same daily puzzle again").
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function todaySeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Group with liberties, in the shape the learner sees in explanations. */
export interface ThreatInfo {
  index: number; // a move that captures
  captured: number[];
  size: number;
}

export interface AIChoice {
  index: number;
  reason: string;
}

/** All moves by `color` that capture at least `min` stones. */
function capturingMoves(board: GoBoard, color: Color): ThreatInfo[] {
  const out: ThreatInfo[] = [];
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] !== EMPTY) continue;
    if (board.checkLegality(i, color) !== null) continue;
    const captured = board.capturesAt(i, color);
    if (captured.length) out.push({ index: i, captured, size: captured.length });
  }
  return out.sort((a, b) => b.size - a.size);
}

/** Points that rescue a friendly block that is in atari. */
function savingMoves(board: GoBoard, color: Color): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const g of board.allGroups()) {
    if (g.color !== color || g.liberties.length !== 1) continue;
    for (const lib of g.liberties) {
      if (seen.has(lib)) continue;
      seen.add(lib);
      if (board.checkLegality(lib, color) !== null) continue;
      const saved = board.clone();
      saved.play(lib, color);
      if (saved.cells[lib] === color) {
        const after = saved.group(lib);
        if (after.liberties.length > 1) out.push(lib);
      }
    }
  }
  return out;
}

/** A move that puts an enemy group into atari (one liberty left). */
function atariMoves(board: GoBoard, color: Color): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] !== EMPTY || board.checkLegality(i, color) !== null) continue;
    const test = board.clone();
    test.play(i, color);
    const hit = test
      .allGroups()
      .some((g) => g.color !== color && g.liberties.length === 1);
    if (hit) out.push(i);
  }
  return out;
}

function scorePoint(board: GoBoard, i: number, color: Color): number {
  const x = i % board.size;
  const y = Math.floor(i / board.size);
  const edge = Math.min(x, y, board.size - 1 - x, board.size - 1 - y);
  let s = 0;
  // Third/fourth line are valuable in the opening, the centre less so.
  if (edge === 0) s -= 1.5;
  if (edge === 2 || edge === 3) s += 2;
  if (edge === 1) s += 0.5;
  // Prefer points that touch the opponent (contact play) and avoid fill.
  for (const n of board.neighbours(i)) {
    if (board.cells[n] !== EMPTY && board.cells[n] !== color) s += 2.5;
    if (board.cells[n] === color) s += 1.2;
  }
  return s;
}

export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * Five honest difficulty levels.
 *
 * The app ships without a WebAssembly neural engine, so the highest level is a
 * strong tactical search, not a professional-strength neural network. This is
 * stated plainly in the UI ("棋力说明") rather than pretending otherwise.
 */
export class GoAI {
  constructor(public difficulty: Difficulty = 2, public seed = 12345) {}

  /** Choose a move, or -1 to pass. */
  choose(board: GoBoard, color: Color = board.turn): number {
    const rand = mulberry32(this.seed + board.moveNumber * 7919 + board.size);
    const legal = board.legalMoves(color);
    if (legal.length === 0) return -1;

    // Always take a capture when it is clearly good — every level understands
    // captures at least a little, otherwise the beginner AI would lose stones
    // for no reason and teach bad habits.
    const captures = capturingMoves(board, color);
    if (captures.length) {
      if (captures[0].size >= 2 || this.difficulty >= 2) {
        return this.pick(captures.slice(0, Math.min(3, captures.length)).map((c) => c.index), rand);
      }
    }

    if (this.difficulty === 1) return this.randomMove(board, legal, rand, color);

    const saves = savingMoves(board, color);
    if (saves.length && (this.difficulty >= 2 || rand() < 0.6)) {
      return saves[Math.floor(rand() * saves.length)];
    }

    if (this.difficulty === 2) {
      // Beginner: atari when available, otherwise a nearby sensible point.
      const ataris = atariMoves(board, color);
      if (ataris.length && rand() < 0.75) return ataris[Math.floor(rand() * ataris.length)];
      return this.weighted(board, legal, rand, color, 3);
    }

    if (this.difficulty === 3) {
      const ataris = atariMoves(board, color);
      if (ataris.length && rand() < 0.6) return this.pick(ataris, rand);
      return this.weighted(board, legal, rand, color, 5);
    }

    // Levels 4 & 5: one-ply tactical evaluation with a shortlist of candidate
    // points, plus a check of whether the chosen move leaves a friendly group
    // in atari.
    return this.search(board, color, legal, rand, this.difficulty);
  }

  private pick<T>(arr: T[], rand: () => number): T {
    return arr[Math.floor(rand() * arr.length)];
  }

  private randomMove(board: GoBoard, legal: number[], rand: () => number, color: Color): number {
    // Prefer the 3rd/4th line a little, but stay unpredictable.
    const weighted = legal.map((i) => ({ i, w: Math.max(0.2, 1 + scorePoint(board, i, color) * 0.15) }));
    const total = weighted.reduce((a, b) => a + b.w, 0);
    let r = rand() * total;
    for (const w of weighted) {
      r -= w.w;
      if (r <= 0) return w.i;
    }
    return legal[legal.length - 1];
  }

  private weighted(board: GoBoard, legal: number[], rand: () => number, color: Color, topN: number): number {
    const scored = legal
      .map((i) => ({ i, s: scorePoint(board, i, color) + rand() * 1.5 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, Math.max(1, Math.min(topN, legal.length)));
    return scored[Math.floor(rand() * scored.length)].i;
  }

  private search(board: GoBoard, color: Color, legal: number[], rand: () => number, depthLevel: number): number {
    const candidates = [...legal]
      .map((i) => ({ i, s: scorePoint(board, i, color) + rand() * 0.8 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, depthLevel >= 5 ? 14 : 10);

    let best = candidates[0]?.i ?? -1;
    let bestScore = -Infinity;
    const enemy: Color = color === BLACK ? WHITE : BLACK;
    for (const c of candidates) {
      const copy = board.clone();
      copy.play(c.i, color);
      let score = c.s;
      // Reward captures and atari, penalise self-atari.
      score += copy.captures[color === BLACK ? 'black' : 'white'] - board.captures[color === BLACK ? 'black' : 'white'];
      score *= 3;
      const own = copy.group(c.i);
      if (own.liberties.length === 1) score -= 8;
      const enemyAtari = copy.allGroups().filter((g) => g.color === enemy && g.liberties.length === 1);
      score += enemyAtari.length * 4;

      // Opponent's best immediate reply (only at the top level, to keep it fast).
      if (depthLevel >= 5) {
        let worst = 0;
        const replies = capturingMoves(copy, enemy);
        if (replies.length) worst = replies[0].size * 6;
        const ownAtari = copy.allGroups().filter((g) => g.color === color && g.liberties.length === 1);
        worst += ownAtari.length * 3;
        score -= worst;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c.i;
      }
    }
    return best;
  }
}
