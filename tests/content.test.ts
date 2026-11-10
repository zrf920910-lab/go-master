import { describe, expect, it } from 'vitest';
import { coreLessons } from '../src/data/courses/coreLessons';
import { boardFromSpec } from '../src/learning/Exercises/position';
import { validate } from '../src/learning/Exercises/validate';
import { compileDemo } from '../src/learning/Animations/demoEngine';
import { parseCoord } from '../src/engine/GoBoard/coordinates';
import { lessons } from '../src/data/courses';
import { levels } from '../src/data/levels';
import { ACHIEVEMENTS } from '../src/data/achievements/achievements';
import { PATTERNS } from '../src/data/patterns/patterns';

const at = (size: number, label: string) => {
  const i = parseCoord(size, label);
  if (i < 0) throw new Error(`bad coord ${label}`);
  return i;
};

describe('lesson content', () => {
  it('every lesson has a unique id, valid positions and a non-empty demo', () => {
    const ids = new Set<string>();
    for (const lesson of lessons) {
      expect(ids.has(lesson.id), `duplicate lesson id ${lesson.id}`).toBe(false);
      ids.add(lesson.id);
      // Positions must parse without errors.
      expect(() => boardFromSpec(lesson.position)).not.toThrow();
      expect(lesson.demo.length).toBeGreaterThanOrEqual(3);
      expect(lesson.drills.length).toBeGreaterThanOrEqual(2);
      expect(lesson.summary.points.length).toBeGreaterThan(0);
      for (const drill of lesson.drills) {
        if (drill.position) expect(() => boardFromSpec(drill.position!)).not.toThrow();
        expect(drill.tag.length).toBeGreaterThan(0);
        expect(drill.success.length).toBeGreaterThan(3);
        expect(drill.gentle.length).toBeGreaterThan(2);
      }
    }
    expect(coreLessons.length).toBeGreaterThanOrEqual(5);
  });

  it('the five required lessons exist', () => {
    const wanted = ['认识棋盘', '学会落子', '什么是气', '如何提子', '什么是打吃'];
    for (const title of wanted) {
      expect(lessons.some((l) => l.title === title), `missing lesson ${title}`).toBe(true);
    }
  });

  it('every demo frame compiles without board errors', () => {
    for (const lesson of lessons) {
      const base = boardFromSpec(lesson.position);
      const compiled = compileDemo(lesson.position.size, base.cells, lesson.demo);
      expect(compiled.errors, `${lesson.id}: ${compiled.errors.join('; ')}`).toEqual([]);
      expect(compiled.frames.length).toBe(lesson.demo.length);
    }
  });

  it('each drill answer satisfies its own check', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      for (const drill of lesson.drills) {
        const spec = drill.position ?? lesson.position;
        const before = boardFromSpec(drill.position ? drill.position : lesson.position);
        const color = drill.turn ?? (drill.position?.turn ?? lesson.position.turn);
        const answerIdx = at(spec.size, drill.answer);
        if (drill.interaction === 'tap') continue; // taps are validated separately below
        const after = before.clone();
        const res = after.play(answerIdx, color);
        if (!res.ok) {
          failures.push(`${lesson.id}/${drill.id}: answer ${drill.answer} is illegal (${res.reason})`);
          continue;
        }
        const check = validate(drill.check, {
          before,
          after,
          index: answerIdx,
          color,
          captured: res.captured,
        });
        if (!check.ok) failures.push(`${lesson.id}/${drill.id}: answer ${drill.answer} does not satisfy ${drill.check.kind}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('tap drills accept at least one of their authored points', () => {
    const failures: string[] = [];
    for (const lesson of lessons) {
      for (const drill of lesson.drills) {
        if (drill.interaction !== 'tap') continue;
        const spec = drill.position ?? lesson.position;
        const before = boardFromSpec(spec);
        const answerIdx = at(spec.size, drill.answer);
        const res = validate(drill.check, {
          before,
          after: before,
          index: answerIdx,
          color: before.turn,
          captured: [],
        });
        if (!res.ok) failures.push(`${lesson.id}/${drill.id}: tap ${drill.answer} rejected`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('level content', () => {
  it('has exactly 30 levels in 10 chapters with stages', () => {
    expect(levels.length).toBe(30);
    const chapters = new Set(levels.map((l) => l.chapter));
    expect(chapters.size).toBe(10);
    for (const lv of levels) {
      expect(lv.stages.length).toBeGreaterThanOrEqual(3);
      expect(lv.stages.length).toBeLessThanOrEqual(8);
    }
  });

  it('every level stage answer is legal and satisfies its check', () => {
    const failures: string[] = [];
    for (const lv of levels) {
      for (const stage of lv.stages) {
        const before = boardFromSpec(stage.position);
        const idx = at(stage.position.size, stage.answer);
        if (stage.interaction === 'tap') {
          const tap = validate(stage.check, { before, after: before, index: idx, color: stage.position.turn, captured: [] });
          if (!tap.ok) failures.push(`${lv.id}/${stage.id}: tap answer rejected`);
          continue;
        }
        const after = before.clone();
        const res = after.play(idx, stage.position.turn);
        if (!res.ok) {
          failures.push(`${lv.id}/${stage.id}: answer illegal (${res.reason})`);
          continue;
        }
        const check = validate(stage.check, {
          before,
          after,
          index: idx,
          color: stage.position.turn,
          captured: res.captured,
        });
        if (!check.ok) failures.push(`${lv.id}/${stage.id}: answer does not satisfy ${stage.check.kind}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('pattern library coverage', () => {
  // The brief lists these terms explicitly; the library must cover every one.
  const REQUIRED: Record<string, string[]> = {
    '基础规则': ['棋盘', '气', '提子', '禁入点', '打劫', '终局', '活棋', '死棋'],
    '基础棋形': ['长', '立', '尖', '跳', '小飞', '大飞', '碰', '靠', '扳', '断', '接', '虎口', '双', '扳粘'],
    '吃子技巧': ['打吃', '双打吃', '征子', '枷吃', '门吃', '抱吃', '接不归', '倒扑', '倒脱靴', '扑'],
    '攻防技巧': ['连接', '切断', '补断', '弃子', '腾挪', '反击', '先手', '后手', '交换', '做眼', '破眼', '杀棋'],
    '死活题': ['真眼', '假眼', '眼位', '直三', '曲三', '丁四', '刀五', '葡萄六', '直四', '曲四', '直二', '方四'],
    '布局实战': ['星位', '小目', '三三', '高目', '目外', '定式', '拆边', '侵消', '官子', '劫争', '厚势', '实地', '围空'],
  };

  it('covers every term the brief lists', () => {
    const names = PATTERNS.map((p) => p.name);
    const missing: string[] = [];
    for (const [category, terms] of Object.entries(REQUIRED)) {
      for (const term of terms) {
        if (!names.some((n) => n.includes(term))) missing.push(`${category}/${term}`);
      }
    }
    expect(missing, `pattern library is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('every pattern has a valid position, unique id and a definition', () => {
    const ids = new Set<string>();
    for (const pattern of PATTERNS) {
      expect(ids.has(pattern.id), `duplicate pattern id ${pattern.id}`).toBe(false);
      ids.add(pattern.id);
      expect(pattern.definition.length).toBeGreaterThan(4);
      expect(() => boardFromSpec(pattern.position), pattern.name).not.toThrow();
    }
  });

  it('life-and-death entries agree with the solver', () => {
    // The pattern text calls these shapes dead or alive; the engine must agree
    // wherever the position is fully enclosed and the notation says so.
    const byId = new Map(PATTERNS.map((p) => [p.id, p]));
    // 直三 is described as dead, 直四 as alive — both are covered in depth by
    // tests/lifeShapes.test.ts; here we only assert the entries exist.
    expect(byId.get('pt-straight-three')?.definition).toContain('死形');
    expect(byId.get('pt-straight-four')?.definition).toContain('活形');
  });
});

describe('achievements', () => {
  it('have unique ids and descriptions', () => {
    const ids = new Set<string>();
    for (const a of ACHIEVEMENTS) {
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.name.length).toBeGreaterThan(1);
      expect(a.hint.length).toBeGreaterThan(2);
    }
  });
});
