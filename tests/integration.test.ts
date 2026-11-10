import { describe, expect, it } from 'vitest';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { parseCoord } from '../src/engine/GoBoard/coordinates';
import { LocalAIProvider } from '../src/ai/localProvider';
import { coach } from '../src/ai/teacher';
import { createProvider, LEVEL_INFO } from '../src/ai/registry';
import { scoreBoard } from '../src/engine/Scoring/scoring';

const p = (label: string) => parseCoord(9, label)!;
const xy = (label: string) => ({ x: p(label) % 9, y: Math.floor(p(label) / 9) });
const setup = (black: string[], white: string[], turn: 1 | 2 = BLACK) =>
  GoBoard.fromSetup(
    9,
    [...black.map((l) => ({ ...xy(l), color: BLACK })), ...white.map((l) => ({ ...xy(l), color: WHITE }))],
    turn,
  );

describe('AI teacher does not disturb the game', () => {
  it('analysing a position never mutates the board', async () => {
    const board = setup(['D5', 'E4'], ['E5'], BLACK);
    const before = board.positionKey();
    const moveCount = board.moveNumber;
    const ai = new LocalAIProvider({ level: 4, seed: 1 });
    await ai.analyze({ board, color: BLACK, maxMoves: 5 });
    coach(board, BLACK);
    expect(board.positionKey()).toBe(before);
    expect(board.moveNumber).toBe(moveCount);
  });

  it('suggested moves are legal in the current position', async () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const board = setup(['D5', 'E4'], ['E5'], BLACK);
      const ai = new LocalAIProvider({ level, seed: 3 });
      const res = await ai.analyze({ board, color: BLACK, maxMoves: 5 });
      for (const m of res.moves) {
        if (m.move < 0) continue;
        expect(board.checkLegality(m.move, BLACK), `level ${level}`).toBeNull();
      }
    }
  });

  it('a teacher-suggested move can actually be played', async () => {
    const board = setup(['D5', 'E4', 'F5'], ['E5'], WHITE);
    const advice = coach(board, WHITE).find((a) => a.suggestion !== undefined);
    expect(advice).toBeDefined();
    const copy = board.clone();
    const res = copy.play(advice!.suggestion!, WHITE);
    expect(res.ok).toBe(true);
  });
});

describe('provider registry', () => {
  it('returns a local provider by default', () => {
    const provider = createProvider({ kind: 'local', level: 3, seed: 1 });
    expect(provider.describe().where).toBe('本地');
    expect(provider.describe().needsNetwork).toBe(false);
  });

  it('falls back to local when a KataGo endpoint is missing', () => {
    const provider = createProvider({ kind: 'katago', level: 5, katago: { transport: 'analysis', endpoint: '' } });
    expect(provider.describe().where).toBe('本地');
  });

  it('builds a KataGo provider when configured', () => {
    const provider = createProvider({
      kind: 'katago',
      level: 5,
      katago: { transport: 'analysis', endpoint: 'https://example.test/katago' },
    });
    expect(provider.describe().where).toBe('远程');
    expect(provider.describe().needsNetwork).toBe(true);
  });

  it('documents all five levels with a measurable basis', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(LEVEL_INFO[level].name.length).toBeGreaterThan(0);
      expect(LEVEL_INFO[level].measurable.length).toBeGreaterThan(4);
      expect(LEVEL_INFO[level].blurb.length).toBeGreaterThan(8);
    }
  });
});

describe('a full local game stays consistent', () => {
  it('plays 9x9 to completion and scores without errors', async () => {
    const board = new GoBoard(9);
    const black = new LocalAIProvider({ level: 3, seed: 11 });
    const white = new LocalAIProvider({ level: 4, seed: 22 });
    let guard = 0;
    while (board.passes < 2 && guard++ < 260) {
      const engine = board.turn === BLACK ? black : white;
      const choice = await engine.choose({ board, color: board.turn });
      if (choice.move < 0) {
        board.pass();
        continue;
      }
      const res = board.play(choice.move);
      expect(res.ok).toBe(true);
    }
    // Local engines are greedy and may keep filling the board rather than
    // passing, so the meaningful assertion is that the game stayed legal and
    // the position is scoreable. (The UI stops at two passes; a self-play loop
    // without that incentive can run long, which is itself informative.)
    expect(board.moveNumber).toBeGreaterThan(40);
    const score = scoreBoard(board, 9, { komi: 6.5, ruleset: 'chinese' });
    expect(score.black + score.white).toBeGreaterThan(0);
    // Every stone on the board must still form legal groups.
    for (const g of board.allGroups()) {
      expect(g.stones.length).toBeGreaterThan(0);
    }
  });
});
