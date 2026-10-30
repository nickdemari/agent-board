import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const START = 1_700_000_000_000
const POLL = 2000

const BAND = {
  plugin: 'agent-board',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

/** The engine beneath the mod: a clock in memory, its record of the agents, every other call answered. */
const world = (on: On) => {
  const clock = mock.clock(on, { now: START })
  const roster: AgentInfo[] = []

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('agent.list', () => ({ value: roster }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok' }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__agent-board__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: 'engine' })
  })

  return { clock, roster }
}

/** Whether the drawing says this, in its words or the description of its scene. */
const says = async (
  ui: { drawn: () => Promise<unknown>; find: (query: { text: string | RegExp }) => Promise<unknown> },
  words: string | RegExp,
): Promise<boolean> => {
  const told = JSON.stringify(await ui.drawn()).replace(/<svg.*?<\/svg>/g, '')
  const isTold = typeof words === 'string' ? told.includes(words) : words.test(told)

  return isTold || (await ui.find({ text: words })) !== undefined
}

/** The props of the scene as drawn: a frame given no size comes out 300 by 150, whatever the markup says. */
const frameIn = async (ui: { drawn: () => Promise<unknown> }): Promise<{ source: string; width: number; height: number }> => {
  let frame: unknown

  JSON.stringify(await ui.drawn(), (_key, value: { source?: unknown } | null) => {
    if (typeof value?.source === 'string' && value.source.startsWith('<svg')) {
      frame = value
    }

    return value
  })

  return frame as { source: string; width: number; height: number }
}

const begin = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
const typed = ($: Engine, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
const agent = (id: string, description: string, status: AgentInfo['status']): AgentInfo => ({
  id,
  description,
  type: 'general-purpose',
  status,
})

test('with no agents the band is one dim line', async ($, on) => {
  world(on)
  await begin($)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await says(ui, /No agents running/)).toBe(true)
    await ui.unmount()
  }
})

test('a mix of statuses: the summary counts them, the rows say what each is on, the worst first', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(
    agent('a1', 'Trace the token refresh', 'running'),
    agent('a2', 'Draft the migration', 'waiting'),
    agent('a3', 'Look up the docs', 'failed'),
    agent('a4', 'Sweep the routes', 'completed'),
  )
  await clock.advance(POLL)
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/src/auth/login.ts', agentId: 'a1' })
  await clock.advance(5 * 60_000 + 20_000)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })

    if (surface === 'terminal') {
      expect(await says(ui, '✕ 1 failed')).toBe(true)
      expect(await says(ui, '◐ 1 waiting')).toBe(true)
      expect(await says(ui, '● 1 working')).toBe(true)
      expect(await says(ui, '✓ 1 done')).toBe(true)
      expect(await says(ui, /Reading login\.ts/)).toBe(true)
      expect(await says(ui, /5m/)).toBe(true)
      expect(await says(ui, /<1m/)).toBe(true)
    }

    expect(await says(ui, 'Trace the token refresh')).toBe(true)
    expect(await says(ui, /Failed/)).toBe(true)
    await ui.unmount()
  }
})

test('the engine drops an ended agent; the board keeps it until his next prompt', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Look up the docs', 'failed'))
  await clock.advance(POLL)
  roster.length = 0
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'Look up the docs')).toBe(true)
  expect(await says(ui, /Failed/)).toBe(true)

  // A prompt he never typed clears nothing, however the engine marks it.
  await $.prompt.submit({ text: 'report', wait: false, isMeta: true, origin: { kind: 'unclassified' } })
  await $.prompt.submit({ text: 'report', wait: false, origin: { kind: 'task-notification' } })
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'peer' } })
  expect(await says(ui, 'Look up the docs')).toBe(true)

  // Nor does a slash command.
  await $.prompt.submit({ text: '/model', wait: false, command: { name: 'model', args: '' }, origin: { kind: 'composer' } })
  expect(await says(ui, 'Look up the docs')).toBe(true)

  await typed($, 'what happened?')
  expect(await says(ui, 'No agents running')).toBe(true)
  await ui.unmount()
})

