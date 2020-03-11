// Packages
import * as Sentry from '@sentry/node';

// Ours
import configHelper from '../config';
import loggerFactory, { LoggerInterface } from './logger.server';

export { LoggerInterface } from './logger.server';

let Logger: new (name: string) => LoggerInterface;
if (configHelper.config.sentry.enabled) {
	Logger = loggerFactory(configHelper.config.logging, Sentry);
} else {
	Logger = loggerFactory(configHelper.config.logging);
}

export default function(name: string): LoggerInterface {
	return new Logger(name);
}
