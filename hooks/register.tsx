import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { BoardAgent, BoardStatus, PlanStep } from '../types'

import { altOf, campfire, sceneOf } from './scene'
import type { Actor } from './scene'

const POLL_MS = 2000
const MINUTE_MS = 60_000
const NOW_MS = 15_000
// The main agent's steps come fast, and each new thought redraws the scene: no more than this often.
const THOUGHT_MS = 8000
// The longest thought a bubble is given.
const BRIEF_CHARS = 40
// Rows under the summary, the `+n more` row included.
const MAX_ROWS = 4

const PANE = 'agent-board'
// The main agent has no id in the engine's list, so the board keeps it under this one.
const MAIN = 'main'
// Its task list, which is where its percent comes from.
const PLAN_TOOLS = new Set(['mcp__ccd_turn__update_plan', 'TodoWrite'])
// Housekeeping, which is nothing it would say it was doing.
const QUIET = /^mcp__ccd_turn__|^ToolSearch$|mark_chapter$|^TodoWrite$/
const PROGRESS_TOOL = 'mcp__agent-board__progress'
// The engine knows nothing of how far along an agent is, so each agent is asked to say.
const PROGRESS_ASK = `

Progress: if a tool named ${PROGRESS_TOOL} is available to you, call it before your first step with done 0, total set to how many steps you expect, and doing set to what you are about to do in four words or fewer. Call it again each time you finish a step, alongside your next tool call, and once more with done equal to total just before your final reply. Raise total if the work grows. Leave this out of your report.`

// Change the tag when an agent's fields change: it declines what an earlier version stored.
const agents = atom({ plugin: 'agent-board', key: 'agents' } as const, [], { shape: 'agents-4' })
// The time durations are read against. The board shows whole minutes, so this moves only often
// enough to keep them right, and the band is not redrawn at every poll.
const now = atom({ plugin: 'agent-board', key: 'now' } as const, 0)
const steps = atom({ plugin: 'agent-board', key: 'steps' } as const, {})
const isExpanded = atom({ plugin: 'agent-board', key: 'isExpanded' } as const, false)
const plan = atom({ plugin: 'agent-board', key: 'plan' } as const, [])

type Look = { glyph: string; word: string; color?: 'claude' | 'warning' | 'success' | 'error' }

const LOOK: Record<BoardStatus, Look> = {
  failed: { glyph: '✕', word: 'Failed', color: 'error' },
  waiting: { glyph: '◐', word: 'Waiting', color: 'warning' },
  running: { glyph: '●', word: 'Working', color: 'claude' },
  pending: { glyph: '●', word: 'Starting', color: 'claude' },
  idle: { glyph: '○', word: 'Idle' },
  completed: { glyph: '✓', word: 'Done', color: 'success' },
  killed: { glyph: '■', word: 'Stopped' },
  gone: { glyph: '–', word: 'Ended' },
}

// Worst news first: the board's order, and the summary's.
const ORDER: BoardStatus[] = ['failed', 'waiting', 'running', 'pending', 'idle', 'completed', 'killed', 'gone']

// The prompts that are his own. A notification, another session's message or a schedule is not him moving on.
const HIS = new Set(['composer', 'bridge', 'sdk', 'unclassified'])

const hasEnded = (status: BoardStatus): boolean =>
  status === 'completed' || status === 'failed' || status === 'killed' || status === 'gone'

const clip = (text: string, limit = 60): string => {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > limit ? `${line.slice(0, limit - 1).trimEnd()}…` : line
}

/** The text if a bubble can show it whole and still be small, else what to say instead. A bubble never cuts words. */
const brief = (text: string, otherwise: string): string => {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length <= BRIEF_CHARS ? line : otherwise
}

const labelOf = (info: AgentInfo): string => clip(info.description || info.name || info.type)

const fileName = (value: unknown): string => (typeof value === 'string' ? value.split(/[\\/]/).pop() : '') || 'a file'

const words = (value: unknown): string => (typeof value === 'string' ? value : '')

