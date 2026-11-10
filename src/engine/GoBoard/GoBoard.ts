import {
  BLACK,
  EMPTY,
  WHITE,
  opposite,
  type Color,
  type GroupInfo,
  type IllegalReason,
  type PlayResult,
  type PlayedMove,
  type Stone,
} from './types';

/**
 * The authoritative Go rules engine.
 *
 * Design notes
 * ------------
 * - `cells` is a flat Int8Array, index = y * size + x with (0,0) top-left.
 * - A move is validated before mutating; on a rejected move the board is left
 *   untouched, so UI state can never drift out of sync.
 * - Simple ko is enforced through `koPoint`; positional superko is enforced by
 *   comparing the resulting position with every position already on the board.
 *   This never allows a cycle, which is what the teaching animations rely on.
 * - `undo()` replays the game from the move list, so ko points, captures and
 *   pass counts are always exact.
 */
export class GoBoard {
  readonly size: number;
  cells: Int8Array;
  turn: Color;
  captures: { black: number; white: number } = { black: 0, white: 0 };
  /** Point that would immediately recreate the previous position (simple ko). */
  koPoint = -1;
  passes = 0;
  moveNumber = 0;
  lastMove = -1;
  history: PlayedMove[] = [];
  /** Hashes of every position seen, including the current one. */
  private positions = new Set<string>();
  /** Position the game started from — undo replays back to this, not to empty. */
  private baseCells: Int8Array;
  private baseTurn: Color;

  constructor(size: number, cells?: Int8Array, turn: Color = BLACK) {
    if (![9, 13, 19].includes(size)) throw new Error(`unsupported board size ${size}`);
    this.size = size;
    this.cells = cells ? Int8Array.from(cells) : new Int8Array(size * size);
    this.turn = turn;
    this.baseCells = Int8Array.from(this.cells);
    this.baseTurn = turn;
    this.positions.add(this.positionKey());
  }

  clone(): GoBoard {
    const b = new GoBoard(this.size, this.cells, this.turn);
    b.captures = { ...this.captures };
    b.koPoint = this.koPoint;
    b.passes = this.passes;
    b.moveNumber = this.moveNumber;
    b.lastMove = this.lastMove;
    b.history = this.history.map((m) => ({ ...m, captured: [...m.captured] }));
    b.positions = new Set(this.positions);
    b.baseCells = Int8Array.from(this.baseCells);
    b.baseTurn = this.baseTurn;
    return b;
  }

  get(index: number): Stone {
    if (index < 0 || index >= this.cells.length) return EMPTY;
    return this.cells[index] as Stone;
  }

  set(index: number, color: Stone) {
    this.cells[index] = color;
  }

  /** Clear the whole board (free practice / setup). */
  clear() {
    this.cells.fill(EMPTY);
    this.captures = { black: 0, white: 0 };
    this.koPoint = -1;
    this.passes = 0;
    this.moveNumber = 0;
    this.lastMove = -1;
    this.history = [];
    this.baseCells = Int8Array.from(this.cells);
    this.baseTurn = this.turn;
    this.positions = new Set([this.positionKey()]);
  }

  /** Neighbour indices (up to four). */
  neighbours(index: number): number[] {
    const x = index % this.size;
    const y = (index - x) / this.size;
    const out: number[] = [];
    if (x > 0) out.push(index - 1);
    if (x < this.size - 1) out.push(index + 1);
    if (y > 0) out.push(index - this.size);
    if (y < this.size - 1) out.push(index + this.size);
    return out;
  }

