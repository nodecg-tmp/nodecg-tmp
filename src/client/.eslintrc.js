module.exports = {
	env: {
		node: false,
		browser: true,
	},
	globals: {
		NodeCG: true,
		Clipboard: true,
		Packery: true,
		Draggabilly: true,
	},
	parserOptions: {
		project: './tsconfig.json',
		tsconfigRootDir: __dirname,
	},
};
