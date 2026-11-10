import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE } from '../../engine/GoBoard/types';
import { useStore } from '../../app/store';
import { playTone } from '../../app/sound';
import { toast } from '../../components/Shell/Toast';
import type { MarkView } from '../../components/Board/renderer';
import { Chip } from '../../components/Progress/Progress';

/**
 * Free practice.
 *
 * - play freely with either colour, undo, clear
 * - tap a block to highlight its liberties (tap again to clear)
 * - save / load board shapes locally
 */
export function PracticePage() {
  const { profile, updateSettings, saveShapes } = useStore();
  const [board, setBoard] = useState(() => new GoBoard(9));
  const [selected, setSelected] = useState<number[] | null>(null);
  const [liberties, setLiberties] = useState<number[]>([]);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [shapeName, setShapeName] = useState('');
  const historyRef = useRef<GoBoard[]>([]);
  /** Mirrors historyRef.length so the UI re-renders when moves are added. */
  const [historyCount, setHistoryCount] = useState(0);
  /** Replay mode: -1 = live board, otherwise the move number being shown. */
  const [replayAt, setReplayAt] = useState(-1);
  const [playing, setPlaying] = useState(false);
  /** Colour every connected block when true (shows the block structure). */
  const [showGroups, setShowGroups] = useState(false);

  const toggleGroup = useCallback(
    (index: number) => {
      if (board.cells[index] === 0) {
        setSelected(null);
        setLiberties([]);
        return;
      }
      const g = board.group(index);
      const same = selected && selected.length === g.stones.length && selected.every((s) => g.stones.includes(s));
      if (same) {
        setSelected(null);
        setLiberties([]);
        return;
      }
      setSelected(g.stones);
      setLiberties(g.liberties);
      if (profile.settings.sound) playTone('click');
    },
    [board, selected, profile.settings.sound],
  );

  const play = useCallback(
    (index: number) => {
      // Clicking an occupied point inspects it instead of playing.
      if (board.cells[index] !== 0) {
        toggleGroup(index);
        return false;
      }
      const copy = board.clone();
      const res = copy.play(index);
      if (!res.ok) {
        toast({
          icon: '⛔︎',
          title: '这一手不能下',
          body:
            res.reason === 'suicide'
              ? '禁入点：下进去自己就没有气了。'
              : res.reason === 'ko'
                ? '打劫：不能马上提回。'
                : res.reason === 'superko'
                  ? '会重复棋盘，不能下。'
                  : '这个点不能落子。',
        });
        return false;
      }
      historyRef.current.push(board.clone());
      setHistoryCount(historyRef.current.length);
      setBoard(copy);
      setReplayAt(-1);
      setPlaying(false);
      setSelected(null);
      setLiberties([]);
      if (profile.settings.sound) playTone(res.captured.length ? 'capture' : 'place');
      return true;
    },
    [board, profile.settings.sound, toggleGroup],
  );

  /** The board currently displayed (live, or a replayed earlier position). */
  const viewBoard = useMemo(() => {
    if (replayAt < 0 || replayAt >= historyRef.current.length) return board;
    return historyRef.current[replayAt];
  }, [board, replayAt]);

  const marks = useMemo<MarkView[]>(() => {
    const out: MarkView[] = [];
    for (const l of liberties) out.push({ index: l, kind: 'liberty' });
    if (showAllGroups) {
      for (const g of viewBoard.allGroups()) {
        if (g.liberties.length === 1)
          for (const l of g.liberties) out.push({ index: l, kind: 'target', color: 'rgba(179,64,47,.9)' });
      }
    }
    if (showGroups) {
      // Label each block with a letter so the learner can see which stones are
      // connected — without changing the position in any way.
      const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
      viewBoard
        .allGroups()
        .slice(0, 24)
        .forEach((g, i) => {
          const root = Math.min(...g.stones);
          out.push({
            index: root,
            kind: 'label',
            text: letters[i],
            color: g.color === BLACK ? 'rgba(30,79,122,.92)' : 'rgba(31,107,79,.92)',
          });
        });
    }
    return out;
  }, [liberties, showAllGroups, showGroups, viewBoard]);

  // Replay timer.
  useEffect(() => {
    if (!playing) return;
    if (historyRef.current.length === 0) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setReplayAt((cur) => {
        const next = cur + 1;
        if (next >= historyRef.current.length) {
          setPlaying(false);
          return historyRef.current.length - 1;
        }
        return next;
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [playing, replayAt]);

  const saved = useMemo(() => profile.shapes ?? [], [profile.shapes]);

  return (
    <div className="page page--wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">自由练习</p>
          <h1 className="h1">摆棋、数气、看连接</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            点一下棋盘上的棋子，就能看到这块棋所有的气；再点一次取消。
          </p>
        </div>
        <Chip tone="blue">不限步数</Chip>
      </header>

      <div className="practice">
        <div className="practice__board">
          <GoBoardCanvas
            key={board.size}
            size={viewBoard.size}
            cells={viewBoard.cells}
            onPlay={replayAt >= 0 ? undefined : play}
            onSelectGroup={replayAt >= 0 ? undefined : toggleGroup}
            selectable={false}
            turn={viewBoard.turn}
            lastMove={replayAt >= 0 ? -1 : board.lastMove}
            marks={marks}
            selected={selected ?? []}
            showCoordinates={profile.settings.coordinates}
            maxSize={680}
            ariaLabel="自由练习棋盘"
          />
          <div className="practice__hintline tiny mute-2">
            {replayAt >= 0
              ? `回放中：第 ${replayAt + 1} / ${historyCount} 手（棋盘只读）`
              : selected
                ? `已选中 ${selected.length} 颗棋子，共 ${liberties.length} 口气（蓝色圆点）`
                : '点一颗棋子查看它的气'}
          </div>

          <div className="practice__replay">
            <button
              className="btn btn--sm"
              disabled={historyCount === 0}
              onClick={() => {
                setPlaying(false);
                setReplayAt(0);
              }}
            >
              ⏮ 从头看
            </button>
            <button
              className="btn btn--sm"
              disabled={replayAt <= 0}
              onClick={() => {
                setPlaying(false);
                setReplayAt((c) => Math.max(0, c - 1));
              }}
            >
              上一步
            </button>
            <button
              className="btn btn--sm btn--primary"
              disabled={historyCount === 0}
              onClick={() => {
                if (replayAt < 0) setReplayAt(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? '⏸ 暂停' : '▶ 播放落子过程'}
            </button>
            <button
              className="btn btn--sm"
              disabled={replayAt < 0 || replayAt >= historyCount - 1}
              onClick={() => {
                setPlaying(false);
                setReplayAt((c) => Math.min(historyCount - 1, c + 1));
              }}
            >
              下一步
            </button>
            <button
              className="btn btn--sm btn--ghost"
              disabled={replayAt < 0}
              onClick={() => {
                setPlaying(false);
                setReplayAt(-1);
              }}
            >
              回到当前
            </button>
            <span className="tiny mute-2">已下 {historyCount} 手</span>
          </div>
        </div>

        <aside className="practice__side">
          <div className="card card--pad">
            <h2 className="h3">落子</h2>
            <div className="segmented" style={{ marginTop: 10 }}>
              <button
                className={`segmented__item ${board.turn === BLACK ? 'segmented__item--on' : ''}`}
                onClick={() => {
                  const b = board.clone();
                  b.turn = BLACK;
                  setBoard(b);
                }}
              >
                轮到黑棋
              </button>
              <button
                className={`segmented__item ${board.turn === WHITE ? 'segmented__item--on' : ''}`}
                onClick={() => {
                  const b = board.clone();
                  b.turn = WHITE;
                  setBoard(b);
                }}
              >
                轮到白棋
              </button>
            </div>
            <div className="practice__actions">
              <button
                className="btn"
                onClick={() => {
                  setBoard((b) => {
                    const c = b.clone();
                    c.undo();
                    return c;
                  });
                  historyRef.current.pop();
                  setHistoryCount(historyRef.current.length);
                  setReplayAt(-1);
                  setSelected(null);
                  setLiberties([]);
                }}
                disabled={board.history.length === 0}
              >
                撤销
              </button>
              <button
                className="btn"
                onClick={() => {
                  const b = new GoBoard(board.size);
                  setBoard(b);
                  setSelected(null);
                  setLiberties([]);
                  historyRef.current = [];
                  setHistoryCount(0);
                  setReplayAt(-1);
                  setPlaying(false);
                }}
              >
                清空
              </button>
              <label className="field grow" style={{ minWidth: 120 }}>
                <select
                  className="input"
                  value={board.size}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    setBoard(new GoBoard(size));
                    setSelected(null);
                    setLiberties([]);
                  }}
                  aria-label="棋盘大小"
                >
                  <option value={9}>9 路</option>
                  <option value={13}>13 路</option>
                  <option value={19}>19 路</option>
                </select>
              </label>
            </div>
          </div>

          <div className="card card--pad">
            <h2 className="h3">查看</h2>
            <label className="switch" style={{ marginTop: 10 }}>
              <span>标出所有被打吃的棋</span>
              <input
                type="checkbox"
                checked={showAllGroups}
                onChange={(e) => setShowAllGroups(e.target.checked)}
              />
              <i aria-hidden />
            </label>
            <label className="switch">
              <span>标出棋块连接（每块一个字母）</span>
              <input
                type="checkbox"
                checked={showGroups}
                onChange={(e) => setShowGroups(e.target.checked)}
              />
              <i aria-hidden />
            </label>
            <label className="switch">
              <span>显示棋盘坐标</span>
              <input
                type="checkbox"
                checked={profile.settings.coordinates}
                onChange={(e) => updateSettings({ coordinates: e.target.checked })}
              />
              <i aria-hidden />
            </label>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                className="btn btn--sm"
                onClick={() => {
                  const groups = board.allGroups();
                  if (!groups.length) return;
                  const biggest = groups.sort((a, b) => b.stones.length - a.stones.length)[0];
                  setSelected(biggest.stones);
                  setLiberties(biggest.liberties);
                }}
              >
                选中最大一块棋
              </button>
              <button
                className="btn btn--sm"
                onClick={() => {
                  const atari = board.atariGroups();
                  if (!atari.length) {
                    toast({ icon: '🔍', title: '现在没有被吃住的棋' });
                    return;
                  }
                  setSelected(atari[0].stones);
                  setLiberties(atari[0].liberties);
                }}
              >
                查看打吃中的棋
              </button>
            </div>
          </div>

          <div className="card card--pad">
            <h2 className="h3">保存棋形</h2>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <input
                className="input grow"
                value={shapeName}
                onChange={(e) => setShapeName(e.target.value)}
                placeholder="给这个棋形起个名字"
                aria-label="棋形名称"
              />
              <button
                className="btn btn--sm"
                onClick={() => {
                  const name = shapeName.trim() || `棋形 ${saved.length + 1}`;
                  const cells = Array.from(board.cells);
                  const next = [...saved, { id: `s-${Date.now()}`, name, size: board.size, cells, at: Date.now() }];
                  saveShapes(next);
                  setShapeName('');
                  toast({ icon: '💾', title: `已保存「${name}」` });
                }}
              >
                保存
              </button>
            </div>
            <p className="tiny mute-2" style={{ marginTop: 6 }}>
              棋形只保存在本机，用来快速回到某个局面。
            </p>
            <div className="shape-list">
              {saved.length === 0 && <p className="tiny mute-2">还没有保存过棋形。</p>}
              {saved.map((s) => (
                <div key={s.id} className="shape-row">
                  <button
                    className="grow shape-row__load"
                    onClick={() => {
                      const b = new GoBoard(s.size);
                      for (let i = 0; i < s.cells.length; i++) b.cells[i] = s.cells[i];
                      setBoard(b);
                      setSelected(null);
                      setLiberties([]);
                      toast({ icon: '📂', title: `已载入「${s.name}」` });
                    }}
                  >
                    <span className="shape-row__name">{s.name}</span>
                    <span className="tiny mute-2">{s.size} 路</span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="删除棋形"
                    onClick={() => {
                      saveShapes(saved.filter((x) => x.id !== s.id));
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
