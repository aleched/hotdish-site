import { describe, expect, it } from 'vitest';
import { connectionState } from './connectionState';

describe('connectionState', () => {
	it('shows syncing while a refresh is running', () => {
		expect(connectionState(1, true, true)).toBe('syncing');
		expect(connectionState(2, false, false)).toBe('syncing');
	});

	it('is live only when the browser is online and the forge was reachable', () => {
		expect(connectionState(0, true, true)).toBe('live');
		expect(connectionState(0, false, true)).toBe('offline');
		expect(connectionState(0, true, false)).toBe('offline');
	});
});
