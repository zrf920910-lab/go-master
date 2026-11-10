import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { levels } from '../../data/levels';
import { useStore, levelUnlocked } from '../../app/store';
import type { LevelStage, LevelStageResult } from '../../app/types';
import type { Navigate } from '../../app/router';
import { DrillBoard, type DrillResult } from '../../components/Board/DrillBoard';
import { Stars, Chip } from '../../components/Progress/Progress';
import { playTone, type BoardTone } from '../../app/sound';
import { toast } from '../../components/Shell/Toast';
import { tagName } from '../../app/labels';

/**
 * Level player: run the stages in order, record stars per stage, and unlock the
 * next level when every stage has at least one star.
 */
export function LevelPage({ levelId, go }: { levelId: string; go: Navigate }) {
  const level = levels.find((l) => l.id === levelId) ?? levels[0];
  const { profile, recordStage, recordAttempt } = useStore();
  const [stageIndex, setStageIndex] = useState(0);
  const [results, setResults] = useState<Record<string, LevelStageResult>>(
    () => ({ ...(profile.levels[level.id]?.stages ?? {}) }),
  );
  const [phase, setPhase] = useState<'stage' | 'done'>('stage');
  const [lastStars, setLastStars] = useState<number | null>(null);
  const unlockedRef = useRef(false);

  // Reset only when the level itself changes. Watching `profile.levels` here
  // would wipe the stage result the moment it is recorded (the store update
  // re-renders this component), which hid the "next task" button.
  useEffect(() => {
    setStageIndex(0);
    setResults({ ...(profile.levels[level.id]?.stages ?? {}) });
    setPhase('stage');
    setLastStars(null);
    unlockedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  const sound = useCallback(
    (tone: BoardTone) => {
      if (profile.settings.sound) playTone(tone);
    },
    [profile.settings.sound],
  );

  const stage = level.stages[stageIndex];
  const doneCount = level.stages.filter((s) => (results[s.id]?.stars ?? 0) > 0).length;

  const starsFor = (r: DrillResult, s: LevelStage): 1 | 2 | 3 => {
    if (!r.correct) return 1;
    if (r.moves <= s.twoStarMoves && r.attempts === 1 && !r.usedHint) return 3;
    if (r.moves <= s.maxMoves && r.attempts <= 2) return 2;
    return 1;
  };

  const onSolved = useCallback(
    (r: DrillResult) => {
      if (!stage) return;
      const stars = starsFor(r, stage);
      setLastStars(stars);
      recordAttempt({
        drillId: `${level.id}-${stage.id}`,
        levelId: level.id,
        kind: 'level',
        correct: r.correct,
        attempts: r.attempts,
        usedHint: r.usedHint,
        wrongPoints: r.wrongPoints,
        ms: r.ms,
        tag: stage.tag,
        prompt: stage.prompt,
      });
      const res = recordStage(level, stage.id, {
        stars,
        attempts: r.attempts,
        moves: r.moves,
        hints: r.usedHint ? 1 : 0,
        perfect: stars === 3,
      });
      setResults((cur) => ({
        ...cur,
        [stage.id]: {
          stars,
          attempts: r.attempts,
          moves: r.moves,
          hints: r.usedHint ? 1 : 0,
          perfect: stars === 3,
          at: Date.now(),
        },
      }));
      if (res.unlocked.length && !unlockedRef.current) {
        unlockedRef.current = true;
        const next = levels.find((l) => l.id === res.unlocked[0]);
        if (next) toast({ icon: '🔓', title: '解锁新关卡', body: `第 ${next.index} 关 · ${next.title}` });
      }
    },
    [level, recordAttempt, recordStage, stage],
  );

  const next = useCallback(() => {
    setLastStars(null);
    if (stageIndex + 1 < level.stages.length) setStageIndex(stageIndex + 1);
    else setPhase('done');
  }, [level.stages.length, stageIndex]);

  const cleared = useMemo(() => {
    return level.stages.map((s) => ({ stage: s, result: results[s.id] }));
  }, [level.stages, results]);

  const allCleared = cleared.every((c) => (c.result?.stars ?? 0) > 0);
  const totalStarsNow = cleared.reduce((a, c) => a + (c.result?.stars ?? 0), 0);

  if (!levelUnlocked(level.id, profile)) {
    return (
      <div className="page">
        <div className="card card--pad locked-page">
          <span className="locked-page__icon">🔒</span>
          <h1 className="h2">这一关还没有解锁</h1>
          <p className="muted">先完成上一关的全部任务，就能进入这里。</p>
          <button className="btn btn--primary" onClick={() => go({ name: 'levels' })}>
            回到关卡地图
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="row row--between" style={{ marginBottom: 12 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => go({ name: 'levels' })}>
          ← 关卡地图
        </button>
        <div className="row" style={{ gap: 8 }}>
          <Chip>
            第 {level.index} 关
          </Chip>
          <Stars n={Math.round(totalStarsNow / Math.max(1, level.stages.length))} />
        </div>
      </div>

      <header className="level-head">
        <div>
          <p className="eyebrow">{level.blurb}</p>
          <h1 className="h1">{level.title}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {level.goal}
          </p>
        </div>
        <div className="level-head__progress">
          <span className="tiny mute-2">
            任务 {doneCount}/{level.stages.length}
          </span>
          <div className="stage-dots" role="list" aria-label="关卡任务进度">
            {level.stages.map((s, i) => {
              const r = results[s.id];
              return (
                <span
                  key={s.id}
                  role="listitem"
                  className={`stage-dot ${i === stageIndex && phase === 'stage' ? 'stage-dot--on' : ''} ${r ? 'stage-dot--done' : ''}`}
                  aria-label={`${s.title}${r ? ` 已完成 ${r.stars} 星` : ''}`}
                >
                  {r ? '✓' : i + 1}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      {phase === 'stage' && stage && (
        <div className="level-body">
          <div className="card card--pad level-stage">
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="stage-badge">
                  {stageIndex + 1}
                  <span>/{level.stages.length}</span>
                </span>
                <span className="h3">{stage.title}</span>
              </div>
              <Chip tone="blue">{tagName(stage.tag)}</Chip>
            </div>
            <DrillBoard
              key={`${level.id}-${stage.id}`}
              position={stage.position}
              check={stage.check}
              answer={stage.answer}
              prompt={stage.prompt}
              detail={stage.detail}
              hint={stage.hint}
              success={stage.success}
              gentle={stage.wrong}
              tag={stage.tag}
              interaction={stage.interaction}
              onSolved={onSolved}
              onSound={sound}
              allowReveal
            />
            {lastStars !== null && (
              <div className="stage-passed">
                <div className="row" style={{ gap: 10 }}>
                  <Stars n={lastStars} size={22} />
                  <span className="h3">{lastStars === 3 ? '完美！' : lastStars === 2 ? '不错！' : '完成'}</span>
                </div>
                <p className="tiny muted">
                  {lastStars === 3
                    ? '一手到位，没有多余的尝试。'
                    : lastStars === 2
                      ? '完成了任务，再快一点可以拿三星。'
                      : '完成任务，但走了几步弯路。前面有提示可以再看一次。'}
                </p>
                <button className="btn btn--primary" onClick={next}>
                  {stageIndex + 1 < level.stages.length ? '下一个任务' : '完成本关'}
                </button>
              </div>
            )}
          </div>

          <aside className="level-side">
            <div className="card card--pad">
              <h2 className="h3">本关任务</h2>
              <ol className="task-list">
                {level.stages.map((s, i) => {
                  const r = results[s.id];
                  return (
                    <li key={s.id} className={`task ${i === stageIndex ? 'task--on' : ''} ${r ? 'task--done' : ''}`}>
                      <span className="task__mark">{r ? '✓' : i + 1}</span>
                      <span className="grow">{s.title}</span>
                      {r && <Stars n={r.stars} size={12} />}
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="card card--pad">
              <h2 className="h3">星级标准</h2>
              <ul className="summary-list">
                <li>一星：完成任务</li>
                <li>二星：在规定步数内完成</li>
                <li>三星：一次做对，且没有用提示</li>
              </ul>
              <p className="tiny mute-2" style={{ marginTop: 10 }}>
                星数会保存下来，随时可以回来刷新成绩。
              </p>
            </div>
          </aside>
        </div>
      )}

      {phase === 'done' && (
        <div className="card card--pad level-done">
          <p className="eyebrow">第 {level.index} 关</p>
          <h2 className="h1">{allCleared ? '通关！' : '再检查一下'}</h2>
          <div className="level-done__stars">
            {cleared.map((c) => (
              <div key={c.stage.id} className="level-done__row">
                <span className="grow">{c.stage.title}</span>
                <Stars n={c.result?.stars ?? 0} size={16} />
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => {
                setStageIndex(0);
                setPhase('stage');
                setLastStars(null);
              }}
            >
              重玩本关
            </button>
            <button className="btn btn--primary" onClick={() => go({ name: 'levels' })}>
              返回关卡地图
            </button>
            {allCleared && levels[level.index] && (
              <button className="btn btn--amber" onClick={() => go({ name: 'level', id: levels[level.index].id })}>
                下一关 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
