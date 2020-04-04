// Packages
import * as Sentry from '@sentry/node';

// Ours
import configHelper from '../config';
import loggerFactory from './logger.server';
import { LoggerInterface } from '../../shared/logger-interface';

export let Logger: new (name: string) => LoggerInterface;
if (configHelper.config.sentry.enabled) {
	Logger = loggerFactory(configHelper.config.logging, Sentry);
} else {
	Logger = loggerFactory(configHelper.config.logging);
}

export default function(name: string): LoggerInterface {
	return new Logger(name);
}
