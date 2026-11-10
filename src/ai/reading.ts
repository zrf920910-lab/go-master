import { GoBoard } from '../engine/GoBoard/GoBoard';
import { BLACK, EMPTY, WHITE, opposite, type Color } from '../engine/GoBoard/types';

/**
 * Board reading primitives used by the teaching engine.
 *
 * Everything here answers a question about the *current* position by replaying
 * moves on a copy of the actual board. No explanation text is ever produced
 * from a template that is not backed by one of these computed facts.
 */

export interface GroupFacts {
  color: Color;
  stones: number[];
  liberties: number[];
  /** Atari: exactly one liberty. */
  inAtari: boolean;
  /** Number of true eyes (enclosed empty regions). */
  eyes: number;
  /** Is this block adjacent to any enemy stone? */
  touched: boolean;
}

export function groupFacts(board: GoBoard, root: number): GroupFacts | null {
  const color = board.cells[root];
  if (color !== BLACK && color !== WHITE) return null;
  const g = board.group(root);
  return {
    color,
    stones: g.stones,
    liberties: g.liberties,
    inAtari: g.liberties.length === 1,
    eyes: eyesOf(board, g.stones),
    touched: g.stones.some((s) => board.neighbours(s).some((n) => board.cells[n] !== EMPTY && board.cells[n] !== color)),
  };
}

/** Enclosed empty regions bordered only by `stones`' colour. */
export function eyesOf(board: GoBoard, stones: number[]): number {
  if (!stones.length) return 0;
  const color = board.cells[stones[0]];
  const seen = new Set<number>();
  let eyes = 0;
  for (const s of stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] !== EMPTY || seen.has(n)) continue;
      let bordered = true;
      let size = 0;
      const stack = [n];
      seen.add(n);
      while (stack.length) {
        const cur = stack.pop()!;
        size++;
        for (const m of board.neighbours(cur)) {
          if (board.cells[m] === EMPTY) {
            if (!seen.has(m)) {
              seen.add(m);
              stack.push(m);
            }
          } else if (board.cells[m] !== color) bordered = false;
        }
      }
      if (bordered && size <= 6) eyes++;
    }
  }
  return eyes;
}

export interface AtariThreat {
  /** The block that is in atari. */
  stones: number[];
  color: Color;
  /** Its single remaining liberty. */
  liberty: number;
  /** Moves that would capture it right now. */
  killingMoves: number[];
  /** For the owner: moves that would escape. */
  escapes: number[];
}

/** Every block currently in atari, with capture/escape moves. */
export function atariThreats(board: GoBoard, mover: Color): AtariThreat[] {
  const out: AtariThreat[] = [];
  for (const g of board.allGroups()) {
    if (g.liberties.length !== 1) continue;
    const liberty = g.liberties[0];
    const killingMoves: number[] = [];
    if (mover !== g.color && board.checkLegality(liberty, mover) === null) {
      killingMoves.push(liberty);
    }
    const escapes: number[] = [];
    if (mover === g.color && board.checkLegality(liberty, g.color) === null) {
      const copy = board.clone();
      if (copy.play(liberty, g.color).ok && copy.group(liberty).liberties.length > 1) {
        escapes.push(liberty);
      }
    }
    out.push({ stones: g.stones, color: g.color, liberty, killingMoves, escapes });
  }
  return out;
}

export interface LadderInfo {
  /** True when this capture leads to a ladder that works. */
  works: boolean;
  /** The sequence of moves (attacker first). */
  line: number[];
}

/**
 * Very small ladder reader.
 *
 * It plays out alternating ataris greedily (the defender always plays its only
 * escape) and stops when the defender is captured, escapes, or the sequence
 * gets long enough that we cannot claim anything. Returning `null` means "the
 * reader is not confident", which callers must treat as unknown rather than as
 * a fact.
 */