test('a prompt from the desktop app clears like one typed at a terminal', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Look up the docs', 'completed'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'sdk' } })
  expect(await says(ui, 'No agents running')).toBe(true)
  await ui.unmount()
})

test('a waiting agent says what it last did', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Run the suite', 'waiting'))
  await clock.advance(POLL)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'npm test', description: 'Running the tests', agentId: 'a1' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await says(ui, /Waiting · Running the tests/)).toBe(true)
  await ui.unmount()
})

const reported = ($: Engine, agentId: string, done: number, total: number, doing?: string) =>
  $.tool.call({ tool: 'mcp__agent-board__progress', tool_use_id: `p${done}`, done, total, doing, agentId } as never)

test('an agent that reports its steps shows a percent and, once a step is done, a time left', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Trace the token refresh', 'running'))
  await clock.advance(POLL)
  await reported($, 'a1', 0, 5)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await says(ui, /0%/)).toBe(true)
    expect(await says(ui, /left/)).toBe(false)
    await ui.unmount()
  }

  await clock.advance(2 * 60_000 + 20_000)
  await reported($, 'a1', 2, 5)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await says(ui, /40%/)).toBe(true)
    expect(await says(ui, /~3m left/)).toBe(true)
    await ui.unmount()
  }
})

test('a first step finished before the clock has caught up says nothing about time left', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task', 'running'))
  await clock.advance(POLL)
  await reported($, 'a1', 1, 5)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, /20%/)).toBe(true)
  expect(await says(ui, /left/)).toBe(false)
  await ui.unmount()
})

test('the report is not a step, and bad numbers are held to something sane', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task', 'running'))
  await clock.advance(POLL)
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts', agentId: 'a1' })
  await reported($, 'a1', 9, 3)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await says(ui, /Reading login\.ts/)).toBe(true)
  expect(await says(ui, /100%/)).toBe(true)
  await ui.unmount()
})

test('an agent that reports nothing shows no percent; a failed one keeps where it got to; a done one shows none', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const failing = agent('a2', 'Fails', 'running')
  const finishing = agent('a3', 'Finishes', 'running')
  roster.push(agent('a1', 'Silent', 'running'), failing, finishing)
  await clock.advance(POLL)

  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, /%/)).toBe(false)
  await ui.unmount()

  await reported($, 'a2', 1, 4)
  await reported($, 'a3', 4, 4)
  failing.status = 'failed'
  finishing.status = 'completed'
  await clock.advance(POLL)

  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, /Failed at 25%/)).toBe(true)
  expect(await says(ui, /100%/)).toBe(false)
  await ui.unmount()
})

test('a new agent is asked to report, once, and its task is left as it was above that', async ($, on) => {
  world(on)
  const prompts: string[] = []
  on('agent.spawn', (_$, e) => {
    prompts.push(e.prompt)

    return { model: 'haiku', agentId: 'a1' }
  })
  await begin($)
  await $.agent.spawn({
    tool_use_id: 'spawn-1',
    prompt: 'Find the bug.',
    description: 'Find it',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'haiku',
    background: true,
    fork: false,
  })

  expect(prompts[0]?.startsWith('Find the bug.\n\nProgress:')).toBe(true)
  expect(prompts[0]?.match(/mcp__agent-board__progress/g)?.length).toBe(1)
})

test('a cleared agent the engine still lists stays off the board, and comes back if it resumes', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const one = agent('a1', 'Sweep the routes', 'completed')
  roster.push(one)
  await clock.advance(POLL)
  await typed($, 'next thing')
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'No agents running')).toBe(true)

  one.status = 'running'
  await clock.advance(POLL)
  expect(await says(ui, 'Sweep the routes')).toBe(true)
  expect(await says(ui, /Working/)).toBe(true)
  await ui.unmount()
})

test('an agent gone from the list before its end was seen reads as ended, not as working', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Pair on the parser', 'running'))
  await clock.advance(POLL)
  roster.length = 0
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, /Ended/)).toBe(true)
  await ui.unmount()
})

