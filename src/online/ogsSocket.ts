/**
 * OGS realtime client.
 *
 * Protocol (verified live against wss://online-go.com/socket):
 *   send:     [command, data, id?]
 *   receive:  [event, data]           — server events
 *             [id, data?, error?]     — response to a command that carried an id
 *
 * Commands and payloads below were read from the official goban typing
 * (`src/engine/protocol/ClientToServer.ts`, Apache-2.0) and the docs at
 * https://docs.online-go.com/goban/modules/protocol.html.
 *
 * The client is deliberately transport-only: it knows nothing about the local
 * GoBoard or the app's progress store. `OnlineGame` (a separate module) maps its
 * events onto a *separate* game model, so an online game can never corrupt a
 * local teaching game.
 */

export type OgsEventName =
  | 'connect'
  | 'disconnect'
  | 'authenticated'
  | 'gamedata'
  | 'clock'
  | 'move'
  | 'phase'
  | 'undo_requested'
  | 'undo_accepted'
  | 'chat'
  | 'error'
  | 'raw';

export interface OgsEvent {
  name: OgsEventName;
  data?: unknown;
  gameId?: number;
}

type Listener = (ev: OgsEvent) => void;

export interface OgsPlayer {
  id: number;
  username: string;
  rank?: number;
  icon?: string;
}

export interface OgsGameData {
  game_id: number;
  width: number;
  height: number;
  komi: number;
  rules?: string;
  black: OgsPlayer;
  white: OgsPlayer;
  /** Packed moves: [x, y, timedelta?, color?] — x/y are 0-based from top-left. */
  moves: Array<[number, number, number?, number?, unknown?]>;
  phase?: string;
  player_to_move?: number;
  move_number?: number;
  handicap?: number;
  time_control?: { system?: string; main_time?: number; time_per_move?: number };
  initial_state?: { black?: string; white?: string };
}

const DEFAULT_URL = 'wss://online-go.com/socket';

/**
 * Convert an OGS packed move to a board index.
 *
 * OGS uses zero-based (x, y) with y counted from the **top**. Pass is encoded
 * as a negative coordinate (the server sends -1,-1 for pass).
 */
export function packedToIndex(mv: [number, number, ...unknown[]], size: number): number {
  const [x, y] = mv;
  if (x < 0 || y < 0 || x >= size || y >= size) return -1;
  return y * size + x;
}

/** Board index → OGS `(x, y)` packed move; pass is [-1, -1]. */
export function indexToPacked(index: number, size: number): [number, number] {
  if (index < 0) return [-1, -1];
  return [index % size, Math.floor(index / size)];
}

