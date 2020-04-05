// Packages
import clone from 'clone';
import * as Joi from '@hapi/joi';
import 'joi-extract-type';
import { cosmiconfigSync as cosmiconfig } from 'cosmiconfig';
import { argv } from 'yargs';

// Ours
import { LogLevel } from '../../shared/logger-interface';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getConfigSchema(userConfig: { [k: string]: any } | null) {
	return Joi.object({
		host: Joi.string()
			.default('0.0.0.0')
			.description('The IP address or hostname that NodeCG should bind to.'),

		port: Joi.number()
			.port()
			.default(9090)
			.description('The port that NodeCG should listen on.'),

		baseURL: Joi.string()
			.hostname()
			.default('')
			.description(
				'The URL of this instance. Used for things like cookies. Defaults to HOST:PORT. ' +
					"If you use a reverse proxy, you'll likely need to set this value.",
			),

		exitOnUncaught: Joi.boolean()
			.default(true)
			.description('Whether or not to exit on uncaught exceptions.'),

		logging: Joi.object({
			replicants: Joi.boolean()
				.default(false)
				.description('Whether to enable logging of the Replicants subsystem. Very spammy.'),

			console: Joi.object({
				enabled: Joi.boolean()
					.default(true)
					.description('Whether to enable console logging.'),

				level: Joi.string()
					.valid(...Object.values(LogLevel))
					.default('info'),
			}).required(),

			file: Joi.object({
				enabled: Joi.boolean()
					.default(false)
					.description('Whether to enable file logging.'),
				level: Joi.string()
					.valid(...Object.values(LogLevel))
					.default('info'),

				path: Joi.string()
					.default('logs/nodecg.log')
					.description('The filepath to log to.'),
			}).required(),
		}).required(),

		bundles: Joi.object({
			enabled: Joi.array()
				.items(Joi.string())
				.allow(null)
				.default(argv.bundlesEnabled ?? null)
				.description('A whitelist array of bundle names that will be the only ones loaded at startup.'),

			disabled: Joi.array()
				.items(Joi.string())
				.allow(null)
				.default(argv.bundlesDisabled ?? null)
				.description('A blacklist array of bundle names that will be excluded from loading at startup.'),

			paths: Joi.array()
				.items(Joi.string())
				.default(argv.bundlesPaths ?? [])
				.description('An array of additional paths where bundles are located.'),
		}),

		login: Joi.object({
			enabled: Joi.boolean()
				.default(false)
				.description('Whether to enable login security.'),
			sessionSecret: Joi.string()
				// This will throw if the user does not provide a value, but only if login security is enabled.
				.default(userConfig?.login?.enabled ? null : '')
				.description('The secret used to salt sessions.'),
			forceHttpsReturn: Joi.boolean()
				.default(false)
				.description(
					'Forces Steam & Twitch login return URLs to use HTTPS instead of HTTP. Useful in reverse proxy setups.',
				),
			steam: Joi.object({
				enabled: Joi.boolean()
					.default(false)
					.description('Whether to enable Steam authentication.'),
				apiKey: Joi.string()
					// This will throw if the user does not provide a value, but only if Steam auth is enabled.
					.default(userConfig?.login?.steam?.enabled ? null : '')
					.description('A Steam API Key. Obtained from http://steamcommunity.com/dev/apikey'),
				allowedIds: Joi.array()
					.items(Joi.string())
					// This will throw if the user does not provide a value, but only if Steam auth is enabled.
					.default(userConfig?.login?.steam?.enabled ? null : [])
					.description('Which 64 bit Steam IDs to allow. Can be obtained from https://steamid.io/'),
			}),

			twitch: Joi.object({
				enabled: Joi.boolean()
					.default(false)
					.description('Whether to enable Twitch authentication.'),
				clientID: Joi.string()
					// This will throw if the user does not provide a value, but only if Twitch auth is enabled.
					.default(userConfig?.login?.twitch?.enabled ? null : '')
					.description('A Twitch application ClientID http://twitch.tv/kraken/oauth2/clients/new'),
				clientSecret: Joi.string()
					// This will throw if the user does not provide a value, but only if Twitch auth is enabled.
					.default(userConfig?.login?.twitch?.enabled ? null : '')
					.description('A Twitch application ClientSecret http://twitch.tv/kraken/oauth2/clients/new'),
				scope: Joi.string()
					.default('user_read')
					.description('A space-separated string of Twitch application permissions.'),

				allowedUsernames: Joi.array()
					.items(Joi.string())
					// This will throw if the user does not provide a value, but only if Twitch auth is enabled.
					.default(userConfig?.login?.twitch?.enabled ? null : [])
					.description('Which Twitch usernames to allow.'),
			}),

			local: Joi.object({
				enabled: Joi.boolean()
					.default(false)
					.description('Enable Local authentication.'),
				allowedUsers: Joi.array()
					.items(
						Joi.object({
							username: Joi.string(),
							password: Joi.string(),
						}),
					)
					// This will throw if the user does not provide a value, but only if Local auth is enabled.
					.default(userConfig?.login?.local?.enabled ? null : [])
					.description('Which users can log in.'),
			}),
		}).optional(),

		ssl: Joi.object({
			enabled: Joi.boolean()
				.default(false)
				.description('Whether to enable SSL/HTTPS encryption.'),
			allowHTTP: Joi.boolean()
				.default(false)
				.description('Whether to allow insecure HTTP connections while SSL is active.'),
			keyPath: Joi.string()
				// This will throw if the user does not provide a value, but only if SSL is enabled.
				.default(userConfig?.ssl?.enabled ? null : '')
				.description('The path to an SSL key file.'),
			certificatePath: Joi.string()
				// This will throw if the user does not provide a value, but only if SSL is enabled.
				.default(userConfig?.ssl?.enabled ? null : '')
				.description('The path to an SSL certificate file.'),
			passphrase: Joi.string()
				.default('')
				.description('The passphrase for the provided key file.'),
		}).optional(),

		sentry: Joi.object({
			enabled: Joi.boolean()
				.default(false)
				.description('Whether to enable Sentry error reporting.'),
			dsn: Joi.string()
				// This will throw if the user does not provide a value, but only if Sentry is enabled.
				.default(userConfig?.sentry?.enabled ? null : '')
				.description("Your project's DSN, used to route alerts to the correct place."),
		}).optional(),
	});
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function(cfgDir: string) {
	const cc = cosmiconfig('nodecg', {
		searchPlaces: ['nodecg.json', 'nodecg.yaml', 'nodecg.yml', 'nodecg.js', 'nodecg.config.js'],
		stopDir: cfgDir,
	});
	const result = cc.search(cfgDir);
	const userCfg = result?.config;

	if (userCfg?.bundles?.enabled && userCfg?.bundles?.disabled) {
		throw new Error('nodecg.json may only contain EITHER bundles.enabled OR bundles.disabled, not both.');
	} else if (!userCfg) {
		console.info('[nodecg] No config found, using defaults.');
	}

	const schema = getConfigSchema(userCfg);
	const validationResult = schema.validate(userCfg);
	if (validationResult.error) {
		console.error('[nodecg] Config invalid:\n', validationResult.error.annotate());
		return process.exit(1);
	}

	const config: Joi.extractType<typeof schema> = validationResult.value;
	if (!config) {
		console.error('[nodecg] config unexpectedly undefined. This is a bug with NodeCG, not your config.');
		return process.exit(1);
	}

	config.baseURL =
		config.baseURL ?? `${config.host === '0.0.0.0' ? 'localhost' : String(config.host)}:${String(config.port)}`;

	// Create the filtered config
	const filteredConfig: {
		host: string;
		port: number;
		baseURL: string;
		logging: {
			replicants: boolean;
			console: {
				enabled: boolean;
				level: string;
			};
			file: {
				enabled: boolean;
				level: string;
			};
		};
		sentry: {
			enabled: boolean;
			dsn: string;
		};
		login?: {
			enabled: boolean;
			steam?: {
				enabled: boolean;
			};
			twitch?: {
				enabled: boolean;
				clientID?: string;
				scope: string;
			};
			local?: {
				enabled: boolean;
			};
		};
		ssl?: {
			enabled: boolean;
		};
	} = {
		host: config.host,
		port: config.port,
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
			enabled: config.sentry?.enabled ?? false,
			dsn: config.sentry?.dsn ?? '',
		},
	};

	if (config.login) {
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
