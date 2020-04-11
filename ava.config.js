export default {
	files: ['test/**'],
	helpers: ['test/fixtures/**', 'test/helpers/**'],
	concurrency: 1,
	timeout: '30s',
	verbose: true,
	environmentVariables: {
		test: 'true',
		NODECG_TEST: 'true',
	},
};
