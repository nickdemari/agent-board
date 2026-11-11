import type { BoardStatus } from '../types'

import { CAP, GLYPHS, LINE, acrossOf, plain, widthOf } from './font'

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
// Few agents are drawn large. The more there are, the further out the building is seen from.
const TOWER_SCALES = [5, 4, 3, 2] as const
const NARROWEST = 110
// A pixel of the words in CSS pixels, whatever scale the art is at: the art can shrink to fit a crowd, and the words still read.
const TEXT_PIXEL = 2
const SPRITE_WIDTH = 12
const SPRITE_HEIGHT = 16
// The partition and carpet under the heads, in the band.
const RIM_TO_BOTTOM = 26
const CARPET = 9
const COPIER_ROOM = 26
const WIDEST_CUBE = 14
const NARROWEST_CUBE = 8
const QUEUE_STEP = 9
// Where the line at the copier starts: in front of the machine, clear of the desks.
const QUEUE_START = 7
const BUBBLE_GAP = 2
// How far to one side of its agent a bubble can sit, with its puffs leaning over to it: a little, and in a crowd a lot.
const BUBBLE_LEAN = 8
const FAR_LEAN = 40
// How wide a line of a bubble gets, in the font's pixels, before the thought goes onto a second line.
const LINE_PIXELS = 112
// And in a crowd, where a narrow bubble of three lines fits and a wide one of one does not.
const TERSE_PIXELS = 64
// And of the card that hovering an agent shows.
const CARD_PIXELS = 150
const MOST_FLIGHTS = 4
// A surface takes 131,072 characters of drawing. Past this many the hover cards give way, the least pressing first.
const SOURCE_ROOM = 110_000
// However big the crowd, this many keep a desk of their own.
const FEWEST_SEATS = 8

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
  p: '#37946E',
  P: '#6ABE30',
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

const PLANT: Grid = ['..p.p..', '.pPpPp.', 'ppPpPpp', '.ppPpp.', '..ppp..', '...b...', '.ooooo.', '.ooooo.', '..ooo..']

const rect = (x: number, y: number, width: number, height: number): string => `M${x} ${y}h${width}v${height}h-${width}z`

const fill = (color: string, d: string): string => (d === '' ? '' : `<path fill="${color}" d="${d}"/>`)

const at = (x: number, y: number, body: string): string => `<g transform="translate(${x} ${y})">${body}</g>`

/**
 * Frames shown in turn, each held the same time and switched outright: no tweening, as a sprite sheet would.
 * A frame given twice running is held for two beats and drawn once, and an empty one draws nothing.
 */
const flipbook = (frames: readonly string[], seconds: number): string => {
  const held: { frame: string; from: number }[] = []

  frames.forEach((frame, i) => {
    if (held.at(-1)?.frame !== frame) {
      held.push({ frame, from: i })
    }
  })

  const keyTimes = held.length === frames.length ? '' : ` keyTimes="${held.map(one => Number((one.from / frames.length).toFixed(3))).join(';')}"`

  return held
    .map(({ frame }, shown) => {
      const values = held.map((_, i) => (i === shown ? 'visible' : 'hidden')).join(';')

      return frame === ''
        ? ''
        : `<g visibility="${shown === 0 ? 'visible' : 'hidden'}"><animate attributeName="visibility" values="${values}"${keyTimes} dur="${seconds}s" calcMode="discrete" repeatCount="indefinite"/>${frame}</g>`
    })
    .join('')
}

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

// ---------- Words ----------

/** How the words measure at the scale the art is drawn at, in the art's pixels. */
type Type = {
  /** The art's pixels to one of the font's. */
  t: number
  /** How tall a capital stands. */
  cap: number
  /** From one line of words to the next. */
  line: number
  /** How tall the bar across the top is, and any sign: a line of capitals with room around it. */
  bar: number
  width: (text: string) => number
}

const typeAt = (scale: number): Type => {
  const t = TEXT_PIXEL / scale
  const cap = Math.ceil(CAP * t)

  return { t, cap, line: Math.ceil(LINE * t), bar: cap + 4, width: text => Math.ceil(widthOf(text) * t) }
}

type Cast = {
  type: Type
  sprite: (id: string, grid: readonly string[]) => string
  glyph: (char: string) => string
  /** The most agents drawn at a desk of their own. */
  seats: number
  /** How much the building gives up to stand inside its pane. */
  squeeze: number
  /** A piece of furniture drawn once, at its own corner, and put wherever it is wanted: a big office is the same desk many times. */
  part: (id: string, x: number, y: number, draw: () => string) => string
  /** The number an agent's parts are marked with, so that hovering any of them shows its card. */
  mark: (actor: Actor) => number
  isMarked: (actor: Actor) => boolean
  /** Where its card goes: just above this point. The last place said is where it is. */
  pin: (actor: Actor, x: number, y: number) => void
  hasCard: (actor: Actor) => boolean
}

const lettered = (text: string, cast: Cast): string => {
  let x = 0
  let drawn = ''

  for (const char of plain(text)) {
    if (GLYPHS[char] !== undefined) {
      drawn += `<use href="#${cast.glyph(char)}" x="${x}"/>`
    }

    x += acrossOf(char) + 1
  }

  return drawn
}

/** Words with their top left corner here, in the art's pixels. They are drawn finer than the art, and so scaled down into it. */
const say = (x: number, y: number, text: string, color: string, cast: Cast): string =>
  text === ''
    ? ''
    : `<g color="${color}" transform="translate(${x} ${y})${cast.type.t === 1 ? '' : ` scale(${Number(cast.type.t.toFixed(5))})`}">${lettered(text, cast)}</g>`

const hasEndedStatus = (status: BoardStatus): boolean =>
  status === 'completed' || status === 'failed' || status === 'killed' || status === 'gone'

const isWorking = (actor: Actor): boolean => !hasEndedStatus(actor.status)

const escaped = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A part of an agent that shows its card when hovered. One that has no card says the same in the surface's own tooltip. */
const hot = (actor: Actor, body: string, cast: Cast): string => {
  if (body === '') {
    return ''
  }

  const said = escaped(`${actor.label}: ${actor.thought === actor.label ? actor.words : actor.thought}`)
  const isFirst = !cast.isMarked(actor)

  // With a card, the words are there once for anyone who cannot see it. Without one, every part has them to show.
  return `<g class="h${cast.mark(actor)}">${cast.hasCard(actor) ? (isFirst ? `<desc>${said}</desc>` : '') : `<title>${said}</title>`}${body}</g>`
}

/** A thought as the board writes it: on one line, and with no dots trailing off. */
const tidy = (text: string): string => text.replace(/…|\.{2,}/g, ' ').replace(/\s+/g, ' ').trim()

const wrapped = (text: string, pixels: number): string[] =>
  text
    .split(/\s+/)
    .filter(word => word !== '')
    .reduce<string[]>((lines, word) => {
      const last = lines.at(-1)

      return last !== undefined && widthOf(`${last} ${word}`) <= pixels ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
    }, [])

const TONES: Partial<Record<BoardStatus, string>> = { failed: '#FF7A7A', waiting: '#FBF236', completed: '#99E550' }

/** Everything about one agent, shown over it while it is hovered: its whole task, what it is on, and how far along. */
const cardOf = (actor: Actor, x: number, y: number, id: number, width: number, cast: Cast): string => {
  const { type } = cast
  // Never wider than the scene it is shown over.
  const most = Math.min(CARD_PIXELS, Math.floor((width - 14) / type.t))
  const lines = [
    ...wrapped(actor.label, most).map(text => ({ text, color: '#FFFFFF' })),
    ...(actor.thought === '' || actor.thought === actor.label ? [] : wrapped(tidy(actor.thought), most).map(text => ({ text, color: '#CBDBFC' }))),
    ...wrapped(actor.words, most).map(text => ({ text, color: TONES[actor.status] ?? '#EEC39A' })),
  ]

  // An agent with no task, thought or status has nothing to show.
  if (lines.length === 0) {
    return ''
  }

  const across = Math.max(...lines.map(line => type.width(line.text))) + 10
  const down = lines.length * type.line + 5
  const left = Math.max(1, Math.min(width - across - 1, Math.round(x - across / 2)))
  const top = Math.max(1, y - down - 2)

  return (
    `<g id="c${id}" visibility="hidden" pointer-events="none" transform="translate(${left} ${top})">` +
    fill('#FFFFFF', rect(1, 0, across - 2, down) + rect(0, 1, across, down - 2)) +
    fill(INK, rect(1, 1, across - 2, down - 2)) +
    fill(tunicOf(actor), rect(2, 2, 2, down - 4)) +
    lines.map((line, i) => say(6, 3 + i * type.line, line.text, line.color, cast)).join('') +
    '</g>'
  )
}

// ---------- Bubbles ----------

type Spot = { center: number; head: number }
type Speaker = { actor: Actor; spot: Spot }
type Rect = { left: number; right: number; top: number; bottom: number }
/** Where bubbles can go: up from `base` as far as `top`, and clear of anything in `blocks`. */
type Sky = { base: number; top: number; blocks: readonly Rect[] }
type Form = { lines: string[]; note: string }
type Bubble = Speaker & Form & { width: number; height: number; x: number; top: number }

