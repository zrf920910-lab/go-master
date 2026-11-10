import { GoBoard } from '../engine/GoBoard/GoBoard';
import { BLACK, EMPTY, type Color } from '../engine/GoBoard/types';
import { parseCoord } from '../engine/GoBoard/coordinates';
import type { AILevel, AIProvider, AnalysisRequest, AnalysisResult, AICapability, MoveEvaluation } from './types';
import { nowMs } from './types';

/**
 * KataGo adapter.
 *
 * Two transports are supported, because that is what real deployments look like:
 *
 *  - `analysis`: `katago analysis -config ... -model ...`, one JSON query per
 *    line on stdin and one JSON result per line on stdout. This is the format
 *    documented in KataGo's `docs/Analysis_Engine.md`, and it is what a small
 *    HTTP/WebSocket bridge in front of a GPU box would speak.
 *  - `gtp`: a GTP process (or a GTP-over-WebSocket bridge) running
 *    `kata-analyze`, whose output lines are
 *    `info move E4 visits 487 winrate 0.48 scoreLead -0.61 pv E4 E3 ...`.
 *
 * Neither path is faked: if the endpoint is unreachable, `healthCheck()` fails
 * and the UI says so. There is no silent fallback that pretends to be KataGo.
 */

export type KataGoTransport = 'analysis' | 'gtp';

export interface KataGoConfig {
  transport: KataGoTransport;
  /** Base URL of the bridge, e.g. https://my-box.example/katago */
  endpoint: string;
  /** Optional bearer token for the bridge. */
  token?: string;
  /** Search visits per move. */
  visits?: number;
  /** Level this configuration is presented as. */
  level?: AILevel;
  /** Board rules string sent to KataGo. */
  rules?: string;
  komi?: number;
}

interface AnalysisMoveInfo {
  move: string;
  visits?: number;
  winrate?: number;
  scoreLead?: number;
  pv?: string[];
  order?: number;
  prior?: number;
}

interface AnalysisResponse {
  id?: string;
  turnNumber?: number;
  isDuringSearch?: boolean;
  moveInfos?: AnalysisMoveInfo[];
  rootInfo?: { winrate?: number; scoreLead?: number; visits?: number; currentPlayer?: string };
  /** Present when the engine reports an error. */
  error?: string;
}

export class KataGoProvider implements AIProvider {
  readonly id: string;
  readonly level: AILevel;
  private cfg: KataGoConfig & { visits: number };
  private seq = 0;

  constructor(cfg: KataGoConfig) {
    this.cfg = { visits: 200, ...cfg };
    this.level = cfg.level ?? 5;
    this.id = `katago-${cfg.transport}`;
  }

  describe(): AICapability {
    return {
      id: this.id,
      label: `KataGo（${this.cfg.transport === 'analysis' ? 'analysis 协议' : 'GTP 协议'}）`,
      where: '远程',
      level: 5,
      levelBasis: 'KataGo 神经网络 + MCTS 搜索，棋力由访问次数决定',
      explains: ['胜率', '目差', '推荐落子序列', '领地倾向'],
      caveats: [
        '需要自建 KataGo 服务（本项目不内置模型与算力）',
        '分析质量取决于访问次数与服务端硬件',
      ],
      needsNetwork: true,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.cfg.endpoint) return { ok: false, detail: '未配置端点' };
    try {
      const url = this.cfg.transport === 'analysis' ? `${this.cfg.endpoint.replace(/\/$/, '')}/health` : this.cfg.endpoint;
      const res = await fetch(url, {
        method: this.cfg.transport === 'analysis' ? 'GET' : 'POST',
        headers: this.headers(),
        signal: AbortSignal.timeout?.(6000),
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      return { ok: true, detail: 'KataGo 服务可用' };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async choose(req: AnalysisRequest): Promise<MoveEvaluation> {
    const result = await this.analyze({ ...req, maxMoves: 5 });
    return result.moves[0] ?? { move: -1 };
  }

  async analyze(req: AnalysisRequest): Promise<AnalysisResult> {
    const started = nowMs();
    const { board, color } = req;
    const moves = this.cfg.transport === 'analysis' ? await this.viaAnalysis(board, color, req) : await this.viaGTP(board, color, req);
    return {
      moves,
      rootWinrate: moves[0]?.winrate,
      rootScoreLead: moves[0]?.scoreLead,
      provider: this.id,
      elapsedMs: nowMs() - started,
    };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cfg.token) h.Authorization = `Bearer ${this.cfg.token}`;
    return h;
  }

  /** Board → KataGo's [["B","Q4"], ...] move list. */
  private encodeMoves(board: GoBoard): Array<[string, string]> {
    const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    const out: Array<[string, string]> = [];
    for (const m of board.history) {
      if (m.kind === 'pass') continue;
      const x = m.index % board.size;
      const y = Math.floor(m.index / board.size);
      out.push([m.color === BLACK ? 'B' : 'W', `${letters[x]}${board.size - y}`]);
    }
    return out;
  }

  private async viaAnalysis(board: GoBoard, color: Color, req: AnalysisRequest): Promise<MoveEvaluation[]> {
    const id = `gm-${++this.seq}`;
    const komi = this.cfg.komi ?? 7.5;
    const query = {
      id,
      moves: this.encodeMoves(board),
      rules: this.cfg.rules ?? 'chinese',
      komi,
      boardXSize: board.size,
      boardYSize: board.size,
      analyzeTurns: [board.history.filter((m) => m.kind === 'play').length],
      maxVisits: req.budgetMs ? undefined : this.cfg.visits,
      includeOwnership: true,
      includePolicy: false,
    };
    const res = await fetch(`${this.cfg.endpoint.replace(/\/$/, '')}/analyze`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ queries: [query] }),
      signal: AbortSignal.timeout?.(req.budgetMs ?? 20000),
    });
    if (!res.ok) throw new Error(`KataGo analysis HTTP ${res.status}`);
    const body = (await res.json()) as AnalysisResponse | AnalysisResponse[];
    const payload = Array.isArray(body) ? body[0] : body;
    if (payload?.error) throw new Error(payload.error);
    return this.mapMoves(board, payload?.moveInfos ?? [], color);
  }

