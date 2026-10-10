import fs from 'node:fs';
import {ulid} from 'ulid';
import {z} from 'zod';
import {failed, isFail, Result, succeeded} from '../model/result-types.js';
import {getOmeDirPath, getProjectFilePath} from '../storage/paths.js';

export const DEFAULT_STATE_BRANCH = '__ome_state__';
const OmeProjectSchema = z.object({
	projectId: z.string().min(1),
	stateBranch: z.string().min(1),
	createdAt: z.iso.datetime(),
});

export type OmeProject = z.infer<typeof OmeProjectSchema>;

export const getProjectFileContents = (): OmeProject => ({
	projectId: ulid(),
	stateBranch: DEFAULT_STATE_BRANCH,
	createdAt: new Date().toISOString(),
});

// ================================
// TODO: memoize readProjectFile
// ================================
export const readProjectFile = (repoRoot: string): Result<OmeProject> => {
	const filePath = getProjectFilePath(repoRoot);

	if (!fs.existsSync(filePath)) {
		return failed('Missing .ome/project.json');
	}

	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const json = JSON.parse(raw) as unknown;

		const result = OmeProjectSchema.safeParse(json);

		if (!result.success) {
			return failed(
				`Invalid .ome/project.json: ${result.error.issues
					.map(issue => `${issue.path.join('.')}: ${issue.message}`)
					.join(', ')}`,
			);
		}

		return succeeded('Read project.json', result.data);
	} catch (error) {
		return failed(
			error instanceof Error
				? `Failed to read .ome/project.json: ${error.message}`
				: 'Failed to read .ome/project.json',
		);
	}
};

export const readProjectId = (repoRoot: string): Result<string> => {
	const result = readProjectFile(repoRoot);
	if (isFail(result)) return failed(result.message);

	return succeeded('Read projectId', result.value.projectId);
};

export const ensureProjectFile = ({
	repoRoot,
	fileContents,
}: {
	repoRoot: string;
	fileContents: OmeProject;
}): Result<null> => {
	const omeDir = getOmeDirPath(repoRoot);
	const projectFilePath = getProjectFilePath(repoRoot);

	try {
		fs.mkdirSync(omeDir, {recursive: true});

		if (fs.existsSync(projectFilePath)) {
			const readResult = readProjectFile(repoRoot);
			if (isFail(readResult)) return failed(readResult.message);

			return succeeded('Project already initialized', null);
		}

		fs.writeFileSync(
			projectFilePath,
			JSON.stringify(fileContents, null, 2) + '\n',
			'utf8',
		);

		return succeeded('Created project.json', null);
	} catch (error) {
		return failed(
			error instanceof Error
				? `Failed to initialize project: ${error.message}`
				: 'Failed to initialize project',
		);
	}
};
