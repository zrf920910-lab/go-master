export interface Achievement {
  id: string;
  name: string;
  hint: string;
  icon: string;
  xp: number;
  /** Evaluate against the current profile snapshot. */
  test: (p: AchievementProfile) => boolean;
}

export interface AchievementProfile {
  stats: {
    lessonsDone: number;
    levelsDone: number;
    puzzlesDone: number;
    gamesPlayed: number;
    stonesPlayed: number;
    capturesMade: number;
  };
  streak: number;
  xp: number;
  lessons: Record<string, { completed: boolean; bestStars: number }>;
  levels: Record<string, { stages: Record<string, { stars: number }> }>;
  mastery: Record<string, { seen: number; correct: number }>;
  totalStars: number;
  perfectStages: number;
  mistakeCount: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-lesson',
    name: '初出茅庐',
    hint: '完成第一节课',
    icon: '🌱',
    xp: 20,
    test: (p) => p.stats.lessonsDone >= 1,
  },
  {
    id: 'board-basics',
    name: '初识棋盘',
    hint: '完成「认识棋盘」与「学会落子」',
    icon: '🗺️',
    xp: 30,
    test: (p) => !!(p.lessons['l-board']?.completed && p.lessons['l-place']?.completed),
  },
  {
    id: 'first-capture',
    name: '吃子新手',
    hint: '完成 10 道吃子题',
    icon: '🥢',
    xp: 40,
    test: (p) => (p.mastery['capture']?.correct ?? 0) >= 10,
  },
  {
    id: 'liberty-master',
    name: '气之嗅探',
    hint: '连续答对 8 道「气」的练习',
    icon: '💨',
    xp: 30,
    test: (p) => (p.mastery['liberty']?.correct ?? 0) >= 8,
  },
  {
    id: 'connect-master',
    name: '连接大师',
    hint: '掌握连接与切断',
    icon: '🔗',
    xp: 50,
    test: (p) => (p.mastery['connect']?.correct ?? 0) >= 6 && (p.mastery['cut']?.correct ?? 0) >= 4,
  },
  {
    id: 'life-death',
    name: '死活达人',
    hint: '完成 20 道死活题',
    icon: '👁️',
    xp: 60,
    test: (p) => (p.mastery['life']?.correct ?? 0) >= 20,
  },
  {
    id: 'hundred-games',
    name: '百战棋手',
    hint: '完成 100 盘对弈',
    icon: '⚔️',
    xp: 100,
    test: (p) => p.stats.gamesPlayed >= 100,
  },
  {
    id: 'first-win',
    name: '首胜',
    hint: '在对弈中赢下一局',
    icon: '🏆',
    xp: 40,
    test: (p) => p.stats.gamesPlayed >= 1,
  },
  {
    id: 'streak-3',
    name: '三日不辍',
    hint: '连续学习 3 天',
    icon: '🔥',
    xp: 30,
    test: (p) => p.streak >= 3,
  },
  {
    id: 'streak-7',
    name: '七日精进',
    hint: '连续学习 7 天',
    icon: '🌟',
    xp: 80,
    test: (p) => p.streak >= 7,
  },
  {
    id: 'star-15',
    name: '摘星手',
    hint: '累计获得 15 颗星',
    icon: '✨',
    xp: 40,
    test: (p) => p.totalStars >= 15,
  },
  {
    id: 'star-40',
    name: '星满棋盘',
    hint: '累计获得 40 颗星',
    icon: '🌌',
    xp: 90,
    test: (p) => p.totalStars >= 40,
  },
  {
    id: 'level-5',
    name: '过关斩将',
    hint: '通过 5 个等级',
    icon: '🚩',
    xp: 50,
    test: (p) => p.stats.levelsDone >= 5,
  },
  {
    id: 'level-15',
    name: '棋道二十级',
    hint: '通过 15 个等级',
    icon: '🎖️',
    xp: 90,
    test: (p) => p.stats.levelsDone >= 15,
  },
  {
    id: 'level-30',
    name: '毕业棋士',
    hint: '通过全部 30 个等级',
    icon: '🎓',
    xp: 200,
    test: (p) => p.stats.levelsDone >= 30,
  },
  {
    id: 'perfect-3',
    name: '满分之路',
    hint: '在 3 个关卡中拿到三星',
    icon: '💎',
    xp: 50,
    test: (p) => p.perfectStages >= 3,
  },
  {
    id: 'perfect-10',
    name: '一丝不苟',
    hint: '在 10 个关卡中拿到三星',
    icon: '🔮',
    xp: 100,
    test: (p) => p.perfectStages >= 10,
  },
  {
    id: 'mistake-fixer',
    name: '知错能改',
    hint: '订正错题 10 道',
    icon: '🩹',
    xp: 40,
    test: (p) => p.stats.puzzlesDone >= 10,
  },
  {
    id: 'daily-5',
    name: '每日一练',
    hint: '完成 5 次每日训练',
    icon: '📅',
    xp: 40,
    test: (p) => p.stats.levelsDone >= 1 && p.streak >= 2,
  },
  {
    id: 'xp-1000',
    name: '百炼成钢',
    hint: '累积 1000 点经验',
    icon: '⚡',
    xp: 60,
    test: (p) => p.xp >= 1000,
  },
];

/** Evaluate every achievement and return the ids that are newly earned. */
export function evaluateAchievements(profile: {
  stats: AchievementProfile['stats'];
  streak: number;
  xp: number;
  lessons: Record<string, { completed: boolean; bestStars: number }>;
  levels: Record<string, { stages: Record<string, { stars: number }> }>;
  mastery: Record<string, { seen: number; correct: number }>;
  achievements: Record<string, number>;
  mistakes: Array<{ resolved: boolean }>;
}): string[] {
  let totalStars = 0;
  for (const l of Object.values(profile.lessons)) totalStars += l.bestStars;
  let perfect = 0;
  for (const lv of Object.values(profile.levels)) {
    for (const s of Object.values(lv.stages)) {
      totalStars += s.stars;
      if (s.stars === 3) perfect++;
    }
  }
  const view: AchievementProfile = {
    stats: profile.stats,
    streak: profile.streak,
    xp: profile.xp,
    lessons: profile.lessons,
    levels: profile.levels,
    mastery: profile.mastery,
    totalStars,
    perfectStages: perfect,
    mistakeCount: profile.mistakes.filter((m) => !m.resolved).length,
  };
  return ACHIEVEMENTS.filter((a) => !profile.achievements[a.id] && a.test(view)).map((a) => a.id);
}