test('past the rows it has room for, the rest is one line, and the summary still counts them all', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(...[1, 2, 3, 4, 5, 6].map(n => agent(`a${n}`, `Task ${n}`, 'running')))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await says(ui, '+3 more')).toBe(true)
  await ui.unmount()
})

test('a band short of rows keeps its summary', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'), agent('a2', 'Task two', 'running'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: 1 } })
  expect(await says(ui, '● 2 working')).toBe(true)
  expect(await says(ui, 'Task one')).toBe(false)
  await ui.unmount()
})

test('a tool call under an id the list never names adds nothing', async ($, on) => {
  const { clock } = world(on)
  await begin($)
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a.ts', agentId: 'fork-1' })
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'No agents running')).toBe(true)
  await ui.unmount()
})

test('a quiet poll writes nothing', async ($, on) => {
  const { clock, roster } = world(on)
  let writes = 0
  on('state.set', ($$, e, next) => {
    if (e.key === 'agents') {
      writes += 1
    }

    return next(e)
  })
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'))
  await clock.advance(POLL)
  const settled = writes
  await clock.advance(POLL * 5)
  expect(writes).toBe(settled)
})

const sceneIn = async (ui: { drawn: () => Promise<unknown> }): Promise<string> =>
  JSON.stringify(await ui.drawn()).match(/<svg.*?<\/svg>/)?.[0] ?? ''

test('desktop draws the scene and says what is in it; a terminal draws words', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'), agent('a2', 'Task two', 'failed'))
  await clock.advance(POLL)

  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await sceneIn(desktop)).toContain('crispEdges')
  expect(await says(desktop, 'Task one: Working')).toBe(true)
  expect(await says(desktop, 'Task two: Failed')).toBe(true)
  // Everything he reads is in the art.
  expect(await desktop.findAll({ type: 'Text' })).toHaveLength(0)
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await sceneIn(terminal)).toBe('')
  await terminal.unmount()
})

test('a step or the clock leaves the scene alone, so its animation keeps running', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task', 'running'))
  await clock.advance(POLL)
  await reported($, 'a1', 1, 4)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const before = await sceneIn(ui)

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts', agentId: 'a1' })
  await clock.advance(90_000)
  expect(await sceneIn(ui)).toBe(before)

  await reported($, 'a1', 2, 4)
  expect(await sceneIn(ui)).not.toBe(before)
  await ui.unmount()
})

test('an agent walks to its new place on the drawing that moves it, and only that one', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Mover', 'running'), agent('a2', 'Other', 'running'))
  await clock.advance(POLL)
  await reported($, 'a1', 0, 4)
  await reported($, 'a2', 0, 4)
  await reported($, 'a1', 1, 4)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await sceneIn(ui)).toContain('fill=\\"freeze\\"')

  await reported($, 'a2', 1, 4)
  expect((await sceneIn(ui)).match(/fill=\\"freeze\\"/g)?.length).toBe(1)
  await ui.unmount()
})

test('the party is for the drawing that sees it finish', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const one = agent('a1', 'Finisher', 'running')
  roster.push(one, agent('a2', 'Other', 'running'))
  await clock.advance(POLL)
  one.status = 'completed'
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await sceneIn(ui)).toContain('dur=\\"1.2s\\"')

  await reported($, 'a2', 1, 4)
  expect(await sceneIn(ui)).not.toContain('dur=\\"1.2s\\"')
  await ui.unmount()
})

test('a full board stays well under what a surface will take', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(...Array.from({ length: 12 }, (_, n) => agent(`a${n}`, `Task ${n}`, n % 2 === 0 ? 'running' : 'waiting')))
  await clock.advance(POLL)
  await Promise.all(roster.map((one, n) => reported($, one.id, n, 12, 'Reading every single file in here')))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 200 } })
  expect((await sceneIn(ui)).length).toBeLessThan(100_000)
  await ui.unmount()
})

