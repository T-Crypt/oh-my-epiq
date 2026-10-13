import {useState} from 'react';
import {Button} from './Button';
import {GUI_THEME, OME_MARK_STYLE, UI_FONT} from '../lib/gui-theme';
import type {RecentProjectView} from './InitProjectScreen';

export type ProjectListCurrent = {
	root: string;
	name: string;
};

type Props = {
	current: ProjectListCurrent | null;
	projects: RecentProjectView[];
	error: string | null;
	scanning?: boolean;
	onOpen: (root: string) => void;
	onClose: () => void;
	onScan?: () => void;
};

export const ProjectPicker = ({
	current,
	projects,
	error,
	scanning = false,
	onOpen,
	onClose,
	onScan,
}: Props) => {
	const [typedRoot, setTypedRoot] = useState('');

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				background: GUI_THEME.scrim,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1000,
			}}
			onMouseDown={onClose}
		>
			<div
				data-testid="project-picker"
				onMouseDown={event => event.stopPropagation()}
				onKeyDown={event => {
					if (event.key === 'Escape') onClose();
				}}
				style={{
					width: 440,
					maxHeight: '80dvh',
					overflowY: 'auto',
					background: GUI_THEME.panel,
					border: `1px solid ${GUI_THEME.line}`,
					borderRadius: 12,
					padding: 20,
					fontFamily: UI_FONT,
					display: 'flex',
					flexDirection: 'column',
					gap: 12,
				}}
			>
				<div
					style={{
						...OME_MARK_STYLE,
						fontSize: 11,
						letterSpacing: 1,
						textTransform: 'uppercase',
					}}
				>
					Open project
				</div>

				{current && (
					<div style={{fontSize: 12, color: GUI_THEME.secondary}}>
						Now showing{' '}
						<span style={{color: GUI_THEME.primary, fontWeight: 700}}>
							{current.name}
						</span>
					</div>
				)}

				<form
					onSubmit={event => {
						event.preventDefault();
						const root = typedRoot.trim();
						if (root) onOpen(root);
					}}
					style={{display: 'flex', gap: 8}}
				>
					<input
						data-testid="project-picker-path"
						value={typedRoot}
						onChange={event => setTypedRoot(event.target.value)}
						placeholder="/absolute/path/to/project"
						autoFocus
						style={{
							flex: 1,
							minWidth: 0,
							background: GUI_THEME.panel2,
							border: `1px solid ${GUI_THEME.line}`,
							borderRadius: 6,
							padding: '8px 10px',
							color: GUI_THEME.primary,
							fontSize: 12,
						}}
					/>
					<Button
						variant="primary"
						data-testid="project-picker-open-path"
						onClick={() => {
							const root = typedRoot.trim();
							if (root) onOpen(root);
						}}
					>
						open
					</Button>
				</form>

				{projects.length > 0 && (
					<div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								gap: 8,
							}}
						>
							<div
								style={{
									color: GUI_THEME.accent,
									fontSize: 11,
									letterSpacing: 1,
									textTransform: 'uppercase',
								}}
							>
								Known projects ({projects.length})
							</div>
							{onScan && (
								<Button
									variant="ghost"
									onClick={onScan}
									data-testid="project-picker-scan"
								>
									{scanning ? 'scanning…' : 'rescan'}
								</Button>
							)}
						</div>

						{projects.map(project => (
							<div
								key={project.projectId}
								data-testid="project-picker-entry"
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: 12,
									fontSize: 12,
								}}
							>
								<div style={{minWidth: 0}}>
									<div style={{fontWeight: 700}}>{project.name}</div>
									<div
										style={{
											color: GUI_THEME.dim,
											fontSize: 11,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
										title={project.root}
									>
										{project.root}
									</div>
								</div>

								<Button
									variant="primary"
									onClick={() => onOpen(project.root)}
									data-testid="project-picker-open-entry"
								>
									open
								</Button>
							</div>
						))}
					</div>
				)}

				{error && (
					<div
						data-testid="project-picker-error"
						style={{fontSize: 12, color: GUI_THEME.red}}
					>
						{error}
					</div>
				)}
			</div>
		</div>
	);
};
