// Packages
import express from 'express';

/**
 * These are stubs for now.
 * This system will become more fleshed out in a
 * future release of NodeCG as outlined in this gist:
 * https://gist.github.com/Lange/4a456f08364c53aa92f9ac5fbb26bab6
 */
const permissions: NodeCG.Permission[] = [
	{
		id: 'read',
		entity_id: 'all',
		authorized_actions: ['read'],
	},
	{
		id: 'write',
		entity_id: 'all',
		authorized_actions: ['write'],
	},
];

const roles: NodeCG.Role[] = [{ id: 'user', permission_ids: [] }];

function getRoleById(roleId: string): NodeCG.Role | undefined {
	return roles.find(r => r.id === roleId);
}

function getPermissionById(permissionId: string): NodeCG.Permission | undefined {
	return permissions.find(p => p.id === permissionId);
}

function getUserRoles(user: NodeCG.User): Set<NodeCG.Role> {
	const userRoles = new Set<NodeCG.Role>();
	for (const roleId of user.role_ids) {
		const foundRole = getRoleById(roleId);
		if (foundRole) {
			userRoles.add(foundRole);
		}
	}

	return userRoles;
}

function getRolePermissions(role: NodeCG.Role): Set<NodeCG.Permission> {
	const rolePermissions = new Set<NodeCG.Permission>();
	for (const permissionId of role.permission_ids) {
		const foundPermission = getPermissionById(permissionId);
		if (foundPermission) {
			rolePermissions.add(foundPermission);
		}
	}

	return rolePermissions;
}

function getManyRolePermissions(roles: Set<NodeCG.Role>): Set<NodeCG.Permission> {
	const combinedPermissions = new Set<NodeCG.Permission>();
	for (const role of roles) {
		const rolePermissions = getRolePermissions(role);
		rolePermissions.forEach(p => combinedPermissions.add(p));
	}

	return combinedPermissions;
}

export function getRequestUser(request: express.Request): void {
	return request.user;
}

export function calculatePermissions(user: NodeCG.User): Set<NodeCG.Permission> {
	const roles = getUserRoles(user);
	return getManyRolePermissions(roles);
}
