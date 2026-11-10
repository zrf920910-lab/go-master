import { GoBoard } from '../engine/GoBoard/GoBoard';
import { BLACK, WHITE, type Color } from '../engine/GoBoard/types';
import { OgsSocket, type OgsGameData, type OgsEvent } from './ogsSocket';
import type { GameRecord } from '../app/types';

/**
 * Online game session.
 *
 * Deliberately a *different* model from the local game:
 *  - it owns an `OgsSocket` and mirrors the server's authoritative move list,
 *  - it never writes to the local progress store while a game is running,
 *  - it produces a `GameRecord` only when the game is finished, so the local
 *    archive and the online game cannot interfere with each other.
 *
 * The board is rebuilt from the server's move list on every sync, which makes
 * reconnection trivially correct: whatever the server says is the truth.
 */

export type OnlineStatus = 'idle' | 'connecting' | 'waiting' | 'playing' | 'finished' | 'error';

export interface OnlineGameState {
  status: OnlineStatus;
  gameId: number | null;
  size: number;
  komi: number;
  black: { id: number; username: string };
  white: { id: number; username: string };
  myColor: Color | null;
  toMove: Color;
  moveNumber: number;
  board: GoBoard | null;
  /** Index of the last move, -1 for none. */
  lastMove: number;
  phase: string;
  error?: string;
  /** True when the socket dropped and is reconnecting. */
  reconnecting: boolean;
  /** Chat lines received for this game. */
  chat: Array<{ username: string; message: string }>;
  /** Pending undo request from the opponent. */
  undoRequest?: { moveNumber: number };
}

export const EMPTY_ONLINE_STATE: OnlineGameState = {
  status: 'idle',
  gameId: null,
  size: 19,
  komi: 7.5,
  black: { id: 0, username: '黑棋' },
  white: { id: 0, username: '白棋' },
  myColor: null,
  toMove: BLACK,
  moveNumber: 0,
  board: null,
  lastMove: -1,
  phase: '',
  reconnecting: false,
  chat: [],
};

/** Rebuild a board from the server's packed move list. */
export function boardFromOgsGame(data: OgsGameData): { board: GoBoard; lastMove: number } {
  const size = data.width || 19;
  const board = new GoBoard(size);
  let lastMove = -1;
  for (const mv of data.moves ?? []) {
    const [x, y] = mv;
    if (x < 0 || y < 0) {
      board.pass(board.turn);
      lastMove = -1;
      continue;
    }
    const idx = y * size + x;
    const res = board.play(idx, board.turn);
    if (!res.ok) {
      // A corrupt or out-of-sync move list: stop and let the caller resync.
      throw new Error(`OGS 棋谱第 ${board.moveNumber + 1} 手无法应用（${res.reason}）`);
    }
    lastMove = idx;
  }
  return { board, lastMove };
}

export class OnlineGameSession {
  private socket: OgsSocket;
  private state: OnlineGameState = { ...EMPTY_ONLINE_STATE };
  private listeners = new Set<(s: OnlineGameState) => void>();
  private unsub: (() => void) | null = null;
  private myPlayerId = 0;

  constructor(socket?: OgsSocket) {
    this.socket = socket ?? new OgsSocket();
  }

  getState(): OnlineGameState {
    return this.state;
  }

