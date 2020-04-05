// Packages
import SocketIO from 'socket.io';

// Ours
import { getConnection, ApiKey } from '../database';
import { isSuperUser } from '../database/utils';
import { config } from '../config';
import UnauthorizedError, { Code as UnauthErrCode } from '../login/UnauthorizedError';
import { TypedServerSocket } from '../../types/socket-protocol';

const socketsByKey = new Map<string, Set<TypedServerSocket>>();

export default async function(socket: TypedServerSocket, next: SocketIO.NextFunction): Promise<void> {
	try {
		const req = (socket as any).request; // Not typed in the typed-socket.io lib for some reason.
		const token = req.token;
		const database = await getConnection();
		const apiKey = await database
			.getRepository(ApiKey)
			.createQueryBuilder('apiKey')
			.where('apiKey.secret_key = :key', {
				key: token,
			})
			.getOne();

		if (!apiKey) {
			return next(null, false);
		}

		const user = apiKey.user;
		if (!user) {
			return next(null, false);
		}

		// But only authed sockets can join the Authed room.
		const provider = user.identities[0]?.provider_type;
		const providerAllowed = config.login && config.login[provider]?.enabled;
		const allowed = isSuperUser(user) && providerAllowed;

		if (allowed) {
			if (!socketsByKey.has(token)) {
				socketsByKey.set(token, new Set<TypedServerSocket>());
			}

			const socketSet = socketsByKey.get(token);
			/* istanbul ignore next: should be impossible */
			if (!socketSet) {
				throw new Error('socketSet was somehow falsey');
			}

			socketSet.add(socket);

			socket.on('regenerateToken', async (_, cb) => {
				try {
					// Lookup the ApiKey for this token we want to revoke.
					const keyToDelete = await database
						.getRepository(ApiKey)
						.createQueryBuilder('apiKey')
						.where('apiKey.secret_key = :key', {
							key: token,
						})
						.getOne();

					// If there's a User associated to this key (there should be)
					// give them a new ApiKey
					if (keyToDelete) {
						// Make the new api key
						const newApiKey = database.manager.create(ApiKey);
						await database.manager.save(newApiKey);

						// Remove the old key from the user, replace it with the new
						const user = keyToDelete.user;
						user.apiKeys = user.apiKeys.filter(ak => {
							return ak.secret_key !== token;
						});
						user.apiKeys.push(newApiKey);
						await database.manager.save(user);

						// Delete the old key entirely
						await database.manager.delete(ApiKey, { secret_key: token });

						if (cb) {
							cb(null);
						}
					} else {
						// Something is weird if we're here, just close the socket.
						if (cb) {
							cb(null);
						}

						socket.disconnect(true);
					}

					// Close all sockets that are using the invalidated key,
					// EXCEPT the one that requested the revocation.
					// If we close the one that requested the revocation,
					// there will be a race condition where it might get redirected
					// to an error page before it receives the new key.
					for (const s of socketSet) {
						if (s === socket) {
							continue;
						}

						s.emit(
							'error',
							new UnauthorizedError(UnauthErrCode.TokenRevoked, 'This token has been invalidated')
								.serialized,
						);
						s.disconnect(true);
					}

					socketsByKey.delete(token);
				} catch (error) {
					if (cb) {
						cb(error);
					}
				}
			});
		}

		return next(null, allowed);
	} catch (error) {
		next(error);
	}
}
