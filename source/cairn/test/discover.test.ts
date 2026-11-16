import {describe, expect, it} from 'vitest';
import {discoverTools, getToolInfo} from '../output/discover.js';

describe('discover', () => {
	it('lists tools', () => {
		const tools = discoverTools();
		expect(tools.length).toBeGreaterThan(20);
		expect(tools[0]).toHaveProperty('name');
		expect(tools[0]).toHaveProperty('oneLiner');
	});

	it('get_info returns details', () => {
		const info = getToolInfo('work_list');
		expect(info).not.toBeNull();
		expect(info!.name).toBe('work_list');
		expect(info!.params.length).toBeGreaterThan(0);
	});

	it('get_info missing returns null', () => {
		expect(getToolInfo('nope')).toBeNull();
	});
});
