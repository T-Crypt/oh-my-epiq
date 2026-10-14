import {useEffect} from 'react';
import {isTypingTarget} from './typing-target';
import {stepBoardId, type BoardRef} from './board-hotkeys';

export type BoardHotkeysOptions = {
	boards: readonly BoardRef[];
	currentBoardId: string | null;
	selectBoard: (id: string) => void;
	onPlayTheatre: () => void;
	onFocusFilter: () => void;
	onToggleLog: () => void;
	onShowShortcuts: () => void;
	// The palette owns the keyboard while it is open and the theatre player owns
	// it while a film runs, so the board keys stand down behind either.
	suppressed: boolean;
};

/**
 * The board's own keys: bare presses that work wherever focus sits, except in a
 * field or behind an overlay.
 *
 * `[` and `]` walk the boards, `/` jumps to the filter, `l` toggles the activity
 * log, `t` plays the board back, and `?` opens the shortcut list. Each calls the
 * handler the on-screen control already calls, so there is one behaviour with a
 * key and a click reaching the same place. The chord and the colon stay the
 * palette's, in `use-command-palette`.
 */
export const useBoardHotkeys = (options: BoardHotkeysOptions): void => {
	const {
		boards,
		currentBoardId,
		selectBoard,
		onPlayTheatre,
		onFocusFilter,
		onToggleLog,
		onShowShortcuts,
		suppressed,
	} = options;

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			// Modifier chords belong elsewhere; a bare key is what this is for.
			if (suppressed || event.metaKey || event.ctrlKey || event.altKey) return;
			if (isTypingTarget(event.target)) return;

			switch (event.key) {
				case '[':
				case ']': {
					const next = stepBoardId(
						boards,
						currentBoardId,
						event.key === ']' ? 1 : -1,
					);
					if (next && next !== currentBoardId) {
						event.preventDefault();
						selectBoard(next);
					}
					return;
				}
				case '/':
					event.preventDefault();
					onFocusFilter();
					return;
				case 'l':
					event.preventDefault();
					onToggleLog();
					return;
				case 't':
					event.preventDefault();
					onPlayTheatre();
					return;
				case '?':
					event.preventDefault();
					onShowShortcuts();
					return;
				default:
					return;
			}
		};

		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [
		boards,
		currentBoardId,
		selectBoard,
		onPlayTheatre,
		onFocusFilter,
		onToggleLog,
		onShowShortcuts,
		suppressed,
	]);
};
