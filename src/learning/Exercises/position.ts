import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../../engine/GoBoard/types';
import { parseCoord } from '../../engine/GoBoard/coordinates';
import type { PositionSpec } from '../../app/types';

/**
 * Diagram parsing.
 *
 * A diagram is authored as text, one string per row, top row first:
 *
 *     X O . . .
 *     . . . . .
 *
 * `X` black, `O` white, `.`/space empty. Letters like `a`.. are also accepted
 * as empty (they mark named points for explanations). Anything else is an
 * error, so a typo can never silently become a wrong teaching position.
 */
export function parseDiagram(size: number, diagram: string[]): { cells: Int8Array; errors: string[] } {
  const errors: string[] = [];
  const cells = new Int8Array(size * size);
  if (diagram.length > size) errors.push(`diagram has ${diagram.length} rows for ${size} board`);
  diagram.forEach((row, y) => {
    const tokens = tokenizeRow(row);
    if (tokens.length > size) errors.push(`row ${y + 1} has ${tokens.length} columns`);
    tokens.forEach((token, x) => {
      if (x >= size) return;
      if (token === 'X') cells[y * size + x] = BLACK;
      else if (token === 'O') cells[y * size + x] = WHITE;
      else if (token === '.' || token === ',' || /^[a-z0-9]$/.test(token)) {
        if (token !== '.' && token !== ',') {
          // letter marks an interesting empty point; still empty
        }
      } else if (token !== '·' && token !== '_') {
        errors.push(`unknown token "${token}" at row ${y + 1}, column ${x + 1}`);
      }
    });
  });
  return { cells, errors };
}

function tokenizeRow(row: string): string[] {
  const trimmed = row.trim();
  if (!trimmed) return [];
  if (/\s/.test(trimmed)) return trimmed.split(/\s+/).filter(Boolean);
  // Compact form without spaces: one character per column.
  return trimmed.split('');
}

/** Convert an authored picture into a live board ready for play. */
export function boardFromSpec(spec: PositionSpec): GoBoard {
  const { cells, errors } = parseDiagram(spec.size, spec.diagram);
  if (errors.length) throw new Error(`Bad board diagram: ${errors.join('; ')}`);
  const board = new GoBoard(spec.size, cells, spec.turn);
  if (spec.ko) {
    const i = parseCoord(spec.size, spec.ko);
    if (i >= 0) board.koPoint = i;
  }
  return board;
}

/** Render a board back into the same picture format (used by tests). */
export function boardToDiagram(board: GoBoard): string[] {
  const out: string[] = [];
  for (let y = 0; y < board.size; y++) {
    const row: string[] = [];
    for (let x = 0; x < board.size; x++) {
      const v = board.cells[y * board.size + x];
      row.push(v === BLACK ? 'X' : v === WHITE ? 'O' : '.');
    }
    out.push(row.join(' '));
  }
  return out;
}

export function indexOf(size: number, at: string): number {
  const i = parseCoord(size, at);
  if (i < 0) throw new Error(`bad coordinate ${at}`);
  return i;
}
