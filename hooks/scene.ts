import type { BoardStatus } from '../types'

/** One agent as the scene draws it. The scene reads nothing else, so its source only changes when one of these does. */
export type Actor = {
  id: string
  kind: string
  seat: number
  status: BoardStatus
  isFresh: boolean
  percent: number | null
  /** Where it stood before this drawing, so it walks over rather than jumps. */
  from: number | null
  /** Who it is, in the words of its task. */
  label: string
  /** What goes in its bubble: what it says it is doing, else the task. */
  thought: string
  /** The bubble's second line: how far along, and how long is left as of its last report. */
  words: string
}

export type Stage = {
  /** Cells across the slot the scene is fitted to. */
  columns: number
  /** Cells down, to fill that height; left out, the scene is as tall as its bubbles need. */
  rows?: number
  /** Seconds to start the drifting clouds at, so a redrawn scene does not send them back to the start. */
  clock: number
}

const BASE_SCALE = 4
const WIDEST_SCALE = 8
const ART_WIDTH = 170
const SPRITE_WIDTH = 12
const SPRITE_HEIGHT = 16
const SHORTEST = 43
const BAND_ROWS = 3
const ROW_HEIGHT = 17
const BUBBLE_GAP = 2
const LINE_CHARS = 16
const WORDS_CHARS = 18
const MOST_ACTORS = 12

const INK = '#222034'

const TUNICS = ['#5B6EE1', '#DF7126', '#D77BBA', '#37946E', '#FBF236', '#639BFF', '#76428A', '#8F563B'] as const

const tunicOf = (actor: Pick<Actor, 'kind' | 'seat'>): string =>
  actor.kind === 'main' ? '#D95763' : (TUNICS[actor.seat % TUNICS.length] ?? TUNICS[0])

type Grid = readonly string[]

const COLORS: Readonly<Record<string, string>> = {
  k: INK,
  s: '#EEC39A',
  t: 'currentColor',
  m: '#CBDBFC',
  M: '#9BADB7',
  r: '#AC3232',
  f: '#4B692F',
  F: '#37946E',
  p: '#76428A',
  P: '#45283C',
  g: '#FBF236',
  w: '#FFFFFF',
  W: '#CBDBFC',
  b: '#663931',
  d: '#FFFFFF',
  x: '#AC3232',
  o: '#DF7126',
  O: '#AC3232',
  y: '#FBF236',
  n: '#847E87',
  N: '#595652',
}

/** The grid as one path per color: runs across each row, so the source stays small. */
const paint = (grid: Grid): string => {
  const runs = new Map<string, string>()

  grid.forEach((row, y) => {
    let x = 0

    while (x < row.length) {
      const color = row.charAt(x)
      let end = x + 1

      while (row.charAt(end) === color) {
        end += 1
      }

      if (color !== '.') {
        runs.set(color, `${runs.get(color) ?? ''}M${x} ${y}h${end - x}v1h-${end - x}z`)
      }

      x = end
    }
  })

  return [...runs]
    .map(([color, d]) =>
      // A tunic's shaded side is the tunic's own color with a shadow over it, whichever color that is.
      color === 'T'
        ? `<path fill="currentColor" d="${d}"/><path fill="#000" fill-opacity=".3" d="${d}"/>`
        : `<path fill="${COLORS[color] ?? INK}" d="${d}"/>`,
    )
    .join('')
}

// What an agent wears says what kind of agent it is. E and e are its eyes, which poses change.
type Costume = 'captain' | 'knight' | 'ranger' | 'wizard' | 'rogue'

