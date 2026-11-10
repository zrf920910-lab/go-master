import type { Color } from '../engine/GoBoard/types';

/* ------------------------------------------------------------------------- */
/* Content model                                                             */
/* ------------------------------------------------------------------------- */

/**
 * A board position authored as a picture. Rows are written top→bottom exactly
 * as they appear on screen: `X` = black stone, `O` = white stone, `.` = empty,
 * `#` = empty point that is still highlighted as relevant (renders as empty).
 * This keeps teaching material reviewable by eye and impossible to mis-index.
 */
export interface PositionSpec {
  size: number;
  diagram: string[];
  turn: Color;
  /** Point that is illegal to play immediately (teaching the ko rule). */
  ko?: string;
  /** Optional star/described points already marked when the position loads. */
  marks?: Array<{ at: string; kind: 'target' | 'label' | 'liberty'; text?: string }>;
}

export type DrillCheck =
  /** The move must capture at least `min` stones. */
  | { kind: 'capture'; min?: number }
  /** The move must put an enemy block into atari. */
  | { kind: 'atari' }
  /** The move must give the friendly block at `group` more than one liberty. */
  | { kind: 'escape'; group: string }
  /** The move must join the friendly block at `group` with another stone. */
  | { kind: 'connect'; group: string }
  /** The move must separate the two enemy blocks (they were connected before). */
  | { kind: 'cut'; groups: [string, string] }
  /** After the move, the friendly block at `group` has two eyes. */
  | { kind: 'twoEyes'; group: string }
  /** After the move, the friendly block at `group` cannot be captured next move. */
  | { kind: 'alive'; group: string }
  /** The move must be one of these points (judgement calls). */
  | { kind: 'points'; at: string[]; allowOthers?: boolean }
  /** The move must reduce the opponent's eye space so the group cannot live. */
  | { kind: 'kill'; group: string }
  /** Any legal move (free placement teaching step). */
  | { kind: 'legal' }
  /** Tap one of the liberties of the block at `group` (does not place a stone). */
  | { kind: 'libertiesOf'; group: string }
  /** Tap a point that is NOT a liberty of the block (contrast teaching). */
  | { kind: 'notLibertiesOf'; group: string };

export interface Drill {
  id: string;
  prompt: string;
  detail?: string;
  check: DrillCheck;
  success: string;
  /** Gentle nudge after a wrong move; must not contain the answer. */
  gentle: string;
  hint: string;
  /** Shown when the learner has used up the gentle attempts (still no coords). */
  answerHint?: string;
  /** The canonical solution, used for the "show me" animation and hints. */
  answer: string;
  /** Which knowledge tag this trains (mastery + mistake notebook). */
  tag: string;
  /** 'play' places a stone; 'tap' only identifies a point. */
  interaction?: 'play' | 'tap';
  /** Overrides the lesson board. */
  position?: PositionSpec;
  size?: number;
  turn?: Color;
}

export type DemoAction =
  | { type: 'stone'; at: string; color: Color }
  | { type: 'liberties'; at: string; label?: string }
  | { type: 'libertiesOff'; at: string }
  | { type: 'capture'; at: string; count?: number }
  | { type: 'remove'; at: string }
  | { type: 'mark'; at: string; kind: 'right' | 'wrong' | 'target' | 'liberty' | 'label'; text?: string }
  | { type: 'arrow'; from: string; to: string; text?: string }
  | { type: 'clearMarks' };

export interface DemoFrame {
  text: string;
  caption?: string;
  actions: DemoAction[];
  /** Hold time in ms at 1× before the next frame. */
  hold?: number;
}

export interface LessonSection {
  paragraphs?: string[];
  bullets?: string[];
  keyPoint?: string;
}

export interface Lesson {
  id: string;
  /** Level this lesson belongs to (used for the learning map). */
  levelId: string;
  order: number;
  title: string;
  subtitle: string;
  minutes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  xp: number;
  position: PositionSpec;
  intro: LessonSection;
  demo: DemoFrame[];
  drills: Drill[];
  practice?: {
    prompt: string;
    detail?: string;
    position: PositionSpec;
    check: DrillCheck;
    answer: string;
    success: string;
    /** Moves before the position is scored, for the practice star. */
    maxMoves: number;
  };
  summary: { points: string[]; mistakes: string[] };
}

