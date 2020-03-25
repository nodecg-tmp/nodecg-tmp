// Native
import * as path from 'path';
import { format, inspect } from 'util';

// Packages
import * as fs from 'fs-extra';
import winston from 'winston';
import * as Sentry from '@sentry/node';

const enum LogLevel {
	Trace = 'verbose',
	Debug = 'debug',
	Info = 'info',
	Warn = 'warn',
	Error = 'error',
}

type LoggerOptions = {
	console: {
		enabled: boolean;
		level: LogLevel;
	};
	file: {
		enabled: boolean;
		level: LogLevel;
		path: string;
	};
	replicants: boolean;
};

/**
 * A factory that configures and returns a Logger constructor.
 *
 * @returns A constructor used to create discrete logger instances.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function(initialOpts: LoggerOptions, sentry?: typeof Sentry) {
	initialOpts = initialOpts || {};
	initialOpts.console = initialOpts.console || {};
	initialOpts.file = initialOpts.file || {};
	initialOpts.file.path = initialOpts.file.path || 'logs/nodecg.log';

	const consoleTransport = new winston.transports.Console({
		name: 'nodecgConsole',
		prettyPrint: true,
		colorize: true,
		level: initialOpts.console.level || 'info',
		silent: !initialOpts.console.enabled,
		stderrLevels: ['warn', 'error'],
	});

	const fileTransport = new winston.transports.File({
		name: 'nodecgFile',
		json: false,
		prettyPrint: true,
		filename: initialOpts.file.path,
		level: initialOpts.file.level || 'info',
		silent: !initialOpts.file.enabled,
	});

	winston.addColors({
		verbose: 'green',
		debug: 'cyan',
		info: 'white',
		warn: 'yellow',
		error: 'red',
	});

	const mainLogger = new winston.Logger({
		transports: [consoleTransport, fileTransport],
		levels: {
			verbose: 4,
			trace: 4,
			debug: 3,
			info: 2,
			warn: 1,
			error: 0,
		},
	});

	/**
	 * Constructs a new Logger instance that prefixes all output with the given name.
	 * @param name {String} - The label to prefix all output of this logger with.
	 * @returns {Object} - A Logger instance.
	 * @constructor
	 */
	class Logger implements LoggerInterface {
		static readonly _winston = mainLogger;

		// A messy bit of internal state used to determine if the special-case "replicants" logging level is active.
		static _shouldLogReplicants = Boolean(initialOpts.replicants);

		name: string;

		constructor(name: string) {
			this.name = name;
		}

		static globalReconfigure(opts: LoggerOptions): void {
			_configure(opts);
		}

		trace(...args: any[]): void {
			mainLogger.verbose(`[${this.name}]`, ...args);
		}

		debug(...args: any[]): void {
			mainLogger.debug(`[${this.name}]`, ...args);
		}

		info(...args: any[]): void {
			mainLogger.info(`[${this.name}]`, ...args);
		}

		warn(...args: any[]): void {
			mainLogger.warn(`[${this.name}]`, ...args);
		}

		error(...args: any[]): void {
			mainLogger.error(`[${this.name}]`, ...args);

			if (sentry) {
				const formattedArgs = args.map(argument => {
					return typeof argument === 'object'
						? inspect(argument, { depth: null, showProxy: true })
						: argument;
				});

				sentry.captureException(
					new Error(`[${this.name}] ` + format(formattedArgs[0], ...formattedArgs.slice(1))),
				);
			}
		}

		replicants(...args: any[]): void {
			if (!Logger._shouldLogReplicants) {
				return;
			}

			mainLogger.info(`[${this.name}]`, ...args.slice(1));
		}
	}

	_configure(initialOpts);

	function _configure(opts: LoggerOptions): void {
		// Initialize opts with empty objects, if nothing was provided.
		opts = opts || {};
		opts.console = opts.console || {};
		opts.file = opts.file || {};

		if (typeof opts.console.enabled !== 'undefined') {
			consoleTransport.silent = !opts.console.enabled;
		}

		if (typeof opts.console.level !== 'undefined') {
			consoleTransport.level = opts.console.level;
		}

		if (typeof opts.file.enabled !== 'undefined') {
			fileTransport.silent = !opts.file.enabled;
		}

		if (typeof opts.file.level !== 'undefined') {
			fileTransport.level = opts.file.level;
		}

		if (typeof opts.file.path !== 'undefined') {
			// TODO: I think this typedef is wrong. Re-evaluate after upgrading to Winston 3.
			(fileTransport as any).filename = opts.file.path;

			// Make logs folder if it does not exist.
			if (!fs.existsSync(path.dirname(opts.file.path))) {
				fs.mkdirpSync(path.dirname(opts.file.path));
			}
		}

		if (typeof opts.replicants !== 'undefined') {
			Logger._shouldLogReplicants = opts.replicants;
		}
	}

	const typedExport: new (name: string) => LoggerInterface = Logger;
	return typedExport;
}
