import type { AILevel, AIProvider } from './types';
import { AI_LEVEL_NAMES } from './types';
import { LocalAIProvider } from './localProvider';
import { KataGoProvider, type KataGoConfig } from './katago';
import { GoAI } from '../engine/AI/GoAI';

/**
 * Provider registry.
 *
 * The battle screen asks this module for "the engine", never for a concrete
 * class. That keeps the rules engine, the teaching logic and the UI independent
 * of whether the opponent is a local heuristic or a GPU box running KataGo.
 */

export type EngineKind = 'local' | 'katago';

export interface AISettings {
  kind: EngineKind;
  level: AILevel;
  katago?: KataGoConfig;
  seed?: number;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  kind: 'local',
  level: 2,
  seed: 20240101,
};

/** Descriptions of the five local tiers, used by the UI. */
export const LEVEL_INFO: Record<AILevel, { name: string; blurb: string; measurable: string }> = {
  1: {
    name: AI_LEVEL_NAMES[1],
    blurb: '只保证不犯规，随机在角上落子。适合刚学会规则、还在练习点棋盘的孩子。',
    measurable: '不使用任何吃子/打吃判断',
  },
  2: {
    name: AI_LEVEL_NAMES[2],
    blurb: '会提子，也会把自己被打吃的棋救出来。',
    measurable: '能提子、能逃跑（有测试覆盖）',
  },
  3: {
    name: AI_LEVEL_NAMES[3],
    blurb: '会主动打吃、会把自己的两块棋连起来、会切断对方。',
    measurable: '会打吃/连接/切断（有测试覆盖）',
  },
  4: {
    name: AI_LEVEL_NAMES[4],
    blurb: '会算你下一步的反击，会读征子，很少白送棋。',
    measurable: '一手反击评估 + 征子阅读',
  },
  5: {
    name: AI_LEVEL_NAMES[5],
    blurb: '本地最强：更宽的候选点、主动避免自打吃、会抢做眼的要点。',
    measurable: '候选点更宽 + 避免自打吃 + 做眼',
  },
};

export function createProvider(settings: AISettings): AIProvider {
  if (settings.kind === 'katago' && settings.katago?.endpoint) {
    return new KataGoProvider({ ...settings.katago, level: settings.level });
  }
  return new LocalAIProvider({ level: settings.level, seed: settings.seed });
}

/**
 * The original `GoAI` class is still used by the daily-training generator and
 * the old battle path. This adapter gives it the provider interface so nothing
 * has to be rewritten for legacy callers.
 */
export class LegacyGoAIProvider implements AIProvider {
  readonly id = 'local-legacy';
  readonly level: AILevel;
  private ai: GoAI;

  constructor(level: AILevel, seed = 1) {
    this.level = level;
    this.ai = new GoAI(level, seed);
  }

  describe() {
    return {
      id: this.id,
      label: '本地引擎（旧版）',
      where: '本地' as const,
      level: this.level,
      levelBasis: '原有 GoAI 的战术搜索',
      explains: [],
      caveats: ['不提供解释'],
      needsNetwork: false,
    };
  }

  async healthCheck() {
    return { ok: true };
  }

  async choose({ board, color }: { board: Parameters<GoAI['choose']>[0]; color: Parameters<GoAI['choose']>[1] }) {
    const move = this.ai.choose(board, color);
    return { move, visits: 1 };
  }

  async analyze({ board, color, maxMoves }: { board: Parameters<GoAI['choose']>[0]; color: Parameters<GoAI['choose']>[1]; maxMoves?: number }) {
    const move = this.ai.choose(board, color);
    void maxMoves;
    return { moves: [{ move, visits: 1 }], provider: this.id, elapsedMs: 0 };
  }
}
