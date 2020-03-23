// Packages
import * as SocketIO from 'socket.io';
import * as Sentry from '@sentry/node';

// Ours
import createLogger from '../logger';

const log = createLogger('nodecg/lib/server');

export default async function(socket: SocketIO.Socket, next: SocketIO.NextFunction): Promise<void> {
	try {
		log.trace('New socket connection: ID %s with IP %s', socket.id, socket.handshake.address);

		socket.on('error', err => {
			if (global.sentryEnabled) {
				Sentry.captureException(err);
			}

			log.error(err.stack);
		});

		socket.on('message', data => {
			log.debug('Socket %s sent a message:', socket.id, data);
			socket.broadcast.emit('message', data);
		});

		socket.on('joinRoom', (room, cb) => {
			if (typeof room !== 'string') {
				throw new Error('Room must be a string');
			}

			if (Object.keys(socket.rooms).includes(room)) {
				log.trace('Socket %s joined room:', socket.id, room);
				socket.join(room);
			}

			if (typeof cb === 'function') {
				cb();
			}
		});

		next();
	} catch (error) {
		next(error);
	}
}
