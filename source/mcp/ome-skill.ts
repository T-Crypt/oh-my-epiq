import fs from 'node:fs';
import path from 'node:path';
import {getRepoRootDir} from '../git/git-storage.js';
import {execGit} from '../git/git-utils.js';
import {failed, isFail, Result, succeeded} from '../lib/model/result-types.js';
import {OME_SKILL, OME_SKILL_PATH} from './skill-content.js';

type InstallSkillInput = {
	repoRoot?: string;
	force?: boolean;
};

const SKILL_DIR_PATTERN = `${path.posix.dirname(OME_SKILL_PATH)}/`;

/**
 * Lists the skill directory in the clone's own exclude file, so the installed
 * copy stays out of `git status` and can never be committed by accident. The
 * exclude file is local to the clone: nothing about the project changes.
 */
const excludeSkillLocally = async (repoRoot: string): Promise<Result<void>> => {
	const excludeResult = await execGit({
		args: ['rev-parse', '--git-path', 'info/exclude'],
		cwd: repoRoot,
	});
	if (isFail(excludeResult)) return failed(excludeResult.message);

	const excludePath = path.resolve(repoRoot, excludeResult.value.stdout.trim());

	try {
		const existing = fs.existsSync(excludePath)
			? fs.readFileSync(excludePath, 'utf8')
			: '';
		const listed = existing
			.split('\n')
			.some(line => line.trim() === SKILL_DIR_PATTERN);
		if (listed) return succeeded('Skill already excluded', undefined);

		const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
		fs.mkdirSync(path.dirname(excludePath), {recursive: true});
		fs.writeFileSync(
			excludePath,
			`${existing}${separator}${SKILL_DIR_PATTERN}\n`,
			'utf8',
		);
	} catch (error) {
		return failed(
			error instanceof Error
				? `Failed to update ${excludePath}: ${error.message}`
				: `Failed to update ${excludePath}`,
		);
	}

	return succeeded('Excluded skill from commits', undefined);
};

/**
 * Writes the optional ome workflow skill into one clone, for a session that
 * wants the written rules at hand. The board works without it: the server's
 * own instructions carry the rules every client needs. The copy is local to
 * the clone and excluded from commits. Never boots: a repository gets its
 * skill before or after it gets its board.
 */
export const installSkill = async (
	input: InstallSkillInput = {},
): Promise<Result<{path: string; written: boolean}>> => {
	const repoRootResult = await getRepoRootDir(input.repoRoot ?? process.cwd());
	if (isFail(repoRootResult)) return failed(repoRootResult.message);

	const skillPath = path.join(repoRootResult.value, OME_SKILL_PATH);

	const excluded = await excludeSkillLocally(repoRootResult.value);
	if (isFail(excluded)) return failed(excluded.message);

	if (fs.existsSync(skillPath)) {
		const existing = fs.readFileSync(skillPath, 'utf8');

		if (existing === OME_SKILL) {
			return succeeded('Skill already installed and up to date', {
				path: skillPath,
				written: false,
			});
		}

		if (!input.force) {
			return failed(
				`${OME_SKILL_PATH} already exists and differs from the bundled skill. Pass force:true to overwrite it.`,
			);
		}
	}

	try {
		fs.mkdirSync(path.dirname(skillPath), {recursive: true});
		fs.writeFileSync(skillPath, OME_SKILL, 'utf8');
	} catch (error) {
		return failed(
			error instanceof Error
				? `Failed to write ${OME_SKILL_PATH}: ${error.message}`
				: `Failed to write ${OME_SKILL_PATH}`,
		);
	}

	return succeeded(
		`Installed skill at ${OME_SKILL_PATH}, local to this clone and excluded from commits`,
		{
			path: skillPath,
			written: true,
		},
	);
};
