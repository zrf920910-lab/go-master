import { GoBoard } from '../engine/GoBoard/GoBoard';
import { BLACK, EMPTY, WHITE, opposite, type Color } from '../engine/GoBoard/types';
import { labelOf } from '../learning/Exercises/validate';
import {
  atariThreats,
  connectsTwoBlocks,
  contactCount,
  evaluateMoveSafety,
  eyesOf,
  groupFacts,
  isCutPoint,
  openingValue,
  readLadder,
} from './reading';

/**
 * The teaching engine.
 *
 * Design rule: **every sentence is generated from a computed property of the
 * board.** There is no canned "advice" text. Each explanation carries the
 * concrete facts it was derived from (`facts`), so the UI can show the evidence
 * and a test can assert that the statement matches the position.
 */

export type AdviceKind =
  | 'danger'       // your move leaves a block in atari
  | 'capture'      // you can capture something
  | 'rescue'       // your block is in atari and can run
  | 'connect'      // connecting is urgent
  | 'cut'          // cutting the opponent is good here
  | 'makeEye'      // one more move makes two eyes
  | 'ladder'       // a ladder works / fails
  | 'opening'      // corner value
  | 'endgame'      // boundary
  | 'neutral';

export interface Advice {
  kind: AdviceKind;
  /** Short headline for the UI. */
  title: string;
  /** One or two sentences, all facts computed. */
  text: string;
  /** Board points the advice refers to. */
  points: number[];
  /** Suggested move, when there is one. */
  suggestion?: number;
  /** Machine-checkable facts backing the sentence (used by tests). */
  facts: Record<string, number | string | boolean>;
  severity: 'info' | 'warn' | 'critical';
}

const name = (color: Color) => (color === BLACK ? '黑棋' : '白棋');

/** Atari warning for the side to move, plus the option to escape. */
export function warnAboutAtari(board: GoBoard, color: Color): Advice | null {
  const threats = atariThreats(board, color).filter((t) => t.color === color);
  if (!threats.length) return null;
  // Pick the biggest block at risk.
  threats.sort((a, b) => b.stones.length - a.stones.length);
  const t = threats[0];
  const where = t.stones.map((s) => labelOf(board.size, s)).join('、');
  const lib = labelOf(board.size, t.liberty);
  if (t.escapes.length) {
    return {
      kind: 'rescue',
      title: '你的棋被打吃了',
      text: `${name(color)}这块棋（${where}）只剩 ${lib} 一口气，下一手就要被提走。下在 ${lib} 就能多出一口气。`,
      points: [...t.stones, t.liberty],
      suggestion: t.escapes[0],
      facts: {
        stones: t.stones.length,
        liberties: 1,
        liberty: lib,
        escapes: t.escapes.length,
      },
      severity: 'critical',
    };
  }
  return {
    kind: 'danger',
    title: '这块棋已经救不回来了',
    text: `${name(color)}这块棋（${where}）只剩 ${lib} 一口气，而且 ${lib} 是禁入点，没办法逃。与其硬救，不如在别处下棋。`,
    points: [...t.stones, t.liberty],
    facts: {
      stones: t.stones.length,
      liberties: 1,
      escapes: 0,
      liberty: lib,
    },
    severity: 'warn',
  };
}

/** Captures available right now. */
export function findCaptures(board: GoBoard, color: Color): Advice | null {
  let best: { stones: number[]; liberty: number; size: number } | null = null;
  for (const i of board.legalMoves(color)) {
    const captured = board.capturesAt(i, color);
    if (captured.length && (!best || captured.length > best.size)) {
      best = { stones: captured, liberty: i, size: captured.length };
    }
  }
  if (!best) return null;
  const lib = labelOf(board.size, best.liberty);
  return {
    kind: 'capture',
    title: best.size > 1 ? `可以一手提掉 ${best.size} 颗子` : '可以提掉一颗子',
    text: `下在 ${lib}，${name(opposite(color))}这 ${best.size} 颗子就一口气都没有了，会被从棋盘上拿走。`,
    points: [best.liberty, ...best.stones],
    suggestion: best.liberty,
    facts: { captured: best.size, at: lib },
    severity: 'info',
  };
}

