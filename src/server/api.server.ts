// Ours
import { NodeCGAPIBase } from '../shared/api.base';

const express = require('express');
const server = require('./server');
const utils = require('./util');
const replicator = require('./replicator');
const isError = require('is-error');
const serializeError = require('serialize-error');
const Logger = require('./logger');
const { filteredConfig } = require('./config');

let io: SocketIO.Server;

export default class NodeCGAPIServer extends NodeCGAPIBase {
	get Logger() {
		return Logger;
	}

	get log() {
		if (this._memoizedLogger) {
			return this._memoizedLogger;
		}

		this._memoizedLogger = new Logger(bundle.name);
		return this._memoizedLogger;
	}

	get config() {
		return JSON.parse(JSON.stringify(filteredConfig));
	}

	private _memoizedLogger?: Logger;

	constructor(bundle) {
		super(bundle);

		io = server.getIO();
		io.on('connection', socket => {
			socket.setMaxListeners(64); // Prevent console warnings when many extensions are installed
			socket.on('message', (data, ack) => {
				this.log.trace(
					'Received message %s (sent to bundle %s) with data:',
					data.messageName,
					data.bundleName,
					data.content,
				);

				const wrappedAck = _wrapAcknowledgement(ack);
				this._messageHandlers.forEach(handler => {
					if (data.messageName === handler.messageName && data.bundleName === handler.bundleName) {
						handler.func(data.content, wrappedAck);
					}
				});
			});
		});
	}

	static sendMessageToBundle(messageName: string, bundleName: string, data) {
		NodeCGAPIBase.sendMessageToBundle(messageName, bundleName, data);
		io.emit('message', {
			bundleName,
			messageName,
			content: data,
		});
	}

	static readReplicant(name: string, namespace: string) {
		NodeCGAPIBase.readReplicant(name, namespace);
		const replicant = replicator.find(name, namespace);
		if (replicant) {
			return replicant.value;
		}
	}

	/**
	 * _Extension only_<br/>
	 * Gets the server Socket.IO context.
	 * @function
	 */
	readonly getSocketIOServer = server.getIO;

	/**
	 * _Extension only_<br/>
	 * Mounts express middleware to the main server express app.
	 * See the [express docs](http://expressjs.com/en/api.html#app.use) for usage.
	 * @function
	 */
	readonly mount = server.mount;

	/**
	 * _Extension only_<br/>
	 * Creates a new express router.
	 * See the [express docs](http://expressjs.com/en/api.html#express.router) for usage.
	 * @function
	 */
	readonly Router = express.Router;

	util = {
		/**
		 * _Extension only_<br/>
		 * Checks if a session is authorized. Intended to be used in express routes.
		 * @param {object} req - A HTTP request.
		 * @param {object} res - A HTTP response.
		 * @param {function} next - The next middleware in the control flow.
		 */
		authCheck: utils.authCheck,
	};

	/**
	 * _Extension only_<br/>
	 * Object containing references to all other loaded extensions. To access another bundle's extension,
	 * it _must_ be declared as a `bundleDependency` in your bundle's [`package.json`]{@tutorial manifest}.
	 * @name NodeCG#extensions
	 *
	 * @example
	 * // bundles/my-bundle/package.json
	 * {
	 *     "name": "my-bundle"
	 *     ...
	 *     "bundleDependencies": {
	 *         "other-bundle": "^1.0.0"
	 *     }
	 * }
	 *
	 * // bundles/my-bundle/extension.js
	 * module.exports = function (nodecg) {
	 *     const otherBundle = nodecg.extensions['other-bundle'];
	 *     // Now I can use `otherBundle`!
	 * }
	 */
	get extensions() {
		return server.getExtensions();
	}
}

/**
 * By default, Errors get serialized to empty objects when run through JSON.stringify.
 * This function wraps an "acknowledgement" callback and checks if the first argument
 * is an Error. If it is, that Error is serialized _before_ being sent off to Socket.IO
 * for serialization to be sent across the wire.
 * @param ack {Function}
 * @private
 * @ignore
 * @returns {Function}
 */
function _wrapAcknowledgement(ack) {
	let handled = false;
	const wrappedAck = function(firstArg, ...restArgs) {
		if (handled) {
			throw new Error('Acknowledgement already handled');
		}

		handled = true;

		if (isError(firstArg)) {
			firstArg = serializeError(firstArg);
		}

		ack(firstArg, ...restArgs);
	};

	Object.defineProperty(wrappedAck, 'handled', {
		get() {
			return handled;
		},
	});

	return wrappedAck;
}
