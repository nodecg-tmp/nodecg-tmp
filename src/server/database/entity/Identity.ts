import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './User';

@Entity()
export class Identity {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	provider_type: 'twitch' | 'steam' | 'local';

	/**
	 * Hashed password for local, auth token from twitch, etc.
	 */
	provider_hash: string;

	@ManyToOne(
		() => User,
		user => user.identities,
	)
	user: User;
}
