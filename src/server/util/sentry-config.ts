// Native
import path from 'path';
import os from 'os';

// Packages
import * as Sentry from '@sentry/node';
import express from 'express';

// Ours
import { config } from '../config';
import bundleManager, { all as getAllBundles } from '../bundle-manager';
import { authCheck } from '../util';
import * as pjson from '../../../package.json';

export const bundleMetadata: Array<{ name: string; git: NodeCG.Bundle.GitData; version: string }> = [];
export const app = express();
const baseSentryConfig = {
	dsn: config.sentry?.dsn,
	serverName: os.hostname(),
	release: pjson.version,
};

// When the bundle manager first loads up the bundles, a
bundleManager.on('init', () => {
	Sentry.configureScope(scope => {
		getAllBundles().forEach(bundle => {
			bundleMetadata.push({
				name: bundle.name,
				git: bundle.git,
				version: bundle.version,
			});
		});
		scope.setExtra('bundles', bundleMetadata);
	});
});

bundleManager.on('gitChanged', bundle => {
	const metadataToUpdate = bundleMetadata.find(data => data.name === bundle.name);
	if (!metadataToUpdate) {
		return;
	}

	metadataToUpdate.git = bundle.git;
	metadataToUpdate.version = bundle.version;
});

// Render a pre-configured Sentry instance for client pages that request it.
app.get('/sentry.js', authCheck, (_req, res) => {
	res.render(path.join(process.env.NODECG_ROOT, 'src/client/sentry.js.tmpl'), {
		baseSentryConfig,
		bundleMetadata,
	});
});
