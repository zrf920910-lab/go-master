import type { Color } from '../../engine/GoBoard/types';

/**
 * Board visual layer.
 *
 * Everything here is *derived* from an explicit BoardView: the renderer never
 * keeps its own idea of where stones are. Animations are interpolations of
 * that view, so a paused animation always shows a valid board state.
 */

export interface StoneView {
  index: number;
  color: Color;
  /** 0 → 1 drop-in progress. */
  appear?: number;
  /** Highlight ring (last move, selected group, hint). */
  ring?: string;
  /** 0 → 1 fade for stones being captured. */
  vanish?: number;
}

export interface MarkView {
  index: number;
  kind: 'liberty' | 'wrong' | 'right' | 'arrow' | 'label' | 'target' | 'territory';
  text?: string;
  color?: string;
  /** Arrow direction in board units, e.g. {dx:1, dy:0}. */
  dir?: { dx: number; dy: number };
  alpha?: number;
  scale?: number;
}

export interface BoardView {
  size: number;
  cells: Int8Array;
  stones?: StoneView[];
  marks?: MarkView[];
  lastMove?: number;
  ghost?: { index: number; color: Color; alpha: number };
  /** Dim everything except these points (used by focused drills). */
  focus?: number[];
  ownership?: Int8Array | null;
  showCoordinates?: boolean;
  showStars?: boolean;
}

export interface BoardGeometry {
  size: number;
  css: number;
  pad: number;
  cell: number;
  /** x/y of board point in CSS pixels. */
  px: (i: number) => number;
  py: (i: number) => number;
  indexAt: (clientX: number, clientY: number) => number;
  hitRadius: number;
}

export function geometry(size: number, css: number): BoardGeometry {
  const padRatio = size === 19 ? 0.055 : 0.075;
  const pad = Math.round(css * padRatio);
  const cell = (css - pad * 2) / (size - 1);
  const px = (i: number) => pad + (i % size) * cell;
  const py = (i: number) => pad + Math.floor(i / size) * cell;
  return {
    size,
    css,
    pad,
    cell,
    px,
    py,
    hitRadius: Math.max(10, cell * 0.62),
    indexAt(clientX: number, clientY: number) {
      const x = Math.round((clientX - pad) / cell);
      const y = Math.round((clientY - pad) / cell);
      if (x < 0 || y < 0 || x >= size || y >= size) return -1;
      return y * size + x;
    },
  };
}

/** Wood grain is generated once per size, so every frame is a cheap blit. */
const grainCache = new Map<string, HTMLCanvasElement>();

