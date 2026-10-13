// The shell around the board, after Oh-My-Pocket: on a desktop a rail of square
// tiles beside the board's window; on a phone a top bar, one lane per screen,
// and a tab bar at the thumb. The board, its panels and its commands are the
// same components either way — this file only frames them. Styles: ome.css.
import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {GuiSwimlane} from '../lib/gui-state.model';

// Below this a board's columns stop fitting side by side, and a touch screen
// is the likelier pointer. Oh-My-Pocket switches its own layout at the same width.
const PHONE_QUERY = '(max-width: 760px)';

const subscribePhone = (onChange: () => void) => {
	const query = window.matchMedia(PHONE_QUERY);
	query.addEventListener('change', onChange);

	return () => query.removeEventListener('change', onChange);
};

export const useIsPhone = (): boolean =>
	useSyncExternalStore(
		subscribePhone,
		() => window.matchMedia(PHONE_QUERY).matches,
		() => false,
	);

// ─── Icons: 24px strokes, square caps, as the rail draws them ─────────

const Icon = ({children}: {children: React.ReactNode}) => (
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		strokeLinecap="square"
		aria-hidden="true"
	>
		{children}
	</svg>
);

export const IconBoard = () => (
	<Icon>
		<rect x="3" y="4" width="5" height="16" />
		<rect x="10" y="4" width="5" height="11" />
		<rect x="17" y="4" width="4" height="7" />
	</Icon>
);

export const IconActivity = () => (
	<Icon>
		<path d="M3 12h4l3-7 4 14 3-7h4" />
	</Icon>
);

export const IconSearch = () => (
	<Icon>
		<rect x="4" y="4" width="12" height="12" />
		<path d="M16 16l5 5" />
	</Icon>
);

export const IconDevices = () => (
	<Icon>
		<rect x="7" y="2.5" width="10" height="19" />
		<path d="M11 18h2" />
	</Icon>
);

export const IconPerson = () => (
	<Icon>
		<rect x="8" y="3" width="8" height="8" />
		<path d="M4 21v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3" />
	</Icon>
);

export const IconClose = () => (
	<Icon>
		<path d="M6 6l12 12M18 6L6 18" />
	</Icon>
);

export const IconPalette = () => (
	<Icon>
		<circle cx="12" cy="12" r="9" />
		<circle cx="9" cy="10" r="1.5" fill="currentColor" />
		<circle cx="15" cy="10" r="1.5" fill="currentColor" />
		<circle cx="11" cy="15" r="1.5" fill="currentColor" />
		<circle cx="16" cy="15" r="1.5" fill="currentColor" />
	</Icon>
);

// ─── Desktop: the rail ────────────────────────────────────────────────

export const Rail = ({
	logOpen,
	onToggleLog,
	onOpenCommands,
	onOpenDevices,
	onOpenTheme,
}: {
	logOpen: boolean;
	onToggleLog: () => void;
	onOpenCommands: () => void;
	onOpenDevices: () => void;
	onOpenTheme: () => void;
}) => (
	<nav className="rail" aria-label="OME">
		<span className="rail-brand" aria-hidden="true">
			:ome
		</span>
		<button className="rail-button on" title="Board" aria-current="page">
			<IconBoard />
		</button>
		<button
			className={`rail-button${logOpen ? ' on' : ''}`}
			title="Activity (the event log)"
			aria-pressed={logOpen}
			onClick={onToggleLog}
		>
			<IconActivity />
		</button>
		<button
			className="rail-button"
			title="Commands and search (Ctrl K)"
			onClick={onOpenCommands}
		>
			<IconSearch />
		</button>
		<div className="rail-fill" />
		<button className="rail-button" title="Theme" onClick={onOpenTheme}>
			<IconPalette />
		</button>
		<button
			className="rail-button"
			data-testid="rail-devices"
			title="Devices: open this board on a phone"
			onClick={onOpenDevices}
		>
			<IconDevices />
		</button>
	</nav>
);

// ─── Devices: how a phone gets in ─────────────────────────────────────

type AccessInfo = {mode: string; local: boolean; origins: string[]};
type Pairing = {code: string; expiresAt: number; link: string; qr: string};

const MODE_LABELS: Record<string, string> = {
	local: 'This device only',
	lan: 'Local network',
	tailscale: 'Tailscale',
	cloudflare: 'Cloudflare Tunnel',
};

