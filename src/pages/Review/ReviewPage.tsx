import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../../engine/GoBoard/types';
import { getGames, deleteGame, putGame } from '../../services/storage/storage';
import { positionsFromRecord } from '../../services/sgf/record';
import { toSGF, parseSGF, recordFromSGF, validateRecord } from '../../services/sgf/sgf';
import type { GameRecord } from '../../app/types';
import type { Navigate } from '../../app/router';
import { Chip, EmptyState } from '../../components/Progress/Progress';
import { Sheet, ConfirmDialog } from '../../components/Shell/Sheet';
import { toast } from '../../components/Shell/Toast';
import { useStore } from '../../app/store';

/**
 * Game archive + replay + SGF import/export.
 *
 * Every game is stored in IndexedDB; the replay rebuilds board states from the
 * move list through the rules engine, so an imported SGF with an illegal move
 * is rejected instead of showing a wrong board.
 */
export function ReviewPage({ go }: { go: Navigate }) {
  const { profile, recordGame } = useStore();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    getGames<GameRecord>()
      .then((g) => setGames(g.sort((a, b) => b.startedAt - a.startedAt)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const importSGF = useCallback(() => {
    try {
      const parsed = parseSGF(importText);
      const rec = recordFromSGF(parsed, `sgf-${Date.now()}`);
      const check = validateRecord(rec);
      if (!check.ok) {
        toast({ icon: '⚠️', title: '棋谱有误', body: check.error ?? '包含不合法的落子' });
        return;
      }
      void putGame(rec);
      recordGame(rec);
      setImportOpen(false);
      setImportText('');
      refresh();
      toast({ icon: '📥', title: '棋谱已导入', body: `${rec.size} 路 · ${rec.moves.length} 手` });
    } catch (err) {
      toast({ icon: '⚠️', title: '无法解析 SGF', body: (err as Error).message });
    }
  }, [importText, recordGame, refresh]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">棋谱与复盘</p>
          <h1 className="h1">每一盘棋都留得下来</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            支持逐步回放、跳转、自动播放，以及 SGF 导入导出。
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--sm" onClick={() => setImportOpen(true)}>
            导入 SGF
          </button>
          <button className="btn btn--sm btn--primary" onClick={() => go({ name: 'battle' })}>
            去下一盘
          </button>
        </div>
      </header>

      {loading && <p className="muted small">正在读取棋谱…</p>}
      {!loading && games.length === 0 && (
        <EmptyState
          icon="📜"
          title="还没有棋谱"
          hint="和电脑下一盘棋，或者导入一个 SGF 文件。"
        />
      )}

      <div className="game-list">
        {games.map((g) => (
          <div key={g.id} className="game-row card">
            <button className="game-row__main" onClick={() => go({ name: 'review-game', id: g.id })}>
              <div className="game-row__top">
                <span className="game-row__badge">{g.size} 路</span>
                <span className="game-row__result">{g.result ?? '进行中'}</span>
                <span className="tiny mute-2">
                  {new Date(g.startedAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <div className="game-row__players">
                <span>
                  <b>黑</b> {g.black}
                </span>
                <span className="mute-2">·</span>
                <span>
                  <b>白</b> {g.white}
                </span>
                <span className="tiny mute-2">{g.moves.length} 手</span>
              </div>
            </button>
            <div className="game-row__actions">
              <a
                className="btn btn--sm btn--ghost"
                href={sgfDataUrl(g)}
                download={`gomaster-${g.id}.sgf`}
                onClick={(e) => e.stopPropagation()}
              >
                导出
              </a>
              <button className="btn btn--sm btn--ghost" onClick={() => setDeleteId(g.id)} aria-label="删除棋谱">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      <Sheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="导入 SGF 棋谱"
        footer={
          <div className="row" style={{ gap: 10 }}>
            <label className="btn grow" style={{ cursor: 'pointer' }}>
              选文件
              <input
                type="file"
                accept=".sgf,text/plain"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImportText(await f.text());
                }}
              />
            </label>
            <button className="btn btn--primary grow" onClick={importSGF} disabled={!importText.trim()}>
              导入
            </button>
          </div>
        }
      >
        <label className="field">
          <span className="field__label">粘贴 SGF 内容</span>
          <textarea
            className="input"
            rows={8}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="(;GM[1]FF[4]SZ[9]KM[6.5];B[ee];W[cc]…)"
            aria-label="SGF 内容"
          />
        </label>
        <p className="tiny mute-2" style={{ marginTop: 8 }}>
          支持 GM[1] FF[4]，9/13/19 路。导入时会逐手校验，不合法的棋谱不会保存。
        </p>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="删除这盘棋谱？"
        body="删除后无法恢复，但不会影响你的其他进度。"
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) void deleteGame(deleteId).then(refresh);
          setDeleteId(null);
        }}
      />
      <span className="sr-only">{profile.name}</span>
    </div>
  );
}

function sgfDataUrl(rec: GameRecord): string {
  const sgf = toSGF(rec);
  return `data:application/x-go-sgf;charset=utf-8,${encodeURIComponent(sgf)}`;
}

/* ------------------------------------------------------------------------- */
/* Single game replay                                                        */
/* ------------------------------------------------------------------------- */

export function GameReplayPage({ gameId, go }: { gameId: string; go: Navigate }) {
  const [record, setRecord] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<GoBoard[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timer = useRef(0);

  useEffect(() => {
    getGames<GameRecord>().then((all) => {
      const rec = all.find((g) => g.id === gameId) ?? null;
      setRecord(rec);
      if (rec) {
        try {
          setPositions(positionsFromRecord(rec));
        } catch (err) {
          toast({ icon: '⚠️', title: '无法回放', body: (err as Error).message });
        }
      }
      setLoading(false);
    });
  }, [gameId]);

  const total = positions.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => setStep((s) => Math.min(total, s + 1)), 700 / speed);
    return () => window.clearTimeout(timer.current);
  }, [playing, step, total, speed]);

  const board = positions[Math.min(step, positions.length - 1)];
  const marks = useMemo(() => {
    if (!board || board.lastMove < 0) return [];
    return [{ index: board.lastMove, kind: 'target' as const }];
  }, [board]);

  if (loading) return <div className="page muted">正在读取棋谱…</div>;
  if (!record || !board) {
    return (
      <div className="page">
        <EmptyState icon="🔍" title="找不到这盘棋谱" hint="它可能已经被删除了。" />
        <button className="btn" style={{ marginTop: 12 }} onClick={() => go({ name: 'review' })}>
          返回棋谱列表
        </button>
      </div>
    );
  }

  return (
    <div className="page page--wide">
      <div className="row row--between" style={{ marginBottom: 12 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => go({ name: 'review' })}>
          ← 棋谱列表
        </button>
        <div className="row" style={{ gap: 8 }}>
          <Chip>{record.size} 路</Chip>
          <Chip tone="green">{record.result ?? '进行中'}</Chip>
        </div>
      </div>

      <div className="replay">
        <div className="replay__board">
          <GoBoardCanvas
            size={board.size}
            cells={board.cells}
            interactive={false}
            marks={marks}
            showCoordinates={record.size === 19}
            maxSize={640}
            ariaLabel="棋谱回放棋盘"
          />
          <div className="replay__controls">
            <button className="btn btn--sm" onClick={() => setStep(0)} aria-label="回到开始">
              ⏮
            </button>
            <button className="btn btn--sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              上一步
            </button>
            <button className="btn btn--sm btn--primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? '暂停' : '自动播放'}
            </button>
            <button className="btn btn--sm" onClick={() => setStep((s) => Math.min(total, s + 1))} disabled={step >= total}>
              下一步
            </button>
            <button className="btn btn--sm" onClick={() => setStep(total)} aria-label="跳到末尾">
              ⏭
            </button>
            <div className="row" style={{ gap: 4 }}>
              {[0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  className={`speed ${speed === s ? 'speed--on' : ''}`}
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="replay__slider">
            <input
              type="range"
              min={0}
              max={total}
              value={step}
              onChange={(e) => setStep(Number(e.target.value))}
              aria-label="跳到指定步数"
            />
            <div className="row row--between tiny mute-2">
              <span>
                第 {step} / {total} 手
              </span>
              <span>{record.komi} 目贴目</span>
            </div>
          </div>
        </div>

        <aside className="replay__side">
          <div className="card card--pad">
            <h2 className="h3">对局信息</h2>
            <dl className="kv">
              <div>
                <dt>黑棋</dt>
                <dd>{record.black}</dd>
              </div>
              <div>
                <dt>白棋</dt>
                <dd>{record.white}</dd>
              </div>
              <div>
                <dt>结果</dt>
                <dd>{record.result ?? '未结束'}</dd>
              </div>
              <div>
                <dt>时间</dt>
                <dd>{new Date(record.startedAt).toLocaleString('zh-CN')}</dd>
              </div>
            </dl>
            <a className="btn btn--block" href={sgfDataUrl(record)} download={`gomaster-${record.id}.sgf`} style={{ marginTop: 14 }}>
              导出 SGF
            </a>
          </div>

          <div className="card card--pad">
            <h2 className="h3">落子记录</h2>
            <div className="move-list">
              {record.moves.map((m, i) => (
                <button
                  key={i}
                  className={`move-chip ${i + 1 === step ? 'move-chip--on' : ''}`}
                  onClick={() => setStep(i + 1)}
                >
                  <span className={`move-chip__dot ${m.color === BLACK ? 'is-black' : 'is-white'}`} />
                  {m.pass ? '停一手' : m.at}
                </button>
              ))}
              {record.moves.length === 0 && <p className="tiny mute-2">没有落子记录。</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

void BLACK;
void WHITE;
