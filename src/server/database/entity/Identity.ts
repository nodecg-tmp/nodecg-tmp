import { Entity, ManyToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class Identity {
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