/** The whole thought in this many lines at most: as few as that width takes, and then as even as they can be. */
const linesOf = (text: string, across: number, most: number): string[] => {
  let pixels = across

  while (wrapped(text, pixels).length > most) {
    pixels += 8
  }

  const count = wrapped(text, pixels).length

  while (count > 1 && pixels > 8 && wrapped(text, pixels - 4).length === count) {
    pixels -= 4
  }

  return wrapped(text, pixels)
}

/**
 * What a bubble can say, the most first. How far along an agent is shows at its desk, so only bad news gets a line
 * of its own. Terse, it is whatever takes the least wall: a failure says only that it failed, and the rest go narrow.
 */
const formsOf = (actor: Actor, isTerse: boolean): Form[] => {
  const told = tidy(actor.thought)
  const lines = linesOf(told, LINE_PIXELS, 2)
  const note = actor.status === 'failed' || actor.status === 'waiting' ? actor.words : ''
  const forms: Form[] = []

  if (isTerse) {
    forms.push(actor.status === 'failed' && note !== '' ? { lines: [], note } : { lines: linesOf(told, TERSE_PIXELS, 3), note: '' }, { lines, note: '' })
  } else {
    forms.push({ lines, note })

    if (lines.length > 1) {
      forms.push({ lines: [told], note })
    }

    if (note !== '') {
      forms.push(actor.status === 'failed' ? { lines: [], note } : { lines: [told], note: '' })
    }
  }

  return forms.filter(form => form.lines.length > 0 || form.note !== '')
}

const touches = (one: Rect, other: Rect): boolean =>
  one.left < other.right + BUBBLE_GAP && one.right > other.left - BUBBLE_GAP && one.top < other.bottom + BUBBLE_GAP && one.bottom > other.top - BUBBLE_GAP

const boxOf = (bubble: Bubble): Rect => ({ left: bubble.x, right: bubble.x + bubble.width, top: bubble.top, bottom: bubble.top + bubble.height })

/** How a crowd of bubbles is laid out. The first way that gives everyone one is the way it is drawn. */
type Manner = {
  /** Each as far left as it can go, which leaves the most room for those still to come, rather than where it looks best. */
  isPacked: boolean
  lean: number
  isTerse: boolean
}

const MANNERS: readonly Manner[] = [
  { isPacked: false, lean: BUBBLE_LEAN, isTerse: false },
  { isPacked: true, lean: BUBBLE_LEAN, isTerse: false },
  { isPacked: true, lean: FAR_LEAN, isTerse: false },
  { isPacked: true, lean: FAR_LEAN, isTerse: true },
]

/** Where a bubble this wide can start and touch nothing level with it: the place nearest where it wants to be, or the leftmost. */
const startOf = (lowest: number, highest: number, wanted: number, isLeftmost: boolean, level: readonly Rect[], across: number): number | undefined => {
  const ruled = level.map(box => ({ from: box.left - BUBBLE_GAP - across + 1, to: box.right + BUBBLE_GAP - 1 }))
  const free = [wanted, lowest, ...ruled.flatMap(one => [one.from - 1, one.to + 1])].filter(
    x => x >= lowest && x <= highest && ruled.every(one => x < one.from || x > one.to),
  )

  if (free.length === 0) {
    return undefined
  }

  return isLeftmost ? Math.min(...free) : free.reduce((best, x) => (Math.abs(x - wanted) < Math.abs(best - wanted) ? x : best))
}

const levelWith = (boxes: readonly Rect[], top: number, bottom: number): Rect[] => boxes.filter(box => top < box.bottom + BUBBLE_GAP && bottom > box.top - BUBBLE_GAP)

/** Each bubble over its agent, as low in the sky as it can rest without touching anything. */
const arranged = (speakers: readonly Speaker[], width: number, sky: Sky, type: Type, manner: Manner): Bubble[] => {
  const bubbles: Bubble[] = []
  const urgency = (actor: Actor): number => (actor.status === 'failed' ? 0 : actor.status === 'waiting' ? 1 : 2)
  // Bad news gets its place first. The rest go left to right, which packs the most in.
  const queue = [...speakers].sort((a, b) => urgency(a.actor) - urgency(b.actor) || a.spot.center - b.spot.center)
  // How far along the wall it can sit and still reach down to its agent, and where in that it would be centered.
  const reachOf = (spot: Spot, across: number): { lowest: number; highest: number; wanted: number } => {
    const center = Math.round(spot.center)
    const lowest = Math.max(2, center - across - manner.lean)
    const highest = Math.min(width - across - 2, center + manner.lean)

    return { lowest, highest, wanted: Math.max(lowest, Math.min(highest, Math.round(spot.center - across / 2))) }
  }

  for (const { actor, spot } of queue) {
    const inTheWay = [...sky.blocks, ...bubbles.map(boxOf)]

    for (const form of formsOf(actor, manner.isTerse)) {
      const across = Math.max(type.width(form.note), ...form.lines.map(type.width)) + 8
      const down = (form.lines.length + (form.note === '' ? 0 : 1)) * type.line + 3
      const { lowest, highest, wanted } = reachOf(spot, across)
      // Where its foot can rest: the bottom of the sky, or just clear of the top of something in the way. Never lower
      // than the top of its agent, since a bubble level with its agent reads as someone else's.
      const rests = [...new Set([sky.base, spot.head - 1, ...inTheWay.map(box => box.top - BUBBLE_GAP)])]
        .filter(bottom => bottom <= sky.base && bottom < spot.head && bottom - down >= sky.top)
        .sort((a, b) => b - a)
      let found: Bubble | undefined

      for (const bottom of rests) {
        const x = startOf(lowest, highest, wanted, manner.isPacked && urgency(actor) === 2, levelWith(inTheWay, bottom - down, bottom), across)

        if (x !== undefined) {
          found = { actor, spot, ...form, width: across, height: down, x, top: bottom - down }
          break
        }
      }

      // No room for it however little it says: the agent works on without a bubble, and hovering it still says.
      if (found !== undefined) {
        bubbles.push(found)
        break
      }
    }
  }

  if (!manner.isPacked) {
    return bubbles
  }

  // Packed tight, each then moves back toward its agent as far as the others let it, the rightmost first.
  for (const bubble of [...bubbles].sort((a, b) => b.x - a.x)) {
    const { wanted } = reachOf(bubble.spot, bubble.width)
    const others = levelWith([...sky.blocks, ...bubbles.filter(one => one !== bubble).map(boxOf)], bubble.top, bubble.top + bubble.height)

    bubble.x = startOf(Math.min(bubble.x, wanted), Math.max(bubble.x, wanted), wanted, false, others, bubble.width) ?? bubble.x
  }

  return bubbles
}

/**
 * A bubble for every speaker there is room for: each where it looks best if that fits them all, else however fits the
 * most. `isEasy` says everyone got one without any of them being cut down to fit.
 */
const placedIn = (speakers: readonly Speaker[], width: number, sky: Sky, type: Type): { bubbles: Bubble[]; isEasy: boolean } => {
  let best: Bubble[] = []

  for (const manner of MANNERS) {
    const bubbles = arranged(speakers, width, sky, type, manner)

    if (bubbles.length === speakers.length) {
      return { bubbles, isEasy: !manner.isTerse }
    }

    if (bubbles.length > best.length) {
      best = bubbles
    }
  }

  return { bubbles: best, isEasy: false }
}

const placed = (speakers: readonly Speaker[], width: number, sky: Sky, type: Type): Bubble[] => placedIn(speakers, width, sky, type).bubbles

const drawBubbles = (bubbles: readonly Bubble[], cast: Cast): { tails: string; drawn: string } => {
  let tails = ''
  let drawn = ''

  bubbles.forEach(bubble => {
    const isBad = bubble.actor.status === 'failed'
    const edge = isBad ? '#AC3232' : INK
    const { top, bottom } = boxOf(bubble)
    const head = Math.round(bubble.spot.center)
    // Where the puffs meet the bubble: over the head if the bubble is, else under its nearest end.
    const foot = Math.max(bubble.x + 3, Math.min(bubble.x + bubble.width - 4, head))
    const rise = Math.max(1, bubble.spot.head - bottom - 1)
    const { line } = cast.type

    // Puffs up from its head, as a thought rises.
    for (let y = bottom + 1; y < bubble.spot.head; y += 4) {
      const column = Math.round(foot + ((head - foot) * (y - bottom - 1)) / rise)

      tails += fill(edge, rect(column - 1, y, 3, 3)) + fill('#FFFFFF', rect(column, y + 1, 1, 1))
    }

    drawn += hot(
      bubble.actor,
      at(
        bubble.x,
        top,
        fill(edge, rect(1, 0, bubble.width - 2, bubble.height) + rect(0, 1, bubble.width, bubble.height - 2)) +
          fill('#FFFFFF', rect(1, 1, bubble.width - 2, bubble.height - 2)) +
          // Its shirt's color down the side, which says whose it is when bubbles stack.
          fill(tunicOf(bubble.actor), rect(1, 1, 2, bubble.height - 2)) +
          bubble.lines.map((text, at) => say(5, 2 + at * line, text, INK, cast)).join('') +
          say(5, 2 + bubble.lines.length * line, bubble.note, isBad ? '#AC3232' : '#8A5A00', cast),
      ),
      cast,
    )
  })

  return { tails, drawn }
}

