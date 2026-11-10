import type { LevelStage, PositionSpec } from '../../app/types';
import { pos } from '../../learning/Exercises/pos';

/**
 * Level stage authoring helper.
 *
 * A stage is authored with a coordinate list, the mission text, a *semantic*
 * check (capture / atari / connect / kill / twoEyes …) and the intended
 * answer. `tests/content.test.ts` replays the answer against the rules engine,
 * so a stage can never ship unsolvable.
 */
export interface StageInput {
  id: string;
  title: string;
  tag: string;
  size?: number;
  stones: string[];
  turn: 1 | 2;
  prompt: string;
  detail?: string;
  check: LevelStage['check'];
  answer: string;
  success: string;
  wrong: string;
  hint: string;
  interaction?: 'play' | 'tap';
  maxMoves?: number;
  twoStarMoves?: number;
  xp?: number;
  ko?: string;
}

export function stage(s: StageInput): LevelStage {
  const position: PositionSpec = pos(s.size ?? 9, s.stones, s.turn);
  if (s.ko) position.ko = s.ko;
  return {
    id: s.id,
    title: s.title,
    tag: s.tag,
    interaction: s.interaction,
    position,
    prompt: s.prompt,
    detail: s.detail,
    check: s.check,
    answer: s.answer,
    success: s.success,
    wrong: s.wrong,
    hint: s.hint,
    maxMoves: s.maxMoves ?? 1,
    twoStarMoves: s.twoStarMoves ?? 1,
    xp: s.xp ?? 20,
  };
}

/** Build a level from stages with sequential ids. */
export function level(
  id: string,
  index: number,
  chapter: number,
  title: string,
  blurb: string,
  goal: string,
  icon: string,
  stages: Array<Omit<StageInput, 'id' | 'title'> & { title?: string }>,
) {
  return {
    id,
    index,
    chapter,
    title,
    blurb,
    goal,
    icon,
    stages: stages.map((s, i) =>
      stage({
        ...s,
        id: `s${i + 1}`,
        title: s.title ?? `第 ${i + 1} 题`,
      }),
    ),
  };
}