const postJson = async <T,>(path: string, body: unknown): Promise<T> => {
	const response = await fetch(path, {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify(body),
	});
	const parsed = (await response.json()) as T & {message?: string};

	if (!response.ok)
		throw new Error(parsed.message ?? `HTTP ${response.status}`);

	return parsed;
};

const remaining = (expiresAt: number, now: number): string => {
	const seconds = Math.max(0, Math.round((expiresAt - now) / 1000));

	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * What the Devices sheet holds, and the phone's Me tab: the address a phone
 * opens, a pairing code shown as a QR that signs it in once, and signing this
 * device out. The code is made on the server and spent on first use.
 */
export const DevicesPanel = () => {
	const [info, setInfo] = useState<AccessInfo | null>(null);
	const [pairing, setPairing] = useState<Pairing | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		void fetch('/api/access')
			.then(response => response.json() as Promise<AccessInfo>)
			.then(setInfo)
			.catch(() => setError('Could not read how this board is reached'));
	}, []);

	useEffect(() => {
		if (!pairing) return;

		const timer = window.setInterval(() => setNow(Date.now()), 1000);

		return () => window.clearInterval(timer);
	}, [pairing]);

	const expired = pairing !== null && pairing.expiresAt <= now;

	const pair = () => {
		setError(null);
		postJson<Pairing>('/api/access/pair', {origin: info?.origins[0]})
			.then(next => {
				setPairing(next);
				setNow(Date.now());
			})
			.catch((reason: Error) => setError(reason.message));
	};

	const signOut = () => {
		void postJson('/api/access/signout', {}).then(() => location.reload());
	};

	return (
		<div className="sheet-body">
			<dl className="kv">
				<dt>access</dt>
				<dd>{info ? MODE_LABELS[info.mode] ?? info.mode : '…'}</dd>
				<dt>open</dt>
				<dd>
					{info
						? info.origins.length
							? info.origins.join(' · ')
							: 'loopback only'
						: '…'}
				</dd>
				<dt>this</dt>
				<dd>
					{info
						? info.local
							? 'this machine'
							: 'signed in with the token'
						: '…'}
				</dd>
			</dl>

			<h3>Add a device</h3>
			{pairing && !expired ? (
				<>
					<div
						className="qr"
						role="img"
						aria-label={`QR code for ${pairing.link}`}
						// Drawn by the server from the link it just made; no input of
						// anybody else's reaches it.
						dangerouslySetInnerHTML={{__html: pairing.qr}}
					/>
					<div className="pair-code">
						{pairing.code.slice(0, 5)} {pairing.code.slice(5)}
					</div>
					<p className="muted" style={{margin: 0}}>
						Scan with the phone's camera, or open{' '}
						<span style={{color: 'var(--text)', overflowWrap: 'anywhere'}}>
							{pairing.link}
						</span>
						. Works once, for {remaining(pairing.expiresAt, now)} more.
					</p>
				</>
			) : (
				<p className="muted" style={{margin: 0}}>
					A pairing code signs one phone or browser in for a year. It lasts 15
					minutes and works once.
				</p>
			)}
			<button className="button primary wide" onClick={pair}>
				{pairing ? 'New pairing code' : 'Show a pairing code'}
			</button>

			{error && <p className="notice err">{error}</p>}

			{info && !info.local && (
				<>
					<h3>This device</h3>
					<button className="button wide" onClick={signOut}>
						Sign this device out
					</button>
				</>
			)}
		</div>
	);
};

export const DevicesSheet = ({onClose}: {onClose: () => void}) => {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);

		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div className="sheet-scrim" onClick={onClose}>
			<div
				className="sheet"
				role="dialog"
				aria-label="Devices"
				onClick={event => event.stopPropagation()}
			>
				<div className="sheet-head">
					<span>Devices</span>
					<button
						className="rail-button"
						style={{width: 44, height: 44}}
						title="Close"
						onClick={onClose}
					>
						<IconClose />
					</button>
				</div>
				<DevicesPanel />
			</div>
		</div>
	);
};

// ─── Phone ────────────────────────────────────────────────────────────

export type PhoneTab = 'board' | 'activity' | 'me';

