import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

const START = 1_700_000_000_000
const POLL = 2000
// How long what agents are up to can wait to reach the scene, and a poll to let it through.
const ACTIVITY = 8000

const BAND = {
  plugin: 'agent-board',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
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
  // A Workflow call's script stands in for the run's id, which keeps each test's run its own.
  on('tool.call', (_$, e) => {
    const { script } = e as unknown as { script?: string }

    return {
      result: String(e.tool) === 'Workflow' ? { status: 'async_launched', taskId: `task-${script}`, runId: script, workflowName: 'review-changes' } : 'ok',
    } as never
  })
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

test('an agent running a command walks to the copier on the drawing that sees it go, and only that one', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Mover', 'running'), agent('a2', 'Other', 'running'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await sceneIn(ui)).not.toContain('fill=\\"freeze\\"')

  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'npm test', description: 'Running the tests', agentId: 'a1' })
  await clock.advance(ACTIVITY)
  expect((await sceneIn(ui)).match(/fill=\\"freeze\\"/g)?.length).toBe(1)

  await reported($, 'a2', 1, 4)
  await clock.advance(ACTIVITY)
  expect(await sceneIn(ui)).not.toContain('fill=\\"freeze\\"')
  await ui.unmount()
})

test('what agents are up to reaches the scene every few seconds, and someone finishing does at once', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const finishing = agent('a2', 'Finisher', 'running')
  roster.push(agent('a1', 'Worker', 'running'), finishing)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const before = await sceneIn(ui)

  await reported($, 'a1', 1, 4, 'Hunting the stale token')
  expect(await sceneIn(ui)).toBe(before)
  // The words for anyone who cannot see the scene never wait.
  expect(await says(ui, 'thinking \\"Hunting the stale token\\"')).toBe(true)

  await clock.advance(ACTIVITY)
  const told = await sceneIn(ui)
  expect(told).not.toBe(before)

  finishing.status = 'completed'
  await clock.advance(POLL)
  expect(await sceneIn(ui)).not.toBe(told)
  await ui.unmount()
})

test('a finished report flies to the pile on the drawing that sees it finish, and the last one gets the party', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const one = agent('a1', 'Finisher', 'running')
  const other = agent('a2', 'Other', 'running')
  roster.push(one, other)
  await clock.advance(POLL)
  one.status = 'completed'
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await sceneIn(ui)).toContain('dur=\\"2s\\"')
  expect(await sceneIn(ui)).not.toContain('dur=\\"1.2s\\"')

  await reported($, 'a2', 1, 4)
  await clock.advance(ACTIVITY)
  expect(await sceneIn(ui)).not.toContain('dur=\\"2s\\"')

  other.status = 'completed'
  await clock.advance(POLL)
  expect(await sceneIn(ui)).toContain('dur=\\"1.2s\\"')
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

const launched = ($: Engine, run: string) => $.tool.call({ tool: 'Workflow', tool_use_id: `call-${run}`, script: run } as never)
const startedIn = ($: Engine, run: string, agentIndex: number, description = `Step ${agentIndex}`) =>
  $.agent.spawn({
    tool_use_id: `call-${run}`,
    prompt: 'Review it.',
    description,
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'haiku',
    background: true,
    fork: false,
    workflow: { runId: run, agentIndex },
  })
const ended = ($: Engine, agentId: string, reason: 'answer' | 'aborted' | 'error' = 'answer') =>
  $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: reason === 'aborted', turnId: `t-${agentId}`, reason, agentId })
const notified = ($: Engine, run: string, status = 'completed') =>
  $.prompt.submit({
    text: `<task-notification><task-id>task-${run}</task-id><status>${status}</status></task-notification>`,
    wait: false,
    origin: { kind: 'task-notification' },
  })
/** The engine beneath a workflow's spawns: each agent's id says which it is. */
const spawning = (on: On, prompts: string[] = []) =>
  on('agent.spawn', (_$, e) => {
    prompts.push(e.prompt)

    return { model: 'haiku', agentId: `${e.workflow?.runId}-${e.workflow?.agentIndex}` }
  })

