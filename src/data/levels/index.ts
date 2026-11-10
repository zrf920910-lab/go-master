import { levelList, chapters } from './levels';
import type { LevelDef } from '../../app/types';

export const levels: LevelDef[] = levelList;
export { chapters };

export const LEVELS_PER_CHAPTER = 3;

export function levelIndex(id: string): number {
  return levels.findIndex((l) => l.id === id);
}

export function levelById(id: string): LevelDef | undefined {
  return levels.find((l) => l.id === id);
}

export function lessonLevel(id: string) {
  return levels.find((l) => l.id === id);
}

export function chapterOf(levelId: string) {
  const lv = levelById(levelId);
  if (!lv) return chapters[0];
  return chapters.find((c) => c.index === lv.chapter) ?? chapters[0];
}

export const totalStages = levels.reduce((a, l) => a + l.stages.length, 0);
