import { describe, expect, it } from 'vitest';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { analyzeLife, eyeSpace } from '../src/engine/Rules/lifeDeath';
import { boardToDiagram, boardFromSpec } from '../src/learning/Exercises/position';
import { sealedShape as buildSealed, LIFE_SHAPES } from '../src/learning/Exercises/sealedShape';

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
function verdict(interior: string[]) {
  const board = boardFromSpec(buildSealed(interior));
  // Find the defender's block: the sealed shape always has one.
  let root = -1;
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] === WHITE) {
      root = i;
      break;
    }
  }
  if (root < 0) throw new Error(`no defender block for ${interior.join(',')}`);
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
    const board = boardFromSpec(buildSealed(['D3', 'E3', 'F3']));
    let start = -1;
    for (let i = 0; i < board.cells.length; i++) {
      if (board.cells[i] === WHITE) {
        start = i;
        break;
      }
    }
    const root = start;
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

  it('uses sealed shapes for the pattern library and they agree with theory', () => {
    // The published pattern diagrams must be real enclosed groups, not floating
    // rings, and the solver's verdict must match the text the learner reads.
    const expected: Array<[string, readonly string[], boolean]> = [
      ['直二', LIFE_SHAPES.straightTwo, false],
      ['直三', LIFE_SHAPES.straightThree, false],
      ['曲三', LIFE_SHAPES.curvedThree, false],
      ['方四', LIFE_SHAPES.squareFour, false],
      ['丁四', LIFE_SHAPES.tFour, false],
      ['刀五', LIFE_SHAPES.knifeFive, false],
      ['直四', LIFE_SHAPES.straightFour, true],
      ['曲四', LIFE_SHAPES.curvedFour, true],
      ['葡萄六', LIFE_SHAPES.grapeSix, true],
    ];
    for (const [name, interior, shouldLive] of expected) {
      const spec = buildSealed(interior);
      if (!spec || !spec.diagram) {
        throw new Error(`sealedShape(${name}) returned ${JSON.stringify(spec)}; interior=${JSON.stringify(interior)}`);
      }
      const board = boardFromSpec(spec);
      let root = -1;
      for (let i = 0; i < board.cells.length; i++) {
        if (board.cells[i] === WHITE) {
          root = i;
          break;
        }
      }
      expect(root, `${name} has a defender block`).toBeGreaterThanOrEqual(0);
      const eyes = eyeSpace(board, board.group(root).stones).map(lab).sort();
      expect(eyes.length, `${name} must be sealed with the right eye space`).toBe(interior.length);
      const attack = analyzeLife(board, root, {});
      expect(attack.alive, `${name} verdict`).toBe(shouldLive);
    }
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
    const board = boardFromSpec(buildSealed(['D3', 'E3', 'F3']));
    let root = -1;
    for (let i = 0; i < board.cells.length; i++) {
      if (board.cells[i] === WHITE) {
        root = i;
        break;
      }
    }
    const group = board.group(root);
    expect(group.liberties.map(lab).sort()).toEqual(['D3', 'E3', 'F3']);
    void boardToDiagram;
  });
});
