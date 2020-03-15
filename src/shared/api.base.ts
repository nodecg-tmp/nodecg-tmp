// Ours
import { version } from '../../package.json';

type AbstractLogger = {
	name: string;
	trace: (...args: any[]) => string;
	debug: (...args: any[]) => string;
	info: (...args: any[]) => string;
	warn: (...args: any[]) => string;
	error: (...args: any[]) => string;
	replicants: (...args: any[]) => string;
};

type GitInfo = {
	branch: string;
	hash: string;
	shortHash: string;
	date: Date;
	message: string;
};

type MessageHandler = {
	messageName: string;
	bundleName: string;
	func: (data: unknown) => void;
};

const apiContexts = new Set<NodeCGAPIBase>();

export abstract class NodeCGAPIBase {
	static version = version;

	/**
	 * An object containing references to all Replicants that have been declared in this `window`, sorted by bundle.
	 * E.g., `NodeCG.declaredReplicants.myBundle.myRep`
	 */
	static declaredReplicants = Replicant.declaredReplicants;

	/**
	 * The name of the bundle which this NodeCG API instance is for.
	 */
	readonly bundleName: string;

	/**
	 * An object containing the parsed content of `cfg/<bundle-name>.json`, the contents of which
	 * are read once when NodeCG starts up. Used to quickly access per-bundle configuration properties.
	 */
	readonly bundleConfig: Readonly<{ [k: string]: any }>; // TODO: type this better

	/**
	 * The version (from package.json) of the bundle which this NodeCG API instance is for.
	 * @name NodeCG#bundleVersion
	 */
	readonly bundleVersion: string;

	/**
	 * Provides information about the current git status of this bundle, if found.
	 */
	readonly bundleGit: Readonly<GitInfo>;

	/**
	 * Provides easy access to the Logger class.
	 * Useful in cases where you want to create your own custom logger.
	 */
	abstract get Logger(): {
		new (): AbstractLogger;
	};

	/**
	 * An instance of NodeCG's Logger, with the following methods. The logging level is set in `cfg/nodecg.json`,
	 * NodeCG's global config file.
	 * ```
	 * nodecg.log.trace('trace level logging');
	 * nodecg.log.debug('debug level logging');
	 * nodecg.log.info('info level logging');
	 * nodecg.log.warn('warn level logging');
	 * nodecg.log.error('error level logging');
	 * ```
	 */
	abstract get log(): AbstractLogger;

	/**
	 * A filtered copy of the NodeCG server config with some sensitive keys removed.
	 */
	abstract get config(): Readonly<{ [k: string]: any }>; // TODO: type this better

	protected _messageHandlers: MessageHandler[] = [];

	constructor(bundle) {
		this.bundleName = bundle.name;
		this.bundleConfig = bundle.config;
		this.bundleVersion = bundle.version;
		this.bundleGit = bundle.git;
		apiContexts.add(this);
	}

	static sendMessageToBundle(messageName: string, bundleName: string, data: unknown) {
		// This is what enables intra-context messaging.
		// I.e., passing messages from one extension to another in the same Node.js context.
		process.nextTick(() => {
			apiContexts.forEach(ctx => {
				ctx._messageHandlers.forEach(handler => {
					if (messageName === handler.messageName && bundleName === handler.bundleName) {
						handler.func(data);
					}
				});
			});
		});
	}

	static Replicant(name: string, namespace: string, opts) {
		return new Replicant(name, namespace, opts, process.browser ? window.socket : null);
	}

	static readReplicant(name: string, namespace: string) {
		if (!name || typeof name !== 'string') {
			throw new Error('Must supply a name when reading a Replicant');
		}

		if (!namespace || typeof namespace !== 'string') {
			throw new Error('Must supply a namespace when reading a Replicant');
		}
	}

