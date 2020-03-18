// Packages
import * as Sentry from '@sentry/node';

// Ours
import bundleManager, { all as getAllBundles } from '../bundle-manager';

export const bundleMetadata: Array<{ name: string; git: NodeCG.Bundle.GitData; version: string }> = [];

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
