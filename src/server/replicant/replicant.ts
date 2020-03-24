// Native
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// Packages
import throttle from 'lodash.throttle';
import $RefParser from 'json-schema-lib';
import clone from 'clone';
import { LocalStorage } from 'node-localstorage';
import schemaDefaults from 'json-schema-defaults';
import sha1 from 'sha1';

// Ours
import {
	Operation,
	proxyRecursive,
	Options,
	generateValidator,
	DEFAULT_PERSISTENCE_INTERVAL,
	Validator,
} from './shared';
import replaceRefs from './schema-hacks';
import { LoggerInterface } from '../logger';

const REPLICANTS_ROOT = path.join(process.env.NODECG_ROOT, 'db/replicants');

export default class Replicant<T> extends EventEmitter {
	name: string;

	namespace: string;

	opts: Options<T>;

	revision: number;

	log: LoggerInterface;

	schema?: { [k: string]: any };

	schemaSum?: string;

	private __value: T | undefined;

	private _oldValue: T | undefined;

	private _ignoreProxy: boolean;

	private _operationQueue: Array<Operation<T>>;

	private _pendingOperationFlush: boolean;

	get value(): T | undefined {
		return this.__value;
	}

	set value(newValue: T | undefined) {
		if (newValue === this.__value) {
			this.log.replicants('value unchanged, no action will be taken');
			return;
		}

		this.validate(newValue);
		this.log.replicants('running setter with', newValue);
		const clonedNewVal = clone(newValue);
		this._ignoreProxy = true;
		this.__value = proxyRecursive(this, newValue, '/');
		this._ignoreProxy = false;
		this._addOperation({
			path: '/',
			method: 'overwrite',
			args: {
				newValue: clonedNewVal,
			},
		});
	}