	/**
	 * Lets you easily wait for a group of Replicants to finish declaring.
	 *
	 * Returns a promise which is resolved once all provided Replicants
	 * have emitted a `change` event, which is indicates that they must
	 * have finished declaring.
	 *
	 * This method is only useful in client-side code.
	 * Server-side code never has to wait for Replicants.
	 *
	 * @param replicants {Replicant}
	 * @returns {Promise<any>}
	 *
	 * @example <caption>From a graphic or dashboard panel:</caption>
	 * const rep1 = nodecg.Replicant('rep1');
	 * const rep2 = nodecg.Replicant('rep2');
	 *
	 * // You can provide as many Replicant arguments as you want,
	 * // this example just uses two Replicants.
	 * NodeCG.waitForReplicants(rep1, rep2).then(() => {
	 *     console.log('rep1 and rep2 are fully declared and ready to use!');
	 * });
	 */
	static waitForReplicants(...replicants: Replicant[]): Promise<void> {
		return new Promise(resolve => {
			const numReplicants = replicants.length;
			let declaredReplicants = 0;
			replicants.forEach(replicant => {
				replicant.once('change', () => {
					declaredReplicants++;
					if (declaredReplicants >= numReplicants) {
						resolve();
					}
				});
			});
		});
	}

	/**
	 * Sends a message with optional data within the current bundle.
	 * Messages can be sent from client to server, server to client, or client to client.
	 *
	 * Messages are namespaced by bundle. To send a message in another bundle's namespace,
	 * use {@link NodeCG#sendMessageToBundle}.
	 *
	 * When a `sendMessage` is used from a client context (i.e., graphic or dashboard panel),
	 * it returns a `Promise` called an "acknowledgement". Your server-side code (i.e., extension)
	 * can invoke this acknowledgement with whatever data (or error) it wants. Errors sent to acknowledgements
	 * from the server will be properly serialized and intact when received on the client.
	 *
	 * Alternatively, if you do not wish to use a `Promise`, you can provide a standard error-first
	 * callback as the last argument to `sendMessage`.
	 *
	 * If your server-side code has multiple listenFor handlers for your message,
	 * you must first check if the acknowledgement has already been handled before
	 * attempting to call it. You may so do by checking the `.handled` boolean
	 * property of the `ack` function passed to your listenFor handler.
	 *
	 * See [Socket.IO's docs](http://socket.io/docs/#sending-and-getting-data-%28acknowledgements%29)
	 * for more information on how acknowledgements work under the hood.
	 *
	 * @param {string} messageName - The name of the message.
	 * @param {mixed} [data] - The data to send.
	 * @param {function} [cb] - _Browser only_ The error-first callback to handle the server's
	 * [acknowledgement](http://socket.io/docs/#sending-and-getting-data-%28acknowledgements%29) message, if any.
	 * @return {Promise} - _Browser only_ A Promise that is rejected if the first argument provided to the
	 * acknowledgement is an `Error`, otherwise it is resolved with the remaining arguments provided to the acknowledgement.
	 *
	 * @example <caption>Sending a normal message:</caption>
	 * nodecg.sendMessage('printMessage', 'dope.');
	 *
	 * @example <caption>Sending a message and replying with an acknowledgement:</caption>
	 * // bundles/my-bundle/extension.js
	 * module.exports = function (nodecg) {
	 *     nodecg.listenFor('multiplyByTwo', (value, ack) => {
	 *         if (value === 4) {
	 *             ack(new Error('I don\'t like multiplying the number 4!');
	 *             return;
	 *         }
	 *
	 *         // acknowledgements should always be error-first callbacks.
	 *         // If you do not wish to send an error, use a falsey value
	 *         // like "null" instead.
	 *         if (ack && !ack.handled) {
	 *             ack(null, value * 2);
	 *         }
	 *     });
	 * }
	 *
	 * // bundles/my-bundle/graphics/script.js
	 * // Both of these examples are functionally identical.
	 *
	 * // Promise acknowledgement
	 * nodecg.sendMessage('multiplyByTwo', 2)
	 *     .then(result => {
	 *         console.log(result); // Will eventually print '4'
	 *     .catch(error => {
	 *         console.error(error);
	 *     });
	 *
	 * // Error-first callback acknowledgement
	 * nodecg.sendMessage('multiplyByTwo', 2, (error, result) => {
	 *     if (error) {
	 *         console.error(error);
	 *         return;
	 *     }
	 *
	 *     console.log(result); // Will eventually print '4'
	 * });
	 */
	sendMessage(messageName: string, data: unknown, cb) {
		if (typeof cb === 'undefined' && typeof data === 'function') {
			cb = data;
			data = null;
		}

		return this.sendMessageToBundle(messageName, this.bundleName, data, cb);
	}

