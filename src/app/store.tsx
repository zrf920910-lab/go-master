import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DrillAttempt,
  GameRecord,
  Lesson,
  LessonProgress,
  LevelDef,
  LevelStageResult,
  MistakeEntry,
  Profile,
  Settings,
} from './types';
import { DEFAULT_SETTINGS, flushNow, loadMirrored, saveJSON } from '../services/storage/storage';
import { lessons } from '../data/courses';
import { levels } from '../data/levels';
import { ACHIEVEMENTS, evaluateAchievements } from '../data/achievements/achievements';
import { levelIndex, LEVELS_PER_CHAPTER } from '../data/levels';

export const XP_PER_LEVEL = 320;

const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function emptyProfile(): Profile {
  return {
    name: '小棋手',
    avatar: 'panda',
    createdAt: Date.now(),
    xp: 0,
    streak: 0,
    lastStudyDay: '',
    totalDays: 0,
    lessons: {},
    levels: {},
    unlockedLevels: [levels[0].id],
    achievements: {},
    attempts: [],
    mistakes: [],
    settings: { ...DEFAULT_SETTINGS },
    daily: { date: '', completed: false, score: 0, total: 0 },
    mastery: {},
    stats: {
      lessonsDone: 0,
      levelsDone: 0,
      puzzlesDone: 0,
      gamesPlayed: 0,
      stonesPlayed: 0,
      capturesMade: 0,
    },
  };
}

/** Level rank derived from XP — ten named dan-style ranks. */
export const RANKS = [
  { at: 0, name: '围棋萌新', short: '萌新' },
  { at: 260, name: '棋盘学徒', short: '学徒' },
  { at: 640, name: '落子新手', short: '新手' },
  { at: 1100, name: '气之掌握', short: '入门' },
  { at: 1700, name: '捉子小将', short: '小将' },
  { at: 2500, name: '棋形行者', short: '行者' },
  { at: 3500, name: '攻防棋士', short: '棋士' },
  { at: 4800, name: '死活高手', short: '高手' },
  { at: 6400, name: '布局名家', short: '名家' },
  { at: 8500, name: '围棋大师', short: '大师' },
];

export function rankFor(xp: number) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].at) idx = i;
  const current = RANKS[idx];
  const next = RANKS[idx + 1];
  const span = next ? next.at - current.at : 1;
  const progress = next ? Math.min(1, (xp - current.at) / span) : 1;
  return {
    index: idx + 1,
    name: current.name,
    short: current.short,
    next,
    progress,
    toNext: next ? Math.max(0, next.at - xp) : 0,
  };
}

export function lessonStars(p: LessonProgress | undefined): number {
  return p?.bestStars ?? 0;
}

export function levelStars(levelId: string, profile: Profile): number {
  const lp = profile.levels[levelId];
  if (!lp) return 0;
  const stages = Object.values(lp.stages);
  if (!stages.length) return 0;
  return Math.round(stages.reduce((a, s) => a + s.stars, 0) / stages.length);
}

export function totalStars(profile: Profile): number {
  let sum = 0;
  for (const p of Object.values(profile.lessons)) sum += p.bestStars;
  for (const lp of Object.values(profile.levels))
    for (const s of Object.values(lp.stages)) sum += s.stars;
  return sum;
}

export function levelUnlocked(levelId: string, profile: Profile): boolean {
  return profile.unlockedLevels.includes(levelId);
}

/** A level is unlocked when the previous level has at least 1 star on every stage. */
export function isLevelComplete(level: LevelDef | undefined, profile: Profile): boolean {
  if (!level) return false;
  const lp = profile.levels[level.id];
  if (!lp) return false;
  return level.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
}

export function nextLevelId(levelId: string): string | null {
  const i = levelIndex(levelId);
  return i >= 0 && i < levels.length - 1 ? levels[i + 1].id : null;
}

