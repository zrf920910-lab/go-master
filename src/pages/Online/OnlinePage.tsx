import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import { OnlineGameSession, EMPTY_ONLINE_STATE, type OnlineGameState } from '../../online/onlineSession';
import {
  beginLogin,
  completeLogin,
  fetchMe,
  fetchMyGames,
  fetchOpenChallenges,
  isLoggedIn,
  loadConfig,
  loadTokens,
  logout,
  saveConfig,
  type OgsChallengeSummary,
  type OgsUser,
} from '../../online/ogsAuth';
import { useStore } from '../../app/store';
import { putGame } from '../../services/storage/storage';
import { Chip, EmptyState } from '../../components/Progress/Progress';
import { toast } from '../../components/Shell/Toast';
import { BLACK, WHITE } from '../../engine/GoBoard/types';
import './online.css';

/**
 * Online play (OGS).
 *
 * Two hard rules shape this screen:
 *  1. Nothing here may disturb local progress. The online session is a separate
 *     object; the only write into the local store happens when a finished game
 *     is archived, and even that is optional (a button).
 *  2. Offline is a first-class state, not an error dialog. Everything is gated
 *     behind `online` and the page explains what still works without a network.
 */

const NETWORK_LABEL = (
  <span className="tiny mute-2">
    在线对局需要网络。断网时课程、关卡、本地 AI 和棋谱仍然完全可用。
  </span>
);

