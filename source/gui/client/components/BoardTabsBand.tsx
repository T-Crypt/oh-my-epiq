import type {ReactNode} from 'react';

/**
 * The board tabs in a strip above the columns.
 *
 * It scrolls sideways when many boards overflow it and keeps the active tab's
 * place, and it goes inert while a film plays, since the board is the picture
 * then and its switches are not part of it. `theatre` is whether a film runs.
 */
export const BoardTabsBand = ({
	boardTabs,
	theatre,
}: {
	boardTabs: ReactNode;
	theatre: boolean;
}) =>
	boardTabs ? (
		<div
			style={{
				flex: 'none',
				paddingTop: 8,
				overflowX: 'auto',
				maxWidth: '100%',
				pointerEvents: theatre ? 'none' : undefined,
			}}
		>
			{boardTabs}
		</div>
	) : null;
