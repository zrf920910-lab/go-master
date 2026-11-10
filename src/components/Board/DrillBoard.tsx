import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../Board/GoBoardCanvas';
import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { BLACK, WHITE, opposite } from '../../engine/GoBoard/types';
import { boardFromSpec } from '../../learning/Exercises/position';
import { validate, labelOf } from '../../learning/Exercises/validate';
import type { DrillCheck, PositionSpec } from '../../app/types';
import type { MarkView } from '../Board/renderer';
import { BoardTone } from '../../app/sound';
import './drill.css';

/**
 * Interactive drill board.
 *
 * One component powers lesson drills, level stages and daily training, so the
 * behaviour (wrong-move feedback, hints, the "show me" replay, star scoring) is
 * identical everywhere and can be tested once.
 */

export interface DrillResult {
  correct: boolean;
  attempts: number;
  usedHint: boolean;
  wrongPoints: number[];
  moves: number;
  ms: number;
}

export interface DrillBoardProps {
  position: PositionSpec;
  check: DrillCheck;
  answer: string;
  prompt: string;
  detail?: string;
  hint: string;
  success: string;
  gentle?: string;
  tag: string;
  interaction?: 'play' | 'tap';
  /** Called once, when the drill is solved or the learner gives up. */
  onSolved?: (result: DrillResult) => void;
  onWrong?: (index: number, attempt: number) => void;
  /** Show a "上一个 / 重来" control row under the board. */
  showReset?: boolean;
  /** Called after each attempt so parents can show feedback text. */
  onFeedback?: (text: string | null) => void;
  /** Distance from the solution at which the direction hint appears. */
  hintAfter?: number;
  /** Hide the built-in instruction block (parents render their own). */
  bare?: boolean;
  maxAttempts?: number;
  onSound?: (tone: BoardTone) => void;
  /** Enables a "显示答案" button once the learner has struggled. */
  allowReveal?: boolean;
}

