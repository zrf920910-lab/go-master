import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import type { BoardView, MarkView } from '../../components/Board/renderer';
import { compileDemo, type CompiledDemo } from '../../learning/Animations/demoEngine';
import { boardFromSpec } from '../../learning/Exercises/position';
import type { DemoFrame, Lesson } from '../../app/types';
import { BoardTone } from '../../app/sound';
import './demoPlayer.css';

/**
 * Lesson animation player.
 *
 * The timeline is compiled from the lesson's frame list into complete board
 * snapshots (see learning/Animations/demoEngine). Playback only moves an index
 * over those snapshots and interpolates stone appearance, so:
 *   - pause/resume/step are exact,
 *   - stepping backwards is exact,
 *   - changing speed only changes the timer,
 *   - the board always shows a state the engine considers valid.
 */

export type Speed = 0.5 | 1 | 2;

export interface DemoPlayerProps {
  lesson: Lesson;
  onSound?: (tone: BoardTone) => void;
  onFinished?: () => void;
  onFrameChange?: (index: number, frame: DemoFrame) => void;
  compact?: boolean;
}

export function DemoPlayer({ lesson, onSound, onFinished, onFrameChange, compact }: DemoPlayerProps) {
  const demo = useMemo<CompiledDemo>(() => {
    const base = boardFromSpec(lesson.position);
    return compileDemo(lesson.position.size, base.cells, lesson.demo);
  }, [lesson]);

  const total = demo.frames.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [appear, setAppear] = useState<Map<number, number>>(new Map());
  const [vanish, setVanish] = useState<Map<number, number>>(new Map());
  const timer = useRef(0);
  const raf = useRef(0);
  const finishedRef = useRef(false);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    cancelAnimationFrame(raf.current);
  }, []);

  /** Animate the transition into frame `next` starting from `prev`. */
  const animateTo = useCallback(
    (prevIndex: number, nextIndex: number) => {
      cancelAnimationFrame(raf.current);
      const prev = demo.frames[Math.max(0, prevIndex)];
      const next = demo.frames[Math.max(0, Math.min(nextIndex, total - 1))];
      const added: number[] = [];
      const removed: number[] = [];
      for (let i = 0; i < next.cells.length; i++) {
        if (prev.cells[i] === 0 && next.cells[i] !== 0) added.push(i);
        if (prev.cells[i] !== 0 && next.cells[i] === 0) removed.push(i);
      }
      if (!added.length && !removed.length) {
        setAppear(new Map());
        setVanish(new Map());
        return;
      }
      const dur = 260 / speed;
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        if (added.length) {
          const a = new Map<number, number>();
          for (const i of added) a.set(i, p);
          setAppear(a);
        } else setAppear(new Map());
        if (removed.length) {
          const v = new Map<number, number>();
          for (const i of removed) v.set(i, p);
          setVanish(v);
        } else setVanish(new Map());
        if (p < 1) raf.current = requestAnimationFrame(step);
        else {
          setAppear(new Map());
          setVanish(new Map());
        }
      };
      raf.current = requestAnimationFrame(step);
    },
    [demo, speed, total],
  );

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      const prev = index;
      setIndex(clamped);
      animateTo(prev, clamped);
      onFrameChange?.(clamped, lesson.demo[clamped]);
      const frame = demo.frames[clamped];
      if (!frame) return;
      // Reaching the last frame counts as "watched", whether the learner
      // stepped there manually or let it play.
      if (clamped === total - 1 && !finishedRef.current) {
        finishedRef.current = true;
        onFinished?.();
      }
      // Sound cues derived from what changed — no pre-baked audio timeline.
      const added = demo.frames[clamped].added.length;
      const removedNow = demo.frames[clamped].removed.length;
      if (removedNow > 0) onSound?.('capture');
      else if (added > 0) onSound?.('place');
    },
    [animateTo, demo, index, lesson.demo, onFinished, onFrameChange, onSound, total],
  );

  const advance = useCallback(() => {
    if (index >= total - 1) {
      setPlaying(false);
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinished?.();
      }
      return;
    }
    goTo(index + 1);
  }, [goTo, index, onFinished, total]);

  useEffect(() => {
    if (!playing) {
      stop();
      return;
    }
    const frame = demo.frames[index];
    const wait = (frame?.hold ?? 900) / speed;
    timer.current = window.setTimeout(advance, wait);
    return () => window.clearTimeout(timer.current);
  }, [playing, index, speed, demo.frames, advance, stop]);

  useEffect(() => () => stop(), [stop]);

  // Reset when the lesson changes.
  useEffect(() => {
    stop();
    setIndex(0);
    setPlaying(false);
    setAppear(new Map());
    setVanish(new Map());
    finishedRef.current = false;
  }, [lesson, stop]);

  const frame = demo.frames[index];
  const view = useMemo<BoardView>(() => {
    const stones = [];
    for (let i = 0; i < frame.cells.length; i++) {
      if (!frame.cells[i]) continue;
      stones.push({
        index: i,
        color: frame.cells[i] as 1 | 2,
        appear: appear.has(i) ? appear.get(i) : 1,
        vanish: vanish.has(i) ? vanish.get(i) : 0,
      });
    }
    const marks: MarkView[] = [...frame.marks];
    if (frame.arrow) marks.push(frame.arrow);
    return { size: demo.size, cells: frame.cells, stones, marks, showStars: true };
  }, [frame, appear, vanish, demo.size]);

  const progress = total <= 1 ? 0 : index / (total - 1);

  return (
    <div className={`demo ${compact ? 'demo--compact' : ''}`}>
      <div className="demo__stage">
        <GoBoardCanvas
          size={demo.size}
          cells={frame.cells}
          appear={appear}
          vanish={vanish}
          marks={view.marks ?? []}
          maxSize={620}
          interactive={false}
          ariaLabel="教学演示棋盘"
        />
      </div>

      <div className="demo__panel">
        <div className="demo__caption">
          {frame.caption && <span className="chip chip--blue">{frame.caption}</span>}
          <p className="demo__text">{frame.text}</p>
        </div>

        <div className="demo__scrub">
          <div className="demo__track" aria-hidden>
            <i style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="row row--between tiny mute-2">
            <span>
              第 {index + 1} / {total} 步
            </span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </div>

        <div className="demo__controls">
          <button
            className="icon-btn"
            onClick={() => {
              setPlaying(false);
              goTo(index - 1);
            }}
            disabled={index === 0}
            aria-label="上一步"
          >
            ⏮
          </button>
          <button
            className={`btn btn--primary demo__play`}
            onClick={() => {
              if (index >= total - 1) {
                goTo(0);
                finishedRef.current = false;
                setPlaying(true);
                return;
              }
              setPlaying((p) => !p);
            }}
            aria-label={playing ? '暂停' : '播放'}
          >
            {playing ? '⏸ 暂停' : index >= total - 1 ? '↻ 重播' : '▶ 播放'}
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setPlaying(false);
              goTo(index + 1);
            }}
            disabled={index >= total - 1}
            aria-label="下一步"
          >
            ⏭
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              stop();
              setPlaying(false);
              setIndex(0);
              finishedRef.current = false;
              setAppear(new Map());
              setVanish(new Map());
            }}
            aria-label="重新开始"
          >
            ↺
          </button>
        </div>

        <div className="demo__speed" role="group" aria-label="播放速度">
          {([0.5, 1, 2] as Speed[]).map((s) => (
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
    </div>
  );
}
