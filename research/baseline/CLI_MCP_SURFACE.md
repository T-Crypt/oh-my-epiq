# OME CLI / MCP / GUI surface

Recorded 2026-11-15, Phase 0. Tool lists are runtime ground truth
(`tools/list` against `dist/mcp.js` 1.13.0), not source counts.

## MCP server (`ome-mcp`)

Server identity: `{name: "ome", version: 1.13.0}`. Handshake latency
~320 ms (see `TEST_BASELINE.md`). Mutations are serialized through
`exclusiveTool`/`runExclusive`. Reads default to a **brief** view;
`view:full` retrieves depth. Writes accept a full id, a 7-char ref, or (on
writes) a name.

### Default surface (19 tools)

`ome_actor_assume`, `ome_board_list`, `ome_contributor_list`,
`ome_issue_close`, `ome_issue_comment_add`, `ome_issue_comment_delete`,
`ome_issue_comment_edit`, `ome_issue_create`, `ome_issue_get`,
`ome_issue_list`, `ome_issue_note_add`, `ome_issue_note_delete`,
`ome_issue_note_edit`, `ome_issue_reopen`, `ome_issue_stats`,
`ome_issue_update`, `ome_swimlane_list`, `ome_swimlane_move`, `ome_sync`

### Full surface (`OME_MCP_FULL=true`, 36 tools)

The default 19 plus: `ome_board_create`, `ome_board_title_edit`,
`ome_collab_claim`, `ome_collab_list`, `ome_collab_pin`, `ome_collab_post`,
`ome_collab_resolve`, `ome_contributor_remove`, `ome_contributor_restore`,
`ome_issue_attachment_add`, `ome_project_init`, `ome_skill_install`,
`ome_swimlane_create`, `ome_swimlane_delete`, `ome_swimlane_title_edit`,
`ome_tag_remove`, `ome_tag_restore`

### Deliberately not registered

- `ome_state_get` — dumps the whole board plus event log; agents use
  `ome_issue_list`/`ome_issue_get`. The GUI websocket still calls the
  underlying function, so it stays exported.
- `ome_contributor_email_*` — agents never call them; the GUI uses the
  functions directly.

### Identity

`ome_actor_assume` takes `provider/name` and must be called before the first
write. The actor id derives from that identity; the event log file is named
per actor. (The rebuild widens this to `harness/model@machine`; see
`DESIGN.md` §6.)

## CLI (`ome`)

32 command implementations under `source/lib/command-line/commands/`. The
TUI is the primary interactive surface; the CLI commands cover:

- **Boards/lanes:** `checkout-board`, `open`, `new`, `init`
- **Tickets:** `comment`, `close-issue`, `reopen-issue`, `edit`, `peek`,
  `rename`, `tag-ticket`, `untag-ticket`, `yank`
- **People:** `assign-user`, `unassign-user`, `assignable-contributors`,
  `set-emails`, `unclaim-email`
- **Config:** `config`, `set-attachment-max-kb`, `set-auto-sync`,
  `set-auto-sync-duration`, `set-log-level`
- **Git/state:** `sync`, `replay`, `delete`
- **Launchers:** TUI (default), `gui`, `mcp`

CLI conventions: JSON output with versioned schema, predictable exit codes,
concise defaults with `--full` for depth (per `DESIGN.md` §10.1 target —
verify current behaviour against that list in Phase 5).

## GUI (`ome gui`)

- Server: `source/gui/api/instance.ts`, port `OME_GUI_PORT` or 3710,
  loopback by default.
- Remote access: `--access local|lan|tailscale|cloudflare`, `--allow-host`,
  `--rotate-token`; owner token + single-use pairing codes (QR) for non-local
  browsers (`gui/api/lib/remote-access.ts`, `origin-guard.ts`).
- Client: React in `source/gui/client/` (PocketShell rail, phone tabs, lane
  pager, Devices, theme switcher). Built to `dist/gui`.
- Live updates over websocket (`gui/api/lib/websocket.ts`), which is also
  where the GUI calls the unregistered `state_get`/stats functions directly.

## Skill

`skills/ome/SKILL.md` is the long-form agent workflow; it is baked into
`source/mcp/skill-content.ts` at build time and offered via
`ome_skill_install`. The MCP server's `OME_INSTRUCTIONS` carry the short form
to every client on connect.
