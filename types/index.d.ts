/** The engine's AgentStatus, and `gone`: the engine dropped the agent before the board saw how it ended. */
export type BoardStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed' | 'gone'

export type BoardAgent = {
  id: string
  label: string
  /** Its place in the party, which picks its color. Held for as long as it is on the board. */
  seat: number
  status: BoardStatus
  /** What goes in its bubble, as of its last report: what it said it was doing, else its step then. */
  thought: string
  /** The time left as of that report, in words. The bubble's copy does not tick, so the scene is not redrawn for it. */
  left: string
  /** Steps it says it has finished, of the steps it says it expects; total 0 until it first reports. */
  done: number
  total: number
  /** It finished since the board last changed: the one drawing that flies its report to the pile. */
  isFresh: boolean
  startedAt: number
  endedAt: number | null
  /** Ended and passed by the person's next prompt: off the board, kept so the next poll does not add it back. */
  isCleared: boolean
  /** The workflow run it is part of, which the engine's list does not name; '' for any other agent. */
  run: string
  /** Which burst of agents in its run it started with: a run that went quiet and then started more has moved on. */
  wave: number
  /** Its latest tool was a command, which it runs at the copier. */
  atCopier: boolean
  /** Its own turn said how it ended. A list that still calls it busy is behind, and only its next turn brings it back. */
  isSettled: boolean
}

/** One stage of a workflow, as its script's `meta` lists it. */
export type BoardStage = { title: string; detail: string }

/** One workflow run, as far as the board can tell from outside it. */
export type BoardRun = {
  name: string
  /** The background task it runs as, which its notification names when it ends. */
  task: string
  /** How it ended; '' until then, even with all its agents done, since the script may yet start more. */
  ended: '' | 'completed' | 'failed' | 'killed'
  endedAt: number
  stages: BoardStage[]
}

/** One step of the main agent's own task list. */
export type PlanStep = { content: string; status: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-board': {
      agents: Shaped<BoardAgent[]>
      now: number
      /** The latest step of each agent, which only the terminal's rows read: the scene must not redraw for a step. */
      steps: Record<string, string>
      /** The steps of a run's agents as the scene shows them, taken from `steps` no more often than its other news. */
      seen: Record<string, string>
      isExpanded: boolean
      plan: PlanStep[]
      runs: Record<string, BoardRun>
      tick: number
    }
  }
}
