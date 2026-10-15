import {describe, expect, it} from 'vitest';
import {nextLaneIndex} from './PocketShell';

describe('nextLaneIndex', () => {
	it('walks neighbours with the arrow keys and wraps at both ends', () => {
		expect(nextLaneIndex(0, 'ArrowRight', 3)).toBe(1);
		expect(nextLaneIndex(2, 'ArrowRight', 3)).toBe(0);
		expect(nextLaneIndex(0, 'ArrowLeft', 3)).toBe(2);
		expect(nextLaneIndex(1, 'ArrowLeft', 3)).toBe(0);
	});

	it('jumps to the ends with Home and End', () => {
		expect(nextLaneIndex(1, 'Home', 3)).toBe(0);
		expect(nextLaneIndex(1, 'End', 3)).toBe(2);
	});

	it('stays put on any other key or an empty lane list', () => {
		expect(nextLaneIndex(1, 'Enter', 3)).toBeNull();
		expect(nextLaneIndex(0, 'ArrowRight', 0)).toBeNull();
	});
});
