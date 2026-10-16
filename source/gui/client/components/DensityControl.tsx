import {GUI_THEME, TEXT} from '../lib/gui-theme';
import {usePersistedChoice} from '../lib/use-persisted-flag';

// How much air a card gets. `comfortable` is the board as it has always been
// drawn; `compact` is for reading a long lane at once, and is the only thing
// that moves the numbers.
export type Density = 'comfortable' | 'compact';

// Stored the way every other client-side choice is (use-persisted-flag): one
// key, one value, no second store.
export const DENSITY_STORAGE_KEY = 'ome.board.density';

const isDensity = (value: string): value is Density =>
	value === 'comfortable' || value === 'compact';

/**
 * The board's density, and the way to change it.
 *
 * `usePersistedChoice` answers null for anything it has not been told, which is
 * the state a first visit is in — and a first visit gets the comfortable board.
 */
export const useDensity = (): [Density, (next: Density) => void] => {
	const [stored, setStored] = usePersistedChoice<Density>(
		DENSITY_STORAGE_KEY,
		isDensity,
	);

	return [stored ?? 'comfortable', setStored];
};

/**
 * Two states of one board, side by side, the on one filled.
 *
 * A segmented control rather than a checkbox: both ends are named, so the
 * comfortable board is a thing somebody can go back to rather than the absence
 * of compact. What it changes is the density tokens in ome.css, read by the
 * card styles — the control itself sets nothing.
 */
export const DensityControl = ({
	density,
	onChange,
}: {
	density: Density;
	onChange: (next: Density) => void;
}) => (
	<div
		data-testid="board-density"
		role="group"
		aria-label="Ticket density"
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			// The same hairline the status pills beside it wear, so the bar reads
			// as one row of small controls.
			border: `1px solid ${GUI_THEME.line}`,
			whiteSpace: 'nowrap',
		}}
	>
		{(['comfortable', 'compact'] as const).map(value => {
			const active = value === density;

			return (
				<button
					key={value}
					type="button"
					data-testid={`board-density-${value}`}
					aria-pressed={active}
					title={
						active
							? undefined
							: value === 'compact'
							? 'Fit more tickets on the board'
							: 'Give every ticket its air back'
					}
					onClick={() => onChange(value)}
					style={{
						background: active ? GUI_THEME.accentWash : 'transparent',
						border: 'none',
						color: active ? GUI_THEME.accent : GUI_THEME.dim,
						font: 'inherit',
						fontSize: TEXT.meta,
						fontWeight: active ? 700 : 400,
						padding: '5px 9px',
						cursor: 'pointer',
						// Square, like everything else in the shell: the two
						// segments are held apart by the line between them rather
						// than by a rounded box around each.
						borderLeft: `1px solid ${GUI_THEME.line}`,
						...(value === 'comfortable' ? {borderLeft: 'none'} : {}),
					}}
				>
					{value}
				</button>
			);
		})}
	</div>
);
