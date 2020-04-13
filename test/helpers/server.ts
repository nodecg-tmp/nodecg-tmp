// Native
import path from 'path';

// Packages
import anyTest, { TestInterface } from 'ava';
import fse from 'fs-extra';
import temp from 'temp';

// Ours
import * as C from './test-constants';
import NodeCGServer from '../../build/server/server';
import serverApiFactory from '../../build/server/api.server';

const test = anyTest as TestInterface<{
	server: NodeCGServer;
	apis: { extension: ReturnType<typeof serverApiFactory> };
}>;

export const setup = (nodecgConfigName = 'nodecg.json'): void => {
	const tempFolder = temp.mkdirSync();
	temp.track(); // Automatically track and cleanup files at exit.

	// Tell NodeCG to look in our new temp folder for bundles, cfg, db, and assets, rather than whatever ones the user
	// may have. We don't want to touch any existing user data!
	process.env.NODECG_ROOT = tempFolder;

	fse.copySync('test/fixtures/nodecg-core/assets', path.join(tempFolder, 'assets'));
	fse.copySync('test/fixtures/nodecg-core/bundles', path.join(tempFolder, 'bundles'));
	fse.moveSync(path.join(tempFolder, 'bundles/test-bundle/git'), path.join(tempFolder, 'bundles/test-bundle/.git'));
	fse.copySync('test/fixtures/nodecg-core/cfg', path.join(tempFolder, 'cfg'));
	fse.copySync(`test/fixtures/nodecg-core/cfg/${nodecgConfigName}`, path.join(tempFolder, 'cfg/nodecg.json'));
	fse.copySync('test/fixtures/nodecg-core/db', path.join(tempFolder, 'db'));

	let server: NodeCGServer;
	test.before(async () => {
		server = new NodeCGServer();
		await server.start();
	});

	test.after.always(() => {
		if (server) {
			server.stop();
		}
	});

	test.beforeEach(t => {
		t.context.server = server;
		t.context.apis = {
			extension: server.getExtensions()[C.bundleName()] as any,
		};
	});
};
