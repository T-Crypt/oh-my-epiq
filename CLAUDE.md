@AGENTS.md

## Claude Code

- **Take a board identity first:** `claude/<name>`, the name the user gave this session. Say `Assuming claude/<name>` in your first line.
- **If this session's ome MCP server never connected,** run your own `npx -y -p ome@latest ome-mcp` over stdio; never borrow another session's. Stop it and its `ome-mcp` child when done.
- **The shipped `ome` skill** (`.claude/skills/ome`) is for anyone using ome on their own board: keep it terse and free of this repository's rules, and regenerate it with `node source/scripts/write-skill.mjs` after editing.
