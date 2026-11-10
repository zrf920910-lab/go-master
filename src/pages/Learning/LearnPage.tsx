import { useStore } from '../../app/store';
import { lessons } from '../../data/courses';
import { chapters, levels } from '../../data/levels';
import type { Navigate } from '../../app/router';
import { Stars, Chip, ProgressBar } from '../../components/Progress/Progress';
import { masteryOf, MASTERY_LABEL, tagName } from '../../app/labels';

/**
 * Course catalogue: everything grouped by chapter, with per-lesson progress and
 * a mastery meter per knowledge tag so the learner can see what is shaky.
 */
export function LearnPage({ go }: { go: Navigate }) {
  const { profile } = useStore();
  const completed = lessons.filter((l) => profile.lessons[l.id]?.completed).length;

  const tagStats = Object.entries(profile.mastery)
    .map(([tag, s]) => ({ tag, ...s, level: masteryOf(s) }))
    .sort((a, b) => b.seen - a.seen)
    .slice(0, 8);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">学习课程</p>
          <h1 className="h1">从规则到招式，一步一步来</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            每节课都是「讲解 → 演示 → 练习 → 实战 → 总结」，可以反复看。
          </p>
        </div>
        <div className="page-head__right">
          <Chip tone="green">
            已学 {completed} / {lessons.length}
          </Chip>
          <Chip tone="amber">
            ★ {Object.values(profile.lessons).reduce((a, l) => a + l.bestStars, 0)}
          </Chip>
        </div>
      </header>

      <div className="learn">
        <div className="learn__list">
          {chapters.map((c) => {
            const chLevels = levels.filter((l) => l.chapter === c.index);
            const chLessons = lessons.filter((l) => chLevels.some((lv) => lv.id === l.levelId));
            if (!chLessons.length) return null;
            const done = chLessons.filter((l) => profile.lessons[l.id]?.completed).length;
            return (
              <section key={c.index} className="chapter">
                <div className="chapter__head">
                  <span className="chapter__num" style={{ background: c.color }}>
                    {c.index}
                  </span>
                  <div className="grow">
                    <h2 className="h3">{c.title}</h2>
                    <p className="tiny mute-2">{c.subtitle}</p>
                  </div>
                  <span className="tiny mute-2">
                    {done}/{chLessons.length}
                  </span>
                </div>
                <div className="lesson-list">
                  {chLessons.map((l) => {
                    const p = profile.lessons[l.id];
                    return (
                      <button key={l.id} className={`lesson-row ${p?.completed ? 'lesson-row--done' : ''}`} onClick={() => go({ name: 'lesson', id: l.id })}>
                        <span className="lesson-row__num">{p?.completed ? '✓' : l.order}</span>
                        <span className="grow">
                          <span className="lesson-row__title">{l.title}</span>
                          <span className="lesson-row__sub tiny mute-2">
                            {l.subtitle} · 约 {l.minutes} 分钟
                          </span>
                        </span>
                        <span className="lesson-row__tags">
                          {l.tags.slice(0, 1).map((t) => (
                            <span key={t} className="tag-pill">
                              {tagName(t)}
                            </span>
                          ))}
                        </span>
                        <Stars n={p?.bestStars ?? 0} />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="learn__side">
          <div className="card card--pad">
            <h2 className="h3">掌握度</h2>
            <p className="tiny mute-2" style={{ marginTop: 4 }}>
              根据你的练习自动更新
            </p>
            <div className="mastery">
              {tagStats.length === 0 && <p className="muted small">做过练习之后，这里会显示每个知识点的掌握程度。</p>}
              {tagStats.map((t) => (
                <div key={t.tag} className="mastery__row">
                  <span className="mastery__name">{tagName(t.tag)}</span>
                  <span className={`mastery__badge mastery__badge--${t.level}`}>{MASTERY_LABEL[t.level]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card card--pad">
            <h2 className="h3">接下来</h2>
            <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn--sm grow" onClick={() => go({ name: 'levels' })}>
                闯关挑战
              </button>
              <button className="btn btn--sm grow" onClick={() => go({ name: 'mistakes' })}>
                错题本
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="row row--between tiny mute-2">
                <span>课程完成度</span>
                <span>{Math.round((completed / lessons.length) * 100)}%</span>
              </div>
              <ProgressBar value={completed} max={lessons.length} label="课程完成度" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
