# Oh-My-Epiq is a fork of Epiq

Oh-My-Epiq (OME) is a **hard fork** of [Epiq](https://github.com/ljtn/epiq) by
[Jonatan Lampa (@ljtn)](https://github.com/ljtn), used and redistributed under
the MIT license. Epiq is the upstream project; OME is an independent,
opinionated continuation that keeps Epiq's engine, event model and interfaces
and layers operator- and agent-facing tooling on top.

## What we inherited

- The event-sourced, Git-backed state model and the `__epiq_state__` on-disk
  format (OME migrates it to `__ome_state__`, see below).
- The terminal UI and the browser board.
- The MCP server and its tool surface (rebranded `epiq_*` → `ome_*`).
- The commit⇄ticket linking convention and the code-diff review flow.

## What we changed

- Rebranded the product, binaries (`epiq`/`epiq-mcp` → `ome`/`ome-mcp`),
  package (`epiq` → `oh-my-epiq`), environment variables (`EPIQ_*` → `OME_*`),
  on-disk paths (`~/.epiq-global` → `~/.ome-global`, `.epiq/` → `.ome/`) and the
  state branch (`__epiq_state__` → `__ome_state__`).
- `ome migrate` performs that move safely for existing boards, with a dry run,
  a backup and a rollback path.
- The GUI and TUI adopt the Oh-My-Pi (OMP) visual language so the two read as
  siblings.
- Net-new operator and agent features live on top of the upstream engine.

## Upstream remote

This repository keeps the original history. The upstream is configured as a
remote for cherry-picking fixes:

```bash
git remote add upstream https://github.com/ljtn/epiq.git   # if missing
git fetch upstream --tags
git log upstream/main --oneline | head
```

As a hard fork we do **not** rebase onto upstream; we cherry-pick what we want.

## Credit

If you like OME, star the upstream: <https://github.com/ljtn/epiq>. All credit
for the original design and engine belongs to Jonatan Lampa and the Epiq
contributors.
