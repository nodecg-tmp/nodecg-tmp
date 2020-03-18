import 'reflect-metadata';
import { createConnection, Connection } from 'typeorm';
export * from './entity';

let memoizedConnection: Connection;
export async function getConnection(): Promise<Connection> {
	if (!memoizedConnection) {
		memoizedConnection = await createConnection({
			type: 'sqlite',
			database: 'test',
			logging: false,
			entities: ['src/database/entity/**/*.ts'],
			migrations: ['src/database/migration/**/*.ts'],
			subscribers: ['src/database/subscriber/**/*.ts'],
			migrationsRun: true,
		});
	}

	return memoizedConnection;
}
