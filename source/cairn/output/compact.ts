import {WorkItem, Objective, Lease} from '../model/entities.js';

export interface CompactWorkItem {
	ref: string;
	title: string;
	status: WorkItem['status'];
	lane?: string;
	tags?: string[];
	assignee?: string;
	priority?: number;
}

export interface CompactObjective {
	ref: string;
	title: string;
	status: Objective['status'];
}

export interface CompactLease {
	workItemRef: string;
	holder: string;
	expiresAt: string;
	state: Lease['state'];
}

export function compactWorkItem(item: WorkItem): CompactWorkItem {
	const out: CompactWorkItem = {
		ref: item.ref,
		title: item.title,
		status: item.status,
	};
	if (item.lane !== undefined) out.lane = item.lane;
	if (item.tags && item.tags.length > 0) out.tags = item.tags;
	if (item.assignee !== undefined) out.assignee = item.assignee;
	if (item.priority !== undefined) out.priority = item.priority;
	return out;
}

export function compactWorkItemList(items: WorkItem[]): CompactWorkItem[] {
	return items.map(compactWorkItem);
}

export function compactObjective(obj: Objective): CompactObjective {
	return {ref: obj.id, title: obj.title, status: obj.status};
}

export function compactLease(lease: Lease): CompactLease {
	return {
		workItemRef: lease.workItemId,
		holder: lease.holderActorId,
		expiresAt: lease.expiresAt,
		state: lease.state,
	};
}

export function formatBrief(items: WorkItem[]): string {
	return items
		.map((item) => {
			const tags = (item.tags ?? []).join(',');
			return `${item.ref}  ${item.title}  [${item.status}]  ${tags}`;
		})
		.join('\n');
}

export function formatJson(items: WorkItem[]): string {
	return JSON.stringify(compactWorkItemList(items));
}
