// Native
import path from 'path';
import crypto from 'crypto';

// Packages
import express from 'express';
import expressSession from 'express-session';
import passport from 'passport';
import steamStrategy from 'passport-steam';
import { Strategy as LocalStrategy } from 'passport-local';
import { TypeormStore } from 'connect-typeorm';

// Ours
import config from '../config';
import createLogger from '../logger';
import * as db from '../database';
import { User, Session, Role } from '../database';
import { Identity } from '../database/entity/Identity';

declare global {
	namespace Express {
		interface User extends User {}
	}
}

type StrategyDoneCb = (error: NodeJS.ErrnoException | null, profile?: User) => void;

const log = createLogger('nodecg/lib/login');
const protocol = (config.ssl && config.ssl.enabled) || config.login.forceHttpsReturn ? 'https' : 'http';

async function findUserById(id: User['id']): Promise<User | undefined> {
	const database = await db.getConnection();
	return database
		.getRepository(User)
		.createQueryBuilder('user')
		.where('user.id = :id', { id })
		.getOne();
}

async function createUser(userInfo: Pick<User, 'name' | 'roles' | 'identities'>): Promise<User> {
	const database = await db.getConnection();
	const manager = database.manager;
	const qb = database.createQueryBuilder();

	// Make the user
	const user = manager.create(User, { name: userInfo.name });
	manager.save(user);

	// Make the relations
	await qb
		.relation(User, 'identities')
		.of(user)
		.add(userInfo.identities);

	await qb
		.relation(User, 'roles')
		.of(user)
		.add(userInfo.roles);

	return user;
}

async function createIdentity(identInfo: Pick<Identity, 'provider_type' | 'provider_hash'>): Promise<Identity> {
	const database = await db.getConnection();
	const manager = database.manager;
	const ident = manager.create(Identity, identInfo);
	manager.save(ident);
	return ident;
}

async function findIdent(
	type: Identity['provider_type'],
	hash: Identity['provider_hash'],
): Promise<Identity | undefined> {
	const database = await db.getConnection();
	return database
		.getRepository(Identity)
		.createQueryBuilder('ident')
		.where('ident.type = :type', { type })
		.andWhere('ident.hash = :hash', { hash })
		.getOne();
}

async function ensureRoles(): Promise<Role[]> {
	const database = await db.getConnection();
}

// Required for persistent login sessions.
// Passport needs ability to serialize and unserialize users out of session.
passport.serializeUser<User, User['id']>((user, done) => done(null, user.id));
passport.deserializeUser<User, User['id']>(async (id, done) => {
	try {
		done(null, await findUserById(id));
	} catch (error) {
		done(error);
	}
});

if (config?.login?.steam?.enabled) {
	passport.use(
		steamStrategy(
			{
				returnURL: `${protocol}://${config.baseURL}/login/auth/steam`,
				realm: `${protocol}://${config.baseURL}/login/auth/steam`,
				apiKey: config.login.steam.apiKey,
			},
			async (
				_: unknown,
				profile: { id: string; allowed: boolean; displayName: string },
				done: StrategyDoneCb,
			) => {
				try {
					const allowed = config.login.steam.allowedIds.includes(profile.id);
					if (allowed) {
						log.info('Granting %s (%s) access', profile.id, profile.displayName);
					} else {
						log.info('Denying %s (%s) access', profile.id, profile.displayName);
					}

					// Check for ident that matches.
					// If found, it should have an associated user, so return that.
					const existingIdent = await findIdent('steam', profile.id);
					if (existingIdent) {
						return done(null, existingIdent.user);
					}

					// Else, make an ident and user.
					const ident = await createIdentity({
						provider_type: 'steam',
						provider_hash: profile.id,
					});
					const user = await createUser({
						name: profile.displayName,
						roles: FOO,
						identities: [ident],
					});
					return done(null, user);
				} catch (error) {
					done(error);
				}
			},
		),
	);
}

