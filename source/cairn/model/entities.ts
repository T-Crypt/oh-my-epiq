// Core domain entities for the rebuild. Pure types, no I/O.

export type Ulid = string;

export type Timestamp = string;

// --- Objective ---

export type ObjectiveStatus = 'proposed' | 'active' | 'achieved' | 'abandoned';

export interface Objective {
	id: Ulid;
	title: string;
	description: string;
	owner: string;
	successMeasure: string;
	status: ObjectiveStatus;
	createdAt: Timestamp;
	updatedAt: Timestamp;
}

// --- WorkItem ---

export type WorkItemStatus =
	| 'draft'
	| 'ready'
	| 'claimed'
	| 'in_progress'
	| 'in_review'
	| 'done'
	| 'cancelled';

export interface WorkItem {
	id: Ulid;
	ref: string;
	objectiveId?: Ulid;
	title: string;
	spec: string;
	priority: number;
	status: WorkItemStatus;
	estimate?: string;
	lane?: string;
	tags: Ulid[];
	assignee?: string;
	leaseId?: Ulid;
	acceptanceCriteria: Ulid[];
	blockedBy: Ulid[];
	parentId?: Ulid;
	repository?: string;
	handedOff?: boolean;
	verification?: Verification;
	verificationId?: Ulid;
	verificationIds?: Ulid[];
	verifications?: Verification[];
	createdAt: Timestamp;
	updatedAt: Timestamp;
	draftExemption?: boolean;
}

// --- AcceptanceCriterion ---

export type AcceptanceCriterionKind =
	| 'test_passes'
	| 'lint_clean'
	| 'typecheck_clean'
	| 'build_succeeds'
	| 'human_accepts'
	| 'benchmark_within';

export interface AcceptanceCriterion {
	id: Ulid;
	workItemId: Ulid;
	statement: string;
	kind: AcceptanceCriterionKind;
	verificationIds: Ulid[];
}

// --- Decision ---

export type DecisionStatus = 'proposed' | 'accepted' | 'superseded' | 'expired';

export interface Decision {
	id: Ulid;
	title: string;
	rationale: string;
	alternatives: string[];
	author: string;
	origin: string;
	status: DecisionStatus;
	supersedesId?: Ulid;
	revisitAt?: Timestamp;
}

// --- Constraint ---

export type ConstraintOrigin =
	| 'user'
	| 'product_policy'
	| 'security_policy'
	| 'architecture'
	| 'external';

export type ConstraintCriticality = 'blocking' | 'advisory';

export interface Constraint {
	id: Ulid;
	statement: string;
	origin: ConstraintOrigin;
	scope: string[];
	criticality: ConstraintCriticality;
	validationMethod?: string;
	expiresAt?: Timestamp;
}

// --- Discovery ---

export interface Discovery {
	id: Ulid;
	statement: string;
	source: string;
	confidence: number;
	relatedFiles: string[];
	suggestedFollowUp?: string;
	createdWorkItemId?: Ulid;
}

// --- Observation ---

export type ObservationValidity =
	| 'valid'
	| 'stale'
	| 'superseded'
	| 'contradicted'
	| 'unknown'
	| 'unverified';

export interface Observation {
	id: Ulid;
	statement: string;
	source: string;
	inputDigest: string;
	observedAt: Timestamp;
	validity: ObservationValidity;
	invalidatedBy?: Ulid;
	scope: string[];
}

// --- Execution ---

export type ExecutionOutcome =
	| 'running'
	| 'succeeded'
	| 'failed'
	| 'abandoned'
	| 'blocked';

export interface Execution {
	id: Ulid;
	workItemId: Ulid;
	actorId: string;
	sessionId?: Ulid;
	workspaceId?: Ulid;
	branch?: string;
	baseSha?: string;
	startedAt: Timestamp;
	endedAt?: Timestamp;
	outcome: ExecutionOutcome;
	summary?: string;
}

// --- Evidence ---

export type EvidenceKind =
	| 'test_run'
	| 'lint'
	| 'typecheck'
	| 'build'
	| 'diff'
	| 'commit'
	| 'report'
	| 'screenshot'
	| 'benchmark'
	| 'review';

export type EvidenceRetention = 'keep' | 'expire' | 'archive';

export interface Evidence {
	id: Ulid;
	kind: EvidenceKind;
	uriOrPath?: string;
	digest: string;
	command?: string;
	exitCode?: number;
	environmentFingerprint?: string;
	producedByExecutionId?: Ulid;
	retention: EvidenceRetention;
}

// --- Verification ---

export type VerificationOutcome = 'pass' | 'fail' | 'skipped' | 'unknown';

export type VerificationFreshness = 'fresh' | 'stale' | 'unknown';

export interface Verification {
	id: Ulid;
	criterionId: Ulid;
	evidenceId?: Ulid;
	verifier: string;
	outcome: VerificationOutcome;
	freshness: VerificationFreshness;
	checkedAt: Timestamp;
	reason?: string;
}

// --- Artifact ---

export interface Artifact {
	id: Ulid;
	kind: string;
	location: string;
	digest: string;
	sizeBytes: number;
	retention: string;
}

// --- AgentIdentity ---

export interface AgentIdentity {
	id: Ulid;
	provider: string;
	label: string;
	machine: string;
	capabilities: string[];
}

// --- Session ---

export interface Session {
	id: Ulid;
	workItemId?: Ulid;
	actorId: string;
	runtime: string;
	contextCapsuleId?: Ulid;
	startedAt: Timestamp;
	endedAt?: Timestamp;
	exitReason?: string;
}

// --- Workspace ---

export type WorkspaceStatus =
	| 'preparing'
	| 'ready'
	| 'dirty'
	| 'archived'
	| 'removed';

export interface Workspace {
	id: Ulid;
	repository: string;
	branch: string;
	baseSha: string;
	status: WorkspaceStatus;
	cleanupState: string;
}

// --- Lease ---

export type LeaseState = 'active' | 'expired' | 'released';

export interface Lease {
	id: Ulid;
	workItemId: Ulid;
	holderActorId: string;
	fencingToken: number;
	acquiredAt: Timestamp;
	expiresAt: Timestamp;
	lastHeartbeatAt: Timestamp;
	releasedAt?: Timestamp;
	state: LeaseState;
}

// --- Project ---

export interface Project {
	id: Ulid;
	name: string;
	repository: string;
	defaultBranch: string;
}

// --- Tag ---

export interface Tag {
	id: Ulid;
	name: string;
	color: string;
}

// --- Contributor ---

export type ContributorKind = 'person' | 'agent';

export interface Contributor {
	id: Ulid;
	name: string;
	kind: ContributorKind;
}

// --- Board ---

export interface Board {
	id: Ulid;
	name: string;
	lane?: string;
	tagId?: Ulid;
	objectiveId?: Ulid;
}