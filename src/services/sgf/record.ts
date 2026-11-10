import type { GameRecord } from '../../app/types';

/**
 * Game archive helpers: turn a live GoBoard into a serialisable record and back,
 * and render a record as a replayable list of positions.
 */
import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE, type Color } from '../../engine/GoBoard/types';
import { parseCoord } from '../../engine/GoBoard/coordinates';

export type RecordMove = { at: string; color: Color; pass?: boolean; comment?: string };

export function boardToRecordMoves(board: GoBoard): RecordMove[] {
  return board.history.map((m) => ({
    at:
      m.kind === 'pass'
        ? ''
        : `${'ABCDEFGHJKLMNOPQRST'[m.index % board.size]}${board.size - Math.floor(m.index / board.size)}`,
    color: m.color,
    pass: m.kind === 'pass' ? true : undefined,
  }));
}

/** Replay a record into a board (throws on corrupt data). */
export function replayRecord(rec: GameRecord): GoBoard {
  const board = new GoBoard(rec.size);
  for (const mv of rec.moves) {
    if (mv.pass) {
      board.pass(mv.color);
      continue;
    }
    const idx = parseCoord(rec.size, mv.at);
    if (idx < 0) throw new Error(`bad move ${mv.at}`);
    if (!board.play(idx, mv.color).ok) throw new Error(`illegal move ${mv.at}`);
  }
  return board;
}

/** Board states after each move (index 0 = empty board). */
export function positionsFromRecord(rec: GameRecord): GoBoard[] {
  const board = new GoBoard(rec.size);
  const out: GoBoard[] = [board.clone()];
  for (const mv of rec.moves) {
    if (mv.pass) board.pass(mv.color);
    else {
      const idx = parseCoord(rec.size, mv.at);
      if (idx >= 0) board.play(idx, mv.color);
    }
    out.push(board.clone());
  }
  return out;
}

export function shortResult(rec: GameRecord): string {
  return rec.result ?? '未结束';
}

export { BLACK, WHITE };
