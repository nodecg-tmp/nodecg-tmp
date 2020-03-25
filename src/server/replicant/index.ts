export { default as Replicator } from './replicator';

/**
 * Just export the type, not the actual class.
 * ONLY the Replicator is allowed to instantiate ServerReplicants.
 */
import ServerReplicant from './server-replicant';
export const Replicant = typeof ServerReplicant;