if (config?.login?.twitch?.enabled) {
	const TwitchStrategy = require('passport-twitch-helix').Strategy;

	// The "user:read:email" scope is required. Add it if not present.
	const scopesArray = config.login.twitch.scope.split(' ');
	if (!scopesArray.includes('user:read:email')) {
		scopesArray.push('user:read:email');
	}

	const concatScopes = scopesArray.join(' ');

	passport.use(
		new TwitchStrategy(
			{
				clientID: config.login.twitch.clientID,
				clientSecret: config.login.twitch.clientSecret,
				callbackURL: `${protocol}://${config.baseURL}/login/auth/twitch`,
				scope: concatScopes,
			},
			(accessToken: string, refreshToken: string, profile: { username: string }, done: StrategyDoneCb) => {
				const allowed = config.login.twitch.allowedUsernames.includes(profile.username);
				if (allowed) {
					log.info('Granting %s access', profile.username);
				} else {
					log.info('Denying %s access', profile.username);
				}

				return done(null, {
					...profile,
					allowed,
					accessToken: allowed ? accessToken : undefined,
					refreshToken: allowed ? refreshToken : undefined,
				});
			},
		),
	);
}

if (config.login.local && config.login.local.enabled) {
	const {
		sessionSecret,
		local: { allowedUsers },
	} = config.login;
	const hashes = crypto.getHashes();

	passport.use(
		new LocalStrategy(
			{
				usernameField: 'username',
				passwordField: 'password',
				session: false,
			},
			(username: string, password: string, done: StrategyDoneCb) => {
				const user = allowedUsers.find(u => u.username === username);
				let allowed = false;

				if (user) {
					const match = /^([^:]+):(.+)$/.exec(user.password);
					let expected = user.password;
					let actual = password;

					if (match && hashes.includes(match[1])) {
						expected = match[2];
						actual = crypto
							.createHmac(match[1], sessionSecret)
							.update(actual, 'utf8')
							.digest('hex');
					}

					if (expected === actual) {
						allowed = true;
					}
				}

				log.info('%s %s access using local auth', allowed ? 'Granting' : 'Denying', username);

				return done(null, {
					provider: 'local',
					username,
					allowed,
				});
			},
		),
	);
}

export async function createMiddleware(): Promise<express.Application> {
	const database = await db.getConnection();
	const sessionRepository = database.getRepository(Session);
	const app = express();
	const redirectPostLogin = (req: express.Request, res: express.Response): void => {
		const url = req.session?.returnTo || '/dashboard';
		res.redirect(url);
		app.emit('login', req.session);
	};

	app.use(
		expressSession({
			resave: false,
			saveUninitialized: false,
			store: new TypeormStore({
				cleanupLimit: 2,
				ttl: Infinity,
			}).connect(sessionRepository),
			secret: config.login.sessionSecret,
			cookie: {
				path: '/',
				httpOnly: true,
				secure: config.ssl && config.ssl.enabled,
			},
		}),
	);

	app.use(passport.initialize());
	app.use(passport.session());

	app.use('/login', express.static(path.join(__dirname, 'public')));
	app.set('views', __dirname);

	app.get('/login', (req, res) => {
		res.render('public/login.tmpl', {
			user: req.user,
			config,
		});
	});

	app.get('/authError', (req, res) => {
		res.render('public/authError.tmpl', {
			message: req.query.message,
			code: req.query.code,
			viewUrl: req.query.viewUrl,
		});
	});

	app.get('/login/steam', passport.authenticate('steam'));

	app.get('/login/auth/steam', passport.authenticate('steam', { failureRedirect: '/login' }), redirectPostLogin);

	app.get('/login/twitch', passport.authenticate('twitch'));

	app.get('/login/auth/twitch', passport.authenticate('twitch', { failureRedirect: '/login' }), redirectPostLogin);

	app.get('/login/local', passport.authenticate('local'));

	app.post('/login/local', passport.authenticate('local', { failureRedirect: '/login' }), redirectPostLogin);

	app.get('/logout', (req, res) => {
		app.emit('logout', req.session);
		req.session?.destroy(() => {
			res.clearCookie('connect.sid', { path: '/' });
			res.clearCookie('socketToken', { path: '/' });
			res.redirect('/login');
		});
	});

	return app;
}