const HEADS: Readonly<Record<Costume, Grid>> = {
  // The main agent, who sent the rest out.
  captain: [
    '............',
    '............',
    '...g..g..g..',
    '...ggggggg..',
    '...grgggrg..',
    '..kbbbbbbbk.',
    '..kbbbbbbbk.',
    '..ksssEsEsk.',
    '..ksssesesk.',
    '..ksssssssk.',
    '...kkkkkkk..',
  ],
  knight: [
    '......rr....',
    '.....rrr....',
    '....kkkkk...',
    '...kmmmmmk..',
    '..kmmmmmmMk.',
    '..kmmmmmmMk.',
    '..kMMMMMMMk.',
    '..ksssEsEsk.',
    '..ksssesesk.',
    '..ksssssssk.',
    '...kkkkkkk..',
  ],
  ranger: [
    '............',
    '....kkkkk...',
    '...kfffffk..',
    '..kffffffFk.',
    '..kffffffFk.',
    '..kfffffffk.',
    '..kffssssFk.',
    '..kffsEsEsk.',
    '..kffsesesk.',
    '...kfssssk..',
    '....kkkkk...',
  ],
  wizard: [
    '.......kk...',
    '......kppk..',
    '.....kpppk..',
    '....kppppk..',
    '...kppppPk..',
    '..kggggggggk',
    '..kPPPPPPPk.',
    '..ksssEsEsk.',
    '..ksssesesk.',
    '..kwwwwwwwk.',
    '...kwwwwwk..',
  ],
  rogue: [
    '............',
    '............',
    '...kkkkkkk..',
    '..kttttttTk.',
    '..kttttttTk.',
    'ktkTTTTTTTk.',
    '.k.ksssssskk',
    '..ksssEsEsk.',
    '..ksssesesk.',
    '..ksssssssk.',
    '...kkkkkkk..',
  ],
}

const costumeOf = (kind: string): Costume => {
  if (kind === 'main') {
    return 'captain'
  }

  if (kind === 'Explore' || kind === 'scout') {
    return 'ranger'
  }

  if (kind === 'Plan') {
    return 'wizard'
  }

  return kind === 'general-purpose' || kind === 'claude' ? 'knight' : 'rogue'
}

// The body under the head: five rows, or four where the pose sits lower.
const BODIES = {
  stand: ['...ktttttk..', '..kstttTtsk.', '...ktttTtk..', '...kbkkkbk..', '...kk...kk..'],
  run1: ['...ktttTtk..', '.kkstttTtsk.', '...ktttTtk..', '..kbbk.kbbk.', 'dd.kk...kk..'],
  run2: ['...ktttTtk..', '...kstTtsk..', '...ktttTtk..', '....kbbbk...', '....kk.kk...'],
  sit: ['...ktttTtk..', '..kstttTtsk.', '...ktttTtkbk', '...kkkkkkkkk'],
  cheer: ['..kstttTtsk.', '...ktttTtk..', '...ktttTtk..', '...kbkkkbk..', '...kk...kk..'],
} as const

type Eyes = 'open' | 'shut' | 'out'

const eyed = (row: string, eyes: Eyes): string => {
  if (eyes === 'open') {
    return row.replaceAll('E', 'k').replaceAll('e', 'k')
  }

  return eyes === 'out' ? row.replaceAll('E', 'x').replaceAll('e', 'x') : row.replaceAll('E', 's').replaceAll('e', 'k')
}

const person = (costume: Costume, body: keyof typeof BODIES, eyes: Eyes): string[] => {
  const head = HEADS[costume].map(row => eyed(row, eyes))
  const rows = [...head, ...BODIES[body]]

  // A body one row short sits lower: the head comes down with it.
  return [...Array.from({ length: SPRITE_HEIGHT - rows.length }, () => '.'.repeat(SPRITE_WIDTH)), ...rows]
}

const armsUp = (grid: readonly string[]): string[] =>
  grid.map((row, y) => (y >= 7 && y <= 10 ? `${row.slice(0, 1)}s${row.slice(2, 11)}s` : row))

/** On its back: a quarter turn, head toward the flag. */
const fallen = (grid: readonly string[]): string[] =>
  Array.from({ length: SPRITE_WIDTH }, (_, x) =>
    Array.from({ length: grid.length }, (_unused, y) => grid[grid.length - 1 - y]?.charAt(x) ?? '.').join(''),
  )

const CLOUD: Grid = ['....wwww.....', '..wwwwwwww...', '.wwwwwwwwwww.', 'wwwwwwwwwwwww', 'WWWWWWWWWWWWW']
const STORM: Grid = ['...NNNN....', '.NNNNNNNNN.', 'NNNNNNNNNNN', 'nnnnnnnnnnn']
const TENT: Grid = [
  '......k.......',
  '.....kok......',
  '....koook.....',
  '...kowooOk....',
  '..koowwooOk...',
  '.koowkkwooOk..',
  'koowkkkkwooOk.',
  'kkkkkkkkkkkkk.',
]
const FIRE: readonly Grid[] = [
  ['...y....', '...yo...', '..oyyo..', '.ooyyoo.', '.oyyyyo.', 'b.oyyo.b', '.bbbbbb.'],
  ['....y...', '...oy...', '..oyyo..', '.ooyyoo.', '.oyyyyo.', 'b.oyyo.b', '.bbbbbb.'],
  ['........', '...yo...', '..oyyo..', '.oyyyoo.', '.oyyyyo.', 'b.oyyo.b', '.bbbbbb.'],
]

