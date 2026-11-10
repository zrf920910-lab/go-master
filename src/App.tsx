import { useCallback, useEffect, useState } from 'react';
import { ProfileProvider, useStore } from './app/store';
import { useRoute, type Navigate } from './app/router';
import { HomePage } from './pages/Home/HomePage';
import { LearnPage } from './pages/Learning/LearnPage';
import { LessonPage } from './pages/Learning/LessonPage';
import { LevelsPage } from './pages/Levels/LevelsPage';
import { LevelPage } from './pages/Levels/LevelPage';
import { BattlePage } from './pages/Battle/BattlePage';
import { OnlinePage } from './pages/Online/OnlinePage';
import { PracticePage } from './pages/Practice/PracticePage';
import { DailyPage } from './pages/Daily/DailyPage';
import { ReviewPage, GameReplayPage } from './pages/Review/ReviewPage';
import { MistakesPage } from './pages/Profile/MistakesPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { LibraryPage } from './pages/Library/LibraryPage';
import { NavBar } from './components/Shell/NavBar';
import { SettingsSheet } from './components/Shell/SettingsSheet';
import { Toaster, toast } from './components/Shell/Toast';
import { ACHIEVEMENTS } from './data/achievements/achievements';
import { primeAudio, setSoundEnabled } from './app/sound';
import './styles/base.css';
import './styles/app.css';

function App() {
  const { route, go, back } = useRoute();
  const { profile, pendingAchievements, clearPending } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setSoundEnabled(profile.settings.sound);
  }, [profile.settings.sound]);

  useEffect(() => {
    const onFirst = () => {
      primeAudio();
      window.removeEventListener('pointerdown', onFirst);
    };
    window.addEventListener('pointerdown', onFirst, { once: true });
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  // Achievement celebrations are queued and shown one at a time.
  useEffect(() => {
    if (!pendingAchievements.length) return;
    const id = pendingAchievements[0];
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) toast({ icon: a.icon, title: `成就解锁：${a.name}`, body: `${a.hint} · +${a.xp} XP` });
    clearPending();
  }, [pendingAchievements, clearPending]);

  const nav = go as Navigate;
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  return (
    <div className="app">
      <NavBar route={route.name} go={nav} onSettings={openSettings} />
      <main className="app-main" id="main">
        {route.name === 'home' && <HomePage go={nav} openSettings={openSettings} />}
        {route.name === 'learn' && <LearnPage go={nav} />}
        {route.name === 'lesson' && <LessonPage lessonId={route.id} go={nav} />}
        {route.name === 'levels' && <LevelsPage go={nav} />}
        {route.name === 'level' && <LevelPage levelId={route.id} go={nav} />}
        {route.name === 'battle' && <BattlePage go={nav} />}
        {route.name === 'online' && <OnlinePage />}
        {route.name === 'practice' && <PracticePage />}
        {route.name === 'daily' && <DailyPage go={nav} />}
        {route.name === 'review' && <ReviewPage go={nav} />}
        {route.name === 'review-game' && <GameReplayPage gameId={route.id} go={nav} />}
        {route.name === 'mistakes' && <MistakesPage go={nav} />}
        {route.name === 'profile' && <ProfilePage go={nav} />}
        {route.name === 'library' && <LibraryPage go={nav} />}
        {route.name === 'patterns' && <LibraryPage go={nav} />}
      </main>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} go={nav} />
      <Toaster />
      <button className="back-fab" onClick={back} aria-label="返回上一页" style={{ display: 'none' }} />
      <span className="sr-only" aria-live="polite">
        {route.name}
      </span>
    </div>
  );
}

function Boot() {
  const { ready } = useStore();
  if (!ready) {
    return (
      <div className="boot">
        <div className="boot__stone" aria-hidden />
        <p>正在准备棋盘…</p>
      </div>
    );
  }
  return <AppInner />;
}

function AppInner() {
  return <App />;
}

export default function Root() {
  return (
    <ProfileProvider>
      <Boot />
    </ProfileProvider>
  );
}
