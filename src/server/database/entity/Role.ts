import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Role {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('simple-array')
	permission_ids: string[];
}
