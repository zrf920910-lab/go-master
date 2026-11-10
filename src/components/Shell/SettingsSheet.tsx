import { Sheet } from './Sheet';
import { useStore } from '../../app/store';
import type { Navigate } from '../../app/router';
import { Stars } from '../Progress/Progress';
import { totalStars } from '../../app/store';

/** Global settings + quick links to the less prominent screens. */
export function SettingsSheet({
  open,
  onClose,
  go,
}: {
  open: boolean;
  onClose: () => void;
  go: Navigate;
}) {
  const { profile, updateSettings } = useStore();
  const nav = (name: Parameters<Navigate>[0]) => {
    onClose();
    go(name);
  };

  return (
    <Sheet open={open} onClose={onClose} title="设置">
      <div className="settings">
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
          <span>显示棋盘坐标</span>
          <input
            type="checkbox"
            checked={profile.settings.coordinates}
            onChange={(e) => updateSettings({ coordinates: e.target.checked })}
          />
          <i aria-hidden />
        </label>

        <div className="field">
          <span className="field__label">对局计分</span>
          <div className="segmented">
            <button
              className={`segmented__item ${profile.settings.ruleset === 'chinese' ? 'segmented__item--on' : ''}`}
              onClick={() => updateSettings({ ruleset: 'chinese' })}
            >
              中国规则（数子）
            </button>
            <button
              className={`segmented__item ${profile.settings.ruleset === 'japanese' ? 'segmented__item--on' : ''}`}
              onClick={() => updateSettings({ ruleset: 'japanese' })}
            >
              日本规则（数目）
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="komi">
            贴目：{profile.settings.komi}
          </label>
          <input
            id="komi"
            className="range"
            type="range"
            min={0}
            max={8}
            step={0.5}
            value={profile.settings.komi}
            onChange={(e) => updateSettings({ komi: Number(e.target.value) })}
          />
          <p className="tiny mute-2">中国规则通常 7.5 目，日本规则通常 6.5 目。</p>
        </div>

        <div className="settings__links">
          <button className="settings__link" onClick={() => nav({ name: 'review' })}>
            <span aria-hidden>📜</span> 棋谱与复盘
          </button>
          <button className="settings__link" onClick={() => nav({ name: 'mistakes' })}>
            <span aria-hidden>🩹</span> 错题本
          </button>
          <button className="settings__link" onClick={() => nav({ name: 'library' })}>
            <span aria-hidden>📚</span> 招式库
          </button>
          <button className="settings__link" onClick={() => nav({ name: 'daily' })}>
            <span aria-hidden>🎯</span> 每日训练
          </button>
        </div>

        <div className="settings__stats">
          <span>
            ★ <Stars n={Math.min(3, Math.round(totalStars(profile) / 10))} />
          </span>
          <span className="tiny mute-2">累计 {profile.xp} XP</span>
        </div>
      </div>
    </Sheet>
  );
}
