import { coreLessons } from './coreLessons';
import { moreLessons } from './moreLessons';
import { extraLessons } from './extraLessons';
import type { Lesson } from '../../app/types';

/** The complete lesson library, sorted for the course map. */
export const lessons: Lesson[] = [...coreLessons, ...moreLessons, ...extraLessons].sort(
  (a, b) => a.order - b.order,
);

export function lessonById(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

export function lessonsForLevel(levelId: string): Lesson[] {
  return lessons.filter((l) => l.levelId === levelId);
}

export function lessonIndex(id: string): number {
  return lessons.findIndex((l) => l.id === id);
}
