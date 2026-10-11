// Bundles the optional ome workflow skill into the MCP server, so
// `ome_skill_install` can write it into a project from the published package,
// which ships only `dist`. Regenerated on every build; a unit test fails when
// the committed output lags the skill file.
import fs from 'node:fs';

const skillSource = 'skills/ome/SKILL.md';
const skillFile = new URL(`../../${skillSource}`, import.meta.url);
const outFile = new URL('../mcp/skill-content.ts', import.meta.url);

const skill = fs.readFileSync(skillFile, 'utf-8');

const content = `// Auto-generated from ${skillSource} by write-skill.mjs. Do not edit.
export const OME_SKILL_SOURCE_PATH = '${skillSource}';
export const OME_SKILL_PATH = '.claude/skills/ome/SKILL.md';
export const OME_SKILL = ${JSON.stringify(skill)};
`;

fs.writeFileSync(outFile, content);

console.log(`Wrote skill-content.ts from ${skill.length} characters of SKILL.md`);
