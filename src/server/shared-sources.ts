// Native
import path from 'path';

// Packages
import express from 'express';

// Ours
import { authCheck } from './util';

export default class SharedSourcesLib {
	app = express();

	constructor(bundles: NodeCG.Bundle[]) {
		this.app.get('/bundles/:bundleName/shared/*', authCheck, (req, res, next) => {
			const { bundleName } = req.params as { [k: string]: string };
			const bundle = bundles.find(b => b.name === bundleName);
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
	}
}
