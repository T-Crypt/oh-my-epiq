import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {OME_SKILL, OME_SKILL_PATH} from '../mcp/skill-content.js';

// The bundled copy is what `ome_skill_install` writes into other projects, so
// an edit to the skill that is not regenerated would ship the old rules.
describe('bundled skill', () => {
	it('matches the skill file in this repository', () => {
		const onDisk = fs.readFileSync(
			path.join(process.cwd(), OME_SKILL_PATH),
			'utf8',
		);

		expect(OME_SKILL).toBe(onDisk);
	});
});
