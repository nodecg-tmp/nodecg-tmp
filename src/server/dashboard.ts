// Native
import fs from 'fs';
import path from 'path';

// Packages
import clone from 'clone';
import express from 'express';

// Ours
import * as bundles from './bundle-manager';
import { config, filteredConfig } from './config';
import createLogger from './logger';
import * as ncgUtils from './util';

type DashboardContext = {
	bundles: NodeCG.Bundle[];
	publicConfig: typeof filteredConfig;
	privateConfig: typeof config;
	workspaces: Workspace[];
};

type Workspace = {
	name: string;
	label: string;
	route: string;
	fullbleed?: boolean;
};

const log = createLogger('nodecg/lib/dashboard');
const INSTRUMENTED_PATH = path.join(__dirname, '../instrumented');
const BUILD_PATH = path.join(__dirname, '../build/client');

export default class DashboardLib {
	app = express();

	dashboardContext: DashboardContext | null = null;

	constructor() {
		const { app } = this;

		app.use('/node_modules', express.static(path.resolve(__dirname, '../node_modules')));

		app.get('/', (_, res) => res.redirect('/dashboard/'));

		app.get('/dashboard', ncgUtils.authCheck, (req, res) => {
			if (!req.url.endsWith('/')) {
				return res.redirect('/dashboard/');
			}

			if (!this.dashboardContext) {
				this.dashboardContext = getDashboardContext();
			}

			res.render(path.join(__dirname, '../client/dashboard/dashboard.tmpl'), this.dashboardContext);
		});

		app.get('/nodecg-api.min.js', (_, res) => {
			res.sendFile(path.join(process.env.NODECG_TEST ? INSTRUMENTED_PATH : BUILD_PATH, 'nodecg-api.min.js'));
		});

		app.get('/nodecg-api.min.js.map', (_, res) => {
			res.sendFile(path.join(process.env.NODECG_TEST ? INSTRUMENTED_PATH : BUILD_PATH, 'nodecg-api.min.js.map'));
		});

		if (process.env.NODECG_TEST) {
			log.warn('Serving instrumented files for testing');
			app.get('/*', (req, res, next) => {
				const resName = req.params[0];
				if (!resName.startsWith('dashboard/') && !resName.startsWith('instance/')) {
					return next();
				}

				const fp = path.join(INSTRUMENTED_PATH, resName);
				if (fs.existsSync(fp)) {
					return res.sendFile(fp, (err: NodeJS.ErrnoException) => {
						/* istanbul ignore next */
						if (err && !res.headersSent) {
							return next();
						}
					});
				}

				return next();
			});
		}

		app.get('/bundles/:bundleName/dashboard/*', ncgUtils.authCheck, (req, res, next) => {
			const { bundleName } = req.params;
			const bundle = bundles.find(bundleName);
			if (!bundle) {
				next();
				return;
			}

			const resName = req.params[0];
			// If the target file is a panel or dialog, inject the appropriate scripts.
			// Else, serve the file as-is.
			const panel = bundle.dashboard.panels.find(p => p.file === resName);
			if (panel) {
				const resourceType = panel.dialog ? 'dialog' : 'panel';
				ncgUtils.injectScripts(
					panel.html,
					resourceType,
					{
						createApiInstance: bundle,
						standalone: req.query.standalone,
						fullbleed: panel.fullbleed,
					},
					html => res.send(html),
				);
			} else {
				const fileLocation = path.join(bundle.dashboard.dir, resName);
				res.sendFile(fileLocation, (err: NodeJS.ErrnoException) => {
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
			}
		});

		// When a bundle changes, delete the cached dashboard context
		bundles.default.on('bundleChanged', () => {
			this.dashboardContext = null;
		});
	}
}

function getDashboardContext(): DashboardContext {
	return {
		bundles: bundles.all().map(bundle => {
			const cleanedBundle = clone(bundle);
			if (cleanedBundle.dashboard.panels) {
				cleanedBundle.dashboard.panels.forEach(panel => {
					delete panel.html;
				});
			}

			return cleanedBundle;
		}),
		publicConfig: filteredConfig,
		privateConfig: config,
		workspaces: parseWorkspaces(),
	};
}

function parseWorkspaces(): Workspace[] {
	let defaultWorkspaceHasPanels = false;
	let otherWorkspacesHavePanels = false;
	const workspaces: Workspace[] = [];
	const workspaceNames = new Set<string>();
	bundles.all().forEach(bundle => {
		bundle.dashboard.panels.forEach(panel => {
			if (panel.dialog) {
				return;
			}

			if (panel.fullbleed) {
				otherWorkspacesHavePanels = true;
				const workspaceName = `__nodecg_fullbleed__${bundle.name}_${panel.name}`;
				workspaces.push({
					name: workspaceName,
					label: panel.title,
					route: `fullbleed/${panel.name}`,
					fullbleed: true,
				});
			} else if (panel.workspace === 'default') {
				defaultWorkspaceHasPanels = true;
			} else {
				workspaceNames.add(panel.workspace);
				otherWorkspacesHavePanels = true;
			}
		});
	});

	workspaceNames.forEach(name => {
		workspaces.push({
			name,
			label: name,
			route: `workspace/${name}`,
		});
	});

	workspaces.sort((a, b) => {
		return a.label.localeCompare(b.label);
	});

	if (defaultWorkspaceHasPanels || !otherWorkspacesHavePanels) {
		workspaces.unshift({
			name: 'default',
			label: otherWorkspacesHavePanels ? 'Main Workspace' : 'Workspace',
			route: '',
		});
	}

	return workspaces;
}