test('a workflow run is on the board as one squad, though the list never names its agents', async ($, on) => {
  const { clock } = world(on)
  const prompts: string[] = []
  spawning(on, prompts)
  await begin($)
  await launched($, 'wf_a')
  await startedIn($, 'wf_a', 1)
  await startedIn($, 'wf_a', 2)
  await clock.advance(POLL * 3)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'No agents running')).toBe(false)
  expect(await says(ui, 'review changes: 0/2 done')).toBe(true)
  // Too many to read out one by one, but each one's cubicle says when hovered.
  expect((await frameIn(ui)).source).toMatch(/<(desc|title)>Step 1/)
  expect(JSON.stringify(await ui.findAll({ type: 'Text' }))).not.toContain('Step 1')
  expect(prompts).toEqual(['Review it.', 'Review it.'])
  await ui.unmount()
})

test('a squad counts its agents as their turns end, and says how many failed', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  await launched($, 'wf_b')
  await Promise.all([1, 2, 3].map(n => startedIn($, 'wf_b', n)))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ended($, 'wf_b-1')
  await clock.advance(POLL)
  expect(await says(ui, 'review changes: 1/3 done')).toBe(true)

  await ended($, 'wf_b-2', 'error')
  expect(await says(ui, 'review changes: 2/3 done · 1 failed')).toBe(true)
  await ui.unmount()
})

test('a run with every agent done so far is not over: it can start more, and its party waits for its end', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  await launched($, 'wf_c')
  await startedIn($, 'wf_c', 1)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ended($, 'wf_c-1')
  await clock.advance(POLL)
  expect(await says(ui, 'review changes: 1/1 done · Waiting')).toBe(true)
  expect((await frameIn(ui)).source).not.toContain('dur="1.2s"')

  // The script decides on another stage, and the squad's share falls back to match.
  await startedIn($, 'wf_c', 2)
  await startedIn($, 'wf_c', 3)
  expect(await says(ui, 'review changes: 1/3 done')).toBe(true)

  await notified($, 'wf_c')
  expect(await says(ui, 'review changes: 3/3 done')).toBe(true)
  expect((await frameIn(ui)).source).toContain('dur="1.2s"')

  // The notification wakes the main agent: the redraw that brings keeps the party.
  await $.turn.start({ text: '', turnId: 't-wake' })
  expect((await frameIn(ui)).source).toContain('dur="1.2s"')

  // A later change is the end of it.
  await clock.advance(POLL * 2)
  await startedIn($, 'wf_c2', 1)
  expect((await frameIn(ui)).source).not.toContain('dur="1.2s"')
  await ui.unmount()
})

test('a run that failed says so, and two runs stay apart', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  await launched($, 'wf_d')
  await startedIn($, 'wf_d', 1)
  await startedIn($, 'wf_e', 1)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'review changes: 0/1 done')).toBe(true)
  // One whose Workflow call has not come back yet has no name to go by.
  expect(await says(ui, 'Workflow: 0/1 done')).toBe(true)

  await notified($, 'wf_d', 'failed')
  expect(await says(ui, 'review changes: 1/1 done · Failed')).toBe(true)
  expect(await says(ui, 'Workflow: 0/1 done')).toBe(true)
  await ui.unmount()
})

test('his next prompt clears a run with nothing left running, and leaves a running one its count', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  await launched($, 'wf_f')
  await startedIn($, 'wf_f', 1)
  await startedIn($, 'wf_f', 2)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ended($, 'wf_f-1')
  await typed($, 'next')
  await clock.advance(POLL)
  expect(await says(ui, 'review changes: 1/2 done')).toBe(true)

  await ended($, 'wf_f-2')
  await typed($, 'next')
  await clock.advance(POLL)
  expect(await says(ui, 'review changes')).toBe(false)
  expect(await says(ui, 'No agents running')).toBe(true)
  await ui.unmount()
})

test('past twelve the rest are counted, and nobody is left out of the scene', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(...Array.from({ length: 12 }, (_, n) => agent(`a${n}`, `Task ${n}`, 'running')))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'more agents')).toBe(false)
  expect((await frameIn(ui)).source).toMatch(/<(desc|title)>Task 11/)

  roster.push(...Array.from({ length: 8 }, (_, n) => agent(`b${n}`, `Other ${n}`, 'running')))
  await clock.advance(POLL)
  expect(await says(ui, 'and 8 more agents')).toBe(true)
  expect((await frameIn(ui)).source).toMatch(/<(desc|title)>Other 7/)
  await ui.unmount()
})

