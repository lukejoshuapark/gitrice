import type { Config } from "tailwindcss";

const config: Config = {
	content: [
		"./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./src/components/**/*.{js,ts,jsx,tsx,mdx}",
		"./src/app/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			colors: {
				github: {
					header: "#0d1117",
					"header-text": "#e6edf3",
					"header-muted": "#7d8590",
					border: "#d0d7de",
					"border-muted": "#d8dee4",
					canvas: "#f6f8fa",
					"canvas-subtle": "#f6f8fa",
					fg: "#1f2328",
					"fg-muted": "#656d76",
					accent: "#0969da",
					"accent-hover": "#0550ae",
					open: "#1a7f37",
					closed: "#8250df",
					danger: "#d1242f",
				},
			},
		},
	},
	plugins: [],
};

export default config;