export function readLadder(
  board: GoBoard,
  attacker: Color,
  victimLiberty: number,
  maxLen = 16,
): LadderInfo | null {
  const defender = opposite(attacker);
  const copy = board.clone();
  const line: number[] = [];
  let mover = attacker;
  let victimRoot = -1;

  // Identify the victim block: the enemy group adjacent to the first liberty.
  for (const n of copy.neighbours(victimLiberty)) {
    if (copy.cells[n] === defender) {
      const g = copy.group(n);
      if (g.liberties.length === 1 && g.liberties[0] === victimLiberty) {
        victimRoot = n;
        break;
      }
    }
  }
  if (victimRoot < 0) return null;
  if (copy.checkLegality(victimLiberty, attacker) !== null) return null;
  if (!copy.play(victimLiberty, attacker).ok) return null;
  line.push(victimLiberty);
  if (copy.cells[victimRoot] === EMPTY) return { works: true, line };

  for (let i = 0; i < maxLen; i++) {
    if (mover === attacker) {
      mover = defender;
      const g = copy.group(victimRoot);
      if (g.liberties.length !== 1) return null;
      const escape = g.liberties[0];
      if (copy.checkLegality(escape, defender) !== null) return null;
      if (!copy.play(escape, defender).ok) return null;
      line.push(escape);
      victimRoot = escape;
    } else {
      mover = attacker;
      const g = copy.group(victimRoot);
      if (g.liberties.length !== 1) return null;
      const atari = g.liberties[0];
      if (copy.checkLegality(atari, attacker) !== null) return null;
      if (!copy.play(atari, attacker).ok) return null;
      line.push(atari);
      if (copy.cells[victimRoot] === EMPTY) return { works: true, line };
      victimRoot = atari;
    }
  }
  return null;
}

/**
 * Evaluate the *danger* of a candidate move for the player making it: after the
 * move, is any friendly block left in atari, or placed into atari?
 */
export interface MoveSafety {
  index: number;
  /** Friendly blocks in atari after this move. */
  selfAtari: number[][];
  /** Enemy blocks put into atari by this move. */
  threats: number[][];
  /** Captures performed. */
  captures: number[];
  legal: boolean;
}

export function evaluateMoveSafety(board: GoBoard, index: number, color: Color): MoveSafety {
  const result: MoveSafety = { index, selfAtari: [], threats: [], captures: [], legal: false };
  if (board.checkLegality(index, color) !== null) return result;
  const copy = board.clone();
  const played = copy.play(index, color);
  if (!played.ok) return result;
  result.legal = true;
  result.captures = played.captured;
  for (const g of copy.allGroups()) {
    if (g.liberties.length !== 1) continue;
    if (g.color === color) result.selfAtari.push(g.stones);
    else result.threats.push(g.stones);
  }
  return result;
}

/** Neighbouring enemy stones count, used to describe "contact" play. */
export function contactCount(board: GoBoard, index: number, color: Color): number {
  return board.neighbours(index).filter((n) => board.cells[n] !== EMPTY && board.cells[n] !== color).length;
}

/** Is this point adjacent to exactly one friendly and one enemy block (a cut)? */
export function isCutPoint(board: GoBoard, index: number, enemyColor: Color): boolean {
  if (board.cells[index] !== EMPTY) return false;
  const enemyGroups = new Set<number>();
  const ownGroups = new Set<number>();
  for (const n of board.neighbours(index)) {
    const c = board.cells[n];
    if (c === EMPTY) continue;
    if (c === enemyColor) enemyGroups.add(leadingStone(board, n));
    else ownGroups.add(leadingStone(board, n));
  }
  return enemyGroups.size >= 2;
}

function leadingStone(board: GoBoard, index: number): number {
  const g = board.group(index);
  return g.stones.length ? Math.min(...g.stones) : index;
}

/** Does the move connect two distinct friendly blocks? */
export function connectsTwoBlocks(board: GoBoard, index: number, color: Color): boolean {
  if (board.cells[index] !== EMPTY) return false;
  const before = new Set<number>();
  for (const n of board.neighbours(index)) {
    if (board.cells[n] === color) before.add(leadingStone(board, n));
  }
  if (before.size < 2) return false;
  const copy = board.clone();
  if (!copy.play(index, color).ok) return false;
  return copy.group(index).stones.length > 1;
}

/** Score a point for opening value: third/fourth line, corners over centre. */
export function openingValue(board: GoBoard, index: number): number {
  const x = index % board.size;
  const y = Math.floor(index / board.size);
  const edge = Math.min(x, y, board.size - 1 - x, board.size - 1 - y);
  if (edge === 0) return 0;
  if (edge === 1) return 1;
  if (edge === 2) return 3;
  if (edge === 3) return 4;
  return 1;
}
