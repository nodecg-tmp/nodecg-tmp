// Native
import * as path from 'path';

// Packages
import * as fs from 'fs-extra';
import clone from 'clone';
import * as SocketIO from 'socket.io';

// Ours
import createLogger from '../logger';
import * as shared from '../../shared/replicants.shared';
import Replicant from './server-replicant';
import { noop } from '../util';

const log = createLogger('replicator');

export default class Replicator {
	readonly replicantsRoot = path.join(process.env.NODECG_ROOT, 'db/replicants');

	readonly io: SocketIO.Server;

	readonly declaredReplicants = new Map<string, Map<string, Replicant<any>>>();

	private readonly _stores = new Map<string, Map<string, Replicant<any>>>();

	private readonly _pendingSave = new WeakSet<Replicant<any>>();

	constructor(io: SocketIO.Server) {
		// Make 'db/replicants' folder if it doesn't exist
		if (!fs.existsSync(this.replicantsRoot)) {
			fs.mkdirpSync(this.replicantsRoot);
		}

		this.io = io;
		io.sockets.on('connection', socket => {
			this.attachToSocket(socket);
		});
	}

	attachToSocket(socket: SocketIO.Socket): void {
		socket.on('replicant:declare', (data, cb) => {
			log.replicants('received replicant:declare', data);
			try {
				const replicant = this.declare(data.name, data.namespace, data.opts);
				if (typeof cb === 'function') {
					cb({
						value: replicant.value,
						revision: replicant.revision,
						schema: replicant.schema,
						schemaSum: replicant.schemaSum,
					});
				}
			} catch (e) {
				if (e.message.startsWith('Invalid value rejected for replicant')) {
					if (typeof cb === 'function') {
						cb({
							rejectReason: e.message,
						});
					}
				} else {
					throw e;
				}
			}
		});

		socket.on('replicant:proposeOperations', (data, cb = noop) => {
			log.replicants('received replicant:proposeOperations', data);
			const serverReplicant = this.declare(data.name, data.namespace, data.opts);
			if (serverReplicant.schema && data.schemaSum !== serverReplicant.schemaSum) {
				log.replicants(
					'Change request %s:%s had mismatched schema sum (ours %s, theirs %s), invoking callback with new schema and fullupdate',
					data.namespace,
					data.name,
					serverReplicant.schemaSum,
					data.schemaSum,
				);
				cb({
					rejectReason: 'Mismatched schema version, assignment rejected',
					schema: serverReplicant.schema,
					schemaSum: serverReplicant.schemaSum,
					value: serverReplicant.value,
					revision: serverReplicant.revision,
				});
			} else if (serverReplicant.revision !== data.revision) {
				log.replicants(
					'Change request %s:%s had mismatched revision (ours %s, theirs %s), invoking callback with fullupdate',
					data.namespace,
					data.name,
					serverReplicant.revision,
					data.revision,
				);
				cb({
					rejectReason: 'Mismatched revision number, assignment rejected',
					value: serverReplicant.value,
					revision: serverReplicant.revision,
				});
			}

			this.applyOperations(serverReplicant, data.operations);
		});

		socket.on('replicant:read', (data, cb) => {
			log.replicants('replicant:read', data);
			const replicant = this.declare(data.name, data.namespace);
			if (typeof cb === 'function') {
				if (replicant) {
					cb(replicant.value);
				} else {
					cb();
				}
			}
		});
	}

	/**
	 * Declares a Replicant.
	 * @param {string} name - The name of the Replicant to declare.
	 * @param {string} namespace - The namespace to which this Replicant belongs.
	 * @param {object} [opts] - The options for this replicant.
	 * @param {*} [opts.defaultValue] - The default value to instantiate this Replicant with. The default value is only
	 * applied if this Replicant has not previously been declared and if it has no persisted value.
	 * @param {boolean} [opts.persistent=true] - Whether to persist the Replicant's value to disk on every change.
	 * Persisted values are re-loaded on startup.
	 * @param {string} [opts.schemaPath] - The filepath at which to look for a JSON Schema for this Replicant.
	 * Defaults to `nodecg/bundles/${bundleName}/schemas/${replicantName}.json`.
	 * @returns {object}
	 */
	declare<T>(name: string, namespace: string, opts?: shared.Options<T>): Replicant<T> {
		// If replicant already exists, return that.
		const nsp = this.declaredReplicants.get(namespace);
		if (nsp) {
			const existing = nsp.get(name);
			if (existing) {
				existing.log.replicants('Existing replicant found, returning that instead of creating a new one.');
				return existing;
			}
		} else {
			this.declaredReplicants.set(namespace, new Map());
		}

		const rep = new Replicant(name, namespace, opts);
		this.declaredReplicants.get(namespace)!.set(name, rep);
		return rep;
	}

	/**
	 * Applies an array of operations to a replicant.
	 * @param replicant {object} - The Replicant to perform these operation on.
	 * @param operations {array} - An array of operations.
	 */
	applyOperations<T>(replicant: Replicant<T>, operations: Array<shared.Operation<T>>): void {
		const oldValue = clone(replicant.value);
		operations.forEach(operation => shared.applyOperation(replicant, operation));
		replicant.revision++;
		replicant.emit('change', replicant.value, oldValue, operations);

		this.emitToClients(replicant.namespace, 'replicant:operations', {
			name: replicant.name,
			namespace: replicant.namespace,
			revision: replicant.revision,
			operations,
		});

		this.saveReplicant(replicant);
	}

	/**
	 * Emits an event to all remote Socket.IO listeners.
	 * @param namespace - The namespace in which to emit this event. Only applies to Socket.IO listeners.
	 * @param eventName - The name of the event to emit.
	 * @param data - The data to emit with the event.
	 */
	emitToClients(namespace: string, eventName: string, data: unknown): void {
		// Emit to clients (in the given namespace's room) using Socket.IO
		log.replicants('emitting %s to %s:', eventName, namespace, data);
		this.io.to(`replicant:${namespace}`).emit(eventName, data);
	}

	/**
	 * Persists a Replicant to disk. Does nothing if that Replicant has `persistent: false`.
	 * Delays saving until the end of the current task, and de-dupes save commands run multiple times
	 * during the same task.
	 * @param replicant {object} - The Replicant to save.
	 */
	saveReplicant(replicant: Replicant<any>): void {
		if (!replicant.opts.persistent) {
			return;
		}

		if (this._pendingSave.has(replicant)) {
			return;
		}

		this._pendingSave.add(replicant);
		replicant.log.replicants('Will persist value at end of current tick.');

		process.nextTick(() => {
			this._pendingSave.delete(replicant);

			if (!replicant.opts.persistent) {
				return;
			}

			let value = JSON.stringify(replicant.value);

			if (typeof value === 'undefined') {
				value = '';
			}

			try {
				stores[replicant.namespace].setItem(`${replicant.name}.rep`, value);
				replicant.log.replicants('Value successfully persisted.');
			} catch (error) {
				if (error.name !== 'QUOTA_EXCEEDED_ERR') {
					return replicant._requestSaveReplicant();
				}

				replicant.log.error('Failed to persist value:', error);
			}
		});
	}

	saveAllReplicants(): void {
		for (const replicants of Object.values(declaredReplicants)) {
			for (const replicant of Object.values(replicants)) {
				this.saveReplicant(replicant);
			}
		}
	}
}
