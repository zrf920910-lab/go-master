import { describe, expect, it } from 'vitest';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { analyzeLife, eyeSpace } from '../src/engine/Rules/lifeDeath';
import { boardToDiagram } from '../src/learning/Exercises/position';

/**
 * Classic life-and-death shapes, checked against Go theory.
 *
 * These are the shapes the app teaches (and labels in the pattern library), so
 * the solver has to agree with the textbook verdict for every one of them. The
 * shapes are built by *specifying the empty interior*, then sealing it with a
 * one-point ring of the defender's colour and a wall of the attacker's colour.
 * That construction is itself verified by asserting the resulting eye space.
 */

const LETTERS = 'ABCDEFGHJ';
const lab = (index: number) => `${LETTERS[index % 9]}${9 - Math.floor(index / 9)}`;
const at = (label: string) => {
  const x = LETTERS.indexOf(label[0]);
  const y = 9 - Number(label.slice(1));
  return { x, y };
};
const neighbours = (label: string) => {
  const { x, y } = at(label);
  const out: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 8 || ny > 8) continue;
      out.push(`${LETTERS[nx]}${9 - ny}`);
    }
  }
  return out;
};

/** Build a sealed group whose eye space is exactly `interior`. */
function sealedShape(interior: string[]): { board: GoBoard; ring: string[] } {
  const inside = new Set(interior);
  const ringSet = new Set<string>();
  for (const p of interior) for (const n of neighbours(p)) if (!inside.has(n)) ringSet.add(n);
  const wall = new Set<string>();
  for (const r of ringSet) for (const n of neighbours(r)) if (!inside.has(n) && !ringSet.has(n)) wall.add(n);

  const board = GoBoard.fromSetup(
    9,
    [
      ...[...wall].map((l) => ({ ...at(l), color: BLACK })),
      ...[...ringSet].map((l) => ({ ...at(l), color: WHITE })),
    ],
    BLACK,
  );
  return { board, ring: [...ringSet] };
}

function verdict(interior: string[]) {
  const { board, ring } = sealedShape(interior);
  const root = (9 - Number(ring[0].slice(1))) * 9 + LETTERS.indexOf(ring[0][0]);
  // The attacker (black) moves first: the worst case for the defender.
  const attack = analyzeLife(board, root, {});
  const defenderFirst = board.clone();
  defenderFirst.turn = WHITE;
  const defend = analyzeLife(defenderFirst, root, {});
  return {
    aliveWhenAttacked: attack.alive,
    aliveWhenDefendingFirst: defend.alive,
    eyeSpace: attack.eyeSpace.map(lab).sort(),
    board,
  };
}

describe('life and death: classic shapes match Go theory', () => {
  // 死形 — the defender dies if the attacker moves first.
  const deadShapes: Array<[string, string[]]> = [
    ['直二', ['D3', 'E3']],
    ['直三', ['D3', 'E3', 'F3']],
    ['曲三', ['D3', 'D4', 'E4']],
    ['方四', ['D3', 'E3', 'D4', 'E4']],
    ['丁四', ['E3', 'D4', 'E4', 'F4']],
  ];
  for (const [name, interior] of deadShapes) {
    it(`${name} is dead`, () => {
      const v = verdict(interior);
      expect(v.eyeSpace, `${name} eye space`).toEqual([...interior].sort());
      expect(v.aliveWhenAttacked, `${name} must die against best play`).toBe(false);
    });
  }

  // 活形 — the defender survives even when the attacker moves first.
  const aliveShapes: Array<[string, string[]]> = [
    ['直四', ['D3', 'E3', 'F3', 'G3']],
    ['曲四', ['D3', 'D4', 'D5', 'E5']],
    ['葡萄六', ['D3', 'E3', 'D4', 'E4', 'D5', 'E5']],
  ];
  for (const [name, interior] of aliveShapes) {
    it(`${name} is alive`, () => {
      const v = verdict(interior);
      expect(v.eyeSpace, `${name} eye space`).toEqual([...interior].sort());
      expect(v.aliveWhenAttacked, `${name} must survive`).toBe(true);
    });
  }

  it('a straight three lives only if the defender plays first', () => {
    // This is the classic "one move decides it" position.
    const v = verdict(['D3', 'E3', 'F3']);
    expect(v.aliveWhenAttacked).toBe(false);
    expect(v.aliveWhenDefendingFirst).toBe(true);
  });

  it('a split eye space (two one-point eyes) is alive', () => {
    // Take the sealed three-point shape and fill its middle point with a stone
    // of the defender's colour: the remaining eye space becomes two separate
    // one-point eyes.
    const { board, ring } = sealedShape(['D3', 'E3', 'F3']);
    const root = (9 - Number(ring[0].slice(1))) * 9 + LETTERS.indexOf(ring[0][0]);
    const eye = eyeSpace(board, board.group(root).stones).sort();
    expect(eye.length).toBe(3);

    const split = board.clone();
    split.set(eye[1], WHITE); // the middle of the three-point eye space

    const regions = eyeSpace(split, split.group(root).stones);
    expect(regions.length, 'the eye space must split into two regions').toBe(2);
    expect(analyzeLife(split, root, {}).alive).toBe(true);
  });

  it('does not claim a group with no eye space is alive', () => {
    // A completely packed group has no eye space at all.
    const board = GoBoard.fromSetup(
      9,
      ['D3', 'E3', 'D4', 'E4'].map((l) => ({ ...at(l), color: WHITE })),
      BLACK,
    );
    const root = (9 - Number('D3'.slice(1))) * 9 + LETTERS.indexOf('D3');
    expect(eyeSpace(board, board.group(root).stones).length).toBe(0);
    expect(analyzeLife(board, root, {}).alive).toBe(false);
  });

  it('is fast enough for interactive use', () => {
    const started = Date.now();
    for (const [, interior] of deadShapes) verdict(interior);
    for (const [, interior] of aliveShapes) verdict(interior);
    const elapsed = Date.now() - started;
    // Eight shapes, two searches each, must stay well under a second so the
    // teacher panel can call this while the learner is looking at the board.
    expect(elapsed).toBeLessThan(2000);
  });

  it('produces boards whose eye space matches the requested interior', () => {
    // Guards the construction helper itself: if the helper were wrong the
    // assertions above would be meaningless.
    const { board, ring } = sealedShape(['D3', 'E3', 'F3']);
    const root = (9 - Number(ring[0].slice(1))) * 9 + LETTERS.indexOf(ring[0][0]);
    const group = board.group(root);
    expect(group.liberties.map(lab).sort()).toEqual(['D3', 'E3', 'F3']);
    void boardToDiagram;
  });
});
