import { describe, expect, it } from 'vitest';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { autoDetectDead, scoreBoard } from '../src/engine/Scoring/scoring';
import { parseCoord } from '../src/engine/GoBoard/coordinates';
import { GoAI } from '../src/engine/AI/GoAI';

const p = (size: number, label: string) => {
  const i = parseCoord(size, label);
  if (i < 0) throw new Error(`bad coord ${label}`);
  return i;
};

const xy = (size: number, label: string) => {
  const i = p(size, label);
  return { x: i % size, y: Math.floor(i / size) };
};

function setup(size: number, black: string[], white: string[], turn: 1 | 2 = BLACK) {
  return GoBoard.fromSetup(
    size,
    [
      ...black.map((l) => ({ ...xy(size, l), color: BLACK })),
      ...white.map((l) => ({ ...xy(size, l), color: WHITE })),
    ],
    turn,
  );
}

const coord = (size: number, label: string) => {
  const i = p(size, label);
  return { x: i % size, y: Math.floor(i / size) };
};

const labels = (b: GoBoard, pts: number[]) =>
  pts.map((i) => `${'ABCDEFGHJ'[i % b.size]}${b.size - Math.floor(i / b.size)}`).sort();

describe('liberties and groups', () => {
  it('counts four liberties in the centre, three on the side, two in the corner', () => {
    const b = new GoBoard(9);
    b.set(p(9, 'E5'), BLACK);
    expect(b.liberties(p(9, 'E5')).length).toBe(4);
    b.clear();
    b.set(p(9, 'A5'), BLACK);
    expect(b.liberties(p(9, 'A5')).length).toBe(3);
    b.clear();
    b.set(p(9, 'A1'), BLACK);
    expect(labels(b, b.liberties(p(9, 'A1')))).toEqual(['A2', 'B1']);
  });

  it('connected stones share liberties', () => {
    const b = setup(9, ['E5', 'F5'], []);
    const g = b.group(p(9, 'E5'));
    expect(g.stones.length).toBe(2);
    expect(g.liberties.length).toBe(6);
  });

  it('diagonal stones are not connected', () => {
    const b = setup(9, ['E5', 'F6'], []);
    expect(b.group(p(9, 'E5')).stones.length).toBe(1);
  });

  it('a 2x2 block has four liberties', () => {
    const b = setup(9, ['D4', 'E4', 'D5', 'E5'], []);
    expect(b.group(p(9, 'D4')).liberties.length).toBe(8);
  });
});

describe('capture', () => {
  it('captures the last liberty of a single stone', () => {
    const b = setup(9, ['D5', 'E4', 'E6'], ['E5']);
    expect(labels(b, b.group(p(9, 'E5')).liberties)).toEqual(['F5']);
    const res = b.play(p(9, 'F5'), BLACK);
    expect(res.ok).toBe(true);
    expect(res.captured).toEqual([p(9, 'E5')]);
    expect(b.get(p(9, 'E5'))).toBe(0);
    expect(b.captures.black).toBe(1);
  });

  it('captures a multi-stone block and counts every stone', () => {
    const b = setup(9, ['C5', 'D4', 'D6', 'E4', 'E6'], ['D5', 'E5']);
    expect(labels(b, b.group(p(9, 'D5')).liberties)).toEqual(['F5']);
    const res = b.play(p(9, 'F5'), BLACK);
    expect(res.ok).toBe(true);
    expect(labels(b, res.captured)).toEqual(['D5', 'E5']);
    expect(b.captures.black).toBe(2);
  });

  it('does not capture a group that still has liberties', () => {
    const b = setup(9, ['D5', 'E4'], ['E5']);
    const r = b.play(p(9, 'E6'), BLACK);
    expect(r.ok).toBe(true);
    expect(r.captured).toEqual([]);
    expect(b.get(p(9, 'E5'))).toBe(WHITE);
  });

  it('reports atari when a neighbouring block is reduced to one liberty', () => {
    // White E5 has two liberties (E4, D4); black takes one and puts it in atari.
    const b = setup(9, ['D5', 'F5'], ['E5']);
    expect(labels(b, b.group(p(9, 'E5')).liberties)).toEqual(['E4', 'E6']);
    const r = b.play(p(9, 'E4'), BLACK);
    expect(r.ok).toBe(true);
    expect(r.captured).toEqual([]);
    expect(r.atari).toBe(true);
    expect(labels(b, b.group(p(9, 'E5')).liberties)).toEqual(['E6']);
  });
});