// Three by five, all caps. Anything else the agents say reads as a space.
const GLYPHS: Readonly<Record<string, Grid>> = {
  A: ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'],
  B: ['kk.', 'k.k', 'kk.', 'k.k', 'kk.'],
  C: ['.kk', 'k..', 'k..', 'k..', '.kk'],
  D: ['kk.', 'k.k', 'k.k', 'k.k', 'kk.'],
  E: ['kkk', 'k..', 'kk.', 'k..', 'kkk'],
  F: ['kkk', 'k..', 'kk.', 'k..', 'k..'],
  G: ['.kk', 'k..', 'k.k', 'k.k', '.kk'],
  H: ['k.k', 'k.k', 'kkk', 'k.k', 'k.k'],
  I: ['kkk', '.k.', '.k.', '.k.', 'kkk'],
  J: ['..k', '..k', '..k', 'k.k', '.k.'],
  K: ['k.k', 'k.k', 'kk.', 'k.k', 'k.k'],
  L: ['k..', 'k..', 'k..', 'k..', 'kkk'],
  M: ['kkk', 'kkk', 'k.k', 'k.k', 'k.k'],
  N: ['kk.', 'k.k', 'k.k', 'k.k', 'k.k'],
  O: ['.k.', 'k.k', 'k.k', 'k.k', '.k.'],
  P: ['kk.', 'k.k', 'kk.', 'k..', 'k..'],
  Q: ['.k.', 'k.k', 'k.k', 'kk.', '.kk'],
  R: ['kk.', 'k.k', 'kk.', 'k.k', 'k.k'],
  S: ['.kk', 'k..', '.k.', '..k', 'kk.'],
  T: ['kkk', '.k.', '.k.', '.k.', '.k.'],
  U: ['k.k', 'k.k', 'k.k', 'k.k', '.kk'],
  V: ['k.k', 'k.k', 'k.k', 'k.k', '.k.'],
  W: ['k.k', 'k.k', 'k.k', 'kkk', 'kkk'],
  X: ['k.k', 'k.k', '.k.', 'k.k', 'k.k'],
  Y: ['k.k', 'k.k', '.k.', '.k.', '.k.'],
  Z: ['kkk', '..k', '.k.', 'k..', 'kkk'],
  '0': ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'],
  '1': ['.k.', 'kk.', '.k.', '.k.', 'kkk'],
  '2': ['kkk', '..k', 'kkk', 'k..', 'kkk'],
  '3': ['kkk', '..k', '.kk', '..k', 'kkk'],
  '4': ['k.k', 'k.k', 'kkk', '..k', '..k'],
  '5': ['kkk', 'k..', 'kkk', '..k', 'kkk'],
  '6': ['kkk', 'k..', 'kkk', 'k.k', 'kkk'],
  '7': ['kkk', '..k', '.k.', '.k.', '.k.'],
  '8': ['kkk', 'k.k', 'kkk', 'k.k', 'kkk'],
  '9': ['kkk', 'k.k', 'kkk', '..k', 'kkk'],
  '%': ['k.k', '..k', '.k.', 'k..', 'k.k'],
  '.': ['...', '...', '...', '...', '.k.'],
  ',': ['...', '...', '...', '.k.', 'k..'],
  '!': ['.k.', '.k.', '.k.', '...', '.k.'],
  '?': ['kk.', '..k', '.k.', '...', '.k.'],
  '-': ['...', '...', 'kkk', '...', '...'],
  ':': ['...', '.k.', '...', '.k.', '...'],
  "'": ['.k.', '.k.', '...', '...', '...'],
  '/': ['..k', '..k', '.k.', 'k..', 'k..'],
  '<': ['..k', '.k.', 'k..', '.k.', '..k'],
  '+': ['...', '.k.', 'kkk', '.k.', '...'],
  '·': ['...', '...', '.k.', '...', '...'],
  '(': ['.k.', 'k..', 'k..', 'k..', '.k.'],
  ')': ['.k.', '..k', '..k', '..k', '.k.'],
  '&': ['.k.', 'k.k', '.k.', 'k.k', '.kk'],
  '_': ['...', '...', '...', '...', 'kkk'],
  '#': ['k.k', 'kkk', 'k.k', 'kkk', 'k.k'],
  '=': ['...', 'kkk', '...', 'kkk', '...'],
}

