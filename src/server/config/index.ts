// Native
import * as path from 'path';

// Packages
import * as fs from 'fs-extra';
import { Confinode } from 'confinode';
import { description } from './configDescription';

// Ours
import { name as moduleName } from '../../../package.json';

const cfgDirectoryPath = path.join(process.env.NODECG_ROOT, 'cfg');

// Make 'cfg' folder if it doesn't exist
if (!fs.existsSync(cfgDirectoryPath)) {
	fs.mkdirpSync(cfgDirectoryPath);
}

const confinode = new Confinode(moduleName, description, { mode: 'sync', files: [moduleName] });
const configResult = confinode.search();
if (!configResult) {
	throw new Error('config unexpectedly empty');
}

const config = configResult.configuration;
export default config;
export { LogLevel } from './configDescription';

export const filteredConfig = {
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
		dsn: config.sentry.dsn,
	},
	login: {
		enabled: config.login.enabled,
		steam: {
			enabled: config.login.steam.enabled,
		},
		twitch: {
			enabled: config.login.twitch.enabled,
			clientID: config.login.twitch.clientID,
			scope: config.login.twitch.scope,
		},
		local: {
			enabled: config.login.local.enabled,
		},
		ssl: {
			enabled: config.ssl.enabled,
		},
	},
};
