import { Entity, PrimaryGeneratedColumn, Column, OneToMany, JoinTable } from 'typeorm';
import { Permission } from './Permission';

@Entity()
export class Role {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	name: string;

	@OneToMany(
		() => Permission,
		permission => permission.role,
	)
	@JoinTable()
	permissions: Permission[];
}
