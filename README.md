# Oh-My-Epiq

> **The Epiq you love, with batteries included.**

Oh-My-Epiq (**OME**) is a local-first, Git-backed issue board with four faces —
a **CLI** (`ome`), a **terminal UI**, a **browser board** (`ome gui`) and an
**agent MCP server** (`ome-mcp`). It is a hard fork of
[Epiq](https://github.com/ljtn/epiq) by [@ljtn](https://github.com/ljtn):
the same engine, the same event model, the same interfaces, with the operator
and agent tooling we wanted layered on top.

State is an immutable, append-only event log, versioned and synchronized over
Git. No accounts, no SaaS, no database. Your board lives next to your code and
travels with it.

![Oh-My-Epiq: the board, the event log, and a ticket's code diff under the time-travel timeline](source/assets/time-travel.jpeg)

## Batteries included

Every upstream Epiq feature, plus the operator and agent surface:

- **Four surfaces, one state** — CLI, TUI, browser board and MCP all read and
  write the same event log, so an agent's change shows up on your board
  instantly.
- **A migration from Epiq** — `ome migrate` renames the on-disk surface
  (`~/.epiq-global` → `~/.ome-global`, `.epiq/` → `.ome/`, `__epiq_state__` →
  `__ome_state__`) with a dry run, a backup and a printed rollback. Dry-run
  first; see [Coming from Epiq?](#coming-from-epiq).
- **A clean agent MCP** — every tool that writes takes a full id _or_ a 7-char
  `ref`; adding a tag or an assignee a ticket already has is an idempotent
  no-op; removals accept a name; errors say what to pass. The footguns and the
  four admin tools agents never call are pruned from the surface.
- **An OMP sibling theme** — the GUI and TUI wear the Oh-My-Pi visual language
  (near-black ground, magenta accent, cyan→violet→magenta mark), so the two
  products read as one family.
- **A board workflow skill** — `.claude/skills/ome/SKILL.md` teaches an agent
  to take an identity, sync on demand and keep tickets current.

![The OME terminal UI: the same board in a terminal, with the command palette](source/assets/tui.jpeg)

## Roadmap

The fork ships the engine and the agent surface first. These operator features
are designed and tracked but **not implemented yet**:

- **Global portfolio board** — every project's tickets in one view, across
  boards, with the active project highlighted.
- **Lifecycle status** — an explicit, ordered phase
  (`idea · planned · in-flight · maintenance-staged · maintenance-done ·
support · parked`) that drives a status view on the board.
- **Notes and priority boards** — capture loose thoughts and rank work P0–P3
  without fighting the ticket schema.
- **Instructions on a ticket** — a structured "what to do" block, distinct from
  the description and the comment thread, so handoff to an agent is
  unambiguous.
- **New-project creation from the WebUI** — point the board at a repo and go,
  without dropping to the TUI for `:init`.

The description in this README is the system of record for what ships; the
roadmap above is the honest list of what does not.

## What it inherits from Epiq

- **Workflow replay** — rewind the board and watch what happened while you were
  away, as if it were happening now.
- **Code linked to tickets** — prefix a commit subject with a ticket's `ref`
  and the diff shows up on the ticket. Comment on selected lines; file a ticket
  straight from a selection.
- **Event-sourced, conflict-light state** — append-only per-user logs merged
  deterministically, so concurrent work converges.
- **Repo-native, offline-friendly, fast, portable, command driven.**

## Install

OME is not published to npm yet, and a direct
`npm install --global git+https://github.com/T-Crypt/oh-my-epiq.git` **does not
work**: the build runs on `prepack`, while a Git install runs `prepare` (which
only sets up husky), so the `dist/` the package needs is never produced.
Install from a clone or a packed tarball instead.

From a clone — builds `dist/`, then links the bins:

```bash
git clone https://github.com/T-Crypt/oh-my-epiq.git
cd oh-my-epiq
npm install
npm run build:npm
npm link          # exposes `ome` and `ome-mcp`
```

From a packed tarball — `npm pack` runs the build, then install it under a
pinned prefix:

```bash
npm pack          # writes oh-my-epiq-<version>.tgz and runs the build
npm install -g --prefix ~/.local/share/ome-mcp-npm ./oh-my-epiq-*.tgz
# ~/.local/share/ome-mcp-npm/bin/{ome,ome-mcp}
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
browser; open the URL it prints. The board serves on loopback by default
(port 3710) and is exposed to the tailnet only via `tailscale serve`.

> Setup writes your user config to `~/.ome-global/config.json`.
>
> Initialization creates:
>
> - Project definition in `./.ome/project.json`
> - Authoritative Git state at `~/.ome-global/worktrees/<id>` (branch
>   `__ome_state__`)
> - A `.gitignore` entry for local-only `.ome/log/`
> - A local debug log at `.ome/log/ome.log`

Act as somebody other than the configured user (for an agent or a second
operator):

```bash
ome --as claude
```

## Coming from Epiq?

OME renames the on-disk surface, so point it at your existing boards once:

```bash
ome migrate            # plan only — changes nothing
ome migrate --apply    # back up, rename, move the state branch, verify
```

The migration backs up `~/.epiq-global`, creates `__ome_state__` at the same
commit as `__epiq_state__`, rewrites `.epiq/` → `.ome/` and
`~/.epiq-global/` → `~/.ome-global/`, and prints a rollback. Environment
variables were renamed too (`EPIQ_*` → `OME_*`); the old names are still read
with a deprecation warning. A half-migrated board still reads: diff comments
accept legacy `epiq-` markers and commit refs accept both `[epiq:` and `[ome:`.

`ome migrate` is a one-way door. Always run the dry run first, and never run
`--apply` against a board you have not named.

## MCP for agents

OME ships an MCP server, `ome-mcp`, speaking stdio. Register it with Claude
Code:

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
`ome_board_list`, …). Every write accepts a ticket by full id or by `ref`.
`ome_sync` is the only tool that touches the network; sync is on demand. Take
an identity (`ome_actor_assume`, `provider/name`) before your first write.

The board workflow skill lives at `.claude/skills/ome/SKILL.md`;
`ome_skill_install` writes it into any repo that lacks it.

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