interface StoreValue {
  profile: Profile;
  ready: boolean;
  /** XP, streak and unlock bookkeeping after any learning action. */
  recordAttempt: (a: Omit<DrillAttempt, 'at'>) => void;
  completeLesson: (lesson: Lesson, stars: number, seconds: number, correct: number) => void;
  recordStage: (level: LevelDef, stageId: string, result: Omit<LevelStageResult, 'at'>) => { unlocked: string[] };
  recordGame: (rec: GameRecord) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  rename: (name: string, avatar: string) => void;
  resolveMistake: (id: string) => void;
  removeMistake: (id: string) => void;
  reset: () => void;
  importData: (p: Profile) => void;
  completeDaily: (score: number, total: number) => void;
  saveShapes: (shapes: Profile['shapes']) => void;
  /** Achievements that were unlocked but not yet celebrated. */
  pendingAchievements: string[];
  clearPending: () => void;
  addXp: (n: number) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [ready, setReady] = useState(false);
  const [pendingAchievements, setPendingAchievements] = useState<string[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    loadMirrored<Profile>(emptyProfile()).then((p) => {
      if (!alive) return;
      // Merge with defaults so schemas added later do not break saved data.
      const base = emptyProfile();
      const merged: Profile = {
        ...base,
        ...p,
        settings: { ...base.settings, ...(p?.settings ?? {}) },
        stats: { ...base.stats, ...(p?.stats ?? {}) },
        mastery: p?.mastery ?? {},
        lessons: p?.lessons ?? {},
        levels: p?.levels ?? {},
        achievements: p?.achievements ?? {},
        attempts: p?.attempts ?? [],
        mistakes: p?.mistakes ?? [],
        daily: { ...base.daily, ...(p?.daily ?? {}) },
      };
      hydrated.current = true;
      setProfile(touchDay(merged));
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveJSON(profile);
  }, [profile]);

  useEffect(() => {
    const onHide = () => flushNow(profile);
    window.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [profile]);

  const commit = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((prev) => {
      const next = fn(structuredCloneSafe(prev));
      const unlocked = evaluateAchievements(next);
      if (unlocked.length) {
        next.achievements = { ...next.achievements };
        for (const id of unlocked) next.achievements[id] = Date.now();
        const bonus = unlocked.reduce((a, id) => a + (ACHIEVEMENTS.find((x) => x.id === id)?.xp ?? 0), 0);
        if (bonus) next.xp += bonus;
        setPendingAchievements((cur) => [...cur, ...unlocked]);
      }
      return next;
    });
  }, []);

  const addXp = useCallback(
    (n: number) => commit((p) => ({ ...p, xp: p.xp + n })),
    [commit],
  );

  const recordAttempt = useCallback(
    (a: Omit<DrillAttempt, 'at'>) => {
      commit((p) => {
        const at = Date.now();
        const attempt: DrillAttempt = { ...a, at };
        p.attempts.push(attempt);
        if (p.attempts.length > 900) p.attempts = p.attempts.slice(-700);
        // Any wrong attempt is worth remembering, even if the learner then got
        // it right: the notebook is about *what* was misread.
        if (a.wrongPoints.length) {
          const entry: MistakeEntry = {
            id: `${at}-${Math.random().toString(36).slice(2, 7)}`,
            lessonId: a.lessonId,
            levelId: a.levelId,
            drillId: a.drillId,
            prompt: a.prompt ?? '',
            tag: a.tag,
            wrongPoints: a.wrongPoints,
            attempts: a.attempts,
            at,
            resolved: false,
          };
          p.mistakes.unshift(entry);
          if (p.mistakes.length > 120) p.mistakes.length = 120;
        }
        const tag = p.mastery[a.tag] ?? { seen: 0, correct: 0 };
        p.mastery[a.tag] = {
          seen: tag.seen + 1,
          correct: tag.correct + (a.correct && a.attempts === 1 ? 1 : 0),
        };
        p.stats.puzzlesDone += a.kind === 'level' ? 1 : 0;
        p.stats.stonesPlayed += a.kind === 'level' ? 1 : 0;
        markStudied(p);
        return p;
      });
    },
    [commit],
  );

  const completeLesson = useCallback(
    (lesson: Lesson, stars: number, seconds: number, correct: number) => {
      commit((p) => {
        const prev = p.lessons[lesson.id];
        const best = Math.max(prev?.bestStars ?? 0, stars) as 0 | 1 | 2 | 3;
        p.lessons[lesson.id] = {
          completed: true,
          bestStars: best,
          drillsCorrect: Math.max(prev?.drillsCorrect ?? 0, correct),
          drillsTotal: lesson.drills.length,
          lastAt: Date.now(),
          secondsSpent: (prev?.secondsSpent ?? 0) + seconds,
          replays: (prev?.replays ?? 0) + (prev ? 1 : 0),
        };
        if (!prev?.completed) {
          p.stats.lessonsDone += 1;
          p.xp += lesson.xp;
        }
        markStudied(p);
        return p;
      });
    },
    [commit],
  );

