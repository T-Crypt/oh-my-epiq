import {GUI_THEME, PROSE} from '../lib/gui-theme';

// A commit's message below its subject, line for line as its author wrote
// it: an OME-Ref line is how a commit says which tickets it is for.
export const CommitBody = ({
	body,
	color = GUI_THEME.secondary,
}: {
	body: string;
	// Secondary under a subject; primary where it stands alone.
	color?: string;
}) => (
	<div
		data-testid="commit-body"
		style={{
			...PROSE,
			color,
			whiteSpace: 'pre-wrap',
			overflowWrap: 'anywhere',
			padding: '10px 0',
		}}
	>
		{body}
	</div>
);
