# Working in Oh-My-Epiq (OME)

OME is a local-first, git-backed issue board with four faces — a CLI, a TUI, a
browser board, and an MCP server — forked from [Epiq](https://github.com/ljtn/epiq)
by Jonatan Lampa and rebranded. This repository is a **hard fork**; see
`UPSTREAM.md` for the fork relationship and `LICENSE` for attribution.

Product direction and in-progress design live in `docs/VISION.md`. That file is
operator-only and gitignored, so it may be absent in a fresh clone.

## Read first

- `UPSTREAM.md` — what this fork is and how it relates to upstream.
- `.claude/skills/ome/SKILL.md` — the board workflow every agent follows.
- `docs/VISION.md` — where the product is going (local only, if present).

## Remotes

- `origin` — `T-Crypt/oh-my-epiq`, **private**. Everything you commit lands here.
- `upstream` — `ljtn/epiq`. Fetch and cherry-pick only. Never push, never force.

## Shape of the code

One npm package.

- `source/mcp/` — the MCP server (`ome_*` tools) and its API layer.
- `source/gui/` — the browser board (API server plus React client).
- `source/lib/` — model, state, board/event log, storage, config, utilities,
  and `lib/migration/` (Epiq → OME migration).
- `source/git/` — the state-branch worktree and sync.
- `source/export/`, `source/scripts/` — export and build helpers.

Commands:

- `npx ome gui` — the browser board. `ome migrate` plans an Epiq → OME
  migration and changes nothing; `ome migrate --apply` carries it out.

Build and verify before any commit:

- `npx tsc --noEmit`
- `npm run build:npm` — writes `dist/index.js` and `dist/mcp.js`, and regenerates
  `source/version.ts` and `source/mcp/skill-content.ts` from `package.json` and
  the skill.
- `npx vitest run` for the unit suite. The GUI e2e suite needs a browser and a
  test server and is not expected to pass on a bare box.

## The state model (do not bypass)

- One append-only event log per user, git-synced on the `__ome_state__` branch
  through a worktree at `~/.ome-global/worktrees/<projectId>`.
- A project's descriptor is `.ome/project.json`; recent projects live in
  `~/.ome-global/recent-projects.json`.
- **Never** edit the state branch, its worktree, or the event log by hand — every
  read and write goes through the MCP or an API. The log is the system of record;
  an edit made outside it bypasses validation and ordering and can corrupt
  history in ways no later fix can undo.
- **The one exception is `source/lib/migration/migrate-epiq.ts`.** Migrating an
  Epiq board renames the log's location, which git can only record as a commit
  on the state branch — that is the migration's job and nobody else's. It is
  not an MCP tool: an agent must never start a migration. Dry-run first
  (`ome migrate`), apply only with `ome migrate --apply`, and never run it
  against a board the operator has not named.

## MCP surface rules

- The registration list in `source/mcp/server.ts` is pruned deliberately —
  `ome_state_get` and `ome_contributor_email_*` are not registered because
  agents never call them; the GUI uses their functions directly. Do not call
  or re-add them for agents.
- Writes accept a ticket by its full id **or** its 7-character ref.
- Adding a tag or an assignee a ticket already has is an idempotent no-op, never
  an error, and writes nothing.
- `ome_issue_tag_remove` takes the tag by id or by name (`tagId`/`tagName`).
- Sync is on demand (`ome_sync`); no other tool touches the network.
- Take an identity (`ome_actor_assume`, `provider/name`) before your first write.
- Prefix commit subjects with the ticket `ref` — never derive the ref from the id.

## Conventions

- **Structure over features:** extend through the existing plugin, descriptor,
  config or CLI points. Never hardcode an engine, harness or project name in
  core, and never add a second way to do one thing. If a request would do either,
  say so and propose the extension point first.
- **Preserve upstream attribution:** keep `ljtn/epiq` URLs, the stacked
  `LICENSE`, and the `upstream` remote intact.
- **Rebrand map (`epiq` → `ome`) for cherry-picks:** the module names, env
  (`OME_*`), on-disk paths (`.ome`, `~/.ome-global`), the state branch
  (`__ome_state__`) and the tool names all moved. Behaviour did not. Re-apply the
  rename after any upstream merge.
- This repository is private while it is under active development.