// ---------- The furniture ----------

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
const DONE = '#99E550'
const OFF = '#847E87'

/** A tick, five across and four down. */
const tickOf = (x: number, y: number, cast: Cast): string =>
  cast.part('tick', x, y, () => fill(DONE, rect(4, 0, 1, 1) + rect(3, 1, 1, 1) + rect(0, 2, 1, 1) + rect(2, 2, 1, 1) + rect(1, 3, 1, 1)))

/**
 * The strip on a partition, which says how its agent stands: filled as far as the agent says it has got, lit whole
 * where it has not said, a tick once it is done.
 */
const gaugeOf = (actor: Actor, x: number, y: number, width: number, cast: Cast): string => {
  const whole = rect(x, y, width, 3)

  if (actor.status === 'completed') {
    return tickOf(x + Math.floor((width - 5) / 2), y - 1, cast)
  }

  if (actor.status === 'killed' || actor.status === 'gone') {
    const middle = x + Math.floor((width - 3) / 2)

    return fill(DARK, whole) + fill(OFF, actor.status === 'killed' ? rect(middle, y, 3, 3) : rect(middle, y + 1, 3, 1))
  }

  const color = LIGHTS[actor.status] ?? DARK
  const isBusy = actor.status === 'running' || actor.status === 'pending'

  if (actor.percent === null) {
    return isBusy ? flipbook([fill(color, whole), fill('#C9EEF8', whole)], 0.9) : fill(color, whole)
  }

  const lit = rect(x, y, Math.max(1, Math.round((width * actor.percent) / 100)), 3)

  return fill(DARK, whole) + (actor.status === 'waiting' ? flipbook([fill(color, lit), fill('#B8A800', lit)], 0.8) : fill(color, lit))
}

/**
 * A partition, with its agent's strip on it, and along its top a band in the color of its agent's shirt: the same color
 * as the edge of its bubble, which says whose is whose when a bubble cannot sit right over its agent. An empty desk has
 * no band and a dark strip.
 */
const cubeOf = (x: number, rim: number, floor: number, width: number, actor: Actor | null, cast: Cast): string => {
  const down = floor - rim
  const panel = (): string => fill(FABRIC, rect(0, 0, width - 1, down)) + fill(FABRIC_RIM, rect(-1, -1, width, 2))

  if (actor === null) {
    return cast.part(`cube-${width}-${down}-empty`, x, rim, () => panel() + fill(DARK, rect(1, 5, width - 3, 3)))
  }

  const band = (left: number, top: number): string => fill(tunicOf(actor), rect(left + 1, top + 2, width - 3, 1))

  // A finished desk is the same as every other finished desk of its color: in a big run there are hundreds.
  return actor.status === 'completed'
    ? cast.part(`cube-${width}-${down}-done-${tunicOf(actor).slice(1)}`, x, rim, () => panel() + band(0, 0) + gaugeOf(actor, 1, 5, width - 3, cast))
    : cast.part(`cube-${width}-${down}`, x, rim, panel) + band(x, rim) + gaugeOf(actor, x + 1, rim + 5, width - 3, cast)
}

/** Someone who is in, with the top left corner of their sprite here: blinking at work, asleep when idle, a hand up when they need him. */
const personOf = (actor: Actor, left: number, y: number, cast: Cast): string => {
  if (actor.status === 'failed') {
    return `<g color="#847E87">${at(left, y, clerkSprite(actor, 'stand', 'out', cast))}</g>`
  }

  const color = tunicOf(actor)
  const open = clerkSprite(actor, 'stand', 'open', cast)
  const shut = clerkSprite(actor, 'stand', 'shut', cast)

  if (actor.status === 'idle') {
    return `<g color="${color}">${at(left, y, shut + at(11, 1, snoring()))}</g>`
  }

  const blinking = `<g color="${color}">${at(left, y, flipbook([open, open, open, shut], 2.4))}</g>`

  if (actor.status !== 'waiting') {
    return blinking
  }

  // An arm up beside its head, and a mark that blinks: it is the one state that is waiting on him.
  const arm = fill(INK, rect(left + 10, y + 1, 3, 10) + rect(left + 10, y - 1, 4, 3)) + fill('#EEC39A', rect(left + 11, y + 2, 1, 9) + rect(left + 11, y, 2, 1))
  const mark = fill(INK, rect(left - 1, y - 3, 3, 7)) + fill('#FBF236', rect(left, y - 2, 1, 3) + rect(left, y + 2, 1, 1))

  return arm + blinking + flipbook([mark, mark, ''], 0.8)
}

/** Who shows above the partition. Nobody, once they have gone home or are at the copier. */
const headOf = (actor: Actor, x: number, rim: number, width: number, cast: Cast): string => {
  if (actor.status !== 'failed' && (!isWorking(actor) || actor.atCopier)) {
    return ''
  }

  const person = personOf(actor, x - 1 + Math.floor((width - SPRITE_WIDTH - 1) / 2), rim - 11, cast)

  // Back from the copier: it shows when it has walked over.
  return isWorking(actor) && actor.wasAtCopier ? `<g visibility="hidden"><set attributeName="visibility" to="visible" begin="2s"/>${person}</g>` : person
}

/** Where the rain falls over a partition: the cloud, and under it the drops. */
const cloudOver = (x: number, rim: number, width: number): Rect => {
  const left = x + Math.floor((width - 12) / 2)

  return { left, right: left + 11, top: rim - 20, bottom: rim - 12 }
}

/** Rain indoors and a red stapler on the partition, for anyone who failed. */
const failureOf = (x: number, rim: number, width: number, cast: Cast): string =>
  cast.part('rain', cloudOver(x, rim, width).left, rim - 20, raining) + fill(RED, rect(x + width - 8, rim - 3, 6, 2)) + fill(INK, rect(x + width - 8, rim - 1, 6, 1))

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

const spotInQueue = (i: number, total: number): number => QUEUE_START + i * Math.max(4, Math.min(QUEUE_STEP, Math.floor(72 / Math.max(1, total))))

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

      cast.pin(actor, x + SPRITE_WIDTH / 2, y + 2)

      return hot(actor, `<g color="${tunicOf(actor)}" transform="translate(${isArriving ? home : x} ${y})">${isArriving ? walkOf(home, x, y) : ''}${walking}${waiting}</g>`, cast)
    })
    .join('')

