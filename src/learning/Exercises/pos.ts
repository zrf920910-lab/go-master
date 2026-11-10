import type { PositionSpec } from '../../app/types';
import type { Color } from '../../engine/GoBoard/types';
import { parseCoord } from '../../engine/GoBoard/coordinates';

/**
 * Authoring helper.
 *
 *   pos(9, ['X D5', 'O E5'], 2)
 *
 * Stones are written as "colour coordinate" pairs, which is unambiguous and
 * can be verified by tests. The builder converts them to the picture format the
 * board parser consumes, so lessons stay readable without hand-drawing rows.
 */
export function pos(size: number, stones: string[], turn: Color = 1): PositionSpec {
  const grid = new Int8Array(size * size);
  for (const spec of stones) {
    const m = /^([XO])\s*([A-T]\d{1,2})$/i.exec(spec.trim());
    if (!m) throw new Error(`bad stone spec "${spec}"`);
    const idx = parseCoord(size, m[2]);
    if (idx < 0) throw new Error(`bad coordinate "${spec}"`);
    grid[idx] = m[1].toUpperCase() === 'X' ? 1 : 2;
  }
  const diagram: string[] = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) row.push(grid[y * size + x] === 1 ? 'X' : grid[y * size + x] === 2 ? 'O' : '.');
    diagram.push(row.join(' '));
  }
  return { size, diagram, turn };
}

/** Empty board of a given size. */
export function emptyPos(size = 9, turn: Color = 1): PositionSpec {
  return pos(size, [], turn);
}
