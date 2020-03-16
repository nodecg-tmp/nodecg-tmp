import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Role } from './Role';
import { Identity } from './Identity';

@Entity()
export class User {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@CreateDateColumn()
	created_at: number;

	@Column('text')
	name: string;

	@ManyToMany(() => Role)
	@JoinTable()
	roles: Role[];

	@OneToMany(
		() => Identity,
		identity => identity.user,
	)
	identities: Identity[];
}
