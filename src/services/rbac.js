import { prisma } from "../config/db.js";

/**
 * Checks if a user has a specific permission in a workspace.
 * 
 * @param {string} userId - The ID of the user.
 * @param {string} workspaceId - The ID of the workspace.
 * @param {string} permissionName - The name of the permission (e.g., "posts:create").
 * @returns {Promise<boolean>} - True if authorized, false otherwise.
 */
export async function hasPermission(userId, workspaceId, permissionName) {
  if (!userId || !workspaceId || !permissionName) return false;

  try {
    // 1. Fetch user membership in this workspace, including role permissions and direct PBAC overrides
    const membership = await prisma.membership.findFirst({
      where: { userId, workspaceId },
      include: {
        memberRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        },
        directPermissions: {
          include: { permission: true }
        }
      }
    });

    if (!membership) return false;

    // 2. Legacy fallback: Owners bypass checks
    if (membership.role === "OWNER" || membership.role === "SUPER_ADMIN") {
      return true;
    }

    // 3. Direct overrides (PBAC) take highest priority
    const directOverride = membership.directPermissions.find(
      dp => dp.permission.name === permissionName
    );
    if (directOverride) {
      return directOverride.allowed;
    }

    // 4. Role permissions (RBAC)
    for (const memberRole of membership.memberRoles) {
      const hasPerm = memberRole.role.permissions.some(
        rp => rp.permission.name === permissionName
      );
      if (hasPerm) return true;
    }

    return false;
  } catch (err) {
    console.error("Error checking permissions:", err);
    return false;
  }
}