  private async viaGTP(board: GoBoard, color: Color, req: AnalysisRequest): Promise<MoveEvaluation[]> {
    const body = {
      command: 'kata-analyze',
      boardSize: board.size,
      komi: this.cfg.komi ?? 7.5,
      rules: this.cfg.rules ?? 'chinese',
      initialStones: [],
      moves: this.encodeMoves(board),
      toMove: color === BLACK ? 'B' : 'W',
      maxVisits: this.cfg.visits,
      interval: 100,
      waitMs: req.budgetMs ?? 12000,
    };
    const res = await fetch(`${this.cfg.endpoint.replace(/\/$/, '')}/gtp`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout?.(req.budgetMs ?? 20000),
    });
    if (!res.ok) throw new Error(`KataGo GTP HTTP ${res.status}`);
    const text = await res.text();
    return this.mapMoves(board, parseKataAnalyze(text), color);
  }

  private mapMoves(board: GoBoard, infos: AnalysisMoveInfo[], _color: Color): MoveEvaluation[] {
    const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
    const toIndex = (coord: string): number => {
      if (!coord || coord === 'pass') return -1;
      const x = letters.indexOf(coord[0].toUpperCase());
      const row = Number(coord.slice(1));
      if (x < 0 || !row) return -1;
      const label = `${'ABCDEFGHJKLMNOPQRST'[x]}${row}`;
      return parseCoord(board.size, label);
    };
    return infos
      .slice()
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map((m) => ({
        move: toIndex(m.move),
        winrate: m.winrate,
        scoreLead: m.scoreLead,
        visits: m.visits,
        pv: (m.pv ?? []).map(toIndex).filter((i) => i >= 0),
      }))
      .filter((m) => m.move >= -1);
  }
}

/**
 * Parse `kata-analyze` output.
 *
 * Format (from KataGo's GTP_Extensions.md):
 *   info move E4 visits 487 utility ... winrate 0.480018 scoreLead -0.611848 pv E4 E3 ...
 * Exported so it can be unit-tested against real captured output.
 */
export function parseKataAnalyze(text: string): AnalysisMoveInfo[] {
  const out: AnalysisMoveInfo[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('info move')) continue;
    const tokens = line.trim().split(/\s+/);
    const rec: AnalysisMoveInfo = { move: '' };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === 'info' || t === 'info:') continue;
      if (t === 'move') {
        rec.move = tokens[++i] ?? '';
      } else if (t === 'visits') {
        rec.visits = Number(tokens[++i]);
      } else if (t === 'winrate') {
        rec.winrate = Number(tokens[++i]);
      } else if (t === 'scoreLead') {
        rec.scoreLead = Number(tokens[++i]);
      } else if (t === 'prior') {
        rec.prior = Number(tokens[++i]);
      } else if (t === 'order') {
        rec.order = Number(tokens[++i]);
      } else if (t === 'pv') {
        const pv: string[] = [];
        let j = i + 1;
        while (j < tokens.length && /^[A-HJ-T]\d{1,2}$|^pass$/i.test(tokens[j])) {
          pv.push(tokens[j++]);
        }
        rec.pv = pv;
        i = j - 1;
      }
    }
    if (rec.move) out.push(rec);
  }
  return out;
}

/** Encode a board for the analysis bridge (exported for tests/bridges). */
export function encodeBoardForKataGo(board: GoBoard, komi: number): object {
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  const moves: Array<[string, string]> = [];
  for (const m of board.history) {
    if (m.kind === 'pass') continue;
    const x = m.index % board.size;
    const y = Math.floor(m.index / board.size);
    moves.push([m.color === BLACK ? 'B' : 'W', `${letters[x]}${board.size - y}`]);
  }
  const stones: Array<[string, string]> = [];
  for (let i = 0; i < board.cells.length; i++) {
    if (board.cells[i] === EMPTY) continue;
    const x = i % board.size;
    const y = Math.floor(i / board.size);
    stones.push([board.cells[i] === BLACK ? 'B' : 'W', `${letters[x]}${board.size - y}`]);
  }
  return { initialStones: stones, moves, komi, boardXSize: board.size, boardYSize: board.size };
}
