// Native
import path from 'path';
import fs from 'fs';

// Packages
import 'reflect-metadata';
import { createConnection, Connection } from 'typeorm';
import appRootPath from 'app-root-path';
export * from './entity';

const dbPath = path.join(appRootPath.path, 'db/nodecg.sqlite3');
let memoizedConnection: Connection;
export async function getConnection(): Promise<Connection> {
	if (!memoizedConnection) {
		memoizedConnection = await createConnection({
			type: 'sqlite',
			database: dbPath,
			logging: false,
			entities: [path.join(appRootPath.path, 'build/server/database/entity/**/*.js')],
			migrations: [path.join(appRootPath.path, 'build/server/database/migration/**/*.js')],
			subscribers: [path.join(appRootPath.path, 'build/server/database/subscriber/**/*.js')],
			migrationsRun: true,

			/**
			 * If the database doesn't exist yet,
			 * then we need to create it and fill it with our schemas.
			 */
			synchronize: !fs.existsSync(dbPath),
		});
	}

	return memoizedConnection;
}
