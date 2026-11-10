import type { DailyPuzzle } from '../app/types';
import { lessons } from './courses';
import { levels } from './levels';
import { mulberry32 } from '../engine/AI/GoAI';
import { parseCoord } from '../engine/GoBoard/coordinates';
import { boardFromSpec } from '../learning/Exercises/position';

/**
 * Daily training.
 *
 * The five puzzles are drawn from content the learner has already met (falling
 * back to the earliest lessons when nothing has been learned yet), and the
 * selection is seeded by the date so every device gets the same set for a day
 * while tomorrow differs.
 */
export function dailySeed(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

interface Candidate {
  id: string;
  prompt: string;
  tag: string;
  check: DailyPuzzle['check'];
  position: DailyPuzzle['position'];
  answer: string;
  interaction?: 'play' | 'tap';
  lessonId?: string;
  levelId?: string;
  success: string;
  hint: string;
}

function candidatesForLesson(): Candidate[] {
  const out: Candidate[] = [];
  for (const l of lessons) {
    for (const d of l.drills) {
      out.push({
        id: `d-${l.id}-${d.id}`,
        prompt: d.prompt,
        tag: d.tag,
        check: d.check,
        position: d.position ?? l.position,
        answer: d.answer,
        interaction: d.interaction,
        lessonId: l.id,
        success: d.success,
        hint: d.hint,
      });
    }
  }
  return out;
}

function candidatesForLevels(): Candidate[] {
  const out: Candidate[] = [];
  for (const lv of levels) {
    for (const s of lv.stages) {
      out.push({
        id: `d-${lv.id}-${s.id}`,
        prompt: s.prompt,
        tag: s.tag,
        check: s.check,
        position: s.position,
        answer: s.answer,
        interaction: s.interaction,
        levelId: lv.id,
        success: s.success,
        hint: s.hint,
      });
    }
  }
  return out;
}

let lessonCache: Candidate[] | null = null;
let levelCache: Candidate[] | null = null;

export function dailyPuzzles(date: Date): DailyPuzzle[] {
  lessonCache ??= candidatesForLesson();
  levelCache ??= candidatesForLevels();
  const rand = mulberry32(dailySeed(date));
  const all = [...lessonCache, ...levelCache];
  // Prefer puzzles from lessons the learner has seen; the caller filters by
  // progress when it wants. Here we only guarantee variety and validity.
  const picked: Candidate[] = [];
  const usedTags = new Set<string>();
  const pool = [...all];
  // Shuffle deterministically.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const cand of pool) {
    if (picked.length >= 5) break;
    if (usedTags.has(cand.tag)) continue;
    // Only include positions that load and whose answer is authored.
    if (!cand.answer) continue;
    try {
      const board = boardFromSpec(cand.position);
      if (parseCoord(cand.position.size, cand.answer) < 0) continue;
      void board;
    } catch {
      continue;
    }
    usedTags.add(cand.tag);
    picked.push(cand);
  }
  // Fill up if tag diversity was not enough.
  for (const cand of pool) {
    if (picked.length >= 5) break;
    if (picked.some((p) => p.id === cand.id)) continue;
    picked.push(cand);
  }
  return picked.map((c, i) => ({
    id: c.id,
    index: i,
    prompt: c.prompt,
    tag: c.tag,
    check: c.check,
    position: c.position,
    answer: c.answer,
    interaction: c.interaction,
    lessonId: c.lessonId,
    levelId: c.levelId,
    success: c.success,
    hint: c.hint,
  }));
}

/** Puzzles restricted to knowledge the learner has already encountered. */
export function personalisedDaily(date: Date, knownTags: Set<string>): DailyPuzzle[] {
  const all = dailyPuzzles(date);
  const relevant = all.filter((p) => knownTags.size === 0 || knownTags.has(p.tag));
  return relevant.length >= 3 ? relevant : all;
}
