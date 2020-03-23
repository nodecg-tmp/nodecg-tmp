// Packages
import socketIo from 'socket.io';

const io = socketIo(server);
io.sockets.setMaxListeners(64); // Prevent console warnings when many extensions are installed

io.on('connection', socket => {
    const scopes = getSocketScopes(socket);
    if (scopes.includes('replicants:write') {
        // set up code that lets this socket write new data to replicants
    }
});

export function getSocketScopes(socket: socketIo.Socket): Scope[] {
	const token = getRequestToken(socket.request);
	return getTokenScopes(token);
}

export function emitTo(scope: Scope | Scopes[], data: any): void {
	const scopesArr = Array.isArray(scope) ? scope : [scope];
	for (const s of scopesArr) {
		io.to(s).emit(data);
	}
}