/** One tool call in plain words. */
const stepOf = (tool: string, input: Readonly<Record<string, unknown>>): string => {
  if (tool === 'Read') {
    return brief(`Reading ${fileName(input.file_path)}`, 'Reading a file')
  }

  if (tool === 'Edit' || tool === 'NotebookEdit') {
    return brief(`Editing ${fileName(input.file_path ?? input.notebook_path)}`, 'Editing a file')
  }

  if (tool === 'Write') {
    return brief(`Writing ${fileName(input.file_path)}`, 'Writing a file')
  }

  if (tool === 'Bash') {
    return brief(words(input.description) || `Running ${words(input.command)}`, 'Running a command')
  }

  if (tool === 'Grep' || tool === 'Glob') {
    return brief(`Searching for ${words(input.pattern)}`, 'Searching the code')
  }

  if (tool === 'WebSearch') {
    return brief(`Searching the web: ${words(input.query)}`, 'Searching the web')
  }

  if (tool === 'WebFetch') {
    return 'Reading a page'
  }

  if (tool === 'Agent') {
    return brief(`Delegating: ${words(input.description) || 'a subtask'}`, 'Delegating a subtask')
  }

  if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__')

    const app = server.replace(/^plugin_/, '').split('_').pop() ?? ''

    return brief(`${app}: ${name.replace(/[_-]+/g, ' ')}`, `Using ${app}`)
  }

  return brief(`Using ${tool}`, 'Using a tool')
}

/** What a row says: the step while one is under way, else the status in a word. */
const detailOf = (one: BoardAgent, step: string): string => {
  if (step !== '' && one.status === 'running') {
    return step
  }

  return step !== '' && one.status === 'waiting' ? `Waiting · ${step}` : LOOK[one.status].word
}

const reportedOf = (one: Pick<BoardAgent, 'done' | 'total'>): number | null =>
  one.total > 0 ? Math.round((one.done / one.total) * 100) : null

/** `40%` from the steps it reported; nothing where it reported none, or has finished. */
const percentOf = (one: BoardAgent): string =>
  one.total > 0 && one.status !== 'completed' && one.status !== 'gone' ? `${reportedOf(one)}%` : ''

/** `<1m`, `12m`, `1h 5m`. */
const span = (ms: number): string => {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS)

  if (minutes < 1) {
    return '<1m'
  }

  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** The steps left at the pace of the steps done: a straight line, and so an estimate. Nothing until one is done. */
const leftOf = (one: BoardAgent, at: number): string => {
  // `at` moves only every so often, and can stand before an agent first seen since.
  if (one.endedAt !== null || one.done < 1 || one.done >= one.total || at <= one.startedAt) {
    return ''
  }

  const left = ((at - one.startedAt) / one.done) * (one.total - one.done)

  return left < MINUTE_MS ? '<1m left' : `~${span(left)} left`
}

/** Nobody on the way anywhere: every move and party is for one drawing, so the next must not play it again. */
const settled = (one: BoardAgent): BoardAgent => ({ ...one, from: reportedOf(one), isFresh: false })

/** A bubble's second line. It reads no clock: the scene is only redrawn when an agent reports or changes status. */
const wordsOf = (one: BoardAgent): string => {
  const percent = percentOf(one)
  const joined = (...parts: string[]): string => parts.filter(part => part !== '').join(' · ')

  if (one.status === 'failed') {
    return percent === '' ? 'Failed' : `Failed at ${percent}`
  }

  if (one.status === 'completed') {
    return joined('Done', span((one.endedAt ?? one.startedAt) - one.startedAt))
  }

  if (one.status === 'running') {
    return percent === '' ? 'Working' : joined(percent, one.left)
  }

  return joined(percent, LOOK[one.status].word)
}

const actorOf = (one: BoardAgent): Actor => ({
  id: one.id,
  kind: one.kind,
  seat: one.seat,
  status: one.status,
  isFresh: one.isFresh,
  percent: one.status === 'completed' || one.status === 'gone' ? null : reportedOf(one),
  from: one.from,
  label: one.label,
  thought: one.thought === '' ? brief(one.label, 'On its task') : one.thought,
  words: wordsOf(one),
})

const rankedOf = (board: readonly BoardAgent[]): BoardAgent[] =>
  [...board].sort(
    (a, b) =>
      ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt),
  )

const mainAt = (at: number): BoardAgent => ({
  id: MAIN,
  label: 'Claude',
  kind: 'main',
  seat: -1,
  status: 'running',
  thought: '',
  left: '',
  done: 0,
  total: 0,
  from: null,
  isFresh: false,
  startedAt: at,
  endedAt: null,
  isCleared: false,
})

