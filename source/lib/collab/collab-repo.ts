import {failed, Result, succeeded} from '../model/result-types.js';

export const collabChannels = ['global', 'local'] as const;
export type CollabChannel = (typeof collabChannels)[number];

export const collabKinds = ['note', 'request', 'handoff'] as const;
export type CollabKind = (typeof collabKinds)[number];

export const collabStatuses = ['open', 'claimed', 'resolved'] as const;
export type CollabStatus = (typeof collabStatuses)[number];

export type CollabMessage = {
	id: string;
	channel: CollabChannel;
	kind: CollabKind;
	status: CollabStatus;
	body: string;
	authorId: string;
	createdAt: number;
	ticket?: string;
	dueBy?: string;
	pinned: boolean;
};

export type CollabPost = {
	id: string;
	channel: CollabChannel;
	kind: CollabKind;
	body: string;
	authorId: string;
	createdAt: number;
	ticket?: string;
	dueBy?: string;
};

const messages = new Map<string, CollabMessage>();

const isTransitionable = (kind: CollabKind): boolean => kind !== 'note';

export const postCollabMessage = (post: CollabPost): Result<CollabMessage> => {
	const existing = messages.get(post.id);
	if (existing) return succeeded('Message already posted', existing);

	const message: CollabMessage = {...post, status: 'open', pinned: false};
	messages.set(post.id, message);

	return succeeded('Posted message', message);
};

export const getCollabMessage = (id: string): CollabMessage | undefined =>
	messages.get(id);

export const listCollabMessages = (
	filter: {
		channel?: CollabChannel;
		kind?: CollabKind;
		status?: CollabStatus;
	} = {},
): CollabMessage[] =>
	[...messages.values()]
		.filter(m => !filter.channel || m.channel === filter.channel)
		.filter(m => !filter.kind || m.kind === filter.kind)
		.filter(m => !filter.status || m.status === filter.status)
		.sort((a, b) => {
			if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
			return a.createdAt - b.createdAt;
		});

export const claimCollabMessage = (id: string): Result<CollabMessage> => {
	const message = messages.get(id);
	if (!message) return failed('Message not found');
	if (!isTransitionable(message.kind)) {
		return failed('Only requests and handoffs can be claimed');
	}
	if (message.status !== 'open') {
		return failed(`Message is already ${message.status}`);
	}

	const claimed: CollabMessage = {...message, status: 'claimed'};
	messages.set(id, claimed);

	return succeeded('Claimed message', claimed);
};

export const resolveCollabMessage = (id: string): Result<CollabMessage> => {
	const message = messages.get(id);
	if (!message) return failed('Message not found');
	if (!isTransitionable(message.kind)) {
		return failed('Only requests and handoffs can be resolved');
	}
	if (message.status === 'resolved') {
		return failed('Message is already resolved');
	}

	const resolved: CollabMessage = {...message, status: 'resolved'};
	messages.set(id, resolved);

	return succeeded('Resolved message', resolved);
};

export const pinCollabMessage = (
	id: string,
	pinned: boolean,
): Result<CollabMessage> => {
	const message = messages.get(id);
	if (!message) return failed('Message not found');
	if (message.pinned === pinned) {
		return succeeded(
			pinned ? 'Message already pinned' : 'Message already unpinned',
			message,
		);
	}

	const updated: CollabMessage = {...message, pinned};
	messages.set(id, updated);

	return succeeded(pinned ? 'Pinned message' : 'Unpinned message', updated);
};

export const clearCollabMessages = (): void => {
	messages.clear();
};

export const collabRepo = {
	post: postCollabMessage,
	get: getCollabMessage,
	list: listCollabMessages,
	claim: claimCollabMessage,
	resolve: resolveCollabMessage,
	pin: pinCollabMessage,
	clear: clearCollabMessages,
};
