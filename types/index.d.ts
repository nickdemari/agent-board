/** The engine's AgentStatus, and `gone`: the engine dropped the agent before the board saw how it ended. */
export type BoardStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed' | 'gone'

export type BoardAgent = {
  id: string
  label: string
  /** The agent type it was spawned as: what it wears on the board. */
  kind: string
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
  /** The percent it stood at before its latest move, so the next drawing walks it over; null with no report yet. */
  from: number | null
  /** It finished since the board last changed: the one drawing that throws it a party. */
  isFresh: boolean
  startedAt: number
  endedAt: number | null
  /** Ended and passed by the person's next prompt: off the board, kept so the next poll does not add it back. */
  isCleared: boolean
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
      isExpanded: boolean
      plan: PlanStep[]
    }
  }
}
