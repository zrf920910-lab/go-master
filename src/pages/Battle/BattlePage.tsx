import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE, type Color, type ScoreResult } from '../../engine/GoBoard/types';
import type { AILevel } from '../../ai/types';
import { createProvider, LEVEL_INFO, type AISettings } from '../../ai/registry';
import { TeacherPanel } from '../../components/Teacher/TeacherPanel';
import { KataGoPanel } from '../../components/Teacher/KataGoPanel';
import { scoreBoard, describeScore, autoDetectDead } from '../../engine/Scoring/scoring';
import { useStore } from '../../app/store';
import type { Navigate } from '../../app/router';
import type { GameRecord } from '../../app/types';
import { Sheet, ConfirmDialog } from '../../components/Shell/Sheet';
import { playTone } from '../../app/sound';
import { putGame } from '../../services/storage/storage';
import { toast } from '../../components/Shell/Toast';

/**
 * Battle mode: a complete, rules-correct game against the built-in opponent.
 *
 * The AI is honestly labelled. It is a tactical search, not a neural network;
 * the page says so instead of pretending to be a professional engine.
 */

const DIFFICULTIES: Array<{ level: AILevel; name: string; blurb: string }> = ([1, 2, 3, 4, 5] as AILevel[]).map(
  (level) => ({ level, name: LEVEL_INFO[level].name, blurb: LEVEL_INFO[level].blurb }),
);

const SIZES = [9, 13, 19] as const;

