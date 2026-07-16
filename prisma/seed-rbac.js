const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const SYSTEM_PERMISSIONS = [
  // User Management
  { name: "system:users:read", description: "View registered users, logs and usage data" },
  { name: "system:users:write", description: "Update user profiles, system roles, and access credentials" },
  { name: "system:users:ban", description: "Ban, block, or deactivate user accounts" },
  // Workspace/Brand Management
  { name: "system:workspaces:read", description: "View workspaces, statistics, and connected integrations" },
  { name: "system:workspaces:write", description: "Update workspace names, details, and limits" },
  { name: "system:workspaces:ban", description: "Ban, block, suspend, or deactivate brand workspaces" },
  // Billing & Subscriptions
  { name: "system:billing:read", description: "View transaction histories, invoices, and active plans" },
  { name: "system:billing:write", description: "Generate coupons, adjust plans, and refund payments" },
  // Global Platform Settings
  { name: "system:settings:read", description: "View global site settings, configurations, and logs" },
  { name: "system:settings:write", description: "Manage site maintenance mode, rate limits, and API keys" },
  // AI Metrics
  { name: "system:ai:read", description: "Audit AI consumption logs and prompt usage parameters" },
  { name: "system:ai:write", description: "Update global AI system parameters and balances" }
];

const WORKSPACE_PERMISSIONS = [
  // Posts & Campaigns
  { name: "posts:create", description: "Create and draft new social posts and schedules" },
  { name: "posts:publish", description: "Publish posts directly to connected social accounts" },
  { name: "posts:delete", description: "Delete drafted or published posts" },
  // Social Integrations
  { name: "social:connect", description: "Link and authorize social profiles to workspace" },
  { name: "social:disconnect", description: "Remove linked social profiles from workspace" },
  // Workspace Members
  { name: "members:invite", description: "Invite new team members to workspace" },
  { name: "members:remove", description: "Remove existing team members or modify roles" },
  // General Management
  { name: "settings:manage", description: "Modify workspace name, branding palette, and timezone" },
  { name: "billing:manage", description: "View workspace subscription, invoices, and upgrade plans" }
];

