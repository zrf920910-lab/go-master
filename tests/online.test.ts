import { describe, expect, it } from 'vitest';
import { boardFromOgsGame, EMPTY_ONLINE_STATE } from '../src/online/onlineSession';
import { packedToIndex, indexToPacked, coordsToGtp, gtpToIndex, type OgsGameData } from '../src/online/ogsSocket';
import { randomVerifier, challengeFor } from '../src/online/ogsAuth';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';

const gamedata = (moves: Array<[number, number]>): OgsGameData => ({
  game_id: 1234,
  width: 9,
  height: 9,
  komi: 6.5,
  black: { id: 11, username: 'Alice' },
  white: { id: 22, username: 'Bob' },
  moves,
  phase: 'play',
  player_to_move: 22,
});

describe('OGS coordinate conversion', () => {
  it('maps packed (x, y) to a board index with y from the top', () => {
    // (4,4) on a 9x9 board is the centre point E5.
    expect(packedToIndex([4, 4], 9)).toBe(4 * 9 + 4);
    expect(packedToIndex([0, 0], 9)).toBe(0);
  });

  it('treats negative coordinates as a pass', () => {
    expect(packedToIndex([-1, -1], 9)).toBe(-1);
  });

  it('round-trips index ↔ packed', () => {
    for (const i of [0, 5, 40, 80]) {
      const [x, y] = indexToPacked(i, 9);
      expect(packedToIndex([x, y], 9)).toBe(i);
    }
    expect(indexToPacked(-1, 9)).toEqual([-1, -1]);
  });

  it('uses GTP-style lowercase move strings', () => {
    expect(coordsToGtp(3, 3)).toBe('dd');
    expect(coordsToGtp(0, 0)).toBe('aa');
    // "dd" = x 3, y 3 → index 3 * 9 + 3, the fourth column of the fourth row
    // counted from the top (which is the point D6 on a 9x9 board).
    expect(gtpToIndex('dd', 9)).toBe(3 * 9 + 3);
    expect(coordsToGtp(3, 3)).toBe('dd');
    expect(gtpToIndex('', 9)).toBe(-1);
    expect(gtpToIndex('zz', 9)).toBe(-1);
  });
});

describe('online game reconstruction', () => {
  it('rebuilds the board from the server move list', () => {
    const { board, lastMove } = boardFromOgsGame(gamedata([[4, 4], [2, 6]]));
    expect(board.size).toBe(9);
    expect(board.moveNumber).toBe(2);
    expect(board.cells[4 * 9 + 4]).toBe(BLACK);
    expect(board.cells[6 * 9 + 2]).toBe(WHITE);
    expect(lastMove).toBe(6 * 9 + 2);
  });

  it('handles a pass in the move list', () => {
    const { board, lastMove } = boardFromOgsGame(gamedata([[4, 4], [-1, -1], [2, 2]]));
    expect(board.moveNumber).toBe(3);
    expect(board.cells[4 * 9 + 4]).toBe(BLACK);
    // After a pass it is black again, so the third move is black.
    expect(board.cells[2 * 9 + 2]).toBe(BLACK);
    expect(lastMove).toBe(2 * 9 + 2);
  });

  it('rejects a corrupt move list instead of showing a wrong board', () => {
    // The same point played twice is impossible.
    expect(() => boardFromOgsGame(gamedata([[4, 4], [4, 4]]))).toThrow();
  });

  it('starts with a clean, isolated state', () => {
    expect(EMPTY_ONLINE_STATE.board).toBeNull();
    expect(EMPTY_ONLINE_STATE.status).toBe('idle');
    expect(EMPTY_ONLINE_STATE.myColor).toBeNull();
  });
});

describe('PKCE helpers', () => {
  it('generates a verifier in the RFC 7636 charset and length', () => {
    const v = randomVerifier(64);
    expect(v.length).toBe(64);
    expect(/^[A-Za-z0-9\-._~]+$/.test(v)).toBe(true);
  });

  it('produces a base64url SHA-256 challenge', async () => {
    const challenge = await challengeFor('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge.length).toBe(43); // 32 bytes → 43 base64url chars
    // Deterministic for the same verifier.
    expect(await challengeFor('abcdefghijklmnopqrstuvwxyz0123456789')).toBe(challenge);
  });
});
