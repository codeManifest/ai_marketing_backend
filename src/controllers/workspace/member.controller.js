import { prisma } from '../../config/db.js';

// ==========================================
// 1. WORKSPACE MEMBERS
// ==========================================

export async function listMembers(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const members = await prisma.membership.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true }
        },
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

    return res.json({ success: true, members });
  } catch (err) {
    console.error("Error fetching members:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function inviteMember(req, res) {
  const { workspaceId } = req.params;
  const { email, roleId } = req.body;

  if (!email || !roleId) {
    return res.status(400).json({ error: "Email and Role ID are required" });
  }

  try {
    const userMembership = await prisma.membership.findFirst({
      where: { 
        userId: req.user.id, 
        workspaceId,
        role: { in: ["OWNER", "ADMIN"] }
      }
    });
    if (!userMembership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const role = await prisma.workspaceRole.findFirst({
      where: { id: roleId, workspaceId }
    });
    if (!role) {
      return res.status(404).json({ error: "Role not found in this workspace" });
    }

    let targetUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        systemRoles: {
          include: { role: true }
        }
      }
    });

    if (targetUser) {
      const isSuperAdmin = targetUser.systemRoles.some(sr => sr.role.name === "SUPER_ADMIN");
      if (isSuperAdmin) {
        return res.status(400).json({ error: "Super Admins cannot be added to workspaces" });
      }
    }

    if (!targetUser) {
      targetUser = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: email.split("@")[0]
        }
      });
    }

    const existingMembership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: targetUser.id, workspaceId } }
    });

    if (existingMembership) {
      return res.status(400).json({ error: "User is already a member of this workspace" });
    }

    let legacyRole = "MEMBER";
    if (role.name === "OWNER") legacyRole = "OWNER";
    else if (role.name === "ADMIN") legacyRole = "ADMIN";
    else if (role.name === "MANAGER") legacyRole = "MANAGER";
    else if (role.name === "CONTENT_CREATOR") legacyRole = "CONTENT_CREATOR";

    const newMembership = await prisma.membership.create({
      data: {
        userId: targetUser.id,
        workspaceId,
        role: legacyRole,
        invitedBy: req.user.id
      }
    });

    await prisma.membershipRole.create({
      data: {
        membershipId: newMembership.id,
        roleId: role.id
      }
    });

    const createdMember = await prisma.membership.findUnique({
      where: { id: newMembership.id },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        memberRoles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } }
              }
            }
          }
        },
        directPermissions: { include: { permission: true } }
      }
    });

    return res.json({ success: true, member: createdMember });
  } catch (err) {
    console.error("Error adding member:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateMember(req, res) {
  const { workspaceId } = req.params;
  const { membershipId, roleId, directPermissions = [] } = req.body;

  if (!membershipId) {
    return res.status(400).json({ error: "Membership ID is required" });
  }

  try {
    const userMembership = await prisma.membership.findFirst({
      where: { 
        userId: req.user.id, 
        workspaceId,
        role: { in: ["OWNER", "ADMIN"] }
      }
    });
    if (!userMembership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const memberToUpdate = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId }
    });
    if (!memberToUpdate) {
      return res.status(404).json({ error: "Membership not found" });
    }

    if (roleId) {
      const role = await prisma.workspaceRole.findFirst({
        where: { id: roleId, workspaceId }
      });
      if (!role) {
        return res.status(404).json({ error: "Role not found in this workspace" });
      }

      let legacyRole = "MEMBER";
      if (role.name === "OWNER") legacyRole = "OWNER";
      else if (role.name === "ADMIN") legacyRole = "ADMIN";
      else if (role.name === "MANAGER") legacyRole = "MANAGER";
      else if (role.name === "CONTENT_CREATOR") legacyRole = "CONTENT_CREATOR";

      await prisma.membership.update({
        where: { id: membershipId },
        data: { role: legacyRole }
      });

      await prisma.membershipRole.deleteMany({ where: { membershipId } });
      await prisma.membershipRole.create({
        data: { membershipId, roleId: role.id }
      });
    }

    if (directPermissions.length > 0) {
      await prisma.membershipPermission.deleteMany({ where: { membershipId } });
      await prisma.membershipPermission.createMany({
        data: directPermissions.map(override => ({
          membershipId,
          permissionId: override.permissionId,
          allowed: override.allowed !== false
        }))
      });
    }

    const updatedMember = await prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        memberRoles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } }
              }
            }
          }
        },
        directPermissions: { include: { permission: true } }
      }
    });

    return res.json({ success: true, member: updatedMember });
  } catch (err) {
    console.error("Error updating member:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function removeMember(req, res) {
  const { workspaceId } = req.params;
  const { membershipId } = req.body;

  if (!membershipId) {
    return res.status(400).json({ error: "Membership ID is required" });
  }

  try {
    const userMembership = await prisma.membership.findFirst({
      where: { 
        userId: req.user.id, 
        workspaceId,
        role: { in: ["OWNER", "ADMIN"] }
      }
    });
    if (!userMembership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const memberToDelete = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId }
    });
    if (!memberToDelete) {
      return res.status(404).json({ error: "Membership not found" });
    }

    if (memberToDelete.userId === req.user.id) {
      return res.status(400).json({ error: "Cannot remove yourself from the workspace" });
    }

    await prisma.membership.delete({
      where: { id: membershipId }
    });

    return res.json({ success: true, deletedMembershipId: membershipId });
  } catch (err) {
    console.error("Error removing member:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ==========================================
// 2. WORKSPACE ROLES
// ==========================================

export async function listRoles(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const requiredPerms = [
      { name: "posts:create", description: "Create and draft new social posts and schedules" },
      { name: "posts:publish", description: "Publish posts directly to connected social accounts" },
      { name: "posts:delete", description: "Delete drafted or published posts" },
      { name: "social:connect", description: "Link and authorize social profiles to workspace" },
      { name: "social:disconnect", description: "Remove linked social profiles from workspace" },
      { name: "members:invite", description: "Invite new team members to workspace" },
      { name: "members:remove", description: "Remove existing team members or modify roles" },
      { name: "settings:manage", description: "Modify workspace name, branding palette, and timezone" },
      { name: "billing:manage", description: "View workspace subscription, invoices, and upgrade plans" },
      { name: "manage:automation", description: "Manage campaign automation, schedules, and queues" },
      { name: "manage:seo", description: "Access SEO search ranking and audit tools" },
      { name: "manage:ai_studio", description: "Access AI Content Studio draft generator" },
      { name: "manage:leads", description: "Manage leads pipeline, deals, and SRM" },
      { name: "manage:reports", description: "Access analytics reports and performance metrics" },
      { name: "manage:integrations", description: "Connect third-party analytics and data tools" },
      { name: "manage:social_media", description: "Manage connected profiles and calendar view" },
      { name: "manage:content_assets", description: "Manage categories, templates, and files assets" }
    ];

    for (const perm of requiredPerms) {
      await prisma.workspacePermission.upsert({
        where: { name: perm.name },
        update: { description: perm.description },
        create: perm
      });
    }
    const permissions = await prisma.workspacePermission.findMany();

    let roles = await prisma.workspaceRole.findMany({
      where: { workspaceId },
      include: {
        permissions: { include: { permission: true } }
      }
    });

    if (roles.length === 0) {
      const permMap = permissions.reduce((acc, perm) => {
        acc[perm.name] = perm.id;
        return acc;
      }, {});

      const ownerRole = await prisma.workspaceRole.create({
        data: { workspaceId, name: "OWNER", description: "Full workspace ownership and billing authority", isSystemTemplate: true }
      });
      const adminRole = await prisma.workspaceRole.create({
        data: { workspaceId, name: "ADMIN", description: "Full workspace configuration and member management", isSystemTemplate: true }
      });
      const managerRole = await prisma.workspaceRole.create({
        data: { workspaceId, name: "MANAGER", description: "Manage campaigns, draft posts, and review reports", isSystemTemplate: true }
      });
      const creatorRole = await prisma.workspaceRole.create({
        data: { workspaceId, name: "CONTENT_CREATOR", description: "Draft, schedule, and design social content posts", isSystemTemplate: true }
      });
      const viewerRole = await prisma.workspaceRole.create({
        data: { workspaceId, name: "VIEWER", description: "Read-only access to drafts, calendar, and metrics", isSystemTemplate: true }
      });

      const allPerms = Object.values(permMap);
      const nonBillingPerms = allPerms.filter(id => id !== permMap["billing:manage"]);
      const creatorPerms = [permMap["posts:create"], permMap["posts:publish"]].filter(Boolean);

      if (allPerms.length > 0) {
        await prisma.workspaceRolePermission.createMany({
          data: [
            ...allPerms.map(id => ({ roleId: ownerRole.id, permissionId: id })),
            ...allPerms.map(id => ({ roleId: adminRole.id, permissionId: id }))
          ]
        });
      }

      if (nonBillingPerms.length > 0) {
        await prisma.workspaceRolePermission.createMany({
          data: nonBillingPerms.map(id => ({ roleId: managerRole.id, permissionId: id }))
        });
      }

      if (creatorPerms.length > 0) {
        await prisma.workspaceRolePermission.createMany({
          data: creatorPerms.map(id => ({ roleId: creatorRole.id, permissionId: id }))
        });
      }

      const allMembers = await prisma.membership.findMany({ where: { workspaceId } });
      for (const m of allMembers) {
        let targetRole = viewerRole;
        if (m.role === "OWNER") targetRole = ownerRole;
        else if (m.role === "ADMIN") targetRole = adminRole;
        else if (m.role === "MANAGER") targetRole = managerRole;
        else if (m.role === "CONTENT_CREATOR") targetRole = creatorRole;

        await prisma.membershipRole.upsert({
          where: {
            membershipId_roleId: { membershipId: m.id, roleId: targetRole.id }
          },
          update: {},
          create: { membershipId: m.id, roleId: targetRole.id }
        });
      }

      roles = await prisma.workspaceRole.findMany({
        where: { workspaceId },
        include: {
          permissions: { include: { permission: true } }
        }
      });
    }

    return res.json({ success: true, roles, permissions });
  } catch (err) {
    console.error("Error fetching workspace roles:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createOrUpdateRole(req, res) {
  const { workspaceId } = req.params;
  const { name, description, permissionIds = [], roleId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Role name is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { 
        userId: req.user.id, 
        workspaceId,
        role: { in: ["OWNER", "ADMIN"] }
      }
    });
    if (!membership) {
      return res.status(403).json({ error: "Only admins and owners can manage roles" });
    }

    let role;

    if (roleId) {
      role = await prisma.workspaceRole.findFirst({
        where: { id: roleId, workspaceId }
      });
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      if (role.isSystemTemplate) {
        role = await prisma.workspaceRole.update({
          where: { id: roleId },
          data: { description }
        });
      } else {
        role = await prisma.workspaceRole.update({
          where: { id: roleId },
          data: { name, description }
        });
      }

      await prisma.workspaceRolePermission.deleteMany({
        where: { roleId }
      });
    } else {
      role = await prisma.workspaceRole.create({
        data: {
          workspaceId,
          name,
          description,
          isSystemTemplate: false
        }
      });
    }

    if (permissionIds.length > 0) {
      await prisma.workspaceRolePermission.createMany({
        data: permissionIds.map(permId => ({
          roleId: role.id,
          permissionId: permId
        }))
      });
    }

    const updatedRole = await prisma.workspaceRole.findUnique({
      where: { id: role.id },
      include: {
        permissions: {
          include: { permission: true }
        }
      }
    });

    return res.json({ success: true, role: updatedRole });
  } catch (err) {
    console.error("Error creating/updating role:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function deleteRole(req, res) {
  const { workspaceId } = req.params;
  const { roleId } = req.body;

  if (!roleId) {
    return res.status(400).json({ error: "Role ID is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { 
        userId: req.user.id, 
        workspaceId,
        role: { in: ["OWNER", "ADMIN"] }
      }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const role = await prisma.workspaceRole.findFirst({
      where: { id: roleId, workspaceId }
    });

    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }
    if (role.isSystemTemplate) {
      return res.status(400).json({ error: "Cannot delete system template roles" });
    }

    await prisma.workspaceRole.delete({
      where: { id: roleId }
    });

    return res.json({ success: true, deletedRoleId: roleId });
  } catch (err) {
    console.error("Error deleting role:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
