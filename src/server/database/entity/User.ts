import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Token } from './Token';

@Entity()
export class User {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('simple-array')
	role_ids: string[];

	@OneToOne(
		type => Token,
		token => token.user,
	)
	@JoinColumn()
	token: Token;
}
