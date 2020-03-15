import Cookies from 'cookies-js';
import io from 'socket.io-client';

declare global {
	interface Window {
		token: string;
		socket: SocketIOClient.Socket;
	}
}

const params = new URLSearchParams(location.search);

window.token = params.get('key') ?? Cookies.get('socketToken');

if (window.token) {
	window.socket = io(undefined, { query: { token: window.token } });
} else {
	window.socket = io();
}
