import { useMemo, useState } from 'react';
import { GoBoardCanvas } from '../../components/Board/GoBoardCanvas';
import { boardFromSpec } from '../../learning/Exercises/position';
import { PATTERNS } from '../../data/patterns/patterns';
import { Chip } from '../../components/Progress/Progress';
import { Sheet } from '../../components/Shell/Sheet';
import type { Navigate } from '../../app/router';

/**
 * Pattern library — the reference the lessons build on.
 *
 * Cards show the standard shape on a real board (rendered from the same engine),
 * with the definition and the name. A search box filters by name or definition.
 */
export function LibraryPage({ go }: { go: Navigate }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [activeId, setActiveId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of PATTERNS) map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return [...map.entries()];
  }, []);

  const filtered = PATTERNS.filter((p) => {
    if (category !== 'all' && p.category !== category) return false;
    const q = query.trim();
    if (!q) return true;
    return (
      p.name.includes(q) ||
      p.definition.includes(q) ||
      p.tags.some((t) => t.includes(q))
    );
  });

  const active = PATTERNS.find((p) => p.id === activeId) ?? null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">围棋招式库</p>
          <h1 className="h1">认识每一个术语</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            每个棋形都配了真实棋盘图和解释，可以对照课程学习。
          </p>
        </div>
        <Chip tone="green">{PATTERNS.length} 个招式</Chip>
      </header>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索招式，例如：征子、虎口、打吃"
          aria-label="搜索招式"
          style={{ maxWidth: 320 }}
        />
        <div className="segmented" style={{ flexWrap: 'wrap' }}>
          <button
            className={`segmented__item ${category === 'all' ? 'segmented__item--on' : ''}`}
            onClick={() => setCategory('all')}
          >
            全部
          </button>
          {categories.map(([c, n]) => (
            <button
              key={c}
              className={`segmented__item ${category === c ? 'segmented__item--on' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c} {n}
            </button>
          ))}
        </div>
      </div>

      <div className="pattern-grid">
        {filtered.map((p) => {
          const board = boardFromSpec(p.position);
          return (
            <button key={p.id} className="pattern-card card" onClick={() => setActiveId(p.id)}>
              <div className="pattern-card__board">
                <GoBoardCanvas
                  size={board.size}
                  cells={board.cells}
                  interactive={false}
                  maxSize={150}
                  ariaLabel={`${p.name} 棋形`}
                />
              </div>
              <div className="pattern-card__text">
                <p className="pattern-card__name">{p.name}</p>
                <p className="pattern-card__def tiny mute-2">{p.definition}</p>
                <span className="chip">{p.category}</span>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="muted" style={{ marginTop: 20 }}>
          没有找到匹配的招式，试试别的关键词。
        </p>
      )}

      <Sheet open={Boolean(active)} onClose={() => setActiveId(null)} title={active?.name} wide>
        {active && (
          <div className="pattern-detail">
            <div className="pattern-detail__board">
              <GoBoardCanvas
                size={active.position.size}
                cells={boardFromSpec(active.position).cells}
                interactive={false}
                maxSize={320}
                ariaLabel={`${active.name} 棋形`}
              />
            </div>
            <div className="grow">
              <p className="muted">{active.definition}</p>
              {active.detail && <p className="small muted" style={{ marginTop: 10 }}>{active.detail}</p>}
              {active.example && (
                <p className="tiny mute-2" style={{ marginTop: 10 }}>
                  示例：{active.example}
                </p>
              )}
              <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                {active.lessonId && (
                  <button className="btn btn--sm btn--primary" onClick={() => go({ name: 'lesson', id: active.lessonId! })}>
                    去上这一节
                  </button>
                )}
                <button className="btn btn--sm" onClick={() => go({ name: 'practice' })}>
                  在棋盘上摆一摆
                </button>
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
