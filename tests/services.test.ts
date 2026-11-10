import { describe, expect, it } from 'vitest';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { scoreBoard, autoDetectDead, describeScore } from '../src/engine/Scoring/scoring';
import { toSGF, parseSGF, validateRecord, recordFromSGF } from '../src/services/sgf/sgf';
import { positionsFromRecord } from '../src/services/sgf/record';
import type { GameRecord } from '../src/app/types';
import { GoAI } from '../src/engine/AI/GoAI';
import { parseDiagram, boardFromSpec, boardToDiagram } from '../src/learning/Exercises/position';
import { analyzeLife, eyeSpace } from '../src/engine/Rules/lifeDeath';
import { parseCoord } from '../src/engine/GoBoard/coordinates';

const p = (size: number, label: string) => {
  const i = parseCoord(size, label);
  if (i < 0) throw new Error(`bad coord ${label}`);
  return i;
};

// A white ring (B2..F2, B3/F3, B4..F4) sealed inside a black wall.
const RING = ['B2', 'C2', 'D2', 'E2', 'F2', 'B3', 'F3', 'B4', 'C4', 'D4', 'E4', 'F4'];
const WALL = [
  'A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1',
  'A2', 'G2', 'A3', 'G3', 'A4', 'G4',
  'A5', 'B5', 'C5', 'D5', 'E5', 'F5', 'G5',
];
const ring = (extra: string[] = []) =>
  GoBoard.fromSetup(
    9,
    [
      ...WALL.map((l) => ({ ...coord(9, l), color: BLACK })),
      ...[...RING, ...extra].map((l) => ({ ...coord(9, l), color: WHITE })),
    ],
    BLACK,
  );

function coord(size: number, label: string) {
  const i = p(size, label);
  return { x: i % size, y: Math.floor(i / size) };
}


describe('diagram parsing', () => {
  it('round-trips a board through pictures', () => {
    const spec = {
      size: 9,
      diagram: [
        '. . . . . . . . .',
        '. X . . . . . . .',
        '. . O . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
        '. . . . . . . . .',
      ],
      turn: 1 as const,
    };
    const board = boardFromSpec(spec);
    expect(board.get(p(9, 'B8'))).toBe(BLACK);
    expect(board.get(p(9, 'C7'))).toBe(WHITE);
    expect(boardToDiagram(board)).toEqual(spec.diagram);
  });

  it('reports unknown tokens instead of silently dropping them', () => {
    const { errors } = parseDiagram(9, ['Z . . . . . . . .']);
    expect(errors.length).toBe(1);
  });
});

describe('life and death solver', () => {
  it('sees three points of eye space as one region', () => {
    const b = ring();
    const g = b.group(p(9, 'B3'));
    expect(eyeSpace(b, g.stones).map((i) => `${'ABCDEFGHJ'[i % 9]}${9 - Math.floor(i / 9)}`).sort()).toEqual([
      'C3',
      'D3',
      'E3',
    ]);
    const life = analyzeLife(b, p(9, 'B3'), { depth: 7 });
    expect(life.alive).toBe(false);
  });

  it('sees a split ring as alive', () => {
    const b = ring(['D3']);
    expect(analyzeLife(b, p(9, 'B3'), { depth: 6 }).alive).toBe(true);
  });
});

describe('scoring', () => {
  it('does not mark a normal group dead', () => {
    const b = new GoBoard(9);
    for (const l of ['C3', 'D3', 'C4', 'D4', 'G7']) b.set(p(9, l), l.startsWith('G') ? WHITE : BLACK);
    expect(autoDetectDead(b)).toEqual([]);
  });

  it('scores an enclosed dead group as dead', () => {
    const b = ring();
    // Black plays the vital point of the straight three: the white ring dies.
    const probe = b.clone();
    probe.play(p(9, 'D3'), BLACK);
    expect(autoDetectDead(probe).length).toBeGreaterThan(0);
  });

  it('uses komi and reports a human readable result', () => {
    const b = new GoBoard(9);
    const r = scoreBoard(b, 9, { komi: 7.5, ruleset: 'chinese' });
    expect(r.winner).toBe(WHITE);
    expect(describeScore(r)).toContain('白棋胜');
  });
});

describe('SGF', () => {
  const record: GameRecord = {
    id: 'g1',
    size: 9,
    black: '小明',
    white: '电脑',
    moves: [
      { at: 'E5', color: BLACK },
      { at: 'C3', color: WHITE },
      { at: '', color: BLACK, pass: true },
      { at: 'G7', color: WHITE },
    ],
    result: '黑胜 3 目',
    komi: 6.5,
    ruleset: 'chinese',
    startedAt: Date.UTC(2024, 0, 2),
    mode: 'battle',
  };

  it('exports and reimports a game losslessly', () => {
    const sgf = toSGF(record);
    expect(sgf).toContain('SZ[9]');
    expect(sgf).toContain('PB[小明]');
    const parsed = parseSGF(sgf);
    expect(parsed.size).toBe(9);
    expect(parsed.black).toBe('小明');
    expect(parsed.white).toBe('电脑');
    expect(parsed.moves.length).toBe(4);
    expect(parsed.moves[0]).toMatchObject({ at: 'E5', color: BLACK });
    expect(parsed.moves[2].pass).toBe(true);
    expect(parsed.moves[3].at).toBe('G7');
    const rebuilt = recordFromSGF(parsed, 'g2');
    expect(validateRecord(rebuilt).ok).toBe(true);
  });

  it('rejects an SGF whose moves are illegal', () => {
    const bad = recordFromSGF(
      { size: 9, komi: 6.5, black: 'a', white: 'b', moves: [
        { at: 'E5', color: BLACK },
        { at: 'E5', color: WHITE },
      ], comments: [] },
      'g3',
    );
    expect(validateRecord(bad).ok).toBe(false);
  });

  it('replays a record into board positions', () => {
    const boards = positionsFromRecord(record);
    expect(boards.length).toBe(record.moves.length + 1);
    expect(boards[1].get(p(9, 'E5'))).toBe(BLACK);
    expect(boards[4].get(p(9, 'G7'))).toBe(WHITE);
  });

  it('parses a hand-written SGF with comments', () => {
    const parsed = parseSGF('(;GM[1]FF[4]SZ[9]KM[7.5]PB[甲]PW[乙];B[ee]C[你好];W[cc])');
    expect(parsed.moves.length).toBe(2);
    expect(parsed.moves[0].comment).toBe('你好');
    expect(parsed.moves[0].at).toBe('E5');
  });
});

describe('AI behaviour', () => {
  it('plays a full 9x9 game without illegal moves and reaches a scoreable position', () => {
    const board = new GoBoard(9);
    const ai = new GoAI(3, 99);
    let guard = 0;
    while (board.passes < 2 && guard++ < 300) {
      const mv = ai.choose(board, board.turn);
      if (mv < 0) {
        board.pass();
        continue;
      }
      expect(board.cells[mv]).toBe(0);
      const res = board.play(mv);
      expect(res.ok).toBe(true);
    }
    expect(board.moveNumber).toBeGreaterThan(10);
    const score = scoreBoard(board, 9, { komi: 6.5, ruleset: 'chinese' });
    expect(score.black + score.white).toBeGreaterThan(0);
  });
});
