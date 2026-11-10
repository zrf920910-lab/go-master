import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { drawBoard, hitTest, type BoardView } from './renderer';
import { BLACK, WHITE, type Color } from '../../engine/GoBoard/types';
import './board.css';

export interface GoBoardCanvasProps {
  size: number;
  cells: Int8Array;
  /** Called with a board index; return false to reject (visual shake). */
  onPlay?: (index: number) => boolean | void;
  /** Optional group selection (practice mode / review). */
  onSelectGroup?: (index: number) => void;
  selectable?: boolean;
  /** Current side to play; drives the ghost preview on hover devices. */
  turn?: Color;
  lastMove?: number;
  marks?: BoardView['marks'];
  selected?: number[];
  ownership?: Int8Array | null;
  showCoordinates?: boolean;
  /** Appearance progress per stone index (for drop animations). */
  appear?: Map<number, number>;
  vanish?: Map<number, number>;
  rings?: Map<number, string>;
  disabled?: boolean;
  /** Extra class for layout */
  className?: string;
  /** Constraints the board's max size in CSS px (it also fits its container). */
  maxSize?: number;
  ariaLabel?: string;
  /** Read-only boards still render marks and highlight. */
  interactive?: boolean;
}

export function GoBoardCanvas(props: GoBoardCanvasProps) {
  const {
    size,
    cells,
    onPlay,
    onSelectGroup,
    selectable,
    turn = BLACK,
    lastMove = -1,
    marks,
    selected,
    ownership,
    showCoordinates = false,
    appear,
    vanish,
    rings,
    disabled,
    className,
    maxSize = 760,
    ariaLabel,
    interactive = true,
  } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [css, setCss] = useState(0);
  const [ghost, setGhost] = useState<{ index: number; color: Color; alpha: number } | null>(null);
  const [shake, setShake] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [viewportH, setViewportH] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));

  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Never let the board push its controls off screen: it is capped by the
  // smaller of the configured maximum and the visible height.
  const heightCap = Math.max(220, viewportH - 300);
  const effectiveMax = Math.min(maxSize, heightCap);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const side = Math.min(rect.width, rect.height || rect.width, effectiveMax);
      setCss(Math.max(160, Math.floor(side)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [effectiveMax]);

  // A ghost preview must never outlive the interactive state (e.g. after the
  // drill is solved, or while the AI is thinking).
  useEffect(() => {
    if (disabled || !interactive || selectable || !onPlay) setGhost(null);
  }, [disabled, interactive, selectable, onPlay]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const view = useMemo<BoardView>(() => {
    const stones: BoardView['stones'] = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c) continue;
      stones.push({
        index: i,
        color: c as Color,
        appear: appear?.get(i) ?? 1,
        vanish: vanish?.get(i) ?? 0,
        ring: rings?.get(i),
      });
    }
    return {
      size,
      cells,
      stones,
      marks,
      lastMove,
      ghost: ghost ?? undefined,
      ownership,
      showCoordinates,
      showStars: true,
    };
  }, [size, cells, marks, lastMove, ghost, ownership, showCoordinates, appear, vanish, rings]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || css <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.floor(css * dpr)) {
      canvas.width = Math.floor(css * dpr);
      canvas.height = Math.floor(css * dpr);
    }
    canvas.style.width = `${css}px`;
    canvas.style.height = `${css}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Reset any prior transform before the drawing pass.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBoard(ctx, { view, css, dpr, selected, reducedMotion: reduced });
  }, [view, css, selected, reduced]);

  const pointFromEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return -1;
      return hitTest(size, css, canvas.getBoundingClientRect(), e.clientX, e.clientY);
    },
    [size, css],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!interactive || disabled) return;
      const idx = pointFromEvent(e);
      if (idx < 0) return;
      // A stone is a selection target (show its liberties); an empty point is a
      // move. This lets one board support both inspecting and playing.
      if (onSelectGroup && cells[idx] !== 0) {
        onSelectGroup(idx);
        return;
      }
      if (selectable) {
        onSelectGroup?.(idx);
        return;
      }
      if (!onPlay) return;
      const ok = onPlay(idx);
      if (ok === false) {
        setShake((s) => s + 1);
      }
    },
    [interactive, disabled, pointFromEvent, selectable, onSelectGroup, onPlay, cells],
  );

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!interactive || disabled || selectable || e.pointerType === 'touch' || !onPlay) return;
      if (disabled) {
        setGhost(null);
        return;
      }
      const idx = pointFromEvent(e);
      if (idx < 0 || cells[idx] !== 0) {
        setGhost(null);
        return;
      }

      setGhost({ index: idx, color: turn, alpha: 0.34 });
    },
    [interactive, disabled, selectable, pointFromEvent, cells, turn],
  );

  return (
    <div
      ref={wrapRef}
      className={`board-frame ${className ?? ''}`}
      data-shake={shake}
      style={css > 0 ? { width: css + 24 } : undefined}
    >
      <div className="board-frame__inner" style={css > 0 ? { width: css, height: css } : undefined}>
        <canvas
          ref={canvasRef}
          className="board-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handleMove}
          onPointerLeave={() => setGhost(null)}
          role={interactive ? 'application' : 'img'}
          aria-label={ariaLabel ?? `${size} 路围棋棋盘`}
          tabIndex={interactive ? 0 : -1}
          onKeyDown={(e) => {
            if (!interactive || selectable) return;
            // Keyboard play: arrows move the cursor, Enter plays.
            const key = e.key;
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(key)) return;
            e.preventDefault();
            const cur = ghost?.index ?? Math.floor((size * size) / 2);
            if (key === 'Enter' || key === ' ') {
              if (cur >= 0) onPlay?.(cur);
              return;
            }
            let x = cur % size;
            let y = Math.floor(cur / size);
            if (key === 'ArrowLeft') x = Math.max(0, x - 1);
            if (key === 'ArrowRight') x = Math.min(size - 1, x + 1);
            if (key === 'ArrowUp') y = Math.max(0, y - 1);
            if (key === 'ArrowDown') y = Math.min(size - 1, y + 1);
            setGhost({ index: y * size + x, color: turn, alpha: 0.34 });
          }}
        />
      </div>
    </div>
  );
}

export { BLACK, WHITE };
