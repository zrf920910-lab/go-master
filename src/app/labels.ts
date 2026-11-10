export const AVATARS = ['panda', 'fox', 'owl', 'cat', 'rabbit', 'crane', 'carp', 'tiger'] as const;
export type AvatarId = (typeof AVATARS)[number];

export const AVATAR_EMOJI: Record<string, string> = {
  panda: '🐼',
  fox: '🦊',
  owl: '🦉',
  cat: '🐱',
  rabbit: '🐰',
  crane: '🕊️',
  carp: '🐟',
  tiger: '🐯',
};

export const TAGS: Record<string, string> = {
  board: '棋盘',
  rules: '规则',
  liberty: '气',
  capture: '提子',
  atari: '打吃',
  suicide: '禁入点',
  ko: '打劫',
  connect: '连接',
  cut: '切断',
  escape: '逃跑',
  ladder: '征子',
  double: '双打吃',
  crane: '接不归',
  shape: '棋形',
  eye: '眼',
  life: '死活',
  opening: '布局',
  territory: '实地',
  thickness: '厚势',
  endgame: '官子',
  tempo: '先手',
  attack: '进攻',
  defense: '防守',
  review: '复盘',
  sacrifice: '弃子',
};

export function tagName(tag: string): string {
  return TAGS[tag] ?? tag;
}

/** Mastery level from the recorded attempt history of a tag. */
export function masteryOf(stat: { seen: number; correct: number } | undefined):
  | 'unseen'
  | 'learning'
  | 'familiar'
  | 'mastered' {
  if (!stat || stat.seen === 0) return 'unseen';
  const rate = stat.correct / stat.seen;
  if (stat.seen >= 6 && rate >= 0.8) return 'mastered';
  if (stat.seen >= 3 && rate >= 0.5) return 'familiar';
  return 'learning';
}

export const MASTERY_LABEL = {
  unseen: '未学习',
  learning: '学习中',
  familiar: '基本掌握',
  mastered: '熟练掌握',
};
