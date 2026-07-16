import { prisma } from '../config/db.js';

// Helper to mask sensitive keys
function maskKey(key) {
  if (!key || key.includes('placeholder-')) return key || '';
  if (key.length <= 8) return '********';
  return `${key.slice(0, 4)}****************${key.slice(-4)}`;
}

/**
 * GET /api/admin/stats
 */
export async function getStats(req, res) {
  try {
    const [
      totalUsers,
      totalWorkspaces,
      activeSubscriptions,
      bannedUsers,
      suspendedWorkspaces
    ] = await Promise.all([
      prisma.user.count(),
      prisma.workspace.count(),
      prisma.subscription.count({
        where: { status: { in: ["ACTIVE", "TRIAL"] } }
      }),
      prisma.user.count({
        where: { status: { in: ["SUSPENDED", "BANNED"] } }
      }),
      prisma.workspace.count({
        where: { status: { in: ["SUSPENDED", "DEACTIVE"] } }
      })
    ]);

    // Fetch recent users
    const recentUsers = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        status: true
      }
    });

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalWorkspaces,
        activeSubscriptions,
        bannedUsers,
        suspendedWorkspaces
      },
      recentUsers
    });
  } catch (err) {
    console.error("Error fetching admin stats:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /api/admin/users
 */
export async function getUsers(req, res) {
  try {
    const users = await prisma.user.findMany({
      include: {
        memberships: {
          select: {
            workspace: {
              select: { name: true }
            }
          }
        },
        systemRoles: {
          include: { role: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, users });
  } catch (err) {
    console.error("Error listing admin users:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * PUT /api/admin/users
 */
export async function updateUserStatus(req, res) {
  const { userId, status, statusReason } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ error: "User ID and Status are required" });
  }

  try {
    // Prevent self-ban
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot block or ban yourself" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status,
        statusReason: statusReason || null,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: req.user.email
      }
    });

    return res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("Error updating user status:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /api/admin/workspaces
 */
export async function getWorkspaces(req, res) {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        owner: {
          select: { name: true, email: true }
        },
        memberships: {
          select: { id: true }
        },
        socialProfiles: {
          select: { id: true, platform: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, workspaces });
  } catch (err) {
    console.error("Error listing admin workspaces:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * PUT /api/admin/workspaces
 */
export async function updateWorkspaceStatus(req, res) {
  const { workspaceId, status, statusReason } = req.body;

  if (!workspaceId || !status) {
    return res.status(400).json({ error: "Workspace ID and Status are required" });
  }

  try {
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status,
        statusReason: statusReason || null,
        statusUpdatedAt: new Date(),
        statusUpdatedBy: req.user.email
      }
    });

    return res.json({ success: true, workspace: updatedWorkspace });
  } catch (err) {
    console.error("Error updating workspace status:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /api/admin/plans
 */
export async function getAdminPlans(req, res) {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' }
    });
    return res.json({ success: true, plans });
  } catch (error) {
    console.error("Failed to fetch admin plans:", error);
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
}

/**
 * PUT /api/admin/plans
 */
export async function updatePlan(req, res) {
  try {
    const { id, name, price, ...updateFields } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Plan ID is required" });
    }

    const parsedPrice = price !== undefined ? parseFloat(price) : undefined;

    const updatedPlan = await prisma.plan.update({
      where: { id },
      data: {
        ...(parsedPrice !== undefined && { price: parsedPrice }),
        ...updateFields
      }
    });

    return res.json({
      success: true,
      message: `Plan "${updatedPlan.name}" updated successfully`,
      plan: updatedPlan
    });
  } catch (error) {
    console.error("Failed to update plan:", error);
    return res.status(500).json({ error: "Failed to update plan" });
  }
}

/**
 * POST /api/admin/plans
 */
export async function createPlan(req, res) {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Plan name is required" });
    }

    const formattedName = name.trim().toUpperCase();

    // Check if plan already exists
    const existing = await prisma.plan.findUnique({
      where: { name: formattedName }
    });

    if (existing) {
      return res.status(400).json({ error: `Plan with name "${formattedName}" already exists.` });
    }

    const newPlan = await prisma.plan.create({
      data: {
        name: formattedName,
        price: 0,
        currency: "INR",
        maxWorkspaces: 1,
        monthlyAiCredits: 500,
        maxSocialProfiles: 5,
        isActive: false,
        features: {
          socialProfiles: 3,
          scheduledPosts: 10,
          autoReplies: 10,
          teamMembers: 1,
          analytics: "basic",
          support: "email"
        }
      }
    });

    return res.json({
      success: true,
      message: `Plan "${formattedName}" created successfully as draft.`,
      plan: newPlan
    });
  } catch (error) {
    console.error("Failed to create new plan:", error);
    return res.status(500).json({ error: "Failed to create new plan" });
  }
}

/**
 * DELETE /api/admin/plans
 */
export async function deletePlan(req, res) {
  try {
    const id = req.query.id || req.body.id;

    if (!id) {
      return res.status(400).json({ error: "Plan ID is required" });
    }

    const plan = await prisma.plan.findUnique({
      where: { id }
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    await prisma.plan.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: `Plan "${plan.name}" deleted successfully`
    });
  } catch (error) {
    console.error("Failed to delete plan:", error);
    return res.status(500).json({ 
      error: "Failed to delete plan. Please ensure no active user subscriptions are linked to this plan." 
    });
  }
}

/**
 * GET /api/admin/ai-configs
 */
export async function getAiConfigs(req, res) {
  try {
    const configs = await prisma.aIConfig.findMany({
      orderBy: { provider: 'asc' }
    });

    const safeConfigs = configs.map(cfg => ({
      ...cfg,
      apiKey: maskKey(cfg.apiKey)
    }));

    return res.json({ success: true, configs: safeConfigs });
  } catch (error) {
    console.error("Failed to fetch AI configs:", error);
    return res.status(500).json({ error: "Failed to fetch AI configurations" });
  }
}

/**
 * PUT /api/admin/ai-configs
 */
export async function updateAiConfig(req, res) {
  try {
    const { provider, apiKey, baseUrl, defaultModel, settings, isActive } = req.body;

    if (!provider) {
      return res.status(400).json({ error: "Provider name is required" });
    }

    const updateData = {};
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (defaultModel !== undefined) updateData.defaultModel = defaultModel;
    if (settings !== undefined) updateData.settings = settings;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (apiKey && !apiKey.includes('*******')) {
      updateData.apiKey = apiKey;
    }

    const updatedConfig = await prisma.aIConfig.update({
      where: { provider },
      data: updateData
    });

    return res.json({ 
      success: true, 
      message: `${provider} configuration updated successfully`,
      config: {
        ...updatedConfig,
        apiKey: maskKey(updatedConfig.apiKey)
      }
    });
  } catch (error) {
    console.error("Failed to update AI config:", error);
    return res.status(500).json({ error: "Failed to update AI configuration" });
  }
}