export class OgsSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private seq = 1;
  private pingTimer = 0;
  private reconnectAttempts = 0;
  private manualClose = false;
  private jwt = '';
  private url: string;

  state: 'idle' | 'connecting' | 'open' | 'closed' = 'idle';

  constructor(url = DEFAULT_URL) {
    this.url = url;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(ev: OgsEvent) {
    for (const fn of this.listeners) fn(ev);
  }

  async connect(jwt = ''): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.jwt = jwt;
    this.manualClose = false;
    this.state = 'connecting';

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this.state = 'closed';
        reject(new Error('连接 OGS 超时'));
      }, 12000);

      ws.onopen = () => {
        this.state = 'open';
        this.reconnectAttempts = 0;
        this.startPing();
        void this.send('authenticate', {
          jwt: this.jwt,
          device_id: this.deviceId(),
          user_agent: navigator.userAgent,
          language: 'zh',
          client: 'GoMaster',
          client_version: '1.0',
        })
          .then(() => {
            this.emit({ name: 'authenticated' });
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              resolve();
            }
          })
          .catch((err) => {
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              reject(err);
            }
          });
      };

      ws.onmessage = (e) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(e.data));
        } catch {
          return;
        }
        this.dispatch(msg);
      };

      ws.onerror = () => {
        this.emit({ name: 'error', data: 'WebSocket 连接出错' });
      };

      ws.onclose = () => {
        this.state = 'closed';
        this.stopPing();
        this.emit({ name: 'disconnect' });
        for (const [, p] of this.pending) p.reject(new Error('连接已关闭'));
        this.pending.clear();
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error('无法连接到 OGS'));
        }
        if (!this.manualClose && this.reconnectAttempts < 5) this.scheduleReconnect();
      };
    });
  }

  /** Reconnect with backoff; the caller learns through events. */
  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(15000, 800 * 2 ** this.reconnectAttempts);
    window.setTimeout(() => {
      if (this.manualClose) return;
      this.connect(this.jwt).catch(() => {
        /* the next attempt is scheduled by onclose */
      });
    }, delay);
  }

  private deviceId(): string {
    let id = localStorage.getItem('gomaster.ogs.device');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('gomaster.ogs.device', id);
    }
    return id;
  }

  private startPing() {
    this.stopPing();
    // The server answers with a `net/pong` *event*, not a command response, so
    // the ping must not register a pending request (it would time out).
    this.pingTimer = window.setInterval(() => {
      this.send('net/ping', { client: Date.now() }, false).catch(() => {});
    }, 25000);
  }

  private stopPing() {
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = 0;
  }

  private dispatch(msg: unknown) {
    if (!Array.isArray(msg) || msg.length === 0) return;
    const [first, second, third] = msg as [unknown, unknown?, unknown?];

    // Response to a command we sent with an id.
    if (typeof first === 'number') {
      const p = this.pending.get(first);
      if (p) {
        this.pending.delete(first);
        if (third && typeof third === 'object' && third !== null) {
          p.reject(new Error(String((third as { message?: string }).message ?? 'OGS 命令失败')));
        } else {
          p.resolve(second);
        }
      }
      return;
    }

    if (typeof first !== 'string') return;

    // Game-scoped events look like "game/<id>/<event>".
    const gameMatch = /^game\/(\d+)\/([a-z_]+)$/.exec(first);
    if (gameMatch) {
      const gameId = Number(gameMatch[1]);
      const kind = gameMatch[2];
      this.emit({ name: 'raw', data: { event: first, payload: second }, gameId });
      if (kind === 'gamedata') this.emit({ name: 'gamedata', data: second, gameId });
      else if (kind === 'clock') this.emit({ name: 'clock', data: second, gameId });
      else if (kind === 'phase') this.emit({ name: 'phase', data: second, gameId });
      else if (kind === 'undo_requested') this.emit({ name: 'undo_requested', data: second, gameId });
      else if (kind === 'undo_accepted') this.emit({ name: 'undo_accepted', data: second, gameId });
      else if (kind === 'chat') this.emit({ name: 'chat', data: second, gameId });
      return;
    }

    if (first === 'net/pong') return;
    if (first === 'ERROR') {
      const detail = typeof second === 'string' ? second : String((second as { errcode?: string })?.errcode ?? 'OGS 错误');
      this.emit({ name: 'error', data: detail });
      return;
    }
    this.emit({ name: 'raw', data: { event: first, payload: second } });
  }

  /** Send a command; when an id is used, resolves with the server response. */
  send(command: string, data: unknown, expectReply = true): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('尚未连接到 OGS'));
    }
    if (!expectReply) {
      ws.send(JSON.stringify([command, data]));
      return Promise.resolve(undefined);
    }
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.setTimeout(() => {
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          reject(new Error(`OGS 未响应 ${command}`));
        }
      }, 15000);
      ws.send(JSON.stringify([command, data, id]));
    }).then((v) => {
      // A common failure shape is a rejected promise from the server.
      if (v && typeof v === 'object' && 'error' in (v as object)) {
        throw new Error(String((v as { error: string }).error));
      }
      return v;
    });
  }

  joinGame(gameId: number) {
    return this.send('game/connect', { game_id: gameId, chat: true });
  }

  leaveGame(gameId: number) {
    return this.send('game/disconnect', { game_id: gameId });
  }

  playMove(gameId: number, x: number, y: number) {
    return this.send('game/move', { game_id: gameId, move: coordsToGtp(x, y) });
  }

  resign(gameId: number) {
    return this.send('game/resign', { game_id: gameId });
  }

  requestUndo(gameId: number, moveNumber: number) {
    return this.send('game/undo/request', { game_id: gameId, move_number: moveNumber });
  }

  acceptUndo(gameId: number, moveNumber: number) {
    return this.send('game/undo/accept', { game_id: gameId, move_number: moveNumber });
  }

  sendChat(gameId: number, message: string) {
    return this.send('game/chat', { game_id: gameId, type: 'string', message });
  }

  close() {
    this.manualClose = true;
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.state = 'closed';
  }
}

/**
 * OGS move strings are GTP-style lowercase letter pairs, e.g. "dd".
 *
 * OGS counts `y` from the top of the board in its packed format, and its move
 * strings follow the same convention, so the mapping is a plain index and the
 * two helpers below must stay consistent with `packedToIndex`.
 */
export function coordsToGtp(x: number, y: number): string {
  const letters = 'abcdefghijklmnopqrs';
  return `${letters[x] ?? ''}${letters[y] ?? ''}`;
}

export function gtpToIndex(move: string, size: number): number {
  if (!move) return -1;
  const letters = 'abcdefghijklmnopqrs';
  const x = letters.indexOf(move[0]);
  const y = letters.indexOf(move[1]);
  if (x < 0 || y < 0 || x >= size || y >= size) return -1;
  return y * size + x;
}