test('a script names its stages: each is a department, and agents join theirs by label, or by when they start', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  const script = `wf_s export const meta = { name: 'x', phases: [{ title: 'Find', detail: 'look around' }, { title: 'Verify', detail: 'check it' }, { title: 'Ship' }] }`
  await launched($, script)
  await startedIn($, script, 1, 'find:routes')
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'review changes, Find: 0/1 done')).toBe(true)

  await startedIn($, script, 2, 'verify:0')
  expect(await says(ui, 'review changes, Verify: 0/1 done')).toBe(true)

  // No labels to go by: everyone before it had finished, so this is the script's next stage.
  const unlabeled = `wf_w export const meta = { phases: [{ title: 'Find' }, { title: 'Verify' }] }`
  await launched($, unlabeled)
  await startedIn($, unlabeled, 1, 'one task')
  await ended($, `${unlabeled}-1`)
  await startedIn($, unlabeled, 2, 'another task')
  expect(await says(ui, 'review changes, Verify: 0/1 done')).toBe(true)
  await ui.unmount()
})

test('however big the run, both views stay under what a surface will take', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  const script = `wf_big export const meta = { phases: [{ title: 'Find', detail: 'look around' }, { title: 'Verify', detail: 'check it' }] }`
  await launched($, script)

  for (let n = 1; n <= 600; n += 1) {
    await startedIn($, script, n, n <= 100 ? `find:${n}` : `verify:${n}`)

    if (n < 585) {
      await ended($, `${script}-${n}`, n % 50 === 0 ? 'error' : 'answer')
    }
  }

  await clock.advance(POLL)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 200 } })
  const crowded = (await frameIn(band)).source
  expect(crowded.length).toBeLessThan(120_000)
  expect((await frameIn(band)).height).toBeLessThanOrEqual(215)
  // Too many for each to have a card to hover: most say it in the surface's own tooltip, and the cards left are the failures'.
  expect(crowded).toContain('<title>')
  expect(crowded).toMatch(/<g id="c\d+" visibility="hidden"/)
  await band.unmount()

  await clock.advance(ACTIVITY)
  const pane = await $.ui.mount({ plugin: 'agent-board', component: 'Pane', requestId: 'agent-board', surface: 'desktop', props: { title: 'Agent Board', isFocused: false, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
  expect((await frameIn(pane)).source.length).toBeLessThan(120_000)
  await pane.unmount()
})

test('a bubble shows its whole thought, and a thought too long to be small is replaced, never cut', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // One drawn glyph per letter, so what a thought adds over a short one is every letter it has.
  // The card that hovering shows says it again, and is left out of the count.
  const lettersFor = async (done: number, doing: string) => {
    await reported($, 'a1', done, 4, doing)
    await clock.advance(ACTIVITY)

    return (await frameIn(ui)).source.replace(/<g id="cards">.*$/, '').match(/<use href="#g\d+" x=/g)?.length ?? 0
  }
  const least = await lettersFor(0, 'Go')

  expect(await lettersFor(0, 'Find why the photo cannot be added')).toBe(least + 'Findwhythephotocannotbeadded'.length - 2)
  expect(await lettersFor(0, 'Reading files...')).toBe(least + 'Readingfiles'.length - 2)
  expect((await frameIn(ui)).source).not.toContain('#g46"')
  expect(await lettersFor(0, 'Writing files…')).toBe(least + 'Writingfiles'.length - 2)

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

test('an agent whose turn fails reads failed, though the engine drops it before a poll sees how it ended', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Look up the docs', 'running'), agent('a2', 'Other', 'running'))
  await clock.advance(POLL)

  await ended($, 'a1', 'error')
  roster.splice(0, 1)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'Look up the docs: Failed')).toBe(true)
  expect(await says(ui, /Ended/)).toBe(false)
  await ui.unmount()
})