	/* eslint-disable no-unused-vars */
	/**
	 * Sends a message to a specific bundle. Also available as a static method.
	 * See {@link NodeCG#sendMessage} for usage details.
	 * @param {string} messageName - The name of the message.
	 * @param {string} bundleName - The name of the target bundle.
	 * @param {mixed} [data] - The data to send.
	 * @param {function} [cb] - _Browser only_ The error-first callback to handle the server's
	 * [acknowledgement](http://socket.io/docs/#sending-and-getting-data-%28acknowledgements%29) message, if any.
	 * @return {Promise|undefined} - _Browser only_ A Promise that is rejected if the first argument provided to the
	 * acknowledgement is an `Error`, otherwise it is resolved with the remaining arguments provided to the acknowledgement.
	 * But, if a callback was provided, this return value will be `undefined`, and there will be no Promise.
	 */
	sendMessageToBundle(messageName: string, bundleName: string, data: unknown, cb) {
		this.log.trace('Sending message %s to bundle %s with data:', messageName, bundleName, data);
		return NodeCGAPIBase.sendMessageToBundle.apply(NodeCGAPIBase, arguments);
	}
	/* eslint-enable no-unused-vars */

	/**
	 * Listens for a message, and invokes the provided callback each time the message is received.
	 * If any data was sent with the message, it will be passed to the callback.
	 *
	 * Messages are namespaced by bundle.
	 * To listen to a message in another bundle's namespace, provide it as the second argument.
	 *
	 * You may define multiple listenFor handlers for a given message.
	 * They will be called in the order they were registered.
	 *
	 * @param {string} messageName - The name of the message.
	 * @param {string} [bundleName=CURR_BNDL] - The bundle namespace to in which to listen for this message
	 * @param {function} handlerFunc - The callback fired when this message is received.
	 *
	 * @example
	 * nodecg.listenFor('printMessage', message => {
	 *     console.log(message);
	 * });
	 *
	 * @example <caption>Listening to a message in another bundle's namespace:</caption>
	 * nodecg.listenFor('printMessage', 'another-bundle', message => {
	 *     console.log(message);
	 * });
	 */
	listenFor(messageName: string, bundleName: string, handlerFunc) {
		if (typeof handlerFunc === 'undefined') {
			handlerFunc = bundleName;
			bundleName = this.bundleName;
		}

		if (typeof handlerFunc !== 'function') {
			throw new Error(`argument "handler" must be a function, but you provided a(n) ${typeof handlerFunc}`);
		}

		this.log.trace('Listening for %s from bundle %s', messageName, bundleName);
		this._messageHandlers.push({
			messageName,
			bundleName,
			func: handlerFunc,
		});
	}

	/**
	 * Removes a listener for a message.
	 *
	 * Messages are namespaced by bundle.
	 * To remove a listener to a message in another bundle's namespace, provide it as the second argument.
	 *
	 * @param {string} messageName - The name of the message.
	 * @param {string} [bundleName=CURR_BNDL] - The bundle namespace to in which to listen for this message
	 * @param {function} handlerFunc - A reference to a handler function added as a listener to this message via {@link NodeCG#listenFor}.
	 * @returns {boolean}
	 *
	 * @example
	 * nodecg.unlisten('printMessage', someFunctionName);
	 *
	 * @example <caption>Removing a listener from a message in another bundle's namespace:</caption>
	 * nodecg.unlisten('printMessage', 'another-bundle', someFunctionName);
	 */
	unlisten(messageName, bundleName, handlerFunc) {
		if (typeof handlerFunc === 'undefined') {
			handlerFunc = bundleName;
			bundleName = this.bundleName;
		}

		if (typeof handlerFunc !== 'function') {
			throw new Error(`argument "handler" must be a function, but you provided a(n) ${typeof handlerFunc}`);
		}

		this.log.trace('[%s] Removing listener for %s from bundle %s', this.bundleName, messageName, bundleName);

		// Find the index of this handler in the array.
		const index = this._messageHandlers.findIndex(handler => {
			return (
				handler.messageName === messageName && handler.bundleName === bundleName && handler.func === handlerFunc
			);
		});

		// If the handler exists, remove it and return true.
		if (index >= 0) {
			this._messageHandlers.splice(index, 1);
			return true;
		}

		// Else, return false.
		return false;
	}

