import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, EMPTY, WHITE, type Color } from '../../engine/GoBoard/types';
import { parseCoord } from '../../engine/GoBoard/coordinates';
import type { DemoAction, DemoFrame } from '../../app/types';
import type { BoardView, MarkView } from '../../components/Board/renderer';

/**
 * Lesson player runtime.
 *
 * A frame list is compiled into a list of *states* — one per frame — and the
 * renderer simply interpolates between the previous state and the current one.
 * Because every state is a complete board snapshot, pausing, stepping and
 * scrubbing backwards can never show a half-applied position.
 */

export interface FrameState {
  cells: Int8Array;
  marks: MarkView[];
  /** Stones that changed in this frame (index → 'add' | 'remove'). */
  added: number[];
  removed: number[];
  liberties: number[];
  /** Optional pointer for the narration. */
  arrow: MarkView | null;
  text: string;
  caption?: string;
  hold: number;
}

export interface CompiledDemo {
  frames: FrameState[];
  size: number;
  errors: string[];
}

function idx(size: number, at: string): number {
  const i = parseCoord(size, at);
  if (i < 0) throw new Error(`bad coordinate ${at}`);
  return i;
}

export function compileDemo(size: number, baseCells: Int8Array, frames: DemoFrame[]): CompiledDemo {
  const errors: string[] = [];
  let cells = Int8Array.from(baseCells);
  let marks: MarkView[] = [];
  const out: FrameState[] = [];

  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    const added: number[] = [];
    const removed: number[] = [];
    let liberties: number[] = [];
    let arrow: MarkView | null = null;

    for (const action of frame.actions) {
      try {
        apply(action);
      } catch (err) {
        errors.push(`frame ${f + 1}: ${(err as Error).message}`);
      }
    }

    out.push({
      cells: Int8Array.from(cells),
      marks: marks.map((m) => ({ ...m })),
      added,
      removed,
      liberties,
      arrow,
      text: frame.text,
      caption: frame.caption,
      hold: frame.hold ?? 900,
    });

    function board(): GoBoard {
      return new GoBoard(size, cells);
    }

    function apply(a: DemoAction) {
      switch (a.type) {
        case 'stone': {
          const i = idx(size, a.at);
          if (cells[i] !== EMPTY) {
            // Re-stating a stone that is already there is a no-op (authors
            // often repeat the setup for readability). A different colour is
            // a real error and is reported.
            if (cells[i] !== a.color) {
              errors.push(`frame ${f + 1}: point ${a.at} holds the other colour`);
            }
            return;
          }
          const b = board();
          const captured = b.capturesAt(i, a.color);
          // Apply directly (demo may place out of turn), but capture correctly.
          cells[i] = a.color;
          added.push(i);
          for (const c of captured) {
            cells[c] = EMPTY;
            removed.push(c);
          }
          marks = marks.filter((m) => m.index !== i);
          break;
        }
        case 'liberties': {
          const i = idx(size, a.at);
          const b = board();
          if (cells[i] === EMPTY) {
            errors.push(`frame ${f + 1}: no stone at ${a.at} for liberties`);
            return;
          }
          const g = b.group(i);
          liberties = g.liberties;
          for (const l of g.liberties) {
            marks = marks.filter((m) => m.index !== l);
            marks.push({ index: l, kind: 'liberty' });
          }
          if (a.label) {
            marks.push({ index: i, kind: 'label', text: a.label, color: '#1e4f7a' });
          }
          break;
        }
        case 'libertiesOff': {
          marks = marks.filter((m) => m.kind !== 'liberty');
          liberties = [];
          break;
        }
        case 'capture': {
          const i = idx(size, a.at);
          const b = board();
          const g = cells[i] !== EMPTY ? b.group(i) : { stones: [] as number[] };
          const targets = g.stones.length ? g.stones : a.count ? [] : [i];
          for (const t of targets) {
            if (cells[t] !== EMPTY) {
              cells[t] = EMPTY;
              removed.push(t);
            }
          }
          marks = marks.filter((m) => !targets.includes(m.index));
          break;
        }
        case 'remove': {
          const i = idx(size, a.at);
          cells[i] = EMPTY;
          removed.push(i);
          break;
        }
        case 'mark': {
          const i = idx(size, a.at);
          marks = marks.filter((m) => !(m.index === i && m.kind === a.kind));
          marks.push({ index: i, kind: a.kind, text: a.text });
          break;
        }
        case 'arrow': {
          const from = idx(size, a.from);
          const to = idx(size, a.to);
          const fx = from % size;
          const fy = Math.floor(from / size);
          const tx = to % size;
          const ty = Math.floor(to / size);
          const len = Math.hypot(tx - fx, ty - fy) || 1;
          arrow = {
            index: from,
            kind: 'arrow',
            dir: { dx: (tx - fx) / len, dy: (ty - fy) / len },
            text: a.text,
          };
          break;
        }
        case 'clearMarks': {
          marks = [];
          liberties = [];
          arrow = null;
          break;
        }
      }
    }
  }

  return { frames: out, size, errors };
}

/** Convert a compiled frame to the props the canvas expects. */
export function frameView(
  demo: CompiledDemo,
  index: number,
  appear: Map<number, number>,
  vanish: Map<number, number>,
): BoardView {
  const f = demo.frames[Math.max(0, Math.min(index, demo.frames.length - 1))];
  const stones = [];
  for (let i = 0; i < f.cells.length; i++) {
    if (!f.cells[i]) continue;
    stones.push({
      index: i,
      color: f.cells[i] as Color,
      appear: appear.get(i) ?? 1,
      vanish: vanish.get(i) ?? 0,
    });
  }
  const marks = [...f.marks];
  if (f.arrow) marks.push(f.arrow);
  return { size: demo.size, cells: f.cells, stones, marks, showStars: true };
}

/** Which stones should be animated for a transition between frames. */
export function diffFrames(a: FrameState | null, b: FrameState): { added: number[]; removed: number[] } {
  if (!a) return { added: b.added, removed: [] };
  const added: number[] = [];
  const removed: number[] = [];
  for (let i = 0; i < b.cells.length; i++) {
    if (a.cells[i] === 0 && b.cells[i] !== 0) added.push(i);
    if (a.cells[i] !== 0 && b.cells[i] === 0) removed.push(i);
  }
  return { added, removed };
}

export const STONE = { BLACK, WHITE, EMPTY };
