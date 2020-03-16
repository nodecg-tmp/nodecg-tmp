import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Permission } from './Permission';

@Entity()
export class Role {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	name: string;

	@ManyToMany(() => Permission)
	@JoinTable()
	permissions: Permission[];
}
