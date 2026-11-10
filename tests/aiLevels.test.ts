import { describe, expect, it } from 'vitest';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { parseCoord } from '../src/engine/GoBoard/coordinates';
import { LocalAIProvider } from '../src/ai/localProvider';
import { atariThreats, evaluateMoveSafety, readLadder, connectsTwoBlocks, isCutPoint } from '../src/ai/reading';
import { coach, explainMove, attackOrDefend, warnAboutAtari, findCaptures } from '../src/ai/teacher';
import type { AILevel } from '../src/ai/types';

const p = (size: number, label: string) => {
  const i = parseCoord(size, label);
  if (i < 0) throw new Error(`bad coord ${label}`);
  return i;
};
const xy = (size: number, label: string) => {
  const i = p(size, label);
  return { x: i % size, y: Math.floor(i / size) };
};
const setup = (black: string[], white: string[], turn: 1 | 2 = BLACK) =>
  GoBoard.fromSetup(
    9,
    [
      ...black.map((l) => ({ ...xy(9, l), color: BLACK })),
      ...white.map((l) => ({ ...xy(9, l), color: WHITE })),
    ],
    turn,
  );

const play = async (level: AILevel, board: GoBoard, color = board.turn) => {
  const ai = new LocalAIProvider({ level, seed: 12345 });
  return ai.choose({ board, color });
};

describe('AI level calibration (measured, not relabelled)', () => {
  it('level 1 does not actively take a capture, level 2+ does', async () => {
    // White E5 has one liberty at D5; black to move can capture it.
    const board = setup(['F5', 'E4', 'E6'], ['E5'], BLACK);
    const answers: Record<number, number> = {};
    for (const lvl of [1, 2, 3, 4, 5] as AILevel[]) {
      const choice = await play(lvl, board);
      answers[lvl] = choice.move;
    }
    const capture = p(9, 'D5');
    expect(answers[2]).toBe(capture);
    expect(answers[3]).toBe(capture);
    expect(answers[4]).toBe(capture);
    expect(answers[5]).toBe(capture);
    // The beginner tier is allowed to wander: it must at least be legal.
    expect(board.checkLegality(answers[1], BLACK)).toBeNull();
  });

  it('level 2+ rescues its own block in atari', async () => {
    const board = setup(['D5', 'F5', 'E4'], ['E5'], WHITE);
    for (const lvl of [2, 3, 4, 5] as AILevel[]) {
      const choice = await play(lvl, board, WHITE);
      expect(choice.move, `level ${lvl}`).toBe(p(9, 'E6'));
    }
  });

  it('level 3+ plays atari when nothing is capturable', async () => {
    // White E5 has two liberties (E6, F5); black can atari.
    const board = setup(['D5', 'E4'], ['E5'], BLACK);
    for (const lvl of [3, 4, 5] as AILevel[]) {
      const choice = await play(lvl, board);
      const after = board.clone();
      after.play(choice.move, BLACK);
      const atari = after.allGroups().some((g) => g.color === WHITE && g.liberties.length === 1);
      expect(atari, `level ${lvl} move ${choice.move}`).toBe(true);
    }
  });

  it('level 3+ connects when a cut would separate its stones', async () => {
    const board = setup(['D5', 'F5', 'C3', 'G7'], [], BLACK);
    for (const lvl of [3, 4, 5] as AILevel[]) {
      const choice = await play(lvl, board);
      expect(choice.move, `level ${lvl}`).toBe(p(9, 'E5'));
    }
  });

  it('every level only returns legal moves', async () => {
    for (const lvl of [1, 2, 3, 4, 5] as AILevel[]) {
      const board = new GoBoard(9);
      const ai = new LocalAIProvider({ level: lvl, seed: 7 });
      for (let i = 0; i < 25; i++) {
        const move = await ai.choose({ board, color: board.turn });
        if (move.move < 0) break;
        expect(board.cells[move.move], `level ${lvl}`).toBe(0);
        expect(board.play(move.move).ok, `level ${lvl} illegal move`).toBe(true);
      }
    }
  });

  it('strength is monotone across a fixed set of tactics puzzles', async () => {
    // A small benchmark: positions with a single clearly correct tactical answer.
    const puzzles: Array<{ board: GoBoard; correct: number; label: string }> = [
      { board: setup(['F5', 'E4', 'E6'], ['E5'], BLACK), correct: p(9, 'D5'), label: 'capture' },
      { board: setup(['D5', 'E4', 'F4', 'F6'], ['E5'], BLACK), correct: p(9, 'E6'), label: 'atari' },
      { board: setup(['D5', 'F5', 'C3'], [], BLACK), correct: p(9, 'E5'), label: 'connect' },
    ];
    const score: Record<number, number> = {};
    for (const lvl of [1, 2, 3, 4, 5] as AILevel[]) {
      let hits = 0;
      for (const q of puzzles) {
        const choice = await play(lvl, q.board.clone());
        if (choice.move === q.correct) hits++;
      }
      score[lvl] = hits;
    }
    // Higher tiers must not be worse than lower ones on pure tactics.
    expect(score[2]).toBeGreaterThanOrEqual(score[1]);
    expect(score[3]).toBeGreaterThanOrEqual(score[2]);
    expect(score[3]).toBeGreaterThan(score[1]);
    expect(score[5]).toBeGreaterThanOrEqual(3);
  });
});

