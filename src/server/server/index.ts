// Minimal imports for first setup
import * as os from 'os';
import * as Sentry from '@sentry/node';
import config, { filteredConfig } from '../config';
import '../util/sentry-config';
import * as pjson from '../../../package.json';

global.exitOnUncaught = config.exitOnUncaught;
if (config.sentry && config.sentry.enabled) {
	Sentry.init({
		dsn: config.sentry.dsn,
		serverName: os.hostname(),
		release: pjson.version,
	});
	Sentry.configureScope(scope => {
		scope.setTags({
			nodecgHost: config.host,
			nodecgBaseURL: config.baseURL,
		});
	});
	global.sentryEnabled = true;

	process.on('unhandledRejection', (reason, p) => {
		console.error('Unhandled Rejection at:', p, 'reason:', reason);
		Sentry.captureException(reason);
	});

	console.info('[nodecg] Sentry enabled.');
}

// Native
import { EventEmitter } from 'events';
import fs = require('fs');
import path = require('path');

// Packages
import bodyParser from 'body-parser';
import clone from 'clone';
import debounce from 'lodash.debounce';
import express from 'express';
import fetch from 'make-fetch-happen';
import semver from 'semver';
import template from 'lodash.template';
import memoize from 'fast-memoize';
import transformMiddleware from 'express-transform-bare-module-specifiers';
import compression from 'compression';
import { Server } from 'http';
import SocketIO from 'socket.io';

// Ours
import bundleManager = require('../bundle-manager');
import createLogger from '../logger';
import socketAuthMiddleware from '../login/socketAuthMiddleware';
import socketApiMiddleware from './socketApiMiddleware';

const io = SocketIO();
const log = createLogger('nodecg/lib/server');

// Check for updates
fetch('http://registry.npmjs.org/nodecg/latest')
	.then((res: any) => res.json())
	.then((body: any) => {
		if (semver.gt(body.version, pjson.version)) {
			log.warn('An update is available for NodeCG: %s (current: %s)', JSON.parse(body).version, pjson.version);
		}
	})
	.catch(
		/* istanbul ignore next */ () => {
			// Discard errors.
		},
	);

const renderTemplate = memoize((content, options) => {
	return template(content)(options);
});

const emitter = new EventEmitter();
export default emitter;