export const PhoneTopBar = ({
	board,
	connection,
}: {
	board: React.ReactNode;
	connection: 'connected' | 'connecting' | 'reconnecting' | 'lost';
}) => (
	<header className="phone-top">
		<span className="rail-brand" aria-hidden="true">
			:ome
		</span>
		<div className="board-pick">{board}</div>
		<span
			className={`conn${
				connection === 'lost'
					? ' lost'
					: connection === 'connected'
					? ''
					: ' off'
			}`}
			title={connection}
			aria-label={connection}
		/>
	</header>
);

/**
 * The board one lane at a time: tabs along the top, and the lanes themselves
 * side by side in a pager that snaps to each, so a swipe and a tap on a tab
 * both land on a whole lane.
 */
export const LanePager = ({
	swimlanes,
	renderLane,
}: {
	swimlanes: readonly GuiSwimlane[];
	renderLane: (swimlane: GuiSwimlane) => React.ReactNode;
}) => {
	const pagerRef = useRef<HTMLDivElement | null>(null);
	const [index, setIndex] = useState(0);
	const shown = Math.min(index, Math.max(0, swimlanes.length - 1));

	const goTo = (next: number) => {
		const pager = pagerRef.current;
		if (!pager) return;

		pager.scrollTo({left: next * pager.clientWidth, behavior: 'smooth'});
	};

	return (
		<>
			<div className="lane-tabs" role="tablist">
				{swimlanes.map((swimlane, at) => (
					<button
						key={swimlane.id}
						role="tab"
						aria-selected={at === shown}
						className={`lane-tab${at === shown ? ' on' : ''}`}
						onClick={() => goTo(at)}
					>
						{swimlane.title}
						<span className="count">{swimlane.issues.length}</span>
					</button>
				))}
			</div>
			<div
				className="lane-pager"
				ref={pagerRef}
				onScroll={event => {
					const pager = event.currentTarget;
					const next = Math.round(pager.scrollLeft / pager.clientWidth);
					if (next !== index) setIndex(next);
				}}
			>
				{swimlanes.map(swimlane => (
					<div className="lane-page" key={swimlane.id}>
						{renderLane(swimlane)}
					</div>
				))}
			</div>
		</>
	);
};

export const PhoneTabBar = ({
	tab,
	onChange,
	onSearch,
}: {
	tab: PhoneTab;
	onChange: (tab: PhoneTab) => void;
	onSearch: () => void;
}) => (
	<nav className="tabbar" aria-label="Sections">
		<button
			className={`tab${tab === 'board' ? ' on' : ''}`}
			aria-current={tab === 'board' ? 'page' : undefined}
			onClick={() => onChange('board')}
		>
			<IconBoard />
			Board
		</button>
		<button
			className={`tab${tab === 'activity' ? ' on' : ''}`}
			aria-current={tab === 'activity' ? 'page' : undefined}
			onClick={() => onChange('activity')}
		>
			<IconActivity />
			Activity
		</button>
		<button className="tab" onClick={onSearch}>
			<IconSearch />
			Search
		</button>
		<button
			className={`tab${tab === 'me' ? ' on' : ''}`}
			aria-current={tab === 'me' ? 'page' : undefined}
			onClick={() => onChange('me')}
		>
			<IconPerson />
			Me
		</button>
	</nav>
);

/**
 * Above a ticket's sheet on a phone: which lane it is in, as a picker that
 * moves it — the touch screen's stand-in for dragging the card — and a way
 * back to the board.
 */
export const PhoneTicketBar = ({
	swimlanes,
	currentSwimlaneId,
	readonly,
	onMove,
	onClose,
}: {
	swimlanes: readonly GuiSwimlane[];
	currentSwimlaneId: string | null;
	readonly: boolean;
	onMove: (swimlaneId: string) => void;
	onClose: () => void;
}) => (
	<div className="phone-sheet-bar" style={{margin: '0 -20px'}}>
		<button
			className="button ghost"
			onClick={onClose}
			title="Back to the board"
		>
			← Board
		</button>
		<select
			className="field"
			aria-label="Lane"
			value={currentSwimlaneId ?? ''}
			disabled={readonly}
			onChange={event => onMove(event.currentTarget.value)}
		>
			{swimlanes.map(swimlane => (
				<option key={swimlane.id} value={swimlane.id}>
					{swimlane.title}
				</option>
			))}
		</select>
	</div>
);
