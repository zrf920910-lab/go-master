import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson } from '../../app/types';
import type { Navigate } from '../../app/router';
import { useStore } from '../../app/store';
import { DemoPlayer } from '../../components/Animation/DemoPlayer';
import { DrillBoard, type DrillResult } from '../../components/Board/DrillBoard';
import { Stars, Chip, ProgressBar } from '../../components/Progress/Progress';
import { playTone, type BoardTone } from '../../app/sound';
import { lessons, lessonById } from '../../data/courses';
import { tagName } from '../../app/labels';
import { toast } from '../../components/Shell/Toast';
import '../../components/Animation/demoPlayer.css';

type Step = 'intro' | 'demo' | 'drill' | 'practice' | 'summary';

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'intro', label: '讲解' },
  { key: 'demo', label: '演示' },
  { key: 'drill', label: '练习' },
  { key: 'practice', label: '实战' },
  { key: 'summary', label: '总结' },
];

export function LessonPage({ lessonId, go }: { lessonId: string; go: Navigate }) {
  const lesson = lessonById(lessonId) ?? lessons[0];
  const { profile, recordAttempt, completeLesson, updateSettings } = useStore();
  const [step, setStep] = useState<Step>('intro');
  const [drillIndex, setDrillIndex] = useState(0);
  const [stars, setStars] = useState<0 | 1 | 2 | 3>(0);
  const [results, setResults] = useState<DrillResult[]>([]);
  const [practiceDone, setPracticeDone] = useState(false);
  const [demoFinished, setDemoFinished] = useState(false);
  const [demoCycle, setDemoCycle] = useState(0);
  const started = useRef(Date.now());
  const sound = useCallback(
    (tone: BoardTone) => {
      if (profile.settings.sound) playTone(tone);
    },
    [profile.settings.sound],
  );

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const drill = lesson.drills[drillIndex];
  const drilled = drillIndex >= lesson.drills.length;

  useEffect(() => {
    setStep('intro');
    setDrillIndex(0);
    setStars(0);
    setResults([]);
    setPracticeDone(false);
    setDemoFinished(false);
    setDemoCycle(0);
    started.current = Date.now();
  }, [lesson.id]);

  const finishLesson = useCallback(
    (finalStars: 0 | 1 | 2 | 3) => {
      const correct = results.filter((r) => r.correct).length;
      completeLesson(lesson, finalStars, Math.round((Date.now() - started.current) / 1000), correct);
      setStars(finalStars);
      setStep('summary');
      if (finalStars >= 2) toast({ icon: '⭐', title: `获得 ${finalStars} 颗星`, body: lesson.title });
    },
    [completeLesson, lesson, results],
  );

  const onDrillSolved = useCallback(
    (r: DrillResult) => {
      const d = lesson.drills[drillIndex];
      const nextResults = [...results, r];
      setResults(nextResults);
      recordAttempt({
        drillId: d.id,
        lessonId: lesson.id,
        kind: 'lesson',
        correct: r.correct,
        attempts: r.attempts,
        usedHint: r.usedHint,
        wrongPoints: r.wrongPoints,
        ms: r.ms,
        tag: d.tag,
        prompt: d.prompt,
      });
      window.setTimeout(() => {
        if (drillIndex + 1 < lesson.drills.length) {
          setDrillIndex(drillIndex + 1);
        } else {
          setDrillIndex(lesson.drills.length);
          setStep('practice');
        }
      }, 1100);
    },
    [drillIndex, lesson, recordAttempt, results],
  );

  const onPracticeSolved = useCallback(
    (r: DrillResult) => {
      setPracticeDone(true);
      recordAttempt({
        drillId: `${lesson.id}-practice`,
        lessonId: lesson.id,
        kind: 'lesson',
        correct: r.correct,
        attempts: r.attempts,
        usedHint: r.usedHint,
        wrongPoints: r.wrongPoints,
        ms: r.ms,
        tag: lesson.tags[0] ?? 'practice',
        prompt: lesson.practice?.prompt ?? '实战练习',
      });
      // Stars: all drills correct on first try = 3, one retry total = 2, else 1.
      const mistakes = results.reduce((a, x) => a + Math.max(0, x.attempts - 1), 0) + Math.max(0, r.attempts - 1);
      const hints = results.some((x) => x.usedHint) || r.usedHint;
      const finalStars: 0 | 1 | 2 | 3 = !r.correct && mistakes > 4 ? 1 : mistakes === 0 && !hints ? 3 : mistakes <= 2 && !hints ? 2 : 1;
      finishLesson(finalStars);
    },
    [finishLesson, lesson, recordAttempt, results, sound],
  );

  const bestStars = profile.lessons[lesson.id]?.bestStars ?? 0;
  const nextLessonItem = lessons[lessons.findIndex((l) => l.id === lesson.id) + 1];

  const progressPct = useMemo(() => {
    const base = STEPS.findIndex((s) => s.key === step);
    return (base + 1) / STEPS.length;
  }, [step]);

  return (
    <div className="page">
      <div className="row row--between" style={{ marginBottom: 10 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => go({ name: 'learn' })}>
          ← 课程目录
        </button>
        <div className="row" style={{ gap: 8 }}>
          <Chip tone="green">{tagName(lesson.tags[0] ?? 'rules')}</Chip>
          <Chip>约 {lesson.minutes} 分钟</Chip>
          <Chip tone="amber">
            +{lesson.xp} XP
          </Chip>
        </div>
      </div>

      <div className="lesson">
        <div className="lesson__main">
          <div className="stepper" role="tablist" aria-label="课程步骤">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                className={`step ${step === s.key ? 'step--on' : ''} ${i < stepIndex ? 'step--done' : ''}`}
                onClick={() => {
                  if (i === 0) setStep('intro');
                  if (i < stepIndex) setStep(s.key);
                  else if (s.key === 'demo' && stepIndex >= 1) setStep('demo');
                }}
                disabled={i > stepIndex}
                aria-selected={step === s.key}
                role="tab"
              >
                <span className="step__num">{i < stepIndex ? '✓' : i + 1}</span>
                {s.label}
              </button>
            ))}
          </div>

          {step === 'intro' && <IntroStep lesson={lesson} onNext={() => setStep('demo')} />}

          {step === 'demo' && (
            <div className="card card--pad">
              <DemoPlayer
                key={demoCycle}
                lesson={lesson}
                onSound={sound}
                onFinished={() => setDemoFinished(true)}
              />
              <div className="lesson__nav">
                <button className="btn" onClick={() => setStep('intro')}>
                  上一步
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => {
                      setDemoCycle((c) => c + 1);
                      setDemoFinished(false);
                    }}
                  >
                    再看一遍
                  </button>
                  <button className="btn btn--primary" onClick={() => setStep('drill')}>
                    {demoFinished ? '开始练习 →' : '跳过演示，直接练习'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'drill' && (
            <div className="card card--pad">
              {!drilled && (
                <>
                  <div className="row row--between" style={{ marginBottom: 14 }}>
                    <span className="tiny mute-2">
                      练习 {drillIndex + 1} / {lesson.drills.length}
                    </span>
                    <ProgressBar value={drillIndex} max={lesson.drills.length} label="练习进度" />
                  </div>
                  <DrillBoard
                    key={drill.id}
                    position={drill.position ?? lesson.position}
                    check={drill.check}
                    answer={drill.answer}
                    prompt={drill.prompt}
                    detail={drill.detail}
                    hint={drill.hint}
                    success={drill.success}
                    gentle={drill.gentle}
                    tag={drill.tag}
                    interaction={drill.interaction}
                    onSolved={onDrillSolved}
                    onSound={sound}
                  />
                </>
              )}
              {drilled && (
                <div className="result">
                  <p className="h2">练习完成</p>
                  <p className="muted small">已经完成本节的全部练习。</p>
                  <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setStep('practice')}>
                    进入实战试玩
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'practice' && lesson.practice && (
            <div className="card card--pad">
              <div className="row" style={{ marginBottom: 12 }}>
                <Chip tone="blue">实战试玩</Chip>
                <span className="tiny mute-2">把学到的知识用在一个小局面上</span>
              </div>
              {!practiceDone ? (
                <DrillBoard
                  key={`${lesson.id}-practice`}
                  position={lesson.practice.position}
                  check={lesson.practice.check}
                  answer={lesson.practice.answer}
                  prompt={lesson.practice.prompt}
                  detail={lesson.practice.detail}
                  hint={lesson.drills[0]?.hint ?? ''}
                  success={lesson.practice.success}
                  tag={lesson.tags[0] ?? 'practice'}
                  onSolved={onPracticeSolved}
                  onSound={sound}
                  allowReveal={false}
                />
              ) : (
                <div className="result">
                  <p className="h2">实战完成</p>
                  <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => finishLesson(3)}>
                    查看总结
                  </button>
                </div>
              )}
              <div className="lesson__nav">
                <button className="btn" onClick={() => setStep('drill')}>
                  上一步
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => {
                    // Skipping practice still records the lesson, at 1 star.
                    finishLesson(1);
                  }}
                >
                  跳过并结束
                </button>
              </div>
            </div>
          )}

          {step === 'practice' && !lesson.practice && (
            <div className="card card--pad">
              <p className="muted">本节没有单独的实战局面，直接进入总结。</p>
              <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => finishLesson(2)}>
                查看总结
              </button>
            </div>
          )}

          {step === 'summary' && (
            <SummaryStep
              lesson={lesson}
              stars={stars}
              results={results}
              bestStars={bestStars}
              onRestart={() => {
                setDrillIndex(0);
                setResults([]);
                setPracticeDone(false);
                setStep('intro');
                setStars(0);
                started.current = Date.now();
              }}
              onNext={() => {
                if (nextLessonItem) go({ name: 'lesson', id: nextLessonItem.id });
                else go({ name: 'levels' });
              }}
              go={go}
            />
          )}
        </div>

        <aside className="lesson__side">
          <div className="card card--pad">
            <p className="eyebrow">正在学习</p>
            <h1 className="h2" style={{ marginTop: 6 }}>
              {lesson.title}
            </h1>
            <p className="muted small" style={{ marginTop: 4 }}>
              {lesson.subtitle}
            </p>
            <div className="lesson__meta">
              <Chip>难度 {'●'.repeat(lesson.difficulty)}</Chip>
              {bestStars > 0 && (
                <span className="row" style={{ gap: 6 }}>
                  <span className="tiny mute-2">最好</span>
                  <Stars n={bestStars} />
                </span>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <ProgressBar value={progressPct} max={1} label="课程步骤进度" />
            </div>
          </div>

          <div className="card card--pad">
            <h2 className="h3">这一节的关键</h2>
            <p className="small muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
              {lesson.intro.keyPoint ?? lesson.summary.points[0]}
            </p>
            <h2 className="h3" style={{ marginTop: 18 }}>
              完成后你会
            </h2>
            <ul className="summary-list">
              {lesson.summary.points.slice(0, 3).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>

          <div className="card card--pad">
            <div className="row row--between">
              <span className="tiny mute-2">设置</span>
            </div>
            <label className="switch">
              <span>落子音效</span>
              <input
                type="checkbox"
                checked={profile.settings.sound}
                onChange={(e) => updateSettings({ sound: e.target.checked })}
              />
              <i aria-hidden />
            </label>
          </div>
        </aside>
      </div>
    </div>
  );
}

function IntroStep({ lesson, onNext }: { lesson: Lesson; onNext: () => void }) {
  return (
    <div className="card card--pad lesson__body">
      <div className="lesson__title">
        <p className="eyebrow">第 {lesson.order} 课</p>
        <h1 className="h1">{lesson.title}</h1>
        <p className="muted">{lesson.subtitle}</p>
      </div>
      <div className="prose">
        {lesson.intro.paragraphs?.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {lesson.intro.bullets && (
        <ul className="bullets">
          {lesson.intro.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {lesson.intro.keyPoint && <div className="keypoint">{lesson.intro.keyPoint}</div>}
      <div className="lesson__nav">
        <span />
        <button className="btn btn--primary btn--lg" onClick={onNext}>
          看动画演示 →
        </button>
      </div>
    </div>
  );
}

function SummaryStep({
  lesson,
  stars,
  results,
  bestStars,
  onRestart,
  onNext,
  go,
}: {
  lesson: Lesson;
  stars: number;
  results: DrillResult[];
  bestStars: number;
  onRestart: () => void;
  onNext: () => void;
  go: Navigate;
}) {
  const correct = results.filter((r) => r.correct).length;
  const total = lesson.drills.length;
  return (
    <div className="card card--pad">
      <div className="result">
        <div className="result__stars" aria-label={`${stars} 颗星`}>
          {[1, 2, 3].map((i) => (
            <span key={i} className={i <= stars ? 'on' : ''}>
              ★
            </span>
          ))}
        </div>
        <h2 className="h2">本节完成</h2>
        <p className="muted small">
          {lesson.title} · 练习 {correct}/{total}
          {bestStars > 0 && ` · 历史最好 ${bestStars} 星`}
        </p>
        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <Chip tone="amber">+{bestStars > 0 ? Math.round(lesson.xp * 0.2) : lesson.xp} XP</Chip>
          <Chip tone="green">掌握度已更新</Chip>
        </div>
      </div>

      <div className="summary-block">
        <h3 className="h3">本节要点</h3>
        <ul className="summary-list">
          {lesson.summary.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      <div className="summary-block">
        <h3 className="h3">容易犯的错误</h3>
        <ul className="summary-list summary-list--bad">
          {lesson.summary.mistakes.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <div className="lesson__nav">
        <button className="btn" onClick={onRestart}>
          再练一次
        </button>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => go({ name: 'practice' })}>
            自由练习
          </button>
          <button className="btn btn--primary" onClick={onNext}>
            下一节 →
          </button>
        </div>
      </div>
    </div>
  );
}

void useEffect;