	/**
	 * Replicants are objects which monitor changes to a variable's value.
	 * The changes are replicated across all extensions, graphics, and dashboard panels.
	 * When a Replicant changes in one of those places it is quickly updated in the rest,
	 * and a `change` event is emitted allowing bundles to react to the changes in the data.
	 *
	 * If a Replicant with a given name in a given bundle namespace has already been declared,
	 * the Replicant will automatically be assigned the existing value.
	 *
	 * Replicants must be declared in each context that wishes to use them. For instance,
	 * declaring a replicant in an extension does not automatically make it available in a graphic.
	 * The graphic must also declare it.
	 *
	 * By default Replicants will be saved to disk, meaning they will automatically be restored when NodeCG is restarted,
	 * such as after an unexpected crash.
	 * If you need to opt-out of this behaviour simply set `persistent: false` in the `opts` argument.
	 *
	 * As of NodeCG 0.8.4, Replicants can also be automatically validated against a JSON Schema that you provide.
	 * See {@tutorial replicant-schemas} for more information.
	 *
	 * @param {string} name - The name of the replicant.
	 * @param {string} [namespace] - The namespace to in which to look for this replicant. Defaults to the name of the current bundle.
	 * @param {object} [opts] - The options for this replicant.
	 * @param {*} [opts.defaultValue] - The default value to instantiate this Replicant with. The default value is only
	 * applied if this Replicant has not previously been declared and if it has no persisted value.
	 * @param {boolean} [opts.persistent=true] - Whether to persist the Replicant's value to disk on every change.
	 * Persisted values are re-loaded on startup.
	 * @param {number} [opts.persistenceInterval=DEFAULT_PERSISTENCE_INTERVAL] - Interval between each persistence, in milliseconds.
	 * @param {string} [opts.schemaPath] - The filepath at which to look for a JSON Schema for this Replicant.
	 * Defaults to `nodecg/bundles/${bundleName}/schemas/${replicantName}.json`. Please note that this default
	 * path will be URIEncoded to ensure that it results in a valid filename.
	 *
	 * @example
	 * const myRep = nodecg.Replicant('myRep', {defaultValue: 123});
	 *
	 * myRep.on('change', (newValue, oldValue) => {
	 *     console.log(`myRep changed from ${oldValue} to ${newValue}`);
	 * });
	 *
	 * myRep.value = 'Hello!';
	 * myRep.value = {objects: 'work too!'};
	 * myRep.value = {objects: {can: {be: 'nested!'}}};
	 * myRep.value = ['Even', 'arrays', 'work!'];
	 */
	Replicant(name: string, namespace: string, opts) {
		if (!namespace || typeof namespace !== 'string') {
			opts = namespace;
			namespace = this.bundleName;
		}

		if (typeof opts !== 'object') {
			opts = {};
		}

		if (typeof opts.schemaPath === 'undefined') {
			opts.schemaPath = `bundles/${encodeURIComponent(namespace)}/schemas/${encodeURIComponent(name)}.json`;
		}

		return new NodeCGAPIBase.Replicant(name, namespace, opts);
	}

	/**
	 * Reads the value of a replicant once, and doesn't create a subscription to it. Also available as a static method.
	 * @param {string} name - The name of the replicant.
	 * @param {string} [bundle=CURR_BNDL] - The bundle namespace to in which to look for this replicant.
	 * @param {function} cb - _Browser only_ The callback that handles the server's response which contains the value.
	 * @example <caption>From an extension:</caption>
	 * // Extensions have immediate access to the database of Replicants.
	 * // For this reason, they can use readReplicant synchronously, without a callback.
	 * module.exports = function (nodecg) {
	 *     var myVal = nodecg.readReplicant('myVar', 'some-bundle');
	 * }
	 * @example <caption>From a graphic or dashboard panel:</caption>
	 * // Graphics and dashboard panels must query the server to retrieve the value,
	 * // and therefore must provide a callback.
	 * nodecg.readReplicant('myRep', 'some-bundle', value => {
	 *     // I can use 'value' now!
	 *     console.log('myRep has the value '+ value +'!');
	 * });
	 */
	readReplicant(name, bundle, cb) {
		if (!bundle || typeof bundle !== 'string') {
			cb = bundle;
			bundle = this.bundleName;
		}

		return NodeCG.readReplicant(name, bundle, cb);
	}
}
