import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Action {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text')
	name: 'read' | 'write';
}