test('the scene is drawn at the size of its slot, and a wider band is longer rather than taller', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'))
  await clock.advance(POLL)

  const sizeAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns } })
    const frame = await frameIn(ui)

    await ui.unmount()

    return frame
  }
  const usual = await sizeAt(85)
  const wide = await sizeAt(200)
  const narrow = await sizeAt(30)

  expect(usual.source).toContain(`width="${usual.width}" height="${usual.height}"`)
  expect(usual.width).toBeGreaterThan(680)
  expect(usual.width).toBeLessThanOrEqual(714)
  expect(wide.width).toBeGreaterThan(usual.width * 2)
  expect(wide.height).toBe(usual.height)
  expect(narrow.width).toBeLessThanOrEqual(252)
  expect(narrow.source).toContain(`width="${narrow.width}" height="${narrow.height}"`)
})

test('however many are on it, the scene stays short enough to show whole, and a usual crowd keeps every bubble', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)

  for (const crowd of [1, 3, 6, 12]) {
    roster.length = 0
    roster.push(...Array.from({ length: crowd }, (_, n) => agent(`a${n}`, `Task ${n}`, 'running')))
    await clock.advance(POLL)
    await Promise.all(roster.map((one, n) => reported($, one.id, n, 12, 'Reading every single file in here')))

    const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 85 } })
    const frame = await frameIn(ui)

    expect(frame.height).toBeLessThanOrEqual(215)

    // Twelve standing close together can leave one with nowhere to put its bubble.
    if (crowd <= 6) {
      expect(frame.source.match(/#FFFFFF" d="M1 1h/g)?.length).toBe(crowd)
    }

    await ui.unmount()
  }
})

test('a bubble shows its whole thought, and a thought too long to be small is replaced, never cut', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // One drawn glyph per letter of the thought and of the bubble's `25%`.
  const lettersIn = async () => (await frameIn(ui)).source.match(/<use href="#g\d+" x=/g)?.length

  await reported($, 'a1', 1, 4, 'Find why the photo cannot be added')
  expect(await lettersIn()).toBe('Findwhythephotocannotbeadded'.length + 3)

  await reported($, 'a1', 2, 4, 'Reading files...')
  expect(await lettersIn()).toBe('Readingfiles'.length + 3)
  expect((await frameIn(ui)).source).not.toContain('#g46"')

  await reported($, 'a1', 3, 4, 'Reading files…')
  expect(await lettersIn()).toBe('Readingfiles'.length + 3)

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'ls', description: 'Listing every single file under the whole of the home folder', agentId: 'a1' })
  await reported($, 'a1', 3, 4, 'Reading the photo upload markup, the bucket switch and the env')
  expect(await says(ui, 'thinking \\"Running a command\\"')).toBe(true)
  await ui.unmount()
})

test('a task list step too long for a bubble says which step it is', async ($, on) => {
  const { clock } = world(on)
  await begin($)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...WORKING, surface: 'desktop' })

  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    tool_use_id: 'u1',
    items: [
      { content: 'Read it', status: 'completed' },
      { content: 'Record the results and the launch step in the whole build plan', status: 'in_progress' },
    ],
  } as never)
  expect(await says(ui, 'thinking \\"Step 2 of 2\\"')).toBe(true)
  await ui.unmount()
})

test('a bubble says what the agent said it was doing, else its step at that report, else its task', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Trace the refresh', 'running'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'thinking')).toBe(false)

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts', agentId: 'a1' })
  await reported($, 'a1', 1, 4)
  expect(await says(ui, 'thinking \\"Reading login.ts\\"')).toBe(true)

  await reported($, 'a1', 2, 4, 'Hunting the stale token')
  expect(await says(ui, 'thinking \\"Hunting the stale token\\"')).toBe(true)
  await ui.unmount()
})

