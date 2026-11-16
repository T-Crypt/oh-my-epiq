# OME baseline — repository, package, data layout

Recorded 2026-11-15, Phase 0. All values verified on this machine that day.

## Repository identity

| Item                      | Value                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Clone                     | `/home/tcrypt/projects/oh-my-epiq`                                                                     |
| Branch at baseline        | `main` @ `6eb002d4639c1f25f33a2a5132f83cd672fd0db0` (2026-10-15, merge of PR #38)                      |
| Remotes                   | `origin` = `T-Crypt/oh-my-epiq` (public), `upstream` = `ljtn/epiq`                                     |
| Fork base                 | tag `base-vendor` = Epiq v1.12.4 (`5fdc5110`)                                                          |
| Upstream HEAD at baseline | `d66d1db7` (v1.17.1) — 246 commits ahead, see `research/DESIGN.md` §4                                  |
| State branch              | `__ome_state__` (tracked locally and on origin)                                                        |
| Other local branches      | `Q5Q98AA-ignore-local-state` (work branch), `research/rebrand-rebuild` (this work)                     |
| Untracked at baseline     | `.router/` (operator scratch, dated 2026-10-13/15, preserved, not touched) and `research/` (this work) |

## Package

| Item              | Value                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name / version    | `oh-my-epiq` 1.13.0                                                                                                                                                                                |
| License           | MIT (stacked: 2025 Jonatan Lampa + contributors)                                                                                                                                                   |
| Runtime           | Node >= 18, ESM, TypeScript                                                                                                                                                                        |
| Bins              | `ome` (dist/index.js, 404 KB minified), `ome-mcp` (dist/mcp.js, 340 KB minified)                                                                                                                   |
| Build             | esbuild bundle + React GUI build; `source/version.ts` and `source/mcp/skill-content.ts` regenerated from package.json and the skill at build time                                                  |
| Runtime deps (16) | @modelcontextprotocol/sdk, @pierre/diffs, @xterm/headless, ink, meow, qrcode-generator, react, react-dom, react-markdown, react-router-dom, remark-breaks, remark-gfm, string-width, ulid, ws, zod |

Installed copy: `~/.local/share/ome-mcp-npm/bin/{ome,ome-mcp}` (installed 2026-10-16, v1.13.0) but the `~/.local/bin` symlinks are **missing** — the installed product is orphaned, not on PATH. Recorded, not touched.

## Data layout (on-disk)

```
~/.ome-global/
├── config.json                 global config
├── gui-access.json             GUI remote-access state (tokens, pairing)
├── recent-projects.json        12 registered projects
└── worktrees/<projectId>/      one git worktree per project, checked out on __ome_state__
    └── .ome/
        ├── project.json        {projectId, stateBranch, createdAt}
        └── events/
            └── <actorId>[.<name>].jsonl     one append-only log per actor
```

12 registered projects; 5 have active worktrees:

| Project                  | Root                      | Events since 2026-08-15 |
| ------------------------ | ------------------------- | ----------------------- |
| 01M3AWFV… (homelab)      | `~/homelab`               | 2,070                   |
| 01M4RR9X… (oh-my-epiq)   | `~/projects/oh-my-epiq`   | 58                      |
| 01M5A41P… (berth)        | `~/projects/berth`        | 15                      |
| 01M4TVK0… (oh-my-pocket) | `~/projects/oh-my-pocket` | 5                       |
| 01M4YBQB… (InfraSuite)   | `~/projects/InfraSuite`   | 3                       |

The homelab board is the only heavily used board and the reference workload
for benchmarks (see `TEST_BASELINE.md`).

## Event format

`source/lib/event/event-envelope.ts`. One JSON line per event:

```json
{
	"v": 1,
	"id": ["<eventId>", "<parentId|null>"],
	"add.issue": {"id": "…", "parent": "…", "name": "…"}
}
```

- Envelope is `{v, id:[eventId, refId|null]}`; the payload sits under the
  action-name key.
- `SCHEMA_VERSION = 1`. `READABLE_SCHEMA_VERSIONS = [1]`, with a
  **compile-time assertion** that the current version is in the readable list.
- Only one legal root: the `init.workspace` event. Any other event with
  `refId: null` is treated as forgeable and anchored with the orphans
  (`event-load.ts`, `sortEvents`).
- A line carrying an own `__proto__` key is stripped on parse (documented
  attack: a peer could otherwise splice a line that reorders history).
- Envelope parsing on the hot path is hand-rolled (not zod) for speed; a test
  pins it to the zod schema so both agree.

43 event actions, 9 entity kinds (workspace, board, swimlane, issue/ticket,
field, tag, contributor, plus collaboration messages). Full list in
`ARCHITECTURE_MAP.md`.

## Migration

`source/lib/migration/migrate-epiq.ts` (+ test). One-way Epiq → OME move:
`~/.epiq-global` → `~/.ome-global`, `__epiq_state__` → `__ome_state__`,
`.epiq/` → `.ome/`, with dry-run, backup, and printed rollback. This is the
only sanctioned writer to the state branch outside the normal event path. The
Cairn rebuild inherits this as the second migration hop (OME → Cairn); see
`DESIGN.md` §9 Phase 7.

## Migration risks (baseline view)

1. **Duplicate-write bloat**: the homelab board's `tp6w3ve8…jsonl` holds 4
   event ids each written 108× (428 redundant lines, 20.7% of the file).
   Board rendering is unaffected (materialization dedupes by id), but any
   migration that copies lines instead of events will carry the bloat forward.
   See `TEST_BASELINE.md` for details.
2. **Pending logs**: crash-safe writes park lines in `<actorId>~pending.jsonl`
   until flushed (`event/pending-log.ts`). One exists on the homelab board
   (pi, 2026-11-10, never flushed). A migration must account for pending lines
   or they are lost.
3. **Unpublished events**: pending lines that were never committed to the
   state branch are invisible to a fresh clone. Sync state is per-machine.
4. **Multi-actor logs**: one file per actor; a board is the union of all actor
   logs. Identity is the file name (`<id>`, `<id>.<name>`, or legacy
   `<id>.<name>.jsonl`).
