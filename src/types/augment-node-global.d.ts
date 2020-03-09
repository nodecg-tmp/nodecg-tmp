declare namespace NodeJS {
	export interface Global {
		exitOnUncaught: boolean;
		sentryEnabled: boolean;
	}
}