test('fill screen opens the big scene and the band stands aside', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'))
  await clock.advance(POLL)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'fill' })
  expect(await sceneIn(band)).toBe('')
  expect(await says(band, 'open beside the chat')).toBe(true)

  const PANE = {
    plugin: 'agent-board',
    component: 'Pane',
    requestId: 'agent-board',
    props: { title: 'Agent Board', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
  } as const
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // Taller than the band's scene, since it has the room.
  expect(await says(pane, 'Task one: Working')).toBe(true)
  expect((await sceneIn(pane)).length).toBeGreaterThan(0)
  const frame = await frameIn(pane)
  expect(frame.width).toBeLessThanOrEqual(504)
  expect(frame.height).toBeGreaterThan(frame.width)
  await pane.unmount()

  const text = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await says(text, 'desktop app')).toBe(true)
  await text.unmount()
  await band.unmount()
})

const WORKING = { ...BAND, props: { ...BAND.props, isWorking: true } } as const
const finished = ($: Engine, turnId: string) =>
  $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId, reason: 'answer' })

test('the main agent is on the board while its turn runs, and only then', async ($, on) => {
  const { clock } = world(on)
  await begin($)
  await $.turn.start({ text: 'fix it', turnId: 't1' })

  const ui = await $.ui.mount({ ...WORKING, surface: 'desktop' })
  expect(await says(ui, 'Claude: Working')).toBe(true)
  expect(await says(ui, 'No agents running')).toBe(false)
  expect(await sceneIn(ui)).toContain('crispEdges')
  await ui.unmount()

  await clock.advance(POLL)
  await finished($, 't1')

  const after = await $.ui.mount({ ...WORKING, surface: 'desktop' })
  expect(await says(after, 'No agents running')).toBe(true)
  await after.unmount()
})

test('a band that says the turn is over leaves the main agent out, whatever the board holds', async ($, on) => {
  world(on)
  await begin($)
  await $.turn.start({ text: 'fix it', turnId: 't1' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'No agents running')).toBe(true)
  await ui.unmount()
})

test('its task list gives it a percent and a thought', async ($, on) => {
  world(on)
  await begin($)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({
    tool: 'mcp__ccd_turn__update_plan',
    tool_use_id: 'p1',
    items: [
      { content: 'Read the code', status: 'completed' },
      { content: 'Write the fix', status: 'in_progress' },
      { content: 'Run the tests', status: 'pending' },
      { content: 'Ship it', status: 'pending' },
    ],
  } as never)

  const ui = await $.ui.mount({ ...WORKING, surface: 'desktop' })
  expect(await says(ui, /25%/)).toBe(true)
  expect(await says(ui, 'thinking \\"Write the fix\\"')).toBe(true)

  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', tool_use_id: 'p2', advance: true } as never)
  expect(await says(ui, /50%/)).toBe(true)
  expect(await says(ui, 'thinking \\"Run the tests\\"')).toBe(true)
  await ui.unmount()
})

test('with no task list its thought is its latest step, changed no more than every few seconds', async ($, on) => {
  const { clock } = world(on)
  await begin($)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts' })
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...WORKING, surface: 'desktop' })
  expect(await says(ui, 'thinking \\"Reading login.ts\\"')).toBe(true)

  const before = await sceneIn(ui)

  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/a/logout.ts' })
  await clock.advance(POLL)
  expect(await sceneIn(ui)).toBe(before)

  await clock.advance(10_000)
  expect(await says(ui, 'thinking \\"Reading logout.ts\\"')).toBe(true)
  await ui.unmount()
})

test('a task list call is not a step, and a mod loaded mid-turn still finds the main agent', async ($, on) => {
  const { clock } = world(on)
  await begin($)
  await $.tool.call({ tool: 'ToolSearch', tool_use_id: 'u1', query: 'x', max_results: 1 } as never)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...WORKING, surface: 'desktop' })
  expect(await says(ui, 'Claude: Working')).toBe(true)
  expect(await says(ui, 'thinking')).toBe(false)
  await ui.unmount()
})

test('a survey holds the band: the board yields to it', async ($, on) => {
  world(on)
  await begin($)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, hasSurvey: true } })
  expect(await says(ui, 'engine')).toBe(true)
  expect(await says(ui, /No agents/)).toBe(false)
  await ui.unmount()
})
