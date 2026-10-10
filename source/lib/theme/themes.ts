export const colors = {
	// Base — the OMP near-black ground, so the TUI and the GUI agree.
	bg: '#070708',
	fg: '#f5f5f5',

	// Grays (neutral, a step cooler than the accents)
	grayDark: '#2a2a30',
	gray: '#626368',
	grayLight: '#c3c4c7',

	// Accents — the OMP family

	// Cyan secondary
	cyan: '#00dbe4',
	cyanSoft: '#7ff2f6',

	// Violet bridge (what the old palette called "blue")
	blue: '#9362f4',

	// Magenta primary — OMP's accent
	magenta: '#f84fcc',
	magentaSoft: '#ff9adf',

	// Semantic
	green: '#8ce99a',
	yellow: '#ffc078',
	red: '#ff8787',

	white: '#ffffff',
} as const;

export const theme = {
	accent: colors.magenta,
	accent2: colors.cyan,
	primary: colors.white,
	secondary: colors.grayDark,
	secondary2: colors.grayLight,
	gray: colors.gray,
	green: colors.green,
	yellow: colors.yellow,
	red: colors.red,
};