export function BattlePage({ go }: { go: Navigate }) {
  const { profile, updateSettings, recordGame } = useStore();
  const [size, setSize] = useState<number>(9);
  const [difficulty, setDifficulty] = useState<AILevel>(2);
  const [aiColor, setAiColor] = useState<Color>(WHITE);
  const [board, setBoard] = useState<GoBoard>(() => new GoBoard(9));
  const [thinking, setThinking] = useState(false);
  const [scoring, setScoring] = useState<ScoreResult | null>(null);
  const [deadPoints, setDeadPoints] = useState<Set<number>>(new Set());
  const [confirmNew, setConfirmNew] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lastHint, setLastHint] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const aiBusy = useRef(false);

  // The engine is chosen through the same registry the settings UI uses, so a
  // remote KataGo service can be swapped in without touching this page's logic.
  const aiSettings = useMemo<AISettings>(
    () => ({ kind: 'local', level: difficulty, seed: 20240101 }),
    [difficulty],
  );
  const ai = useMemo(() => createProvider(aiSettings), [aiSettings]);
  const [aiError, setAiError] = useState<string | null>(null);
  const [teacherOn, setTeacherOn] = useState(true);
  const [focusPoint, setFocusPoint] = useState<number | undefined>(undefined);
  const [panel, setPanel] = useState<'teacher' | 'katago'>('teacher');
  /** Fullscreen play: the board owns the screen, settings collapse to a toolbar.
      Opt-in (never forced): the choice is remembered per device. */
  const [immersive, setImmersive] = useState(() => {
    try {
      return localStorage.getItem('gomaster.battle.immersive') === '1';
    } catch {
      return false;
    }
  });
  const [toolbarOpen, setToolbarOpen] = useState(false);

  const humanColor: Color = aiColor === BLACK ? WHITE : BLACK;
  const gameOver = board.passes >= 2;

  // Remember the fullscreen choice; never auto-enter, so the teaching panel
  // stays visible until the learner explicitly asks for a distraction-free board.
  useEffect(() => {
    try {
      localStorage.setItem('gomaster.battle.immersive', immersive ? '1' : '0');
    } catch {
      /* private mode */
    }
  }, [immersive]);

  // Tell the shell to hide its chrome while playing fullscreen.
  useEffect(() => {
    document.body.classList.toggle('zen-mode', immersive);
    return () => document.body.classList.remove('zen-mode');
  }, [immersive]);

  // Escape leaves fullscreen play, which is what people expect from a modal.
  useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setToolbarOpen(false);
        setImmersive(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [immersive]);

  // Also offer the browser's real fullscreen; ignore rejection (iOS Safari).
  const enterBrowserFullscreen = useCallback(async () => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      /* fullscreen is a bonus, never a requirement */
    }
  }, []);

  const newGame = useCallback(
    (nextSize = size, nextDiff = difficulty, nextAi = aiColor) => {
      const b = new GoBoard(nextSize);
      setBoard(b);
      setSize(nextSize);
      setDifficulty(nextDiff);
      setAiColor(nextAi);
      setScoring(null);
      setDeadPoints(new Set());
      setLastHint(null);
      startedAt.current = Date.now();
      aiBusy.current = false;
    },
    [aiColor, difficulty, size],
  );

  const playMove = useCallback(
    (index: number) => {
      if (gameOver || scoring) return false;
      if (board.turn !== humanColor) return false;
      const res = board.play(index);
      if (!res.ok) {
        setLastHint(
          res.reason === 'suicide'
            ? '这是禁入点：下进去自己就没有气了。'
            : res.reason === 'ko'
              ? '打劫规则：这里不能马上提回。'
              : res.reason === 'superko'
                ? '这一手会让棋局回到之前的样子（全局同形），不能下。'
                : '这个位置不能下。',
        );
        return false;
      }
      setLastHint(null);
      setFocusPoint(index);
      setBoard(board.clone());
      if (profile.settings.sound) playTone(res.captured.length ? 'capture' : 'place');
      return true;
    },
    [board, gameOver, humanColor, profile.settings.sound, scoring],
  );

  // AI turn
  useEffect(() => {
    if (scoring || gameOver) return;
    if (board.turn !== aiColor) return;
    if (aiBusy.current) return;
    aiBusy.current = true;
    setThinking(true);
    const delay = 320 + Math.random() * 220;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const best = await ai.choose({ board, color: aiColor, maxMoves: 1 });
        if (cancelled) return;
        const copy = board.clone();
        if (best.move < 0 || copy.legalMoves(aiColor).length === 0) copy.pass(aiColor);
        else if (!copy.play(best.move, aiColor).ok) copy.pass(aiColor);
        setBoard(copy);
        setAiError(null);
        if (profile.settings.sound && best.move >= 0) playTone('place');
      } catch (err) {
        if (!cancelled) setAiError(`引擎出错：${(err as Error).message}`);
      } finally {
        if (!cancelled) {
          setThinking(false);
          aiBusy.current = false;
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setThinking(false);
      aiBusy.current = false;
    };
  }, [board, aiColor, ai, gameOver, scoring, profile.settings.sound]);

  const doScore = useCallback(() => {
    const passive = new GoBoard(board.size, board.cells, board.turn);
    passive.captures = { ...board.captures };
    // Only stones the player has marked are treated as dead at first; the
    // "自动标记" action can suggest more, and any suggestion can be toggled off.
    const result = scoreBoard(passive, board.size, {
      komi: profile.settings.komi,
      ruleset: profile.settings.ruleset,
      dead: [...deadPoints],
    });
    setScoring(result);
  }, [board, deadPoints, profile.settings.komi, profile.settings.ruleset]);

  const resettle = useCallback(
    (dead: Set<number>) => {
      const passive = new GoBoard(board.size, board.cells, board.turn);
      passive.captures = { ...board.captures };
      setScoring(
        scoreBoard(passive, board.size, {
          komi: profile.settings.komi,
          ruleset: profile.settings.ruleset,
          dead: [...dead],
        }),
      );
    },
    [board, profile.settings.komi, profile.settings.ruleset],
  );

  const autoMarkDead = useCallback(() => {
    const passive = new GoBoard(board.size, board.cells, board.turn);
    passive.captures = { ...board.captures };
    const suggested = new Set([...deadPoints, ...autoDetectDead(passive)]);
    setDeadPoints(suggested);
    resettle(suggested);
  }, [board, deadPoints, resettle]);

  const saveGame = useCallback(
    (result?: ScoreResult) => {
      const rec: GameRecord = {
        id: `g-${Date.now()}`,
        size,
        black: aiColor === BLACK ? `电脑（${DIFFICULTIES.find((d) => d.level === difficulty)?.name}）` : profile.name,
        white: aiColor === WHITE ? `电脑（${DIFFICULTIES.find((d) => d.level === difficulty)?.name}）` : profile.name,
        moves: board.history.map((m) => ({
          at:
            m.kind === 'pass'
              ? ''
              : `${'ABCDEFGHJKLMNOPQRST'[m.index % size]}${size - Math.floor(m.index / size)}`,
          color: m.color,
          pass: m.kind === 'pass' ? true : undefined,
        })),
        result: result ? describeScore(result) : gameOver ? '未判定' : '进行中',
        komi: profile.settings.komi,
        ruleset: profile.settings.ruleset,
        startedAt: startedAt.current,
        endedAt: Date.now(),
        aiLevel: difficulty,
        mode: 'battle',
      };
      void putGame(rec);
      recordGame(rec);
      toast({ icon: '💾', title: '棋谱已保存', body: '可以在「棋谱复盘」里回看这一局。' });
    },
    [aiColor, board, difficulty, gameOver, profile.name, profile.settings.komi, profile.settings.ruleset, recordGame, size],
  );

  const resign = useCallback(() => {
    const winner = aiColor === BLACK ? '白棋' : '黑棋';
    const result = `${winner}胜（对手认输）`;
    const rec: GameRecord = {
      id: `g-${Date.now()}`,
      size,
      black: aiColor === BLACK ? '电脑' : profile.name,
      white: aiColor === WHITE ? '电脑' : profile.name,
      moves: board.history.map((m) => ({
        at: m.kind === 'pass' ? '' : `${'ABCDEFGHJKLMNOPQRST'[m.index % size]}${size - Math.floor(m.index / size)}`,
        color: m.color,
        pass: m.kind === 'pass' ? true : undefined,
      })),
      result,
      komi: profile.settings.komi,
      ruleset: profile.settings.ruleset,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      aiLevel: difficulty,
      mode: 'battle',
    };
    void putGame(rec);
    recordGame(rec);
    toast({ icon: '🏳️', title: '已认输', body: '棋谱已保存。' });
    setScoring(null);
    newGame();
  }, [aiColor, board.history, difficulty, newGame, profile.name, profile.settings.komi, profile.settings.ruleset, recordGame, size]);

  const marks = useMemo(() => {
    const out: Array<{ index: number; kind: 'wrong' | 'label'; text?: string }> = [];
    for (const d of deadPoints) out.push({ index: d, kind: 'label', text: '✕' });
    return out;
  }, [deadPoints]);

  const ownership = scoring?.ownership ?? null;

  return (
    <div className={immersive ? 'battle-page battle-page--immersive' : 'battle-page page page--wide'}>
  {immersive && (
      <div className="zen-topbar">
        <button
          className="icon-btn zen-topbar__btn"
          onClick={() => {
            setImmersive(false);
            setToolbarOpen(false);
          }}
          aria-label="退出全屏对弈"
          title="退出全屏对弈"
        >
          ✕
        </button>
        <div className="zen-topbar__players">
          <span className={`zen-player ${board.turn === aiColor ? 'zen-player--active' : ''}`}>
            <span className="zen-stone zen-stone--black" aria-hidden />
            {DIFFICULTIES.find((d) => d.level === difficulty)?.name} · 提 {aiColor === BLACK ? board.captures.black : board.captures.white}
          </span>
          <span className="zen-topbar__vs">对局</span>
          <span className={`zen-player ${board.turn === humanColor ? 'zen-player--active' : ''}`}>
            <span className="zen-stone zen-stone--white" aria-hidden />
            {profile.name} · 提 {humanColor === BLACK ? board.captures.black : board.captures.white}
          </span>
        </div>
        <span className={`chip ${board.turn === humanColor ? 'chip--green' : 'chip--blue'}`}>
          {gameOver ? '已结束' : scoring ? '数子中' : board.turn === humanColor ? '轮到你' : thinking ? '思考中' : '等待电脑'}
        </span>
        <div className="row" style={{ gap: 6 }}>
          <button
            className="icon-btn zen-topbar__btn"
            onClick={enterBrowserFullscreen}
            aria-label="切换系统全屏"
            title="切换系统全屏（Safari 可能不支持）"
          >
            ⛶
          </button>
          <button
            className={`icon-btn zen-topbar__btn ${toolbarOpen ? 'zen-topbar__btn--on' : ''}`}
            onClick={() => setToolbarOpen((v) => !v)}
            aria-label="打开对局工具"
            aria-expanded={toolbarOpen}
            title="对局工具"
          >
            ⚙︎
          </button>
        </div>
      </div>
    )}

        <div className="battle">
        <div className="battle__board">
          <div className="battle__opponent">
            <span className="battle__avatar" aria-hidden>
              🤖
            </span>
            <div className="grow">
              <p className="battle__name">电脑 · {DIFFICULTIES.find((d) => d.level === difficulty)?.name}</p>
              <p className="tiny mute-2">
                执{aiColor === BLACK ? '黑' : '白'} · 提子 {aiColor === BLACK ? board.captures.black : board.captures.white}
              </p>
            </div>
            {thinking && <span className="chip chip--blue">思考中…</span>}
            {gameOver && <span className="chip chip--amber">双方停一手</span>}
          </div>

          <GoBoardCanvas
            size={board.size}
            cells={board.cells}
            onPlay={(idx) => {
              if (!scoring) return playMove(idx);
              // While the result sheet is open, tapping a stone toggles whether
              // it is dead; that is the standard endgame interaction.
              if (board.cells[idx] === 0) return false;
              const next = new Set(deadPoints);
              const group = board.group(idx);
              const allDead = group.stones.every((s) => next.has(s));
              for (const s of group.stones) {
                if (allDead) next.delete(s);
                else next.add(s);
              }
              setDeadPoints(next);
              resettle(next);
              return true;
            }}
            turn={board.turn}
            lastMove={board.lastMove}
            marks={marks}
            ownership={ownership}
            showCoordinates={profile.settings.coordinates || size === 19}
            disabled={Boolean(scoring) ? false : board.turn !== humanColor}
            maxSize={immersive ? 900 : 720}
            heightReserve={immersive ? 150 : 240}
            ariaLabel="对弈棋盘"
          />

          <div className="battle__me">
            <span className="battle__avatar battle__avatar--me" aria-hidden>
              🧑‍🎓
            </span>
            <div className="grow">
              <p className="battle__name">{profile.name}</p>
              <p className="tiny mute-2">
                执{humanColor === BLACK ? '黑' : '白'} · 提子 {humanColor === BLACK ? board.captures.black : board.captures.white}
              </p>
            </div>
            <span className={`turn-pill ${board.turn === humanColor && !scoring && !gameOver ? 'turn-pill--me' : ''}`}>
              {gameOver ? '已结束' : scoring ? '数子中' : board.turn === humanColor ? '轮到你' : '等待电脑'}
            </span>
            {!immersive && (
              <button
                className="btn btn--sm zen-enter"
                onClick={() => setImmersive(true)}
                aria-label="进入全屏对弈"
                title="全屏对弈：棋盘铺满屏幕"
              >
                ⛶ 全屏对弈
              </button>
            )}
          </div>

          {lastHint && (
            <p className="battle__hint" role="status">
              {lastHint}
            </p>
          )}
          {aiError && (
            <p className="battle__hint" role="alert">
              {aiError}
            </p>
          )}
        </div>

        {immersive && toolbarOpen && (
          <div className="zen-toolbar" role="dialog" aria-label="对局工具">
            <div className="zen-toolbar__head">
              <h2 className="h3">对局工具</h2>
              <button className="icon-btn" onClick={() => setToolbarOpen(false)} aria-label="关闭工具">
                ✕
              </button>
            </div>
            <div className="zen-toolbar__grid">
              <button
                className="btn"
                onClick={() => {
                  const copy = board.clone();
                  copy.undo();
                  if (copy.turn !== humanColor) copy.undo();
                  setBoard(copy);
                  setScoring(null);
                }}
                disabled={board.history.length === 0 || gameOver || Boolean(scoring)}
              >
                悔棋
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (board.turn !== humanColor) return;
                  const copy = board.clone();
                  copy.pass();
                  setBoard(copy);
                  setLastHint(null);
                }}
                disabled={board.turn !== humanColor || gameOver || Boolean(scoring)}
              >
                停一手
              </button>
              <button className="btn" onClick={doScore} disabled={board.history.length < 4}>
                结算
              </button>
              <button className="btn btn--danger" onClick={resign} disabled={board.history.length === 0}>
                认输
              </button>
              <button className="btn" onClick={() => setConfirmNew(true)}>重新开始</button>
              <button className="btn" onClick={() => saveGame(scoring ?? undefined)} disabled={board.history.length === 0}>
                保存棋谱
              </button>
              <button className="btn" onClick={() => setShowHelp(true)}>规则说明</button>
              <button
                className="btn"
                onClick={() => updateSettings({ coordinates: !profile.settings.coordinates })}
                aria-pressed={profile.settings.coordinates}
              >
                {profile.settings.coordinates ? '隐藏坐标' : '显示坐标'}
              </button>
            </div>
          </div>
        )}

        <aside className="battle__side">
          <div className="card card--pad">
            <h2 className="h3">对局设置</h2>
            <div className="field">
              <span className="field__label">棋盘</span>
              <div className="segmented">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    className={`segmented__item ${size === s ? 'segmented__item--on' : ''}`}
                    onClick={() => newGame(s)}
                    aria-pressed={size === s}
                  >
                    {s} 路
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">电脑水平</span>
              <div className="diff-list">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.level}
                    className={`diff ${difficulty === d.level ? 'diff--on' : ''}`}
                    onClick={() => {
                      setDifficulty(d.level);
                      newGame(size, d.level);
                    }}
                    aria-pressed={difficulty === d.level}
                  >
                    <span className="diff__dot" style={{ opacity: 0.25 + d.level * 0.15 }} />
                    <span className="grow">
                      <span className="diff__name">{d.name}</span>
                      <span className="diff__blurb tiny">{d.blurb}</span>
                    </span>
                    {difficulty === d.level && <span aria-hidden>✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">你执</span>
              <div className="segmented">
                <button
                  className={`segmented__item ${humanColor === BLACK ? 'segmented__item--on' : ''}`}
                  onClick={() => newGame(size, difficulty, WHITE)}
                >
                  黑棋（先手）
                </button>
                <button
                  className={`segmented__item ${humanColor === WHITE ? 'segmented__item--on' : ''}`}
                  onClick={() => newGame(size, difficulty, BLACK)}
                >
                  白棋
                </button>
              </div>
            </div>
          </div>

          <div className="card card--pad">
            <h2 className="h3">对局操作</h2>
            <div className="op-grid">
              <button
                className="btn"
                onClick={() => {
                  const copy = board.clone();
                  copy.undo();
                  if (copy.turn !== humanColor) copy.undo();
                  setBoard(copy);
                  setScoring(null);
                }}
                disabled={board.history.length === 0 || gameOver || Boolean(scoring)}
              >
                悔棋
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (board.turn !== humanColor) return;
                  const copy = board.clone();
                  copy.pass();
                  setBoard(copy);
                  setLastHint(null);
                }}
                disabled={board.turn !== humanColor || gameOver || Boolean(scoring)}
              >
                停一手
              </button>
              <button className="btn" onClick={doScore} disabled={board.history.length < 4}>
                结算
              </button>
              <button className="btn btn--danger" onClick={resign} disabled={board.history.length === 0}>
                认输
              </button>
              <button className="btn" onClick={() => setConfirmNew(true)}>
                重新开始
              </button>
              <button className="btn" onClick={() => saveGame(scoring ?? undefined)} disabled={board.history.length === 0}>
                保存棋谱
              </button>
              <button className="btn" onClick={() => setShowHelp(true)}>
                规则说明
              </button>
              <button
                className="btn"
                onClick={() => updateSettings({ coordinates: !profile.settings.coordinates })}
                aria-pressed={profile.settings.coordinates}
              >
                {profile.settings.coordinates ? '隐藏坐标' : '显示坐标'}
              </button>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label className="switch">
                <span>贴目 {profile.settings.komi}</span>
                <input
                  type="range"
                  min={0}
                  max={8}
                  step={0.5}
                  value={profile.settings.komi}
                  onChange={(e) => updateSettings({ komi: Number(e.target.value) })}
                  aria-label="贴目"
                />
                <i aria-hidden />
              </label>
              <div className="segmented" style={{ marginTop: 10 }}>
                <button
                  className={`segmented__item ${profile.settings.ruleset === 'chinese' ? 'segmented__item--on' : ''}`}
                  onClick={() => updateSettings({ ruleset: 'chinese' })}
                >
                  中国规则
                </button>
                <button
                  className={`segmented__item ${profile.settings.ruleset === 'japanese' ? 'segmented__item--on' : ''}`}
                  onClick={() => updateSettings({ ruleset: 'japanese' })}
                >
                  日本规则
                </button>
              </div>
            </div>
          </div>

          <div className="card card--pad battle__info">
            <h2 className="h3">棋力说明</h2>
            <p className="tiny muted">{LEVEL_INFO[difficulty].measurable}</p>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              内置电脑对手是本地运行的战术搜索程序：能正确地吃子、逃跑、打吃和做眼，但没有神经网络棋力。
              上表的「实测依据」是这一档真正启用的判断能力，不是改个名字。
            </p>
          </div>

          <div className="card card--pad battle__panel">
            <div className="segmented" style={{ marginBottom: 12 }}>
              <button
                className={`segmented__item ${panel === 'teacher' ? 'segmented__item--on' : ''}`}
                onClick={() => setPanel('teacher')}
              >
                AI 老师
              </button>
              <button
                className={`segmented__item ${panel === 'katago' ? 'segmented__item--on' : ''}`}
                onClick={() => setPanel('katago')}
              >
                KataGo
              </button>
            </div>
            {panel === 'teacher' ? (
              <TeacherPanel
                board={board}
                color={board.turn}
                focus={focusPoint}
                teacherOn={teacherOn}
                onToggle={setTeacherOn}
                onPlaySuggestion={(i) => {
                  if (board.turn !== humanColor) return;
                  playMove(i);
                }}
                compact
              />
            ) : (
              <KataGoPanel
                board={board}
                color={board.turn}
                onPlay={(i) => {
                  if (board.turn === humanColor) playMove(i);
                }}
              />
            )}
          </div>
        </aside>
      </div>

      <Sheet
        open={Boolean(scoring)}
        onClose={() => setScoring(null)}
        title="数子结果"
        footer={
          <div className="row" style={{ gap: 10 }}>
            <button className="btn" onClick={autoMarkDead}>
              自动标死子
            </button>
            <button className="btn grow" onClick={() => setScoring(null)}>
              继续下
            </button>
            <button className="btn btn--primary grow" onClick={() => saveGame(scoring ?? undefined)}>
              保存并结束
            </button>
          </div>
        }
      >
        {scoring && (
          <div className="score-sheet">
            <p className="h2">{describeScore(scoring)}</p>
            <div className="score-card">
              <div className="score-card__side">
                <span className="score-card__dot score-card__dot--black" />
                <div>
                  <p className="h3">黑棋 {scoring.black}</p>
                  <p className="tiny mute-2">
                    {scoring.method === 'chinese' ? '子数' : '地'} {scoring.blackStones}
                    {scoring.method === 'chinese' ? ` + 空 ${scoring.blackTerritory}` : ` + 空 ${scoring.blackTerritory}`}
                  </p>
                </div>
              </div>
              <div className="score-card__side">
                <span className="score-card__dot score-card__dot--white" />
                <div>
                  <p className="h3">白棋 {scoring.white}</p>
                  <p className="tiny mute-2">
                    {scoring.method === 'chinese' ? '子数' : '地'} {scoring.whiteStones} + 空 {scoring.whiteTerritory} +
                    贴目 {scoring.komi}
                  </p>
                </div>
              </div>
            </div>
            <div className="score-analysis">
              <h3 className="h3">棋盘分析</h3>
              <ul className="summary-list">
                <li>
                  黑棋：{scoring.blackStones} 颗子，围出 {scoring.blackTerritory} 点空，合计 {scoring.black}。
                </li>
                <li>
                  白棋：{scoring.whiteStones} 颗子，围出 {scoring.whiteTerritory} 点空，加贴目 {scoring.komi}，合计{' '}
                  {scoring.white}。
                </li>
                <li>
                  双方都不能围成空的中立点：{scoring.neutral} 点（这些点不算给任何一方）。
                </li>
                <li>
                  {scoring.winner === 'draw'
                    ? '双方盘面相同，本局和棋。'
                    : `${scoring.winner === 1 ? '黑棋' : '白棋'}领先 ${scoring.margin} 点，${
                        scoring.winner === 1 ? '白棋' : '黑棋'
                      }需要在别处多围 ${Math.ceil(scoring.margin)} 点才能追上。`}
                </li>
              </ul>
              <p className="tiny muted" style={{ marginTop: 10 }}>
                死子会以 ✕ 标出。你可以直接点棋盘上的棋子切换死活判定，分数会立即重算。
                采用{scoring.method === 'chinese' ? '中国规则（数子法）' : '日本规则（数目法）'}。
              </p>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={showHelp} onClose={() => setShowHelp(false)} title="对局规则">
        <ul className="summary-list">
          <li>黑棋先下，双方轮流在交叉点落子。</li>
          <li>没有气的棋子会被提走；不能下在让自己没气的点上（禁入点）。</li>
          <li>打劫时不能立刻提回，需要先在别处下一手。</li>
          <li>连续两次停一手，对局结束，进入数子。</li>
          <li>中国规则数「子 + 空」，日本规则数「空 + 提子」，白棋都要加贴目。</li>
          <li>棋盘上标记 ✕ 的子是死子，点它可以切换判定。</li>
        </ul>
      </Sheet>

      <ConfirmDialog
        open={confirmNew}
        title="重新开始一局？"
        body="当前这一局的落子记录会被清空（已保存的棋谱不受影响）。"
        confirmLabel="重新开始"
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => {
          setConfirmNew(false);
          newGame();
        }}
      />

      <div className={`battle__footer tiny mute-2 ${immersive ? 'battle__footer--zen' : ''}`}>
        <span>
          {DIFFICULTIES.find((d) => d.level === difficulty)?.name} 档 · 第 {board.history.length} 手 · 贴目{' '}
          {profile.settings.komi}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={() => go({ name: 'review' })}>
          查看棋谱
        </button>
      </div>
      <div className="sr-only" aria-live="polite">
        {thinking ? '电脑正在思考' : board.turn === humanColor ? '轮到你落子' : '等待电脑'}
        {scoring ? describeScore(scoring) : ''}
      </div>
    </div>
  );
}
