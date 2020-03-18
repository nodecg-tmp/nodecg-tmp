import { getConnection, User, Role, Identity } from '../database';

export async function findUser(id: User['id']): Promise<User | undefined> {
	const database = await getConnection();
	return database
		.getRepository(User)
		.createQueryBuilder('user')
		.where('user.id = :id', { id })
		.getOne();
}

export async function getSuperUserRole(): Promise<Role> {
	const superUserRole = await findRole('superuser');
	if (!superUserRole) {
		throw new Error('superuser role unexpectedly not found');
	}

	return superUserRole;
}

export async function upsertUser({
	name,
	provider_type,
	provider_hash,
	roles,
}: {
	name: User['name'];
	provider_type: Identity['provider_type'];
	provider_hash: Identity['provider_hash'];
	roles: User['roles'];
}): Promise<User> {
	const database = await getConnection();
	const manager = database.manager;
	let user: User;

	// Check for ident that matches.
	// If found, it should have an associated user, so return that.
	// Else, make an ident and user.
	const existingIdent = await findIdent(provider_type, provider_hash);
	if (existingIdent) {
		user = existingIdent.user;
	} else {
		const ident = await createIdentity({
			provider_type,
			provider_hash,
		});
		user = manager.create(User, {
			name,
			identities: [ident],
		});
	}

	// Always update the roles, regardless of if we are making a new user or updating an existing one.
	user.roles = roles;
	manager.save(user);

	return user;
}

async function findRole(name: Role['name']): Promise<Role | undefined> {
	const database = await getConnection();
	const manager = database.manager;
	return manager.findOne(Role, {
		name,
	});
}

async function createIdentity(identInfo: Pick<Identity, 'provider_type' | 'provider_hash'>): Promise<Identity> {
	const database = await getConnection();
	const manager = database.manager;
	const ident = manager.create(Identity, identInfo);
	manager.save(ident);
	return ident;
}

async function findIdent(
	type: Identity['provider_type'],
	hash: Identity['provider_hash'],
): Promise<Identity | undefined> {
	const database = await getConnection();
	return database
		.getRepository(Identity)
		.createQueryBuilder('ident')
		.where('ident.type = :type', { type })
		.andWhere('ident.hash = :hash', { hash })
		.getOne();
}
