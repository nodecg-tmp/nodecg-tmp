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
import validator from 'is-my-json-valid';
import TypedEmitter from 'typed-emitter';

// Ours
import {
	Operation,
	proxyRecursive,
	Options,
	generateValidator,
	DEFAULT_PERSISTENCE_INTERVAL,
	Validator,
	ignoreProxy,
	resumeProxy,
	AbstractReplicant,
} from '../../shared/replicants.shared';
import replaceRefs from './schema-hacks';
import createLogger, { LoggerInterface } from '../logger';

const REPLICANTS_ROOT = path.join(process.env.NODECG_ROOT, 'db/replicants');

interface MessageEvents {
	_operationQueued: () => void;
}

/**
 * Never instantiate this directly.
 *
 * Always use Replicator.declare instead.
 * The Replicator needs to have complete control over the ServerReplicant class.
 */
export default class ServerReplicant<T> extends AbstractReplicant<T> {
	get value(): T | undefined {
		return this._value;
	}

	set value(newValue: T | undefined) {
		if (newValue === this._value) {
			this.log.replicants('value unchanged, no action will be taken');
			return;
		}

		this.validate(newValue);
		this.log.replicants('running setter with', newValue);
		const clonedNewVal = clone(newValue);
		ignoreProxy(this);
		this._value = proxyRecursive(this, newValue, '/');
		resumeProxy(this);
		this._addOperation({
			path: '/',
			method: 'overwrite',
			args: {
				newValue: clonedNewVal,
			},
		});
	}

	constructor(name: string, namespace: string, opts: Options<T> = {}) {
		super(name, namespace, opts);

		this.log = createLogger(`Replicant/${namespace}.${name}`);

		// If present, parse the schema and generate the validator function.
		if (opts.schemaPath) {
			const absoluteSchemaPath = path.isAbsolute(opts.schemaPath)
				? opts.schemaPath
				: path.join(process.env.NODECG_ROOT, opts.schemaPath);
			if (fs.existsSync(absoluteSchemaPath)) {
				try {
					const rawSchema = $RefParser.readSync(absoluteSchemaPath);
					const parsedSchema = replaceRefs(rawSchema.root, rawSchema.rootFile, rawSchema.files);
					if (!parsedSchema) {
						throw new Error('parsed schema was unexpectedly undefined');
					}

					this.schema = parsedSchema;
					this.schemaSum = sha1(JSON.stringify(parsedSchema));
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

		this._requestSaveReplicant = throttle(() => replicator.saveReplicant(this), this.opts.persistenceInterval);
	}

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