describe('suicide rule', () => {
  it('rejects filling your own last liberty', () => {
    const b = setup(9, [], ['D5', 'E4', 'E6', 'F5']);
    expect(b.checkLegality(p(9, 'E5'), BLACK)).toBe('suicide');
    const r = b.play(p(9, 'E5'), BLACK);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('suicide');
    expect(b.get(p(9, 'E5'))).toBe(0);
  });

  it('allows a capture even when the played point has no empty neighbour', () => {
    // Black A2, white A1/B2/C1: playing B1 captures A1 and gains A1 as a liberty.
    const b = setup(9, ['A2', 'C1'], ['A1', 'B2']);
    expect(labels(b, b.group(p(9, 'A1')).liberties)).toEqual(['B1']);
    expect(b.neighbours(p(9, 'B1')).every((n) => b.cells[n] !== 0)).toBe(true);
    const r = b.play(p(9, 'B1'), BLACK);
    expect(r.ok).toBe(true);
    expect(r.captured).toEqual([p(9, 'A1')]);
    // The captured point itself becomes a liberty of the capturing block.
    expect(b.group(p(9, 'B1')).liberties).toContain(p(9, 'A1'));
    expect(b.get(p(9, 'B1'))).toBe(BLACK);
  });

  it('lets the owner fill their own eye but not the opponent', () => {
    const black = setup(9, ['D4', 'E4', 'F4', 'D5', 'F5', 'D6', 'E6', 'F6'], []);
    // The point connects to black's own stones, so it is not suicide for black.
    expect(black.checkLegality(p(9, 'E5'), BLACK)).toBeNull();
    // For white it captures nothing and has no liberty → suicide.
    expect(black.checkLegality(p(9, 'E5'), WHITE)).toBe('suicide');
  });

  it('rejects occupied points', () => {
    const b = setup(9, ['E5'], []);
    expect(b.checkLegality(p(9, 'E5'), WHITE)).toBe('occupied');
  });
});

describe('ko rule', () => {
  it('forbids immediate recapture and allows it after a ko threat elsewhere', () => {
    const b = setup(9, ['B7', 'C6', 'C8'], ['C7', 'E7', 'D6', 'D8']);
    expect(labels(b, b.group(p(9, 'C7')).liberties)).toEqual(['D7']);
    const play = b.play(p(9, 'D7'), BLACK);
    expect(play.ok).toBe(true);
    expect(play.captured).toEqual([p(9, 'C7')]);
    expect(b.koPoint).toBe(p(9, 'C7'));
    expect(b.play(p(9, 'C7'), WHITE).reason).toBe('ko');
    expect(b.play(p(9, 'G7'), WHITE).ok).toBe(true);
    expect(b.play(p(9, 'G3'), BLACK).ok).toBe(true);
    expect(b.play(p(9, 'C7'), WHITE).ok).toBe(true);
  });

  it('never allows a board position to repeat (superko guard)', () => {
    const b = setup(9, ['B7', 'C6', 'C8'], ['C7', 'E7', 'D6', 'D8']);
    b.play(p(9, 'D7'), BLACK);
    b.play(p(9, 'G7'), WHITE);
    b.play(p(9, 'G3'), BLACK);
    b.play(p(9, 'C7'), WHITE); // recapture
    const again = b.play(p(9, 'D7'), BLACK);
    // Either the simple-ko point or the position-repetition check must reject it.
    expect(again.ok).toBe(false);
  });
});

describe('turn order, pass and game end', () => {
  it('alternates and ends after two passes', () => {
    const b = new GoBoard(9);
    expect(b.turn).toBe(BLACK);
    b.play(p(9, 'E5'));
    expect(b.turn).toBe(WHITE);
    b.pass();
    b.pass();
    expect(b.passes).toBe(2);
    expect(b.play(p(9, 'C3'), BLACK).ok).toBe(false);
    expect(b.play(p(9, 'C3'), BLACK).reason).toBe('game-over');
  });

  it('a move clears the pass count', () => {
    const b = new GoBoard(9);
    b.pass();
    b.play(p(9, 'E5'), BLACK);
    expect(b.passes).toBe(0);
  });
});

describe('undo', () => {
  it('restores captured stones and the turn', () => {
    const b = setup(9, ['D5', 'E4', 'E6'], ['E5']);
    b.play(p(9, 'F5'), BLACK);
    expect(b.get(p(9, 'E5'))).toBe(0);
    b.undo();
    expect(b.get(p(9, 'E5'))).toBe(WHITE);
    expect(b.get(p(9, 'F5'))).toBe(0);
    expect(b.captures.black).toBe(0);
    expect(b.turn).toBe(BLACK);
  });

  it('undoes back to the setup position, not to an empty board', () => {
    const b = setup(9, ['D4', 'E4'], ['D5']);
    b.play(p(9, 'E5'), BLACK);
    b.undo();
    expect(b.get(p(9, 'D4'))).toBe(BLACK);
    expect(b.get(p(9, 'D5'))).toBe(WHITE);
  });

  it('undoes passes too', () => {
    const b = new GoBoard(9);
    b.play(p(9, 'E5'));
    b.pass(WHITE);
    b.undo();
    expect(b.turn).toBe(WHITE);
    expect(b.passes).toBe(0);
  });
});