/** Urgent connections: a friendly block that would be cut. */
export function findUrgentConnection(board: GoBoard, color: Color): Advice | null {
  const enemy = opposite(color);
  let best: { move: number; size: number } | null = null;
  for (const i of board.legalMoves(color)) {
    if (!connectsTwoBlocks(board, i, color)) continue;
    if (board.checkLegality(i, color) !== null) continue;
    // How many stones are at risk on both sides?
    let joined = 0;
    for (const n of board.neighbours(i)) {
      if (board.cells[n] === color) joined += board.group(n).stones.length;
    }
    if (!best || joined > best.size) best = { move: i, size: joined };
  }
  if (!best) return null;
  const lib = labelOf(board.size, best.move);
  // Is the point actually contested? Cut points are the ones worth warning about.
  const contested = isCutPoint(board, best.move, enemy);
  return {
    kind: 'connect',
    title: contested ? '这里需要连接' : '可以选择连接',
    text: contested
      ? `下在 ${lib} 能把 ${best.size} 颗棋连成一块。要是被${name(enemy)}抢先下在 ${lib}，这两块棋就会被切断，各自都要为自己数气。`
      : `下在 ${lib} 可以把 ${best.size} 颗棋连起来，气合在一起会更安全。`,
    points: [best.move],
    suggestion: best.move,
    facts: { joined: best.size, contested, at: lib },
    severity: contested ? 'warn' : 'info',
  };
}

/** A cut the opponent has left open. */
export function findCutOpportunity(board: GoBoard, color: Color): Advice | null {
  const enemy = opposite(color);
  for (const i of board.legalMoves(color)) {
    if (!isCutPoint(board, i, enemy)) continue;
    // Prefer cuts that put one side in atari immediately.
    const safety = evaluateMoveSafety(board, i, color);
    const lib = labelOf(board.size, i);
    if (safety.threats.length) {
      return {
        kind: 'cut',
        title: '可以切断',
        text: `下在 ${lib} 能把${name(enemy)}的两块棋分开，而且分开之后有一块只剩 1 口气，很快会被吃掉。`,
        points: [i],
        suggestion: i,
        facts: { at: lib, threats: safety.threats.length },
        severity: 'info',
      };
    }
    return {
      kind: 'cut',
      title: '可以切断',
      text: `下在 ${lib} 能把${name(enemy)}的两块棋分开。被分开的棋要各自数气，通常比连在一起更容易被攻击。`,
      points: [i],
      suggestion: i,
      facts: { at: lib, threats: 0 },
      severity: 'info',
    };
  }
  return null;
}

/** Is there a move that gives this block two eyes? */
export function findEyeMakingMove(board: GoBoard, root: number): Advice | null {
  const color = board.cells[root];
  if (color !== BLACK && color !== WHITE) return null;
  if (eyesOf(board, board.group(root).stones) >= 2) return null;
  for (const i of board.legalMoves(color)) {
    const copy = board.clone();
    if (!copy.play(i, color).ok) continue;
    const stones = copy.group(i).stones;
    if (eyesOf(copy, stones) >= 2) {
      const lib = labelOf(board.size, i);
      return {
        kind: 'makeEye',
        title: '可以做活',
        text: `下在 ${lib} 之后，这块棋就有了两只真眼。两只眼的棋对手永远填不完，就活了。`,
        points: [i, ...stones],
        suggestion: i,
        facts: { at: lib, eyesAfter: 2 },
        severity: 'info',
      };
    }
  }
  return null;
}

/**
 * Explain a candidate move the learner is hovering / played.
 *
 * This is the "为什么这一步危险" / "有没有更好的下法" answer.
 */
