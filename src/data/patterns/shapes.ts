
/**
 * Verified teaching shapes.
 *
 * Every shape in this file is checked by `tests/content.test.ts`: the intended
 * answer is played and the drill check must accept it. Keeping the shapes in
 * one place means a lesson cannot silently drift into an illegal position.
 *
 * Notation: strings are "X D4" (black) / "O D4" (white), exactly as the lesson
 * authoring helper expects.
 */
export type Shape = { stones: string[]; note?: string };

export const SHAPES = {
  /** Single white stone in the centre: 4 liberties. */
  single: ['O E5'],

  /** White E5 with exactly one liberty (F5) — perfect for "which is the last liberty". */
  whiteOneLiberty: ['O E5', 'X D5', 'X E4', 'X E6'],

  /** White E5/E6 pair captured by E5? — pair with one shared liberty at F5. */
  whitePairOneLiberty: ['O E5', 'O F5', 'X D5', 'X E4', 'X E6', 'X F4', 'X F6'],

  /** White corner stone A1 with one liberty (B1). */
  cornerOneLiberty: ['O A1', 'X A2', 'X B2'],

  /** White straight-three with one eye region of 3 points (C3,D3,E3). */
  straightThree: [
    'O B2', 'O C2', 'O D2', 'O E2', 'O F2',
    'O B3', 'O F3',
    'O B4', 'O C4', 'O D4', 'O E4', 'O F4',
  ],

  /** White ring split into two one-point eyes (C3 and E3). */
  twoEyes: [
    'O B2', 'O C2', 'O D2', 'O E2', 'O F2',
    'O B3', 'O F3',
    'O B4', 'O C4', 'O D4', 'O E4', 'O F4',
    'O D3',
  ],

  /** Ko shape: black to play D7 captures C7, forming a ko. */
  ko: ['O C7', 'O E7', 'O D6', 'O D8', 'X B7', 'X C6', 'X C8'],

  /** Ko after black D7: white may not recapture at C7 immediately. */
  koAfter: ['O C7', 'O E7', 'O D6', 'O D8', 'X B7', 'X C6', 'X C8', 'X D7'],

  /** White single stone with two liberties (E6, F5): black can play atari. */
  atariReady: ['O E5', 'X D5', 'X E4'],

  /** White in atari, black to capture (one liberty D5). */
  atariOne: ['O E5', 'X E6', 'X E4', 'X F5'],

  /** White in atari at D5, it is white's turn: the escape drill. */
  escapeWhite: ['O E5', 'X E6', 'X E4', 'X F5'],

  /** Two white stones that can be connected by black at E5. */
  connectBlack: ['X D5', 'X F5'],

  /** Two white stones separated by the cutting point E5. */
  cutWhite: ['O D5', 'O F5', 'X D6', 'X F6'],

  /** Double atari: black E5 puts both white stones in atari. */
  doubleAtari: ['O D5', 'O F5', 'X D4', 'X D6', 'X F4', 'X F6'],

  /** Ladder start: white has two liberties (E6,F5) and only one escape route. */
  ladderStart: ['O E5', 'X D5', 'X E4'],

  /** White straight-four: four points in a row — already alive. */
  straightFour: [
    'O B2', 'O C2', 'O D2', 'O E2', 'O F2', 'O G2',
    'O B3', 'O G3',
    'O B4', 'O C4', 'O D4', 'O E4', 'O F4', 'O G4',
  ],

  /** White ring with a single eye region of three points (C3,D3,E3). */
  ringThree: [
    'O B2', 'O C2', 'O D2', 'O E2', 'O F2',
    'O B3', 'O F3',
    'O B4', 'O C4', 'O D4', 'O E4', 'O F4',
  ],
} as const satisfies Record<string, readonly string[]>;
