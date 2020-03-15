import { Entity as EntityDecorator, PrimaryGeneratedColumn, Column } from 'typeorm';
import { Action } from '../Actions';

@EntityDecorator()
export class Entity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('simple-array')
	available_actions: Action[];
}
