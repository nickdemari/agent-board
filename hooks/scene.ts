import type { BoardStatus } from '../types'

/** One agent as the scene draws it. The scene reads nothing else, so its source only changes when one of these does. */
export type Actor = {
  id: string
  seat: number
  status: BoardStatus
  /** It finished since the board last changed: its report flies to the pile on this drawing. */
  isFresh: boolean
  percent: number | null
  /** Who it is, in the words of its task. */
  label: string
  /** What goes in its bubble: what it says it is doing, else what it is touching, else the task. */
  thought: string
  /** The bubble's last line: how far along, and how long is left as of its last report. */
  words: string
  /** Running a command, which it does at the copier. */
  atCopier: boolean
  /** Where it was on the last drawing, so it walks over rather than jumps. */
  wasAtCopier: boolean
}

/** One stage of a run, or the agents with no run: a floor of the building. */
export type Department = {
  id: string
  /** Which run it is part of, which only matters with more than one on the board. */
  group: string
  title: string
  /** The stage in the script's own words. */
  detail: string
  state: 'past' | 'now' | 'next'
  agents: readonly Actor[]
  /** What it comes to, for anyone who cannot see the scene. Empty for agents described one by one. */
  says: string
}

export type Office = {
  /** The main agent, while its turn runs. */
  boss: Actor | null
  departments: readonly Department[]
  isParty: boolean
}

export type Stage = {
  /** Cells across the slot the scene is fitted to. */
  columns: number
  /** Cells down, to fill that height with the whole building; left out, the band's single floor. */
  rows?: number
  /** Seconds to start the drifting clouds at, so a redrawn scene does not send them back to the start. */
  clock: number
}

// A desktop cell in CSS pixels. A surface says how large it is in cells, and the frame is sized in pixels.
const CELL_WIDTH = 8.4
const CELL_HEIGHT = 16.8
const MOST_PIXELS = 4096
// How tall the band's scene can be and still show whole above the prompt, under the button, in the twelve rows a band gets.
// Past this the band scrolls, and hides the carpet or the button.
const BAND_PIXELS = 215
const BAND_SCALES = [3, 2] as const
const TOWER_SCALES = [4, 3, 2] as const
// How wide the art has to be to hold a thought and its words on one line of the whiteboard.
const TOWER_WIDEST_LINE = 200
const NARROWEST = 110
const SPRITE_WIDTH = 12
const SPRITE_HEIGHT = 16
const HUD_HEIGHT = 9
// The partition and carpet under the heads, in the band.
const RIM_TO_BOTTOM = 26
const CARPET = 9
const COPIER_ROOM = 26
const WIDEST_CUBE = 14
const NARROWEST_CUBE = 8
const QUEUE_STEP = 9
// A bubble of three lines and the gap above it.
const BUBBLE_ROW = 23
const BUBBLE_GAP = 2
// How much of a bubble's line can start before its agent, and how wide lines start. A longer thought widens them.
const LINE_CHARS = 16
const PADDING_X = 5
const LINE_HEIGHT = 6
const MOST_FLIGHTS = 4
const WALK_SECONDS_PER_PIXEL = 0.03

const INK = '#222034'
const WALL = '#C9C2A8'
const WALL_SHADE = '#B0AA92'
const TILE = '#E6E2D3'
const TILE_LINE = '#BDB9A8'
const FABRIC = '#7A8096'
const FABRIC_RIM = '#A8AFC2'
const CARPET_COLOR = '#5D6178'
const CARPET_FLECK = '#6C7188'
const CARPET_EDGE = '#474A5C'
const DARK = '#474A5C'
const SKY = '#5FCDE4'
const GLASS = '#BDEBF2'
const RED = '#D95763'

const TUNICS = ['#5B6EE1', '#DF7126', '#D77BBA', '#37946E', '#FBF236', '#639BFF', '#76428A', '#8F563B'] as const

const tunicOf = (actor: Pick<Actor, 'seat'>): string =>
  actor.seat < 0 ? '#D95763' : (TUNICS[actor.seat % TUNICS.length] ?? TUNICS[0])

type Grid = readonly string[]

const COLORS: Readonly<Record<string, string>> = {
  k: INK,
  s: '#EEC39A',
  r: '#AC3232',
  g: '#FBF236',
  w: '#FFFFFF',
  W: '#CBDBFC',
  b: '#663931',
  x: '#AC3232',
  o: '#DF7126',
  y: '#FBF236',
  n: '#847E87',
  N: '#595652',
  d: '#FFFFFF',
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
      // A shirt's shaded side is the shirt's own color with a shadow over it, whichever color that is.
      color === 'T'
        ? `<path fill="currentColor" d="${d}"/><path fill="#000" fill-opacity=".3" d="${d}"/>`
        : color === 't'
          ? `<path fill="currentColor" d="${d}"/>`
          : `<path fill="${COLORS[color] ?? INK}" d="${d}"/>`,
    )
    .join('')
}

// E and e are the eyes, which poses change, and h is the hair, which seats change.
const CLERK: Grid = [
  '............',
  '............',
  '............',
  '...hhhhhhh..',
  '..hhhhhhhhh.',
  '..khhhhhhhk.',
  '..khssssshk.',
  '..ksssEsEsk.',
  '..ksssesesk.',
  '..ksssssssk.',
  '...kkkkkkk..',
]
// The main agent, who sent the rest out, and still has the crown.
const BOSS: Grid = [
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
]
const HAIRS = ['b', 'k', 'o', 'n', 'y'] as const

const BODIES = {
  stand: ['...ktttttk..', '..kstttTtsk.', '...ktttTtk..', '...kbkkkbk..', '...kk...kk..'],
  run1: ['...ktttTtk..', '.kkstttTtsk.', '...ktttTtk..', '..kbbk.kbbk.', 'dd.kk...kk..'],
  run2: ['...ktttTtk..', '...kstTtsk..', '...ktttTtk..', '....kbbbk...', '....kk.kk...'],
  sit: ['...ktttTtk..', '..kstttTtsk.', '...ktttTtkbk', '...kkkkkkkkk'],
} as const

type Eyes = 'open' | 'shut' | 'out'