describe('scoring', () => {
  it('counts area for Chinese rules including komi', () => {
    const b = setup(9, ['A1', 'B1', 'A2'], ['B2']);
    const r = scoreBoard(b, 9, { komi: 7.5, ruleset: 'chinese' });
    expect(r.blackStones).toBe(3);
    expect(r.whiteStones).toBe(1);
    expect(r.white).toBe(r.whiteTerritory + 1 + 7.5);
  });

  it('awards a fully surrounded point to the surrounding colour', () => {
    const b = setup(9, ['C3', 'D3', 'E3', 'C4', 'E4', 'C5', 'D5', 'E5'], []);
    const r = scoreBoard(b, 9, { komi: 0, ruleset: 'chinese' });
    expect(r.blackTerritory).toBeGreaterThanOrEqual(1);
    expect(r.ownership[p(9, 'D4')]).toBe(BLACK);
    expect(r.winner).toBe(BLACK);
  });

  it('awards territory only when the border is one colour', () => {
    const b = setup(9, ['C3', 'D3'], ['D4', 'E4']);
    const r = scoreBoard(b, 9, { komi: 0, ruleset: 'chinese' });
    expect(r.ownership[p(9, 'E3')]).toBe(0);
    expect(r.neutral).toBeGreaterThan(0);
  });

  it('marks a fully enclosed dead group', () => {
    // Black box B2..E5; four white stones fill its inside with no eye space.
    const stones = [
      ...['B2', 'C2', 'D2', 'E2', 'B3', 'E3', 'B4', 'E4', 'B5', 'C5', 'D5', 'E5'].map((l) => ({
        ...coord(9, l),
        color: BLACK,
      })),
      ...['C3', 'D3', 'C4', 'D4'].map((l) => ({ ...coord(9, l), color: WHITE })),
    ];
    const b = GoBoard.fromSetup(9, stones, BLACK);
    expect(autoDetectDead(b).length).toBe(4);
  });

  it('does not flag a group that already has two eyes', () => {
    // Black ring split into two one-point eyes at C3 and E3.
    const stones = [
      ...['B2', 'C2', 'D2', 'E2', 'F2', 'B3', 'F3', 'B4', 'C4', 'D4', 'E4', 'F4', 'D3'].map((l) => ({
        ...coord(9, l),
        color: BLACK,
      })),
    ];
    const b = GoBoard.fromSetup(9, stones, WHITE);
    expect(autoDetectDead(b)).toEqual([]);
  });

  it('does not mark a living two-eyed group as dead', () => {
    // Black group with two eyes at C3 and E3.
    const b = setup(
      9,
      ['B2', 'C2', 'D2', 'E2', 'F2', 'B3', 'D3', 'F3', 'B4', 'C4', 'D4', 'E4', 'F4'],
      [],
    );
    expect(autoDetectDead(b)).toEqual([]);
  });

  it('uses captures under Japanese rules', () => {
    const b = setup(9, ['A1', 'B1', 'A2'], ['B2']);
    b.captures.black = 4;
    const jp = scoreBoard(b, 9, { komi: 6.5, ruleset: 'japanese' });
    const cn = scoreBoard(b, 9, { komi: 7.5, ruleset: 'chinese' });
    expect(jp.method).toBe('japanese');
    expect(cn.black).toBe(cn.blackStones + cn.blackTerritory);
    expect(jp.black).toBe(4 + jp.blackTerritory);
  });
});

describe('AI', () => {
  it('always returns a legal move on a fresh board', () => {
    for (const d of [1, 2, 3, 4, 5] as const) {
      const b = new GoBoard(9);
      const ai = new GoAI(d, 42);
      const move = ai.choose(b, BLACK);
      expect(move).toBeGreaterThanOrEqual(0);
      expect(b.cells[move]).toBe(0);
      expect(b.checkLegality(move, BLACK)).toBeNull();
    }
  });

  it('captures when a capture is available, at every level above beginner', () => {
    for (const d of [2, 3, 4, 5] as const) {
      const b = setup(9, ['D5', 'F5', 'E4'], ['E5']);
      const ai = new GoAI(d, 7);
      expect(ai.choose(b, BLACK)).toBe(p(9, 'E6'));
    }
  });

  it('never plays an occupied point in a random game', () => {
    const b = new GoBoard(9);
    const ai1 = new GoAI(3, 11);
    for (let i = 0; i < 60; i++) {
      if (b.passes >= 2) break;
      const mv = ai1.choose(b, b.turn);
      if (mv < 0) b.pass();
      else {
        expect(b.cells[mv]).toBe(0);
        expect(b.play(mv).ok).toBe(true);
      }
    }
  });
});
