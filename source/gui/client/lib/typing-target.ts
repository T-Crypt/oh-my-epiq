// A key pressed belongs to the field it landed in, not the board. A bare key
// handler that ignores this turns a ticket title into a command, so the board's
// own shortcuts (and the palette's) all check this first. One copy, shared.
export const isTypingTarget = (target: EventTarget | null): boolean => {
	const element = target as HTMLElement | null;
	if (!element) return false;

	const tag = element.tagName;

	return (
		tag === 'INPUT' ||
		tag === 'TEXTAREA' ||
		tag === 'SELECT' ||
		element.isContentEditable
	);
};
