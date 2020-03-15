import { literal, stringItem, numberItem, booleanItem, choiceItem, array } from 'confinode';

export enum LogLevel {
	Trace = 'trace',
	Debug = 'debug',
	Info = 'info',
	Warn = 'warn',
	Error = 'error',
}

export interface Configuration {
	host: string;
	port: number;
	baseURL: string;
	developer: boolean;
	exitOnUncaught: boolean;
	logging: {
		replicants: boolean;
		console: {
			enabled: boolean;
			level: LogLevel;
		};
		file: {
			enabled: boolean;
			level: LogLevel;
			path: string;
		};
	};
	bundles: {
		enabled: string[];
		disabled: string[];
		paths: string[];
	};
	login: {
		enabled: boolean;
		sessionSecret: string;
		forceHttpsReturn: boolean;
		steam: {
			enabled: boolean;
			apiKey: string;
			allowedIds: string[];
		};
		twitch: {
			enabled: boolean;
			clientID: string;
			clientSecret: string;
			scope: string;
			allowedUsernames: string[];
		};
		local: {
			enabled: boolean;
			allowedUsers: Array<{ username: string; password: string }>;
		};
	};
	ssl: {
		enabled: boolean;
		allowHTTP: boolean;
		keyPath: string;
		certificatePath: string;
		passphrase: string;
	};
	sentry: {
		enabled: boolean;
		dsn: string;
	};
}

export const description = literal<Configuration>({
	host: stringItem('0.0.0.0'),
	port: numberItem(9090),
	baseURL: stringItem(''),
	developer: booleanItem(false),
	exitOnUncaught: booleanItem(true),
	logging: literal({
		replicants: booleanItem(false),
		console: literal({
			enabled: booleanItem(true),
			level: choiceItem(Object.values(LogLevel), LogLevel.Info),
		}),
		file: literal({
			enabled: booleanItem(true),
			level: choiceItem(Object.values(LogLevel), LogLevel.Info),
			path: stringItem('logs/nodecg.log'),
		}),
	}),
	bundles: literal({
		enabled: array(stringItem()),
		disabled: array(stringItem()),
		paths: array(stringItem()),
	}),
	login: literal({
		enabled: booleanItem(false),
		sessionSecret: stringItem(),
		forceHttpsReturn: booleanItem(false),
		steam: literal({
			enabled: booleanItem(false),
			apiKey: stringItem(),
			allowedIds: array(stringItem()),
		}),
		twitch: literal({
			enabled: booleanItem(false),
			clientID: stringItem(),
			clientSecret: stringItem(),
			scope: stringItem('user_read'),
			allowedUsernames: array(stringItem()),
		}),
		local: literal({
			enabled: booleanItem(false),
			allowedUsers: array(
				literal({
					username: stringItem(),
					password: stringItem(),
				}),
			),
		}),
	}),
	ssl: literal({
		enabled: booleanItem(false),
		allowHTTP: booleanItem(false),
		keyPath: stringItem(),
		certificatePath: stringItem(),
		passphrase: stringItem(),
	}),
	sentry: literal({
		enabled: booleanItem(false),
		dsn: stringItem(),
	}),
});
