// Ours
import { noop } from '../util';

type Options = {
	timeout: number;
	postAuthenticate: (socket: SocketIO.Socket, data: any) => void;
	disconnect: (socket: SocketIO.Socket) => void;
};

/**
 * Adds connection listeners to the given socket.io server, so clients
 * are forced to authenticate before they can receive events.
 *
 * @param {Object} io - the socket.io server socket
 *
 * @param {Object} config - configuration values
 * @param {Function} config.authenticate - indicates if authentication was successfull
 * @param {Function} config.postAuthenticate=noop -  called after the client is authenticated
 * @param {Function} config.disconnect=noop -  called after the client is disconnected
 * @param {Number} [config.timeout=1000] - amount of millisenconds to wait for a client to
 * authenticate before disconnecting it. A value of 'none' means no connection timeout.
 */
export default function socketIOAuth(
	io,
	config: Options = { timout = 1000, postAuthenticate = noop, disconnect = noop },
) {
	for (const nsp of io.nsps) {
		forbidConnections(nsp);
	}

	io.on('connection', socket => {
		socket.auth = false;
		socket.on('authentication', data => {
			config.authenticate(socket, data, (err, success) => {
				if (success) {
					debug('Authenticated socket %s', socket.id);
					socket.auth = true;

					_.each(io.nsps, function(nsp) {
						restoreConnection(nsp, socket);
					});

					socket.emit('authenticated', success);
					return postAuthenticate(socket, data);
				} else if (err) {
					debug('Authentication error socket %s: %s', socket.id, err.message);
					socket.emit('unauthorized', { message: err.message }, function() {
						socket.disconnect();
					});
				} else {
					debug('Authentication failure socket %s', socket.id);
					socket.emit('unauthorized', { message: 'Authentication failure' }, function() {
						socket.disconnect();
					});
				}
			});
		});

		socket.on('disconnect', function() {
			return disconnect(socket);
		});

		if (timeout !== 'none') {
			setTimeout(function() {
				// If the socket didn't authenticate after connection, disconnect it
				if (!socket.auth) {
					debug('Disconnecting socket %s', socket.id);
					socket.disconnect('unauthorized');
				}
			}, timeout);
		}
	});
}

/**
 * Set a listener so connections from unauthenticated sockets are not
 * considered when emitting to the namespace. The connections will be
 * restored after authentication succeeds.
 */
function forbidConnections(nsp: SocketIO.Namespace): void {
	nsp.on('connect', socket => {
		if (!socket.auth) {
			debug('removing socket from %s', nsp.name);
			delete nsp.connected[socket.id];
		}
	});
}

/**
 * If the socket attempted a connection before authentication, restore it.
 */
function restoreConnection(nsp, socket): void {
	if (_.find(nsp.sockets, { id: socket.id })) {
		debug('restoring socket to %s', nsp.name);
		nsp.connected[socket.id] = socket;
	}
}

function 