export function OnlinePage() {
  const { profile, recordGame } = useStore();
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [tokensPresent, setTokensPresent] = useState<boolean>(() => isLoggedIn());
  const [me, setMe] = useState<OgsUser | null>(null);
  const [cfg, setCfg] = useState(() => loadConfig());
  const [clientId, setClientId] = useState(cfg.clientId);
  const [redirectUri, setRedirectUri] = useState(cfg.redirectUri);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [challenges, setChallenges] = useState<OgsChallengeSummary[]>([]);
  const [myGames, setMyGames] = useState<Array<{ id: number; black: number; white: number; move_number: number; phase: string }>>([]);
  const [joinId, setJoinId] = useState('');

  const sessionRef = useRef<OnlineGameSession | null>(null);
  const [state, setState] = useState<OnlineGameState>(EMPTY_ONLINE_STATE);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Handle the OAuth redirect callback exactly once.
  useEffect(() => {
    let cancelled = false;
    if (location.search.includes('code=') || location.search.includes('error=')) {
      setBusy(true);
      completeLogin(location.search).then((res) => {
        if (cancelled) return;
        setBusy(false);
        // Remove the code from the URL so a refresh does not replay it.
        window.history.replaceState(null, '', location.pathname + location.hash);
        if (res && !res.ok) setError(res.error ?? '登录失败');
        else if (res?.ok) {
          setTokensPresent(true);
          toast({ icon: '✅', title: '已登录 OGS' });
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!isLoggedIn()) {
      setTokensPresent(false);
      setMe(null);
      return;
    }
    try {
      const user = await fetchMe();
      setMe(user);
      setTokensPresent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const doLogin = async () => {
    if (!clientId.trim()) {
      setError('请先填写 OGS 应用的 client_id（在 online-go.com/oauth2/applications/ 注册）');
      return;
    }
    const next = { clientId: clientId.trim(), redirectUri: redirectUri.trim() };
    saveConfig(next);
    setCfg(next);
    const url = await beginLogin(next);
    location.href = url;
  };

  const doLogout = async () => {
    await logout();
    setTokensPresent(false);
    setMe(null);
    sessionRef.current?.close();
    sessionRef.current = null;
    setState(EMPTY_ONLINE_STATE);
  };

  const loadLobby = async () => {
    setBusy(true);
    setError(null);
    try {
      const [c, g] = await Promise.all([fetchOpenChallenges().catch(() => []), fetchMyGames().catch(() => [])]);
      setChallenges(c);
      setMyGames(g);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ensureSession = useCallback((): OnlineGameSession => {
    if (!sessionRef.current) {
      const s = new OnlineGameSession();
      s.subscribe(setState);
      sessionRef.current = s;
    }
    return sessionRef.current;
  }, []);

  const connectAndJoin = async (gameId: number) => {
    const t = loadTokens();
    if (!t) {
      setError('请先登录 OGS');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const session = ensureSession();
      const user = me ?? (await fetchMe());
      await session.connect(t.access_token);
      await session.join(gameId, user.id);
      toast({ icon: '🎮', title: `已加入对局 #${gameId}` });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const archiveFinished = async () => {
    const rec = sessionRef.current?.toRecord();
    if (!rec) return;
    await putGame(rec);
    recordGame(rec);
    toast({ icon: '💾', title: '在线棋谱已保存到本地', body: '可以在「棋谱复盘」里回看。' });
  };

  const board = state.board;
  const myTurn = state.myColor !== null && board !== null && board.turn === state.myColor && state.status === 'playing';

  const statusChip = useMemo(() => {
    if (!online) return <Chip tone="red">离线</Chip>;
    if (!tokensPresent) return <Chip tone="amber">未登录</Chip>;
    if (state.status === 'playing') return <Chip tone="green">对局中</Chip>;
    if (state.status === 'error') return <Chip tone="red">连接异常</Chip>;
    return <Chip tone="blue">已连接 OGS</Chip>;
  }, [online, tokensPresent, state.status]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">在线对弈</p>
          <h1 className="h1">和真人下一盘</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            通过 OGS（Online-Go.com）官方 OAuth2 + WebSocket 接口对弈。在线棋局与本地教学棋局完全分开。
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {statusChip}
          {!online && NETWORK_LABEL}
        </div>
      </header>

      {!online && (
        <div className="card card--pad online-offline">
          <span aria-hidden className="online-offline__icon">📴</span>
          <div>
            <h2 className="h3">现在是离线状态</h2>
            <p className="muted small">
              课程、关卡、本地 AI 对弈和棋谱都照常使用。联网后这里会显示 OGS 大厅。
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="online-error" role="alert">
          {error}
        </p>
      )}

      {!tokensPresent && online && (
        <section className="card card--pad online-login">
          <h2 className="h3">第一步：连接你的 OGS 账号</h2>
          <p className="muted small" style={{ marginTop: 6 }}>
            使用 OAuth2 + PKCE 授权，本应用<b>不会</b>接触你的密码，也不会保存 client_secret。
            你需要在 OGS 注册一个应用，把下面这个回调地址填进它的 redirect URI。
          </p>
          <label className="field">
            <span className="field__label">OGS 应用 client_id</span>
            <input
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="例如 abc123def456"
              aria-label="OGS client_id"
            />
          </label>
          <label className="field">
            <span className="field__label">回调地址（redirect URI）</span>
            <input
              className="input"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              aria-label="回调地址"
            />
          </label>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={doLogin} disabled={busy}>
              {busy ? '跳转中…' : '去 OGS 授权'}
            </button>
            <a
              className="btn btn--sm"
              href="https://online-go.com/oauth2/applications/"
              target="_blank"
              rel="noreferrer noopener"
            >
              注册应用 ↗
            </a>
          </div>
          <p className="tiny mute-2" style={{ marginTop: 10 }}>
            说明：纯静态网站没有固定的域名，所以 client_id 需要你自己填。令牌保存在本机 sessionStorage，
            关闭浏览器即失效。
          </p>
        </section>
      )}

      {tokensPresent && (
        <>
          <section className="card card--pad online-me">
            <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
              <span className="avatar" aria-hidden>👤</span>
              <div className="grow">
                <p className="h3">{me ? me.username : '正在读取账号…'}</p>
                <p className="tiny mute-2">
                  {me?.ranking ? `等级分 ${me.ranking.toFixed(0)}` : 'OGS 账号已授权'}
                  {profile.name ? ` · 本机昵称 ${profile.name}` : ''}
                </p>
              </div>
              <button className="btn btn--sm" onClick={loadLobby} disabled={busy}>
                刷新大厅
              </button>
              <a
                className="btn btn--sm"
                href="https://online-go.com/play"
                target="_blank"
                rel="noreferrer noopener"
              >
                创建房间 ↗
              </a>
              <button className="btn btn--sm btn--ghost" onClick={doLogout}>
                退出登录
              </button>
            </div>
          </section>

          <div className="online-grid">
            <section className="card card--pad">
              <h2 className="h3">公开对局</h2>
              <p className="tiny mute-2">点「加入」会通过 WebSocket 订阅这盘棋，并同步棋步。</p>
              <div className="online-list">
                {challenges.length === 0 && <p className="tiny mute-2">还没有加载大厅，点上面的「刷新大厅」。</p>}
                {challenges.slice(0, 10).map((c) => (
                  <div key={c.id} className="online-row">
                    <span className="online-row__title">
                      {c.name || `对局 #${c.id}`}
                    </span>
                    <span className="tiny mute-2">
                      {c.width ?? c.board_size ?? 19} 路 · 贴目 {c.komi ?? 6.5}
                      {c.challenger?.username ? ` · ${c.challenger.username}` : ''}
                    </span>
                    <button
                      className="btn btn--sm"
                      onClick={() => connectAndJoin(c.game?.id ?? c.id)}
                      disabled={busy || !online}
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="card card--pad">
              <h2 className="h3">我的对局</h2>
              <div className="online-list">
                {myGames.length === 0 && <p className="tiny mute-2">没有正在进行的对局。</p>}
                {myGames.slice(0, 10).map((g) => (
                  <div key={g.id} className="online-row">
                    <span className="online-row__title">
                      #{g.id} · {g.move_number} 手
                    </span>
                    <span className="tiny mute-2">{g.phase || '对局中'}</span>
                    <button className="btn btn--sm" onClick={() => connectAndJoin(g.id)} disabled={busy || !online}>
                      进入
                    </button>
                  </div>
                ))}
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <span className="field__label">用对局号加入</span>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    className="input grow"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    placeholder="例如 12345678"
                    inputMode="numeric"
                    aria-label="对局号"
                  />
                  <button
                    className="btn btn--sm"
                    disabled={!joinId.trim() || busy || !online}
                    onClick={() => {
                      const id = Number(joinId.trim());
                      if (Number.isFinite(id) && id > 0) void connectAndJoin(id);
                      else setError('对局号必须是数字');
                    }}
                  >
                    加入
                  </button>
                </div>
              </div>
            </section>
          </div>

          {board && (
            <section className="online-game">
              <div className="online-game__board">
                <div className="online-game__players">
                  <span>
                    <b>黑</b> {state.black.username}
                    {state.myColor === BLACK ? '（你）' : ''}
                  </span>
                  <span>
                    <b>白</b> {state.white.username}
                    {state.myColor === WHITE ? '（你）' : ''}
                  </span>
                  <span className="tiny mute-2">
                    {state.moveNumber} 手 · 第 {state.gameId} 局
                  </span>
                  {state.reconnecting && <Chip tone="amber">重连中…</Chip>}
                </div>
                <GoBoardCanvas
                  size={board.size}
                  cells={board.cells}
                  turn={board.turn}
                  lastMove={state.lastMove}
                  disabled={!myTurn}
                  showCoordinates={board.size === 19}
                  maxSize={620}
                  onPlay={(i) => {
                    if (!myTurn) return false;
                    void sessionRef.current?.play(i).catch((err) => setError((err as Error).message));
                    return true;
                  }}
                  ariaLabel="OGS 在线对局棋盘"
                />
                <div className="online-game__actions">
                  <span className={`turn-pill ${myTurn ? 'turn-pill--me' : ''}`}>
                    {state.status === 'finished' ? '对局结束' : myTurn ? '轮到你' : '等待对手'}
                  </span>
                  <button
                    className="btn btn--sm"
                    disabled={!myTurn}
                    onClick={() => void sessionRef.current?.pass().catch((err) => setError((err as Error).message))}
                  >
                    停一手
                  </button>
                  <button
                    className="btn btn--sm"
                    onClick={() => void sessionRef.current?.requestUndo().catch((err) => setError((err as Error).message))}
                  >
                    请求悔棋
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => void sessionRef.current?.resign().catch((err) => setError((err as Error).message))}
                  >
                    认输
                  </button>
                  <button className="btn btn--sm" onClick={archiveFinished}>
                    保存棋谱
                  </button>
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => {
                      void sessionRef.current?.leave();
                      setState(EMPTY_ONLINE_STATE);
                    }}
                  >
                    离开
                  </button>
                </div>
                {state.undoRequest && (
                  <div className="online-undo" role="status">
                    对手请求悔棋到第 {state.undoRequest.moveNumber} 手。
                    <button className="btn btn--sm" onClick={() => void sessionRef.current?.acceptUndo()}>
                      同意
                    </button>
                  </div>
                )}
              </div>

              <aside className="online-game__side">
                <div className="card card--pad">
                  <h2 className="h3">对局信息</h2>
                  <dl className="kv">
                    <div>
                      <dt>棋盘</dt>
                      <dd>{state.size} 路</dd>
                    </div>
                    <div>
                      <dt>贴目</dt>
                      <dd>{state.komi}</dd>
                    </div>
                    <div>
                      <dt>阶段</dt>
                      <dd>{state.phase || '对局中'}</dd>
                    </div>
                    <div>
                      <dt>你在</dt>
                      <dd>{state.myColor === BLACK ? '黑棋' : state.myColor === WHITE ? '白棋' : '观战'}</dd>
                    </div>
                  </dl>
                  <button
                    className="btn btn--block"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      const sgf = sessionRef.current?.toRecord();
                      if (!sgf) return;
                      const blob = new Blob([JSON.stringify(sgf, null, 2)], { type: 'application/json' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `ogs-${state.gameId}.json`;
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    导出本局
                  </button>
                </div>

                <div className="card card--pad">
                  <h2 className="h3">聊天</h2>
                  <div className="online-chat">
                    {state.chat.length === 0 && <p className="tiny mute-2">暂无消息</p>}
                    {state.chat.map((c, i) => (
                      <p key={i} className="online-chat__line">
                        <b>{c.username}</b> {c.message}
                      </p>
                    ))}
                  </div>
                  <ChatBox onSend={(m) => void sessionRef.current?.sendChat(m)} />
                </div>
              </aside>
            </section>
          )}

          {!board && (
            <EmptyState
              icon="🌐"
              title="还没有进入对局"
              hint="从上面的公开对局或「我的对局」里选一局，或者用对局号加入。"
            />
          )}
        </>
      )}
    </div>
  );
}

function ChatBox({ onSend }: { onSend: (m: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="row" style={{ gap: 8, marginTop: 10 }}>
      <input
        className="input grow"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="说点什么…"
        aria-label="聊天内容"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            onSend(text.trim());
            setText('');
          }
        }}
      />
      <button
        className="btn btn--sm"
        onClick={() => {
          if (!text.trim()) return;
          onSend(text.trim());
          setText('');
        }}
      >
        发送
      </button>
    </div>
  );
}
