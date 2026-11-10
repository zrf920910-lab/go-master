import { useMemo, useRef, useState } from 'react';
import { useStore, rankFor, totalStars } from '../../app/store';
import { lessons } from '../../data/courses';
import { levels } from '../../data/levels';
import { ACHIEVEMENTS } from '../../data/achievements/achievements';
import type { Profile } from '../../app/types';
import { Chip, ProgressBar } from '../../components/Progress/Progress';
import { AVATARS, AVATAR_EMOJI, MASTERY_LABEL, masteryOf, tagName } from '../../app/labels';
import { ConfirmDialog, Sheet } from '../../components/Shell/Sheet';
import { toast } from '../../components/Shell/Toast';
import { clearAll } from '../../services/storage/storage';
import type { Navigate } from '../../app/router';

/**
 * Profile: rank, achievements, statistics, mastery, avatar/name and the data
 * management actions (export, import, reset). Reset requires a typed
 * confirmation.
 */
export function ProfilePage({ go }: { go: Navigate }) {
  const { profile, rename, reset, importData, updateSettings } = useStore();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [resetOpen, setResetOpen] = useState(false);
  const [achievementOpen, setAchievementOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rank = rankFor(profile.xp);
  const stars = totalStars(profile);

  const earned = Object.keys(profile.achievements);
  const mastery = useMemo(
    () =>
      Object.entries(profile.mastery)
        .map(([tag, s]) => ({ tag, seen: s.seen, correct: s.correct, level: masteryOf(s) }))
        .sort((a, b) => b.seen - a.seen),
    [profile.mastery],
  );

  const accuracy = profile.attempts.length
    ? Math.round((profile.attempts.filter((a) => a.correct && a.attempts === 1).length / profile.attempts.length) * 100)
    : 0;

  const exportData = () => {
    const data = JSON.stringify(profile, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gomaster-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ icon: '📤', title: '进度已导出', body: '保存这个 JSON 文件即可备份。' });
  };

  const doImport = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Profile;
      if (!parsed || typeof parsed !== 'object' || !('xp' in parsed)) throw new Error('文件格式不正确');
      importData(parsed);
      toast({ icon: '📥', title: '进度已导入' });
    } catch (err) {
      toast({ icon: '⚠️', title: '导入失败', body: (err as Error).message });
    }
  };

  return (
    <div className="page">
      <header className="profile-head">
        <span className="avatar avatar--lg" aria-hidden>
          {AVATAR_EMOJI[profile.avatar] ?? '🐼'}
        </span>
        <div className="grow">
          <h1 className="h1">{profile.name}</h1>
          <p className="muted">
            {rank.name} · Lv.{rank.index} · 累计 {profile.xp} XP
          </p>
          <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Chip tone="amber">★ {stars}</Chip>
            <Chip tone="green">🔥 连续 {profile.streak} 天</Chip>
            <Chip>共 {profile.totalDays} 天学习</Chip>
          </div>
        </div>
        <button className="btn btn--sm" onClick={() => setEditOpen(true)}>
          编辑资料
        </button>
      </header>

      <div className="profile-grid">
        <section className="card card--pad">
          <h2 className="h3">等级进度</h2>
          <div className="row row--between tiny mute-2" style={{ marginTop: 8 }}>
            <span>
              Lv.{rank.index} {rank.name}
            </span>
            <span>{rank.next ? `${rank.toNext} XP 到 ${rank.next.name}` : '已满级'}</span>
          </div>
          <ProgressBar value={rank.progress} max={1} label="等级进度" />
          <div className="stat-grid">
            <Stat label="完成课程" value={profile.stats.lessonsDone} />
            <Stat label="通过关卡" value={profile.stats.levelsDone} />
            <Stat label="对弈盘数" value={profile.stats.gamesPlayed} />
            <Stat label="落子总数" value={profile.stats.stonesPlayed} />
            <Stat label="一次答对率" value={`${accuracy}%`} />
            <Stat label="错题待订正" value={profile.mistakes.filter((m) => !m.resolved).length} />
          </div>
        </section>

        <section className="card card--pad">
          <div className="row row--between">
            <h2 className="h3">成就</h2>
            <button className="btn btn--sm btn--ghost" onClick={() => setAchievementOpen(true)}>
              {earned.length}/{ACHIEVEMENTS.length}
            </button>
          </div>
          <div className="badge-grid">
            {ACHIEVEMENTS.slice(0, 8).map((a) => {
              const has = Boolean(profile.achievements[a.id]);
              return (
                <div key={a.id} className={`badge ${has ? 'badge--on' : ''}`} title={a.hint}>
                  <span className="badge__icon" aria-hidden>
                    {has ? a.icon : '🔒'}
                  </span>
                  <span className="badge__name tiny">{a.name}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card card--pad">
          <h2 className="h3">知识点掌握</h2>
          {mastery.length === 0 && <p className="muted small">做几道练习后，这里会显示掌握度。</p>}
          <div className="mastery">
            {mastery.map((m) => (
              <div key={m.tag} className="mastery__row">
                <span className="mastery__name">{tagName(m.tag)}</span>
                <span className="tiny mute-2">
                  {m.correct}/{m.seen}
                </span>
                <span className={`mastery__badge mastery__badge--${m.level}`}>{MASTERY_LABEL[m.level]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card card--pad">
          <h2 className="h3">学习记录</h2>
          <div className="stat-grid">
            <Stat label="课程" value={`${Object.values(profile.lessons).filter((l) => l.completed).length}/${lessons.length}`} />
            <Stat label="关卡" value={`${Object.keys(profile.levels).length}/${levels.length}`} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn--sm" onClick={() => go({ name: 'mistakes' })}>
              错题本
            </button>
            <button className="btn btn--sm" onClick={() => go({ name: 'review' })}>
              棋谱
            </button>
          </div>
        </section>

        <section className="card card--pad profile-data">
          <h2 className="h3">数据</h2>
          <p className="tiny mute-2" style={{ marginTop: 4 }}>
            所有进度都保存在这台设备上。换设备时，先导出再导入。
          </p>
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn--sm" onClick={exportData}>
              导出进度
            </button>
            <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
              导入进度
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = '';
              }}
            />
            <button className="btn btn--sm btn--danger" onClick={() => setResetOpen(true)}>
              重置进度
            </button>
          </div>
        </section>

        <section className="card card--pad">
          <h2 className="h3">设置</h2>
          <label className="switch">
            <span>落子音效</span>
            <input
              type="checkbox"
              checked={profile.settings.sound}
              onChange={(e) => updateSettings({ sound: e.target.checked })}
            />
            <i aria-hidden />
          </label>
          <label className="switch">
            <span>棋盘显示坐标</span>
            <input
              type="checkbox"
              checked={profile.settings.coordinates}
              onChange={(e) => updateSettings({ coordinates: e.target.checked })}
            />
            <i aria-hidden />
          </label>
          <div className="field" style={{ marginTop: 10 }}>
            <span className="field__label">计分规则</span>
            <div className="segmented">
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
        </section>
      </div>

      <Sheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑资料"
        footer={
          <button
            className="btn btn--primary btn--block"
            onClick={() => {
              rename(name, avatar);
              setEditOpen(false);
              toast({ icon: '✨', title: '资料已更新' });
            }}
          >
            保存
          </button>
        }
      >
        <label className="field">
          <span className="field__label">昵称</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} aria-label="昵称" />
        </label>
        <div className="field">
          <span className="field__label">头像</span>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-choice ${avatar === a ? 'avatar-choice--on' : ''}`}
                onClick={() => setAvatar(a)}
                aria-label={`选择头像 ${a}`}
                aria-pressed={avatar === a}
              >
                {AVATAR_EMOJI[a]}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <Sheet open={achievementOpen} onClose={() => setAchievementOpen(false)} title="全部成就">
        <div className="badge-list">
          {ACHIEVEMENTS.map((a) => {
            const has = Boolean(profile.achievements[a.id]);
            return (
              <div key={a.id} className={`badge-row ${has ? 'badge-row--on' : ''}`}>
                <span className="badge-row__icon" aria-hidden>
                  {has ? a.icon : '🔒'}
                </span>
                <div className="grow">
                  <p className="badge-row__name">{a.name}</p>
                  <p className="tiny mute-2">{a.hint}</p>
                </div>
                {has ? (
                  <span className="tiny ok">已获得</span>
                ) : (
                  <span className="tiny mute-2">+{a.xp} XP</span>
                )}
              </div>
            );
          })}
        </div>
      </Sheet>

      <ConfirmDialog
        open={resetOpen}
        title="重置所有进度？"
        body="课程、关卡、成就、错题和统计都会被清空，而且无法恢复。棋谱文件会一并删除。"
        confirmLabel="确认重置"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          void clearAll().then(() => {
            reset();
            setResetOpen(false);
            toast({ icon: '🧹', title: '进度已重置' });
            go({ name: 'home' });
          });
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label tiny mute-2">{label}</span>
    </div>
  );
}
