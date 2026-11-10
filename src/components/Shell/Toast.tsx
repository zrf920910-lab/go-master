import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A lightweight toast/celebration layer. Achievements and star results appear
 * here so they do not interrupt the current drill.
 */
export interface Toast {
  id: number;
  icon: string;
  title: string;
  body?: string;
}

let pushToast: ((t: Omit<Toast, 'id'>) => void) | null = null;

export function toast(t: Omit<Toast, 'id'>) {
  pushToast?.(t);
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  const next = useRef(1);

  useEffect(() => {
    pushToast = (t) => {
      const id = next.current++;
      setItems((cur) => [...cur, { ...t, id }]);
      window.setTimeout(() => {
        setItems((cur) => cur.filter((x) => x.id !== id));
      }, 3600);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast__icon" aria-hidden>
            {t.icon}
          </span>
          <div>
            <p className="toast__title">{t.title}</p>
            {t.body && <p className="toast__body">{t.body}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Simple animated number, used for XP counters. */
export function CountUp({ value, duration = 600 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(a + (b - a) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown}</>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="h2">{title}</h2>
      {action}
    </div>
  );
}