export function explainMove(board: GoBoard, index: number, color: Color): Advice {
  if (board.cells[index] !== EMPTY) {
    const facts = groupFacts(board, index);
    if (!facts) {
      return {
        kind: 'neutral',
        title: '这里没有棋子',
        text: '这个点不能落子。',
        points: [index],
        facts: {},
        severity: 'info',
      };
    }
    const lib = facts.liberties.map((l) => labelOf(board.size, l));
    if (facts.inAtari) {
      return {
        kind: 'danger',
        title: '这颗棋被打吃了',
        text: `这块棋只剩 ${lib[0]} 一口气。如果不管它，对手下一手就能把它提走。`,
        points: [index],
        facts: { liberties: 1, inAtari: true },
        severity: 'critical',
      };
    }
    return {
      kind: 'neutral',
      title: `这块${name(facts.color)}有 ${facts.liberties.length} 口气`,
      text: `它的气在 ${lib.join('、') || '（无）'}。${facts.eyes > 0 ? `另外它已经围出了 ${facts.eyes} 只眼。` : ''}`,
      points: [index, ...facts.liberties],
      facts: { liberties: facts.liberties.length, eyes: facts.eyes },
      severity: 'info',
    };
  }

  const safety = evaluateMoveSafety(board, index, color);
  const lib = labelOf(board.size, index);
  if (!safety.legal) {
    return {
      kind: 'danger',
      title: '这里不能下',
      text: `${lib} 是禁入点或者已经有棋子了。`,
      points: [index],
      facts: { legal: false },
      severity: 'warn',
    };
  }

  // The most important thing to say: does this move leave your own stone in atari?
  if (safety.selfAtari.length) {
    const group = safety.selfAtari[0];
    const sizes = safety.selfAtari.map((g) => g.length);
    const worst = Math.max(...sizes);
    return {
      kind: 'danger',
      title: '这一步会让自己被打吃',
      text: `下在 ${lib} 之后，${name(color)}有 ${worst} 颗棋只剩 1 口气。对手下一步就能提掉它，所以这一手很危险。`,
      points: [index, ...group],
      facts: { selfAtariGroups: safety.selfAtari.length, worstSize: worst },
      severity: 'critical',
    };
  }

  if (safety.captures.length) {
    return {
      kind: 'capture',
      title: '这一手能提子',
      text: `下在 ${lib} 提走了 ${safety.captures.length} 颗${name(opposite(color))}。提子之后这里会空出来，你自己的棋也有气了。`,
      points: [index, ...safety.captures],
      facts: { captured: safety.captures.length },
      severity: 'info',
    };
  }

  if (safety.threats.length) {
    const atariSize = Math.max(...safety.threats.map((g) => g.length));
    return {
      kind: 'capture',
      title: '这一手是打吃',
      text: `下在 ${lib} 之后，${name(opposite(color))}有一块棋（${atariSize} 颗）只剩 1 口气了。对方必须回应，否则就会被提走。`,
      points: [index],
      facts: { threats: safety.threats.length, atariSize },
      severity: 'info',
    };
  }

  if (connectsTwoBlocks(board, index, color)) {
    const joined = board.neighbours(index).filter((n) => board.cells[n] === color).reduce((a, n) => a + board.group(n).stones.length, 0);
    const contact = contactCount(board, index, color);
    return {
      kind: 'connect',
      title: contact > 0 ? '这一手边连接边接触对方' : '这一手是连接',
      text: `下在 ${lib} 把 ${joined} 颗棋连成一块，它们的气会合在一起。${contact > 0 ? '同时贴住了对方的棋，可以顺手施加压力。' : ''}`,
      points: [index],
      facts: { joined, contact },
      severity: 'info',
    };
  }

  const value = openingValue(board, index);
  if (value >= 3) {
    return {
      kind: 'opening',
      title: '这是角上的好点',
      text: `${lib} 在第三条线上。角上围空只要看两个方向，所以开局时角上效率最高。`,
      points: [index],
      facts: { openingValue: value },
      severity: 'info',
    };
  }

  // Fall back to a genuinely computed statement: how many liberties the new
  // stone/block has, and whether it is edge or centre.
  const after = board.clone();
  after.play(index, color);
  const liberties = after.group(index).liberties.length;
  return {
    kind: 'neutral',
    title: '这一手可以下',
    text: `下在 ${lib} 之后，这块棋有 ${liberties} 口气，不会马上被吃。` +
      (value >= 1 ? '它靠近边上，比中腹更容易围空。' : '它在中腹，中腹围空比较难，开局时价值偏低。'),
    points: [index, ...after.group(index).liberties],
    facts: { openingValue: value, liberties },
    severity: 'info',
  };
}

/**
 * The "should I attack or defend?" answer.
 *
 * It is decided by counting concrete threats on both sides, so the advice can
 * be checked against the position.
 */
