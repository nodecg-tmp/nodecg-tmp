// Native
import path from 'path';

// Packages
import express from 'express';
import * as bundles from './bundle-manager';
import { authCheck } from './util';

export default class MountsLib {
	app = express();

	constructor() {
		bundles.all().forEach(bundle => {
			bundle.mount.forEach(mount => {
				this.app.get(`/bundles/${bundle.name}/${mount.endpoint}/*`, authCheck, (req, res, next) => {
					const resName = req.params[0];
					const fileLocation = path.join(bundle.dir, mount.directory, resName);

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
			});
		});
	}
}
