import { GoBoard } from '../GoBoard/GoBoard';
import { EMPTY, opposite, type Color } from '../GoBoard/types';

/**
 * Local life-and-death search.
 *
 * The question asked of teaching material is always the same: *can the attacker
 * capture this group?* That is answered by alternating play — the attacker tries
 * to capture, the defender tries to survive — over the points near the group.
 * This is slower than counting eyes but it is correct for straight three, curved
 * three, false eyes and everything else, which matters because lessons and
 * scoring both depend on the verdict.
 *
 * The search is bounded by a node budget. When the budget is exhausted the
 * group is reported alive: never claiming a live group is dead is the safe
 * direction for teaching.
 */

export interface LifeResult {
  alive: boolean;
  /** Empty points enclosed by the group (its eye space). */
  eyeSpace: number[];
  /** Points inside/near the eye space that matter. */
  points: number[];
}

/** Empty regions fully enclosed by `stones` (each region is an eye candidate). */
export function eyeSpace(board: GoBoard, stones: number[]): number[] {
  if (!stones.length) return [];
  const color = board.cells[stones[0]];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const s of stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] !== EMPTY || seen.has(n)) continue;
      const stack = [n];
      seen.add(n);
      let enclosed = true;
      const region: number[] = [];
      while (stack.length) {
        const cur = stack.pop()!;
        region.push(cur);
        for (const m of board.neighbours(cur)) {
          if (board.cells[m] === EMPTY) {
            if (!seen.has(m)) {
              seen.add(m);
              stack.push(m);
            }
          } else if (board.cells[m] !== color) {
            enclosed = false;
          }
        }
      }
      if (enclosed) out.push(...region);
    }
  }
  return out;
}

/** Empty points within two steps of the group — where the fight happens. */
export function localPoints(board: GoBoard, stones: number[]): number[] {
  const out = new Set<number>();
  let frontier = [...stones];
  const visited = new Set<number>(stones);
  for (let step = 0; step < 2; step++) {
    const next: number[] = [];
    for (const s of frontier) {
      for (const n of board.neighbours(s)) {
        if (board.cells[n] === EMPTY) out.add(n);
        if (!visited.has(n)) {
          visited.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return [...out];
}

function groupSizes(board: GoBoard, color: Color): number[] {
  const seen = new Set<number>();
  const sizes: number[] = [];
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] !== color || seen.has(i)) continue;
    const g = board.group(i);
    for (const s of g.stones) seen.add(s);
    sizes.push(g.stones.length);
  }
  return sizes;
}

/** Does the block of `color` still exist with at least `minSize` stones? */
function survives(board: GoBoard, color: Color, minSize: number): boolean {
  return groupSizes(board, color).some((n) => n >= minSize);
}

class Search {
  nodes = 0;
  memo = new Map<string, boolean>();

  constructor(
    readonly color: Color,
    readonly minSize: number,
    readonly points: number[],
    readonly cap: number,
  ) {}

  /** True when the defender survives. `attackerToMove` alternates each ply. */
  run(board: GoBoard, attackerToMove: boolean, depth: number): boolean {
    this.nodes++;
    if (this.nodes > this.cap) return true; // budget exhausted: assume alive
    if (!survives(board, this.color, this.minSize)) return false;
    if (depth <= 0) return true;

    const mover = attackerToMove ? opposite(this.color) : this.color;
    const moves: number[] = [];
    for (const p of this.points) {
      if (board.cells[p] !== EMPTY) continue;
      if (board.checkLegality(p, mover) !== null) continue;
      moves.push(p);
    }
    if (!moves.length) {
      // Nobody can play locally any more. If the attacker cannot approach the
      // group it is alive; the defender just passes.
      return attackerToMove ? true : this.run(board, true, depth - 1);
    }

    const key = `${board.positionKey()}|${attackerToMove ? 1 : 0}|${depth}`;
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;

    let result: boolean;
    if (attackerToMove) {
      // The group lives only if EVERY attacking move fails to capture it.
      result = true;
      for (const mv of moves) {
        const copy = board.clone();
        if (!copy.play(mv, mover).ok) continue;
        if (!this.run(copy, false, depth - 1)) {
          result = false;
          break;
        }
      }
    } else {
      // The group lives if the defender has some move (or a pass) that survives.
      result = false;
      for (const mv of moves) {
        const copy = board.clone();
        if (!copy.play(mv, mover).ok) continue;
        if (this.run(copy, true, depth - 1)) {
          result = true;
          break;
        }
      }
      if (!result) result = this.run(board, true, depth - 1);
    }
    this.memo.set(key, result);
    return result;
  }
}

export function analyzeLife(
  board: GoBoard,
  root: number,
  opts: { depth?: number; nodes?: number } = {},
): LifeResult {
  const color = board.cells[root];
  if (color !== 1 && color !== 2) return { alive: false, eyeSpace: [], points: [] };
  const stones = board.group(root).stones;
  if (!stones.length) return { alive: false, eyeSpace: [], points: [] };

  const eyes = eyeSpace(board, stones);
  const points = localPoints(board, stones);
  const depth = opts.depth ?? 7;
  const cap = opts.nodes ?? 4000;

  const search = new Search(color, stones.length, points, cap);
  const defenderFirst = board.turn === color;
  const alive = search.run(board, !defenderFirst, depth);
  return { alive, eyeSpace: eyes, points };
}

export function isGroupAlive(board: GoBoard, root: number, opts: { depth?: number } = {}): boolean {
  return analyzeLife(board, root, opts).alive;
}

/** Is the group alive even when the attacker moves first? */
export function isUnconditionallyAlive(board: GoBoard, root: number, depth = 7): boolean {
  const colour = board.cells[root];
  if (!colour) return false;
  const probe = board.clone();
  probe.turn = opposite(colour as Color);
  return analyzeLife(probe, root, { depth }).alive;
}
