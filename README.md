# Oh-My-Epiq

> **The Epiq you love, with batteries included.**

Oh-My-Epiq (**OME**) is a local-first, Git-backed issue tracker with a terminal
UI, a browser board, and an MCP server for agents. It is a hard fork of
[Epiq](https://github.com/ljtn/epiq) by [@ljtn](https://github.com/ljtn) —
same engine, same event model, same interfaces — with the operator and agent
tooling we wanted on top.

State is an immutable, append-only event log, versioned and synchronized over
Git. No accounts, no SaaS, no database. Your board lives next to your code and
travels with it.

![Oh-My-Epiq: the board, the event log, and a ticket's code diff under the time-travel timeline](source/assets/time-travel.jpeg)

## Batteries included

Everything upstream Epiq does, plus:

- **One board for all your projects** — a portfolio view across every repo you
  have opened (built on `~/.ome-global/worktrees/*`), no checkout required.
- **Lifecycle status as a first-class field** — `idea · planned · in-flight ·
  maintenance-staged · maintenance-done · support · parked`.
- **Notes and a priority board** — capture loose thoughts and rank work P0–P3
  without fighting the ticket schema.
- **Assign work to agents** — tell an agent which ticket is its own; it assumes
  an identity and signs its events.
- **Instructions on a ticket** — a dedicated field for "how to do this", kept
  separate from the description and the comment thread.
- **MCP ergonomics** — every tool that writes accepts a full id *or* a `ref`,
  removals accept names, and errors say what to pass.
- **Create projects from the WebUI** — point it at a repo and go.

## What it inherits from Epiq

- **Workflow replay** — rewind the board and watch what happened while you were
  away, as if it were happening now.
- **Code linked to tickets** — prefix a commit subject with a ticket's `ref`
  and the diff shows up on the ticket. Comment on selected lines; file a
  ticket straight from a selection.
- **Event-sourced, conflict-light state** — append-only per-user logs merged
  deterministically, so concurrent work converges.
- **Repo-native, offline-friendly, fast, portable, command driven.**

![The OME terminal UI: the same board in a terminal, with the command palette](source/assets/tui.jpeg)

## Install

Not published to npm yet. Install from the repository:

```bash
npm install --global git+https://github.com/T-Crypt/oh-my-epiq.git
```

Or from a clone:

```bash
git clone https://github.com/T-Crypt/oh-my-epiq.git
cd oh-my-epiq
npm install
npm run build:npm
npm link          # exposes `ome` and `ome-mcp`
```

Verify:

```bash
ome --version
```

## Getting started

Inside any Git repository:

```bash
ome
```

First run opens the interactive setup wizard. That is it.

Launch the browser board with:

```bash
ome gui
```

On a machine with no display, or with `--no-open`, it serves without opening a
browser; open the URL it prints.

> Setup writes your user config to `~/.ome-global/config.json`.
>
> Initialization creates:
>
> - Project definition in `./.ome/project.json`
> - Authoritative Git state at `~/.ome-global/worktrees/<id>` (branch
>   `__ome_state__`)
> - A `.gitignore` entry for local-only `.ome/log/`
> - A local debug log at `.ome/log/ome.log`

## Coming from Epiq?

OME renames the on-disk surface, so point it at your existing boards once:

```bash
ome migrate --dry-run   # print the plan
ome migrate             # back up, rename, move the state branch, verify
```

The migration backups `~/.epiq-global`, creates `__ome_state__` at the same
commit as `__epiq_state__`, rewrites `.epiq/` → `.ome/` and
`~/.epiq-global/` → `~/.ome-global/`, and prints a rollback. Environment
variables were renamed too (`EPIQ_*` → `OME_*`); the old names are still read
with a deprecation warning.

## MCP for agents

OME ships an MCP server, `ome-mcp`. The reliable way to register it with
Claude Code:

```bash
claude mcp add --scope user ome -- /absolute/path/to/ome-mcp
```

For hand-edited clients:

```json
{
	"mcpServers": {
		"ome": {
			"command": "/absolute/path/to/ome-mcp"
		}
	}
}
```

Tools are namespaced `ome_*` (`ome_issue_create`, `ome_issue_move`,
`ome_board_list`, …). The board workflow skill lives at
`.claude/skills/ome/SKILL.md`; `ome_skill_install` writes it into any repo that
lacks it.

## How state is synchronized

OME uses Git in the background — no manual Git commands. `ome` writes to an
append-only event log on a dedicated state branch (`__ome_state__`) via a Git
worktree, isolated from your working tree. Running `:sync` (or `ome sync`)
merges and publishes. Project metadata lives in `.ome/project.json`.

Events use time-sortable ULIDs plus an edge reference to the last known event,
so concurrent edits converge deterministically and merges stay trivial.

## Credit

Oh-My-Epiq is a fork of [Epiq](https://github.com/ljtn/epiq) by
[@ljtn](https://github.com/ljtn). The engine, the event model and the original
design are his. If this is useful, go star the upstream. See
[UPSTREAM.md](UPSTREAM.md) for the full fork relationship.

MIT licensed — see [LICENSE](LICENSE).

Never leave your editor.
