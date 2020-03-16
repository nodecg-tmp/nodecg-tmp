/**
 * Adapted from https://raw.githubusercontent.com/danielmhanover/typeorm-upsert
 *
 * If this doesn't work, try this: https://github.com/typeorm/typeorm/issues/1090#issuecomment-582669430
 */
import { getRepository, ObjectType } from 'typeorm';
import _ from 'lodash';

/*
 * EntityType - TypeORM Entity
 * obj - Object to upsert
 * key_naming_transform (optional) - Transformation to apply to key names before upsert
 * do_not_upsert - Keys to exclude from upsert. This is useful if a non-nullable field is required in case
 * the row does not already exist but you do not want to overwrite this field if it already exists
 */
export default async <T>(
	EntityClass: ObjectType<T>,
	obj: T,
	primary_key: keyof T,
	opts?: {
		do_not_upsert: string[];
	},
): Promise<T> => {
	const keys: string[] = _.difference(_.keys(obj), opts ? opts.do_not_upsert : []);
	const setter_string = keys.map(k => `${k} = :${k}`);

	const repo = getRepository(EntityClass);
	const qb = repo
		.createQueryBuilder()
		.insert()
		.values(obj)
		.onConflict(`("${String(primary_key)}") DO UPDATE SET ${setter_string.toString()}`);

	keys.forEach(k => {
		qb.setParameter(k, (obj as any)[k]);
	});

	return (await qb.returning('*').execute()).generatedMaps[0] as T;
};
