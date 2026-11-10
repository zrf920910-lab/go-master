import type { Lesson } from '../../app/types';
import { pos } from '../../learning/Exercises/pos';

/**
 * Lessons 6–24: the supporting curriculum.
 *
 * Order follows the beginner's real difficulties: after capture comes ko and
 * suicide, then connecting/cutting, then the shapes, then eyes and life & death,
 * and only then opening theory. Each lesson introduces exactly one idea.
 */

export const moreLessons: Lesson[] = [
  /* 6 ─ 打劫 ------------------------------------------------------------ */
  {
    id: 'l-ko',
    levelId: 'lv-06',
    order: 6,
    title: '打劫',
    subtitle: '不能马上提回来的特殊形状',
    minutes: 7,
    difficulty: 3,
    tags: ['打劫', '规则'],
    xp: 70,
    position: pos(9, [
      'O C7', 'O E7', 'O D6', 'O D8',
      'X B7', 'X C6', 'X C8',
    ], 1),
    intro: {
      paragraphs: [
        '有一种特殊的形状叫「劫」。黑棋提掉白棋一颗子之后，白棋如果马上提回来，棋局就会在同一个地方无限重复。',
        '所以围棋规定：刚被提掉的地方，不能立刻提回来。你得先在别的地方下一手，对方也应一手，之后才能回来提。',
        '这个「先在别处下一手」的做法，叫作「劫材」。打劫是围棋里最有趣的部分之一。',
      ],
      keyPoint: '打劫时不能立刻提回，必须先到别处下一手。',
    },
    demo: [
      {
        text: '看这个形状：黑棋和白棋互相包围，中间留下一个空点 D7。',
        actions: [
          { type: 'clearMarks' },
          { type: 'mark', at: 'D7', kind: 'target' },
        ],
        hold: 1600,
      },
      {
        text: '黑棋下在 D7，提掉白棋 C7 这颗子。',
        actions: [
          { type: 'stone', at: 'D7', color: 1 },
          { type: 'capture', at: 'C7' },
        ],
        hold: 1700,
      },
      {
        text: '现在轮到白棋。白棋很想马上下回 C7 把黑棋提回来，但规则不允许——这就叫「打劫」。',
        actions: [{ type: 'mark', at: 'C7', kind: 'wrong' }],
        hold: 2200,
      },
      {
        text: '白棋要先在别处下一手（劫材）。比如这里。',
        actions: [{ type: 'stone', at: 'G7', color: 2 }],
        hold: 1500,
      },
      {
        text: '黑棋如果应了这手，白棋就可以回来提劫了。',
        actions: [
          { type: 'stone', at: 'G3', color: 1 },
          { type: 'stone', at: 'C7', color: 2 },
          { type: 'capture', at: 'D7' },
        ],
        hold: 2000,
      },
      {
        text: '所以打劫不只是吃一颗子，还要比谁的劫材多、谁的劫材大。',
        actions: [{ type: 'mark', at: 'C7', kind: 'target' }],
        hold: 1800,
      },
    ],
    drills: [
      {
        id: 'ko1',
        prompt: '黑棋下在 D7 提劫，C7 现在受打劫规则保护。请为白棋下一手（不能马上提回）。',
        detail: '打劫时，刚刚被提掉的地方不能立刻提回来。',
        position: { ...pos(9, [
          'O C7', 'O E7', 'O D6', 'O D8',
          'X B7', 'X C6', 'X C8', 'X D7',
        ], 2), ko: 'C7' },
        check: { kind: 'legal' },
        success: '对，白棋不能马上提回 C7，必须先到别处找劫材。',
        gentle: 'C7 这个点现在是禁着的，换一个地方下。',
        hint: '先下在别的地方，等对方应一手。',
        answer: 'G7',
        tag: 'ko',
      },
      {
        id: 'ko2',
        prompt: '白棋已经在别处下了劫材，黑棋也应了一手。现在轮到白棋，请把劫提回来。',
        detail: '这一次 C7 可以下了——打劫的规则只是「不能马上回提」。',
        position: pos(9, [
          'O E7', 'O D6', 'O D8',
          'X B7', 'X C6', 'X C8', 'X D7',
          'O G7', 'X G3',
        ], 2),
        check: { kind: 'capture', min: 1 },
        success: '提劫成功！这就是打劫的完整过程：提劫 → 找劫材 → 再提回来。',
        gentle: '看看黑棋 D7 这颗子的气在哪里。',
        hint: '就在 C7 这个位置。',
        answer: 'C7',
        tag: 'ko',
      },
    ],
    practice: {
      prompt: '实战：黑棋先走，完成一次打劫（提掉白棋一颗子）。',
      position: pos(9, [
        'O C7', 'O E7', 'O D6', 'O D8',
        'X B7', 'X C6', 'X C8',
      ], 1),
      check: { kind: 'capture', min: 1 },
      answer: 'D7',
      success: '打劫成功！记住：接下来白棋不能马上提回来。',
      maxMoves: 1,
    },
    summary: {
      points: ['打劫时不能立即回提。', '需要先在别处下一手「劫材」。', '打劫考验全局眼光。'],
      mistakes: ['以为可以立刻提回。', '为了打劫而在别处损失太多。'],
    },
  },

  /* 7 ─ 连接与切断 ------------------------------------------------------ */
  {
    id: 'l-connect',
    levelId: 'lv-07',
    order: 7,
    title: '连接与切断',
    subtitle: '让棋子手拉手，或者分开对方',
    minutes: 8,
    difficulty: 3,
    tags: ['连接', '切断'],
    xp: 75,
    position: pos(9, ['X E5', 'X E6', 'O E4']),
    intro: {
      paragraphs: [
        '当两颗棋子紧挨着（上下左右相邻），它们就连成了一块棋，气也合在一起。',
        '一块棋比两颗分开的棋更难被吃：对手要一口气把整块棋的气都堵住，才能提子。',
        '「切断」正好相反：把对方的棋分开，让它们各自为战。连接和切断，是围棋攻防最基本的想法。',
      ],
      bullets: ['斜着相邻不算连接。', '连接之后气会变多。', '切断之后对方每块棋都要自己数气。'],
      keyPoint: '能连就尽量连，能断就尽量断。',
    },
    demo: [
      {
        text: '黑棋两颗子斜着放着。它们并没有连在一起，各自只有几口气。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'D5', color: 1 },
          { type: 'stone', at: 'F5', color: 1 },
          { type: 'liberties', at: 'D5', label: '各算各的气' },
        ],
        hold: 1800,
      },
      {
        text: '黑棋下在 E5，两颗子立刻连成了一块。',
        actions: [
          { type: 'libertiesOff', at: 'D5' },
          { type: 'stone', at: 'E5', color: 1 },
          { type: 'liberties', at: 'E5', label: '连成一块，气更多' },
        ],
        hold: 2000,
      },
      {
        text: '这就是「连接」。连在一起的棋子，同生共死。',
        actions: [{ type: 'mark', at: 'E4', kind: 'target' }],
        hold: 1600,
      },
      {
        text: '反过来，白棋下在 E5，就把黑棋切成了左右两块。',
        actions: [
          { type: 'clearMarks' },
          { type: 'remove', at: 'E5' },
          { type: 'stone', at: 'E5', color: 2 },
          { type: 'liberties', at: 'D5' },
          { type: 'liberties', at: 'F5' },
        ],
        hold: 2200,
      },
      {
        text: '被切断的棋要各自计算气，更容易被吃。所以下棋时，既要保护自己的连接，也要找对方的断点。',
        actions: [{ type: 'mark', at: 'E5', kind: 'label', text: '切断' }],
        hold: 2000,
      },
    ],
    drills: [
      {
        id: 'cn1',
        prompt: '黑棋两颗子还没有连起来。请下一手，把它们连成一块。',
        position: pos(9, ['X D5', 'X F5', 'O D6', 'O F6']),
        check: { kind: 'connect', group: 'D5' },
        success: '连接成功！现在它们共享气，变成一块更难被吃的棋。',
        gentle: '两颗棋子中间还空着一个点。',
        hint: '在 D5 和 F5 之间的那个位置。',
        answer: 'E5',
        tag: 'connect',
      },
      {
        id: 'cn2',
        prompt: '白棋两颗子还没有连起来。请下黑棋，切断它们之间的联系。',
        position: pos(9, ['O D5', 'O F5', 'X D6', 'X F6']),
        check: { kind: 'points', at: ['E5'] },
        success: '切断了！两块白棋被分开，各自只剩很少的气。',
        gentle: '两颗白棋中间的空点就是它们的连接点。',
        hint: '下在两颗白棋正中间。',
        answer: 'E5',
        tag: 'cut',
      },
      {
        id: 'cn3',
        prompt: '白棋下了一步，想切断黑棋。请下黑棋，把即将断开的两颗子连起来。',
        position: pos(9, ['X D5', 'X F5', 'O E6', 'O E4']),
        check: { kind: 'connect', group: 'D5' },
        success: '连接及时！黑棋没有被切断。',
        gentle: '白棋在上下夹着中间的点，黑棋要抢先一步连上。',
        hint: 'D5 和 F5 中间的那个点。',
        answer: 'E5',
        tag: 'connect',
      },
    ],
    practice: {
      prompt: '实战：黑棋被分成了两块。请下在正确的位置，把它们连接起来。',
      position: pos(9, ['X D5', 'X F5', 'O D4', 'O F4', 'O E3']),
      check: { kind: 'connect', group: 'D5' },
      answer: 'E5',
      success: '连上了！被切断的棋很危险，及时连接很重要。',
      maxMoves: 1,
    },
    summary: {
      points: ['上下左右相邻的棋子连成一块并共享气。', '连接让棋更安全。', '切断让对方两块棋各自为战。'],
      mistakes: ['以为斜着相邻也算连接。', '只顾自己连，忘了对方也要断你。'],
    },
  },

  /* 8 ─ 打吃与逃跑 ------------------------------------------------------ */
  {
    id: 'l-atari-escape',
    levelId: 'lv-08',
    order: 8,
    title: '逃跑与追击',
    subtitle: '被打吃了怎么办',
    minutes: 7,
    difficulty: 3,
    tags: ['打吃', '逃跑'],
    xp: 70,
    position: pos(9, ['O E5', 'X E6', 'X E4']),
    intro: {
      paragraphs: [
        '自己的棋被打吃（只剩一口气）时，第一件事是看看能不能逃跑。',
        '逃跑的方法很简单：下在最后一口气上，让棋子多出气。',
        '但是逃不逃得掉，要看对方有没有继续追。有时候逃不掉，不如放弃这几颗子，去别的地方下更大的棋。',
      ],
      keyPoint: '被打吃先别慌：能逃就逃，逃不掉就弃。',
    },
    demo: [
      {
        text: '白棋在中间，黑棋堵住了上下两边，白棋只剩左右两口气。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'E5', color: 2 },
          { type: 'stone', at: 'E6', color: 1 },
          { type: 'stone', at: 'E4', color: 1 },
          { type: 'liberties', at: 'E5' },
        ],
        hold: 1600,
      },
      {
        text: '黑棋再堵住右边，白棋只剩 1 口气——被打吃了。',
        actions: [
          { type: 'libertiesOff', at: 'E5' },
          { type: 'stone', at: 'F5', color: 1 },
          { type: 'liberties', at: 'E5', label: '打吃' },
        ],
        hold: 1800,
      },
      {
        text: '白棋下在最后一口气 D5 上，多出了一口气。',
        actions: [
          { type: 'libertiesOff', at: 'E5' },
          { type: 'stone', at: 'D5', color: 2 },
          { type: 'liberties', at: 'D5', label: '逃出来了' },
        ],
        hold: 2000,
      },
      {
        text: '黑棋继续追，从上面堵住。',
        actions: [{ type: 'stone', at: 'D6', color: 1 }],
        hold: 1500,
      },
      {
        text: '白棋继续往左跑。这就是「逃跑与追击」。',
        actions: [{ type: 'stone', at: 'C5', color: 2 }],
        hold: 1600,
      },
      {
        text: '追的时候要算清楚：如果追不上，就别一直追。',
        actions: [{ type: 'mark', at: 'C5', kind: 'target' }],
        hold: 1600,
      },
    ],
    drills: [
      {
        id: 'ae1',
        prompt: '你的白棋被打吃了！请下在正确的位置，让白棋逃出来。',
        position: pos(9, ['O E5', 'X E6', 'X E4', 'X F5'], 2),
        check: { kind: 'escape', group: 'E5' },
        success: '逃跑成功！白棋多了一口气。',
        gentle: '被打吃的棋子只有一口气，下在那里就能增加气。',
        hint: '看白棋唯一的空点在哪个方向。',
        answer: 'D5',
        tag: 'escape',
      },
      {
        id: 'ae2',
        prompt: '白棋刚刚逃了一步。请继续用黑棋追击它。',
        position: pos(9, ['O E5', 'X E4', 'X D5'], 1),
        check: { kind: 'atari' },
        success: '追得漂亮！白棋又被逼到只剩一口气。',
        gentle: '让对方只剩一口气，就是打吃。',
        hint: '白棋现在有两口气，堵住其中一个。',
        answer: 'E6',
        tag: 'atari',
      },
      {
        id: 'ae3',
        prompt: '现在换你执白。白棋被打吃了，请救出它。',
        position: pos(9, ['O E5', 'X E6', 'X E4', 'X D5', 'X F6'], 2),
        check: { kind: 'escape', group: 'E5' },
        success: '很好，白棋逃出来了。',
        gentle: '先数一数白棋还有几口气。',
        hint: '白棋唯一的方向在右边。',
        answer: 'F5',
        tag: 'escape',
      },
    ],
    practice: {
      prompt: '实战：白棋被打吃了。请救出它，或者判断它已经逃不掉了。',
      position: pos(9, ['O E5', 'X E6', 'X E4', 'X F6'], 2),
      check: { kind: 'escape', group: 'E5' },
      answer: 'D5',
      success: '你救出了白棋！记住逃跑的第一原则：往气多的地方跑。',
      maxMoves: 1,
    },
    summary: {
      points: ['被打吃时，下在最后一口气上就能逃跑。', '逃跑要往气多、空旷的方向跑。', '逃不掉时，放弃也是好棋。'],
      mistakes: ['被打吃了却下在别处，棋子被提走。', '一路追着对方的棋，自己反而亏了。'],
    },
  },

  /* 9 ─ 双打吃 ---------------------------------------------------------- */
  {
    id: 'l-double-atari',
    levelId: 'lv-09',
    order: 9,
    title: '双打吃',
    subtitle: '一手棋，同时打吃两块棋',
    minutes: 7,
    difficulty: 3,
    tags: ['双打吃', '吃子技巧'],
    xp: 80,
    position: pos(9, ['O D5', 'O F5', 'X E4', 'X E6']),
    intro: {
      paragraphs: [
        '如果一块棋被打吃，它可以在最后一口气上逃跑。但如果两块棋同时被打吃呢？',
        '对方一次只能救一块，另一块就保不住了。这种一手棋同时打吃两边的下法，叫「双打吃」。',
        '双打吃是最划算的吃子方法之一：即使对方逃掉一块，你也吃到了另一块。',
      ],
      keyPoint: '双打吃：对方只能救一头。',
    },
    demo: [
      {
        text: '白棋两颗子分在左右两边，黑棋在上下已经堵住了部分气。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'D5', color: 2 },
          { type: 'stone', at: 'F5', color: 2 },
          { type: 'stone', at: 'E4', color: 1 },
          { type: 'stone', at: 'E6', color: 1 },
        ],
        hold: 1800,
      },
      {
        text: '黑棋下在 E5 ——两颗白棋同时只剩一口气！',
        actions: [
          { type: 'stone', at: 'E5', color: 1 },
          { type: 'liberties', at: 'D5' },
          { type: 'liberties', at: 'F5' },
        ],
        hold: 2200,
      },
      {
        text: '这就是双打吃。白棋无论救哪一边，黑棋都能吃掉另一边。',
        actions: [{ type: 'mark', at: 'E5', kind: 'target' }],
        hold: 2000,
      },
      {
        text: '白棋要是去救右边，黑棋就吃掉左边。',
        actions: [
          { type: 'stone', at: 'G5', color: 2 },
          { type: 'stone', at: 'C5', color: 1 },
          { type: 'capture', at: 'D5' },
        ],
        hold: 2000,
      },
    ],
    drills: [
      {
        id: 'da1',
        prompt: '白棋两块都还没有安全。请下一手「双打吃」。',
        position: pos(9, ['O D5', 'O F5', 'X D4', 'X D6', 'X F4', 'X F6']),
        check: { kind: 'atari' },
        success: '双打吃！两颗白棋同时只剩一口气，对方只能救一边。',
        gentle: '找一个点，让两边白棋都只剩一口气。',
        hint: '就下在两颗白棋中间，那个点同时贴着两颗白棋。',
        answer: 'E5',
        tag: 'double',
      },
      {
        id: 'da2',
        prompt: '白棋没有救左边。请用黑棋把左边的白棋提掉。',
        position: pos(9, ['O D5', 'O F5', 'X D4', 'X D6', 'X F4', 'X F6', 'X E5', 'O G5']),
        check: { kind: 'capture', min: 1 },
        success: '吃到了！这就是双打吃的价值：总有一边跑不掉。',
        gentle: '左边白棋只剩一个方向是空的。',
        hint: '看白棋左边的空点。',
        answer: 'C5',
        tag: 'capture',
      },
      {
        id: 'da3',
        prompt: '请找出这一手双打吃的落点。',
        position: pos(9, ['O C4', 'O E4', 'X B4', 'X F4', 'X C3', 'X E3']),
        check: { kind: 'atari' },
        success: '正确！一手同时打吃两块棋。',
        gentle: '找那个同时贴着两颗白棋的点。',
        hint: '两颗白棋中间的那个点。',
        answer: 'D4',
        tag: 'double',
      },
    ],
    practice: {
      prompt: '实战：请用一手棋同时打吃两块白棋。',
      position: pos(9, ['O D5', 'O F5', 'X D4', 'X D6', 'X F4', 'X F6']),
      check: { kind: 'atari' },
      answer: 'E5',
      success: '双打吃成功！接下来的目标就是提掉跑不掉的那一边。',
      maxMoves: 1,
    },
    summary: {
      points: ['双打吃能同时威胁两块棋。', '对方只能救一边。', '找双打吃时，要找到同时贴着两块棋的要点。'],
      mistakes: ['只打吃一边，让对方轻松逃跑。', '双打吃之后追错方向，白忙一场。'],
    },
  },

  /* 10 ─ 认识眼 --------------------------------------------------------- */
  {
    id: 'l-eye',
    levelId: 'lv-10',
    order: 10,
    title: '认识眼',
    subtitle: '棋子围出的「房间」',
    minutes: 7,
    difficulty: 4,
    tags: ['眼', '死活'],
    xp: 85,
    position: pos(9, [
      'X D4', 'X E4', 'X F4',
      'X D5', 'X F5',
      'X D6', 'X E6', 'X F6',
    ]),
    intro: {
      paragraphs: [
        '棋子围起来的一小块空地，叫作「眼」。眼是这块棋呼吸的地方。',
        '有眼的棋很难被吃：对手要走进眼里，就必须先填掉眼里的气，而填进去的子自己会很危险。',
        '但眼也分「真眼」和「假眼」。真的眼完全由自己一方的棋围成；假眼则被对方的棋子破坏了一部分。',
      ],
      keyPoint: '一只完整的、被自己棋围住的眼睛，是保命的关键。',
    },
    demo: [
      {
        text: '黑棋在中间围出一个空点 E5，这就是一只眼。',
        actions: [
          { type: 'clearMarks' },
          { type: 'mark', at: 'E5', kind: 'target' },
        ],
        hold: 1800,
      },
      {
        text: '白棋要是下进 E5，自己一口气都没有，是禁入点——所以白棋进不来。',
        actions: [{ type: 'mark', at: 'E5', kind: 'label', text: '白棋进不来' }],
        hold: 2000,
      },
      {
        text: '但一只眼还不够。黑棋如果把 E5 填上，就只剩外面的一圈气。',
        actions: [{ type: 'stone', at: 'E5', color: 1 }],
        hold: 1600,
      },
      {
        text: '真正安全的是「两只眼」：对手最多只能填一只眼，另一只永远填不完。',
        actions: [{ type: 'remove', at: 'E5' }],
        hold: 1600,
      },
    ],
    drills: [
      {
        id: 'e1',
        prompt: '黑棋围出了一个空点。请点出这只「眼」的位置。',
        position: pos(9, [
          'X D4', 'X E4', 'X F4',
          'X D5', 'X F5',
          'X D6', 'X E6', 'X F6',
        ]),
        check: { kind: 'points', at: ['E5'] },
        success: '对，这就是一只眼。',
        gentle: '眼就是被棋子围在中间的那个空点。',
        hint: '看看黑棋围成一圈的正中间。',
        answer: 'E5',
        tag: 'eye',
        interaction: 'tap',
      },
      {
        id: 'e2',
        prompt: '请数一数：这块黑棋围出了几只眼？',
        detail: '点一下你认为正确的位置即可，我们只考察眼的位置。',
        position: pos(9, [
          'X C4', 'X D4', 'X E4', 'X F4', 'X G4',
          'X C5', 'X E5', 'X G5',
          'X C6', 'X D6', 'X E6', 'X F6', 'X G6',
        ]),
        check: { kind: 'points', at: ['D5', 'F5'] },
        success: '这块棋有两只眼：D5 和 F5。',
        gentle: '找找看，黑棋围出了几块被完全包围的小空地？',
        hint: '左右各有一个被围住的空点。',
        answer: 'D5',
        tag: 'eye',
        interaction: 'tap',
      },
    ],
    practice: {
      prompt: '实战：请把白棋放进黑棋的眼位里，看看会发生什么。（提示：你会看到它是禁入点。）',
      position: pos(9, [
        'X D4', 'X E4', 'X F4',
        'X D5', 'X F5',
        'X D6', 'X E6', 'X F6',
      ], 2),
      check: { kind: 'legal' },
      answer: 'A1',
      success: '你选择了合法的落点，绕开了禁入点。',
      maxMoves: 1,
    },
    summary: {
      points: ['眼是棋子围出的空地。', '对手不能随便走进完整的眼里。', '一只眼还不保险，两只眼才活。'],
      mistakes: ['以为有眼就永远安全。', '把假眼当成真眼。'],
    },
  },

  /* 11 ─ 两眼活棋 ------------------------------------------------------- */
  {
    id: 'l-two-eyes',
    levelId: 'lv-11',
    order: 11,
    title: '两眼活棋',
    subtitle: '围棋最重要的保命法则',
    minutes: 8,
    difficulty: 4,
    tags: ['眼', '活棋'],
    xp: 95,
    position: pos(9, [
      'X B2', 'X C2', 'X D2', 'X E2', 'X F2',
      'X B3', 'X D3', 'X F3',
      'X B4', 'X C4', 'X D4', 'X E4', 'X F4',
    ]),
    intro: {
      paragraphs: [
        '一块棋如果有两只真眼，它就永远活着，不需要逃跑，也不会被吃。',
        '原因很简单：对手一次只能下一步。填掉一只眼，你还可以下另一只眼；但眼是禁入点，对手根本填不进去。',
        '所以「做活」的本质，就是想办法让自己的棋做出两只眼。',
      ],
      bullets: ['一只眼：还不安全。', '两只眼：活棋。', '假眼不算眼。'],
      keyPoint: '两只真眼 = 活棋。',
    },
    demo: [
      {
        text: '黑棋这块棋围出了两只眼：C3 和 E3。',
        actions: [
          { type: 'clearMarks' },
          { type: 'mark', at: 'C3', kind: 'target' },
          { type: 'mark', at: 'E3', kind: 'target' },
        ],
        hold: 2000,
      },
      {
        text: '白棋想杀这块黑棋，只能从眼里下手。',
        actions: [{ type: 'mark', at: 'C3', kind: 'label', text: '白棋下不进来' }],
        hold: 1800,
      },
      {
        text: '但 C3 是白棋的禁入点：白棋下进去会立刻被提走。E3 也一样。',
        actions: [{ type: 'mark', at: 'E3', kind: 'label', text: '同样是禁入点' }],
        hold: 2000,
      },
      {
        text: '所以这块黑棋永远活着。这就是「两眼活棋」。',
        actions: [{ type: 'mark', at: 'D3', kind: 'right' }],
        hold: 1800,
      },
    ],
    drills: [
      {
        id: 'te1',
        prompt: '黑棋还缺一只眼。请下在正确的位置，做出两只眼。',
        position: pos(9, [
          'X B2', 'X C2', 'X D2', 'X E2', 'X F2',
          'X B3', 'X F3',
          'X B4', 'X C4', 'X D4', 'X E4', 'X F4',
        ]),
        check: { kind: 'twoEyes', group: 'B3' },
        success: '做活了！现在这块黑棋有两只眼，永远不会被吃。',
        gentle: '数一数现在有几只眼，还差一只。',
        hint: '在眼位中间补一手，把它分成两只眼。',
        answer: 'D3',
        tag: 'eye',
      },
      {
        id: 'te2',
        prompt: '白棋只有一只眼，还不算活。请下黑棋，破坏它的眼位。',
        detail: '点掉白棋做眼的要点，让它做不出两只眼。',
        position: pos(9, [
          'O B2', 'O C2', 'O D2', 'O E2', 'O F2',
          'O B3', 'O F3',
          'O B4', 'O C4', 'O D4', 'O E4', 'O F4',
        ]),
        check: { kind: 'kill', group: 'B3' },
        success: '点眼成功！白棋做不出两只眼了。',
        gentle: '白棋的空地排成一条直线，要点在正中间。',
        hint: '在白棋三个空点中间。',
        answer: 'D3',
        tag: 'eye',
      },
    ],
    practice: {
      prompt: '实战：请用黑棋做出两只眼，救活自己的棋。',
      position: pos(9, [
        'X B2', 'X C2', 'X D2', 'X E2', 'X F2',
        'X B3', 'X F3',
        'X B4', 'X C4', 'X D4', 'X E4', 'X F4',
      ]),
      check: { kind: 'twoEyes', group: 'B3' },
      answer: 'D3',
      success: '活棋了！你已经掌握了围棋最重要的保命技巧。',
      maxMoves: 1,
    },
    summary: {
      points: ['两只真眼就是活棋。', '活棋不需要逃跑，也不会被吃。', '做眼要从眼位下手。'],
      mistakes: ['只做出一只眼就以为安全了。', '把假眼当成真眼。'],
    },
  },

  /* 12 ─ 虎口与尖 ------------------------------------------------------- */
  {
    id: 'l-tiger',
    levelId: 'lv-12',
    order: 12,
    title: '虎口与尖',
    subtitle: '保护自己的两个基本形状',
    minutes: 6,
    difficulty: 3,
    tags: ['棋形', '虎口'],
    xp: 70,
    position: pos(9, ['X E5', 'X E6', 'X D5']),
    intro: {
      paragraphs: [
        '「虎口」是一种很结实的形状：三颗棋子围出一个口子，对方如果下进去，就会被立刻提走。',
        '「尖」是指斜着走一步的两颗棋子。尖看起来很松，但攻守兼备，是围棋里最常用的着法之一。',
        '这两个形状都不难，但下棋时经常用到。',
      ],
      keyPoint: '虎口让对方不敢进来；尖是稳健的一步。',
    },
    demo: [
      {
        text: '黑棋三颗子围出一个口子，这个形状就叫「虎口」。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'E5', color: 1 },
          { type: 'stone', at: 'E6', color: 1 },
          { type: 'stone', at: 'D5', color: 1 },
          { type: 'mark', at: 'E4', kind: 'target' },
        ],
        hold: 2000,
      },
      {
        text: '白棋要是走进 E4，它的气会被全部堵死，立刻被提走。',
        actions: [{ type: 'mark', at: 'E4', kind: 'wrong' }],
        hold: 1800,
      },
      {
        text: '「尖」是斜着走一步。黑棋从 E5 尖到 F4。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'E5', color: 1 },
          { type: 'stone', at: 'F4', color: 1 },
          { type: 'arrow', from: 'E5', to: 'F4' },
        ],
        hold: 2000,
      },
      {
        text: '尖的两颗棋子虽然没有直接相连，但它们互相照应，气很多。',
        actions: [{ type: 'liberties', at: 'E5' }],
        hold: 1800,
      },
    ],
    drills: [
      {
        id: 't1',
        prompt: '请为黑棋做出一个「虎口」：下在能让对方不敢进来的位置。',
        position: pos(9, ['X E5', 'X E6']),
        check: { kind: 'connect', group: 'E5' },
        success: '虎口完成！这个口子对方不敢随便进来。',
        gentle: '虎口要三颗子围出一个口子。',
        hint: '在这两颗棋子左边或右边的位置补一手。',
        answer: 'D5',
        tag: 'shape',
      },
      {
        id: 't2',
        prompt: '请下出一步「尖」：斜着走一步，和 E5 互相照应。',
        position: pos(9, ['X E5']),
        check: { kind: 'points', at: ['F4', 'D4', 'F6', 'D6'] },
        success: '这就是尖！斜着走一步，稳当又灵活。',
        gentle: '尖是斜着相邻的一步，不是直线。',
        hint: '在棋子的斜方向下一格。',
        answer: 'F4',
        tag: 'shape',
      },
    ],
    practice: {
      prompt: '实战：黑棋需要补一手做出虎口。请完成它。',
      position: pos(9, ['X E5', 'X E6', 'O F5']),
      check: { kind: 'connect', group: 'E5' },
      answer: 'D5',
      success: '补好了虎口，白棋不敢进来。',
      maxMoves: 1,
    },
    summary: {
      points: ['虎口是三颗子围出的、对方不敢进入的形状。', '尖是斜着走一步，稳健灵活。', '好的棋形让你下起来更轻松。'],
      mistakes: ['把虎口和斜着的断点混为一谈。', '只顾着做形状，忘了全局。'],
    },
  },

  /* 13 ─ 跳与飞 --------------------------------------------------------- */
  {
    id: 'l-jump',
    levelId: 'lv-13',
    order: 13,
    title: '跳与飞',
    subtitle: '轻快地走向中央',
    minutes: 6,
    difficulty: 3,
    tags: ['棋形', '跳', '飞'],
    xp: 70,
    position: pos(9, ['X C5']),
    intro: {
      paragraphs: [
        '「跳」是隔一格走。两颗棋子中间空一格，跳着向前。',
        '「飞」是隔两格走，像飞一样轻快。',
        '跳和飞都下得快，占地也大，但连接没有「长」（紧挨着走）那么结实。什么时候该快、什么时候该稳，是棋力的一部分。',
      ],
      keyPoint: '跳是一格，飞是两格；快慢之间的选择很重要。',
    },
    demo: [
      {
        text: '黑棋从 C5「长」到 D5，紧挨着走，最结实。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'C5', color: 1 },
          { type: 'stone', at: 'D5', color: 1 },
          { type: 'arrow', from: 'C5', to: 'D5' },
        ],
        hold: 1800,
      },
      {
        text: '「跳」是隔一格：黑棋从 C5 跳到 E5。',
        actions: [
          { type: 'remove', at: 'D5' },
          { type: 'stone', at: 'E5', color: 1 },
          { type: 'arrow', from: 'C5', to: 'E5' },
        ],
        hold: 1900,
      },
      {
        text: '「飞」是隔两格：从 C5 飞到 G5。',
        actions: [
          { type: 'stone', at: 'G5', color: 1 },
          { type: 'arrow', from: 'C5', to: 'G5' },
        ],
        hold: 1900,
      },
      {
        text: '跳和飞都下得快，但对方可能从中间切断。所以要看场合使用。',
        actions: [{ type: 'mark', at: 'E5', kind: 'target' }],
        hold: 1800,
      },
    ],
    drills: [
      {
        id: 'j1',
        prompt: '请为黑棋下出一步「跳」。',
        position: pos(9, ['X C5']),
        check: { kind: 'points', at: ['E5', 'A5'] },
        success: '这就是跳：隔一格，轻快又灵活。',
        gentle: '跳是隔一格，不是隔两格，也不是紧挨着。',
        hint: '往右边数一格，再下一手。',
        answer: 'E5',
        tag: 'shape',
      },
      {
        id: 'j2',
        prompt: '请为黑棋下出一步「飞」。',
        position: pos(9, ['X C5']),
        check: { kind: 'points', at: ['G5', 'A5'] },
        success: '飞得漂亮！隔两格，占地更大。',
        gentle: '飞比跳更远一格。',
        hint: '往右边数两格再落子。',
        answer: 'G5',
        tag: 'shape',
      },
    ],
    practice: {
      prompt: '实战：请用「跳」向中央发展。',
      position: pos(9, ['X C5', 'O C4']),
      check: { kind: 'points', at: ['E5'] },
      answer: 'E5',
      success: '跳向中央，棋形舒展。',
      maxMoves: 1,
    },
    summary: {
      points: ['长：紧挨着走一格。', '跳：隔一格走。', '飞：隔两格走。'],
      mistakes: ['跳和飞都用太多，被对方切断。', '跳和飞的差别记混。'],
    },
  },

  /* 14 ─ 双打吃之后：接不归 --------------------------------------------- */
  {
    id: 'l-crane',
    levelId: 'lv-14',
    order: 14,
    title: '接不归',
    subtitle: '逃不掉的那种连接',
    minutes: 7,
    difficulty: 4,
    tags: ['接不归', '吃子技巧'],
    xp: 85,
    position: pos(9, ['O E5', 'O D5', 'X E6', 'X E4', 'X F5', 'X C5']),
    intro: {
      paragraphs: [
        '「接不归」是一种很妙的吃子方法：对方的棋看起来可以连回去，但一连接，反而会一口气都没有。',
        '也就是说，连接反而让它死得更快——这就是「接不归」。',
        '遇到接不归，对方唯一的办法是逃跑或者弃子。',
      ],
      keyPoint: '连回去反而没气，就是接不归。',
    },
    demo: [
      {
        text: '白棋两颗子想连到外面，中间的 E5、D5 是连接点。',
        actions: [
          { type: 'clearMarks' },
          { type: 'mark', at: 'D5', kind: 'target' },
        ],
        hold: 1800,
      },
      {
        text: '黑棋打吃白棋。白棋如果连回去，两颗子就一口气都没有了。',
        actions: [
          { type: 'stone', at: 'C5', color: 1 },
          { type: 'liberties', at: 'D5' },
        ],
        hold: 2000,
      },
      {
        text: '所以白棋不能连——这就是接不归。',
        actions: [{ type: 'mark', at: 'D5', kind: 'wrong' }],
        hold: 2000,
      },
    ],
    drills: [
      {
        id: 'kn1',
        prompt: '白棋想连回外面。请下黑棋打吃它，让它连不回去。',
        position: pos(9, ['O D5', 'O E5', 'X D6', 'X E6', 'X E4', 'X F5']),
        check: { kind: 'atari' },
        success: '打吃成功！白棋如果硬连，只剩一口气，会被提掉。',
        gentle: '让对方只剩一口气，就是打吃。',
        hint: '白棋这块棋还有哪个方向是空的？',
        answer: 'C5',
        tag: 'crane',
      },
      {
        id: 'kn2',
        prompt: '白棋不敢连，只好逃跑。请用黑棋把它提掉。',
        position: pos(9, ['O D5', 'O E5', 'X D6', 'X E6', 'X E4', 'X F5', 'X C5', 'O C4']),
        check: { kind: 'capture', min: 1 },
        success: '提子成功，白棋跑不掉了。',
        gentle: '白棋只剩最后一口气，堵住它。',
        hint: '看白棋哪一边还空着。',
        answer: 'D4',
        tag: 'capture',
      },
    ],
    practice: {
      prompt: '实战：找出这个形状的要点，打吃白棋。',
      position: pos(9, ['O D5', 'O E5', 'X D6', 'X E6', 'X E4', 'X F5']),
      check: { kind: 'atari' },
      answer: 'C5',
      success: '这就是接不归的形状。你抓住了要点。',
      maxMoves: 1,
    },
    summary: {
      points: ['连回去反而没气，叫接不归。', '接不归的关键是让对方的两块棋不能安全相连。', '遇到接不归，弃子常常是唯一的选择。'],
      mistakes: ['硬要连接，结果整块被提。', '没看出接不归的形状，白白放走对方。'],
    },
  },

  /* 15 ─ 征子 ----------------------------------------------------------- */
  {
    id: 'l-ladder',
    levelId: 'lv-15',
    order: 15,
    title: '征子',
    subtitle: '一路追到天边',
    minutes: 8,
    difficulty: 5,
    tags: ['征子', '吃子技巧'],
    xp: 100,
    position: pos(9, ['O E5', 'X E6', 'X E4', 'X D5']),
    intro: {
      paragraphs: [
        '「征子」又叫「扭羊头」，是围棋里最著名的吃子方法：每次打吃，对方只能往一个方向跑，你一路追着打，最后把它逼到棋盘边上吃掉。',
        '征子能不能成功，取决于逃跑路线上的「接应子」。如果没有接应，就能征到底。',
        '征子要算很远，是很好的计算练习。',
      ],
      keyPoint: '征子 = 一路打吃，把对方逼到边上。',
    },
    demo: [
      {
        text: '白棋在中间，黑棋从左边打吃。',
        actions: [
          { type: 'clearMarks' },
          { type: 'stone', at: 'E5', color: 2 },
          { type: 'stone', at: 'D5', color: 1 },
          { type: 'liberties', at: 'E5' },
        ],
        hold: 1800,
      },
      {
        text: '白棋只能往右上跑：E6。',
        actions: [
          { type: 'remove', at: 'E6' },
          { type: 'stone', at: 'E6', color: 2 },
          { type: 'stone', at: 'F6', color: 1 },
        ],
        hold: 1700,
      },
      {
        text: '黑棋继续打吃。白棋又只能往一个方向跑。',
        actions: [
          { type: 'stone', at: 'F5', color: 2 },
          { type: 'stone', at: 'G5', color: 1 },
        ],
        hold: 1800,
      },
      {
        text: '就这样一路追，直到棋盘边——白棋再也没有地方可逃。',
        actions: [
          { type: 'stone', at: 'F4', color: 2 },
          { type: 'mark', at: 'G5', kind: 'target' },
        ],
        hold: 2000,
      },
    ],
    drills: [
      {
        id: 'ld1',
        prompt: '请下出「征子」的第一手：打吃白棋，逼它往一个方向跑。',
        position: pos(9, ['O E5', 'X D5', 'X E4']),
        check: { kind: 'atari' },
        success: '征子开始！白棋只能朝一个方向逃。',
        gentle: '打吃就是让对方只剩一口气。',
        hint: '白棋现在有两口气，堵住其中一个。',
        answer: 'E6',
        tag: 'ladder',
      },
      {
        id: 'ld2',
        prompt: '白棋继续逃。请接着征子，继续打吃。',
        position: pos(9, ['O E5', 'O F5', 'X D5', 'X E4', 'X E6', 'X F6']),
        check: { kind: 'atari' },
        success: '追得好！白棋仍在被一路赶着跑。',
        gentle: '找白棋现在的最后一口气。',
        hint: '白棋正朝右边的方向逃。',
        answer: 'G5',
        tag: 'ladder',
      },
    ],
    practice: {
      prompt: '实战：白棋想从这里逃出去。请用征子把它赶向棋盘边。',
      position: pos(9, ['O E5', 'X D5', 'X E4']),
      check: { kind: 'atari' },
      answer: 'E6',
      success: '征子开始！记住：征子要算清楚路上有没有对方的接应。',
      maxMoves: 1,
    },
    summary: {
      points: ['征子就是一路打吃。', '对方只能往一个方向跑。', '逃跑路线上的接应子决定征子成不成功。'],
      mistakes: ['征子算错方向，让白棋跑掉。', '没注意对方的接应子，白白送子。'],
    },
  },
];

void ({} as unknown as (l: Lesson) => void);