export function attackOrDefend(board: GoBoard, color: Color): Advice {
  const enemy = opposite(color);
  const ownThreats = atariThreats(board, color).filter((t) => t.color === color);
  const enemyThreats = atariThreats(board, color).filter((t) => t.color === enemy);

  // Your own blocks with a single liberty are the most urgent thing.
  const mustDefend = ownThreats.length > 0;
  const canAttack = enemyThreats.length > 0;

  const captures = findCaptures(board, color);

  if (mustDefend && !canAttack) {
    const t = ownThreats[0];
    return {
      kind: 'rescue',
      title: '先防守',
      text: `你现在有 ${ownThreats.length} 块棋在被打吃，对手下一步就能提子。先把它跑出来，再考虑进攻。`,
      points: t.stones,
      suggestion: t.escapes[0],
      facts: { ownAtari: ownThreats.length, enemyAtari: 0 },
      severity: 'critical',
    };
  }
  if (canAttack && !mustDefend) {
    return {
      kind: 'capture',
      title: '可以进攻',
      text: `${name(enemy)}有 ${enemyThreats.length} 块棋只剩 1 口气，而你的棋都还安全。这时候进攻比防守更划算。`,
      points: enemyThreats.flatMap((t) => t.stones),
      suggestion: enemyThreats[0].killingMoves[0],
      facts: { ownAtari: 0, enemyAtari: enemyThreats.length },
      severity: 'info',
    };
  }
  if (mustDefend && canAttack) {
    return {
      kind: 'neutral',
      title: '要看谁的棋更大',
      text: `两边都有棋在被打吃（你 ${ownThreats.length} 块，对方 ${enemyThreats.length} 块）。先比较被吃掉的棋子数目：吃掉更大的那边更划算。`,
      points: [...ownThreats.flatMap((t) => t.stones), ...enemyThreats.flatMap((t) => t.stones)],
      facts: { ownAtari: ownThreats.length, enemyAtari: enemyThreats.length },
      severity: 'warn',
    };
  }
  if (captures) return captures;

  return {
    kind: 'neutral',
    title: '现在是布局阶段',
    text: '双方都没有棋在被打吃。这时候应该去占角、拆边，把地盘先围起来，而不是急着接触。',
    points: [],
    facts: { ownAtari: 0, enemyAtari: 0 },
    severity: 'info',
  };
}

/** All advice for a position, ordered by urgency. */
export function coach(board: GoBoard, color: Color): Advice[] {
  const out: Advice[] = [];
  const atari = warnAboutAtari(board, color);
  if (atari) out.push(atari);
  const captures = findCaptures(board, color);
  if (captures) out.push(captures);
  const connect = findUrgentConnection(board, color);
  if (connect) out.push(connect);
  if (!atari && !captures) {
    const cut = findCutOpportunity(board, color);
    if (cut) out.push(cut);
  }
  out.push(attackOrDefend(board, color));
  const order: Record<AdviceKind, number> = {
    danger: 0,
    rescue: 1,
    capture: 2,
    connect: 3,
    cut: 4,
    makeEye: 5,
    ladder: 6,
    opening: 7,
    endgame: 8,
    neutral: 9,
  };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** Explain why a ladder does or does not work, when the position has one. */
export function explainLadder(board: GoBoard, color: Color): Advice | null {
  for (const t of atariThreats(board, opposite(color))) {
    if (t.color === color) continue;
    if (!t.killingMoves.length) continue;
    const info = readLadder(board, color, t.liberty);
    if (!info) continue;
    const path = info.line.map((i) => labelOf(board.size, i)).join(' → ');
    if (info.works) {
      return {
        kind: 'ladder',
        title: '可以征子',
        text: `从这里打吃，对手只能一路逃：${path}。因为逃跑路线上没有接应子，最后会被吃到边上。`,
        points: info.line,
        suggestion: info.line[0],
        facts: { works: true, length: info.line.length },
        severity: 'info',
      };
    }
    return {
      kind: 'ladder',
      title: '征子不成立',
      text: `这条征子路线是 ${path}，但路线上对方的棋有接应，追下去反而自己会出问题。`,
      points: info.line,
      facts: { works: false, length: info.line.length },
      severity: 'warn',
    };
  }
  return null;
}

void WHITE;
