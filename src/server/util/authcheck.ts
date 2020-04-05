// Packages
import express from 'express';

// Ours
import { getConnection, ApiKey } from '../database';
import { isSuperUser } from '../database/utils';
import { config } from '../config';

/**
 * Express middleware that checks if the user is authenticated.
 */
export default async function(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
	try {
		if (!config.login?.enabled) {
			return next();
		}

		// To set a cookie on localhost, domain must be left blank
		let domain: string | undefined = config.baseURL.replace(/:[0-9]+/, '');
		if (domain === 'localhost') {
			domain = undefined;
		}

		let user = req.user;
		if (req.query.key ?? req.cookies.socketToken) {
			const database = await getConnection();
			const apiKey = await database
				.getRepository(ApiKey)
				.createQueryBuilder('apiKey')
				.where('apiKey.secret_key = :key', { key: req.query.key ?? req.cookies.socketToken })
				.getOne();

			// No record of this API Key found, reject the request.
			if (!apiKey) {
				// Ensure we delete the existing cookie so that it doesn't become poisoned
				// and cause an infinite login loop.
				return req.session?.destroy(() => {
					res.clearCookie('socketToken', {
						path: '/',
						domain,
						secure: config.ssl && config.ssl.enabled,
					});

					res.redirect('/login');
				});
			}

			user = apiKey.user;

			// Set the cookie so that requests to other resources on the page
			// can also be authenticated.
			// This is crucial for things like OBS browser sources,
			// where we don't have a session.
			res.cookie('socketToken', apiKey.secret_key, {
				path: '/',
				domain: domain as string,
				secure: config.ssl && config.ssl.enabled,
			});
		}

		if (!user) {
			if (req.session) {
				req.session.returnTo = req.url;
			}

			return res.redirect('/login');
		}

		const allowed = isSuperUser(user);
		const provider = user.identities[0]?.provider_type;
		const providerAllowed = config.login && config.login[provider]?.enabled;
		if (req.isAuthenticated() && allowed && providerAllowed) {
			return next();
		}

		return res.sendStatus(403).end();
	} catch (error) {
		next(error);
	}
}
