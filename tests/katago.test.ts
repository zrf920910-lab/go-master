import { describe, expect, it } from 'vitest';
import { parseKataAnalyze, encodeBoardForKataGo, KataGoProvider } from '../src/ai/katago';
import { GoBoard } from '../src/engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../src/engine/GoBoard/types';
import { parseCoord } from '../src/engine/GoBoard/coordinates';

const p = (label: string) => parseCoord(9, label)!;

// Captured from KataGo's documented output format (GTP_Extensions.md).
const SAMPLE = [
  'info move E4 visits 487 utility -0.0408357 winrate 0.480018 scoreMean -0.611848 scoreLead -0.611848 scoreSelfplay -0.515178 prior 0.221121 lcb 0.477221 utilityLcb -0.0486664 order 0 pv E4 E3 F3 D3',
  'info move P16 visits 470 utility -0.0414945 winrate 0.479712 scoreLead -0.63075 prior 0.220566 order 1 pv P16 P17 O17',
  'info move E16 visits 143 utility -0.0534071 winrate 0.474509 scoreLead -0.729858 prior 0.20 order 2 pv E16',
].join('\n');

describe('KataGo GTP analyze parsing', () => {
  it('parses move, visits, winrate, scoreLead, order and pv', () => {
    const parsed = parseKataAnalyze(SAMPLE);
    expect(parsed.length).toBe(3);
    expect(parsed[0]).toMatchObject({ move: 'E4', visits: 487, order: 0 });
    expect(parsed[0].winrate).toBeCloseTo(0.480018, 5);
    expect(parsed[0].scoreLead).toBeCloseTo(-0.611848, 5);
    expect(parsed[0].pv).toEqual(['E4', 'E3', 'F3', 'D3']);
    expect(parsed[2].move).toBe('E16');
  });

  it('ignores lines that are not analysis output', () => {
    const parsed = parseKataAnalyze('= \n\ninfo move D4 visits 10 winrate 0.5\nunrelated line');
    expect(parsed.length).toBe(1);
    expect(parsed[0].move).toBe('D4');
  });

  it('handles an empty payload', () => {
    expect(parseKataAnalyze('')).toEqual([]);
  });
});

describe('KataGo board encoding', () => {
  it('emits GTP coordinates with the row counted from the bottom', () => {
    const board = new GoBoard(9);
    board.play(p('E5'), BLACK);
    board.play(p('C3'), WHITE);
    const encoded = encodeBoardForKataGo(board, 6.5) as {
      moves: Array<[string, string]>;
      boardXSize: number;
    };
    expect(encoded.boardXSize).toBe(9);
    // The app's "C3" is already row-counted from the bottom, and so is GTP's,
    // so the label round-trips unchanged.
    expect(encoded.moves).toEqual([
      ['B', 'E5'],
      ['W', 'C3'],
    ]);
  });

  it('omits passes from the move list', () => {
    const board = new GoBoard(9);
    board.play(p('E5'), BLACK);
    board.pass(WHITE);
    board.play(p('C3'), BLACK);
    const encoded = encodeBoardForKataGo(board, 0) as { moves: Array<[string, string]> };
    expect(encoded.moves.length).toBe(2);
  });
});

describe('KataGo provider honesty', () => {
  it('reports itself as remote and needing a network', () => {
    const provider = new KataGoProvider({ transport: 'analysis', endpoint: 'https://example.test/katago' });
    const cap = provider.describe();
    expect(cap.where).toBe('远程');
    expect(cap.needsNetwork).toBe(true);
    expect(cap.caveats.join(' ')).toContain('自建');
  });

  it('health check fails clearly when the endpoint is unreachable', async () => {
    const provider = new KataGoProvider({ transport: 'analysis', endpoint: 'http://127.0.0.1:9/katago' });
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(typeof health.detail).toBe('string');
  });

  it('reports a missing endpoint instead of pretending to work', async () => {
    const provider = new KataGoProvider({ transport: 'gtp', endpoint: '' });
    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.detail).toContain('未配置');
  });
});
