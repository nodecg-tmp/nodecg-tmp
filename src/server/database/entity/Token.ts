import { Entity, PrimaryGeneratedColumn, OneToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class Token {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@OneToOne(
		type => User,
		user => user.token,
	)
	user: User;
}
