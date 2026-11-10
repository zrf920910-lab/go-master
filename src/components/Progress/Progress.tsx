import type { ReactNode } from 'react';

export function ProgressBar({
  value,
  max = 1,
  tone = 'green',
  label,
}: {
  value: number;
  max?: number;
  tone?: 'green' | 'amber';
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div
      className={`bar ${tone === 'amber' ? 'bar--amber' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stars({ n, size = 15 }: { n: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${n} 颗星`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} aria-hidden>
          ★
        </i>
      ))}
    </span>
  );
}

export function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'green' | 'amber' | 'blue' | 'red';
}) {
  return <span className={`chip ${tone ? `chip--${tone}` : ''}`}>{children}</span>;
}

export function Ring({
  value,
  size = 56,
  stroke = 5,
  tone = 'var(--green)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="ring__label">{children}</span>
    </span>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden>
        {icon}
      </span>
      <p className="h3">{title}</p>
      {hint && <p className="muted small">{hint}</p>}
    </div>
  );
}