const rect = (x: number, y: number, width: number, height: number): string => `M${x} ${y}h${width}v${height}h-${width}z`

const fill = (color: string, d: string): string => `<path fill="${color}" d="${d}"/>`

const at = (x: number, y: number, body: string): string => `<g transform="translate(${x} ${y})">${body}</g>`

/** Frames shown in turn, each held the same time and switched outright: no tweening, as a sprite sheet would. */
const flipbook = (frames: readonly string[], seconds: number): string =>
  frames
    .map((frame, shown) => {
      const values = frames.map((_, i) => (i === shown ? 'visible' : 'hidden')).join(';')

      return `<g visibility="${shown === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" dur="${seconds}s" calcMode="discrete" repeatCount="indefinite"/>${frame}</g>`
    })
    .join('')

/** A walk over whole pixels, once. */
const stepsTo = (fromX: number, toX: number, y: number, secondsPerPixel: number): string => {
  const count = Math.abs(toX - fromX)
  const direction = Math.sign(toX - fromX)
  const values = Array.from({ length: count + 1 }, (_, i) => `${fromX + i * direction} ${y}`).join(';')

  return `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${count * secondsPerPixel}s" calcMode="discrete" fill="freeze"/>`
}

const drifting = (fromX: number, toX: number, y: number, seconds: number, clock: number, body: string): string => {
  const values = Array.from({ length: toX - fromX + 1 }, (_, i) => `${fromX + i} ${y}`).join(';')

  return `<g transform="translate(${fromX} ${y})"><animateTransform attributeName="transform" type="translate" values="${values}" dur="${seconds}s" begin="-${clock % seconds}s" calcMode="discrete" repeatCount="indefinite"/>${body}</g>`
}

const hills = (width: number, base: number, swell: number, bump: number, phase: number, bottom: number, color: string): string => {
  let d = ''
  let x = 0

  const topAt = (column: number): number =>
    Math.round(base + swell * Math.sin(column / 11 + phase) + bump * Math.sin(column / 4.3 + phase * 2))

  while (x < width) {
    const top = topAt(x)
    let end = x + 1

    while (end < width && topAt(end) === top) {
      end += 1
    }

    d += rect(x, top, end - x, bottom - top)
    x = end
  }

  return fill(color, d)
}

const dithered = (width: number, y: number, color: string): string => {
  let d = ''

  for (let x = y % 2; x < width; x += 2) {
    d += rect(x, y, 1, 1)
  }

  return fill(color, d)
}

const speckled = (width: number, top: number, rows: number, color: string): string => {
  let d = ''

  for (let x = 0; x < width; x += 1) {
    // A fixed scatter: the ground must not change between drawings.
    if ((x * 7 + (x % 5) * 3) % 11 === 0) {
      d += rect(x, top + ((x * 3) % rows), 1, 1)
    }
  }

  return fill(color, d)
}

const FIRST_STEP = 16

const xOf = (percent: number, width: number): number =>
  Math.round(FIRST_STEP + (Math.min(100, Math.max(0, percent)) / 100) * (width - FIRST_STEP - 28))

const groundOf = (height: number): number => height - 9

