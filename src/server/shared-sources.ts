// Native
import path from 'path';

// Packages
import express from 'express';

// Ours
import * as bundles from './bundle-manager';
import { authCheck } from './util';

const app = express();
export default app;

app.get('/bundles/:bundleName/shared/*', authCheck, (req, res, next) => {
	const { bundleName } = req.params;
	const bundle = bundles.find(bundleName);
	if (!bundle) {
		next();
		return;
	}

	// Essentially behave like express.static
	// Serve up files with no extra logic
	const resName = req.params[0];
	const fileLocation = path.join(bundle.dir, 'shared', resName);
	res.sendFile(fileLocation, (err: any) => {
		if (err) {
			if (err.code === 'ENOENT') {
				return next();
			}

			/* istanbul ignore next */
			if (!res.headersSent) {
				return next();
			}
		}
	});
});