export function DrillBoard({
  position,
  check,
  answer,
  prompt,
  detail,
  hint,
  success,
  gentle,
  interaction = 'play',
  onSolved,
  onWrong,
  onFeedback,
  hintAfter = 2,
  bare,
  maxAttempts = 0,
  onSound,
  allowReveal = true,
}: DrillBoardProps) {
  const [board, setBoard] = useState<GoBoard>(() => boardFromSpec(position));
  const [attempts, setAttempts] = useState(0);
  const [usedHint, setUsedHint] = useState(false);
  const [wrongPoints, setWrongPoints] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'no' | 'info'; text: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [appear, setAppear] = useState<Map<number, number>>(new Map());
  const start = useRef(Date.now());
  const raf = useRef(0);
  const moved = useRef(0);

  // Rebuild when the position changes (next drill).
  useEffect(() => {
    setBoard(boardFromSpec(position));
    setAttempts(0);
    setUsedHint(false);
    setWrongPoints([]);
    setSolved(false);
    setFeedback(null);
    setRevealed(false);
    setAppear(new Map());
    start.current = Date.now();
    moved.current = 0;
  }, [position]);

  const report = useCallback(
    (text: string | null) => {
      onFeedback?.(text);
    },
    [onFeedback],
  );

  const finish = useCallback(
    (result: DrillResult) => {
      setSolved(true);
      onSolved?.(result);
    },
    [onSolved],
  );

  const animatedSet = useCallback((next: GoBoard, indices: number[]) => {
    const map = new Map<number, number>();
    for (const i of indices) map.set(i, 0);
    setAppear(map);
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 230);
      const cur = new Map<number, number>();
      for (const i of indices) cur.set(i, p);
      setAppear(cur);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else setAppear(new Map());
    };
    raf.current = requestAnimationFrame(step);
    void next;
  }, []);

  const handleMove = useCallback(
    (index: number): boolean => {
      if (solved) return false;
      const color = board.turn;

      // Tap drills: identify a point without placing a stone.
      if (interaction === 'tap') {
        const res = validate(check, {
          before: board,
          after: board,
          index,
          color,
          captured: [],
        });
        if (res.ok) {
          setFeedback({ kind: 'ok', text: res.reason ?? success });
          report(res.reason ?? success);
          onSound?.('correct');
          finish({
            correct: true,
            attempts: attempts + 1,
            usedHint,
            wrongPoints,
            moves: 0,
            ms: Date.now() - start.current,
          });
          return true;
        }
        const nextAttempt = attempts + 1;
        setAttempts(nextAttempt);
        // Only empty points are drawn as a red ✕; tapping a stone is still an
        // attempt but marking it would cover the piece being explained.
        if (board.cells[index] === 0) setWrongPoints((w) => [...w, index]);
        setFeedback({ kind: 'no', text: gentle ?? '这里不对，再想想。' });
        report(gentle ?? '这里不对，再想想。');
        onWrong?.(index, nextAttempt);
        onSound?.('wrong');
        if (maxAttempts && nextAttempt >= maxAttempts) {
          setRevealed(true);
        }
        return false;
      }

      const copy = board.clone();
      const res = copy.play(index, color);
      if (!res.ok) {
        const why =
          res.reason === 'suicide'
            ? '这里下进去自己就没有气了，是禁入点。'
            : res.reason === 'ko'
              ? '打劫规则：这里不能马上提回来。'
              : res.reason === 'occupied'
                ? '这个点已经有棋子了。'
                : '这一手不合规则，换一个地方试试。';
        setFeedback({ kind: 'no', text: why });
        report(why);
        onSound?.('wrong');
        return false;
      }

      const verdict = validate(check, {
        before: board,
        after: copy,
        index,
        color,
        captured: res.captured,
      });

      if (verdict.ok) {
        moved.current += 1;
        setBoard(copy);
        animatedSet(copy, [index]);
        setFeedback({ kind: 'ok', text: verdict.reason ?? success });
        report(verdict.reason ?? success);
        onSound?.('correct');
        finish({
          correct: true,
          attempts: attempts + 1,
          usedHint,
          wrongPoints,
          moves: moved.current,
          ms: Date.now() - start.current,
        });
        return true;
      }

      // Wrong but legal: show the stone briefly, then take it back, so the
      // learner sees what their move did without the board drifting.
      const nextAttempt = attempts + 1;
      setAttempts(nextAttempt);
      setWrongPoints((w) => [...w, index]);
      const text =
        nextAttempt >= hintAfter
          ? `${gentle ?? '这一步不太对。'} 提示：${hint}`
          : (gentle ?? '这一步没有达到目标，再想一想。');
      setFeedback({ kind: 'no', text: nextAttempt >= hintAfter ? text : text });
      report(text);
      onWrong?.(index, nextAttempt);
      onSound?.('wrong');
      if (nextAttempt >= hintAfter) setUsedHint(true);
      if (maxAttempts && nextAttempt >= maxAttempts) {
        setRevealed(true);
        setBoard(copy);
        return false;
      }
      return false;
    },
    [
      solved,
      board,
      interaction,
      check,
      success,
      attempts,
      usedHint,
      wrongPoints,
      finish,
      animatedSet,
      onWrong,
      onSound,
      hintAfter,
      hint,
      gentle,
      report,
      maxAttempts,
    ],
  );

  const reveal = useCallback(() => {
    setRevealed(true);
    setUsedHint(true);
    setFeedback({ kind: 'info', text: `正确答案在 ${labelOf(board.size, num(board, answer))}，你可以照着下一手，或者直接继续。` });
    report(null);
  }, [board, answer, report]);

  const skip = useCallback(() => {
    finish({
      correct: false,
      attempts: attempts || 1,
      usedHint: true,
      wrongPoints,
      moves: moved.current,
      ms: Date.now() - start.current,
    });
  }, [finish, attempts, usedHint, wrongPoints]);

  const marks = useMemo<MarkView[]>(() => {
    const out: MarkView[] = [];
    for (const w of wrongPoints) out.push({ index: w, kind: 'wrong', alpha: 0.75 });
    if (revealed) out.push({ index: num(board, answer), kind: 'target' });
    if (solved) out.push({ index: num(board, answer), kind: 'right' });
    return out;
  }, [wrongPoints, revealed, solved, board, answer]);

  const answerIndex = num(board, answer);
  const showAnswerButton = allowReveal && !solved && !revealed && attempts >= 2;

  return (
    <div className={`drill ${bare ? 'drill--bare' : ''}`}>
      {!bare && (
        <div className="drill__head">
          <span className={`chip ${interaction === 'tap' ? 'chip--blue' : 'chip--green'}`}>
            {interaction === 'tap' ? '点一点' : board.turn === BLACK ? '黑棋落子' : '白棋落子'}
          </span>
          <p className="drill__prompt">{prompt}</p>
          {detail && <p className="drill__detail tiny mute-2">{detail}</p>}
        </div>
      )}
      <div className="drill__board">
        <GoBoardCanvas
          size={board.size}
          cells={board.cells}
          onPlay={handleMove}
          turn={board.turn}
          lastMove={board.lastMove}
          marks={marks}
          appear={appear}
          maxSize={600}
          showCoordinates={board.size === 19}
          disabled={solved}
          ariaLabel={`${board.size} 路棋盘练习`}
        />
      </div>

      <div className="drill__actions">
        <button
          className="btn btn--sm"
          onClick={() => {
            setBoard(boardFromSpec(position));
            setFeedback(null);
            setWrongPoints([]);
            report(null);
          }}
          disabled={solved}
        >
          重新摆好
        </button>
        {board.history.length > 0 && !solved && (
          <button
            className="btn btn--sm"
            onClick={() => {
              const b = board.clone();
              b.undo();
              setBoard(b);
              setFeedback(null);
              report(null);
            }}
          >
            悔棋
          </button>
        )}
        {showAnswerButton && (
          <button className="btn btn--sm btn--ghost" onClick={reveal}>
            让我看看
          </button>
        )}
        {!solved && (revealed || attempts >= 3) && (
          <button className="btn btn--sm btn--ghost" onClick={skip}>
            先跳过
          </button>
        )}
      </div>

      {feedback && (
        <div className={`feedback feedback--${feedback.kind}`} role="status" aria-live="polite">
          <span className="feedback__icon" aria-hidden>
            {feedback.kind === 'ok' ? '✓' : feedback.kind === 'no' ? '✕' : '💡'}
          </span>
          <p>{feedback.text}</p>
        </div>
      )}

      {!solved && wrongPoints.length >= hintAfter && !feedback && (
        <p className="tiny mute-2 drill__hintline">提示：{hint}</p>
      )}
      {answerIndex >= 0 && <span className="sr-only">参考答案位置 {labelOf(board.size, answerIndex)}</span>}
      <span className="sr-only">轮到{board.turn === BLACK ? '黑棋' : '白棋'}</span>
      <span className="sr-only">对手棋色{opposite(board.turn) === WHITE ? '白' : '黑'}</span>
    </div>
  );
}

function num(board: GoBoard, label: string): number {
  const letters = 'ABCDEFGHJKLMNOPQRST';
  const m = /^([A-HJ-T])(\d{1,2})$/i.exec(label.trim());
  if (!m) return -1;
  const x = letters.indexOf(m[1].toUpperCase());
  const row = Number(m[2]);
  if (x < 0 || row < 1 || row > board.size) return -1;
  return (board.size - row) * board.size + x;
}
