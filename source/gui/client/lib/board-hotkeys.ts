export type BoardRef = {
	id: string;
};

/**
 * The board id a `[` or `]` press moves to.
 *
 * Walks the board list by a signed step and wraps at both ends, so `]` on the
 * last board returns to the first. The order is the board list's own order, the
 * same order the switcher and the tab strip show, so the keyboard follows the
 * screen. Returns null when there is nothing to move to: a single board, or a
 * current id that is not on the list.
 */
export const stepBoardId = (
	boards: readonly BoardRef[],
	currentId: string | null,
	step: number,
): string | null => {
	if (boards.length < 2 || currentId === null) return null;

	const index = boards.findIndex(board => board.id === currentId);
	if (index === -1) return boards[0].id;

	const next = (index + step + boards.length) % boards.length;
	return boards[next].id;
};