  subscribe(fn: (s: OnlineGameState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<OnlineGameState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  async connect(jwt: string): Promise<void> {
    this.set({ status: 'connecting', error: undefined });
    if (!this.unsub) this.unsub = this.socket.on((ev) => this.handle(ev));
    try {
      await this.socket.connect(jwt);
      this.set({ status: this.state.gameId ? this.state.status : 'waiting' });
    } catch (err) {
      this.set({ status: 'error', error: (err as Error).message });
      throw err;
    }
  }

  /** Join a game by id; the server pushes the full state afterwards. */
  async join(gameId: number, myPlayerId = 0): Promise<void> {
    this.myPlayerId = myPlayerId;
    this.set({ gameId, status: 'connecting', error: undefined });
    await this.socket.joinGame(gameId);
  }

  async leave(): Promise<void> {
    const id = this.state.gameId;
    if (id !== null) await this.socket.leaveGame(id).catch(() => {});
    this.set({ ...EMPTY_ONLINE_STATE });
  }

  private handle(ev: OgsEvent) {
    if (ev.name === 'disconnect') {
      this.set({ reconnecting: true });
      return;
    }
    if (ev.name === 'authenticated') {
      this.set({ reconnecting: false });
      return;
    }
    if (ev.name === 'error') {
      this.set({ error: String(ev.data), status: 'error' });
      return;
    }
    if (ev.name === 'gamedata') {
      try {
        const data = ev.data as OgsGameData;
        const { board, lastMove } = boardFromOgsGame(data);
        const myColor =
          this.myPlayerId && data.black?.id === this.myPlayerId
            ? BLACK
            : this.myPlayerId && data.white?.id === this.myPlayerId
              ? WHITE
              : null;
        const toMove = data.player_to_move === data.white?.id ? WHITE : BLACK;
        this.set({
          status: data.phase === 'finished' ? 'finished' : 'playing',
          gameId: data.game_id,
          size: data.width || 19,
          komi: data.komi ?? 7.5,
          black: { id: data.black?.id ?? 0, username: data.black?.username ?? '黑棋' },
          white: { id: data.white?.id ?? 0, username: data.white?.username ?? '白棋' },
          myColor,
          toMove,
          moveNumber: board.moveNumber,
          board,
          lastMove,
          phase: data.phase ?? 'play',
          error: undefined,
          reconnecting: false,
        });
      } catch (err) {
        this.set({ status: 'error', error: (err as Error).message });
      }
      return;
    }
    if (ev.name === 'phase') {
      const phase = String((ev.data as { phase?: string })?.phase ?? '');
      if (phase === 'finished' || phase === 'scoring' || phase === 'stone removal') {
        this.set({ phase, status: phase === 'finished' ? 'finished' : this.state.status });
      }
      return;
    }
    if (ev.name === 'clock') {
      const data = ev.data as { current_player?: number; black_player_id?: number };
      if (data?.current_player) this.set({ toMove: data.current_player === data.black_player_id ? BLACK : WHITE });
      return;
    }
    if (ev.name === 'undo_requested') {
      this.set({ undoRequest: { moveNumber: Number(ev.data) || this.state.moveNumber } });
      return;
    }
    if (ev.name === 'undo_accepted') {
      this.set({ undoRequest: undefined });
      return;
    }
    if (ev.name === 'chat') {
      const data = ev.data as { username?: string; message?: string };
      if (data?.message) {
        this.set({ chat: [...this.state.chat.slice(-40), { username: data.username ?? '?', message: data.message }] });
      }
      return;
    }
    if (ev.name === 'raw') {
      // Move events arrive inside the raw stream; use them to request a resync.
      const payload = ev.data as { event: string };
      if (payload?.event?.endsWith('/move')) this.requestResync();
    }
  }

  private resyncTimer: number | null = null;

  /** Ask the server to resend the full game state (used after any move). */
  requestResync() {
    if (this.state.gameId === null) return;
    if (this.resyncTimer) window.clearTimeout(this.resyncTimer);
    this.resyncTimer = window.setTimeout(() => {
      if (this.state.gameId === null) return;
      this.socket
        .send('game/connect', { game_id: this.state.gameId, chat: false })
        .catch(() => {});
    }, 120);
  }

  async play(index: number): Promise<void> {
    const { gameId, size, toMove, myColor } = this.state;
    if (gameId === null) throw new Error('还没有加入对局');
    if (myColor && toMove !== myColor) throw new Error('还没轮到你');
    const [x, y] = index < 0 ? [-1, -1] : [index % size, Math.floor(index / size)];
    await this.socket.playMove(gameId, x, y);
    this.requestResync();
  }

  async pass(): Promise<void> {
    const { gameId } = this.state;
    if (gameId === null) throw new Error('还没有加入对局');
    await this.socket.playMove(gameId, -1, -1);
    this.requestResync();
  }

  async resign(): Promise<void> {
    if (this.state.gameId === null) return;
    await this.socket.resign(this.state.gameId);
  }

  async requestUndo(): Promise<void> {
    if (this.state.gameId === null) return;
    await this.socket.requestUndo(this.state.gameId, this.state.moveNumber);
  }

  async acceptUndo(): Promise<void> {
    if (this.state.gameId === null || !this.state.undoRequest) return;
    await this.socket.acceptUndo(this.state.gameId, this.state.undoRequest.moveNumber);
    this.set({ undoRequest: undefined });
  }

  async sendChat(message: string): Promise<void> {
    if (this.state.gameId === null) return;
    await this.socket.sendChat(this.state.gameId, message);
  }

  /** Snapshot the finished game as a local `GameRecord` (SGF/replay friendly). */
  toRecord(result?: string): GameRecord | null {
    const s = this.state;
    if (!s.board || s.gameId === null) return null;
    const letters = 'ABCDEFGHJKLMNOPQRST';
    return {
      id: `ogs-${s.gameId}`,
      size: s.size,
      black: s.black.username,
      white: s.white.username,
      moves: s.board.history.map((m) => ({
        at: m.kind === 'pass' ? '' : `${letters[m.index % s.size]}${s.size - Math.floor(m.index / s.size)}`,
        color: m.color,
        pass: m.kind === 'pass' ? true : undefined,
      })),
      result: result ?? (s.phase === 'finished' ? 'OGS 对局' : '进行中'),
      komi: s.komi,
      ruleset: 'chinese',
      startedAt: Date.now() - s.moveNumber * 1000,
      endedAt: Date.now(),
      mode: 'battle',
      note: `OGS 在线对局 #${s.gameId}`,
    };
  }

  close() {
    this.unsub?.();
    this.unsub = null;
    this.socket.close();
    this.set({ ...EMPTY_ONLINE_STATE });
  }
}
