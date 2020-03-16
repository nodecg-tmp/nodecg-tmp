import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Action } from './Action';

@Entity()
export class Permission {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	name: string;

	@Column('text')
	entity_id: string;

	@ManyToMany(() => Action)
	@JoinTable()
	allowed_actions: Action[];

	@ManyToMany(() => Action)
	@JoinTable()
	denied_actions: Action[];
}
