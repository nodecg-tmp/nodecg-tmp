import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Action } from '../Actions';

@Entity()
export class Permission {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	entity_id: string;

	@Column('simple-array')
	authorized_actions: Action[];
}
