import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE, opposite, type Color } from '../../engine/GoBoard/types';
import { parseCoord } from '../../engine/GoBoard/coordinates';
import type { DrillCheck } from '../../app/types';

/**
 * Drill validation — semantic, not "compare with one hardcoded point".
 * A learner who finds a different but equally valid move is told why it works.
 */

export function stoneAt(board: GoBoard, label: string): number {
  const i = parseCoord(board.size, label);
  if (i < 0) throw new Error(`Invalid coordinate: ${label}`);
  return i;
}

export interface CheckContext {
  before: GoBoard;
  after: GoBoard;
  index: number;
  color: Color;
  captured: number[];
}

export interface CheckResult {
  ok: boolean;
  /** Why it is correct — shown to the learner. */
  reason?: string;
}

/**
 * Count the eyes (enclosed empty regions) of the block at `root`.
 *
 * An eye is an empty region whose entire border belongs to this block's colour.
 * That is the standard "eye space" notion used when teaching life and death:
 * a single point is a true eye, two to six points is a larger eye (still one
 * eye), and a region touching the opponent is a false eye or just open space.
 */
export function countEyes(board: GoBoard, root: number): number {
  const g = board.group(root);
  if (!g.stones.length) return 0;
  return eyeRegions(board, g.stones).length;
}

/** The eye regions themselves (each a list of points). */
export function eyeRegions(board: GoBoard, stones: number[]): number[][] {
  const color = board.cells[stones[0]];
  const seen = new Set<number>();
  const regions: number[][] = [];
  for (const s of stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] !== 0 || seen.has(n)) continue;
      let bordered = true;
      const region: number[] = [];
      const stack = [n];
      seen.add(n);
      while (stack.length) {
        const cur = stack.pop()!;
        region.push(cur);
        for (const m of board.neighbours(cur)) {
          if (board.cells[m] === 0) {
            if (!seen.has(m)) {
              seen.add(m);
              stack.push(m);
            }
          } else if (board.cells[m] !== color) {
            bordered = false;
          }
        }
      }
      if (bordered && region.length <= 6) regions.push(region);
    }
  }
  return regions;
}

/** Can `color` (to move) make two eyes for the block at `root` in one move? */
export function canMakeTwoEyes(board: GoBoard, root: number): boolean {
  const g = board.group(root);
  if (!g.stones.length) return false;
  for (const move of board.legalMoves(g.color)) {
    const copy = board.clone();
    if (!copy.play(move, g.color).ok) continue;
    if (countEyes(copy, move) >= 2) return true;
  }
  return false;
}

/** Does `color` have any legal move inside the point's surrounding region? */
function opponentCanInvade(board: GoBoard, root: number): boolean {
  const g = board.group(root);
  const enemy = opposite(g.color);
  const tried = new Set<number>();
  for (const s of g.stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] !== 0 || tried.has(n)) continue;
      tried.add(n);
      if (board.checkLegality(n, enemy) === null) return true;
    }
  }
  return false;
}