	// eslint-disable-next-line complexity
	constructor(name: string, namespace: string, opts: Options<T> = {}) {
		super();

		if (!name || typeof name !== 'string') {
			throw new Error('Must supply a name when instantiating a Replicant');
		}

		if (!namespace || typeof namespace !== 'string') {
			throw new Error('Must supply a namespace when instantiating a Replicant');
		}

		// If replicant already exists, return that.
		if ({}.hasOwnProperty.call(replicator.declaredReplicants, namespace)) {
			if ({}.hasOwnProperty.call(replicator.declaredReplicants[namespace], name)) {
				const existing = replicator.declaredReplicants[namespace][name];
				existing.log.replicants('Existing replicant found, returning that instead of creating a new one.');
				return existing; // eslint-disable-line no-constructor-return
			}
		} else {
			replicator.declaredReplicants[namespace] = {};
		}

		// Load logger
		this.log = require('../logger')(`Replicant/${namespace}.${name}`);

		if (typeof opts.persistent === 'undefined') {
			opts.persistent = true;
		}

		if (typeof opts.persistenceInterval === 'undefined') {
			opts.persistenceInterval = DEFAULT_PERSISTENCE_INTERVAL;
		}

		this.name = name;
		this.namespace = namespace;
		this.opts = opts;
		this.revision = 0;

		replicator.declaredReplicants[namespace][name] = this;

		this._operationQueue = [];

		// If present, parse the schema and generate the validator function.
		if (opts.schemaPath) {
			const absoluteSchemaPath = path.isAbsolute(opts.schemaPath)
				? opts.schemaPath
				: path.join(process.env.NODECG_ROOT, opts.schemaPath);
			if (fs.existsSync(absoluteSchemaPath)) {
				try {
					const schema = $RefParser.readSync(absoluteSchemaPath);
					this.schema = replaceRefs(schema.root, schema.rootFile, schema.files);
					this.schemaSum = sha1(this.schema);
					this.validate = generateValidator(this);
				} catch (e) {
					/* istanbul ignore next */
					if (!process.env.NODECG_TEST) {
						this.log.error('Schema could not be loaded, are you sure that it is valid JSON?\n', e.stack);
					}
				}
			}
		}

		// Initialize the storage object if not present
		if (!{}.hasOwnProperty.call(replicator.stores, namespace)) {
			replicator.stores[namespace] = new LocalStorage(path.join(REPLICANTS_ROOT, namespace));
		}

		// Get the existing value, if any, and JSON parse if its an object
		let existingValue = replicator.stores[namespace].getItem(`${name}.rep`);
		try {
			existingValue = existingValue === '' ? undefined : JSON.parse(existingValue);
		} catch (_) {}

		// Set the default value, if a schema is present and no default value was provided.
		if (this.schema && typeof opts.defaultValue === 'undefined') {
			opts.defaultValue = schemaDefaults(this.schema);
		}

		// If `opts.persistent` is true and this replicant has a persisted value, try to load that persisted value.
		// Else, apply `opts.defaultValue`.
		if (opts.persistent && typeof existingValue !== 'undefined' && existingValue !== null) {
			if (this.validate(existingValue, { throwOnInvalid: false })) {
				this.value = existingValue;
				this.log.replicants('Loaded a persisted value from localStorage:', existingValue);
			} else {
				this.value = schemaDefaults(this.schema);
				this.log.replicants(
					'Discarded persisted value, as it failed schema validation. Replaced with defaults from schema.',
				);
			}
		} else {
			if (this.schema) {
				if (typeof opts.defaultValue !== 'undefined') {
					this.validate(opts.defaultValue);
				}
			}

			this.value = clone(opts.defaultValue);
			this.log.replicants(
				'Declared "%s" in namespace "%s" with defaultValue:\n',
				name,
				namespace,
				opts.defaultValue,
			);
			replicator.saveReplicant(this);
		}

		// Prevents one-time change listeners from potentially being called twice.
		// https://github.com/nodecg/nodecg/issues/296
		const originalOnce = this.once.bind(this);
		this.once = (event, listener) => {
			if (event === 'change' && replicator.declaredReplicants[namespace][name]) {
				return listener(this.value);
			}

			return originalOnce(event, listener);
		};

		/* When a new "change" listener is added, chances are that the developer wants it to be initialized ASAP.
		 * However, if this replicant has already been declared previously in this context, their "change"
		 * handler will *not* get run until another change comes in, which may never happen for Replicants
		 * that change very infrequently.
		 * To resolve this, we immediately invoke all new "change" handlers if appropriate.
		 */
		this.on('newListener', (event, listener) => {
			if (event === 'change' && replicator.declaredReplicants[namespace][name]) {
				listener(this.value);
			}
		});

		this._requestSaveReplicant = throttle(() => replicator.saveReplicant(this), this.opts.persistenceInterval);
	}

	/**
	 * Used to validate the new value of a replicant.
	 *
	 * This is a stub that will be replaced if a Schema is available.
	 */
	validate: Validator = (_: any, __: any): boolean => {
		return true;
	};

	/**
	 * Adds an operation to the operation queue, to be flushed at the end of the current tick.
	 * @param path {string} - The object path to where this operation took place.
	 * @param method {string} - The name of the operation.
	 * @param args {array} - The arguments provided to this operation
	 * @private
	 */
	private _addOperation(operation: Operation<T>): void {
		this._operationQueue.push(operation);
		if (!this._pendingOperationFlush) {
			this._oldValue = clone(this.value);
			this._pendingOperationFlush = true;
			process.nextTick(() => this._flushOperations());
		}
	}

	/**
	 * Emits all queued operations via Socket.IO & empties this._operationQueue.
	 * @private
	 */
	private _flushOperations(): void {
		this._pendingOperationFlush = false;
		this.revision++;
		replicator.emitToClients(this.namespace, 'replicant:operations', {
			name: this.name,
			namespace: this.namespace,
			operations: this._operationQueue,
			revision: this.revision,
		});
		this._requestSaveReplicant();
		this.emit('change', this.value, this._oldValue, this._operationQueue);
		this._operationQueue = [];
	}
}
