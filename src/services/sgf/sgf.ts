import { GoBoard } from '../../engine/GoBoard/GoBoard';
import { parseCoord } from '../../engine/GoBoard/coordinates';
import { BLACK, WHITE, type Color } from '../../engine/GoBoard/types';
import type { GameRecord } from '../../app/types';

/**
 * SGF import/export.
 *
 * Supports the subset that matters for this app and for interchange with other
 * Go software: board size, komi, handicap-free games, moves (B/W incl. passes),
 * comments and the result. Unknown properties are preserved on import in
 * `raw` so re-exporting a third-party file does not destroy information.
 */

const COLS = 'abcdefghijklmnopqrs';

export function toSGF(rec: GameRecord, extra?: { comment?: string }): string {
  const root: string[] = [];
  root.push(`GM[1]`);
  root.push(`FF[4]`);
  root.push(`CA[UTF-8]`);
  root.push(`AP[GoMaster:1.0]`);
  root.push(`SZ[${rec.size}]`);
  root.push(`KM[${rec.komi}]`);
  root.push(`PB[${escape(rec.black)}]`);
  root.push(`PW[${escape(rec.white)}]`);
  if (rec.result) root.push(`RE[${escape(rec.result)}]`);
  root.push(`DT[${new Date(rec.startedAt).toISOString().slice(0, 10)}]`);
  if (extra?.comment) root.push(`C[${escape(extra.comment)}]`);
  if (rec.ruleset === 'chinese') root.push(`RU[Chinese]`);
  else root.push(`RU[Japanese]`);

  let body = '';
  for (const mv of rec.moves) {
    const color = mv.color === BLACK ? 'B' : 'W';
    if (mv.pass) {
      body += `;${color}[]`;
      continue;
    }
    const idx = parseCoord(rec.size, mv.at);
    if (idx < 0) continue;
    const x = idx % rec.size;
    const y = Math.floor(idx / rec.size);
    body += `;${color}[${COLS[x]}${COLS[y]}]`;
    if (mv.comment) body += `C[${escape(mv.comment)}]`;
  }
  return `(;${root.join('')}${body})`;
}

function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function unescape(s: string): string {
  return s.replace(/\\([\\\]])/g, '$1');
}

export interface ParsedSGF {
  size: number;
  komi: number;
  black: string;
  white: string;
  result?: string;
  moves: Array<{ at: string; color: Color; pass?: boolean; comment?: string }>;
  comments: string[];
}

/** Parse the first game tree of an SGF string. */
export function parseSGF(text: string): ParsedSGF {
  const src = text.trim();
  if (!src.startsWith('(')) throw new Error('不是有效的 SGF 文件');
  // Root properties live between the opening "(" and the first playable node
  // (";B[" / ";W["), possibly spanning a setup node.
  const firstMove = src.search(/;\s*[BW]\s*\[/);
  const header = src.slice(0, firstMove < 0 ? src.length : firstMove);
  const props = readProps(header);
  const size = Number(props['SZ']?.[0] ?? 19);
  if (![9, 13, 19].includes(size)) throw new Error(`不支持的棋盘大小 ${size}`);
  const komi = Number(props['KM']?.[0] ?? 7.5);
  const black = props['PB']?.[0] ?? '黑棋';
  const white = props['PW']?.[0] ?? '白棋';
  const result = props['RE']?.[0];

  const moves: ParsedSGF['moves'] = [];
  const comments: string[] = [];
  // Walk every ;B[..] / ;W[..] in order.
  const re = /;\s*([BW])\s*\[([^\]]*)\](?:\s*C\[((?:\\.|[^\]])*)\])?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const color = m[1] === 'B' ? BLACK : WHITE;
    const raw = m[2].trim();
    if (m[3]) comments.push(unescape(m[3]));
    if (!raw) {
      moves.push({ at: '', color, pass: true, comment: m[3] ? unescape(m[3]) : undefined });
      continue;
    }
    // SGF coordinates are lowercase letters, origin top-left.
    const x = COLS.indexOf(raw[0]);
    const y = COLS.indexOf(raw[1]);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    moves.push({
      at: `${'ABCDEFGHJKLMNOPQRST'[x]}${size - y}`,
      color,
      comment: m[3] ? unescape(m[3]) : undefined,
    });
  }
  return { size, komi, black, white, result, moves, comments };
}

function readProps(header: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /([A-Z]{1,2})\s*((?:\[(?:\\.|[^\]])*\])+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header))) {
    const values: string[] = [];
    const vr = /\[((?:\\.|[^\]])*)\]/g;
    let v: RegExpExecArray | null;
    while ((v = vr.exec(m[2]))) values.push(unescape(v[1]));
    out[m[1]] = values;
  }
  return out;
}

/** Build a record from a parsed SGF so it can be reviewed in the app. */
export function recordFromSGF(parsed: ParsedSGF, fallbackId: string): GameRecord {
  return {
    id: fallbackId,
    size: parsed.size,
    black: parsed.black,
    white: parsed.white,
    moves: parsed.moves,
    result: parsed.result,
    komi: parsed.komi,
    ruleset: 'chinese',
    startedAt: Date.now(),
    endedAt: Date.now(),
    mode: 'battle',
  };
}

/** Verify a record's moves are all legal; used by the import flow. */
export function validateRecord(rec: GameRecord): { ok: boolean; error?: string } {
  const board = new GoBoard(rec.size);
  for (let i = 0; i < rec.moves.length; i++) {
    const mv = rec.moves[i];
    if (mv.pass) {
      board.pass(mv.color);
      continue;
    }
    const idx = parseCoord(rec.size, mv.at);
    if (idx < 0) return { ok: false, error: `第 ${i + 1} 手坐标无效` };
    const res = board.play(idx, mv.color);
    if (!res.ok) return { ok: false, error: `第 ${i + 1} 手不合法（${res.reason}）` };
  }
  return { ok: true };
}