const world = (width: number, height: number, clock: number): string => {
  const ground = groundOf(height)
  const shade = Math.floor(ground * 0.55)
  const posts = [25, 50, 75]
    .map(percent => xOf(percent, width) + 5)
    .map(x => fill('#663931', rect(x, ground - 3, 2, 4)) + fill('#8F563B', rect(x, ground - 3, 1, 4)))
    .join('')
  const flagFrames = [
    ['kwkwkwkw', 'wkwkwkwk', 'kwkwkwkw', 'wkwkwkwk', 'kwkwkwkw'],
    ['.kwkwkwk', '.wkwkwkw', 'kwkwkwk.', 'wkwkwkw.', '.kwkwkwk'],
  ]
  const flagX = width - 13
  const flagY = ground - 17

  return [
    fill('#5FCDE4', rect(0, 0, width, shade + 1)),
    fill('#BDEBF2', rect(0, shade + 1, width, ground - shade - 1)),
    dithered(width, shade, '#BDEBF2'),
    dithered(width, shade + 1, '#5FCDE4'),
    // Over the camp, where the bubbles above the walkers seldom reach.
    fill('#FBF236', rect(7, 3, 6, 6) + rect(6, 4, 8, 4) + rect(8, 2, 4, 8)),
    drifting(-14, width, 5, 150, clock, paint(CLOUD)),
    drifting(Math.round(width * 0.4) - width, Math.round(width * 0.4), 2, 220, clock, paint(CLOUD)),
    // A taller sky has room for more weather, and mountains behind the hills.
    height >= 80 ? drifting(-14, width, Math.round(height * 0.25), 190, clock + 60, paint(CLOUD)) : '',
    height >= 80 ? drifting(-14, width, Math.round(height * 0.42), 130, clock + 40, paint(CLOUD)) : '',
    height >= 80 ? hills(width, ground - 18, 7, 2, 1.7, ground, '#A9D8E8') : '',
    hills(width, ground - 5, 2.5, 1, 0.6, ground, '#7FCDA0'),
    hills(width, ground - 3, 1.6, 0.8, 2.4, ground, '#37946E'),
    posts,
    fill('#99E550', rect(0, ground, width, 1)),
    fill('#6ABE30', rect(0, ground + 1, width, 2) + rect(0, ground + 7, width, 1)),
    fill('#D9A066', rect(0, ground + 3, width, 4)),
    speckled(width, ground + 3, 4, '#8A6F30'),
    fill('#4B692F', rect(0, ground + 8, width, 1)),
    at(2, ground - 7, paint(TENT)),
    fill('#847E87', rect(flagX, flagY, 1, 20)),
    fill(INK, rect(flagX + 1, flagY, 1, 20)),
    at(flagX + 2, flagY, flipbook(flagFrames.map(paint), 0.8)),
  ].join('')
}

const snoring = (): string =>
  flipbook(
    [
      fill(INK, rect(0, 2, 3, 1) + rect(1, 3, 1, 1) + rect(0, 4, 3, 1)),
      fill(INK, rect(2, 0, 3, 1) + rect(3, 1, 1, 1) + rect(2, 2, 3, 1)),
    ],
    1.4,
  )

const raining = (): string =>
  paint(STORM) +
  flipbook(
    [
      fill('#5B6EE1', rect(1, 5, 1, 2) + rect(5, 6, 1, 2) + rect(9, 5, 1, 2)),
      fill('#5B6EE1', rect(3, 6, 1, 2) + rect(7, 5, 1, 2)),
    ],
    0.5,
  )

/** The one burst it gets, on the drawing that sees it arrive. */
const confetti = (): string => {
  const colors = ['#FBF236', '#D95763', '#5B6EE1', '#99E550', '#FFFFFF', '#DF7126']

  return Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2
    const reach = 8 + (i % 3) * 3
    const flight = [0, 0.35, 0.6, 0.8, 1, 1.15]
      .map(t => {
        const px = Math.round(Math.cos(angle) * reach * t)
        const py = Math.round(Math.sin(angle) * reach * t - 8 * t + 7 * t * t)

        return `${px} ${py}`
      })
      .join(';')

    return `<path fill="${colors[i % colors.length]}" d="M0 0h1v1h-1z" visibility="hidden"><animateTransform attributeName="transform" type="translate" values="${flight}" dur="1.2s" calcMode="discrete" fill="freeze"/><animate attributeName="visibility" values="visible;hidden" keyTimes="0;1" dur="1.2s" calcMode="discrete"/></path>`
  }).join('')
}

const footing = (height: number, seat: number): number => height - 5 + (seat % 3)

type Cast = {
  sprite: (id: string, grid: readonly string[]) => string
  glyph: (char: string) => string
}

type Spot = { center: number; head: number }

/** Where an agent stands, which is what its bubble has to reach for. */
const spotOf = (actor: Actor, width: number, height: number, homeRank: number): Spot => {
  const feet = footing(height, actor.seat)

  if (actor.status === 'completed') {
    return { center: xOf(100, width) - homeRank * 9 + SPRITE_WIDTH / 2, head: feet - SPRITE_HEIGHT - 2 }
  }

  if (actor.status === 'failed') {
    return { center: xOf(actor.percent ?? 0, width) + SPRITE_WIDTH / 2, head: feet - 21 }
  }

  if (actor.percent === null && actor.status === 'running') {
    return { center: FIRST_STEP + (actor.seat % 4) * 3 + 19, head: feet - SPRITE_HEIGHT - 1 }
  }

  return { center: xOf(actor.percent ?? 0, width) + SPRITE_WIDTH / 2, head: feet - SPRITE_HEIGHT - 1 }
}