  const recordStage = useCallback(
    (level: LevelDef, stageId: string, result: Omit<LevelStageResult, 'at'>) => {
      const unlockedNow: string[] = [];
      commit((p) => {
        const lp = p.levels[level.id] ?? { stages: {}, bestStars: 0 };
        const prev = lp.stages[stageId];
        // Was the level already complete *before* this stage was recorded?
        const wasAll = level.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
        const keep = prev && prev.stars > result.stars ? prev : { ...result, at: Date.now() };
        lp.stages = { ...lp.stages, [stageId]: keep };
        p.levels[level.id] = lp;
        const all = level.stages.every((s) => (lp.stages[s.id]?.stars ?? 0) > 0);
        if (all && !wasAll) {
          p.stats.levelsDone += 1;
          p.xp += level.stages.reduce((a, s) => a + Math.round(s.xp / 2), 0);
          const idx = levels.findIndex((l) => l.id === level.id);
          const next = levels[idx + 1];
          if (next && !p.unlockedLevels.includes(next.id)) {
            p.unlockedLevels.push(next.id);
            unlockedNow.push(next.id);
          }
          // Chapters unlock the first level of the next chapter too.
          if (next && level.chapter !== next.chapter && !p.unlockedLevels.includes(next.id)) {
            p.unlockedLevels.push(next.id);
          }
        }
        if (result.stars === 3 && !prev) p.xp += 8;
        markStudied(p);
        return p;
      });
      return { unlocked: unlockedNow };
    },
    [commit],
  );

  const recordGame = useCallback(
    (rec: GameRecord) => {
      commit((p) => {
        p.stats.gamesPlayed += 1;
        p.stats.stonesPlayed += rec.moves.filter((m) => !m.pass).length;
        p.xp += rec.mode === 'battle' ? 26 : 6;
        markStudied(p);
        return p;
      });
      void rec;
    },
    [commit],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      commit((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
    },
    [commit],
  );

  const rename = useCallback(
    (name: string, avatar: string) => {
      commit((p) => ({ ...p, name: name.trim() || p.name, avatar }));
    },
    [commit],
  );

  const resolveMistake = useCallback(
    (id: string) => {
      commit((p) => {
        const m = p.mistakes.find((x) => x.id === id);
        if (m) m.resolved = true;
        return p;
      });
    },
    [commit],
  );

  const removeMistake = useCallback(
    (id: string) => {
      commit((p) => ({ ...p, mistakes: p.mistakes.filter((m) => m.id !== id) }));
    },
    [commit],
  );

  const reset = useCallback(() => {
    const fresh = emptyProfile();
    hydrated.current = true;
    setProfile(fresh);
    flushNow(fresh);
  }, []);

  const importData = useCallback((p: Profile) => {
    hydrated.current = true;
    setProfile(touchDay({ ...emptyProfile(), ...p }));
  }, []);

  const completeDaily = useCallback(
    (score: number, total: number) => {
      commit((p) => {
        p.daily = { date: todayKey(), completed: score >= Math.ceil(total * 0.6), score, total };
        if (p.daily.completed) p.xp += 40;
        markStudied(p);
        return p;
      });
    },
    [commit],
  );

  const saveShapes = useCallback(
    (shapes: Profile['shapes']) => {
      commit((p) => ({ ...p, shapes: shapes ?? [] }));
    },
    [commit],
  );

  const clearPending = useCallback(() => setPendingAchievements([]), []);

  const value = useMemo<StoreValue>(
    () => ({
      profile,
      ready,
      recordAttempt,
      completeLesson,
      recordStage,
      recordGame,
      updateSettings,
      rename,
      resolveMistake,
      removeMistake,
      reset,
      importData,
      completeDaily,
      saveShapes,
      pendingAchievements,
      clearPending,
      addXp,
    }),
    [
      profile,
      ready,
      recordAttempt,
      completeLesson,
      recordStage,
      recordGame,
      updateSettings,
      rename,
      resolveMistake,
      removeMistake,
      reset,
      importData,
      completeDaily,
      saveShapes,
      pendingAchievements,
      clearPending,
      addXp,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside ProfileProvider');
  return ctx;
}

function markStudied(p: Profile) {
  const t = todayKey();
  if (p.lastStudyDay === t) return;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = todayKey(y);
  p.streak = p.lastStudyDay === yesterday ? p.streak + 1 : 1;
  p.lastStudyDay = t;
  p.totalDays += 1;
}

function touchDay(p: Profile): Profile {
  // A missed day resets the streak visually (but keeps the record honest).
  if (!p.lastStudyDay) return p;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = todayKey(y);
  if (p.lastStudyDay !== todayKey() && p.lastStudyDay !== yesterday) {
    p.streak = 0;
  }
  return p;
}

function structuredCloneSafe<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(v);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Convenience selectors used across pages. */
export function nextLesson(profile: Profile): Lesson {
  const ordered = [...lessons].sort((a, b) => a.order - b.order);
  return ordered.find((l) => !profile.lessons[l.id]?.completed) ?? ordered[ordered.length - 1];
}

export function recentLesson(profile: Profile): Lesson | null {
  let best: Lesson | null = null;
  let t = 0;
  for (const l of lessons) {
    const p = profile.lessons[l.id];
    if (p && p.lastAt > t) {
      t = p.lastAt;
      best = l;
    }
  }
  return best;
}

export { ACHIEVEMENTS };
export const CHAPTER_SIZE = LEVELS_PER_CHAPTER;
export const today = todayKey;
