// React hook for subscribing to theme changes.
// This file is in source/gui/ so it is type-checked by the client tsconfig
// (which has DOM types), not the root one.

import {useSyncExternalStore} from 'react';
import {
	subscribeThemeChange,
	notifyThemeChange,
	resolvePalette,
	type Palette,
} from './theme.js';

// Re-export for backwards compatibility.
export {subscribeThemeChange, notifyThemeChange};

/**
 * React hook: returns the current palette object and triggers a re-render
 * when the theme changes. Backed by the same listeners that ThemeSheet uses.
 */
export function useTheme(): Palette {
	function getSnapshot(): Palette {
		return resolvePalette();
	}

	function subscribe(fn: (next: Palette) => void) {
		return subscribeThemeChange(() => fn(getSnapshot()));
	}

	return useSyncExternalStore<Palette>(subscribe, getSnapshot, getSnapshot);
}
