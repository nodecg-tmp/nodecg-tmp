// Native
import fs from 'fs';

// Packages
import clone from 'clone';
import { cosmiconfigSync as cosmiconfig } from 'cosmiconfig';

const CONVICT_LOG_LEVEL = {
	doc: 'The lowest level of output to log. "trace" is the most, "error" is the least.',
	format(val: unknown) {
		return ['trace', 'debug', 'info', 'warn', 'error'].includes(val as string);
	},
	default: 'info',
};

const VALIDATE_STRING_ARRAY = function(val: unknown): boolean {
	return Array.isArray(val) && val.every(item => typeof item === 'string');
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function generateConfigSchema(userCfgPath: string) {
	const userCfgExists = fs.existsSync(userCfgPath);
	const baseSchema = {
		host: {
			doc: 'The IP address or hostname that NodeCG should bind to.',
			format: String,
			default: '0.0.0.0',
		},
		port: {
			doc: 'The port that NodeCG should listen on.',
			format: 'port',
			default: 9090,
		},
		baseURL: {
			doc:
				'The URL of this instance. Used for things like cookies. Defaults to HOST:PORT. ' +
				"If you use a reverse proxy, you'll likely need to set this value.",
			format: String,
			default: '',
		},
		developer: {
			doc: 'Deprecated, currently does nothing.',
			format: Boolean,
			default: false,
		},
		exitOnUncaught: {
			doc: 'Whether or not to exit on uncaught exceptions.',
			format: Boolean,
			default: true,
		},
		logging: {
			replicants: {
				doc: 'Whether to enable logging of the Replicants subsystem. Very spammy.',
				format: Boolean,
				default: false,
			},
			console: {
				enabled: {
					doc: 'Whether to enable console logging.',
					format: Boolean,
					default: true,
				},
				level: CONVICT_LOG_LEVEL,
			},
			file: {
				enabled: {
					doc: 'Whether to enable file logging.',
					format: Boolean,
					default: false,
				},
				level: CONVICT_LOG_LEVEL,
				path: {
					doc: 'The filepath to log to.',
					type: String,
					default: 'logs/nodecg.log',
				},
			},
		},
		bundles: {
			enabled: {
				doc: 'A whitelist array of bundle names that will be the only ones loaded at startup.',
				format(val: unknown) {
					return VALIDATE_STRING_ARRAY(val) || val === null; // eslint-disable-line new-cap
				},
				default: null,
				arg: 'bundlesEnabled',
			},
			disabled: {
				doc: 'A blacklist array of bundle names that will be excluded from loading at startup.',
				format(val: unknown) {
					return VALIDATE_STRING_ARRAY(val) || val === null; // eslint-disable-line new-cap
				},
				default: null,
				arg: 'bundlesDisabled',
			},
			paths: {
				doc: 'An array of additional paths where bundles are located',
				format(val: unknown) {
					return VALIDATE_STRING_ARRAY(val); // eslint-disable-line new-cap
				},
				default: [],
				arg: 'bundlesPaths',
			},
		},
	};

	if (!userCfgExists) {
		return {
			...baseSchema,
		};
	}

	const rawUserConfigFile = fs.readFileSync(userCfgPath, 'utf8');
	let userConfig;
	try {
		userConfig = JSON.parse(rawUserConfigFile);
	} catch {
		throw new Error(`Failed to parse ${userCfgPath}. Please ensure that it contains only valid JSON.`);
	}

	if (userConfig?.bundles?.enabled && userConfig?.bundles?.disabled) {
		throw new Error('nodecg.json may only contain EITHER bundles.enabled OR bundles.disabled, not both.');
	}

	const extendedSchema = {
		login: {
			enabled: {
				doc: 'Whether to enable login security.',
				format: Boolean,
				default: false,
			},
			sessionSecret: {
				doc: 'The secret used to salt sessions.',
				format: String,

				// This will throw if the user does not provide a value, but only if login security is enabled.
				default: userConfig?.login?.enabled ? null : '',
			},
			forceHttpsReturn: {
				doc:
					'Forces Steam & Twitch login return URLs to use HTTPS instead of HTTP. Useful in reverse proxy setups.',
				format: Boolean,
				default: false,
			},
			steam: {
				enabled: {
					doc: 'Whether to enable Steam authentication.',
					format: Boolean,
					default: false,
				},
				apiKey: {
					doc: 'A Steam API Key. Obtained from http://steamcommunity.com/dev/apikey',
					format: String,

					// This will throw if the user does not provide a value, but only if Steam auth is enabled.
					default: userConfig?.login?.steam?.enabled ? null : '',
				},
				allowedIds: {
					doc: 'Which 64 bit Steam IDs to allow. Can be obtained from https://steamid.io/',
					format: VALIDATE_STRING_ARRAY,

					// This will throw if the user does not provide a value, but only if Steam auth is enabled.
					default: userConfig?.login?.steam?.enabled ? null : [],
				},
			},
			twitch: {
				enabled: {
					doc: 'Whether to enable Twitch authentication.',
					format: Boolean,
					default: false,
				},
				clientID: {
					doc: 'A Twitch application ClientID http://twitch.tv/kraken/oauth2/clients/new',
					format: String,

					// This will throw if the user does not provide a value, but only if Twitch auth is enabled.
					default: userConfig?.login?.twitch?.enabled ? null : '',
				},
				clientSecret: {
					doc: 'A Twitch application ClientSecret http://twitch.tv/kraken/oauth2/clients/new',
					format: String,

					// This will throw if the user does not provide a value, but only if Twitch auth is enabled.
					default: userConfig?.login?.twitch?.enabled ? null : '',
				},
				scope: {
					doc: 'A space-separated string of Twitch application permissions.',
					format: String,
					default: 'user_read',
				},
				allowedUsernames: {
					doc: 'Which Twitch usernames to allow.',
					format: VALIDATE_STRING_ARRAY,

					// This will throw if the user does not provide a value, but only if Twitch auth is enabled.
					default: userConfig?.login?.twitch?.enabled ? null : [],
				},
			},
			local: {
				enabled: {
					doc: 'Enable Local authentication.',
					format: Boolean,
					default: false,
				},
				allowedUsers: {
					doc: 'Which users can log in.',
					format: VALIDATE_STRING_ARRAY,

					// This will throw if the user does not provide a value, but only if Local auth is enabled.
					default: userConfig?.login?.local?.enabled ? null : [],
				},
			},
		},
		ssl: {
			enabled: {
				doc: 'Whether to enable SSL/HTTPS encryption.',
				format: Boolean,
				default: false,
			},
			allowHTTP: {
				doc: 'Whether to allow insecure HTTP connections while SSL is active.',
				format: Boolean,
				default: false,
			},
			keyPath: {
				doc: 'The path to an SSL key file.',
				format: String,

				// This will throw if the user does not provide a value, but only if SSL is enabled.
				default: userConfig?.ssl?.enabled ? null : '',
			},
			certificatePath: {
				doc: 'The path to an SSL certificate file.',
				format: String,

				// This will throw if the user does not provide a value, but only if SSL is enabled.
				default: userConfig?.ssl?.enabled ? null : '',
			},
			passphrase: {
				doc: 'The passphrase for the provided key file.',
				format: String,
				default: '',
			},
		},
		sentry: {
			enabled: {
				doc: 'Whether to enable Sentry error reporting.',
				format: Boolean,
				default: false,
			},
			dsn: {
				doc: "Your project's DSN, used to route alerts to the correct place.",
				format: String,

				// This will throw if the user does not provide a value, but only if Sentry is enabled.
				default: userConfig?.sentry?.enabled ? null : '',
			},
		},
	};

	return { ...baseSchema, ...extendedSchema };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function(userCfgPath: string) {
	const convictSchema = generateConfigSchema(userCfgPath);

	// Load user config if it exists, and merge it
	const userCfgExists = fs.existsSync(userCfgPath);
	const convictConfig = convict(convictSchema);
	if (userCfgExists) {
		convictConfig.loadFile(userCfgPath);
	} else {
		console.info('[nodecg] No config found, using defaults.');
	}

	convictConfig.validate({ allowed: 'strict' });
	const config = convictConfig.getProperties();

	config.baseURL = config.baseURL || `${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;

	// Create the filtered config
	const filteredConfig = {
		host: config.host,
		port: config.port,
		developer: config.developer,
		baseURL: config.baseURL,
		logging: {
			replicants: config.logging.replicants,
			console: config.logging.console,
			file: {
				enabled: config.logging.file.enabled,
				level: config.logging.file.level,
			},
		},
		sentry: {
			enabled: config.sentry.enabled,
			publicDsn: config.sentry.publicDsn,
		},
	};

	if ('login' in config) {
		filteredConfig.login = {
			enabled: config.login.enabled,
		};

		if (config.login.steam) {
			filteredConfig.login.steam = {
				enabled: config.login.steam.enabled,
			};
		}

		if (config.login.twitch) {
			filteredConfig.login.twitch = {
				enabled: config.login.twitch.enabled,
				clientID: config.login.twitch.clientID,
				scope: config.login.twitch.scope,
			};
		}

		if (config.login.local) {
			filteredConfig.login.local = {
				enabled: config.login.local.enabled,
			};
		}
	}

	if (config.ssl) {
		filteredConfig.ssl = {
			enabled: config.ssl.enabled,
		};
	}

	return {
		config: clone(config),
		filteredConfig: clone(filteredConfig),
	};
}
