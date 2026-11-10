import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../../app/store';
import { personalisedDaily } from '../../data/daily';
import { DrillBoard, type DrillResult } from '../../components/Board/DrillBoard';
import { playTone } from '../../app/sound';
import { Chip, ProgressBar } from '../../components/Progress/Progress';
import type { Navigate } from '../../app/router';
import { tagName } from '../../app/labels';

/** Daily training: five short puzzles, seeded by the date. */
export function DailyPage({ go }: { go: Navigate }) {
  const { profile, recordAttempt, completeDaily } = useStore();
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<Array<boolean>>([]);
  const [done, setDone] = useState(false);

  const known = useMemo(() => new Set(Object.keys(profile.mastery)), [profile.mastery]);
  const puzzles = useMemo(() => personalisedDaily(new Date(), known), [known]);
  const today = new Date().toDateString();
  const alreadyDone = profile.daily.date === today && profile.daily.completed;

  useEffect(() => {
    setIndex(0);
    setScore(0);
    setAnswered([]);
    setDone(false);
  }, [today]);

  const onSolved = useCallback(
    (r: DrillResult) => {
      const p = puzzles[index];
      if (!p) return;
      recordAttempt({
        drillId: p.id,
        kind: 'daily',
        correct: r.correct,
        attempts: r.attempts,
        usedHint: r.usedHint,
        wrongPoints: r.wrongPoints,
        ms: r.ms,
        tag: p.tag,
        prompt: p.prompt,
        lessonId: p.lessonId,
        levelId: p.levelId,
      });
      const nextScore = score + (r.correct ? 1 : 0);
      setScore(nextScore);
      setAnswered((a) => [...a, r.correct]);
      window.setTimeout(() => {
        if (index + 1 >= puzzles.length) {
          setDone(true);
          completeDaily(nextScore, puzzles.length);
        } else {
          setIndex(index + 1);
        }
      }, 1100);
    },
    [puzzles, index, recordAttempt, score, completeDaily],
  );

  if (!puzzles.length) {
    return (
      <div className="page">
        <p className="muted">今天的训练还没有准备好。</p>
      </div>
    );
  }

  const puzzle = puzzles[index];
  const completedToday = done || alreadyDone;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">每日训练</p>
          <h1 className="h1">今天练五手</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            题目每天不同，来自你已经学过的知识点。
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {alreadyDone && <Chip tone="green">今日已完成</Chip>}
          <Chip tone="amber">
            {score}/{puzzles.length}
          </Chip>
        </div>
      </header>

      {completedToday ? (
        <div className="card card--pad daily-done">
          <div className="result">
            <div className="result__stars" aria-label={`${Math.round((score / puzzles.length) * 3)} 颗星`}>
              {[1, 2, 3].map((i) => (
                <span key={i} className={i <= Math.round((score / puzzles.length) * 3) ? 'on' : ''}>
                  ★
                </span>
              ))}
            </div>
            <h2 className="h2">今天的训练完成了</h2>
            <p className="muted small">
              答对 {score} / {puzzles.length} 题
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn"
                onClick={() => {
                  setIndex(0);
                  setScore(0);
                  setAnswered([]);
                  setDone(false);
                }}
              >
                再练一次
              </button>
              <button className="btn btn--primary" onClick={() => go({ name: 'levels' })}>
                去闯关
              </button>
            </div>
          </div>
          <div className="daily-summary">
            {answered.map((ok, i) => (
              <div key={i} className="daily-summary__row">
                <span className="tiny mute-2">第 {i + 1} 题</span>
                <span className={ok ? 'ok' : 'no'}>{ok ? '✓ 答对' : '✕ 没做对'}</span>
                <span className="tiny mute-2">{tagName(puzzles[i]?.tag ?? '')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="daily">
          <div className="daily__head">
            <div className="daily__dots" aria-label="训练进度">
              {puzzles.map((p, i) => (
                <span
                  key={p.id}
                  className={`daily__dot ${i === index ? 'daily__dot--on' : ''} ${answered[i] ? (answered[i] ? 'daily__dot--ok' : 'daily__dot--no') : ''}`}
                />
              ))}
            </div>
            <span className="tiny mute-2">
              第 {index + 1} / {puzzles.length} 题
            </span>
            <ProgressBar value={index} max={puzzles.length} label="每日训练进度" />
          </div>
          <div className="card card--pad">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <Chip tone="blue">{tagName(puzzle.tag)}</Chip>
              <span className="tiny mute-2">来源：{puzzle.lessonId ? '课程练习' : '关卡题型'}</span>
            </div>
            <DrillBoard
              key={puzzle.id}
              position={puzzle.position}
              check={puzzle.check}
              answer={puzzle.answer}
              prompt={puzzle.prompt}
              hint={puzzle.hint}
              success={puzzle.success}
              interaction={puzzle.interaction}
              tag={puzzle.tag}
              onSolved={onSolved}
              onSound={(t) => playTone(t)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