const drawActor = (actor: Actor, width: number, height: number, cast: Cast, homeRank: number): string => {
  const costume = costumeOf(actor.kind)
  const color = actor.status === 'killed' || actor.status === 'gone' ? '#847E87' : tunicOf(actor)
  const feet = footing(height, actor.seat)
  const y = feet - SPRITE_HEIGHT
  const sprite = (pose: string, grid: readonly string[]): string =>
    `<g color="${color}">${cast.sprite(`${costume}-${pose}`, grid)}</g>`
  const percent = actor.percent
  const x = xOf(percent ?? 0, width)

  if (actor.status === 'completed') {
    const home = xOf(100, width) - homeRank * 9
    const hop = flipbook(
      [
        sprite('cheer-a', person(costume, 'stand', 'open')),
        at(0, -2, sprite('cheer-b', armsUp(person(costume, 'cheer', 'open')))),
      ],
      0.7,
    )

    return at(home, y, hop + (actor.isFresh ? at(6, 2, confetti()) : ''))
  }

  if (actor.status === 'failed') {
    return at(x - 2, feet - SPRITE_WIDTH, sprite('down', fallen(person(costume, 'stand', 'out')))) + at(x, feet - 20, raining())
  }

  if (actor.status === 'killed') {
    return at(x - 2, feet - SPRITE_WIDTH, sprite('rest', fallen(person(costume, 'stand', 'shut'))))
  }

  if (actor.status === 'gone' || actor.status === 'waiting') {
    return at(x, y, sprite('sit', person(costume, 'sit', 'open')))
  }

  if (actor.status === 'idle') {
    return at(x, y, sprite('sit-shut', person(costume, 'sit', 'shut')) + at(11, 1, snoring()))
  }

  if (actor.status === 'pending') {
    const stand = sprite('stand', person(costume, 'stand', 'open'))
    const blink = sprite('blink', person(costume, 'stand', 'shut'))

    return at(x, y, flipbook([stand, stand, stand, stand, stand, blink], 2.4))
  }

  const run = flipbook(
    [sprite('run1', person(costume, 'run1', 'open')), at(0, -1, sprite('run2', person(costume, 'run2', 'open')))],
    0.36,
  )

  // Running with no steps reported: it paces around camp, never toward the flag, since nobody knows how far along it is.
  if (percent === null) {
    const low = FIRST_STEP + (actor.seat % 4) * 3
    const high = low + 26
    const there = Array.from({ length: high - low + 1 }, (_, i) => `${low + i + 6} ${feet}`)
    const path = [...there, ...[...there].reverse()].join(';')
    const seconds = ((high - low) * 2 * 0.12).toFixed(1)

    return (
      `<g transform="translate(${low + 6} ${feet})">` +
      `<animateTransform attributeName="transform" type="translate" values="${path}" dur="${seconds}s" calcMode="discrete" repeatCount="indefinite"/>` +
      `<g><animateTransform attributeName="transform" type="scale" values="1 1;-1 1" dur="${seconds}s" calcMode="discrete" repeatCount="indefinite"/>` +
      at(-6, -SPRITE_HEIGHT, run) +
      '</g></g>'
    )
  }

  const walk = actor.from !== null && actor.from !== percent ? stepsTo(xOf(actor.from, width), x, y, 0.08) : ''

  return `<g transform="translate(${x} ${y})">${walk}${run}</g>`
}

/** Words cut to whole lines of a width, the last one ending in dots if there was more. */
const wrapped = (text: string, chars: number, lines: number): string[] => {
  const kept: string[] = []
  let line = ''

  for (const word of text.toUpperCase().trim().split(/\s+/)) {
    const piece = word.slice(0, chars)

    if (line !== '' && line.length + 1 + piece.length > chars) {
      kept.push(line)
      line = piece
    } else {
      line = line === '' ? piece : `${line} ${piece}`
    }
  }

  kept.push(line)

  if (kept.length <= lines) {
    return kept
  }

  const last = kept[lines - 1] ?? ''

  return [...kept.slice(0, lines - 1), `${last.slice(0, chars - 2).trimEnd()}..`]
}

const lettered = (text: string, cast: Cast): string =>
  [...text]
    .map((char, i) => {
      const id = GLYPHS[char] === undefined ? '' : cast.glyph(char)

      return id === '' ? '' : `<use href="#${id}" x="${i * 4}"/>`
    })
    .join('')

type Bubble = { actor: Actor; spot: Spot; lines: string[]; words: string; width: number; height: number; x: number; row: number }

const PADDING_X = 5
const LINE_HEIGHT = 6

