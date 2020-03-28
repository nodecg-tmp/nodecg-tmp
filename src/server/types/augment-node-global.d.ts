declare namespace NodeJS {
	export interface Global {
		/**
		 * It'd be good to refactor the program to not need these, if possible.
		 * But, they aren't really hurting anything.
		 */
		exitOnUncaught: boolean;
		sentryEnabled: boolean;
	}

	export interface ProcessEnv {
		/**
		 * Setting this is one of the first thing NodeCG does on startup.
		 */
		NODECG_ROOT: string;
	}
}
