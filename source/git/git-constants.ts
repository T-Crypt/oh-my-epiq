import {readProjectFile} from '../lib/project-setup/project-setup.js';
import {failed, isFail, Result, succeeded} from '../lib/model/result-types.js';
import {resolveClosestOmeProjectRoot} from '../lib/storage/paths.js';

export const getStateBranch = (cwd: string): Result<string> => {
	const repoRootResult = resolveClosestOmeProjectRoot(cwd);
	if (isFail(repoRootResult)) {
		return failed('Unable to resolve ome project root');
	}
	const projectFileResult = readProjectFile(repoRootResult.value);
	if (isFail(projectFileResult)) return failed('Unable to read project.json');

	return succeeded(
		'Resolved state branch',
		projectFileResult.value.stateBranch,
	);
};
export const ORIGIN = 'origin';
