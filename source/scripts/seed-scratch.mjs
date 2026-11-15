// Seeds a throwaway ome project for manual verification, so nothing is ever
// tested against the repo's own board. Prints the project root and the
// OME_GLOBAL_DIR the GUI must run with.
import {seedProject} from '../test/e2e-gui/seed-tui.ts';

const cwd = await seedProject();

console.log(`PROJECT_ROOT=${cwd}`);
console.log(`OME_GLOBAL_DIR=${process.env['OME_GLOBAL_DIR']}`);
