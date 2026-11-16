// Pure preflight checks for the migration.

export interface PreflightInput {
	frozen: boolean;
	pendingLineCount: number;
	strandedFileNames: string[];
	duplicateEventCount: number;
}

export interface CheckResult {
	name: string;
	pass: boolean;
	detail: string;
}

export interface PreflightReport {
	freezeGate: CheckResult;
	pendingLog: CheckResult;
	strandedLog: CheckResult;
	duplicateEvents: CheckResult;
	pass: boolean;
}

export function runPreflight(input: PreflightInput): PreflightReport {
	const freezeGate: CheckResult = {
		name: 'freezeGate',
		pass: input.frozen === true,
		detail: input.frozen ? 'frozen' : 'not frozen',
	};
	const pendingLog: CheckResult = {
		name: 'pendingLog',
		pass: input.pendingLineCount === 0,
		detail: `${input.pendingLineCount} pending lines`,
	};
	const strandedLog: CheckResult = {
		name: 'strandedLog',
		pass: input.strandedFileNames.length === 0,
		detail: input.strandedFileNames.join(', '),
	};
	const duplicateEvents: CheckResult = {
		name: 'duplicateEvents',
		pass: true,
		detail: `${input.duplicateEventCount} duplicates`,
	};
	const pass =
		freezeGate.pass && pendingLog.pass && strandedLog.pass && duplicateEvents.pass;
	return {freezeGate, pendingLog, strandedLog, duplicateEvents, pass};
}
