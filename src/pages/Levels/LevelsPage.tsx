import { useState } from 'react';
import { useStore, levelUnlocked, levelStars } from '../../app/store';
import { chapters, levels } from '../../data/levels';
import type { LevelDef } from '../../app/types';
import type { Navigate } from '../../app/router';
import { Stars, Chip } from '../../components/Progress/Progress';
import { Sheet } from '../../components/Shell/Sheet';

/**
 * Level map: ten chapters of three levels. Locked levels are visibly locked and
 * cannot be opened, which is the only way the "finish the previous level" rule
 * can be trusted.
 */
export function LevelsPage({ go }: { go: Navigate }) {
  const { profile } = useStore();
  const [preview, setPreview] = useState<LevelDef | null>(null);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">闯关挑战</p>
          <h1 className="h1">30 个等级，一步一步闯</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            每一关都有 3–5 个局面任务。全部完成才能进入下一关。
          </p>
        </div>
        <div className="page-head__right">
          <Chip tone="green">
            已解锁 {levels.filter((l) => levelUnlocked(l.id, profile)).length}/{levels.length}
          </Chip>
        </div>
      </header>

      <div className="chapters">
        {chapters.map((c) => {
          const chLevels = c.levelIds.map((id) => levels.find((l) => l.id === id)!).filter(Boolean);
          const cleared = chLevels.filter((lv) => {
            const lp = profile.levels[lv.id];
            return lp && lv.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
          }).length;
          return (
            <section key={c.index} className="chapter-block">
              <div className="chapter-block__head">
                <span className="chapter-block__dot" style={{ background: c.color }} />
                <h2 className="h3">{c.title}</h2>
                <span className="tiny mute-2 grow">{c.subtitle}</span>
                <span className="tiny mute-2">
                  {cleared}/{chLevels.length}
                </span>
              </div>
              <div className="level-row">
                {chLevels.map((lv) => {
                  const unlocked = levelUnlocked(lv.id, profile);
                  const lp = profile.levels[lv.id];
                  const clearedAll = lp && lv.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
                  const doneCount = lv.stages.filter((s) => (lp?.stages[s.id]?.stars ?? 0) > 0).length;
                  return (
                    <button
                      key={lv.id}
                      className={`level-card ${unlocked ? '' : 'level-card--locked'} ${clearedAll ? 'level-card--cleared' : ''}`}
                      onClick={() => (unlocked ? setPreview(lv) : setPreview(lv))}
                      aria-disabled={!unlocked}
                    >
                      <span className="level-card__top">
                        <span className="level-card__index">{lv.index}</span>
                        {!unlocked ? (
                          <span className="level-card__lock" aria-label="未解锁">
                            🔒
                          </span>
                        ) : (
                          <Stars n={levelStars(lv.id, profile)} size={12} />
                        )}
                      </span>
                      <span className="level-card__icon" aria-hidden>
                        {lv.icon}
                      </span>
                      <span className="level-card__title">{lv.title}</span>
                      <span className="level-card__blurb tiny">{lv.blurb}</span>
                      <span className="level-card__foot tiny">
                        {clearedAll ? '已通关' : unlocked ? `${doneCount}/${lv.stages.length} 已过` : '完成上一关解锁'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? `第 ${preview.index} 关 · ${preview.title}` : ''}
        footer={
          preview && levelUnlocked(preview.id, profile) ? (
            <button className="btn btn--primary btn--block btn--lg" onClick={() => go({ name: 'level', id: preview.id })}>
              开始挑战
            </button>
          ) : (
            <p className="tiny mute-2" style={{ textAlign: 'center' }}>
              先完成上一关的全部任务，才能解锁这里。
            </p>
          )
        }
      >
        {preview && (
          <div className="level-preview">
            <p className="muted">{preview.goal}</p>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Chip>{preview.stages.length} 个任务</Chip>
              <Chip tone="amber">
                ★ 最多 {preview.stages.length * 3}
              </Chip>
              <Chip tone="green">+{preview.stages.reduce((a, s) => a + s.xp, 0)} XP</Chip>
            </div>
            <ul className="stage-preview">
              {preview.stages.map((s, i) => (
                <li key={s.id}>
                  <span className="stage-preview__n">{i + 1}</span>
                  <span className="grow">{s.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Sheet>
    </div>
  );
}