  /** Flood fill the connected block containing `index`. */
  group(index: number): GroupInfo {
    const color = this.cells[index] as Color;
    if (color !== BLACK && color !== WHITE) {
      return { color: BLACK, stones: [], liberties: [] };
    }
    const stones: number[] = [];
    const libertySet = new Set<number>();
    const seen = new Uint8Array(this.cells.length);
    const stack = [index];
    seen[index] = 1;
    while (stack.length) {
      const cur = stack.pop()!;
      stones.push(cur);
      for (const n of this.neighbours(cur)) {
        const v = this.cells[n];
        if (v === EMPTY) libertySet.add(n);
        else if (v === color && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    return { color, stones, liberties: [...libertySet] };
  }

  /** Liberties of the block at `index` (empty when the point is empty). */
  liberties(index: number): number[] {
    return this.group(index).liberties;
  }

  /** All empty points adjacent to the block at `index`. */
  groupAt(index: number): GroupInfo {
    return this.group(index);
  }

  /** Opponent stones captured if `color` plays `index`. Does not mutate. */
  capturesAt(index: number, color: Color): number[] {
    const captured: number[] = [];
    const enemy = opposite(color);
    for (const n of this.neighbours(index)) {
      if (this.cells[n] !== enemy) continue;
      if (captured.includes(n)) continue;
      const g = this.group(n);
      if (g.liberties.length === 1 && g.liberties[0] === index) {
        for (const s of g.stones) if (!captured.includes(s)) captured.push(s);
      }
    }
    return captured;
  }

  /** Count liberties the stone/group at `index` would have after playing a stone there. */
  private resultingLiberties(index: number, color: Color): number {
    // Simulate on a scratch copy of just the relevant neighbours.
    const saved = this.cells[index];
    this.cells[index] = color;
    const libs = this.group(index).liberties.length;
    this.cells[index] = saved;
    return libs;
  }

  /** Would playing at `index` be legal for `color`? */
  checkLegality(index: number, color: Color): IllegalReason | null {
    if (index < 0 || index >= this.cells.length) return 'out-of-bounds';
    if (this.cells[index] !== EMPTY) return 'occupied';
    if (index === this.koPoint) return 'ko';
    if (this.capturesAt(index, color).length > 0) return null;
    if (this.resultingLiberties(index, color) === 0) return 'suicide';
    return null;
  }

  /** True when the point is a legal move for the side to play. */
  isLegal(index: number): boolean {
    return this.checkLegality(index, this.turn) === null;
  }

  /** Apply a move. Mutates on success, is a no-op on failure. */
  play(index: number, color: Color = this.turn): PlayResult {
    if (this.passes >= 2) return { ok: false, reason: 'game-over', captured: [] };
    const reason = this.checkLegality(index, color);
    if (reason) return { ok: false, reason, captured: [] };

    const captured = this.capturesAt(index, color);
    const before = this.cells.slice();

    this.cells[index] = color;
    for (const c of captured) this.cells[c] = EMPTY;

    // Simple ko: single stone captured, capturer left with exactly one liberty,
    // and recapturing would restore the previous board.
    let ko = -1;
    if (captured.length === 1) {
      const g = this.group(index);
      if (g.stones.length === 1 && g.liberties.length === 1) ko = captured[0];
    }

    // Positional superko — the position may never repeat.
    if (this.positions.has(this.positionKey())) {
      this.cells.set(before);
      return { ok: false, reason: 'superko', captured: [] };
    }

    this.koPoint = ko;
    if (color === BLACK) this.captures.black += captured.length;
    else this.captures.white += captured.length;
    this.turn = opposite(color);
    this.moveNumber++;
    this.lastMove = index;
    this.passes = 0;
    this.positions.add(this.positionKey());
    this.history.push({ index, color, kind: 'play', captured, moveNumber: this.moveNumber });

    return { ok: true, captured, atari: this.anyCapturedGroupInAtari(index, color) };
  }

  /** After a move, is a neighbouring enemy block reduced to one liberty? */
  private anyCapturedGroupInAtari(index: number, mover: Color): boolean {
    const enemy = opposite(mover);
    const seen = new Set<number>();
    for (const n of this.neighbours(index)) {
      if (this.cells[n] !== enemy || seen.has(n)) continue;
      const g = this.group(n);
      for (const s of g.stones) seen.add(s);
      if (g.liberties.length === 1) return true;
    }
    return false;
  }

  pass(color: Color = this.turn): PlayResult {
    this.koPoint = -1;
    this.passes++;
    this.turn = opposite(color);
    this.moveNumber++;
    this.lastMove = -1;
    this.history.push({ index: -1, color, kind: 'pass', captured: [], moveNumber: this.moveNumber });
    return { ok: true, captured: [] };
  }

  /** Undo the last move and return it. */
  undo(): PlayedMove | null {
    const move = this.history.pop();
    if (!move) return null;
    this.rebuildFromHistory();
    return move;
  }

  /** Undo to a specific move count (0 = empty board). */
  undoTo(moveNumber: number): void {
    while (this.history.length > moveNumber) this.history.pop();
    this.rebuildFromHistory();
  }

  private rebuildFromHistory() {
    const moves = this.history.map((m) => ({ ...m, captured: [...m.captured] }));
    const fresh = new GoBoard(this.size, this.baseCells, this.baseTurn);
    for (const m of moves) {
      if (m.kind === 'pass') fresh.pass(m.color);
      else fresh.play(m.index, m.color);
    }
    this.cells = fresh.cells;
    this.turn = fresh.turn;
    this.captures = fresh.captures;
    this.koPoint = fresh.koPoint;
    this.passes = fresh.passes;
    this.moveNumber = fresh.moveNumber;
    this.lastMove = fresh.lastMove;
    this.positions = fresh.positions;
    this.history = fresh.history;
    this.baseCells = fresh.baseCells;
    this.baseTurn = fresh.baseTurn;
  }

  /** Position hash used for superko detection. */
  positionKey(): string {
    let s = '';
    for (let i = 0; i < this.cells.length; i++) s += this.cells[i];
    return s;
  }

  /** Set up a position without recording history (used by lessons/AI). */
  static fromSetup(
    size: number,
    stones: Array<{ x: number; y: number; color: Color }>,
    turn: Color = BLACK,
  ) {
    const b = new GoBoard(size, undefined, turn);
    for (const s of stones) b.cells[s.y * size + s.x] = s.color;
    b.baseCells = Int8Array.from(b.cells);
    b.baseTurn = turn;
    b.positions = new Set([b.positionKey()]);
    return b;
  }

  /** Convenience: all groups on the board. */
  allGroups(): GroupInfo[] {
    const seen = new Uint8Array(this.cells.length);
    const out: GroupInfo[] = [];
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== EMPTY && !seen[i]) {
        const g = this.group(i);
        for (const s of g.stones) seen[s] = 1;
        out.push(g);
      }
    }
    return out;
  }

  /** Groups with a single liberty — used for hints and the gentle AI. */
  atariGroups(): GroupInfo[] {
    return this.allGroups().filter((g) => g.liberties.length === 1);
  }

  /** Legal moves for `color` (used by the AI and by hint generation). */
  legalMoves(color: Color = this.turn): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === EMPTY && this.checkLegality(i, color) === null) out.push(i);
    }
    return out;
  }
}
