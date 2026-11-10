import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE, type Color, type ScoreResult } from '../../engine/GoBoard/types';
import { GoAI, type Difficulty } from '../../engine/AI/GoAI';
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

const DIFFICULTIES: Array<{ level: Difficulty; name: string; blurb: string }> = [
  { level: 1, name: '入门', blurb: '随机落子，只保证不犯规。适合刚学会规则的人。' },
  { level: 2, name: '初级', blurb: '会吃子、会逃跑，但看不清全局。' },
  { level: 3, name: '中级', blurb: '能识别打吃、连接和简单的断点。' },
  { level: 4, name: '高级', blurb: '会算一步攻防，重视角地与边上。' },
  { level: 5, name: '挑战', blurb: '本地最强：带一层反击评估的战术搜索（非神经网络引擎）。' },
];

const SIZES = [9, 13, 19] as const;

export function BattlePage({ go }: { go: Navigate }) {
  const { profile, updateSettings, recordGame } = useStore();
  const [size, setSize] = useState<number>(9);
  const [difficulty, setDifficulty] = useState<Difficulty>(2);
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

  const humanColor: Color = aiColor === BLACK ? WHITE : BLACK;
  const ai = useMemo(() => new GoAI(difficulty, Math.floor(Math.random() * 100000)), [difficulty, size]);
  const gameOver = board.passes >= 2;

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
    const delay = 420 + Math.random() * 320;
    const timer = window.setTimeout(() => {
      const move = ai.choose(board, aiColor);
      const copy = board.clone();
      if (move < 0 || copy.legalMoves(aiColor).length === 0) copy.pass(aiColor);
      else copy.play(move, aiColor);
      setBoard(copy);
      setThinking(false);
      aiBusy.current = false;
      if (profile.settings.sound && move >= 0) playTone('place');
    }, delay);
    return () => {
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
    <div className="page page--wide">
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
            maxSize={640}
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
          </div>

          {lastHint && (
            <p className="battle__hint" role="status">
              {lastHint}
            </p>
          )}
        </div>

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
            <p className="tiny muted">
              内置电脑对手是本地运行的战术搜索程序：能正确地吃子、逃跑、打吃和做眼，但没有神经网络棋力。
              它不会伪装成职业引擎——「挑战」档也只是这一套算法里最强的设置。
            </p>
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
            <p className="tiny muted" style={{ marginTop: 12 }}>
              棋盘上的空点如果同时挨着黑白双方，算作「双活/中立」，不计入任何一方（共 {scoring.neutral} 点）。
              死子会以 ✕ 标出，你也可以直接点棋盘上的棋子切换死活判定。
            </p>
            <p className="tiny mute-2" style={{ marginTop: 8 }}>
              当前采用{scoring.method === 'chinese' ? '中国规则（数子法）' : '日本规则（数目法）'}。
            </p>
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

      <div className="battle__footer tiny mute-2">
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
