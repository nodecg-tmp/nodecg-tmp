import { Entity, ManyToOne, Column, Generated } from 'typeorm';
import { User } from './User';

@Entity()
export class ApiKey {
	@Column()
	@Generated('uuid')
	secret_key: string;

	@ManyToOne(
		() => User,
		user => user.apiKeys,
	)
	user: User;
}
