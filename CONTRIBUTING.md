# Contributing

You do not need OME to contribute. Open a pull request the usual way and it
will be reviewed. Using the board is suggested, because it shows what is in
flight and what is free to pick up.

## Using the board

Add the MCP server to your agent harness on your own machine (see "MCP for
agents" in `README.md`). Nothing is installed in the repository. On connect the server
tells the agent how the board works, and `ome gui` or the `ome` TUI shows you
the same board.

The workflow:

- **Lanes.** A ticket moves left to right through the board's swimlanes as
  work progresses. Move it when its state changes.
- **Picking up.** Read the ticket's comments, assign yourself, and move it to
  the in-progress lane. Ask before taking a ticket assigned to someone else.
- **Tickets stay small.** One independent unit of work each. A small follow-up
  goes on the ticket it belongs to.
- **Commits.** Start the subject with the ticket's `ref`, the 7-character code
  the board shows. Rebase onto `main`; no merge commits.
- **Done.** Add a comment that starts with `Solution:` and says what landed.
- **Sync.** The board syncs on demand (`ome_sync`, or the sync action in the
  GUI and TUI).

## The optional skill

`skills/ome/SKILL.md` holds the same workflow at full length, for agents that
load skills. To use it in one clone, ask your agent to run `ome_skill_install`,
or copy the file to `.claude/skills/ome/SKILL.md` yourself. The installed copy
is local: `ome_skill_install` lists it in `.git/info/exclude`. Do not commit
it, here or in any project that uses OME.

## Before you open a pull request

- `npx tsc --noEmit`
- `npm run build:npm`
- `npx vitest run --exclude "source/test/e2e/**" --exclude "source/test/e2e-collab/**"`
- `npx prettier --write` on the files you touched
