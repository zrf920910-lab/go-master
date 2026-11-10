import { useMemo, useState } from 'react';
import { useStore } from '../../app/store';
import { lessons, lessonById } from '../../data/courses';
import { levels } from '../../data/levels';
import { DrillBoard, type DrillResult } from '../../components/Board/DrillBoard';
import { Chip, EmptyState } from '../../components/Progress/Progress';
import { tagName } from '../../app/labels';
import { playTone } from '../../app/sound';
import type { Navigate } from '../../app/router';
import { toast } from '../../components/Shell/Toast';

/**
 * Mistake notebook: every wrong answer is kept with the point the learner chose,
 * and can be retried on the original board. Retrying the same drill and getting
 * it right marks the entry as resolved.
 */
export function MistakesPage({ go }: { go: Navigate }) {
  const { profile, recordAttempt, removeMistake } = useStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const entries = useMemo(
    () => profile.mistakes.filter((m) => (filter === 'all' ? true : !m.resolved)),
    [profile.mistakes, filter],
  );

  const active = entries.find((m) => m.id === activeId) ?? null;

  const drill = useMemo(() => {
    if (!active) return null;
    for (const l of lessons) {
      const found = l.drills.find((d) => d.id === active.drillId);
      if (found) return { drill: found, lesson: l };
    }
    const lv = levels.find((l) => l.id === active.levelId);
    if (lv) {
      const st = lv.stages.find((s) => `${lv.id}-${s.id}` === active.drillId || s.id === active.drillId);
      if (st) {
        return {
          drill: {
            id: st.id,
            prompt: st.prompt,
            detail: st.detail,
            check: st.check,
            success: st.success,
            gentle: st.wrong,
            hint: st.hint,
            answer: st.answer,
            tag: st.tag,
            interaction: st.interaction,
            position: st.position,
          },
          lesson: null,
        };
      }
    }
    return null;
  }, [active]);

  const onSolved = (r: DrillResult) => {
    if (!active) return;
    recordAttempt({
      drillId: active.drillId,
      lessonId: active.lessonId,
      levelId: active.levelId,
      kind: 'mistake',
      correct: r.correct,
      attempts: r.attempts,
      usedHint: r.usedHint,
      wrongPoints: r.wrongPoints,
      ms: r.ms,
      tag: active.tag,
      prompt: active.prompt,
    });
    if (r.correct) {
      removeMistake(active.id);
      toast({ icon: '✅', title: '订正成功', body: '这道题已经从错题本移除了。' });
      setActiveId(null);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">错题本</p>
          <h1 className="h1">把失误变成经验</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            每道错题都记录了你当时下错的位置。重新做对，就会自动移出。
          </p>
        </div>
        <div className="segmented">
          <button
            className={`segmented__item ${filter === 'open' ? 'segmented__item--on' : ''}`}
            onClick={() => setFilter('open')}
          >
            待订正 {profile.mistakes.filter((m) => !m.resolved).length}
          </button>
          <button
            className={`segmented__item ${filter === 'all' ? 'segmented__item--on' : ''}`}
            onClick={() => setFilter('all')}
          >
            全部 {profile.mistakes.length}
          </button>
        </div>
      </header>

      {entries.length === 0 && (
        <EmptyState
          icon="🩹"
          title={filter === 'open' ? '没有待订正的错题' : '错题本还是空的'}
          hint="在课程、关卡或每日训练里做错题时，会自动记录到这里。"
        />
      )}

      <div className="mistakes">
        {entries.map((m) => (
          <div key={m.id} className={`mistake ${m.resolved ? 'mistake--resolved' : ''}`}>
            <div className="mistake__head">
              <Chip tone={m.resolved ? 'green' : 'red'}>{m.resolved ? '已订正' : '待订正'}</Chip>
              <span className="tag-pill">{tagName(m.tag)}</span>
              <span className="tiny mute-2">
                {new Date(m.at).toLocaleDateString('zh-CN')} · 试了 {m.attempts} 次
              </span>
            </div>
            <p className="mistake__prompt">{m.prompt}</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="btn btn--sm btn--primary" onClick={() => setActiveId(m.id)}>
                重做这一题
              </button>
              {m.lessonId && lessonById(m.lessonId) && (
                <button className="btn btn--sm" onClick={() => go({ name: 'lesson', id: m.lessonId! })}>
                  回到课程：{lessonById(m.lessonId)!.title}
                </button>
              )}
              <button className="btn btn--sm btn--ghost" onClick={() => removeMistake(m.id)}>
                移除
              </button>
            </div>
          </div>
        ))}
      </div>

      {active && drill && (
        <div className="mistake-drill card card--pad">
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <h2 className="h3">重做错题</h2>
            <button className="btn btn--sm btn--ghost" onClick={() => setActiveId(null)}>
              收起
            </button>
          </div>
          <DrillBoard
            key={active.id}
            position={drill.drill.position!}
            check={drill.drill.check}
            answer={drill.drill.answer}
            prompt={drill.drill.prompt}
            hint={drill.drill.hint}
            success={drill.drill.success}
            gentle={drill.drill.gentle}
            tag={active.tag}
            interaction={drill.drill.interaction}
            onSolved={onSolved}
            onSound={(t) => playTone(t)}
          />
        </div>
      )}
    </div>
  );
}