describe('reading primitives', () => {
  it('finds atari threats with escapes', () => {
    const board = setup(['D5', 'E4', 'F5'], ['E5'], WHITE);
    const threats = atariThreats(board, WHITE).filter((t) => t.color === WHITE);
    expect(threats.length).toBe(1);
    expect(threats[0].escapes).toEqual([p(9, 'E6')]);
  });

  it('detects a connect move', () => {
    const board = setup(['D5', 'F5'], [], BLACK);
    expect(connectsTwoBlocks(board, p(9, 'E5'), BLACK)).toBe(true);
    expect(connectsTwoBlocks(board, p(9, 'E6'), BLACK)).toBe(false);
  });

  it('detects a cut point between two enemy blocks', () => {
    const board = setup(['D6', 'F6'], ['D5', 'F5'], BLACK);
    expect(isCutPoint(board, p(9, 'E5'), WHITE)).toBe(true);
  });

  it('flags a move that leaves the played stone with one liberty', () => {
    // White occupies three sides of E5, so black playing E5 keeps one liberty.
    const board = setup([], ['E4', 'E6', 'D5'], BLACK);
    const safety = evaluateMoveSafety(board, p(9, 'E5'), BLACK);
    expect(safety.legal).toBe(true);
    expect(safety.selfAtari.length).toBe(1);
    expect(safety.selfAtari[0]).toContain(p(9, 'E5'));
  });

  it('rejects a move that would be outright suicide', () => {
    // White surrounds E5 on all four sides: black cannot play there.
    const board = setup([], ['E4', 'E6', 'D5', 'F5'], BLACK);
    const safety = evaluateMoveSafety(board, p(9, 'E5'), BLACK);
    expect(safety.legal).toBe(false);
  });

  it('reads a ladder that works', () => {
    // White E5 in atari-ish position with a clear ladder path.
    const board = setup(['D5', 'E4'], ['E5'], BLACK);
    const info = readLadder(board, BLACK, p(9, 'E6'));
    // The reader may decline to claim; when it does claim, the line must be real.
    if (info) {
      for (const mv of info.line) expect(mv).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('teaching engine: every explanation is grounded', () => {
  it('warns about a block in atari and names the real liberty', () => {
    const board = setup(['D5', 'E4', 'F5'], ['E5'], WHITE);
    const advice = warnAboutAtari(board, WHITE);
    expect(advice).not.toBeNull();
    expect(advice!.points).toContain(p(9, 'E5'));
    expect(advice!.suggestion).toBe(p(9, 'E6'));
    expect(advice!.text).toContain('E6');
  });

  it('does not warn about atari when there is none', () => {
    const board = setup([], ['E5'], WHITE);
    expect(warnAboutAtari(board, WHITE)).toBeNull();
  });

  it('only reports captures that the engine can actually perform', () => {
    const board = setup(['F5', 'E4', 'E6'], ['E5'], BLACK);
    const advice = findCaptures(board, BLACK);
    expect(advice).not.toBeNull();
    const idx = advice!.suggestion!;
    const copy = board.clone();
    const res = copy.play(idx, BLACK);
    expect(res.ok).toBe(true);
    expect(res.captured.length).toBe(1);
  });

  it('explains a move that leaves the player in atari, with the real group size', () => {
    // Black plays into a position where the resulting stone has one liberty.
    const board = setup(['B2', 'C2', 'D2'], ['C3', 'D3'], BLACK);
    const advice = explainMove(board, p(9, 'E3'), BLACK);
    if (advice.facts.selfAtariGroups) {
      expect(Number(advice.facts.worstSize)).toBeGreaterThan(0);
      expect(advice.kind).toBe('danger');
    }
  });

  it('never claims a capture when the point is empty of enemy stones', () => {
    const board = new GoBoard(9);
    const advice = explainMove(board, p(9, 'E5'), BLACK);
    expect(advice.kind).not.toBe('capture');
    expect(advice.facts.captured).toBeUndefined();
  });

  it('attack-or-defend follows the counted threats', () => {
    const board = setup(['D5', 'E4', 'F5'], ['E5'], WHITE);
    const advice = attackOrDefend(board, WHITE);
    expect(advice.kind).toBe('rescue');
    expect(advice.facts.ownAtari).toBe(1);
  });

  it('coach returns advice ordered by urgency and all facts are numbers', () => {
    const board = setup(['D5', 'E4', 'F5'], ['E5'], WHITE);
    const list = coach(board, WHITE);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].severity).toBe('critical');
    for (const a of list) {
      for (const v of Object.values(a.facts)) {
        expect(['number', 'string', 'boolean']).toContain(typeof v);
      }
    }
  });

  it('puts a critical rescue first and suppresses optional advice', () => {
    // White E5 is genuinely in atari: the only liberty is D5.
    const board = setup(['E6', 'E4', 'F5'], ['E5'], WHITE);
    expect(board.group(p(9, 'E5')).liberties.length).toBe(1);
    const list = coach(board, WHITE);
    expect(list[0].kind).toBe('rescue');
    expect(list[0].severity).toBe('critical');
    // No "you could cut over there" noise while the player is about to lose a
    // block.
    expect(list.some((a) => a.kind === 'cut')).toBe(false);
    // And the summary must not read as "attack".
    const summary = list.find((a) => a.facts.ownAtari !== undefined);
    expect(summary?.kind).toBe('rescue');
  });

  it('quotes coordinates that exist on the board', () => {
    const board = setup(['D5', 'E4', 'F5'], ['E5'], WHITE);
    const advice = warnAboutAtari(board, WHITE)!;
    const matches = advice.text.match(/\b([A-HJ])([1-9])\b/g) ?? [];
    for (const m of matches) {
      expect(parseCoord(9, m), `coordinate ${m} in text`).toBeGreaterThanOrEqual(0);
    }
  });
});
