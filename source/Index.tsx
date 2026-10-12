import chalk from 'chalk';
import {render} from 'ink';
import meow from 'meow';
import React from 'react';
import {startGui} from './gui/init.js';
import {ACCESS_MODES, isAccessMode} from './gui/api/lib/remote-access.js';
import OmeApp from './lib/components/OmeApp.js';
import {applyActorNameArgument} from './lib/config/actor-env.js';
import {
	migrateEpiqProject,
	resolveClosestLegacyProjectRoot,
} from './lib/migration/migrate-epiq.js';
import {
	failed,
	isFail,
	isSuccess,
	Result,
	succeeded,
} from './lib/model/result-types.js';
import {initUiState} from './lib/state/ux-state.js';
import {formatUnknownError} from './lib/utils/logger.utils.js';
import {OME_VERSION} from './version.js';
import './logger.js';
import {bootTui} from './boot-tui.js';

initUiState();

const helpText = `${chalk.bold('OME CLI')}

${chalk.dim('Boot in directory:')}
  ${chalk.cyan('$ ome')}

${chalk.dim('Launch GUI:')}
  ${chalk.cyan('$ ome gui')}
  ${chalk.cyan('$ ome gui --no-open')}  ${chalk.dim('no browser')}

${chalk.dim('Reach the GUI from a phone or another machine:')}
  ${chalk.cyan('$ ome gui --access tailscale')}   ${chalk.dim(
	'local | lan | tailscale | cloudflare',
)}
  ${chalk.cyan(
		'$ ome gui --allow-host https://host.example.ts.net:3710',
	)}  ${chalk.dim('behind a proxy')}
  ${chalk.cyan('$ ome gui --rotate-token')}       ${chalk.dim(
	'sign every device out',
)}

${chalk.dim('Migrate an Epiq board to OME:')}
  ${chalk.cyan('$ ome migrate')}            ${chalk.dim(
	'plan only, changes nothing',
)}
  ${chalk.cyan('$ ome migrate --apply')}    ${chalk.dim('do it')}

${chalk.dim('Act as somebody other than the configured user:')}
  ${chalk.cyan('$ ome --as claude')}
`;

const cli = meow(helpText, {
	importMeta: import.meta,
	version: OME_VERSION,
	flags: {
		init: {
			type: 'boolean',
			default: false,
		},
		as: {
			type: 'string',
		},
		open: {
			type: 'boolean',
			default: true,
		},
		apply: {
			type: 'boolean',
			default: false,
		},
		access: {
			type: 'string',
			default: 'local',
		},
		allowHost: {
			type: 'string',
			isMultiple: true,
		},
		rotateToken: {
			type: 'boolean',
			default: false,
		},
	},
});

const command = cli.input[0];
if (command && command !== 'gui' && command !== 'migrate') {
	console.error(chalk.red(`Unknown command: ${command}`));
	process.exit(1);
}

// A flag rather than a positional, because `input[0]` is already the command.
if (cli.flags.as !== undefined) {
	const actor = applyActorNameArgument(cli.flags.as, '--as');

	if (isFail(actor)) {
		console.error(chalk.red(actor.message));
		process.exit(1);
	}
}

let width = process.stdout.columns || 120;
let height = process.stdout.rows || 20;
let ink: ReturnType<typeof render> | null = null;

const renderNode = (node: React.ReactNode): Result<void> => {
	try {
		if (!ink) {
			ink = render(node);
			return succeeded('Rendered app', undefined);
		}

		ink.rerender(node);
		return succeeded('Rerendered app', undefined);
	} catch (error) {
		return failed(`Unable to render app: ${formatUnknownError(error)}`);
	}
};

export const renderApp = (): Result<void> =>
	renderNode(<OmeApp width={width} height={height} />);

process.stdout.on('resize', () => {
	width = process.stdout.columns || 120;
	height = process.stdout.rows || 20;

	if (!ink) return;

	const renderResult = renderApp();

	if (isFail(renderResult)) {
		logger.info(`[boot:resize] ${renderResult.message}`);
	}
});

if (command === 'migrate') {
	const legacyRoot = resolveClosestLegacyProjectRoot(process.cwd());
	const repoRoot = isSuccess(legacyRoot) ? legacyRoot.value : null;

	const migrateResult = await migrateEpiqProject({
		repoRoot,
		dryRun: !cli.flags.apply,
	});

	if (isFail(migrateResult)) {
		console.error(chalk.red(migrateResult.message));
		process.exitCode = 1;
	} else {
		const {plan, warnings} = migrateResult.value;

		if (plan.actions.length === 0) {
			console.log('Nothing to migrate.');
		} else {
			console.log(
				chalk.bold(
					cli.flags.apply
						? `Migrated ${plan.projectId ?? 'the global directory'} to OME`
						: 'Migration plan (dry run; nothing changed)',
				),
			);

			for (const action of plan.actions) {
				const path = action.from
					? chalk.dim(`\n      ${action.from} → ${action.to ?? ''}`)
					: '';
				console.log(`  ${chalk.cyan('•')} ${action.description}${path}`);
			}

			if (!cli.flags.apply) {
				console.log(chalk.dim('\nRe-run with --apply to carry it out.'));
			}
		}

		for (const warning of warnings) {
			console.error(chalk.yellow(warning));
		}
	}

	process.exit(process.exitCode ?? 0);
} else if (command === 'gui') {
	if (!isAccessMode(cli.flags.access)) {
		console.error(
			chalk.red(
				`Unknown --access ${cli.flags.access}: use ${ACCESS_MODES.join(', ')}`,
			),
		);
		process.exit(1);
	}

	// Also from the environment, so a service unit can set it in one place.
	const allowHosts = [
		...(cli.flags.allowHost ?? []),
		...(process.env['OME_GUI_ALLOW_HOSTS'] ?? '')
			.split(',')
			.map(host => host.trim())
			.filter(Boolean),
	];

	const guiResult = await startGui({
		repoRoot: process.cwd(),
		open: cli.flags.open,
		access: cli.flags.access,
		allowHosts,
		rotateToken: cli.flags.rotateToken,
	});

	if (isFail(guiResult)) {
		console.error(chalk.red(`Failed to start OME GUI:\n${guiResult.message}`));
		process.exitCode = 1;
	}
} else {
	console.clear();

	const bootResult = await bootTui();

	if (isFail(bootResult)) {
		logger.info(bootResult.message);
		console.error(chalk.red(`Failed to boot OME:\n${bootResult.message}`));
		process.exitCode = 1;
	}
}
