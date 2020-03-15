// Native
import path from 'path';
import crypto from 'crypto';

// Packages
import express from 'express';
import passport from 'passport';
import steamStrategy from 'passport-steam';
import { Strategy as LocalStrategy } from 'passport-local';
import jwt from 'express-jwt';

// Ours
import config from '../config';
import createLogger from '../logger';
import * as db from '../database';
import { User, Token } from '../database';

const log = createLogger('nodecg/lib/login');
const protocol = (config.ssl && config.ssl.enabled) || config.login.forceHttpsReturn ? 'https' : 'http';
const app = express();

export default app;

// 2016-03-26 - Lange: I don't know what these do?
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.use(
	jwt({
		secret: 'shhhhhhared-secret',
		getToken(req) {
			if (req?.headers?.authorization?.split(' ')[0] === 'Bearer') {
				return req.headers.authorization.split(' ')[1];
			}

			if (req?.query?.token) {
				return req.query.token;
			}

			if (req?.query?.key) {
				return req.query.key;
			}

			return null;
		},
		async isRevoked(_req, payload, done) {
			try {
				const tokenId = payload.jti;
				const database = await db.getConnection();
				const foundToken = await database
					.getRepository(Token)
					.createQueryBuilder('token')
					.where('token.id = :id', { id: tokenId })
					.getOne();
				done(null, Boolean(foundToken));
			} catch (error) {
				done(error);
			}
		},
	}).unless({ path: [/^\/(login|authError|logout)/] }),
);

if (config?.login?.steam?.enabled) {
	passport.use(
		steamStrategy(
			{
				returnURL: `${protocol}://${config.baseURL}/login/auth/steam`,
				realm: `${protocol}://${config.baseURL}/login/auth/steam`,
				apiKey: config.login.steam.apiKey,
			},
			(
				_: unknown,
				profile: { id: string; allowed: boolean; displayName: string },
				done: (error: Error | null, profile: any) => void,
			) => {
				profile.allowed = config.login.steam.allowedIds.includes(profile.id);
				if (profile.allowed) {
					log.info('Granting %s (%s) access', profile.id, profile.displayName);
				} else {
					log.info('Denying %s (%s) access', profile.id, profile.displayName);
				}

				return done(null, profile);
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
			(
				accessToken: string,
				refreshToken: string,
				profile: { username: string },
				done: (error: Error | null, profile: any) => void,
			) => {
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
			(username: string, password: string, done) => {
				const user = allowedUsers.find(u => u.username === username);
				let allowed = false;

				if (user) {
					const match = user.password.match(/^([^:]+):(.+)$/);
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

// Express-session no longer uses cookieParser, but NodeCG's util lib does.
app.use(cookieParser(config.login.sessionSecret));
app.use(
	session({
		secret: config.login.sessionSecret,
		resave: false,
		saveUninitialized: false,
		store: new NedbStore({ filename: path.resolve(process.env.NODECG_ROOT, 'db/sessions.db') }),
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

function redirectPostLogin(req: express.Request, res: express.Response): void {
	const url = req.session?.returnTo || '/dashboard';
	res.redirect(url);
	app.emit('login', req.session);
}
