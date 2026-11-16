import {describe, expect, it} from 'vitest';
import {mapTicketToWorkItem, mapCommentToLedgerRecord, dedupeEventsById, ticketHadCriteriaSplit} from '../migration/mapping.js';
import {buildFidelityReport} from '../migration/fidelity.js';
import {runPreflight} from '../migration/preflight.js';

describe('migration mapping', () => {
	it('maps ticket without criteria (whole description is spec)', () => {
		const wi = mapTicketToWorkItem({id: '01ABC', title: 'T', description: 'do the thing'});
		expect(wi.spec).toBe('do the thing');
		expect(wi.acceptanceCriteria).toEqual([]);
		expect(ticketHadCriteriaSplit({id: '01ABC', title: 'T', description: 'do the thing'})).toBe(false);
	});

	it('maps ticket with explicit criteria (split)', () => {
		const wi = mapTicketToWorkItem({
			id: '01DEF',
			title: 'T2',
			description: 'spec line\n\nAcceptance criteria:\n- first\n- second',
		});
		expect(wi.spec).toBe('spec line');
		expect(ticketHadCriteriaSplit({id: '01DEF', title: 'T2', description: 'spec line\n\nAcceptance criteria:\n- first\n- second'})).toBe(true);
	});

	it('maps comment to ledger record', () => {
		const rec = mapCommentToLedgerRecord({id: 'C1', issue: 'I1', author: 'alice', md: 'hi', createdAt: '2026-01-01T00:00:00.000Z'});
		expect(rec.kind).toBe('exec.attempted');
		expect(rec.actorId).toBe('alice');
		expect(rec.validity).toBe('unverified');
	});

	it('dedupes events by id', () => {
		const events = [{id: 'a'}, {id: 'b'}, {id: 'a'}];
		const out = dedupeEventsById(events);
		expect(out).toHaveLength(2);
	});
});

describe('fidelity report', () => {
	it('produces counts', () => {
		const r = buildFidelityReport({
			ticketsMapped: 2,
			criteriaSplit: 1,
			commentsMapped: 3,
			notesMapped: 1,
			commitLinksMapped: 1,
			attachmentsMapped: 1,
			goalsMapped: 1,
			reposMapped: 1,
			duplicateEventsRemoved: 1,
			itemsWithoutCriteria: 1,
		});
		expect(r.itemsNotMarkedDone).toBe(true);
		expect(r.ticketsMapped).toBe(2);
	});
});

describe('preflight', () => {
	it('fails with pending lines', () => {
		const r = runPreflight({frozen: true, pendingLineCount: 2, strandedFileNames: [], duplicateEventCount: 0});
		expect(r.pass).toBe(false);
		expect(r.pendingLog.pass).toBe(false);
	});

	it('passes when clean', () => {
		const r = runPreflight({frozen: true, pendingLineCount: 0, strandedFileNames: [], duplicateEventCount: 0});
		expect(r.pass).toBe(true);
	});
});
