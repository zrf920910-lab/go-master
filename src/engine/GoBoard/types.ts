/**
 * Core board types. The board is stored as a flat Int8Array so that snapshots
 * are cheap (one typed-array clone) and the same data can be fed to the
 * renderer, the AI and the scoring code without conversion.
 */

export const EMPTY = 0 as const;
export const BLACK = 1 as const;
export const WHITE = 2 as const;

export type Stone = 0 | 1 | 2;
export type Color = 1 | 2;

export const opposite = (c: Color): Color => (c === BLACK ? WHITE : BLACK);

export const colorName = (c: Stone): string =>
  c === BLACK ? '黑' : c === WHITE ? '白' : '空';

export interface Coord {
  x: number;
  y: number;
}

export interface GroupInfo {
  color: Color;
  stones: number[];
  liberties: number[];
}

export type MoveKind = 'play' | 'pass';

export interface PlayedMove {
  /** 0-based board index, -1 for pass. */
  index: number;
  color: Color;
  kind: MoveKind;
  captured: number[];
  /** Board position after the move (for review & SGF). */
  moveNumber: number;
  comment?: string;
}

export type IllegalReason =
  | 'occupied'
  | 'suicide'
  | 'ko'
  | 'superko'
  | 'out-of-bounds'
  | 'game-over';

export interface PlayResult {
  ok: boolean;
  reason?: IllegalReason;
  captured: number[];
  /** True when the move puts the opponent's group into atari. */
  atari?: boolean;
}

export interface BoardSnapshot {
  size: number;
  cells: Int8Array;
  turn: Color;
  captures: { black: number; white: number };
  koPoint: number;
  passes: number;
  moveNumber: number;
  lastMove: number;
}

export interface ScoreOptions {
  komi: number;
  ruleset: 'chinese' | 'japanese';
  /** Board points marked dead by the players at the end of the game. */
  dead?: number[];
}

export interface ScoreResult {
  black: number;
  white: number;
  blackTerritory: number;
  whiteTerritory: number;
  blackStones: number;
  whiteStones: number;
  neutral: number;
  komi: number;
  winner: Color | 'draw';
  margin: number;
  /** 0 empty / 1 black / 2 white for every point, for the endgame overlay. */
  ownership: Int8Array;
  method: 'chinese' | 'japanese';
}
