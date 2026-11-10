import type { GoBoard } from '../engine/GoBoard/GoBoard';
import type { Color } from '../engine/GoBoard/types';

/**
 * AI provider abstraction.
 *
 * The rules engine must never know which engine (if any) is thinking, and the
 * UI must be able to swap a local tactical engine for a remote KataGo service
 * without changing a single call site. Everything AI-shaped therefore goes
 * through this interface.
 *
 * Providers are expected to be *honest* about what they are: `describe()`
 * returns a human-readable capability statement that the UI shows verbatim.
 */

export type AILevel = 1 | 2 | 3 | 4 | 5;

export const AI_LEVEL_NAMES: Record<AILevel, string> = {
  1: '初级',
  2: '普通',
  3: '进阶',
  4: '高级',
  5: '大师',
};

export interface MoveEvaluation {
  /** Board index, or -1 for pass. */
  move: number;
  /** Win rate for the player to move, 0..1. */
  winrate?: number;
  /** Expected score lead for the player to move (points). */
  scoreLead?: number;
  /** Search visits, when the engine reports them. */
  visits?: number;
  /** Principal variation, board indices. */
  pv?: number[];
  /** Short human-readable reason (local engine only). */
  note?: string;
}

export interface AnalysisRequest {
  board: GoBoard;
  color: Color;
  /** How many candidate moves to return, best first. */
  maxMoves?: number;
  /** How much thinking the caller wants (ms or visits, provider decides). */
  budgetMs?: number;
  /** Optional region to focus on (used by the teacher to explain a move). */
  focus?: number[];
}

export interface AnalysisResult {
  moves: MoveEvaluation[];
  /** Win rate of the side to move in the analysed position, 0..1. */
  rootWinrate?: number;
  rootScoreLead?: number;
  /** Ownership map, -1..1 per point (black positive), when available. */
  ownership?: Float32Array;
  /** Which provider produced this. */
  provider: string;
  /** Milliseconds spent. */
  elapsedMs: number;
}

export interface AIProvider {
  readonly id: string;
  readonly level: AILevel;
  /** Pick a move to play. Returns -1 to pass. */
  choose(request: AnalysisRequest): Promise<MoveEvaluation>;
  /** Detailed analysis for teaching/coaching. */
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
  /** Capability statement shown in the UI. Must not overstate ability. */
  describe(): AICapability;
  /** Cheap readiness probe (remote providers may need a round-trip). */
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}

export interface AICapability {
  id: string;
  label: string;
  /** Where it runs, for display. */
  where: '本地' | '远程' | '浏览器内 WASM';
  /** 1..5 approximate strength, and the basis for that claim. */
  level: AILevel;
  levelBasis: string;
  /** What it can explain. Empty means "plays but cannot explain". */
  explains: string[];
  /** Honest caveats. */
  caveats: string[];
  /** Does it need a network connection? */
  needsNetwork: boolean;
}

/** Token-bucket-ish budget helper shared by providers. */
export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
