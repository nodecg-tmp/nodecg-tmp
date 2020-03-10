'use strict';

const configHelper = require('../config/index');

let Logger;
if (configHelper.config.sentry.enabled) {
	Logger = require('./logger-server')(configHelper.config.logging, require('raven'));
} else {
	Logger = require('./logger-server')(configHelper.config.logging);
}

module.exports = function(name) {
	return new Logger(name);
};