const eyed = (row: string, eyes: Eyes): string => {
  if (eyes === 'open') {
    return row.replaceAll('E', 'k').replaceAll('e', 'k')
  }

  return eyes === 'out' ? row.replaceAll('E', 'x').replaceAll('e', 'x') : row.replaceAll('E', 's').replaceAll('e', 'k')
}

const person = (head: Grid, hair: string, body: keyof typeof BODIES, eyes: Eyes): string[] => {
  const rows = [...head.map(row => eyed(row.replaceAll('h', hair), eyes)), ...BODIES[body]]

  // A body one row short sits lower: the head comes down with it.
  return [...Array.from({ length: SPRITE_HEIGHT - rows.length }, () => '.'.repeat(SPRITE_WIDTH)), ...rows]
}

const CLOUD: Grid = ['....wwww.....', '..wwwwwwww...', '.wwwwwwwwwww.', 'wwwwwwwwwwwww', 'WWWWWWWWWWWWW']
const STORM: Grid = ['...NNNN....', '.NNNNNNNNN.', 'NNNNNNNNNNN', 'nnnnnnnnnnn']

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

const fill = (color: string, d: string): string => (d === '' ? '' : `<path fill="${color}" d="${d}"/>`)

const at = (x: number, y: number, body: string): string => `<g transform="translate(${x} ${y})">${body}</g>`

/** Frames shown in turn, each held the same time and switched outright: no tweening, as a sprite sheet would. */
const flipbook = (frames: readonly string[], seconds: number): string =>
  frames
    .map((frame, shown) => {
      const values = frames.map((_, i) => (i === shown ? 'visible' : 'hidden')).join(';')

      return `<g visibility="${shown === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}" dur="${seconds}s" calcMode="discrete" repeatCount="indefinite"/>${frame}</g>`
    })
    .join('')

