import { useMemo } from 'react';
import { rankFor, useStore, nextLesson, totalStars, levelUnlocked } from '../../app/store';
import { levels, chapters } from '../../data/levels';
import { lessons } from '../../data/courses';
import type { Navigate } from '../../app/router';
import { AVATAR_EMOJI } from '../../app/labels';
import { Stars, Chip, ProgressBar } from '../../components/Progress/Progress';
import { CountUp } from '../../components/Shell/Toast';
import { ACHIEVEMENTS } from '../../data/achievements/achievements';
import { dailyPuzzles } from '../../data/daily';

/**
 * The home screen: four entrances, the current rank, today's goal and the
 * streak. Deliberately calm — one primary action, three secondary ones.
 */
export function HomePage({ go, openSettings }: { go: Navigate; openSettings: () => void }) {
  const { profile, ready } = useStore();
  const rank = rankFor(profile.xp);
  const stars = totalStars(profile);
  const next = nextLesson(profile);
  const nextLessonDone = profile.lessons[next.id]?.completed;
  const todayKey = new Date().toDateString();
  const dailyDone = profile.daily.date === todayKey && profile.daily.completed;

  const unlockedCount = levels.filter((l) => levelUnlocked(l.id, profile)).length;
  const completedLevels = levels.filter((l) => {
    const lp = profile.levels[l.id];
    return lp && l.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
  }).length;
  const recent = useMemo(() => {
    const done = lessons
      .filter((l) => profile.lessons[l.id]?.completed)
      .sort((a, b) => (profile.lessons[b.id]?.lastAt ?? 0) - (profile.lessons[a.id]?.lastAt ?? 0));
    return done[0] ?? null;
  }, [profile.lessons]);

  const achievements = Object.keys(profile.achievements).length;

  return (
    <div className="page home">
      <header className="home__top">
        <button className="home__me" onClick={() => go({ name: 'profile' })} aria-label="打开个人资料">
          <span className="avatar" aria-hidden>
            {AVATAR_EMOJI[profile.avatar] ?? '🐼'}
          </span>
          <span className="home__me-text">
            <span className="home__name">{profile.name}</span>
            <span className="home__rank">{rank.name}</span>
          </span>
        </button>
        <div className="home__stats">
          <div className="home__xp">
            <div className="row row--between tiny mute-2">
              <span>
                Lv.{rank.index} · {rank.name}
              </span>
              <span>{rank.next ? `距下一等级 ${rank.toNext} XP` : '已达最高等级'}</span>
            </div>
            <ProgressBar value={rank.progress} max={1} label="等级进度" />
          </div>
          <div className="home__pills">
            <span className="pill" title="累计经验">
              <b>
                <CountUp value={profile.xp} />
              </b>{' '}
              XP
            </span>
            <span className="pill" title="连续学习天数">
              🔥 <b>{profile.streak}</b> 天
            </span>
            <span className="pill" title="累计星星">
              ★ <b>{stars}</b>
            </span>
          </div>
        </div>
        <button className="icon-btn" onClick={openSettings} aria-label="设置">
          ⚙︎
        </button>
      </header>

      <section className="home__hero">
        <div>
          <p className="eyebrow">今天也来下一手</p>
          <h1 className="h1">围棋大师 · Go Master</h1>
          <p className="muted home__sub">从零开始，成为围棋高手。先学规则，再练招式，最后和电脑下一盘。</p>
        </div>
        <button
          className="btn btn--primary btn--lg home__cta"
          onClick={() => go({ name: 'lesson', id: next.id })}
        >
          {nextLessonDone ? '继续练习' : '继续学习'}
          <span aria-hidden>→</span>
        </button>
      </section>

      <div className="home__grid">
        <button className="tile tile--learn" onClick={() => go({ name: 'learn' })}>
          <span className="tile__icon" aria-hidden>
            📖
          </span>
          <span className="tile__title">学习课程</span>
          <span className="tile__sub">
            {nextLessonDone ? '已学完全部课程' : `下一节：${next.title}`}
          </span>
          <span className="tile__meta">
            <Chip tone="green">
              进度 {Object.values(profile.lessons).filter((l) => l.completed).length}/{lessons.length}
            </Chip>
          </span>
        </button>

        <button className="tile tile--level" onClick={() => go({ name: 'levels' })}>
          <span className="tile__icon" aria-hidden>
            🚩
          </span>
          <span className="tile__title">闯关挑战</span>
          <span className="tile__sub">
            已解锁 {unlockedCount} / {levels.length} 关 · 通关 {completedLevels}
          </span>
          <span className="tile__meta">
            <Chip tone="amber">
              星级 ★ {stars}
            </Chip>
          </span>
        </button>

        <button className="tile tile--battle" onClick={() => go({ name: 'battle' })}>
          <span className="tile__icon" aria-hidden>
            ⚔️
          </span>
          <span className="tile__title">自由对弈</span>
          <span className="tile__sub">9 / 13 / 19 路棋盘，五档电脑对手</span>
          <span className="tile__meta">
            <Chip tone="blue">已下 {profile.stats.gamesPlayed} 盘</Chip>
          </span>
        </button>

        <button className="tile tile--daily" onClick={() => go({ name: 'daily' })}>
          <span className="tile__icon" aria-hidden>
            🎯
          </span>
          <span className="tile__title">每日训练</span>
          <span className="tile__sub">
            {dailyDone ? '今天的训练已完成，可以再来一次' : `5 道小练习 · 约 3 分钟`}
          </span>
          <span className="tile__meta">
            {dailyDone ? <Chip tone="green">已完成 ✓</Chip> : <Chip tone="red">今日未完成</Chip>}
          </span>
        </button>
      </div>

      <div className="home__lower">
        <section className="card card--pad">
          <div className="row row--between">
            <h2 className="h3">最近学习</h2>
            <button className="btn btn--ghost btn--sm" onClick={() => go({ name: 'review' })}>
              回忆棋谱
            </button>
          </div>
          {recent ? (
            <button className="recent" onClick={() => go({ name: 'lesson', id: recent.id })}>
              <span className="recent__dot" aria-hidden />
              <span className="grow">
                <span className="recent__title">{recent.title}</span>
                <span className="recent__sub muted tiny">{recent.subtitle}</span>
              </span>
              <Stars n={profile.lessons[recent.id]?.bestStars ?? 0} />
            </button>
          ) : (
            <p className="muted small" style={{ marginTop: 10 }}>
              还没有学习记录。从「认识棋盘」开始吧。
            </p>
          )}

          <h2 className="h3" style={{ marginTop: 22 }}>
            今日目标
          </h2>
          <ul className="goal-list">
            <Goal done={Boolean(profile.lessons[lessons[0]?.id]?.completed)} label="完成一节课程" />
            <Goal
              done={levels.some((l) => {
                const lp = profile.levels[l.id];
                return Object.values(lp?.stages ?? {}).some((s) => Date.now() - s.at < 86400000);
              })}
              label="通过一个关卡"
            />
            <Goal done={dailyDone} label="完成每日训练" />
            <Goal done={profile.stats.gamesPlayed > 0} label="和电脑下一盘棋" />
          </ul>
        </section>

        <section className="card card--pad">
          <div className="row row--between">
            <h2 className="h3">当前等级进度</h2>
            <Chip tone="amber">
              ★ {stars} / {levels.reduce((a, l) => a + l.stages.length * 3, 0)}
            </Chip>
          </div>
          <div className="chapter-strip">
            {chapters.map((c) => {
              const done = c.levelIds.filter((id) => {
                const lp = profile.levels[id];
                const lv = levels.find((x) => x.id === id);
                return lv && lp && lv.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
              }).length;
              return (
                <div key={c.index} className="chapter-strip__item">
                  <span
                    className="chapter-strip__bar"
                    style={{ background: c.color, opacity: done === c.levelIds.length ? 1 : 0.55 }}
                  >
                    {done === c.levelIds.length ? '✓' : c.index}
                  </span>
                  <span className="tiny mute-2">{c.title}</span>
                </div>
              );
            })}
          </div>
          <div className="row row--between" style={{ marginTop: 16 }}>
            <span className="tiny mute-2">成就</span>
            <span className="tiny mute-2">{achievements} / {ACHIEVEMENTS.length}</span>
          </div>
          <button className="btn btn--block" style={{ marginTop: 8 }} onClick={() => go({ name: 'profile' })}>
            查看成就与统计
          </button>
        </section>

        <section className="card card--pad home__continue">
          <h2 className="h3">继续的下一手</h2>
          {ready ? (
            <>
              <p className="muted small" style={{ marginTop: 6 }}>
                {next.title} · {next.subtitle}
              </p>
              <div className="row" style={{ marginTop: 14, gap: 10 }}>
                <button className="btn btn--primary grow" onClick={() => go({ name: 'lesson', id: next.id })}>
                  开始这一节
                </button>
                <button
                  className="btn"
                  onClick={() => go({ name: 'practice' })}
                  aria-label="自由练习"
                >
                  自由练习
                </button>
              </div>
            </>
          ) : (
            <p className="muted small">正在读取进度…</p>
          )}
          <p className="tiny mute-2" style={{ marginTop: 16 }}>
            {dailyPuzzles(new Date()).length > 0
              ? `今日训练包含 ${dailyPuzzles(new Date()).length} 道题，全部来自你学过的知识点。`
              : '今天还没有安排训练。'}
          </p>
        </section>
      </div>
      <footer className="home__foot tiny mute-2">
        围棋大师 Go Master · 本地保存进度 · 可离线使用
      </footer>
    </div>
  );
}

function Goal({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={`goal ${done ? 'goal--done' : ''}`}>
      <span className="goal__check" aria-hidden>
        {done ? '✓' : ''}
      </span>
      <span>{label}</span>
    </li>
  );
}

