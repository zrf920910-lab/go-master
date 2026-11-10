import { useMemo } from 'react';
import type { GoBoard } from '../../engine/GoBoard/GoBoard';
import type { Color } from '../../engine/GoBoard/types';
import { coach, explainMove, type Advice } from '../../ai/teacher';
import { labelOf } from '../../learning/Exercises/validate';
import './teacher.css';

/**
 * The AI teacher panel.
 *
 * It renders *only* what the teaching engine computed from the live board.
 * There is no text here that is not derived from a `Advice` object, and each
 * card shows the numeric facts it was built from so the learner (and a curious
 * adult) can see the evidence.
 */

export interface TeacherPanelProps {
  board: GoBoard;
  color: Color;
  /** Point the learner is hovering / last played, to explain specifically. */
  focus?: number;
  teacherOn: boolean;
  onToggle: (v: boolean) => void;
  onPlaySuggestion?: (index: number) => void;
  compact?: boolean;
}

export function TeacherPanel({ board, color, focus, teacherOn, onToggle, onPlaySuggestion, compact }: TeacherPanelProps) {
  const advice = useMemo(() => (teacherOn ? coach(board, color) : []), [board, color, teacherOn]);
  const focused = useMemo(
    () => (teacherOn && focus !== undefined && focus >= 0 ? explainMove(board, focus, color) : null),
    [board, color, focus, teacherOn],
  );

  return (
    <section className={`teacher ${compact ? 'teacher--compact' : ''}`}>
      <header className="teacher__head">
        <h2 className="h3">
          <span aria-hidden>🧑‍🏫</span> AI 围棋老师
        </h2>
        <label className="switch teacher__toggle">
          <span className="sr-only">开启教学提示</span>
          <input type="checkbox" checked={teacherOn} onChange={(e) => onToggle(e.target.checked)} aria-label="开启教学提示" />
          <i aria-hidden />
        </label>
      </header>

      {!teacherOn && (
        <p className="tiny mute-2">
          已关闭。打开后，老师会根据当前棋盘判断哪里危险、哪里该连接、有没有更好的下法。
        </p>
      )}

      {teacherOn && (
        <>
          {focused && <AdviceCard advice={focused} title="关于这个点" onPlay={onPlaySuggestion} />}
          {advice.map((a, i) => (
            <AdviceCard
              key={`${a.kind}-${i}-${a.title}`}
              advice={a}
              onPlay={onPlaySuggestion}
              subdued={a.suggestion === undefined}
            />
          ))}
          <p className="teacher__note tiny mute-2">
            以上判断全部由当前棋盘的「气、连接、打吃、眼位」计算得出，不是预先写好的台词。
          </p>
        </>
      )}
    </section>
  );
}

function AdviceCard({
  advice,
  title,
  onPlay,
  subdued,
}: {
  advice: Advice;
  title?: string;
  onPlay?: (index: number) => void;
  subdued?: boolean;
}) {
  const tone =
    advice.severity === 'critical' ? 'danger' : advice.severity === 'warn' ? 'warn' : 'info';
  return (
    <article className={`advice advice--${tone} ${subdued ? 'advice--quiet' : ''}`}>
      <div className="advice__top">
        <span className="advice__icon" aria-hidden>
          {tone === 'danger' ? '⚠️' : tone === 'warn' ? '💡' : '📘'}
        </span>
        <div className="grow">
          {title && <p className="advice__kicker">{title}</p>}
          <p className="advice__title">{advice.title}</p>
        </div>
      </div>
      <p className="advice__text">{advice.text}</p>
      <div className="advice__foot">
        <span className="advice__facts">{factsLine(advice.facts)}</span>
        {advice.suggestion !== undefined && advice.suggestion >= 0 && onPlay && (
          <button className="btn btn--sm" onClick={() => onPlay(advice.suggestion!)}>
            下在这里
          </button>
        )}
      </div>
    </article>
  );
}

const FACT_LABELS: Record<string, string> = {
  stones: '棋子数',
  liberties: '气',
  liberty: '最后一口气',
  escapes: '可逃点',
  captured: '可提子',
  at: '位置',
  joined: '连接棋子',
  contested: '被争夺',
  threats: '威胁数',
  selfAtariGroups: '自打吃块数',
  worstSize: '最大一块',
  ownAtari: '我方危险块',
  enemyAtari: '对方危险块',
  legal: '合法',
  eyes: '眼',
  eyesAfter: '做眼后',
  openingValue: '角上价值',
  works: '成立',
  length: '手数',
  contact: '接触点',
};

function factsLine(facts: Advice['facts']): string {
  const parts = Object.entries(facts)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const label = FACT_LABELS[k] ?? k;
      if (typeof v === 'boolean') return `${label} ${v ? '是' : '否'}`;
      return `${label} ${v}`;
    });
  return parts.join(' · ');
}

/** A compact "winrate" style bar used when KataGo analysis is available. */
export function WinrateBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="winrate">
      <div className="winrate__bar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
      <span className="tiny mute-2">{label ?? `胜率 ${pct}%`}</span>
    </div>
  );
}

/** Render an engine's top moves with win rates, when a provider supplied them. */
export function MoveSuggestionList({
  moves,
  size,
  onPlay,
}: {
  moves: Array<{ move: number; winrate?: number; scoreLead?: number; visits?: number; note?: string }>;
  size: number;
  onPlay?: (i: number) => void;
}) {
  if (!moves.length) return <p className="tiny mute-2">没有可用推荐。</p>;
  return (
    <ul className="suggestions">
      {moves.slice(0, 5).map((m, i) => (
        <li key={`${m.move}-${i}`}>
          <button className="suggestion" onClick={() => m.move >= 0 && onPlay?.(m.move)} disabled={m.move < 0}>
            <span className="suggestion__rank">{i + 1}</span>
            <span className="suggestion__coord">{m.move >= 0 ? labelOf(size, m.move) : '停一手'}</span>
            {m.winrate !== undefined && (
              <span className="suggestion__bar" aria-hidden>
                <i style={{ width: `${Math.round(m.winrate * 100)}%` }} />
              </span>
            )}
            <span className="suggestion__meta tiny">
              {m.winrate !== undefined ? `${Math.round(m.winrate * 100)}%` : ''}
              {m.scoreLead !== undefined ? ` · ${m.scoreLead > 0 ? '+' : ''}${m.scoreLead}` : ''}
              {m.visits ? ` · ${m.visits}v` : ''}
            </span>
            {m.note && <span className="suggestion__note tiny mute-2">{m.note}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
