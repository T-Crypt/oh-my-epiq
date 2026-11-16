// Fidelity limits and report for the OME -> new-model migration.

export const FIDELITY_LIMITS = {
	noSyntheticLeases: true,
	criteriaSplitOnlyWhenExplicit: true,
	commentsAndAttachmentsUnverified: true,
	nothingMarkedDone: true,
	duplicateEventsDedupedByEventId: true,
} as const;

export interface FidelityCounts {
	ticketsMapped: number;
	criteriaSplit: number;
	commentsMapped: number;
	notesMapped: number;
	commitLinksMapped: number;
	attachmentsMapped: number;
	goalsMapped: number;
	reposMapped: number;
	duplicateEventsRemoved: number;
	itemsWithoutCriteria: number;
}

export interface FidelityReport {
	ticketsMapped: number;
	criteriaSplit: number;
	commentsMapped: number;
	notesMapped: number;
	commitLinksMapped: number;
	attachmentsMapped: number;
	goalsMapped: number;
	reposMapped: number;
	duplicateEventsRemoved: number;
	itemsNotMarkedDone: true;
	itemsWithoutCriteria: number;
}

export function buildFidelityReport(counts: FidelityCounts): FidelityReport {
	return {
		ticketsMapped: counts.ticketsMapped,
		criteriaSplit: counts.criteriaSplit,
		commentsMapped: counts.commentsMapped,
		notesMapped: counts.notesMapped,
		commitLinksMapped: counts.commitLinksMapped,
		attachmentsMapped: counts.attachmentsMapped,
		goalsMapped: counts.goalsMapped,
		reposMapped: counts.reposMapped,
		duplicateEventsRemoved: counts.duplicateEventsRemoved,
		itemsNotMarkedDone: true,
		itemsWithoutCriteria: counts.itemsWithoutCriteria,
	};
}