async function main() {
  console.log("🚀 Starting RBAC & PBAC Seeding...");

  // 1. Seed System Permissions
  console.log("⚡ Seeding System Permissions...");
  const dbSysPermissions = {};
  for (const perm of SYSTEM_PERMISSIONS) {
    const created = await prisma.systemPermission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm
    });
    dbSysPermissions[perm.name] = created.id;
  }

  // 2. Seed System Roles & Map Permissions
  console.log("⚡ Seeding System Roles...");
  const superAdminRole = await prisma.systemRole.upsert({
    where: { name: "SUPER_ADMIN" },
    update: { description: "Full system administration capability" },
    create: { name: "SUPER_ADMIN", description: "Full system administration capability" }
  });

  const supportRole = await prisma.systemRole.upsert({
    where: { name: "SUPPORT" },
    update: { description: "Manage users, support tickets, and view logs" },
    create: { name: "SUPPORT", description: "Manage users, support tickets, and view logs" }
  });

  const billingRole = await prisma.systemRole.upsert({
    where: { name: "BILLING_MANAGER" },
    update: { description: "Manage transactions, invoices, and platform subscriptions" },
    create: { name: "BILLING_MANAGER", description: "Manage transactions, invoices, and platform subscriptions" }
  });

  // Link permissions to roles
  console.log("⚡ Mapping System Role Permissions...");
  // SUPER_ADMIN gets all system permissions
  for (const permId of Object.values(dbSysPermissions)) {
    await prisma.systemRolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: superAdminRole.id, permissionId: permId }
      },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permId }
    });
  }

  // SUPPORT gets read permissions
  const supportPermCodes = ["system:users:read", "system:workspaces:read", "system:settings:read", "system:ai:read"];
  for (const code of supportPermCodes) {
    const permId = dbSysPermissions[code];
    if (permId) {
      await prisma.systemRolePermission.upsert({
        where: { roleId_permissionId: { roleId: supportRole.id, permissionId: permId } },
        update: {},
        create: { roleId: supportRole.id, permissionId: permId }
      });
    }
  }

  // BILLING gets billing permissions
  const billingPermCodes = ["system:billing:read", "system:billing:write", "system:workspaces:read"];
  for (const code of billingPermCodes) {
    const permId = dbSysPermissions[code];
    if (permId) {
      await prisma.systemRolePermission.upsert({
        where: { roleId_permissionId: { roleId: billingRole.id, permissionId: permId } },
        update: {},
        create: { roleId: billingRole.id, permissionId: permId }
      });
    }
  }

  // 3. Promote specified users to SUPER_ADMIN
  const superUsersEmails = ["nabins9678@gmail.com", "nilachalrealtors@gmail.com"];
  console.log(`⚡ Assigning ${superUsersEmails.join(", ")} to SUPER_ADMIN role...`);
  for (const email of superUsersEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.userSystemRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: superAdminRole.id }
        },
        update: {},
        create: { userId: user.id, roleId: superAdminRole.id }
      });
      console.log(`✅ User ${email} promoted to SUPER_ADMIN successfully!`);
    } else {
      console.warn(`⚠️ User with email ${email} not found. Skipping...`);
    }
  }

  // 4. Seed Workspace Permissions
  console.log("⚡ Seeding Workspace Permissions...");
  const dbWsPermissions = {};
  for (const perm of WORKSPACE_PERMISSIONS) {
    const created = await prisma.workspacePermission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm
    });
    dbWsPermissions[perm.name] = created.id;
  }

  // 5. Migrate Existing Workspaces to use RBAC tables
  console.log("⚡ Initializing roles/permissions templates for all existing workspaces...");
  const workspaces = await prisma.workspace.findMany({
    include: { memberships: true }
  });

  for (const workspace of workspaces) {
    console.log(`📦 Processing workspace: "${workspace.name}"`);

    // Create default workspace roles templates
    const ownerRole = await prisma.workspaceRole.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: "OWNER" } },
      update: { isSystemTemplate: true },
      create: { workspaceId: workspace.id, name: "OWNER", description: "Full workspace ownership and billing authority", isSystemTemplate: true }
    });

    const adminRole = await prisma.workspaceRole.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: "ADMIN" } },
      update: { isSystemTemplate: true },
      create: { workspaceId: workspace.id, name: "ADMIN", description: "Full workspace configuration and member management", isSystemTemplate: true }
    });

    const managerRole = await prisma.workspaceRole.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: "MANAGER" } },
      update: { isSystemTemplate: true },
      create: { workspaceId: workspace.id, name: "MANAGER", description: "Manage campaigns, draft posts, and review reports", isSystemTemplate: true }
    });

    const creatorRole = await prisma.workspaceRole.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: "CONTENT_CREATOR" } },
      update: { isSystemTemplate: true },
      create: { workspaceId: workspace.id, name: "CONTENT_CREATOR", description: "Draft, schedule, and design social content posts", isSystemTemplate: true }
    });

    const viewerRole = await prisma.workspaceRole.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: "VIEWER" } },
      update: { isSystemTemplate: true },
      create: { workspaceId: workspace.id, name: "VIEWER", description: "Read-only access to drafts, calendar, and metrics", isSystemTemplate: true }
    });

    // Map permissions to templates
    const allPerms = Object.values(dbWsPermissions);
    const nonBillingPerms = allPerms.filter(id => id !== dbWsPermissions["billing:manage"]);
    const creatorPerms = [dbWsPermissions["posts:create"], dbWsPermissions["posts:publish"]];
    const viewerPerms = []; // Viewer gets read-only access (no actions authorized)

    // OWNER gets all
    for (const permId of allPerms) {
      await prisma.workspaceRolePermission.upsert({
        where: { roleId_permissionId: { roleId: ownerRole.id, permissionId: permId } },
        update: {},
        create: { roleId: ownerRole.id, permissionId: permId }
      });
      await prisma.workspaceRolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permId } },
        update: {},
        create: { roleId: adminRole.id, permissionId: permId }
      });
    }

    // MANAGER gets non-billing
    for (const permId of nonBillingPerms) {
      await prisma.workspaceRolePermission.upsert({
        where: { roleId_permissionId: { roleId: managerRole.id, permissionId: permId } },
        update: {},
        create: { roleId: managerRole.id, permissionId: permId }
      });
    }

    // CREATOR gets creator actions
    for (const permId of creatorPerms) {
      await prisma.workspaceRolePermission.upsert({
        where: { roleId_permissionId: { roleId: creatorRole.id, permissionId: permId } },
        update: {},
        create: { roleId: creatorRole.id, permissionId: permId }
      });
    }

    // Map memberships to roles based on old enum role mapping
    for (const member of workspace.memberships) {
      let targetRole = viewerRole;
      if (member.role === "OWNER" || member.role === "SUPER_ADMIN") targetRole = ownerRole;
      else if (member.role === "ADMIN") targetRole = adminRole;
      else if (member.role === "MANAGER") targetRole = managerRole;
      else if (member.role === "CONTENT_CREATOR") targetRole = creatorRole;
      
      await prisma.membershipRole.upsert({
        where: {
          membershipId_roleId: { membershipId: member.id, roleId: targetRole.id }
        },
        update: {},
        create: { membershipId: member.id, roleId: targetRole.id }
      });
    }
  }

  console.log("🎉 Seeding and migration of roles/permissions completed successfully!");
}

main()
  .catch(e => {
    console.error("💥 Seeding script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