/** Places each bubble over its agent, in the lowest row of sky where it touches none of the others. */
const placed = (actors: readonly Actor[], spots: readonly Spot[], width: number, mostRows: number): Bubble[] => {
  const taken: { from: number; to: number }[][] = []
  const bubbles: Bubble[] = []
  // A failure gets its place first. The rest go left to right, which packs the most into a row.
  const queue = actors
    .map((actor, i) => ({ actor, spot: spots[i] }))
    .sort((a, b) => Number(b.actor.status === 'failed') - Number(a.actor.status === 'failed') || (a.spot?.center ?? 0) - (b.spot?.center ?? 0))

  queue.forEach(({ actor, spot }) => {
    if (spot === undefined) {
      return
    }

    const lines = wrapped(actor.thought, LINE_CHARS, 2)
    // No room in three pixels for a tilde: in the bubble an estimate reads as a time.
    const words = wrapped(actor.words.replaceAll('~', ''), WORDS_CHARS, 1)[0] ?? ''
    const inner = Math.max(words.length, ...lines.map(line => line.length)) * 4 - 1
    const bubbleWidth = inner + PADDING_X + 3
    const bubbleHeight = (lines.length + 1) * LINE_HEIGHT + 3
    const center = Math.round(spot.center)
    const lowest = Math.max(2, center - bubbleWidth + 3)
    const highest = Math.min(width - bubbleWidth - 2, center - 3)
    const wanted = Math.max(lowest, Math.min(highest, Math.round(spot.center - bubbleWidth / 2)))
    // Centered over its agent if it can be, else slid along the row as far as it can still reach down to it.
    const places = Array.from({ length: highest - lowest + 1 }, (_, i) => lowest + i).sort(
      (a, b) => Math.abs(a - wanted) - Math.abs(b - wanted),
    )

    for (let row = 0; row < mostRows; row += 1) {
      const x = places.find(place =>
        (taken[row] ?? []).every(span => place > span.to + BUBBLE_GAP || place + bubbleWidth < span.from - BUBBLE_GAP),
      )

      if (x !== undefined) {
        taken[row] = [...(taken[row] ?? []), { from: x, to: x + bubbleWidth }]
        bubbles.push({ actor, spot, lines, words, width: bubbleWidth, height: bubbleHeight, x, row })

        // No row with room: the agent walks on without a bubble, and the description still names it.
        return
      }
    }
  })

  return bubbles
}

const rowHeights = (bubbles: readonly Bubble[]): number[] => {
  const heights: number[] = []

  for (const bubble of bubbles) {
    heights[bubble.row] = Math.max(heights[bubble.row] ?? 0, bubble.height)
  }

  return heights
}

const drawBubbles = (bubbles: readonly Bubble[], height: number, cast: Cast): { tails: string; drawn: string } => {
  const heights = rowHeights(bubbles)
  const bottomOf = (row: number): number =>
    height - 25 - heights.slice(0, row).reduce((sum, rowHeight) => sum + rowHeight + BUBBLE_GAP, 0)
  let tails = ''
  let drawn = ''

  for (const bubble of bubbles) {
    const isBad = bubble.actor.status === 'failed'
    const edge = isBad ? '#AC3232' : INK
    const bottom = bottomOf(bubble.row)
    const top = bottom - bubble.height
    const column = Math.round(bubble.spot.center)

    // Puffs up from its head, as a thought rises: small near the head, larger toward the bubble.
    for (let y = bottom + 1, i = 0; y < bubble.spot.head; y += 4, i += 1) {
      tails += fill(edge, rect(column - 1, y, 3, 3)) + fill('#FFFFFF', rect(column, y + 1, 1, 1))
    }

    drawn += at(
      bubble.x,
      top,
      fill(edge, rect(1, 0, bubble.width - 2, bubble.height) + rect(0, 1, bubble.width, bubble.height - 2)) +
        fill('#FFFFFF', rect(1, 1, bubble.width - 2, bubble.height - 2)) +
        // Its tunic's color down the side, which says whose it is when bubbles stack.
        fill(tunicOf(bubble.actor), rect(1, 1, 2, bubble.height - 2)) +
        bubble.lines.map((line, i) => `<g color="${INK}" transform="translate(${PADDING_X} ${2 + i * LINE_HEIGHT})">${lettered(line, cast)}</g>`).join('') +
        `<g color="${isBad ? '#AC3232' : '#595652'}" transform="translate(${PADDING_X} ${2 + bubble.lines.length * LINE_HEIGHT})">${lettered(bubble.words, cast)}</g>`,
    )
  }

  return { tails, drawn }
}

