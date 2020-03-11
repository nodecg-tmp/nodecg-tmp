// Packages
import * as Sentry from '@sentry/node';

// Ours
import bundleManager from '../bundle-manager';

let bundleMetadata: Array<{ name: string; git: object; version: string }>;

// When the bundle manager first loads up the bundles, a
bundleManager.on('init', bundles => {
	Sentry.configureScope(scope => {
		bundleMetadata = bundles.map(bundle => {
			return {
				name: bundle.name,
				git: bundle.git,
				version: bundle.version,
			};
		});
		scope.setExtra('bundles', bundleMetadata);
	});
});

bundleManager.on('gitChanged', bundle => {
	const foo = bundleMetadata.find(data => data.name === bundle.name);
	if (!foo) {
		return;
	}

	foo.git = bundle.git;
	foo.version = bundle.version;
});
