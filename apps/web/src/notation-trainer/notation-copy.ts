// Coordinate + notation trainer -- copy table. Keys are shaped like i18n
// catalog entries ('notation.*') so folding this into
// apps/web/src/i18n/catalog.ts later is a mechanical move, which is the same
// bargain learn-copy.ts made and for the same reason: the zh catalogs are
// compile-enforced, so minting a domain here would mean shipping Chinese
// nobody on the project can check.
//
// House style: no em dashes in user-facing copy.

const COPY = {
  'notation.heading': 'Xiangqi coordinates',
  'notation.lede':
    'Knowing where a point is, and what the notation calls it, is the first thing a chess player needs on a xiangqi board.',
  'notation.why.analysis':
    'Our analysis board, engine lines and shared links all address points as a1 to i10.',
  'notation.why.talk':
    'It is how you discuss a position with another English speaker without pointing at a screen.',
  'notation.why.record':
    "File numbers are the other half. They are what a real game record uses, and each side counts them from its own right, so Red's file 3 is Black's file 7.",

  'notation.target': 'Drill',
  'notation.target.point': 'Points',
  'notation.target.file': 'File numbers',
  'notation.target.pointHint': 'Absolute squares, a1 to i10.',
  'notation.target.fileHint':
    'The numbers WXF and Chinese notation use. Red writes them in Chinese numerals, Black in Arabic.',

  'notation.direction': 'Direction',
  'notation.direction.find': 'Find it',
  'notation.direction.name': 'Name it',
  'notation.direction.pointFind':
    'A point appears on the board and you click the intersection it names.',
  'notation.direction.pointName': 'A point is marked on the board and you name it.',
  'notation.direction.fileFind': 'A file is named and you click anywhere along it.',
  'notation.direction.fileName': 'A file is marked and you say which number it is.',

  'notation.side': 'Counting from',
  'notation.side.red': 'Red',
  'notation.side.black': 'Black',
  'notation.side.both': 'Both',
  'notation.side.bothHint': 'Sides alternate, the way they do in a real game record.',

  'notation.time': 'Time',
  'notation.time.thirtySeconds': '0:30',
  'notation.time.untimed': '∞',
  'notation.timedNote': 'You have 30 seconds to get as many as you can.',
  'notation.untimedNote': 'Go as long as you like. Untimed runs are not scored.',

  'notation.perspective': 'Board',
  'notation.perspective.red': 'Red side',
  'notation.perspective.black': 'Black side',
  'notation.showCoordinates': 'Show the labels on the board',
  'notation.showPieces': 'Show the pieces',
  'notation.perspectiveHint':
    'Playing from the Black side is the harder drill: a1 moves from bottom left to top right.',
  'notation.displayHint':
    "Labels are the answer, so they start off. They follow the drill: a1 to i10 for points, each side's own numbering for files. Hiding the pieces takes away your landmarks.",

  'notation.start': 'Start training',
  'notation.stop': 'Stop',
  'notation.score': 'Score',
  'notation.best': 'Best',
  'notation.playingAs': 'Counting from {side}',
  'notation.playingBoard': 'Board from the {side} side',
  'notation.finalScore': 'You scored {score}.',

  'notation.namePointPrompt': 'Name the marked point.',
  'notation.nameFilePrompt': 'Which file is this, counting from {side}?',
  'notation.typeHint': 'Type it, or tap below.',
} as const;

export type NotationCopyKey = keyof typeof COPY;

export function notationCopy(
  key: NotationCopyKey,
  params?: Record<string, string | number>,
): string {
  const raw: string = COPY[key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
