import { User as NodeCGUser } from '../database';

declare global {
	namespace Express {
		interface User extends NodeCGUser {}
	}
}