export async function start(): Promise<() => void> {
	log.info('Starting NodeCG %s (Running on Node.js %s)', pjson.version, process.version);

	// (Re)create Express app, HTTP(S) & Socket.IO servers
	const app = express();

	if (global.sentryEnabled) {
		app.use(Sentry.Handlers.requestHandler());
	}

	let server: Server;
	if (config.ssl && config.ssl.enabled) {
		const sslOpts: { key: Buffer; cert: Buffer; passphrase?: string } = {
			key: fs.readFileSync(config.ssl.keyPath),
			cert: fs.readFileSync(config.ssl.certificatePath),
		};
		if (config.ssl.passphrase) {
			sslOpts.passphrase = config.ssl.passphrase;
		}

		// If we allow HTTP on the same port, use httpolyglot
		// otherwise, standard https server
		server = config.ssl.allowHTTP
			? require('httpolyglot').createServer(sslOpts, app)
			: require('https').createServer(sslOpts, app);
	} else {
		server = require('http').createServer(app);
	}

	// Set up Express
	log.trace('Setting up Express');
	app.use(compression());
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));

	app.engine('tmpl', (filePath: string, options: any, callback: any) => {
		fs.readFile(filePath, (error, content) => {
			if (error) {
				return callback(error);
			}

			return callback(null, renderTemplate(content, options));
		});
	});

	if (config.login && config.login.enabled) {
		log.info('Login security enabled');
		const login = await import('../login');
		app.use(await login.createMiddleware());
		io.use(socketAuthMiddleware);
	} else {
		app.get('/login*', (_, res) => {
			res.redirect('/dashboard');
		});
	}

	const bundlesPaths = [path.join(process.env.NODECG_ROOT, 'bundles')].concat(config.bundles.paths);
	const cfgPath = path.join(process.env.NODECG_ROOT, 'cfg');
	bundleManager.init(bundlesPaths, cfgPath, pjson.version, config);
	bundleManager.all().forEach(bundle => {
		// TODO: deprecate this feature once Import Maps are shipped and stable in browsers.
		// TODO: remove this feature after Import Maps have been around a while (like a year maybe).
		if (bundle.transformBareModuleSpecifiers) {
			const opts = {
				rootDir: process.env.NODECG_ROOT,
				modulesUrl: `/bundles/${bundle.name}/node_modules`,
			};
			app.use(`/bundles/${bundle.name}/*`, transformMiddleware(opts));
		}
	});

	io.on('error', (err: Error) => {
		if (global.sentryEnabled) {
			Sentry.captureException(err);
		}

		log.error(err.stack);
	});

	io.use(socketApiMiddleware);

	log.trace(`Attempting to listen on ${config.host}:${config.port}`);
	server.on('error', err => {
		switch ((err as any).code) {
			case 'EADDRINUSE':
				if (process.env.NODECG_TEST) {
					return;
				}

				log.error(
					`Listen ${config.host}:${config.port} in use, is NodeCG already running? NodeCG will now exit.`,
				);
				break;
			default:
				log.error('Unhandled error!', err);
				break;
		}

		emitter.emit('error', err);
	});

	if (global.sentryEnabled) {
		log.trace('Starting sentry helper lib');
		const sentryHelpers = await import('../util/sentry-config');
		app.use(sentryHelpers.app);
	}

	log.trace('Starting graphics lib');
	const graphics = await import('../graphics');
	app.use(graphics);

	log.trace('Starting dashboard lib');
	const dashboard = await import('../dashboard.ts');
	app.use(dashboard);

	log.trace('Starting mounts lib');
	const mounts = await import('../mounts');
	app.use(mounts.default);

	log.trace('Starting bundle sounds lib');
	const sounds = await import('../sounds');
	app.use(sounds);

	log.trace('Starting bundle assets lib');
	const assets = await import('../assets');
	app.use(assets);

	log.trace('Starting bundle shared sources lib');
	const sharedSources = await import('../shared-sources');
	app.use(sharedSources);

	if (global.sentryEnabled) {
		app.use(Sentry.Handlers.errorHandler());
	}

	// Fallthrough error handler,
	// Taken from https://docs.sentry.io/platforms/node/express/
	app.use((_, res) => {
		res.statusCode = 500;
		if (global.sentryEnabled) {
			// The error id is attached to `res.sentry` to be returned
			// and optionally displayed to the user for support.
			res.end(`${String((res as any).sentry)}\n`);
		} else {
			res.end('Internal error');
		}
	});

	// Set up "bundles" Replicant.
	const Replicant = await import('../replicant');
	const bundlesReplicant = new Replicant('bundles', 'nodecg', {
		schemaPath: path.resolve(__dirname, '../../schemas/bundles.json'),
		persistent: false,
	});
	const updateBundlesReplicant = debounce(() => {
		bundlesReplicant.value = clone(bundleManager.all());
	}, 100);
	bundleManager.on('init', updateBundlesReplicant);
	bundleManager.on('bundleChanged', updateBundlesReplicant);
	bundleManager.on('gitChanged', updateBundlesReplicant);
	bundleManager.on('bundleRemoved', updateBundlesReplicant);
	updateBundlesReplicant();

	extensionManager = await import('./extensions');
	extensionManager.init();
	emitter.emit('extensionsLoaded');

	// We intentionally wait until all bundles and extensions are loaded before starting the server.
	// This has two benefits:
	// 1) Prevents the dashboard/views from being opened before everything has finished loading
	// 2) Prevents dashboard/views from re-declaring replicants on reconnect before extensions have had a chance
	server.listen(
		{
			host: config.host,
			port: process.env.NODECG_TEST ? undefined : config.port,
		},
		() => {
			if (process.env.NODECG_TEST) {
				const addrInfo = server.address();
				if (typeof addrInfo !== 'object' || addrInfo === null) {
					throw new Error("couldn't get port number");
				}

				const { port } = addrInfo;
				log.warn(`Test mode active, using automatic listen port: ${port}`);
				config.port = port;
				filteredConfig.port = port;
				process.env.NODECG_TEST_PORT = String(port);
			}

			const protocol = config.ssl && config.ssl.enabled ? 'https' : 'http';
			log.info('NodeCG running on %s://%s', protocol, config.baseURL);
			emitter.emit('started');
		},
	);

	/**
	 * The stop/shutdown function.
	 */
	return () => {
		if (server) {
			server.close();
		}

		if (io) {
			io.close();
		}

		require('../replicator').saveAllReplicants();

		extensionManager = null;
		io = null;
		server = null;
		app = null;

		emitter.emit('stopped');
	};
}

export function getExtensions(): { [k: string]: unknown } {
	/* istanbul ignore else */
	if (extensionManager) {
		return extensionManager.getExtensions();
	}

	/* istanbul ignore next */
	return {};
}

export function getIO(): SocketIO.Server | null {
	return io;
}

export function mount(...handlers: express.RequestHandler[]): void {
	if (app) {
		app.use(...handlers);
	}
}
