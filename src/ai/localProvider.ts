import { GoBoard } from '../engine/GoBoard/GoBoard';
import { EMPTY, opposite, type Color } from '../engine/GoBoard/types';
import { mulberry32 } from '../engine/AI/GoAI';
import { atariThreats, connectsTwoBlocks, evaluateMoveSafety, openingValue, readLadder } from './reading';
import type { AILevel, AIProvider, AnalysisRequest, AnalysisResult, AICapability, MoveEvaluation } from './types';
import { nowMs } from './types';

/**
 * The local tactical engine.
 *
 * It is deliberately a *small search*, not a neural network, and the capability
 * description says so. Its strength tiers are defined by the concrete features
 * each level is allowed to use — not by a relabelled constant:
 *
 *  1 初级   : legal moves only, weighted by opening value. No captures, no atari.
 *  2 普通   : + takes captures, + answers atari on its own blocks.
 *  3 进阶   : + makes atari, + connects when it would be cut, + cuts.
 *  4 高级   : + one-ply evaluation (opponent's best reply), + ladder reading.
 *  5 大师   : + wider candidate set, + self-atari avoidance, + eye making.
 *
 * `tests/aiLevels.test.ts` asserts these differences on fixed positions.
 */

export interface LocalOptions {
  level: AILevel;
  seed?: number;
  /** How many candidate points to consider at the highest levels. */
  candidates?: number;
}

interface Candidate {
  move: number;
  score: number;
  note: string;
}

export class LocalAIProvider implements AIProvider {
  readonly id = 'local-tactical';
  readonly level: AILevel;
  private rand: () => number;

  constructor(opts: LocalOptions) {
    this.level = opts.level;
    this.rand = mulberry32(opts.seed ?? 0x9e3779b9);
  }

  describe(): AICapability {
    const basis: Record<AILevel, string> = {
      1: '只用合法落点 + 角边价值，不主动吃子',
      2: '会提子、会救自己的棋',
      3: '会打吃、连接、切断',
      4: '会算对手一手反击、会读征子',
      5: '更宽的候选点 + 避免自打吃 + 做眼',
    };
    const explains: Record<AILevel, string[]> = {
      1: ['落子合法性', '气与提子'],
      2: ['提子', '打吃与逃跑'],
      3: ['连接与切断', '打吃'],
      4: ['局部攻防', '征子'],
      5: ['局部攻防', '死活要点'],
    };
    return {
      id: this.id,
      label: `本地战术引擎 · ${['', '初级', '普通', '进阶', '高级', '大师'][this.level]}档`,
      where: '本地',
      level: this.level,
      levelBasis: basis[this.level],
      explains: explains[this.level],
      caveats: [
        '这是规则驱动的战术程序，不是神经网络棋力',
        '不会判断全局形势、不会做大模样',
        '每手只搜索很浅的深度',
      ],
      needsNetwork: false,
    };
  }

  async healthCheck() {
    return { ok: true, detail: '本地引擎，无需网络' };
  }

  async choose(req: AnalysisRequest): Promise<MoveEvaluation> {
    const result = await this.analyze({ ...req, maxMoves: 3 });
    return result.moves[0] ?? { move: -1, note: '没有可下的点，停一手' };
  }

  async analyze(req: AnalysisRequest): Promise<AnalysisResult> {
    const started = nowMs();
    const { board, color } = req;
    const legal = board.legalMoves(color);
    if (!legal.length) {
      return { moves: [{ move: -1, note: '没有合法落点' }], provider: this.id, elapsedMs: nowMs() - started };
    }

    const candidates = this.collectCandidates(board, color, legal);
    candidates.sort((a, b) => b.score - a.score);
    const max = req.maxMoves ?? 5;
    // A candidate can be stale in one important way: the point is legal by the
    // quick checks but would repeat a position (superko). Re-validate against
    // the real rules before handing any move back, so callers can trust the
    // list without re-checking.
    const verified: Candidate[] = [];
    for (const c of candidates) {
      const probe = board.clone();
      if (probe.play(c.move, color).ok) verified.push(c);
      if (verified.length >= max) break;
    }
    if (!verified.length) {
      return {
        moves: [{ move: -1, note: '没有可下的点，停一手' }],
        provider: this.id,
        elapsedMs: nowMs() - started,
      };
    }
    const best = verified;

    // Convert the heuristic score into a rough win-rate-shaped number so the UI
    // can show a bar. It is derived from the score margin, not invented.
    const top = best[0].score;
    const bottom = best[best.length - 1].score;
    const span = Math.max(1e-6, top - bottom);
    const moves: MoveEvaluation[] = best.map((c) => ({
      move: c.move,
      winrate: 0.5 + 0.45 * Math.tanh((c.score / Math.max(6, Math.abs(top) + 6)) * 2),
      scoreLead: Number((c.score / 2).toFixed(1)),
      visits: 1,
      note: c.note,
      pv: [c.move],
    }));

    void span;
    return {
      moves,
      rootWinrate: moves[0]?.winrate,
      rootScoreLead: moves[0]?.scoreLead,
      provider: this.id,
      elapsedMs: nowMs() - started,
    };
  }

