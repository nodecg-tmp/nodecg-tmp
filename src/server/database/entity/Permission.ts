import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, ManyToOne } from 'typeorm';
import { Role } from './Role';

export const enum Action {
	NONE = 0,
	READ = 1 << 0,
	WRITE = 1 << 1,
}

@Entity()
export class Permission {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	name: string;

	@ManyToOne(
		() => Role,
		role => role.permissions,
	)
	role: Role;

	@OneToOne(() => Entity)
	@JoinColumn()
	entity_id: string;

	@Column('int')
	actions: number;
}
