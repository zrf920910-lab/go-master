import type { Route } from '../../app/router';
import { useStore, rankFor } from '../../app/store';
import { AVATAR_EMOJI } from '../../app/labels';

const TABS: Array<{ key: Route['name']; label: string; icon: string; routes: Route['name'][] }> = [
  { key: 'home', label: '首页', icon: '⌂', routes: ['home'] },
  { key: 'learn', label: '学习', icon: '◈', routes: ['learn', 'lesson'] },
  { key: 'levels', label: '闯关', icon: '⚑', routes: ['levels', 'level'] },
  { key: 'battle', label: '对弈', icon: '⚔', routes: ['battle'] },
  { key: 'online', label: '在线', icon: '🌐', routes: ['online'] },
  { key: 'practice', label: '练习', icon: '✎', routes: ['practice', 'daily', 'library', 'patterns', 'mistakes'] },
];

export function NavBar({
  route,
  go,
  onSettings,
}: {
  route: Route['name'];
  go: (r: Route, replace?: boolean) => void;
  onSettings: () => void;
}) {
  const { profile } = useStore();
  const rank = rankFor(profile.xp);

  return (
    <>
      <header className="nav">
        <button className="nav__brand" onClick={() => go({ name: 'home' })} aria-label="回到首页">
          <span className="nav__mark" aria-hidden>
            棋
          </span>
          <span className="nav__title">
            围棋大师
            <span className="nav__sub">Go Master</span>
          </span>
        </button>

        <nav className="nav__tabs" aria-label="主导航">
          {TABS.map((t) => {
            const on = t.routes.includes(route);
            return (
              <button
                key={t.key}
                className={`nav__tab ${on ? 'nav__tab--on' : ''}`}
                onClick={() => go({ name: t.key } as Route)}
                aria-current={on ? 'page' : undefined}
              >
                <span className="nav__icon" aria-hidden>
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="nav__right">
          <button className="nav__user" onClick={() => go({ name: 'profile' })} aria-label="个人资料">
            <span className="nav__avatar" aria-hidden>
              {AVATAR_EMOJI[profile.avatar] ?? '🐼'}
            </span>
            <span className="nav__usertext">
              <span className="nav__username">{profile.name}</span>
              <span className="nav__rank">{rank.name}</span>
            </span>
          </button>
          <button className="icon-btn nav__settings" onClick={onSettings} aria-label="设置">
            ⚙︎
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="底部导航">
        {TABS.map((t) => {
          const on = t.routes.includes(route);
          return (
            <button
              key={t.key}
              className={`tabbar__item ${on ? 'tabbar__item--on' : ''}`}
              onClick={() => go({ name: t.key } as Route)}
              aria-current={on ? 'page' : undefined}
            >
              <span className="tabbar__icon" aria-hidden>
                {t.icon}
              </span>
              <span className="tabbar__label">{t.label}</span>
            </button>
          );
        })}
        <button className="tabbar__item" onClick={() => go({ name: 'review' })} aria-label="棋谱">
          <span className="tabbar__icon" aria-hidden>
            ⌘
          </span>
          <span className="tabbar__label">棋谱</span>
        </button>
      </nav>
    </>
  );
}