/** The task list after one call of the tool that keeps it: a whole new list, or the steps it moved. */
const planAfter = (steps: readonly PlanStep[], input: Readonly<Record<string, unknown>>): PlanStep[] => {
  const listed = input.items ?? input.todos

  if (Array.isArray(listed)) {
    return listed.map((item: { content?: unknown; status?: unknown }) => ({
      content: String(item.content ?? ''),
      status: String(item.status ?? 'pending'),
    }))
  }

  const done = Array.isArray(input.done) ? input.done.map(Number) : []
  const started = typeof input.start === 'number' ? input.start : null
  const moved = steps.map((step, i) => {
    if (done.includes(i + 1)) {
      return { ...step, status: 'completed' }
    }

    return started === i + 1 ? { ...step, status: 'in_progress' } : step
  })

  if (input.advance !== true) {
    return moved
  }

  const finished = moved.map(step => (step.status === 'in_progress' ? { ...step, status: 'completed' } : step))
  const next = finished.findIndex(step => step.status === 'pending')

  return finished.map((step, i) => (i === next ? { ...step, status: 'in_progress' } : step))
}

/** One agent's report folded into the board. Only a bubble or place that changed redraws the scene, and then nobody else's move plays twice. */
const reported = (list: readonly BoardAgent[], id: string, done: number, total: number, thought: string, at: number): BoardAgent[] => {
  const mover = list.find(one => one.id === id)

  if (mover === undefined) {
    return [...list]
  }

  const moved = { ...mover, done, total, thought: thought || mover.thought }
  const told = { ...moved, left: leftOf(moved, at) }
  const hasChanged = reportedOf(mover) !== reportedOf(told) || mover.thought !== told.thought || mover.left !== told.left

  return list.map(one => {
    if (one.id === id) {
      return hasChanged ? { ...told, from: reportedOf(one), isFresh: false } : told
    }

    return hasChanged ? settled(one) : one
  })
}

/**
 * The engine's list folded into the board. The list drops an agent soon after it ends, and the
 * board keeps it: a failure must still be here when he looks.
 */
const merged = (board: readonly BoardAgent[], listed: readonly AgentInfo[], at: number): BoardAgent[] => {
  const byId = new Map(listed.map(info => [info.id, info]))
  const known = new Set(board.map(one => one.id))
  const kept = board.flatMap((one): BoardAgent[] => {
    // Never in the engine's list: its turn says when it comes and goes.
    if (one.id === MAIN) {
      return [one]
    }

    const info = byId.get(one.id)

    if (info === undefined) {
      if (one.isCleared) {
        return []
      }

      return [hasEnded(one.status) ? one : { ...one, status: 'gone', left: '', endedAt: at }]
    }

    // An ended agent a message resumes keeps its id, and comes back to the board.
    if (hasEnded(info.status)) {
      return [{ ...one, label: labelOf(info), status: info.status, left: '', endedAt: one.endedAt ?? at }]
    }

    return [{ ...one, label: labelOf(info), status: info.status, endedAt: null, isCleared: false }]
  })
  const seats = new Set(kept.map(one => one.seat))
  const fresh = listed
    .filter(info => !known.has(info.id))
    .map((info): BoardAgent => {
      let seat = 0

      while (seats.has(seat)) {
        seat += 1
      }

      seats.add(seat)

      return {
        id: info.id,
        label: labelOf(info),
        kind: info.type,
        seat,
        status: info.status,
        thought: '',
        left: '',
        done: 0,
        total: 0,
        from: null,
        isFresh: false,
        startedAt: at,
        endedAt: hasEnded(info.status) ? at : null,
        isCleared: false,
      }
    })
  const next = [...kept, ...fresh]
  const before = new Map(board.map(one => [one.id, one.status]))

  if (next.length === board.length && next.every(one => before.get(one.id) === one.status)) {
    return next
  }

  return next.map(one => ({ ...settled(one), isFresh: one.status === 'completed' && before.get(one.id) !== 'completed' }))
}

let thoughtAt = 0

/** One poll. It writes only what changed, so a quiet session never redraws the band. */
const sync = async ($: EngineInterface): Promise<void> => {
  const at = await $.clock.now()
  const listed = await $.agent.list()
  const board = await read($, agents)

  if (JSON.stringify(merged(board, listed, at)) !== JSON.stringify(board)) {
    await update($, agents, list => merged(list, listed, at))
  }

  if (at - (await read($, now)) >= NOW_MS) {
    await update($, now, () => at)
  }

  // A task list says what the main agent is on. Without one, its latest step does, now and then.
  const main = board.find(one => one.id === MAIN)
  const step = (await read($, steps))[MAIN] ?? ''

  if (main !== undefined && main.total === 0 && step !== '' && step !== main.thought && at - thoughtAt >= THOUGHT_MS) {
    thoughtAt = at
    await update($, agents, list => reported(list, MAIN, 0, 0, step, at))
  }
}

