import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	...compat.extends("next/core-web-vitals", "next/typescript"),
	{
		rules: {
			"indent": ["error", "tab", { "SwitchCase": 1 }],
			"no-tabs": "off",
			"quotes": ["error", "double"],
			"jsx-quotes": ["error", "prefer-double"],
			"semi": ["error", "always"],
			"no-multiple-empty-lines": ["error", { "max": 1, "maxBOF": 0, "maxEOF": 0 }],
			"eol-last": ["error", "always"],
		},
	},
];

export default eslintConfig;
