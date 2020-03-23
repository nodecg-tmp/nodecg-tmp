export const enum Code {
	CredentialsBadFormat = 'credentials_bad_format',
	CredentialsRequired = 'credentials_required',
	InternalError = 'internal_error',
	InvalidToken = 'invalid_token',
	TokenRevoked = 'token_invalidated',
}

export default class UnauthorizedError extends Error {
	serialized: { message: string; code: Code; type: 'UnauthorizedError' };

	constructor(code: Code, message: string) {
		super(message);
		this.message = message;
		this.serialized = {
			message: this.message,
			code,
			type: 'UnauthorizedError',
		};
	}
}