export function validate(check: DrillCheck, ctx: CheckContext): CheckResult {
  const { before, after, index, color, captured } = ctx;
  const enemy = opposite(color);

  switch (check.kind) {
    case 'capture': {
      const min = check.min ?? 1;
      if (captured.length >= min) {
        return {
          ok: true,
          reason: `这一步堵住了白棋的最后一口气，${captured.length} 颗白子被提走了。`,
        };
      }
      return { ok: false };
    }

    case 'atari': {
      // The move itself must be what reduces an enemy block to one liberty:
      // the block must touch the point just played, and must have had more
      // than one liberty before (or not have existed at all).
      const hit = after.allGroups().find(
        (g) =>
          g.color === enemy &&
          g.liberties.length === 1 &&
          g.stones.some((st) => before.neighbours(st).includes(index)),
      );
      if (hit) {
        return {
          ok: true,
          reason: '白棋这块棋只剩 1 口气了。让对方的棋只剩一口气，就叫「打吃」。',
        };
      }
      return { ok: false };
    }

    case 'escape': {
      const p = stoneAt(before, check.group);
      const was = before.cells[p] !== 0 ? before.group(p) : null;
      if (!was || was.liberties.length !== 1) return { ok: false };
      if (after.cells[p] === 0) return { ok: false };
      const libs = after.group(p).liberties.length;
      if (libs > 1) {
        return { ok: true, reason: '这颗子多了一口气，成功逃出了打吃。' };
      }
      return { ok: false };
    }

    case 'connect': {
      const p = stoneAt(before, check.group);
      const beforeGroup = before.cells[p] !== 0 ? before.group(p) : null;
      if (!beforeGroup) return { ok: false };
      if (after.cells[p] === 0) return { ok: false };
      const afterGroup = after.group(p);
      if (afterGroup.stones.length > beforeGroup.stones.length) {
        return { ok: true, reason: '两颗棋子连成一块了，它们的气合在一起，比以前更安全。' };
      }
      return { ok: false };
    }

    case 'cut': {
      const a = stoneAt(before, check.groups[0]);
      const b = stoneAt(before, check.groups[1]);
      const afterA = after.cells[a] !== 0 ? after.group(a) : null;
      const afterB = after.cells[b] !== 0 ? after.group(b) : null;
      if (!afterA || !afterB) return { ok: false };
      const connected = afterA.stones.some((s) => afterB.stones.includes(s));
      if (!connected) {
        return { ok: true, reason: '这一断让两块白棋再也连不起来，它们要各自为自己的气担心了。' };
      }
      return { ok: false };
    }

    case 'legal': {
      // `after` is only produced for a legal placement, so reaching this case
      // means the move was legal.
      return { ok: true, reason: '落子成功，这是一个合法的交叉点。' };
    }

    case 'libertiesOf': {
      const p = stoneAt(before, check.group);
      const libs = before.group(p).liberties;
      if (libs.includes(index)) {
        return {
          ok: true,
          reason: `没错，这个点紧挨着棋子，是它的一口气。这块棋现在有 ${libs.length} 口气。`,
        };
      }
      return { ok: false };
    }

    case 'notLibertiesOf': {
      const p = stoneAt(before, check.group);
      const libs = before.group(p).liberties;
      if (!libs.includes(index) && before.cells[index] === 0) {
        return { ok: true, reason: '这里虽然空着，但它没有和棋子直接相邻，所以不算气。' };
      }
      return { ok: false };
    }

    case 'twoEyes': {
      const p = stoneAt(before, check.group);
      if (after.cells[p] === 0) return { ok: false };
      const eyes = countEyes(after, p);
      if (eyes >= 2) {
        return {
          ok: true,
          reason: '现在这块棋有两只真眼。对手每次只能填一只眼，永远填不完，所以这块棋活了。',
        };
      }
      return { ok: false };
    }

    case 'alive': {
      const p = stoneAt(before, check.group);
      if (after.cells[p] === 0) return { ok: false };
      const g = after.group(p);
      if (countEyes(after, p) >= 2) return { ok: true, reason: '两只真眼，这块棋已经活了。' };
      if (g.liberties.length >= 4) return { ok: true, reason: '这块棋跑出来了，气很多，暂时吃不掉。' };
      if (g.liberties.length >= 2 && !opponentCanInvade(after, p)) {
        return { ok: true, reason: '对手已经没有可以进来的点了，这块棋安全了。' };
      }
      return { ok: false };
    }

    case 'kill': {
      const p = stoneAt(before, check.group);
      if (after.cells[p] === 0) return { ok: false };
      const victim = after.group(p).color;
      // Still alive with two eyes ⇒ the move killed nothing.
      if (countEyes(after, p) >= 2) return { ok: false };
      // Can the defender still make two eyes with one more move of their own?
      const probe = after.clone();
      if (canMakeTwoEyes(probe, p)) return { ok: false };
      void victim;
      return {
        ok: true,
        reason: '要点被点住了，这块棋做不出两只眼，已经死了。',
      };
    }

    case 'points': {
      const label = labelOf(before.size, index);
      if (check.at.includes(label)) return { ok: true };
      if (check.allowOthers) return { ok: true };
      return { ok: false };
    }

    default:
      return { ok: false };
  }
}

/** A human-readable label for a board point, e.g. D4. */
export function labelOf(size: number, index: number): string {
  if (index < 0) return '—';
  return `${'ABCDEFGHJKLMNOPQRST'[index % size]}${size - Math.floor(index / size)}`;
}

/** Points of every enemy block that was just reduced to one liberty. */
export function atariTargets(board: GoBoard, color: Color): number[][] {
  const enemy = opposite(color);
  return board
    .allGroups()
    .filter((g) => g.color === enemy && g.liberties.length === 1)
    .map((g) => g.liberties);
}

/** True when the move is the only legal one (used to give a fair hint). */
export function onlyLegalMove(board: GoBoard, color: Color): boolean {
  return board.legalMoves(color).length <= 1;
}

export { BLACK, WHITE };
