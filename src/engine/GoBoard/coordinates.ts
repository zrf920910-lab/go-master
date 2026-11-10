import type { Coord } from './types';

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // Go skips I by convention.

/** Human readable coordinate such as "D4" (columns left→right, rows bottom→top). */
export function coordLabel(size: number, index: number): string {
  const x = index % size;
  const y = Math.floor(index / size);
  return `${LETTERS[x]}${size - y}`;
}

/** Parse labels like "D4" or "d4" into an index, or -1 when invalid. */
export function parseCoord(size: number, label: string): number {
  const m = /^([A-HJ-Z])(\d{1,2})$/i.exec(label.trim());
  if (!m) return -1;
  const x = LETTERS.indexOf(m[1].toUpperCase());
  const row = Number(m[2]);
  if (x < 0 || x >= size || row < 1 || row > size) return -1;
  return (size - row) * size + x;
}

export function toCoord(size: number, index: number): Coord {
  return { x: index % size, y: Math.floor(index / size) };
}

export function toIndex(size: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= size || y >= size) return -1;
  return y * size + x;
}

/** Star points (hoshi) for each supported board size. */
export function starPoints(size: number): number[] {
  if (size === 19) {
    const pts = [3, 9, 15];
    const out: number[] = [];
    for (const y of pts) for (const x of pts) out.push(y * size + x);
    return out;
  }
  if (size === 13) {
    const pts = [3, 6, 9];
    const out: number[] = [];
    for (const y of pts) for (const x of pts) out.push(y * size + x);
    return out;
  }
  if (size === 9) {
    const pts = [2, 4, 6];
    const out: number[] = [];
    for (const y of pts) for (const x of pts) out.push(y * size + x);
    return out;
  }
  return [];
}