test('an agent whose turn answers is done, and its report flies, though the engine drops it first', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Sweep the routes', 'running'), agent('a2', 'Other', 'running'))
  await clock.advance(POLL)

  await ended($, 'a1')
  roster.splice(0, 1)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'Sweep the routes: Done')).toBe(true)
  expect(await sceneIn(ui)).toContain('dur=\\"2s\\"')
  await ui.unmount()
})

test('a list that lags the turn does not bring a failed agent back; its next turn does; a teammate that answers is only idle', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push({ ...agent('m1', 'Watch the build', 'running'), teammateId: 'watcher@team' }, agent('a1', 'Trace the refresh', 'running'))
  await clock.advance(POLL)

  await ended($, 'm1')
  await ended($, 'a1', 'error')
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'Watch the build: Working')).toBe(true)
  expect(await says(ui, 'Trace the refresh: Failed')).toBe(true)

  await $.turn.start({ text: 'try again', turnId: 't-a1-2', agentId: 'a1' })
  await clock.advance(POLL)
  expect(await says(ui, 'Trace the refresh: Working')).toBe(true)

  // An ended agent makes no calls: one under its id says it is at work again, even with no new turn.
  await ended($, 'a1', 'error')
  await clock.advance(POLL)
  expect(await says(ui, 'Trace the refresh: Failed')).toBe(true)

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts', agentId: 'a1' })
  await clock.advance(POLL)
  expect(await says(ui, 'Trace the refresh: Working')).toBe(true)
  await ui.unmount()
})

test('an agent that starts and fails between two polls still reaches the board, failed', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Look up the docs', 'running'))

  await ended($, 'a1', 'error')
  roster.length = 0
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await says(ui, 'Look up the docs: Failed')).toBe(true)
  await ui.unmount()
})

test('a run agent touching a file reaches the scene with the rest of its news, and the tool call alone wakes no drawing', async ($, on) => {
  const { clock } = world(on)
  let drawings = 0
  spawning(on)
  on('state.get', (_$, e, next) => {
    if ((e as { key?: string }).key === 'runs') {
      drawings += 1
    }

    return next(e)
  })
  await begin($)
  await launched($, 'wf_t')
  await startedIn($, 'wf_t', 1)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await sceneIn(ui)
  const before = drawings

  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts', agentId: 'wf_t-1' })
  await sceneIn(ui)
  expect(drawings).toBe(before)

  await clock.advance(ACTIVITY)
  expect((await frameIn(ui)).source).toMatch(/<(desc|title)>Step 1: login\.ts/)
  await ui.unmount()
})

test('his next prompt lets go of the steps and runs of what it clears', async ($, on) => {
  const { clock, roster } = world(on)
  const stored: Record<string, unknown> = {}
  spawning(on)
  on('state.set', (_$, e, next) => {
    const { key, value } = e as { key?: string; value?: unknown }

    if (key !== undefined) {
      stored[key] = value
    }

    return next(e)
  })
  await begin($)
  const one = agent('a1', 'Sweep the routes', 'running')
  roster.push(one, agent('a2', 'Still going', 'running'))
  await clock.advance(POLL)
  await $.tool.call({ tool: 'Read', tool_use_id: 'u1', file_path: '/a/login.ts', agentId: 'a1' })
  await $.tool.call({ tool: 'Read', tool_use_id: 'u2', file_path: '/a/routes.ts', agentId: 'a2' })
  await launched($, 'wf_p')
  await startedIn($, 'wf_p', 1)
  await $.tool.call({ tool: 'Read', tool_use_id: 'u3', file_path: '/a/forecast.ts', agentId: 'wf_p-1' })
  await ended($, 'wf_p-1')
  await notified($, 'wf_p')
  one.status = 'completed'
  await clock.advance(POLL)

  await typed($, 'next')

  // The main agent's step stays: its next turn starts it over.
  expect(Object.keys(stored.steps ?? {}).sort()).toEqual(['a2', 'main'])
  expect(Object.keys(stored.runs ?? {})).toEqual([])
})

