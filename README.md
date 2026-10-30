# Agent Board

A Claude Code mod that turns a session's subagents into a small pixel-art party walking toward a flag. It sits above the prompt box in the desktop app, so you can see how your agents are doing without reading their transcripts.

<p align="center"><img src="docs/scene.svg" alt="Four pixel-art agents on a path to a flag, each with a thought bubble saying what it is doing, its percent done and the time left."></p>

## What it does

- **How far along:** an agent stands as far down the path as its percent done.
- **What it's doing:** each agent has a thought bubble with what it says it's on, its percent and the time left.
- **Its status is its pose:** walking, sitting while it waits, asleep when idle, or knocked out under a storm cloud when it fails. Failures stay on the board until your next prompt.
- **What kind of agent:** the outfit shows the type. The crown is the main agent, a knight is general-purpose or a workflow's agent, a ranger is Explore or scout, a wizard is Plan, and a bandana is anything else.
- **Finishing:** it hops at the flag and gets one burst of confetti.
- **Workflows:** a workflow run is one squad, with its name and how many of its agents are done so far. Its count can grow as the script decides what to do next, and it sits at the flag between stages until the run is over.
- **Past 12 agents:** the rest fold into one squad the same way, so nobody drops off the board.
- **Fill screen:** the button above the scene, or `/agent-board`, opens it in a pane with a taller sky. Mods can't cover the whole window, so a pane is as large as it gets.

With no agents running, the band shrinks to a campfire and one line. In a terminal session you get plain text rows instead of the scene.

## How the numbers work

Claude Code doesn't track how far along an agent is, so the mod asks. It adds one sentence to each new agent's brief and a small `progress` tool, and agents report their steps and what they're doing.

- **Percent** is steps finished out of steps the agent expects, by its own count. For the main agent it comes from its task list, when it keeps one.
- **Time left** is a straight-line estimate from how long the finished steps took. It updates when the agent reports and doesn't tick in between.
- **A workflow's agents** aren't asked, since their squad only counts them, which saves dozens of agents the tokens.
- **An agent that can't or doesn't report**, such as one with a fixed tool list, paces around camp instead of walking toward the flag, because nobody knows how far along it is.

This costs a few tokens per report, plus about 100 tokens for the tool's schema on each request.

## Install

At the prompt of a terminal session:

```
/plugin install agent-board --marketplace nickdemari/agent-board
```

Answer `y` to add the marketplace, then choose a scope.

From a shell:

```bash
claude plugin install agent-board --marketplace nickdemari/agent-board
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nickdemari/agent-board`, then Add plugin.

Agent Board is written against the function-hooks plugin API of Claude Code 2.1.310. That API is early access: it can change between releases, and whether hooks modules load at all depends on your version and account. It draws in the same band as other mods that use the space above the prompt, so one can hide another.

## Checking a change

```bash
claude plugin validate .
claude plugin test .
```

## License

MIT
