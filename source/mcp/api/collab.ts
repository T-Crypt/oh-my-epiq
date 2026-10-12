import fs from 'node:fs';
import path from 'node:path';
import {ulid} from 'ulid';
import {
	loadMergedEvents,
	materializeAll,
	materializeAndPersistAll,
} from '../../lib/board/board-log.js';
import {AppEvent} from '../../lib/board/board-events.model.js';
import {
	collabChannels,
	collabKinds,
	CollabChannel,
	CollabKind,
	CollabMessage,
	CollabStatus,
	collabRepo,
} from '../../lib/collab/collab-repo.js';
import {getGlobalConfigDir} from '../../lib/storage/global-config-dir.js';
import {readProjectId} from '../../lib/project-setup/project-setup.js';
import {
	failed,
	isFail,
	Result,
	succeeded,
} from '../../lib/model/result-types.js';
import {isTicketNode} from '../../lib/model/context.model.js';
import {nodeRefMatches} from '../../lib/utils/node-ref.js';
import {sanitizeInlineText} from '../../lib/utils/string.utils.js';
import {MAX_COMMENT_LENGTH, tooLong} from '../../lib/utils/text.limits.js';
import {actorOf} from '../../lib/event/event.model.js';
import {bootedWithActorAndState, ToolInput} from './boot.js';

// The local channel never touches the synced branch: one sidecar directory
// per project under the global config dir, which no git command reads. The
// engine still does the ordering, ids and replay — only the root differs.
const collabSidecarDir = (projectId: string): string =>
	path.join(getGlobalConfigDir(), 'collab', projectId);

type PostInput = ToolInput & {
	channel?: CollabChannel;
	kind: CollabKind;
	body: string;
	ticket?: string;
	dueBy?: string;
};

const resolveTicket = (
	tickets: {id: string}[],
	query: string,
): {id: string} | null => {
	const exact = tickets.find(t => t.id === query);
	if (exact) return exact;

	const matches = tickets.filter(t => nodeRefMatches(t.id, query));
	return matches.length === 1 ? matches[0] ?? null : null;
};

const loadLocalChannel = (projectId: string): Result<null> => {
	const dir = collabSidecarDir(projectId);
	if (!fs.existsSync(dir)) return succeeded('No local messages', null);

	const loaded = loadMergedEvents(dir);
	if (isFail(loaded)) return loaded;

	materializeAll(loaded.value);

	return succeeded('Loaded local messages', null);
};

const channelRoot = (
	channel: CollabChannel,
	stateBranchRoot: string,
	projectId: string,
): string =>
	channel === 'local' ? collabSidecarDir(projectId) : stateBranchRoot;

const messageView = (message: CollabMessage) => ({
	id: message.id,
	channel: message.channel,
	kind: message.kind,
	status: message.status,
	body: message.body,
	authorId: message.authorId,
	createdAt: message.createdAt,
	ticket: message.ticket,
	dueBy: message.dueBy,
	pinned: message.pinned,
});

export const postCollabMessage = async (input: PostInput) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const channel = input.channel ?? 'global';
	if (!collabChannels.includes(channel)) {
		return failed(`Unknown collab channel: ${channel}`);
	}
	if (!collabKinds.includes(input.kind)) {
		return failed(`Unknown collab kind: ${input.kind}`);
	}

	const body = sanitizeInlineText(input.body);
	if (!body.trim()) return failed('Message body cannot be empty');
	const overLong = tooLong('Message body', body, MAX_COMMENT_LENGTH);
	if (overLong) return failed(overLong);

	let ticket: string | undefined;
	if (input.ticket) {
		const tickets = Object.values(ready.value.state.nodes).filter(isTicketNode);
		const match = resolveTicket(tickets, input.ticket.trim());
		if (!match) return failed(`No ticket matches "${input.ticket}"`);
		ticket = match.id;
	}

	const id = ulid();
	const event = {
		id: ulid(),
		...actorOf(ready.value.actor),
		action: 'collab.post',
		payload: {
			id,
			channel,
			kind: input.kind,
			body,
			ticket,
			dueBy: input.dueBy?.trim() || undefined,
		},
	} satisfies AppEvent<'collab.post'>;

	const projectResult = readProjectId(ready.value.boot.repoRoot);
	if (isFail(projectResult)) return projectResult;

	const persisted = materializeAndPersistAll(
		[event],
		channelRoot(channel, ready.value.boot.stateBranchRoot, projectResult.value),
	);
	if (isFail(persisted)) return failed(persisted.message);

	const message = collabRepo.get(id);
	if (!message) return failed('Message was not applied');

	return succeeded('Posted message', messageView(message));
};

type ListInput = ToolInput & {
	channel?: CollabChannel;
	kind?: CollabKind;
	status?: CollabStatus;
};

export const listCollabMessages = async (input: ListInput = {}) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	if (input.channel && !collabChannels.includes(input.channel)) {
		return failed(`Unknown collab channel: ${input.channel}`);
	}
	if (input.kind && !collabKinds.includes(input.kind)) {
		return failed(`Unknown collab kind: ${input.kind}`);
	}

	const projectResult = readProjectId(ready.value.boot.repoRoot);
	if (isFail(projectResult)) return projectResult;

	const loaded = loadLocalChannel(projectResult.value);
	if (isFail(loaded)) return loaded;

	return succeeded(
		'Listed messages',
		collabRepo
			.list({
				channel: input.channel,
				kind: input.kind,
				status: input.status,
			})
			.map(messageView),
	);
};

const transitionCollabMessage = async (
	input: ToolInput & {messageId: string},
	action: 'collab.claim' | 'collab.resolve' | 'collab.pin',
	pinned?: boolean,
) => {
	const ready = await bootedWithActorAndState(input.repoRoot);
	if (isFail(ready)) return ready;

	const projectResult = readProjectId(ready.value.boot.repoRoot);
	if (isFail(projectResult)) return projectResult;

	const loaded = loadLocalChannel(projectResult.value);
	if (isFail(loaded)) return loaded;

	const message = collabRepo.get(input.messageId);
	if (!message) return failed('Message not found');

	const base = {id: ulid(), ...actorOf(ready.value.actor)};
	const event: AppEvent<'collab.claim' | 'collab.resolve' | 'collab.pin'> =
		action === 'collab.pin'
			? {...base, action, payload: {id: message.id, pinned: pinned ?? true}}
			: {...base, action, payload: {id: message.id}};

	const persisted = materializeAndPersistAll(
		[event],
		channelRoot(
			message.channel,
			ready.value.boot.stateBranchRoot,
			projectResult.value,
		),
	);
	if (isFail(persisted)) return failed(persisted.message);

	const updated = collabRepo.get(message.id);
	if (!updated) return failed('Message was not applied');

	return succeeded('Updated message', messageView(updated));
};

export const claimCollabMessage = async (
	input: ToolInput & {messageId: string},
) => transitionCollabMessage(input, 'collab.claim');

export const resolveCollabMessage = async (
	input: ToolInput & {messageId: string},
) => transitionCollabMessage(input, 'collab.resolve');

export const pinCollabMessage = async (
	input: ToolInput & {messageId: string; pinned?: boolean},
) => transitionCollabMessage(input, 'collab.pin', input.pinned ?? true);