/* ------------------------------------------------------------------------- */
/* Progress model                                                            */
/* ------------------------------------------------------------------------- */

export interface DrillAttempt {
  drillId: string;
  lessonId?: string;
  levelId?: string;
  kind: 'lesson' | 'level' | 'daily' | 'mistake';
  correct: boolean;
  attempts: number;
  usedHint: boolean;
  wrongPoints: number[];
  ms: number;
  at: number;
  tag: string;
  prompt: string;
}

export interface MistakeEntry {
  id: string;
  lessonId?: string;
  levelId?: string;
  drillId: string;
  prompt: string;
  tag: string;
  wrongPoints: number[];
  attempts: number;
  at: number;
  resolved: boolean;
}

export interface LessonProgress {
  completed: boolean;
  bestStars: 0 | 1 | 2 | 3;
  drillsCorrect: number;
  drillsTotal: number;
  lastAt: number;
  secondsSpent: number;
  replays: number;
}

export interface LevelStageResult {
  stars: 0 | 1 | 2 | 3;
  attempts: number;
  moves: number;
  hints: number;
  perfect: boolean;
  at: number;
}

export interface LevelProgress {
  stages: Record<string, LevelStageResult>;
}

export interface GameRecord {
  id: string;
  size: number;
  black: string;
  white: string;
  moves: Array<{ at: string; color: Color; pass?: boolean; comment?: string }>;
  result?: string;
  komi: number;
  ruleset: 'chinese' | 'japanese';
  startedAt: number;
  endedAt?: number;
  note?: string;
  aiLevel?: number;
  mode: 'battle' | 'practice' | 'daily';
  /** Positions marked as key moments during review. */
  marks?: number[];
}

export interface Settings {
  sound: boolean;
  coordinates: boolean;
  komi: number;
  ruleset: 'chinese' | 'japanese';
  showHints: boolean;
}

export interface Profile {
  name: string;
  avatar: string;
  createdAt: number;
  xp: number;
  streak: number;
  lastStudyDay: string;
  totalDays: number;
  lessons: Record<string, LessonProgress>;
  levels: Record<string, LevelProgress>;
  unlockedLevels: string[];
  achievements: Record<string, number>;
  attempts: DrillAttempt[];
  mistakes: MistakeEntry[];
  settings: Settings;
  daily: { date: string; completed: boolean; score: number; total: number };
  mastery: Record<string, { seen: number; correct: number }>;
  stats: {
    lessonsDone: number;
    levelsDone: number;
    puzzlesDone: number;
    gamesPlayed: number;
    stonesPlayed: number;
    capturesMade: number;
  };
  /** Saved practice shapes. */
  shapes?: Array<{ id: string; name: string; size: number; cells: number[]; at: number }>;
}

export interface DailyPuzzle {
  id: string;
  index: number;
  prompt: string;
  tag: string;
  check: DrillCheck;
  position: PositionSpec;
  answer: string;
  interaction?: 'play' | 'tap';
  lessonId?: string;
  levelId?: string;
  success: string;
  hint: string;
}

export interface LevelStage {
  id: string;
  title: string;
  tag: string;
  /** 'play' places a stone; 'tap' only identifies a point. */
  interaction?: 'play' | 'tap';
  position: PositionSpec;
  prompt: string;
  detail?: string;
  hint: string;
  check: DrillCheck;
  answer: string;
  success: string;
  wrong: string;
  /** Moves allowed before the star is lost. */
  maxMoves: number;
  twoStarMoves: number;
  xp: number;
}

export interface LevelDef {
  id: string;
  index: number;
  chapter: number;
  title: string;
  blurb: string;
  goal: string;
  icon: string;
  stages: LevelStage[];
}

export interface Chapter {
  index: number;
  title: string;
  subtitle: string;
  color: string;
  levelIds: string[];
}