function woodTexture(css: number, dpr: number): HTMLCanvasElement {
  const key = `${css}x${dpr}`;
  const cached = grainCache.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = css * dpr;
  c.height = css * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);

  const base = g.createLinearGradient(0, 0, css, css);
  base.addColorStop(0, '#ecd19b');
  base.addColorStop(0.45, '#e3c288');
  base.addColorStop(1, '#d8b271');
  g.fillStyle = base;
  g.fillRect(0, 0, css, css);

  // Subtle horizontal grain.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    const y = rnd() * css;
    const h = 0.6 + rnd() * 2.2;
    const light = rnd() > 0.5;
    g.fillStyle = light ? `rgba(255, 240, 205, ${0.05 + rnd() * 0.1})` : `rgba(122, 82, 34, ${0.03 + rnd() * 0.06})`;
    g.beginPath();
    g.moveTo(0, y);
    const amp = 2 + rnd() * 7;
    for (let x = 0; x <= css; x += 24) {
      g.lineTo(x, y + Math.sin(x / (70 + rnd() * 40) + i) * amp * 0.35);
    }
    g.lineTo(css, y + h);
    for (let x = css; x >= 0; x -= 24) {
      g.lineTo(x, y + h + Math.sin(x / (70 + rnd() * 40) + i) * amp * 0.35);
    }
    g.closePath();
    g.fill();
  }
  // A few knots, very faint.
  for (let k = 0; k < 3; k++) {
    const x = rnd() * css;
    const y = rnd() * css;
    const r = 6 + rnd() * 16;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(140, 96, 40, 0.10)');
    rg.addColorStop(1, 'rgba(140, 96, 40, 0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  grainCache.set(key, c);
  return c;
}

export interface DrawOptions {
  view: BoardView;
  css: number;
  dpr: number;
  selected?: number[];
  reducedMotion?: boolean;
}

const STAR_CACHE = new Map<number, number[]>();

function stars(size: number): number[] {
  let s = STAR_CACHE.get(size);
  if (s) return s;
  const mid = Math.floor(size / 2);
  const near = size === 19 ? 3 : size === 13 ? 3 : 2;
  const far = size - 1 - near;
  const xs = size === 19 ? [near, mid, far] : [near, mid, far];
  s = [];
  for (const y of xs) for (const x of xs) s.push(y * size + x);
  if (size === 19) {
    s.push(3 * size + 9, 9 * size + 3, 9 * size + 15, 15 * size + 9);
  }
  STAR_CACHE.set(size, s);
  return s;
}

export function drawBoard(ctx: CanvasRenderingContext2D, opts: DrawOptions) {
  const { view, css, dpr } = opts;
  const size = view.size;
  const geo = geometry(size, css);
  ctx.save();
  // setTransform (not scale) so repeated frames never accumulate a transform.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);

  // Board surface (cached wood + inner shadow).
  const tex = woodTexture(css, dpr);
  ctx.drawImage(tex, 0, 0, css, css);

  // Edge vignette
  const vg = ctx.createRadialGradient(css / 2, css / 2, css * 0.35, css / 2, css / 2, css * 0.78);
  vg.addColorStop(0, 'rgba(120, 82, 32, 0)');
  vg.addColorStop(1, 'rgba(96, 62, 20, 0.17)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, css, css);

  // Grid
  const lineW = Math.max(0.9, css / (size === 19 ? 430 : 300));
  ctx.strokeStyle = 'rgba(83, 58, 26, 0.82)';
  ctx.lineWidth = lineW;
  ctx.lineCap = 'square';
  const x0 = geo.px(0);
  const x1 = geo.px(size - 1);
  for (let i = 0; i < size; i++) {
    const p = geo.pad + i * geo.cell;
    ctx.beginPath();
    ctx.moveTo(x0, p);
    ctx.lineTo(x1, p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p, x0);
    ctx.lineTo(p, x1);
    ctx.stroke();
  }

  // Outer border, slightly heavier.
  ctx.lineWidth = Math.max(1.4, lineW * 1.7);
  ctx.strokeRect(x0, x0, x1 - x0, x1 - x0);

  // Star points
  if (view.showStars !== false && size !== 9) {
    ctx.fillStyle = 'rgba(74, 51, 22, 0.9)';
    const r = Math.max(1.8, geo.cell * (size === 19 ? 0.085 : 0.1));
    for (const s of stars(size)) {
      ctx.beginPath();
      ctx.arc(geo.px(s), geo.py(s), r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (size === 9) {
    ctx.fillStyle = 'rgba(74, 51, 22, 0.9)';
    const r = Math.max(2.2, geo.cell * 0.1);
    for (const s of stars(9)) {
      ctx.beginPath();
      ctx.arc(geo.px(s), geo.py(s), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Coordinates
  if (view.showCoordinates) {
    ctx.fillStyle = 'rgba(74, 51, 22, 0.62)';
    ctx.font = `600 ${Math.max(9, geo.cell * 0.32)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = 'ABCDEFGHJKLMNOPQRST';
    for (let i = 0; i < size; i++) {
      const p = geo.pad + i * geo.cell;
      const label = letters[i];
      ctx.fillText(label, p, geo.pad * 0.42);
      ctx.fillText(label, p, css - geo.pad * 0.42);
      ctx.fillText(String(size - i), geo.pad * 0.42, p);
      ctx.fillText(String(size - i), css - geo.pad * 0.42, p);
    }
  }

  // Ownership shading (endgame / review)
  if (view.ownership) {
    for (let i = 0; i < view.ownership.length; i++) {
      const own = view.ownership[i];
      if (!own) continue;
      const isStone = view.cells[i] !== 0;
      if (isStone) continue;
      ctx.fillStyle = own === 1 ? 'rgba(28, 27, 25, 0.16)' : 'rgba(255, 255, 255, 0.5)';
      const r = geo.cell * 0.31;
      ctx.beginPath();
      ctx.arc(geo.px(i), geo.py(i), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Marks under stones (territory dots)
  const drawMark = (m: MarkView) => {
    const cx = geo.px(m.index);
    const cy = geo.py(m.index);
    const a = m.alpha ?? 1;
    const sc = m.scale ?? 1;
    ctx.save();
    ctx.globalAlpha = a;
    if (m.kind === 'liberty') {
      const pulse = m.scale === undefined ? 0.34 : 0.34 * m.scale;
      ctx.fillStyle = 'rgba(35, 92, 158, 0.92)';
      ctx.beginPath();
      ctx.arc(cx, cy, geo.cell * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, geo.cell * 0.035);
      ctx.stroke();
    } else if (m.kind === 'wrong') {
      ctx.strokeStyle = 'rgba(179, 64, 47, 0.95)';
      ctx.lineWidth = Math.max(2.5, geo.cell * 0.1);
      ctx.lineCap = 'round';
      const r = geo.cell * 0.3 * sc;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
    } else if (m.kind === 'right') {
      ctx.strokeStyle = 'rgba(31, 107, 79, 0.95)';
      ctx.lineWidth = Math.max(2.5, geo.cell * 0.11);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - geo.cell * 0.24, cy);
      ctx.lineTo(cx - geo.cell * 0.03, cy + geo.cell * 0.2);
      ctx.lineTo(cx + geo.cell * 0.27, cy - geo.cell * 0.18);
      ctx.stroke();
    } else if (m.kind === 'target') {
      ctx.strokeStyle = m.color ?? 'rgba(217, 139, 33, 0.95)';
      ctx.lineWidth = Math.max(2, geo.cell * 0.075);
      ctx.setLineDash([geo.cell * 0.16, geo.cell * 0.12]);
      ctx.beginPath();
      ctx.arc(cx, cy, geo.cell * 0.42 * sc, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (m.kind === 'arrow') {
      const dir = m.dir ?? { dx: 1, dy: 0 };
      const len = geo.cell * 0.85;
      const ex = cx + dir.dx * len;
      const ey = cy + dir.dy * len;
      ctx.strokeStyle = m.color ?? 'rgba(30, 79, 122, 0.9)';
      ctx.lineWidth = Math.max(2, geo.cell * 0.09);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + dir.dx * geo.cell * 0.22, cy + dir.dy * geo.cell * 0.22);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      const ang = Math.atan2(dir.dy, dir.dx);
      const head = geo.cell * 0.3;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.45) * head, ey - Math.sin(ang - 0.45) * head);
      ctx.lineTo(ex - Math.cos(ang + 0.45) * head, ey - Math.sin(ang + 0.45) * head);
      ctx.closePath();
      ctx.fillStyle = m.color ?? 'rgba(30, 79, 122, 0.9)';
      ctx.fill();
    } else if (m.kind === 'label') {
      // Labels sit in a small pill above the point so they never obscure the
      // stones or liberty dots they are describing.
      const fs = Math.max(10, geo.cell * 0.38);
      const text = m.text ?? '';
      ctx.font = `700 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
      const tw = ctx.measureText(text).width;
      const pw = tw + fs * 0.9;
      const ph = fs * 1.7;
      const ly = cy - geo.cell * 0.78 - ph / 2;
      const lx = Math.max(pw / 2 + 2, Math.min(css - pw / 2 - 2, cx));
      ctx.fillStyle = m.color ?? 'rgba(30, 79, 122, 0.94)';
      const rr = ph / 2;
      ctx.beginPath();
      ctx.roundRect(lx - pw / 2, ly - ph / 2, pw, ph, rr);
      ctx.fill();
      ctx.fillStyle = '#fdfbf4';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx, ly + 0.5);
    }
  };

  const marks = view.marks ?? [];
  for (const m of marks) {
    if (m.kind === 'liberty' || m.kind === 'territory') drawMark(m);
  }

  // Stones
  const stones = view.stones ?? [];
  const r = geo.cell * 0.475;
  const drawStone = (s: StoneView) => {
    const appear = s.appear ?? 1;
    const vanish = s.vanish ?? 0;
    if (appear <= 0 && vanish <= 0) return;
    const cx = geo.px(s.index);
    const cy = geo.py(s.index);
    const scale = (0.55 + 0.45 * easeOut(appear)) * (1 - vanish * 0.85);
    const radius = r * scale;
    const alpha = Math.min(1, appear * 2) * (1 - vanish);
    if (radius <= 0.1 || alpha <= 0) return;
    const lift = (1 - appear) * r * 0.9 - vanish * r * 0.4;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Contact shadow
    ctx.beginPath();
    ctx.ellipse(cx + radius * 0.1, cy + radius * 0.16 + lift * 0.4, radius * 0.98, radius * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60, 40, 12, 0.22)';
    ctx.filter = `blur(${Math.max(1.2, radius * 0.18)}px)`;
    ctx.fill();
    ctx.filter = 'none';

    const g = ctx.createRadialGradient(
      cx - radius * 0.34,
      cy - radius * 0.38 - lift * 0.3,
      radius * 0.08,
      cx,
      cy - lift * 0.2,
      radius,
    );
    if (s.color === 1) {
      g.addColorStop(0, '#6d6a66');
      g.addColorStop(0.35, '#33312e');
      g.addColorStop(0.75, '#151413');
      g.addColorStop(1, '#0a0a09');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#f6f3ec');
      g.addColorStop(0.86, '#e2ddd2');
      g.addColorStop(1, '#c9c3b6');
    }
    ctx.beginPath();
    ctx.arc(cx, cy - lift * 0.2, radius, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    // Specular
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.3, cy - radius * 0.34 - lift * 0.2, radius * 0.34, radius * 0.22, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = s.color === 1 ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.92)';
    ctx.fill();

    if (s.ring) {
      ctx.strokeStyle = s.ring;
      ctx.lineWidth = Math.max(2, geo.cell * 0.075);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  for (const s of stones) drawStone(s);

  // Ghost preview
  if (view.ghost && view.ghost.alpha > 0) {
    const cx = geo.px(view.ghost.index);
    const cy = geo.py(view.ghost.index);
    ctx.save();
    ctx.globalAlpha = view.ghost.alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = view.ghost.color === 1 ? '#26241f' : '#fbf8f1';
    ctx.fill();
    ctx.restore();
  }

  // Selection glow
  if (opts.selected?.length) {
    for (const i of opts.selected) {
      const cx = geo.px(i);
      const cy = geo.py(i);
      ctx.save();
      ctx.strokeStyle = 'rgba(30, 79, 122, 0.9)';
      ctx.lineWidth = Math.max(2, geo.cell * 0.08);
      ctx.setLineDash([geo.cell * 0.2, geo.cell * 0.14]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Overlay marks
  for (const m of marks) {
    if (m.kind !== 'liberty' && m.kind !== 'territory') drawMark(m);
  }

  // Focus dimming
  if (view.focus && view.focus.length) {
    ctx.save();
    ctx.fillStyle = 'rgba(247, 241, 230, 0.35)';
    ctx.beginPath();
    ctx.rect(0, 0, css, css);
    for (const f of view.focus) {
      const cx = geo.px(f);
      const cy = geo.py(f);
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, geo.cell * 0.95, 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
    ctx.restore();
  }

  ctx.restore();
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function hitTest(size: number, css: number, canvasRect: DOMRect, clientX: number, clientY: number): number {
  const geo = geometry(size, css);
  const x = ((clientX - canvasRect.left) / canvasRect.width) * css;
  const y = ((clientY - canvasRect.top) / canvasRect.height) * css;
  const idx = geo.indexAt(x, y);
  if (idx < 0) return -1;
  const dx = x - geo.px(idx);
  const dy = y - geo.py(idx);
  if (Math.hypot(dx, dy) > geo.hitRadius) return -1;
  return idx;
}

/** Last-move marker colour that reads on both stone colours. */
export const LAST_MOVE_RING = '#d98b21';
export const HINT_RING = '#1e4f7a';
export const WRONG_RING = '#b3402f';
export const CORRECT_RING = '#1f6b4f';
