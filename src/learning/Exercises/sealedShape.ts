import type { PositionSpec } from '../../app/types';
import type { Color } from '../../engine/GoBoard/types';
import { pos } from './pos';

/**
 * Build a *sealed* life-and-death shape for the pattern library.
 *
 * A shape is described by the empty points that make up its eye space. The
 * helper wraps those points in one ring of the defender's colour and then a
 * ring of the attacker's colour, so the resulting position is a genuine
 * enclosed group — which is what makes the eye-space diagrams meaningful.
 *
 * Using this for content means a pattern can never accidentally ship as a
 * floating ring with no sealed interior.
 */
const LETTERS = 'ABCDEFGHJ';

function coords(label: string): { x: number; y: number } {
  const x = LETTERS.indexOf(label[0]);
  const y = 9 - Number(label.slice(1));
  if (x < 0 || !y) throw new Error(`bad pattern coordinate ${label}`);
  return { x, y };
}

function label(x: number, y: number): string {
  return `${LETTERS[x]}${9 - y}`;
}

export function sealedShape(
  interior: readonly string[],
  opts: { size?: number; defender?: Color } = {},
): PositionSpec {
  const size = opts.size ?? 9;
  if (size !== 9) throw new Error('sealedShape currently supports 9x9 only');
  const defender: Color = opts.defender ?? 2; // white defends by default
  const attacker: Color = defender === 2 ? 1 : 2;
  const inside = new Set(interior);

  const neighbours = (l: string) => {
    const { x, y } = coords(l);
    const out: string[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx > size - 1 || ny > size - 1) continue;
        out.push(label(nx, ny));
      }
    }
    return out;
  };

  const ring = new Set<string>();
  for (const p of interior) for (const n of neighbours(p)) if (!inside.has(n)) ring.add(n);
  const wall = new Set<string>();
  for (const r of ring) for (const n of neighbours(r)) if (!inside.has(n) && !ring.has(n)) wall.add(n);

  return pos(
    size,
    [
      ...[...wall].map((l) => `${attacker === 1 ? 'X' : 'O'} ${l}`),
      ...[...ring].map((l) => `${defender === 2 ? 'O' : 'X'} ${l}`),
    ],
    attacker,
  );
}

/** Eye-space definitions for the standard shapes, used by the pattern library. */
export const LIFE_SHAPES = {
  straightTwo: ['D3', 'E3'],
  straightThree: ['D3', 'E3', 'F3'],
  curvedThree: ['D3', 'D4', 'E4'],
  squareFour: ['D3', 'E3', 'D4', 'E4'],
  tFour: ['E3', 'D4', 'E4', 'F4'],
  straightFour: ['D3', 'E3', 'F3', 'G3'],
  curvedFour: ['D3', 'D4', 'D5', 'E5'],
  grapeSix: ['D3', 'E3', 'D4', 'E4', 'D5', 'E5'],
  /** 刀五（bulky five）：三横 + 下方两点，是死形。 */
  knifeFive: ['D6', 'E6', 'F6', 'D5', 'E5'],
} as const satisfies Record<string, readonly string[]>;