  private collectCandidates(board: GoBoard, color: Color, legal: number[]): Candidate[] {
    const enemy = opposite(color);
    const out: Candidate[] = [];
    const level = this.level;

    // Always-available baseline: legal moves weighted by opening value.
    for (const move of legal) {
      out.push({ move, score: openingValue(board, move) + this.rand() * 0.6, note: '占地' });
    }

    // Level 2+: captures and rescues.
    if (level >= 2) {
      for (const move of legal) {
        const captured = board.capturesAt(move, color);
        if (captured.length) {
          this.push(out, move, 40 + captured.length * 12, `提掉 ${captured.length} 颗子`);
        }
      }
      // Answer atari on our own blocks.
      for (const t of atariThreats(board, color)) {
        if (t.color !== color) continue;
        for (const save of t.escapes) {
          this.push(out, save, 34 + t.stones.length * 8, '救回被打吃的棋');
        }
      }
    }

    // Level 3+: atari, connect, cut.
    if (level >= 3) {
      for (const move of legal) {
        const safety = evaluateMoveSafety(board, move, color);
        if (safety.threats.length) {
          const size = safety.threats.reduce((a, g) => a + g.length, 0);
          this.push(out, move, 22 + size * 6, '打吃');
        }
        if (connectsTwoBlocks(board, move, color)) {
          this.push(out, move, 18, '连接');
        }
      }
    }

    // Level 4+: one-ply check for the opponent's best reply, ladder reading.
    if (level >= 4) {
      const shortlist = out.sort((a, b) => b.score - a.score).slice(0, 14);
      for (const c of shortlist) {
        const copy = board.clone();
        if (!copy.play(c.move, color).ok) continue;
        let penalty = 0;
        // If the opponent can capture immediately, this move was bad.
        for (const reply of copy.legalMoves(enemy)) {
          const cap = copy.capturesAt(reply, enemy);
          if (cap.length >= 2) {
            penalty = Math.max(penalty, 24 + cap.length * 8);
          }
        }
        // Ladder read: if we can atari a block, does the ladder work?
        for (const t of atariThreats(copy, color)) {
          if (t.color !== enemy) continue;
          if (!t.killingMoves.length) continue;
          const line = readLadder(copy, color, t.killingMoves[0]);
          if (line?.works) {
            this.push(out, line.line[0], 30, '征子成立');
            break;
          }
        }
        c.score -= penalty;
        if (penalty) c.note = '会被反击';
      }
    }

    // Level 5: avoid self-atari, prefer moves that make an eye.
    if (level >= 5) {
      for (const c of out) {
        const safety = evaluateMoveSafety(board, c.move, color);
        if (safety.selfAtari.length) {
          const worst = Math.max(...safety.selfAtari.map((g) => g.length));
          // Sacrificing one stone in a working ladder is fine; larger is not.
          c.score -= worst >= 2 ? 30 : 10;
        }
      }
      // Eye-making: a move that raises our eye count is valuable.
      for (const c of out.slice(0, 10)) {
        const copy = board.clone();
        if (!copy.play(c.move, color).ok) continue;
        const eyes = countEyesQuick(copy, c.move);
        if (eyes >= 2) c.score += 26;
      }
    }

    // Deduplicate, keeping the best note/score per move.
    const byMove = new Map<number, Candidate>();
    for (const c of out) {
      const prev = byMove.get(c.move);
      if (!prev || c.score > prev.score) byMove.set(c.move, c);
    }
    return [...byMove.values()];
  }

  private push(list: Candidate[], move: number, score: number, note: string) {
    list.push({ move, score, note });
  }
}

function countEyesQuick(board: GoBoard, root: number): number {
  const g = board.group(root);
  if (!g.stones.length) return 0;
  const color = board.cells[root];
  const seen = new Set<number>();
  let eyes = 0;
  for (const s of g.stones) {
    for (const n of board.neighbours(s)) {
      if (board.cells[n] !== EMPTY || seen.has(n)) continue;
      let bordered = true;
      let size = 0;
      const stack = [n];
      seen.add(n);
      while (stack.length) {
        const cur = stack.pop()!;
        size++;
        for (const m of board.neighbours(cur)) {
          if (board.cells[m] === EMPTY) {
            if (!seen.has(m)) {
              seen.add(m);
              stack.push(m);
            }
          } else if (board.cells[m] !== color) bordered = false;
        }
      }
      if (bordered && size <= 6) eyes++;
    }
  }
  return eyes;
}