const drifting = (fromX: number, toX: number, y: number, seconds: number, clock: number, body: string): string => {
  const values = Array.from({ length: Math.ceil((toX - fromX + 1) / 2) }, (_, i) => `${fromX + i * 2} ${y}`).join(';')

  return `<g transform="translate(${fromX} ${y})"><animateTransform attributeName="transform" type="translate" values="${values}" dur="${seconds}s" begin="-${clock % seconds}s" calcMode="discrete" repeatCount="indefinite"/>${body}</g>`
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

type Cast = {
  sprite: (id: string, grid: readonly string[]) => string
  glyph: (char: string) => string
}

/** The whole thought in two lines at most, as narrow as that lets them be. */
const linesOf = (text: string): string[] => {
  const words = text.replace(/…|\.{2,}/g, ' ').toUpperCase().split(/\s+/).filter(word => word !== '')
  const wrappedAt = (chars: number): string[] =>
    words.reduce<string[]>((lines, word) => {
      const last = lines.at(-1)

      return last !== undefined && last.length + 1 + word.length <= chars
        ? [...lines.slice(0, -1), `${last} ${word}`]
        : [...lines, word]
    }, [])
  let chars = LINE_CHARS

  while (wrappedAt(chars).length > 2) {
    chars += 1
  }

  return wrappedAt(chars)
}

const lettered = (text: string, cast: Cast): string =>
  [...text]
    .map((char, i) => {
      const id = GLYPHS[char] === undefined ? '' : cast.glyph(char)

      return id === '' ? '' : `<use href="#${id}" x="${i * 4}"/>`
    })
    .join('')

const say = (x: number, y: number, text: string, color: string, cast: Cast): string =>
  `<g color="${color}" transform="translate(${x} ${y})">${lettered(text, cast)}</g>`

const textWidth = (text: string): number => text.length * 4 - 1

const hasEndedStatus = (status: BoardStatus): boolean =>
  status === 'completed' || status === 'failed' || status === 'killed' || status === 'gone'

const isWorking = (actor: Actor): boolean => !hasEndedStatus(actor.status)

// ---------- Bubbles ----------

type Spot = { center: number; head: number }
type Speaker = { actor: Actor; spot: Spot }
type Bubble = Speaker & { lines: string[]; words: string; width: number; height: number; x: number; row: number }

/** Places each bubble over its agent, in the lowest row of sky where it touches none of the others. */
const placed = (speakers: readonly Speaker[], width: number, mostRows: number): Bubble[] => {
  const taken: { from: number; to: number }[][] = []
  const bubbles: Bubble[] = []
  // A failure gets its place first. The rest go left to right, which packs the most into a row.
  const queue = [...speakers].sort(
    (a, b) => Number(b.actor.status === 'failed') - Number(a.actor.status === 'failed') || a.spot.center - b.spot.center,
  )

  queue.forEach(({ actor, spot }) => {
    const lines = linesOf(actor.thought)
    // No room in three pixels for a tilde: in the bubble an estimate reads as a time.
    const words = actor.words.replaceAll('~', '').toUpperCase()
    const inner = Math.max(words.length, ...lines.map(line => line.length)) * 4 - 1
    const bubbleWidth = inner + PADDING_X + 3
    const bubbleHeight = (lines.length + (words === '' ? 0 : 1)) * LINE_HEIGHT + 3
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

        // No row with room: the agent works on without a bubble, and hovering it still says.
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

const drawBubbles = (bubbles: readonly Bubble[], base: number, cast: Cast): { tails: string; drawn: string } => {
  const heights = rowHeights(bubbles)
  const bottomOf = (row: number): number => base - heights.slice(0, row).reduce((sum, rowHeight) => sum + rowHeight + BUBBLE_GAP, 0)
  let tails = ''
  let drawn = ''

  for (const bubble of bubbles) {
    const isBad = bubble.actor.status === 'failed'
    const edge = isBad ? '#AC3232' : INK
    const bottom = bottomOf(bubble.row)
    const top = bottom - bubble.height
    const column = Math.round(bubble.spot.center)

    // Puffs up from its head, as a thought rises.
    for (let y = bottom + 1; y < bubble.spot.head; y += 4) {
      tails += fill(edge, rect(column - 1, y, 3, 3)) + fill('#FFFFFF', rect(column, y + 1, 1, 1))
    }

    drawn += at(
      bubble.x,
      top,
      fill(edge, rect(1, 0, bubble.width - 2, bubble.height) + rect(0, 1, bubble.width, bubble.height - 2)) +
        fill('#FFFFFF', rect(1, 1, bubble.width - 2, bubble.height - 2)) +
        // Its shirt's color down the side, which says whose it is when bubbles stack.
        fill(tunicOf(bubble.actor), rect(1, 1, 2, bubble.height - 2)) +
        bubble.lines.map((line, i) => say(PADDING_X, 2 + i * LINE_HEIGHT, line, INK, cast)).join('') +
        (bubble.words === '' ? '' : say(PADDING_X, 2 + bubble.lines.length * LINE_HEIGHT, bubble.words, isBad ? '#AC3232' : '#595652', cast)),
    )
  }

  return { tails, drawn }
}

// ---------- The furniture ----------

const titled = (actor: Actor, body: string): string => `<g><title>${escaped(`${actor.label}: ${actor.thought === actor.label ? actor.words : actor.thought}`)}</title>${body}</g>`

const escaped = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const clerkSprite = (actor: Actor, body: keyof typeof BODIES, eyes: Eyes, cast: Cast): string => {
  const hair = HAIRS[actor.seat < 0 ? 0 : actor.seat % HAIRS.length] ?? 'b'

  return cast.sprite(`clerk-${hair}-${body}-${eyes}`, person(CLERK, hair, body, eyes))
}

const LIGHTS: Partial<Record<BoardStatus, string>> = {
  running: '#9BDCF0',
  pending: '#9BDCF0',
  waiting: '#FBF236',
  idle: '#DF7126',
  failed: RED,
}

/** A partition, with a light on it that says how its agent stands. An empty one has none lit. */
const cubeOf = (x: number, rim: number, floor: number, width: number, status: BoardStatus | null): string =>
  fill(FABRIC, rect(x, rim, width - 1, floor - rim)) +
  fill(FABRIC_RIM, rect(x - 1, rim - 1, width, 2)) +
  fill((status === null ? undefined : LIGHTS[status]) ?? DARK, rect(x + 2, rim + 5, Math.max(2, width - 6), 3))

/** Who shows above the partition. Nobody, once they have gone home or are at the copier. */
const headOf = (actor: Actor, x: number, rim: number, width: number, cast: Cast): string => {
  const left = x - 1 + Math.floor((width - SPRITE_WIDTH - 1) / 2)
  const y = rim - 11

  if (actor.status === 'failed') {
    return `<g color="#847E87">${at(left, y, clerkSprite(actor, 'stand', 'out', cast))}</g>`
  }

  if (!isWorking(actor) || actor.atCopier) {
    return ''
  }

  const color = tunicOf(actor)
  const open = clerkSprite(actor, 'stand', 'open', cast)
  const shut = clerkSprite(actor, 'stand', 'shut', cast)

  if (actor.status === 'idle') {
    return `<g color="${color}">${at(left, y, shut + at(11, 1, snoring()))}</g>`
  }

  const blinking = flipbook([open, open, open, shut], 2.4)
  // Back from the copier: it shows when it has walked over.
  const delay = actor.wasAtCopier ? `<set attributeName="visibility" to="visible" begin="2s"/>` : ''

  return `<g color="${color}" visibility="${actor.wasAtCopier ? 'hidden' : 'visible'}">${delay}${at(left, y, blinking)}</g>`
}

/** Rain indoors and a red stapler on the partition, for anyone who failed. */
const failureOf = (x: number, rim: number, width: number): string =>
  at(x + Math.floor((width - 12) / 2), rim - 20, raining()) +
  fill(RED, rect(x + width - 8, rim - 3, 6, 2)) +
  fill(INK, rect(x + width - 8, rim - 1, 6, 1))

const copierOf = (floor: number): string =>
  fill(INK, rect(5, floor - 18, 20, 19)) +
  fill('#CBC7B5', rect(6, floor - 17, 18, 17)) +
  fill('#847E87', rect(6, floor - 17, 18, 3)) +
  fill('#FFFFFF', rect(9, floor - 20, 10, 3)) +
  flipbook([fill('#99E550', rect(20, floor - 12, 2, 2)), fill('#37946E', rect(20, floor - 12, 2, 2))], 0.8)

/** A walk over whole pixels, once. */
const walkOf = (fromX: number, toX: number, y: number): string => {
  const count = Math.abs(toX - fromX)
  const direction = Math.sign(toX - fromX)
  const hops = Math.ceil(count / 3)
  const values = Array.from({ length: hops + 1 }, (_, i) => `${fromX + Math.min(count, i * 3) * direction} ${y}`).join(';')

  return `<animateTransform attributeName="transform" type="translate" values="${values}" dur="2s" calcMode="discrete" fill="freeze"/>`
}

/** Anyone running a command stands in line at the copier. */
const queueOf = (queue: readonly { actor: Actor; home: number }[], bottom: number, cast: Cast): string =>
  queue
    .map(({ actor, home }, i) => {
      const x = spotInQueue(i, queue.length)
      const y = bottom - SPRITE_HEIGHT - 1
      const run = flipbook([clerkSprite(actor, 'run1', 'open', cast), at(0, -1, clerkSprite(actor, 'run2', 'open', cast))], 0.36)
      const stand = flipbook([clerkSprite(actor, 'stand', 'open', cast), clerkSprite(actor, 'stand', 'open', cast), clerkSprite(actor, 'stand', 'shut', cast)], 2.4)
      const isArriving = !actor.wasAtCopier
      const walking = isArriving ? `<g><set attributeName="visibility" to="hidden" begin="2s"/>${run}</g>` : ''
      const waiting = `<g visibility="${isArriving ? 'hidden' : 'visible'}">${isArriving ? '<set attributeName="visibility" to="visible" begin="2s"/>' : ''}${stand}</g>`

      return titled(actor, `<g color="${tunicOf(actor)}" transform="translate(${isArriving ? home : x} ${y})">${isArriving ? walkOf(home, x, y) : ''}${walking}${waiting}</g>`)
    })
    .join('')

const spotInQueue = (i: number, total: number): number => COPIER_ROOM + i * Math.max(4, Math.min(QUEUE_STEP, Math.floor(72 / Math.max(1, total))))

/** Back at the desk from the copier: the walk there, then the head takes over. */
const returningOf = (actor: Actor, home: number, bottom: number, cast: Cast): string => {
  const y = bottom - SPRITE_HEIGHT - 1
  const run = flipbook([clerkSprite(actor, 'run1', 'open', cast), at(0, -1, clerkSprite(actor, 'run2', 'open', cast))], 0.36)

  return `<g color="${tunicOf(actor)}" transform="translate(${COPIER_ROOM} ${y})">${walkOf(COPIER_ROOM, home, y)}<g><set attributeName="visibility" to="hidden" begin="2s"/>${run}</g></g>`
}

/** A finished report on its way to the pile, which is fan-in you can watch. */
const flightOf = (fromX: number, fromY: number, toX: number, toY: number): string => {
  const hops = 10
  const values = Array.from({ length: hops + 1 }, (_, i) => {
    const t = i / hops

    return `${Math.round(fromX + (toX - fromX) * t)} ${Math.round(fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * 10)}`
  }).join(';')

  return `<path fill="#FFFFFF" d="M0 0h5v4h-5z" visibility="hidden"><animateTransform attributeName="transform" type="translate" values="${values}" dur="2s" calcMode="discrete" fill="freeze"/><set attributeName="visibility" to="visible" begin="0s" dur="2s"/></path>`
}

const bossRoomOf = (office: Office, x: number, top: number, floor: number, right: number, reports: number, clock: number, cast: Cast): string => {
  const width = right - x
  const pile = Math.min(floor - top - 22, Math.ceil(Math.sqrt(reports) * 2.4))
  const pileX = right - 18
  let sheets = ''
  let edges = ''

  for (let i = 0; i < pile; i += 1) {
    if (i % 3 === 1) {
      edges += rect(pileX + (i % 2), floor - 11 - i, 12, 1)
    } else {
      sheets += rect(pileX + (i % 2), floor - 11 - i, 12, 1)
    }
  }

  const boss = office.boss === null ? '' : titled(office.boss, `<g color="#5B6EE1">${at(x + 8, floor - SPRITE_HEIGHT + 1, cast.sprite('boss-sit', person(BOSS, 'b', 'sit', 'open')))}</g>`)

  return (
    fill(GLASS, rect(x, top, width, floor - top)) +
    fill(SKY, rect(x + 4, top + 3, width - 8, Math.max(6, floor - top - 26))) +
    at(0, 0, drifting(x - 8, right - 16, top + 5, 120, clock, `<g opacity=".9">${paint(CLOUD)}</g>`)) +
    fill('#847E87', rect(x, top, 2, floor - top)) +
    boss +
    fill('#663931', rect(x + 5, floor - 10, width - 8, 2) + rect(x + 7, floor - 8, 2, 8) + rect(right - 6, floor - 8, 2, 8)) +
    fill('#FFFFFF', sheets) +
    fill('#CBDBFC', edges) +
    fill('#FFFFFF', rect(x + 21, floor - 14, 4, 4)) +
    flipbook([fill('#FFFFFF', rect(x + 22, floor - 17, 1, 2)), fill('#FFFFFF', rect(x + 23, floor - 18, 1, 2))], 1.4)
  )
}

const plateOf = (x: number, y: number, text: string, color: string, cast: Cast): string =>
  at(x, y, fill(INK, rect(0, 0, textWidth(text) + 5, 8)) + say(2, 2, text, color, cast))

const talliesOf = (office: Office): { done: number; working: number; failed: number } => {
  const all = office.departments.flatMap(department => department.agents)

  return {
    done: all.filter(one => one.status === 'completed').length,
    working: all.filter(isWorking).length,
    failed: all.filter(one => one.status === 'failed').length,
  }
}

/** A bar across the top: what is under way in the script's own words, and the tally. Words that do not fit are left out whole. */
const hudOf = (office: Office, width: number, cast: Cast): string => {
  const { done, working, failed } = talliesOf(office)
  const right = [done > 0 || working > 0 ? `${done} DONE` : '', working > 0 ? `${working} WORKING` : ''].filter(part => part !== '').join(' · ')
  const bad = failed > 0 ? `${right === '' ? '' : ' · '}${failed} FAILED` : ''
  const rightWidth = (right.length + bad.length) * 4
  const now = office.departments.filter(department => department.state === 'now')
  const only = now.length === 1 ? now[0] : undefined
  const named = only === undefined ? (now.length > 1 ? `${now.length} RUNS AT WORK` : '') : only.id === 'team' ? '' : only.title
  const told = only !== undefined && only.detail !== '' ? `${only.title}: ${only.detail.toUpperCase()}` : named
  const left = (told.length * 4 + rightWidth + 12 <= width ? told : '') || (named.length * 4 + rightWidth + 12 <= width ? named : '')

  return (
    fill(INK, rect(0, 0, width, HUD_HEIGHT)) +
    say(4, 2, left, '#FFFFFF', cast) +
    say(width - 4 - rightWidth + 1, 2, right, '#EEC39A', cast) +
    say(width - 4 - bad.length * 4 + 1, 2, bad, '#FF7A7A', cast)
  )
}

/** Tiny cubicles receding behind the row: everyone who is not in it, so a big run looks like a big office. */
const farmOf = (agents: readonly Actor[], x: number, right: number, bottom: number, top: number): string => {
  const rows = Math.max(1, Math.floor((bottom - top) / 3))
  const cell = agents.length > Math.floor((right - x) / 4) * rows ? 3 : 4
  const perRow = Math.max(1, Math.floor((right - x) / cell))
  let dim = ''
  let bad = ''

  agents.forEach((one, i) => {
    const y = bottom - 2 - Math.floor(i / perRow) * 3

    if (y >= top) {
      const d = rect(x + (i % perRow) * cell, y, cell - 1, 2)

      if (one.status === 'failed') {
        bad += d
      } else {
        dim += d
      }
    }
  })

  return fill('#8A8FA3', dim) + fill(RED, bad)
}

// ---------- The band: one floor, close up ----------

type FrontRow = { seated: Actor[]; farm: Actor[]; cube: number; first: number; span: number; capacity: number; slotOf: (actor: Actor) => number }

/** People sit scattered, as in any office, and stay put as others arrive. It also leaves their bubbles room. */
const slotsOf = (seated: readonly Actor[], capacity: number): Map<Actor, number> => {
  const slots = new Map<Actor, number>()
  const taken = new Set<number>()

  for (const actor of seated) {
    let slot = Math.floor((((Math.max(0, actor.seat) + 1) * 0.618) % 1) * capacity)

    while (taken.has(slot)) {
      slot = (slot + 1) % capacity
    }

    taken.add(slot)
    slots.set(actor, slot)
  }

  return slots
}

/** Who sits in the row: anyone who failed and anyone working, then whoever finished last, and the rest go behind. */
const frontRowOf = (office: Office, first: number, right: number): FrontRow => {
  const everyone = office.departments.flatMap(department => department.agents)
  const now = office.departments.filter(department => department.state === 'now').flatMap(department => department.agents)
  const span = right - first - 2
  const room = Math.floor(span / NARROWEST_CUBE)
  const wanted = [...everyone.filter(one => one.status === 'failed'), ...now.filter(isWorking), ...now.filter(one => !isWorking(one) && one.status !== 'failed').reverse()]
  const seated = [...new Set(wanted)].slice(0, room).sort((a, b) => a.seat - b.seat)
  const chosen = new Set(seated)
  const farm = everyone.filter(one => !chosen.has(one))
  const cube = Math.max(NARROWEST_CUBE, Math.min(WIDEST_CUBE, Math.floor(span / Math.max(1, seated.length))))
  const capacity = Math.max(1, Math.floor(span / cube))
  const slots = slotsOf(seated, capacity)

  return { seated, farm, cube, first, span, capacity, slotOf: actor => slots.get(actor) ?? 0 }
}

const bandSpeakers = (office: Office, width: number, height: number, row: FrontRow, bossX: number): Speaker[] => {
  const rim = height - RIM_TO_BOTTOM
  const queue = row.seated.filter(one => isWorking(one) && one.atCopier)
  const speakers = row.seated
    .filter(one => isWorking(one) || one.status === 'failed')
    .map((actor): Speaker => {
      const queued = isWorking(actor) && actor.atCopier ? queue.indexOf(actor) : -1

      return queued >= 0
        ? { actor, spot: { center: spotInQueue(queued, queue.length) + SPRITE_WIDTH / 2, head: height - SPRITE_HEIGHT - 2 } }
        : { actor, spot: { center: row.first + row.slotOf(actor) * row.cube + row.cube / 2, head: rim - 9 } }
    })

  return office.boss === null ? speakers : [...speakers, { actor: office.boss, spot: { center: bossX + 14, head: height - CARPET - 16 } }]
}

const bandRows = (height: number): number => Math.max(1, Math.floor((height - RIM_TO_BOTTOM - 11 - HUD_HEIGHT - 2) / BUBBLE_ROW))

const bossRoomWidth = (width: number): number => Math.max(44, Math.min(70, Math.round(width * 0.2)))

/** The scale the band draws at: the largest that gives everyone a bubble and a proper cubicle, else whichever bubbles the most. */
const bandScale = (office: Office, slot: number): number => {
  let best = BAND_SCALES[BAND_SCALES.length - 1] ?? 2
  let most = -1

  for (const scale of BAND_SCALES) {
    const width = Math.max(NARROWEST, Math.floor(slot / scale))
    const height = Math.floor(BAND_PIXELS / scale)
    const bossX = width - bossRoomWidth(width)
    const row = frontRowOf(office, COPIER_ROOM + 2, bossX)
    const speakers = bandSpeakers(office, width, height, row, bossX)
    const shown = placed(speakers, width, bandRows(height)).length
    const isRoomy = width >= 170 && row.seated.filter(one => isWorking(one) || one.status === 'failed').length * 12 <= row.span

    if (isRoomy && shown === speakers.length) {
      return scale
    }

    if (shown > most) {
      best = scale
      most = shown
    }
  }

  return best
}

const directoryOf = (office: Office, x: number, y: number, mostLines: number, cast: Cast): string => {
  const groups = new Set(office.departments.map(department => department.group))

  // Agents with no run have no stages to list, and the bar already counts them.
  if (office.departments.length === 0 || (office.departments.length === 1 && office.departments[0]?.id === 'team')) {
    return ''
  }

  const nameOf = (department: Department): string => (groups.size > 1 ? `${department.group}: ${department.title}` : department.title)
  const listed = groups.size > 1 ? office.departments.filter(department => department.state === 'now') : office.departments
  const kept = listed.length <= mostLines ? listed : [...listed.filter(department => department.state === 'now'), ...listed.filter(department => department.state === 'past').reverse(), ...listed.filter(department => department.state === 'next')].slice(0, mostLines)
  const lines = kept.map(department => {
    const finished = department.agents.filter(one => !isWorking(one)).length
    const count = department.agents.length === 0 ? '' : ` ${finished}/${department.agents.length}`

    return { text: `${nameOf(department)}${count}`, color: department.state === 'now' ? '#FBF236' : department.state === 'past' ? '#EEC39A' : '#8A8FA3' }
  })
  const width = Math.max(...lines.map(line => textWidth(line.text))) + 5

  return at(x, y, fill(INK, rect(0, 0, width, lines.length * 7 + 2)) + lines.map((line, i) => say(2, 2 + i * 7, line.text, line.color, cast)).join(''))
}

const ceilingOf = (width: number, y: number, depth: number, isLit: boolean): string => {
  let lines = ''
  let tubes = ''
  let flicker = ''

  for (let x = 0; x < width; x += 16) {
    lines += rect(x, y, 1, depth)
  }

  for (let x = 12; x < width; x += 48) {
    tubes += rect(x, y + 1, 22, Math.max(1, depth - 2))

    if (x % 96 !== 12) {
      flicker += rect(x, y + 1, 22, Math.max(1, depth - 2))
    }
  }

  return (
    fill(TILE, rect(0, y, width, depth)) +
    fill(TILE_LINE, lines) +
    (isLit
      ? fill('#FFFFFF', tubes) + (flicker === '' ? '' : flipbook([fill('#FFFFFF', flicker), fill(TILE_LINE, flicker), fill('#FFFFFF', flicker), fill('#FFFFFF', flicker)], 1.1))
      : fill(TILE_LINE, tubes))
  )
}

const carpetOf = (width: number, y: number, depth: number): string => {
  let flecks = ''

  for (let i = 0; i < width / 5; i += 1) {
    flecks += rect((i * 53) % width, y + 1 + ((i * 7) % Math.max(1, depth - 1)), 1, 1)
  }

  return fill(CARPET_COLOR, rect(0, y, width, depth)) + fill(CARPET_FLECK, flecks) + fill(CARPET_EDGE, rect(0, y, width, 1))
}

const windowOf = (x: number, y: number, width: number, height: number, clock: number): string => {
  let blinds = ''

  for (let line = y + 2; line < y + height; line += 3) {
    blinds += rect(x, line, width, 1)
  }

  return (
    fill(INK, rect(x - 1, y - 1, width + 2, height + 2)) +
    fill(SKY, rect(x, y, width, height)) +
    `<clipPath id="window${y}"><path d="${rect(x, y, width, height)}"/></clipPath><g clip-path="url(#window${y})">${drifting(x - 14, x + width, y + 2, 90, clock, paint(CLOUD))}${drifting(x + Math.round(width * 0.4) - width, x + Math.round(width * 0.4), y + Math.min(7, height - 6), 130, clock + 50, paint(CLOUD))}</g>` +
    fill('#9FE4F0', blinds)
  )
}

const bandOf = (office: Office, width: number, height: number, clock: number, cast: Cast): string => {
  const floor = height - CARPET
  const rim = height - RIM_TO_BOTTOM
  const bossX = width - bossRoomWidth(width)
  const first = COPIER_ROOM + 2
  const row = frontRowOf(office, first, bossX)
  const ceilingEnd = HUD_HEIGHT + 3
  const windowTop = ceilingEnd + 2
  const windowHeight = Math.max(6, Math.min(16, rim - 28 - windowTop))
  const { done } = talliesOf(office)
  const speakers = bandSpeakers(office, width, height, row, bossX)
  const { tails, drawn } = drawBubbles(placed(speakers, width, bandRows(height)), rim - 11, cast)
  const xOfActor = (actor: Actor): number => first + row.slotOf(actor) * row.cube
  const queue = row.seated.filter(one => isWorking(one) && one.atCopier).map(actor => ({ actor, home: xOfActor(actor) }))
  const usedSlots = new Set(row.seated.map(row.slotOf))
  const cubes = [
    ...Array.from({ length: row.capacity }, (_, slot) => slot)
      .filter(slot => !usedSlots.has(slot))
      .map(slot => cubeOf(first + slot * row.cube, rim, floor, row.cube, null)),
    ...row.seated.map(actor => titled(actor, cubeOf(xOfActor(actor), rim, floor, row.cube, actor.status))),
  ].join('')
  const heads = row.seated.map(actor => titled(actor, headOf(actor, xOfActor(actor), rim, row.cube, cast))).join('')
  const failures = row.seated.map(actor => (actor.status === 'failed' ? failureOf(xOfActor(actor), rim, row.cube) : '')).join('')
  const returning = row.seated.map(actor => (isWorking(actor) && !actor.atCopier && actor.wasAtCopier ? returningOf(actor, xOfActor(actor), height, cast) : '')).join('')
  const flights = row.seated
    .filter(actor => actor.isFresh && actor.status === 'completed')
    .slice(0, MOST_FLIGHTS)
    .map(actor => flightOf(xOfActor(actor) + 4, rim - 6, width - 16, floor - 16))
    .join('')
  const isIdle = queue.length === 0 && height >= 90 && office.departments.length > 0
  const reports = `${done} REPORTS`

  return [
    fill(WALL, rect(0, ceilingEnd, width, floor - ceilingEnd)),
    ceilingOf(width, HUD_HEIGHT, 3, true),
    windowOf(first, windowTop, bossX - first - 4, windowHeight, clock),
    fill(WALL_SHADE, rect(0, rim - 3, bossX, 1)),
    farmOf(row.farm, first, bossX - 4, rim - 2, windowTop + windowHeight + 2),
    heads,
    cubes,
    carpetOf(width, floor, CARPET),
    bossRoomOf(office, bossX, ceilingEnd, floor, width - 1, done, clock, cast),
    copierOf(floor),
    failures,
    done > 0 && textWidth(reports) + 7 <= bossRoomWidth(width) ? plateOf(bossX + 4, floor - 8, reports, '#FFFFFF', cast) : '',
    isIdle ? plateOf(3, floor - 31, 'PC LOAD LETTER', '#99E550', cast) : '',
    directoryOf(office, 2, ceilingEnd + 2, Math.max(1, Math.floor((rim - 12 - ceilingEnd - 4) / 7)), cast),
    queueOf(queue, height, cast),
    returning,
    tails,
    drawn,
    flights,
    office.isParty ? at(width - 12, floor - 26, confetti()) : '',
    hudOf(office, width, cast),
  ].join('')
}

// ---------- Fill screen: the whole building, a floor for each stage ----------

const BOSS_FLOOR = 46
const LOBBY = 16
const PAST_FLOOR = 15
const NEXT_FLOOR = 13
const CUBE_ROW = 25

/** The whiteboard: a line for everyone working or failed, so nothing has to fit in a bubble. */
const whiteboardOf = (agents: readonly Actor[], x: number, y: number, width: number, mostLines: number, cast: Cast): { body: string; height: number } => {
  if (agents.length === 0 || mostLines < 1) {
    return { body: '', height: 0 }
  }

  const lines = agents.length <= mostLines ? agents : agents.slice(0, mostLines - 1)
  const rest = agents.length - lines.length
  const height = (lines.length + (rest > 0 ? 1 : 0)) * 6 + 4
  const writing = lines
    .map((actor, i) => {
      const said = actor.thought === actor.label || actor.thought === '' ? actor.label : actor.thought
      const words = actor.words.replaceAll('~', '')
      const text = (said.length + words.length + 3) * 4 < width - 12 && words !== '' ? `${said} · ${words}` : said

      return titled(
        actor,
        fill(actor.status === 'failed' ? RED : tunicOf(actor), rect(3, 2 + i * 6 + 1, 4, 3)) + say(9, 3 + i * 6, text.toUpperCase().replace(/…|\.{2,}/g, ' '), actor.status === 'failed' ? '#AC3232' : INK, cast),
      )
    })
    .join('')

  return {
    height,
    body: at(
      x,
      y,
      fill('#847E87', rect(0, 0, width, height)) +
        fill('#F4F3EC', rect(1, 1, width - 2, height - 2)) +
        writing +
        (rest > 0 ? say(9, 3 + lines.length * 6, `+${rest} MORE WORKING`, '#595652', cast) : ''),
    ),
  }
}

const floorOf = (department: Department, y: number, height: number, width: number, boss: { x: number; y: number }, clock: number, cast: Cast): string => {
  const isNow = department.state === 'now'
  const count = department.agents.length === 0 ? '' : ` ${department.agents.filter(one => !isWorking(one)).length}/${department.agents.length}`
  const name = `${department.id === 'team' ? 'AGENTS' : department.title}${count}`
  const wall = isNow ? WALL : department.state === 'past' ? '#9E9987' : '#5F5C52'
  const ground = y + height - CARPET
  const head = fill(wall, rect(0, y, width, height)) + ceilingOf(width, y, 3, isNow) + fill(CARPET_EDGE, rect(0, y + height - 1, width, 1))
  const plate = plateOf(2, y + 4, name, isNow ? '#FBF236' : department.state === 'past' ? '#EEC39A' : '#8A8FA3', cast)

  if (department.state === 'next') {
    return head + plate
  }

  const bad = department.agents.filter(one => one.status === 'failed')

  if (!isNow) {
    const board = whiteboardOf(bad, 2, y + 13, width - 4, 2, cast)

    return head + plate + farmOf(department.agents.filter(one => one.status !== 'failed'), 4, width - 4, y + height - 2, y + 13 + board.height + 1) + board.body
  }

  const detail = department.detail.toUpperCase()
  const titleWidth = textWidth(name) + 5
  const detailFits = detail !== '' && titleWidth + 6 + textWidth(detail) < width - 2
  const textTop = y + 4
  const working = department.agents.filter(isWorking)
  const finished = department.agents.filter(one => !isWorking(one) && one.status !== 'failed')
  const boardTop = y + 13
  const room = ground - boardTop
  const perRow = Math.max(1, Math.floor((width - COPIER_ROOM - 4) / WIDEST_CUBE))
  // The whiteboard takes what it needs, leaving a row of cubicles at the least.
  const mostLines = Math.max(1, Math.floor((room - CUBE_ROW - 5) / 6))
  const board = whiteboardOf([...bad, ...working], 2, boardTop, width - 4, mostLines, cast)
  const rowsFit = Math.max(1, Math.floor((room - board.height - 2) / CUBE_ROW))
  const wanted = [...bad, ...working, ...finished.slice().reverse()]
  // A floor of cubicles, full whoever is in. Past what it holds, one row gives way to the tiny ones behind.
  const rowCount = wanted.length > rowsFit * perRow && rowsFit > 1 ? rowsFit - 1 : rowsFit
  const cells = rowCount * perRow
  const seated = wanted.slice(0, cells).sort((one, other) => one.seat - other.seat)
  const slots = slotsOf(seated, cells)
  const seatedSet = new Set(seated)
  const behind = department.agents.filter(one => !seatedSet.has(one))
  const rimOf = (slot: number): number => ground - (rowCount - 1 - Math.floor(slot / perRow)) * CUBE_ROW - 16
  const xOfSlot = (slot: number): number => COPIER_ROOM + 2 + (slot % perRow) * WIDEST_CUBE
  const sitting = new Map([...slots].map(([actor, slot]) => [slot, actor]))
  const body = Array.from({ length: cells }, (_, slot) => {
    const actor = sitting.get(slot)
    const x = xOfSlot(slot)
    const rim = rimOf(slot)
    const bottom = rim + 15

    return actor === undefined
      ? cubeOf(x, rim, bottom, WIDEST_CUBE, null)
      : titled(actor, headOf({ ...actor, wasAtCopier: false }, x, rim, WIDEST_CUBE, cast) + cubeOf(x, rim, bottom, WIDEST_CUBE, actor.status) + (actor.status === 'failed' ? failureOf(x, rim, WIDEST_CUBE) : ''))
  }).join('')
  const queue = seated.filter(one => isWorking(one) && one.atCopier).map(actor => ({ actor: { ...actor, wasAtCopier: true }, home: xOfSlot(slots.get(actor) ?? 0) }))
  const flights = seated
    .filter(actor => actor.isFresh && actor.status === 'completed')
    .slice(0, MOST_FLIGHTS)
    .map(actor => flightOf(xOfSlot(slots.get(actor) ?? 0) + 4, rimOf(slots.get(actor) ?? 0) - 6, boss.x, boss.y))
    .join('')

  return (
    head +
    windowOf(titleWidth + 8, textTop, Math.max(6, width - titleWidth - 12), 6, clock) +
    plate +
    (detailFits ? plateOf(titleWidth + 6, textTop, detail, '#FFFFFF', cast) : '') +
    farmOf(behind, COPIER_ROOM + 2, width - 4, rimOf(0) - 12, boardTop + board.height + 1) +
    board.body +
    body +
    carpetOf(width, ground, CARPET) +
    copierOf(ground) +
    queueOf(queue, ground + CARPET - 1, cast) +
    flights
  )
}

const towerOf = (office: Office, width: number, height: number, clock: number, cast: Cast): string => {
  const { done } = talliesOf(office)
  const lobbyTop = height - LOBBY
  const floorsTop = HUD_HEIGHT + BOSS_FLOOR
  const room = lobbyTop - floorsTop
  const shown: readonly Department[] = office.departments.length > 0
    ? office.departments
    : [{ id: 'team', group: '', title: 'OPEN PLAN', detail: '', state: 'next', agents: [], says: '' }]
  const pastHeight = (one: Department): number => {
    const rows = Math.ceil(one.agents.length / Math.max(1, Math.floor((width - 8) / 4)))
    const failed = one.agents.some(agent => agent.status === 'failed') ? 16 : 0

    return Math.min(44, PAST_FLOOR + rows * 3 + failed)
  }
  const fixed = shown.reduce((sum, one) => sum + (one.state === 'past' ? pastHeight(one) : one.state === 'next' ? NEXT_FLOOR : 0), 0)
  const live = shown.filter(one => one.state === 'now').length
  const liveHeight = live > 0 ? Math.max(CUBE_ROW + 22, Math.floor((room - fixed) / live)) : 0
  const spare = live === 0 ? Math.floor(Math.max(0, room - fixed) / shown.length) : 0
  const pileAt = { x: width - 18, y: HUD_HEIGHT + BOSS_FLOOR - 26 }
  const reports = `${done} REPORTS`
  let y = floorsTop
  let floors = ''

  shown.forEach(one => {
    const each = (one.state === 'now' ? liveHeight : one.state === 'past' ? pastHeight(one) : NEXT_FLOOR) + spare

    floors += floorOf(one, y, each, width, pileAt, clock, cast)
    y += each
  })

  const bossThought = office.boss === null || office.boss.thought === '' ? '' : `${office.boss.thought}${office.boss.words === '' ? '' : ` · ${office.boss.words}`}`.toUpperCase().replaceAll('~', '').replace(/…|\.{2,}/g, ' ')

  return [
    fill(WALL, rect(0, HUD_HEIGHT, width, height - HUD_HEIGHT)),
    ceilingOf(width, HUD_HEIGHT, 3, true),
    bossRoomOf(office, Math.round(width * 0.45), HUD_HEIGHT + 3, HUD_HEIGHT + BOSS_FLOOR - 1, width, done, clock, cast),
    fill(CARPET_EDGE, rect(0, HUD_HEIGHT + BOSS_FLOOR - 1, width, 1)),
    done > 0 ? plateOf(Math.round(width * 0.45) + 4, HUD_HEIGHT + BOSS_FLOOR - 9, reports, '#FFFFFF', cast) : '',
    bossThought !== '' && textWidth(bossThought) + 10 < width ? plateOf(3, HUD_HEIGHT + 5, bossThought, '#FFFFFF', cast) : '',
    office.isParty ? at(width - 12, HUD_HEIGHT + BOSS_FLOOR - 28, confetti()) : '',
    floors,
    // The lobby, under it all. Whatever room the floors left goes to the entrance.
    fill(WALL_SHADE, rect(0, y, width, Math.max(0, lobbyTop - y))),
    fill('#8F563B', rect(0, lobbyTop, width, LOBBY)) +
      fill('#663931', rect(0, lobbyTop, width, 1)) +
      fill(INK, rect(Math.round(width / 2) - 9, lobbyTop + 2, 18, LOBBY - 2)) +
      fill(GLASS, rect(Math.round(width / 2) - 8, lobbyTop + 3, 7, LOBBY - 3) + rect(Math.round(width / 2) + 1, lobbyTop + 3, 7, LOBBY - 3)) +
      fill('#37946E', rect(8, lobbyTop + 4, 6, 6)) +
      fill('#663931', rect(9, lobbyTop + 10, 4, 4)),
    hudOf(office, width, cast),
  ].join('')
}

/** The office, all of it: one SVG document, and the size in pixels to give its frame, which is 300 by 150 when given none. */
export const sceneOf = (office: Office, stage: Stage): { source: string; width: number; height: number } => {
  const slot = stage.columns * CELL_WIDTH
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
  const towerScale = TOWER_SCALES.find(one => slot / one >= TOWER_WIDEST_LINE) ?? TOWER_SCALES[TOWER_SCALES.length - 1] ?? 2
  const scale = stage.rows === undefined ? bandScale(office, slot) : towerScale
  const width = Math.max(NARROWEST, Math.floor(slot / scale))
  const height = stage.rows === undefined ? Math.floor(BAND_PIXELS / scale) : Math.max(120, Math.round((stage.rows * CELL_HEIGHT) / scale))
  const body = stage.rows === undefined ? bandOf(office, width, height, stage.clock, cast) : towerOf(office, width, height, stage.clock, cast)
  const edge = rect(1, 0, width - 2, 1) + rect(1, height - 1, width - 2, 1) + rect(0, 1, 1, height - 2) + rect(width - 1, 1, 1, height - 2)
  const notched = `M1 0H${width - 1}V1H${width}V${height - 1}H${width - 1}V${height}H1V${height - 1}H0V1H1Z`
  // The narrowest scene can be wider than its slot, and it shrinks to fit rather than run off the edge.
  const fit = Math.min(1, slot / (width * scale), MOST_PIXELS / (Math.max(width, height) * scale))
  const drawnWidth = Math.floor(width * scale * fit)
  const drawnHeight = Math.floor(height * scale * fit)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${drawnWidth}" height="${drawnHeight}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `<defs><clipPath id="screen"><path d="${notched}"/></clipPath>${[...defs.values()].join('')}</defs>` +
    `<g clip-path="url(#screen)">${body}${fill(INK, edge)}</g></svg>`

  return { source, width: drawnWidth, height: drawnHeight }
}

/** A mug with nobody at their desk. It never changes, so it is drawn once and keeps steaming. */
export const coffee = (): { source: string; width: number; height: number } => ({
  source:
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="28" viewBox="0 0 8 7" shape-rendering="crispEdges">` +
    `${flipbook([fill('#CBDBFC', rect(2, 0, 1, 1) + rect(4, 1, 1, 1)), fill('#CBDBFC', rect(3, 0, 1, 1) + rect(2, 1, 1, 1))], 1.4)}${fill('#FFFFFF', rect(1, 2, 5, 4))}${fill('#CBDBFC', rect(1, 5, 5, 1))}${fill('#FFFFFF', rect(6, 3, 1, 2))}${fill(RED, rect(2, 3, 3, 1))}</svg>`,
  width: 32,
  height: 28,
})

/** What the scene says, for anyone who cannot see it. */
export const altOf = (office: Office): string => {
  const said = (actor: Actor): string => `${actor.label}: ${actor.words}${actor.thought === actor.label || actor.thought === '' ? '' : `, thinking "${actor.thought}"`}.`
  const told = [
    ...(office.boss === null ? [] : [said(office.boss)]),
    ...office.departments.flatMap(department => {
      if (department.says !== '') {
        return [department.says]
      }

      const named = department.agents.slice(0, 12).map(said)

      return department.agents.length > 12 ? [...named, `and ${department.agents.length - 12} more agents.`] : named
    }),
  ]

  return `A pixel-art scene of an office, its agents at their desks and a boss with a pile of finished reports. ${told.join(' ') || 'No agents running.'}`
}