test('hovering an agent shows a card with its whole task, what it is on and how far along', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Trace the token refresh', 'running'))
  await clock.advance(POLL)
  await reported($, 'a1', 1, 4, 'Reading login.ts')

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const { source } = await frameIn(ui)

  // Hidden until its agent is hovered, and drawn last, over everything else.
  expect(source).toContain('svg:has(.h0:hover) #c0{visibility:visible}')
  expect(source).toMatch(/<g id="cards"><g id="c0" visibility="hidden"/)
  // The words are in the drawing once, for anyone who cannot see the card.
  expect(source.match(/<desc>Trace the token refresh: Reading login\.ts<\/desc>/g)).toHaveLength(1)
  // The card says it, so the surface's own tooltip does not say it again.
  expect(source).not.toContain('<title>')
  await ui.unmount()
})

test('an agent waiting on him is marked in yellow, and one that finishes leaves a tick at its desk', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const one = agent('a1', 'Draft the migration', 'running')
  roster.push(one)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Nothing in the scene is yellow until someone needs him: not this agent's shirt, hair or strip.
  expect((await frameIn(ui)).source).not.toContain('#FBF236')
  expect((await frameIn(ui)).source).not.toContain('id="tick"')

  one.status = 'waiting'
  await clock.advance(POLL)
  expect((await frameIn(ui)).source).toContain('#FBF236')

  one.status = 'completed'
  await clock.advance(POLL)
  expect((await frameIn(ui)).source).toContain('<use href="#tick"')
  await ui.unmount()
})

test('how far along an agent says it is fills the strip at its desk', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Trace the token refresh', 'running'))
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // The strip is three pixels deep and as wide as the partition allows: eleven, at the widest.
  const litOf = async () => (await frameIn(ui)).source.match(/<path fill="#9BDCF0" d="M\d+ \d+h(\d+)v3h-\d+z"\/>/)?.[1]

  // Until it says, the strip is lit whole.
  expect(await litOf()).toBe('11')

  await reported($, 'a1', 1, 4)
  await clock.advance(ACTIVITY)
  expect(await litOf()).toBe('3')

  await reported($, 'a1', 3, 4)
  await clock.advance(ACTIVITY)
  expect(await litOf()).toBe('8')
  await ui.unmount()
})

test('fill screen has a desk for each agent and none to spare, and draws a few of them larger than a crowd', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(agent('a1', 'Task one', 'running'), agent('a2', 'Task two', 'completed'))
  await clock.advance(POLL)

  const pane = await $.ui.mount({
    plugin: 'agent-board',
    component: 'Pane',
    requestId: 'agent-board',
    surface: 'desktop',
    props: { title: 'Agent Board', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
  })
  const desksIn = (source: string): number => source.match(/<use href="#desk"/g)?.length ?? 0
  // How many of the art's pixels the scene is across: the fewer, the larger each is drawn.
  const acrossOf = (source: string): number => Number(/viewBox="0 0 (\d+) /.exec(source)?.[1])
  const few = (await frameIn(pane)).source

  expect(desksIn(few)).toBe(2)

  roster.push(...Array.from({ length: 28 }, (_, n) => agent(`b${n}`, `Other ${n}`, 'running')))
  await clock.advance(POLL)
  const many = (await frameIn(pane)).source

  expect(desksIn(many)).toBe(30)
  expect(acrossOf(many)).toBeGreaterThan(acrossOf(few))
  await pane.unmount()
})

const PANE = (bodyColumns: number, bodyRows: number) =>
  ({
    plugin: 'agent-board',
    component: 'Pane',
    requestId: 'agent-board',
    surface: 'desktop',
    props: { title: 'Agent Board', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

test('a crowd with a lot to say still fits what a surface will take: cards go, then desks, and everyone is still drawn', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(...Array.from({ length: 120 }, (_, n) => agent(`a${n}`, `Trace how the session token is refreshed across every route ${n}`, 'running')))
  await clock.advance(POLL)
  await Promise.all(roster.map((one, n) => reported($, one.id, n % 9, 12, 'Reading the photo upload markup closely')))
  await clock.advance(ACTIVITY)

  const pane = await $.ui.mount(PANE(100, 50))
  const tall = (await frameIn(pane)).source

  expect(tall.length).toBeLessThan(120_000)
  // Fewer than everyone has a desk, and the rest are the tiny cubicles: one mark each.
  const desks = tall.match(/<use href="#desk"/g)?.length ?? 0
  const tiny = /<path fill="#8A8FA3" d="([^"]*)"/.exec(tall)?.[1]?.match(/M/g)?.length ?? 0

  expect(desks).toBeGreaterThan(8)
  expect(desks).toBeLessThan(120)
  expect(desks + tiny).toBe(120)
  await pane.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...BAND.props, bodyColumns: 200 } })
  expect((await frameIn(band)).source.length).toBeLessThan(120_000)
  await band.unmount()
})