/** Back at the desk from the copier: the walk there, then the head takes over. */
const returningOf = (actor: Actor, home: number, bottom: number, cast: Cast): string => {
  const y = bottom - SPRITE_HEIGHT - 1
  const run = flipbook([clerkSprite(actor, 'run1', 'open', cast), at(0, -1, clerkSprite(actor, 'run2', 'open', cast))], 0.36)

  return `<g color="${tunicOf(actor)}" transform="translate(${QUEUE_START} ${y})">${walkOf(QUEUE_START, home, y)}<g><set attributeName="visibility" to="hidden" begin="2s"/>${run}</g></g>`
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

const plateOf = (x: number, y: number, text: string, color: string, cast: Cast): string =>
  at(x, y, fill(INK, rect(0, 0, cast.type.width(text) + 4, cast.type.bar)) + say(2, 2, text, color, cast))

/** How high the boss's crown stands over the floor of its room, which is where its thought rises from. */
const BOSS_HEIGHT = 22

/** The corner office: the boss behind its desk, the pile of finished reports, and how far through its own list it is. */
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

  const { boss } = office
  const front = { left: x + 6, right: right - 4 }
  const hasGauge = boss !== null && boss.percent !== null
  const gauge = hasGauge
    ? fill(INK, rect(front.left + 2, floor - 6, 16, 4)) +
      fill(DARK, rect(front.left + 3, floor - 5, 14, 2)) +
      fill('#9BDCF0', rect(front.left + 3, floor - 5, Math.max(1, Math.round((14 * (boss?.percent ?? 0)) / 100)), 2))
    : ''
  // How many reports are in, under the pile. The word goes where there is room for it beside the boss's own bar.
  const room = front.right - 1 - (hasGauge ? front.left + 20 : front.left + 1)
  const counted = [`${reports} REPORT${reports === 1 ? '' : 'S'}`, `${reports}`].find(text => cast.type.width(text) + 4 <= room)
  const count = reports > 0 && counted !== undefined ? plateOf(front.right - 1 - cast.type.width(counted) - 4, floor - cast.type.bar, counted, '#FFFFFF', cast) : ''

  if (boss !== null) {
    cast.pin(boss, x + 14, floor - BOSS_HEIGHT)
  }

  return (
    fill(GLASS, rect(x, top, width, floor - top)) +
    fill(SKY, rect(x + 4, top + 3, width - 8, Math.max(6, floor - top - 26))) +
    at(0, 0, drifting(x - 8, right - 16, top + 5, 120, clock, `<g opacity=".9">${paint(CLOUD)}</g>`)) +
    fill('#847E87', rect(x, top, 2, floor - top)) +
    (boss === null ? '' : hot(boss, `<g color="#5B6EE1">${at(x + 8, floor - 23, cast.sprite('boss-stand', person(BOSS, 'b', 'stand', 'open')))}</g>`, cast)) +
    // A desk with a front to it, so the boss shows from the chest up with its hands on the top.
    fill('#8F563B', rect(x + 5, floor - 10, width - 8, 2)) +
    fill('#663931', rect(front.left, floor - 8, front.right - front.left, 8)) +
    fill('#FFFFFF', sheets) +
    fill('#CBDBFC', edges) +
    fill('#FFFFFF', rect(x + 21, floor - 14, 4, 4)) +
    flipbook([fill('#FFFFFF', rect(x + 22, floor - 17, 1, 2)), fill('#FFFFFF', rect(x + 23, floor - 18, 1, 2))], 1.4) +
    gauge +
    count
  )
}

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
  const { type } = cast
  const { done, working, failed } = talliesOf(office)
  const tallyOf = (words: readonly [string, string, string]): { right: string; bad: string } => {
    const right = [done > 0 || working > 0 ? `${done}${words[0]}` : '', working > 0 ? `${working}${words[1]}` : ''].filter(part => part !== '').join(' · ')

    return { right, bad: failed > 0 ? `${right === '' ? '' : ' · '}${failed}${words[2]}` : '' }
  }
  // In words where there is room for them, else the numbers alone, in their colors, else nothing.
  const { right, bad } = [tallyOf([' DONE', ' WORKING', ' FAILED']), tallyOf(['', '', ''])].find(one => type.width(`${one.right}${one.bad}`) + 8 <= width) ?? { right: '', bad: '' }
  const rightWidth = type.width(`${right}${bad}`)
  const now = office.departments.filter(department => department.state === 'now')
  const only = now.length === 1 ? now[0] : undefined
  const named = only === undefined ? (now.length > 1 ? `${now.length} RUNS AT WORK` : '') : only.id === 'team' ? '' : only.title
  const told = only !== undefined && only.detail !== '' ? `${only.title}: ${only.detail.toUpperCase()}` : named
  const left = [told, named].find(text => type.width(text) + rightWidth + 14 <= width) ?? ''

  return (
    fill(INK, rect(0, 0, width, type.bar)) +
    say(4, 2, left, '#FFFFFF', cast) +
    say(width - 4 - rightWidth, 2, right, '#EEC39A', cast) +
    say(width - 4 - type.width(bad), 2, bad, '#FF7A7A', cast)
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
const frontRowOf = (office: Office, first: number, right: number, seats: number): FrontRow => {
  const everyone = office.departments.flatMap(department => department.agents)
  const now = office.departments.filter(department => department.state === 'now').flatMap(department => department.agents)
  const span = right - first - 2
  const room = Math.min(seats, Math.floor(span / NARROWEST_CUBE))
  const wanted = [...everyone.filter(one => one.status === 'failed'), ...now.filter(isWorking), ...now.filter(one => !isWorking(one) && one.status !== 'failed').reverse()]
  const seated = [...new Set(wanted)].slice(0, room).sort((a, b) => a.seat - b.seat)
  const chosen = new Set(seated)
  const farm = everyone.filter(one => !chosen.has(one))
  const cube = Math.max(NARROWEST_CUBE, Math.min(WIDEST_CUBE, Math.floor(span / Math.max(1, seated.length))))
  const capacity = Math.max(1, Math.floor(span / cube))
  const slots = slotsOf(seated, capacity)

  return { seated, farm, cube, first, span, capacity, slotOf: actor => slots.get(actor) ?? 0 }
}

const bossRoomWidth = (width: number): number => Math.max(44, Math.min(70, Math.round(width * 0.2)))

type Line = { text: string; color: string }

/** The stages of what is running, with how many of each are done. Agents with no run have none to list, and the bar already counts them. */
const directoryLines = (office: Office, mostLines: number): Line[] => {
  const groups = new Set(office.departments.map(department => department.group))

  if (office.departments.length === 0 || (office.departments.length === 1 && office.departments[0]?.id === 'team')) {
    return []
  }

  const nameOf = (department: Department): string => (groups.size > 1 ? `${department.group}: ${department.title}` : department.title)
  const listed = groups.size > 1 ? office.departments.filter(department => department.state === 'now') : office.departments
  const kept = listed.length <= mostLines ? listed : [...listed.filter(department => department.state === 'now'), ...listed.filter(department => department.state === 'past').reverse(), ...listed.filter(department => department.state === 'next')].slice(0, mostLines)

  return kept.map(department => {
    const finished = department.agents.filter(one => !isWorking(one)).length
    const count = department.agents.length === 0 ? '' : ` ${finished}/${department.agents.length}`

    return { text: `${nameOf(department)}${count}`.toUpperCase(), color: department.state === 'now' ? '#FBF236' : department.state === 'past' ? '#EEC39A' : '#8A8FA3' }
  })
}

const directoryBox = (lines: readonly Line[], x: number, y: number, type: Type): Rect | null =>
  lines.length === 0 ? null : { left: x, right: x + Math.max(...lines.map(line => type.width(line.text))) + 4, top: y, bottom: y + lines.length * (type.cap + 2) + 2 }

/** Everything the band's layout turns on, worked out the same way to choose its scale as to draw it. */
const bandPlan = (office: Office, width: number, height: number, type: Type, seats: number) => {
  const floor = height - CARPET
  const rim = height - RIM_TO_BOTTOM
  const bossX = width - bossRoomWidth(width)
  const first = COPIER_ROOM + 2
  const row = frontRowOf(office, first, bossX, seats)
  const ceilingEnd = type.bar + 3
  const xOf = (actor: Actor): number => first + row.slotOf(actor) * row.cube
  const inLine = row.seated.filter(one => isWorking(one) && one.atCopier)
  const listed = directoryLines(office, Math.max(1, Math.floor((rim - 12 - ceilingEnd - 4) / (type.cap + 2))))
  const directory = directoryBox(listed, 2, ceilingEnd + 2, type)
  const failed = row.seated.filter(one => one.status === 'failed')
  const speakers = [
    ...row.seated
      .filter(one => isWorking(one) || one.status === 'failed')
      .map((actor): Speaker => {
        const queued = inLine.indexOf(actor)

        if (queued >= 0) {
          return { actor, spot: { center: spotInQueue(queued, inLine.length) + SPRITE_WIDTH / 2, head: height - SPRITE_HEIGHT - 2 } }
        }

        // A failure's thought rises from over its cloud, and a waiting agent's from over its mark: it must hide neither.
        return { actor, spot: { center: xOf(actor) + row.cube / 2, head: actor.status === 'failed' ? rim - 21 : actor.status === 'waiting' ? rim - 15 : rim - 9 } }
      }),
    ...(office.boss === null ? [] : [{ actor: office.boss, spot: { center: bossX + 14, head: floor - BOSS_HEIGHT - 1 } }]),
  ]
  const sky: Sky = {
    base: rim - 11,
    top: ceilingEnd + 1,
    blocks: [...(directory === null ? [] : [directory]), ...failed.map(actor => cloudOver(xOf(actor), rim, row.cube))],
  }

  return { floor, rim, bossX, first, row, ceilingEnd, xOf, inLine, listed, directory, speakers, sky, ...placedIn(speakers, width, sky, type) }
}

/** The scale the band draws at: the largest that gives everyone a whole bubble and a proper cubicle, else whichever bubbles the most. */
const bandScale = (office: Office, slot: number, seats: number): number => {
  let best = BAND_SCALES[BAND_SCALES.length - 1] ?? 2
  let most = -1

  for (const scale of BAND_SCALES) {
    const width = Math.max(NARROWEST, Math.floor(slot / scale))
    const { row, bubbles, isEasy } = bandPlan(office, width, Math.floor(BAND_PIXELS / scale), typeAt(scale), seats)
    const isRoomy = width >= 170 && row.seated.filter(one => isWorking(one) || one.status === 'failed').length * 12 <= row.span

    if (isRoomy && isEasy) {
      return scale
    }

    if (bubbles.length > most) {
      best = scale
      most = bubbles.length
    }
  }

  return best
}

const bandOf = (office: Office, width: number, height: number, clock: number, cast: Cast): string => {
  const { type } = cast
  const { floor, rim, bossX, first, row, ceilingEnd, xOf, inLine, listed, directory, bubbles } = bandPlan(office, width, height, type, cast.seats)
  const windowTop = ceilingEnd + 2
  const windowHeight = Math.max(6, Math.min(16, rim - 28 - windowTop))
  const { done } = talliesOf(office)

  for (const actor of row.seated) {
    cast.pin(actor, xOf(actor) + row.cube / 2, actor.status === 'failed' ? rim - 21 : actor.status === 'waiting' ? rim - 15 : isWorking(actor) ? rim - 10 : rim - 2)
  }

  const queue = inLine.map(actor => ({ actor, home: xOf(actor) }))
  const usedSlots = new Set(row.seated.map(row.slotOf))
  const cubes = [
    ...Array.from({ length: row.capacity }, (_, slot) => slot)
      .filter(slot => !usedSlots.has(slot))
      .map(slot => cubeOf(first + slot * row.cube, rim, floor, row.cube, null, cast)),
    ...row.seated.map(actor => hot(actor, cubeOf(xOf(actor), rim, floor, row.cube, actor, cast), cast)),
  ].join('')
  const heads = row.seated.map(actor => hot(actor, headOf(actor, xOf(actor), rim, row.cube, cast), cast)).join('')
  const failures = row.seated.map(actor => (actor.status === 'failed' ? failureOf(xOf(actor), rim, row.cube, cast) : '')).join('')
  const returning = row.seated.map(actor => (isWorking(actor) && !actor.atCopier && actor.wasAtCopier ? returningOf(actor, xOf(actor), height, cast) : '')).join('')
  const flights = row.seated
    .filter(actor => actor.isFresh && actor.status === 'completed')
    .slice(0, MOST_FLIGHTS)
    .map(actor => flightOf(xOf(actor) + 4, rim - 6, width - 16, floor - 16))
    .join('')
  const { tails, drawn } = drawBubbles(bubbles, cast)
  // The copier's own complaint, where nothing else needs the wall.
  const jam = { left: 3, right: 3 + type.width('PC LOAD LETTER') + 4, top: floor - 23 - type.bar, bottom: floor - 23 }
  const isJammed =
    queue.length === 0 &&
    office.departments.length > 0 &&
    jam.top > ceilingEnd + 2 &&
    jam.right < bossX &&
    (directory === null || !touches(jam, directory)) &&
    bubbles.every(bubble => !touches(jam, boxOf(bubble))) &&
    // Nor over anyone at a desk under it, or the cloud or mark over them.
    row.seated.every(actor => xOf(actor) > jam.right + 1 || !(isWorking(actor) || actor.status === 'failed'))

  return [
    fill(WALL, rect(0, ceilingEnd, width, floor - ceilingEnd)),
    ceilingOf(width, type.bar, 3, true),
    windowOf(first, windowTop, bossX - first - 4, windowHeight, clock),
    fill(WALL_SHADE, rect(0, rim - 3, bossX, 1)),
    farmOf(row.farm, first, bossX - 4, rim - 2, windowTop + windowHeight + 2),
    heads,
    cubes,
    carpetOf(width, floor, CARPET),
    bossRoomOf(office, bossX, ceilingEnd, floor, width - 1, done, clock, cast),
    copierOf(floor),
    failures,
    isJammed ? plateOf(jam.left, jam.top, 'PC LOAD LETTER', '#99E550', cast) : '',
    directory === null
      ? ''
      : at(directory.left, directory.top, fill(INK, rect(0, 0, directory.right - directory.left, directory.bottom - directory.top)) + listed.map((line, i) => say(2, 2 + i * (type.cap + 2), line.text, line.color, cast)).join('')),
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
// A desk, its agent behind it and a screen on it.
const STATION = 27
// From the floor a desk stands on to the top of its agent's head.
const STATION_HEIGHT = 15
// The strip of carpet a row of desks behind the front one stands on.
const ROW_FLOOR = 3

/** What the screen on a desk shows: the same as a partition's strip, with room to draw it. Nine across and six down. */
const screenOf = (actor: Actor, x: number, y: number, cast: Cast): string => {
  const lit = (color: string): string => fill(color, rect(0, 0, 9, 6))
  const screen = (kind: string, draw: () => string): string => cast.part(`screen-${kind}`, x, y, draw)

  if (actor.status === 'completed') {
    return screen('off', () => lit('#323C39')) + tickOf(x + 2, y + 1, cast)
  }

  if (actor.status === 'killed') {
    return screen('stopped', () => lit('#323C39') + fill(OFF, rect(3, 2, 3, 2)))
  }

  if (actor.status === 'gone') {
    return screen('off', () => lit('#323C39'))
  }

  if (actor.status === 'failed') {
    return screen('failed', () => lit(RED) + fill('#FFFFFF', rect(3, 1, 1, 1) + rect(5, 1, 1, 1) + rect(4, 2, 1, 1) + rect(3, 3, 1, 1) + rect(5, 3, 1, 1)))
  }

  if (actor.status === 'waiting') {
    return screen('waiting', () => {
      const mark = fill(INK, rect(4, 1, 1, 2) + rect(4, 4, 1, 1))

      return flipbook([lit('#FBF236') + mark, lit('#B8A800') + mark], 0.8)
    })
  }

  if (actor.status === 'idle') {
    return screen('idle', () => lit('#323C39') + fill('#DF7126', rect(7, 4, 1, 1)))
  }

  // At work: lines of something scrolling by, and under them how far it says it has got.
  if (actor.percent === null) {
    return screen('busy', () => lit('#3F3F74') + flipbook([fill('#CBDBFC', rect(1, 1, 4, 1) + rect(1, 3, 6, 1)), fill('#CBDBFC', rect(1, 1, 6, 1) + rect(1, 3, 3, 1))], 0.6))
  }

  return (
    screen('counting', () => lit('#3F3F74') + flipbook([fill('#CBDBFC', rect(1, 1, 4, 1)), fill('#CBDBFC', rect(1, 1, 6, 1))], 0.6) + fill(INK, rect(0, 3, 9, 3))) +
    fill('#9BDCF0', rect(x, y + 4, Math.max(1, Math.round((9 * actor.percent) / 100)), 2))
  )
}

/** One desk: the agent behind it if it is in, its chair if it is not, and the screen that says how it stands. */
const stationOf = (actor: Actor, x: number, ground: number, cast: Cast): string => {
  const isFailed = actor.status === 'failed'
  const isIn = isFailed || (isWorking(actor) && !actor.atCopier)
  // Its chair, which shows once it has got up: a back, a seat, and a foot under the desk.
  const chair = (left: number, floor: number): string =>
    cast.part(
      'chair',
      left,
      floor,
      () => fill('#45283C', rect(5, -11, 6, 5) + rect(7, -6, 2, 1) + rect(4, -5, 8, 1) + rect(7, -2, 2, 1) + rect(5, -1, 6, 1)) + fill('#663931', rect(6, -10, 4, 3)),
    )
  const desk = (left: number, floor: number): string =>
    cast.part(
      'desk',
      left,
      floor,
      () => fill('#D9A066', rect(0, -3, STATION - 1, 1)) + fill('#8F563B', rect(0, -2, 1, 2) + rect(STATION - 2, -2, 1, 2)) + fill(INK, rect(14, -12, 11, 8) + rect(18, -4, 3, 1)),
    )

  cast.pin(actor, x + 7, isIn ? ground - 14 : ground - 12)

  // A finished desk is the same as every other finished desk: in a big run there are hundreds.
  if (actor.status === 'completed') {
    return hot(actor, cast.part('desk-done', x, ground, () => chair(0, 0) + desk(0, 0) + screenOf(actor, 15, -11, cast)), cast)
  }

  return hot(
    actor,
    chair(x, ground) +
      (isIn ? personOf(actor, x + 1, ground - SPRITE_HEIGHT, cast) : '') +
      desk(x, ground) +
      screenOf(actor, x + 15, ground - 11, cast) +
      // Rain indoors, on the screen that says why, and the red stapler on top of it.
      (isFailed ? cast.part('rain', x + 14, ground - 23, raining) + fill(RED, rect(x + 17, ground - 14, 6, 1)) + fill(INK, rect(x + 17, ground - 13, 6, 1)) : ''),
    cast,
  )
}

/** As many whole words of the text as fit in this many of the art's pixels. */
const fitted = (text: string, room: number, type: Type): string => {
  const words = text.split(' ')

  while (words.length > 1 && type.width(words.join(' ')) > room) {
    words.pop()
  }

  return words.join(' ')
}

/** A short list on the wall: a line for each of these agents. */
const listOf = (agents: readonly Actor[], x: number, y: number, width: number, mostLines: number, cast: Cast): { body: string; height: number } => {
  if (agents.length === 0 || mostLines < 1) {
    return { body: '', height: 0 }
  }

  const { type } = cast
  const lines = agents.length <= mostLines ? agents : agents.slice(0, mostLines - 1)
  const rest = agents.length - lines.length
  const height = (lines.length + (rest > 0 ? 1 : 0)) * type.line + 4
  const writing = lines
    .map((actor, i) => {
      const said = tidy(actor.thought === actor.label || actor.thought === '' ? actor.label : actor.thought)
      const text = actor.words !== '' && type.width(`${said} · ${actor.words}`) < width - 12 ? `${said} · ${actor.words}` : fitted(said, width - 12, type)

      cast.pin(actor, x + Math.min(width, type.width(text) + 12) / 2, y + 2 + i * type.line)

      return hot(
        actor,
        fill(actor.status === 'failed' ? RED : tunicOf(actor), rect(3, 3 + i * type.line, 4, type.cap - 1)) + say(9, 3 + i * type.line, text, actor.status === 'failed' ? '#AC3232' : INK, cast),
        cast,
      )
    })
    .join('')

  return {
    height,
    body: at(
      x,
      y,
      fill('#847E87', rect(0, 0, width, height)) + fill('#F4F3EC', rect(1, 1, width - 2, height - 2)) + writing + (rest > 0 ? say(9, 3 + lines.length * type.line, `+${rest} more`, '#595652', cast) : ''),
    ),
  }
}

/** The sign and what is under the ceiling, down to where a floor's desks can start. */
const headerOf = (type: Type): number => 4 + type.bar + 3

/** From one row of desks to the one behind it: the desks, a line of bubbles over them, and the strip they stand on. */
const rowPitch = (type: Type): number => type.line + 7 + STATION_HEIGHT + ROW_FLOOR

// The carpet in front of a floor's desks, deep enough for the line at the copier to stand clear of them.
const FRONT = 15

const seatsAcross = (width: number): number => Math.max(1, Math.floor((width - COPIER_ROOM - 4) / STATION))

const OPEN_PLAN: Department = { id: 'team', group: '', title: 'OPEN PLAN', detail: '', state: 'next', agents: [], says: '' }

type Plan = {
  department: Department
  height: number
  /** Rows of desks, for a stage that is under way. */
  rows: number
  /** From one row of desks to the one behind it, which past what the desks need is room for their bubbles. */
  pitch: number
  /** How deep the strip of tiny cubicles under its sign is: nothing, if everyone has a desk. */
  farm: number
  /** How deep the carpet in front of its desks is. */
  front: number
  seated: Actor[]
  /** Those it has no desk for, who go in the tiny cubicles. */
  behind: Actor[]
}

type Tower = {
  plans: Plan[]
  lobby: number
  /** Everyone under way has a desk, with nothing given up. This is what the scale is chosen by. */
  isWhole: boolean
  /** Its floors all stand inside the pane. */
  fits: boolean
}

// How much a building too tall for its pane gives up, the least first: what its finished stages show, then the stages
// themselves but the last, then the room over its desks for bubbles.
const MOST_SQUEEZE = 3
const MOST_FARM_ROWS = 12

const pastHeight = (one: Department, width: number, type: Type): number => {
  const rows = Math.ceil(one.agents.filter(agent => agent.status !== 'failed').length / Math.max(1, Math.floor((width - 8) / 4)))
  const failed = Math.min(2, one.agents.filter(agent => agent.status === 'failed').length)

  return Math.min(60, headerOf(type) + rows * 3 + 2 + (failed > 0 ? failed * type.line + 6 : 0))
}

/** How deep a strip of tiny cubicles has to be for this many, three pixels to a row. */
const farmDepth = (count: number, width: number): number =>
  count <= 0 ? 0 : Math.min(MOST_FARM_ROWS, Math.ceil(count / Math.max(1, Math.floor((width - COPIER_ROOM - 6) / 3)))) * 3 + 2

/**
 * How the building is cut into floors: a stage under way gets as many rows of desks as it has agents for, and what
 * is left over goes to its walls. `seats` is the most desks the drawing has room for in all, and `squeeze` how much
 * the building gives up to stand inside its pane.
 */
const towerPlan = (office: Office, width: number, height: number, type: Type, seats: number, squeeze: number): Tower => {
  const all: readonly Department[] = office.departments.length > 0 ? office.departments : [OPEN_PLAN]
  const header = headerOf(type)
  const lastPast = all.findLast(one => one.state === 'past')
  // How tall a floor with nobody at work on it stands. Nothing, once it is squeezed out.
  const stillOf = (one: Department): number => {
    if (one.state === 'past') {
      return squeeze === 0 ? pastHeight(one, width, type) : squeeze === 1 || (squeeze === 2 && one === lastPast) ? header : 0
    }

    return squeeze < 2 ? header : 0
  }
  const shown = all.filter(one => one.state === 'now' || stillOf(one) > 0)
  const perRow = seatsAcross(width)
  // Squeezed all the way, the rows stand as close as desks can, and only the back row has a wall for bubbles.
  const pitch = squeeze >= MOST_SQUEEZE ? STATION_HEIGHT + ROW_FLOOR + 2 : rowPitch(type)
  // And the line at the copier stands in among the desks.
  const front = squeeze >= MOST_SQUEEZE ? CARPET : FRONT
  const live = shown.filter(one => one.state === 'now')
  const still = shown.reduce((sum, one) => sum + (one.state === 'now' ? 0 : stillOf(one)), 0)
  // The desks each floor under way may have: one for each agent, up to its share of what the drawing has room for.
  const share = Math.max(1, Math.floor(seats / Math.max(1, live.length)))
  const desks = live.map(one => Math.min(one.agents.length, share))
  const wanted = desks.map(count => Math.max(1, Math.ceil(count / perRow)))
  const room = height - type.bar - BOSS_FLOOR
  const total = (rows: readonly number[]): number => rows.reduce((sum, count) => sum + count, 0)
  const farmFor = (i: number, count: number): number => farmDepth((live[i]?.agents.length ?? 0) - Math.min(desks[i] ?? 0, count * perRow), width)
  const needOf = (rows: readonly number[]): number =>
    still + live.length * (header - ROW_FLOOR + front) + total(rows) * pitch + rows.reduce((sum, count, i) => sum + farmFor(i, count), 0)
  const rows = [...wanted]
  // A pane too short for it all loses the entrance before it loses a desk.
  const lobby = needOf(rows) + LOBBY <= room ? LOBBY : 0

  while (needOf(rows) + lobby > room && rows.some(count => count > 1)) {
    const widest = rows.indexOf(Math.max(...rows))

    rows[widest] = (rows[widest] ?? 1) - 1
  }

  const used = needOf(rows)
  const fits = used + lobby <= room
  const spare = Math.max(0, room - lobby - used)
  const shares = live.length > 0 ? live.length : shown.length

  return {
    lobby,
    fits,
    isWhole: squeeze === 0 && fits && lobby === LOBBY && rows.every((count, i) => count === wanted[i]) && desks.every((count, i) => count === live[i]?.agents.length),
    plans: shown.map(department => {
      const i = live.indexOf(department)
      const extra = (live.length === 0 || i >= 0) && shares > 0 ? Math.floor(spare / shares) : 0

      if (i < 0) {
        return { department, height: stillOf(department) + extra, rows: 0, pitch: 0, farm: 0, front: 0, seated: [], behind: [] }
      }

      const count = rows[i] ?? 1
      const bad = department.agents.filter(one => one.status === 'failed')
      const working = department.agents.filter(isWorking)
      const finished = department.agents.filter(one => !isWorking(one) && one.status !== 'failed')
      const seated = [...bad, ...working.filter(one => one.status === 'waiting'), ...working.filter(one => one.status !== 'waiting'), ...finished.slice().reverse()]
        .slice(0, Math.min(desks[i] ?? 0, count * perRow))
        .sort((one, other) => one.seat - other.seat)
      const chosen = new Set(seated)
      const farm = farmFor(i, count)

      return {
        department,
        height: header - ROW_FLOOR + front + count * pitch + farm + extra,
        rows: count,
        // What is spare goes to the rows first, up to two more lines of bubbles over each, and the rest to the wall.
        pitch: pitch + Math.min(2 * (type.line + 3 + BUBBLE_GAP), Math.floor(extra / count)),
        farm,
        front,
        seated,
        behind: department.agents.filter(one => !chosen.has(one)),
      }
    }),
  }
}

const signOf = (department: Department): string => {
  const count = department.agents.length === 0 ? '' : ` ${department.agents.filter(one => !isWorking(one)).length}/${department.agents.length}`

  return `${department.id === 'team' && department.agents.length > 0 ? 'AGENTS' : department.title}${count}`
}

/** Where everything on a floor under way stands, and who gets a bubble: worked out the same way to choose the scale as to draw it. */
const liveLayout = (plan: Plan, y: number, width: number, type: Type, isUsual: boolean) => {
  const { seated, rows } = plan
  const perRow = seatsAcross(width)
  const { pitch } = plan
  const first = COPIER_ROOM + 2
  const bottom = y + plan.height
  const ground = bottom - plan.front
  const groundOf = (row: number): number => ground - row * pitch
  // Whose thought it is and how it stands is all a bubble's place turns on once the thought is the usual one.
  const speaking = (actor: Actor): Actor => (isUsual ? { ...actor, thought: USUAL_THOUGHT } : actor)
  const seats = new Map(seated.map((actor, i) => [actor, { x: first + (i % perRow) * STATION, row: Math.floor(i / perRow) }]))
  const seatOf = (actor: Actor): { x: number; row: number } => seats.get(actor) ?? { x: first, row: 0 }
  const wallTop = y + headerOf(type) + plan.farm
  const skyBase = (row: number): number => groundOf(row) - STATION_HEIGHT - 2
  const inLine = seated.filter(one => isWorking(one) && one.atCopier)
  const talk = Array.from({ length: rows }, (_, row) => {
    const here = seated.filter(one => seatOf(one).row === row)
    const at = groundOf(row)
    const speakers = [
      ...here
        .filter(one => one.status === 'failed' || (isWorking(one) && !one.atCopier))
        // A waiting agent's thought rises from over its mark, which it must not hide.
        .map((actor): Speaker => ({ actor: speaking(actor), spot: { center: seatOf(actor).x + 7, head: at - STATION_HEIGHT + (actor.status === 'waiting' ? -5 : 1) } })),
      ...(row === 0 ? inLine.map((actor, i): Speaker => ({ actor: speaking(actor), spot: { center: spotInQueue(i, inLine.length) + SPRITE_WIDTH / 2, head: bottom - SPRITE_HEIGHT - 2 } })) : []),
    ]
    const sky: Sky = {
      base: skyBase(row),
      top: row === rows - 1 ? wallTop + 1 : groundOf(row + 1) + ROW_FLOOR + 1,
      // The rain over a failure's screen.
      blocks: here.filter(one => one.status === 'failed').map(actor => ({ left: seatOf(actor).x + 14, right: seatOf(actor).x + 25, top: at - 23, bottom: at - 15 })),
    }

    return { here, at, speakers, ...placedIn(speakers, width, sky, type) }
  })

  return { perRow, first, bottom, ground, groundOf, seatOf, wallTop, skyBase, inLine, talk }
}

/** A stage under way: its agents at their desks, as many rows of them as it takes, with their thoughts over them. */
const liveFloorOf = (plan: Plan, y: number, width: number, pile: { x: number; y: number }, clock: number, cast: Cast): { body: string; flights: string } => {
  const { department, seated, behind, rows } = plan
  const { type } = cast
  const { perRow, first, bottom, ground, groundOf, seatOf, wallTop, skyBase, inLine, talk } = liveLayout(plan, y, width, type, false)
  const name = signOf(department)
  const signEnd = 2 + type.width(name) + 4
  const detail = department.detail.toUpperCase()
  const detailFits = detail !== '' && signEnd + 2 + type.width(detail) + 4 < width - 2
  // The wall over the back row, above its first line of bubbles: where a window goes when there is one to spare.
  const wall = skyBase(rows - 1) - type.line - 5 - wallTop
  let body = ''
  let tails = ''
  let said = ''

  for (const { here, at, bubbles } of [...talk].reverse()) {
    if (at !== ground) {
      body += fill(CARPET_EDGE, rect(first - 2, at, width - first, 1)) + fill(CARPET_COLOR, rect(first - 2, at + 1, width - first, ROW_FLOOR - 1))
    }

    body += here.map(actor => stationOf(actor, seatOf(actor).x, at, cast)).join('')

    const drawn = drawBubbles(bubbles, cast)

    tails += drawn.tails
    said += drawn.drawn
  }

  const inFront = Math.min(seated.length, perRow)
  const flights = seated
    .filter(actor => actor.isFresh && actor.status === 'completed')
    .slice(0, MOST_FLIGHTS)
    .map(actor => flightOf(seatOf(actor).x + 4, groundOf(seatOf(actor).row) - 12, pile.x, pile.y))
    .join('')

  return {
    flights,
    body:
      fill(WALL, rect(0, y, width, plan.height)) +
      ceilingOf(width, y, 3, true) +
      fill(CARPET_EDGE, rect(0, bottom - 1, width, 1)) +
      (wall >= 12
        ? windowOf(first, wallTop + 3, width - first - 4, Math.min(26, wall - 4), clock)
        : windowOf(signEnd + 4, y + 5, Math.max(6, width - signEnd - 8), type.bar - 2, clock)) +
      plateOf(2, y + 4, name, '#FBF236', cast) +
      (detailFits ? plateOf(signEnd + 2, y + 4, detail, '#FFFFFF', cast) : '') +
      farmOf(behind, first, width - 4, wallTop - 1, y + headerOf(type)) +
      carpetOf(width, ground, plan.front) +
      body +
      // Something green where a desk would be, if the front row has the room.
      (inFront < perRow ? at(first + inFront * STATION + 9, ground - 9, cast.sprite('plant', PLANT)) : '') +
      copierOf(ground) +
      queueOf(inLine.map(actor => ({ actor: { ...actor, wasAtCopier: true }, home: seatOf(actor).x })), bottom, cast) +
      tails +
      said,
  }
}

/** A stage that is over, or has yet to start: a strip with its sign, the lights off, and a mark for each agent it had. */
const stillFloorOf = (plan: Plan, y: number, width: number, cast: Cast): string => {
  const { department, height } = plan
  const isPast = department.state === 'past'
  const top = y + headerOf(cast.type) - 1
  // Squeezed down to its sign, it has no wall to show anything on.
  const hasWall = isPast && height > headerOf(cast.type)
  const board = hasWall ? listOf(department.agents.filter(one => one.status === 'failed'), 2, top, width - 4, 2, cast) : { body: '', height: 0 }

  return (
    fill(isPast ? '#9E9987' : '#5F5C52', rect(0, y, width, height)) +
    ceilingOf(width, y, 3, false) +
    fill(CARPET_EDGE, rect(0, y + height - 1, width, 1)) +
    plateOf(2, y + 4, signOf(department), isPast ? '#EEC39A' : '#8A8FA3', cast) +
    (hasWall ? farmOf(department.agents.filter(one => one.status !== 'failed'), 4, width - 4, y + height - 2, top + board.height + 1) : '') +
    board.body
  )
}

/** The boss thinks out over its own floor, which has the wall for it. */
const bossThought = (boss: Actor | null, width: number, type: Type): { bubbles: Bubble[]; isEasy: boolean } => {
  const floor = type.bar + BOSS_FLOOR - 1

  return boss === null
    ? { bubbles: [], isEasy: true }
    : placedIn([{ actor: boss, spot: { center: Math.round(width * 0.45) + 14, head: floor - BOSS_HEIGHT - 1 } }], width, { base: floor - BOSS_HEIGHT - 2, top: type.bar + 4, blocks: [] }, type)
}

const towerOf = (office: Office, width: number, height: number, clock: number, cast: Cast): string => {
  const { type } = cast
  const { done } = talliesOf(office)
  const { plans, lobby } = towerPlan(office, width, height, type, cast.seats, cast.squeeze)
  const bossX = Math.round(width * 0.45)
  const bossFloor = type.bar + BOSS_FLOOR - 1
  const pile = { x: width - 18, y: bossFloor - 25 }
  const lobbyTop = height - lobby
  const middle = Math.round(width / 2)
  let y = type.bar + BOSS_FLOOR
  let floors = ''
  let flights = ''

  for (const plan of plans) {
    if (plan.department.state === 'now') {
      const live = liveFloorOf(plan, y, width, pile, clock, cast)

      floors += live.body
      flights += live.flights
    } else {
      floors += stillFloorOf(plan, y, width, cast)
    }

    y += plan.height
  }

  const thought = drawBubbles(bossThought(office.boss, width, type).bubbles, cast)

  return [
    fill(WALL, rect(0, type.bar, width, height - type.bar)),
    ceilingOf(width, type.bar, 3, true),
    bossRoomOf(office, bossX, type.bar + 3, bossFloor, width, done, clock, cast),
    fill(CARPET_EDGE, rect(0, bossFloor, width, 1)),
    thought.tails,
    thought.drawn,
    floors,
    // The lobby, under it all. Whatever room the floors left goes to the entrance.
    fill(WALL_SHADE, rect(0, y, width, Math.max(0, lobbyTop - y))),
    lobby === 0
      ? ''
      : fill('#8F563B', rect(0, lobbyTop, width, lobby)) +
        fill('#663931', rect(0, lobbyTop, width, 1)) +
        fill(INK, rect(middle - 9, lobbyTop + 2, 18, lobby - 2)) +
        fill(GLASS, rect(middle - 8, lobbyTop + 3, 7, lobby - 3) + rect(middle + 1, lobbyTop + 3, 7, lobby - 3)) +
        at(7, lobbyTop + 5, cast.sprite('plant', PLANT)),
    flights,
    office.isParty ? at(width - 12, bossFloor - 27, confetti()) : '',
    hudOf(office, width, cast),
  ].join('')
}

// A thought of the usual length. It stands in for everyone's when choosing how close to draw the building, so the view
// does not jump each time someone thinks something longer: it changes only when agents come, go or change how they stand.
const USUAL_THOUGHT = 'Reading the session'
// The art is never drawn shorter than this.
const SHORTEST = 120

/**
 * How well the building holds everyone at a size: 3 with a desk for all and a whole bubble for all, 2 with bubbles
 * cut down to fit, 1 with desks but not a bubble each, and 0 without a desk for all.
 */
const towerFit = (office: Office, width: number, height: number, type: Type, seats: number): number => {
  const { plans, isWhole } = towerPlan(office, width, height, type, seats, 0)

  if (!isWhole) {
    return 0
  }

  const boss = bossThought(office.boss === null ? null : { ...office.boss, thought: USUAL_THOUGHT }, width, type)
  let y = type.bar + BOSS_FLOOR
  let isTold = office.boss === null || boss.bubbles.length === 1
  let { isEasy } = boss

  for (const plan of plans) {
    if (plan.department.state === 'now') {
      for (const row of liveLayout(plan, y, width, type, true).talk) {
        isTold = isTold && row.bubbles.length === row.speakers.length
        isEasy = isEasy && row.isEasy
      }
    }

    y += plan.height
  }

  return isTold ? (isEasy ? 3 : 2) : 1
}

/**
 * How the building is drawn: at the largest scale that gives everyone under way a desk and a bubble, or one step
 * further out if that lets every bubble say all it would; else the largest that gives everyone a desk. With no scale
 * that seats everyone, it is the furthest view, giving up only as much as lets its floors stand inside the pane.
 */
const towerView = (office: Office, slot: number, pixels: number, seats: number): { scale: number; squeeze: number } => {
  const least = TOWER_SCALES[TOWER_SCALES.length - 1] ?? 2
  const sizeAt = (scale: number): { width: number; height: number } => ({ width: Math.max(NARROWEST, Math.floor(slot / scale)), height: Math.max(SHORTEST, Math.floor(pixels / scale)) })
  // A scale the pane is too small for would be drawn larger than the pane.
  const fits = TOWER_SCALES.filter(scale => Math.floor(slot / scale) >= NARROWEST && Math.floor(pixels / scale) >= SHORTEST).map(scale => ({
    scale,
    fit: towerFit(office, sizeAt(scale).width, sizeAt(scale).height, typeAt(scale), seats),
  }))
  const told = fits.findIndex(one => one.fit >= 2)
  const best = told >= 0 ? (fits[told]?.fit !== 3 && fits[told + 1]?.fit === 3 ? fits[told + 1] : fits[told]) : fits.find(one => one.fit === 1)

  if (best !== undefined) {
    return { scale: best.scale, squeeze: 0 }
  }

  const { width, height } = sizeAt(least)
  const squeezes = Array.from({ length: MOST_SQUEEZE + 1 }, (_, squeeze) => squeeze)

  return { scale: least, squeeze: squeezes.find(squeeze => towerPlan(office, width, height, typeAt(least), seats, squeeze).fits) ?? MOST_SQUEEZE }
}

/** What a drawing gives up to be small enough for a surface to take. */
type Limits = {
  /** Agents whose cards are left out. They say it in the surface's own tooltip instead. */
  cardless: ReadonlySet<string>
  /** The most agents drawn at a desk of their own. The rest go in the tiny cubicles. */
  seats: number
}

type Drawing = { source: string; width: number; height: number; cards: { id: string; size: number; urgency: number }[]; seated: number }

const drawnOf = (office: Office, stage: Stage, { cardless, seats }: Limits): Drawing => {
  const slot = stage.columns * CELL_WIDTH
  const pixels = (stage.rows ?? 0) * CELL_HEIGHT
  const { scale, squeeze } = stage.rows === undefined ? { scale: bandScale(office, slot, seats), squeeze: 0 } : towerView(office, slot, pixels, seats)
  const defs = new Map<string, string>()
  const marks = new Map<string, number>()
  const pins = new Map<string, { actor: Actor; x: number; y: number }>()
  const cast: Cast = {
    type: typeAt(scale),
    seats,
    squeeze,
    sprite: (id, grid) => {
      if (!defs.has(id)) {
        defs.set(id, `<g id="${id}">${paint(grid)}</g>`)
      }

      return `<use href="#${id}"/>`
    },
    glyph: char => {
      const id = `g${char.codePointAt(0)}`

      if (!defs.has(id)) {
        const d = (GLYPHS[char] ?? []).map((row, y) => [...row.matchAll(/#+/g)].map(run => rect(run.index ?? 0, y, run[0].length, 1)).join('')).join('')

        defs.set(id, `<path id="${id}" fill="currentColor" d="${d}"/>`)
      }

      return id
    },
    part: (id, x, y, draw) => {
      if (!defs.has(id)) {
        defs.set(id, `<g id="${id}">${draw()}</g>`)
      }

      return `<use href="#${id}" x="${x}" y="${y}"/>`
    },
    mark: actor => {
      const known = marks.get(actor.id) ?? marks.size

      marks.set(actor.id, known)

      return known
    },
    isMarked: actor => marks.has(actor.id),
    pin: (actor, x, y) => {
      pins.set(actor.id, { actor, x: Math.round(x), y: Math.round(y) })
    },
    hasCard: actor => !cardless.has(actor.id),
  }
  const width = Math.max(NARROWEST, Math.floor(slot / scale))
  const height = stage.rows === undefined ? Math.floor(BAND_PIXELS / scale) : Math.max(SHORTEST, Math.floor(pixels / scale))
  const body = stage.rows === undefined ? bandOf(office, width, height, stage.clock, cast) : towerOf(office, width, height, stage.clock, cast)
  const carded = [...pins.values()]
    .filter(pin => cast.hasCard(pin.actor) && marks.has(pin.actor.id))
    .map(pin => ({ pin, card: cardOf(pin.actor, pin.x, pin.y, cast.mark(pin.actor), width, cast) }))
    .filter(one => one.card !== '')
  const shown = carded.map(one => one.pin)
  const drawnCards = carded.map(one => one.card)
  const rules = shown.map(pin => `svg:has(.h${cast.mark(pin.actor)}:hover) #c${cast.mark(pin.actor)}{visibility:visible}`)
  const edge = rect(1, 0, width - 2, 1) + rect(1, height - 1, width - 2, 1) + rect(0, 1, 1, height - 2) + rect(width - 1, 1, 1, height - 2)
  const notched = `M1 0H${width - 1}V1H${width}V${height - 1}H${width - 1}V${height}H1V${height - 1}H0V1H1Z`
  // The narrowest scene can be wider than its slot, and it shrinks to fit rather than run off the edge.
  const fit = Math.min(1, slot / (width * scale), MOST_PIXELS / (Math.max(width, height) * scale))
  const drawnWidth = Math.floor(width * scale * fit)
  const drawnHeight = Math.floor(height * scale * fit)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${drawnWidth}" height="${drawnHeight}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `<defs><clipPath id="screen"><path d="${notched}"/></clipPath>${[...defs.values()].join('')}</defs>` +
    (rules.length === 0 ? '' : `<style>${rules.join('')}</style>`) +
    `<g clip-path="url(#screen)">${body}${fill(INK, edge)}<g id="cards">${drawnCards.join('')}</g></g></svg>`

  return {
    source,
    width: drawnWidth,
    height: drawnHeight,
    seated: marks.size,
    cards: shown.map((pin, i) => ({
      id: pin.actor.id,
      size: (drawnCards[i]?.length ?? 0) + (rules[i]?.length ?? 0),
      urgency: pin.actor.status === 'failed' ? 0 : pin.actor.status === 'waiting' ? 1 : isWorking(pin.actor) ? 2 : 3,
    })),
  }
}

/**
 * The office, all of it: one SVG document, and the size in pixels to give its frame, which is 300 by 150 when given none.
 *
 * A drawing too big for a surface to take gives things up until it is not: first the cards, those of the agents that
 * least need looking at before the rest, and then desks, with everyone past them going in the tiny cubicles.
 */
export const sceneOf = (office: Office, stage: Stage): { source: string; width: number; height: number } => {
  let limits: Limits = { cardless: new Set(), seats: office.departments.reduce((sum, one) => sum + one.agents.length, 0) }
  let drawing = drawnOf(office, stage, limits)

  for (let pass = 0; pass < 8 && drawing.source.length > SOURCE_ROOM; pass += 1) {
    if (drawing.cards.length > 0) {
      const cardless = new Set(limits.cardless)
      let over = drawing.source.length - SOURCE_ROOM

      for (const card of [...drawing.cards].sort((one, other) => other.urgency - one.urgency)) {
        if (over <= 0) {
          break
        }

        cardless.add(card.id)
        // Less than its whole size comes off: each of its parts now carries the words a tooltip shows.
        over -= card.size * 0.9
      }

      limits = { ...limits, cardless }
    } else if (drawing.seated > FEWEST_SEATS) {
      limits = { ...limits, seats: Math.max(FEWEST_SEATS, Math.floor(Math.min(limits.seats, drawing.seated) * (SOURCE_ROOM / drawing.source.length) * 0.85)) }
    } else {
      break
    }

    drawing = drawnOf(office, stage, limits)
  }

  return { source: drawing.source, width: drawing.width, height: drawing.height }
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