/** Opens the big scene. A press or a command is the only thing that may: a pane opened unasked waits undrawn. */
const expand = async ($: EngineInterface): Promise<void> => {
  const opened = await $.ui.open({ id: PANE, title: 'Agent Board' })

  if (opened.isPlaced) {
    await update($, isExpanded, () => true)
  } else {
    $.ui.toast(`The agent board could not open: ${opened.reason}`)
  }
}

// When the scene last changed, in seconds: its clouds start from here, so a redraw does not send them back.
let drawnKey = ''
let drawnAt = 0

const staged = async ($: EngineInterface, board: readonly BoardAgent[], columns: number, rows?: number) => {
  const actors = rankedOf(board).map(actorOf)
  const key = JSON.stringify([actors, columns, rows])

  if (key !== drawnKey) {
    drawnKey = key
    drawnAt = Math.floor((await $.clock.now()) / 1000)
  }

  return { scene: sceneOf(actors, { columns, rows, clock: drawnAt }), alt: altOf(actors) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agent-board', description: 'Show the agent board as large as a pane allows' })
    await update($, isExpanded, () => false)

    if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
      await update($, isExpanded, () => true)
    }

    await $.tool.register({
      name: 'progress',
      description: 'Subagents only: says how far along your task is, for the person watching the agents. Answers at once and changes nothing.',
      inputSchema: {
        type: 'object',
        properties: {
          done: { type: 'integer', description: 'Steps finished so far.' },
          total: { type: 'integer', description: 'Steps you now expect in all.' },
          doing: { type: 'string', maxLength: 40, description: 'What you are doing now, in four words or fewer.' },
        },
        required: ['done', 'total'],
      },
      isDeferred: false,
    })
    await sync($).catch(() => undefined)

    $.clock.every(POLL_MS, () => {
      void sync($).catch(() => undefined)
    })

    return next(e)
  })

  // The board stands for what happened since he last spoke: his next prompt clears what has ended.
  // A background agent's report arrives as a prompt too, one he never typed, and clears nothing; nor does a slash command.
  on('prompt.submit', async ($, e, next) => {
    const isHis = e.isMeta !== true && e.command === undefined && HIS.has(e.origin.kind)

    if (isHis && (await read($, agents)).some(one => hasEnded(one.status) && !one.isCleared)) {
      await update($, agents, list =>
        list.map(one => (hasEnded(one.status) ? { ...settled(one), isCleared: true } : settled(one))),
      )
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const at = await $.clock.now()

      await update($, plan, () => [])
      await update($, steps, known => ({ ...known, [MAIN]: '' }))
      await update($, agents, list => [mainAt(at), ...list.filter(one => one.id !== MAIN).map(settled)])
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, agents, list => list.filter(one => one.id !== MAIN).map(settled))
    }

    return next(e)
  })

  on('command.run', { command: 'agent-board' }, async $ => {
    await expand($)

    return { text: 'The agent board is open.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      await update($, isExpanded, () => false)
    }

    return next(e)
  })

  // A resumed agent was asked when it began.
  on('agent.spawn', ($, e, next) => next(e.resume === undefined ? { ...e, prompt: `${e.prompt}${PROGRESS_ASK}` } : e))

  on('tool.call', async ($, e, next) => {
    const id = e.agentId

    // The mod's own tool, answered here: no permission prompt, and it is not a step.
    if (String(e.tool) === PROGRESS_TOOL) {
      const input: Readonly<Record<string, unknown>> = e
      const total = Math.max(1, Math.floor(Number(input.total)) || 1)
      const done = Math.min(total, Math.max(0, Math.floor(Number(input.done)) || 0))

      if (id !== undefined) {
        const at = await $.clock.now()
        const doing = typeof input.doing === 'string' ? brief(input.doing, '') : ''
        const step = (await read($, steps))[id] ?? ''

        await update($, agents, list => reported(list, id, done, total, doing || step, at))
      }

      return { result: 'Noted.' }
    }

    const isQuiet = QUIET.test(String(e.tool))

    if (id === undefined) {
      const at = await $.clock.now()

      // A mod loaded in the middle of a turn never saw that turn start.
      if (!(await read($, agents)).some(one => one.id === MAIN)) {
        await update($, agents, list => [mainAt(at), ...list])
      }

      if (PLAN_TOOLS.has(String(e.tool))) {
        const input: Readonly<Record<string, unknown>> = e
        const after = planAfter(await read($, plan), input)
        const active = after.findIndex(step => step.status === 'in_progress')
        const thought = brief(after[active]?.content ?? '', `Step ${active + 1} of ${after.length}`)

        await update($, plan, () => after)
        await update($, agents, list =>
          reported(list, MAIN, after.filter(step => step.status === 'completed').length, after.length, thought, at),
        )
      } else if (!isQuiet) {
        const step = stepOf(e.tool, e)

        await update($, steps, known => ({ ...known, [MAIN]: step }))
      }

      return next(e)
    }

    // Forks and compactions call tools under ids the list never names: not his agents.
    if (!isQuiet && (await read($, agents)).some(one => one.id === id)) {
      const step = stepOf(e.tool, e)

      await update($, steps, known => ({ ...known, [id]: step }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const board = (await read($, agents)).filter(one => !one.isCleared && (one.id !== MAIN || e.props.isWorking))

    if (e.surface === 'desktop') {
      const { Button, Svg } = $.ui.resolve(e)

      // Drawn once is enough: the pane has the scene while it is open.
      if (await read($, isExpanded)) {
        return <Text dimColor>The agent board is open beside the chat</Text>
      }

      if (board.length === 0) {
        const fire = campfire()

        return (
          <Box flexDirection="row" columnGap={1} alignItems="center">
            <Svg source={fire.source} alt="A campfire with nobody at it." width={fire.width} height={fire.height} isInteractive />
            <Text dimColor>No agents running</Text>
          </Box>
        )
      }

      const { scene, alt } = await staged($, board, e.props.bodyColumns)

      return (
        <Box flexDirection="column" alignItems="center">
          <Box alignSelf="flex-end">
            <Button key="fill" label="Fill screen" plain onPress={() => expand($)} />
          </Box>
          <Svg source={scene.source} alt={alt} width={scene.width} height={scene.height} isInteractive />
        </Box>
      )
    }

    // Nothing to report still draws one dim line: it is how he knows the board is there.
    if (board.length === 0) {
      return <Text dimColor>○ No agents running</Text>
    }

    const at = await read($, now)
    const stepOfAgent = await read($, steps)
    const ranked = rankedOf(board)
    const chips = ORDER.map(status => ({ status, count: board.filter(one => one.status === status).length })).filter(
      chip => chip.count > 0,
    )
    const room = Math.max(0, Math.min(MAX_ROWS, e.props.maxRows - 1))
    const rows = ranked.length <= room ? ranked : ranked.slice(0, Math.max(0, room - 1))
    const hidden = ranked.length - rows.length

    const labelWidth = Math.floor(e.props.bodyColumns * 0.4)
    const hasPercents = rows.some(one => percentOf(one) !== '')

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={2}>
          <Box flexShrink={0}>
            <Text bold>Agents</Text>
          </Box>
          {chips.map(chip => (
            <Box flexShrink={0}>
              <Text color={LOOK[chip.status].color} dimColor={LOOK[chip.status].color === undefined}>
                {LOOK[chip.status].glyph} {chip.count} {LOOK[chip.status].word.toLowerCase()}
              </Text>
            </Box>
          ))}
        </Box>
        {rows.map(one => (
          <Box flexDirection="row" columnGap={1}>
            <Box flexShrink={0}>
              <Text color={LOOK[one.status].color} dimColor={LOOK[one.status].color === undefined}>
                {LOOK[one.status].glyph}
              </Text>
            </Box>
            <Box width={labelWidth} flexShrink={0} minWidth={0}>
              <Text wrap="truncate-end">{one.label}</Text>
            </Box>
            {hasPercents && (
              <Box width={4} flexShrink={0} justifyContent="flex-end">
                <Text tabular>{percentOf(one)}</Text>
              </Box>
            )}
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text dimColor wrap="truncate-end">
                {detailOf(one, stepOfAgent[one.id] ?? '')}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text dimColor tabular>
                {[span((one.endedAt ?? at) - one.startedAt), leftOf(one, at)].filter(part => part !== '').join(' · ')}
              </Text>
            </Box>
          </Box>
        ))}
        {hidden > 0 && room > 0 && <Text dimColor>+{hidden} more</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const board = (await read($, agents)).filter(one => !one.isCleared)

    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)

      return <Text dimColor>The scene is drawn in the desktop app. {board.length} agents on the board.</Text>
    }

    const { Svg } = $.ui.resolve(e)
    const { scene, alt } = await staged($, board, e.props.bodyColumns, e.props.scroll.bodyRows)

    return <Svg source={scene.source} alt={alt} width={scene.width} height={scene.height} isInteractive />
  })
}