test('a run of many stages in a short pane keeps the stage under way in view', async ($, on) => {
  const { clock } = world(on)
  spawning(on)
  await begin($)
  const stages = Array.from({ length: 9 }, (_, n) => `s${n}`)
  const script = `wf_tall export const meta = { phases: [${stages.map(title => `{ title: '${title}' }`).join(', ')}] }`
  await launched($, script)

  // Eight stages over, two failures in each, and a ninth under way.
  for (const [stage, title] of stages.entries()) {
    for (let n = 0; n < 6; n += 1) {
      const index = stage * 10 + n

      await startedIn($, script, index, `${title}:${n}`)

      if (stage < 8) {
        await ended($, `${script}-${index}`, n < 2 ? 'error' : 'answer')
      }
    }
  }

  await clock.advance(POLL)

  const pane = await $.ui.mount(PANE(100, 40))
  const { source, height } = await frameIn(pane)
  const artHeight = Number(/viewBox="0 0 \d+ (\d+)"/.exec(source)?.[1])
  const desks = [...source.matchAll(/<use href="#desk" x="\d+" y="(\d+)"/g)].map(found => Number(found[1]))

  expect(desks).toHaveLength(6)
  expect(Math.max(...desks)).toBeLessThan(artHeight)
  expect(height).toBeLessThanOrEqual(40 * 16.8)
  await pane.unmount()
})

test('a pane too short for a close view is drawn no taller than the pane', async ($, on) => {
  world(on)
  await begin($)
  await $.turn.start({ text: 'fix it', turnId: 't1' })

  for (const rows of [20, 30, 57]) {
    const pane = await $.ui.mount(PANE(100, rows))

    expect((await frameIn(pane)).height).toBeLessThanOrEqual(rows * 16.8)
    await pane.unmount()
  }
})

test('an agent waiting on him is at its desk with its hand up, though the last thing it ran was a command', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  const one = agent('a1', 'Run the suite', 'running')
  roster.push(one)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  one.status = 'waiting'
  await clock.advance(POLL)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'u1', command: 'npm test', description: 'Running the tests', agentId: 'a1' })
  await clock.advance(ACTIVITY)

  const { source } = await frameIn(ui)

  // Nobody walks to the copier, and the yellow mark is over its desk.
  expect(source).not.toContain('fill="freeze"')
  expect(source).toContain('#FBF236')
  await ui.unmount()
})

test('a longer thought does not change how close fill screen is drawn', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push(...Array.from({ length: 16 }, (_, n) => agent(`a${n}`, `Task ${n}`, 'running')))
  await clock.advance(POLL)
  await Promise.all(roster.map(one => reported($, one.id, 1, 4, 'Reading a.ts')))
  await clock.advance(ACTIVITY)

  const pane = await $.ui.mount(PANE(120, 60))
  const acrossOf = async (): Promise<string | undefined> => /viewBox="0 0 (\d+) /.exec((await frameIn(pane)).source)?.[1]
  const before = await acrossOf()

  await Promise.all(roster.map(one => reported($, one.id, 2, 4, 'Reading the photo upload markup closely')))
  await clock.advance(ACTIVITY)
  expect(await acrossOf()).toBe(before)
  await pane.unmount()
})

test('an agent with nothing to its name is drawn without a card, and the drawing stays sound', async ($, on) => {
  const { clock, roster } = world(on)
  await begin($)
  roster.push({ id: 'a1', description: '', type: '', status: 'running' } as AgentInfo)
  await clock.advance(POLL)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const { source } = await frameIn(ui)

  expect(source).not.toMatch(/Infinity|NaN/)
  await ui.unmount()
})