/** The game screen, all of it: one SVG document, wider than most slots, which the surface fits to its own. */
export const sceneOf = (actors: readonly Actor[], stage: Stage): { source: string; height: number } => {
  const intrinsic = stage.columns * 8
  const scale = Math.max(BASE_SCALE, Math.min(WIDEST_SCALE, Math.round(intrinsic / ART_WIDTH)))
  const width = Math.max(110, Math.floor(intrinsic / scale))
  const fitted = stage.rows === undefined ? null : Math.max(SHORTEST, Math.round((width * stage.rows * 2) / stage.columns))
  const defs = new Map<string, string>()
  const cast: Cast = {
    sprite: (id, grid) => {
      defs.set(id, `<g id="${id}">${paint(grid)}</g>`)

      return `<use href="#${id}"/>`
    },
    glyph: char => {
      const id = `g${char.codePointAt(0)}`

      defs.set(id, `<path id="${id}" fill="currentColor" d="${[...(GLYPHS[char] ?? [])].map((row, y) => [...row].map((cell, x) => (cell === 'k' ? rect(x, y, 1, 1) : '')).join('')).join('')}"/>`)

      return id
    },
  }
  const shown = actors.slice(0, MOST_ACTORS)
  const homeRanks = new Map(shown.filter(actor => actor.status === 'completed').map((actor, rank) => [actor.id, rank]))
  const rankOf = (actor: Actor): number => homeRanks.get(actor.id) ?? 0
  // Where bubbles go depends on where agents stand, not how tall the sky is, so the rows are settled first.
  const spots = shown.map(actor => spotOf(actor, width, 0, rankOf(actor)))
  const mostRows = fitted === null ? BAND_ROWS : Math.max(1, Math.floor((fitted - 28) / ROW_HEIGHT))
  const bubbles = placed(shown, spots, width, mostRows)
  const skyNeeded = rowHeights(bubbles).reduce((sum, rowHeight) => sum + rowHeight + BUBBLE_GAP, 0)
  const height = fitted ?? Math.max(SHORTEST, skyNeeded + 27)
  const spotted = bubbles.map(bubble => ({ ...bubble, spot: spotOf(bubble.actor, width, height, rankOf(bubble.actor)) }))
  const { tails, drawn } = drawBubbles(spotted, height, cast)
  // Those further up the path stand behind those nearer the screen.
  const sprites = [...shown]
    .sort((a, b) => a.seat % 3 - b.seat % 3)
    .map(actor => drawActor(actor, width, height, cast, rankOf(actor)))
    .join('')
  const edge = rect(1, 0, width - 2, 1) + rect(1, height - 1, width - 2, 1) + rect(0, 1, 1, height - 2) + rect(width - 1, 1, 1, height - 2)
  const notched = `M1 0H${width - 1}V1H${width}V${height - 1}H${width - 1}V${height}H1V${height - 1}H0V1H1Z`
  const nobody =
    shown.length === 0
      ? at(Math.round(width / 2) - 4, groundOf(height) - 3, flipbook(FIRE.map(paint), 1.2)) +
        at(Math.round(width / 2) - 34, groundOf(height) - 12, `<g color="${INK}">${lettered('NO AGENTS RUNNING', cast)}</g>`)
      : ''
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `<defs><clipPath id="screen"><path d="${notched}"/></clipPath>${[...defs.values()].join('')}</defs>` +
    `<g clip-path="url(#screen)">${world(width, height, stage.clock)}${tails}${sprites}${drawn}${nobody}${fill(INK, edge)}</g></svg>`

  return { source, height: height * scale }
}

/** A campfire with nobody at it. It never changes, so it is drawn once and keeps burning. */
export const campfire = (): { source: string; width: number; height: number } => ({
  source:
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="28" viewBox="0 0 8 7" shape-rendering="crispEdges">` +
    `${flipbook(FIRE.map(paint), 1.2)}</svg>`,
  width: 32,
  height: 28,
})

/** What the scene says, for anyone who cannot see it. */
export const altOf = (actors: readonly Actor[]): string => {
  const told = actors.map(actor => `${actor.label}: ${actor.words}${actor.thought === actor.label ? '' : `, thinking "${actor.thought}"`}.`)

  return `A pixel-art scene of the agents on a path to a flag. ${told.join(' ') || 'No agents running.'}`
}
