import { prisma } from '../../config/db.js';
import { decrypt } from '../../utils/crypto.js';
import { scrapeWebsite } from '../../services/scraper-service.js';
import { analyzeBrandData } from '../../services/brand-analyzer.js';
import { 
  createWorkspaceWithSubscription, 
  createRazorpayOrder, 
  checkRazorpayCredentials, 
  getUserWorkspaceLimits, 
  getWorkspaceWithDetails, 
  getWorkspaceStatus, 
  updateBillingDetails, 
  updateCompanyAddress 
} from '../../services/subscription-service.js';
import { hasPermission } from '../../services/rbac.js';
import crypto from 'crypto';

/**
 * POST /api/workspaces
 * Creates a brand workspace.
 */
export async function createWorkspace(req, res) {
  try {
    const { name, description, brandName, industry, website, timezone = "UTC", settings, brandProfile: scrapedProfile } = req.body;

    if (!name || !brandName) {
      return res.status(400).json({ error: "Workspace name and brand name are required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        subscriptions: {
          where: {
            status: {
              in: ['ACTIVE', 'TRIAL']
            }
          },
          include: {
            plan: true,
            workspaces: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const activeSubscription = user.subscriptions[0];
    if (!activeSubscription) {
      return res.status(400).json({ error: "No active subscription found. Please subscribe to a plan first." });
    }

    const currentWorkspaceCount = activeSubscription.usedWorkspaces || 0;
    const maxWorkspaces = activeSubscription.plan.maxWorkspaces;

    if (currentWorkspaceCount >= maxWorkspaces) {
      return res.status(400).json({ 
        error: `Workspace limit reached. Your plan allows ${maxWorkspaces} workspace(s). Please upgrade to create more.`,
        limitReached: true,
        currentCount: currentWorkspaceCount,
        maxAllowed: maxWorkspaces
      });
    }

    const baseSlug = brandName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    let slug = baseSlug;
    let counter = 1;

    while (await prisma.workspace.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const workspace = await prisma.workspace.create({
      data: {
        name,
        description,
        slug,
        brandName,
        industry,
        website,
        timezone,
        ownerId: req.user.id,
        subscriptionId: activeSubscription.id,
        settings: settings || {
          notifications: true,
          autoSave: true,
          theme: 'light'
        }
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, image: true }
        },
        subscription: {
          include: { plan: true }
        }
      }
    });

    const brandSettings = settings || {};
    await prisma.brandProfile.create({
      data: {
        workspaceId: workspace.id,
        brandName: brandName || name,
        description: scrapedProfile?.description || description || brandSettings.brandDescription || '',
        industry: industry || '',
        targetAudience: scrapedProfile?.targetAudience || brandSettings.targetAudience || 'General Public',
        brandTone: scrapedProfile?.brandTone || brandSettings.brandTone || 'professional',
        tagline: scrapedProfile?.tagline || '',
        brandColors: scrapedProfile?.brandColors || {
          primary: brandSettings.brandColor || '#7c3aed',
          secondary: brandSettings.brandColorSecondary || '#2563eb',
          text: brandSettings.brandColorText || '#1f2937'
        },
        logoUrl: scrapedProfile?.logoUrl || brandSettings.brandLogo || '',
        banners: scrapedProfile?.banners || brandSettings.brandBanners || [],
        marketingPitch: scrapedProfile?.marketingPitch || brandSettings.marketingPitch || '',
        criticalFixes: scrapedProfile?.criticalFixes || brandSettings.criticalFixes || [],
        contacts: scrapedProfile?.contacts || brandSettings.contacts || { emails: [], phones: [] },
        socials: scrapedProfile?.socials || brandSettings.socials || [],
        rawScrapedText: brandSettings.rawText || ''
      }
    });

    await prisma.membership.create({
      data: {
        userId: req.user.id,
        workspaceId: workspace.id,
        role: 'OWNER',
        invitedBy: req.user.id
      }
    });

    await prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        usedWorkspaces: currentWorkspaceCount + 1
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId: workspace.id,
        action: 'WORKSPACE_CREATED',
        resource: 'WORKSPACE',
        resourceId: workspace.id,
        details: {
          workspaceName: workspace.name,
          brandName: workspace.brandName,
          subscriptionPlan: activeSubscription.plan.name
        }
      }
    });

    return res.json({
      success: true,
      workspace,
      subscription: activeSubscription,
      workspaceLimits: {
        current: currentWorkspaceCount + 1,
        max: maxWorkspaces,
        remaining: maxWorkspaces - (currentWorkspaceCount + 1)
      }
    });

  } catch (error) {
    console.error("Error creating workspace:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * GET /api/workspaces
 * Lists workspaces for the logged-in user with pagination and search.
 */
export async function listWorkspaces(req, res) {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const where = {
      OR: [
        { ownerId: userId },
        { 
          memberships: {
            some: {
              userId: userId
            }
          }
        }
      ]
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { brandName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
          ]
        }
      ];
    }

    const [workspaces, totalCount] = await Promise.all([
      prisma.workspace.findMany({
        where,
        include: {
          owner: {
            select: { id: true, name: true, email: true, image: true }
          },
          subscription: {
            include: { plan: true }
          },
          memberships: {
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
          },
          socialProfiles: {
            select: {
              id: true,
              platform: true,
              name: true,
              username: true,
              isConnected: true,
              followersCount: true
            }
          },
          _count: {
            select: {
              posts: true,
              tasks: true,
              socialProfiles: true,
              memberships: true
            }
          },
          brandProfile: {
            select: {
              logoUrl: true,
              brandColors: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.workspace.count({ where })
    ]);

    const workspacesWithUserRole = workspaces.map(workspace => {
      const userMembership = workspace.memberships.find(m => m.userId === userId);
      const mergedSettings = {
        ...(workspace.settings || {}),
        logoUrl: (workspace.settings?.logoUrl) || workspace.brandProfile?.logoUrl || ''
      };

      const permissionNames = new Set();
      const isOwnerOrSuper = userMembership?.role === "OWNER" || workspace.ownerId === userId;

      if (isOwnerOrSuper) {
        permissionNames.add("ALL");
      } else if (userMembership) {
        if (userMembership.memberRoles) {
          for (const mr of userMembership.memberRoles) {
            if (mr.role?.permissions) {
              for (const rp of mr.role.permissions) {
                if (rp.permission?.name) {
                  permissionNames.add(rp.permission.name);
                }
              }
            }
          }
        }
        if (userMembership.directPermissions) {
          for (const dp of userMembership.directPermissions) {
            if (dp.permission?.name) {
              if (dp.allowed) {
                permissionNames.add(dp.permission.name);
              } else {
                permissionNames.delete(dp.permission.name);
              }
            }
          }
        }
      }

      const resolvedPermissions = Array.from(permissionNames);

      return {
        ...workspace,
        settings: mergedSettings,
        userRole: userMembership?.role || 'MEMBER',
        isOwner: isOwnerOrSuper,
        permissions: resolvedPermissions
      };
    });

    return res.json({
      success: true,
      data: workspacesWithUserRole,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
}

/**
 * GET /api/workspaces/:workspaceId
 * Gets specific workspace details.
 */
export async function getWorkspaceDetails(req, res) {
  try {
    const { workspaceId } = req.params;

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const workspace = await getWorkspaceWithDetails(workspaceId, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    return res.json({
      success: true,
      workspace
    });
  } catch (error) {
    console.error("Error fetching workspace details:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/workspaces/:workspaceId
 * Updates workspace properties.
 */
export async function updateWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;
    const updateData = req.body;

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData
    });

    return res.json({
      success: true,
      workspace: updatedWorkspace,
      message: "Workspace updated successfully"
    });
  } catch (error) {
    console.error("Error updating workspace:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * DELETE /api/workspaces/:workspaceId
 * Deletes workspace and dependencies.
 */
export async function deleteWorkspace(req, res) {
  try {
    const { workspaceId } = req.params;

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: "OWNER"
      }
    });

    if (!membership) {
      return res.status(403).json({ 
        error: "Workspace not found or access denied. Only the Owner can delete this workspace." 
      });
    }

    const userMemberships = await prisma.membership.findMany({
      where: {
        userId: req.user.id
      }
    });

    if (userMemberships.length <= 1) {
      return res.status(400).json({ 
        error: "You cannot delete your only workspace. You must have at least one active workspace." 
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { workspaceId },
        data: { workspaceId: null }
      });

      await tx.aIUsage.updateMany({
        where: { workspaceId },
        data: { workspaceId: null }
      });

      await tx.auditLog.deleteMany({
        where: { workspaceId }
      });

      await tx.workspace.delete({
        where: { id: workspaceId }
      });
    });

    return res.json({
      success: true,
      message: "Workspace deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting workspace:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * PUT /api/workspaces/:workspaceId/company-address
 * Updates workspace company address.
 */
export async function updateWorkspaceAddress(req, res) {
  try {
    const { workspaceId } = req.params;
    const { companyAddress } = req.body;

    if (!companyAddress) {
      return res.status(400).json({ error: "Company address data is required" });
    }

    const requiredFields = ['street', 'city', 'country', 'postalCode'];
    const missingFields = requiredFields.filter(field => !companyAddress[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const updatedWorkspace = await updateCompanyAddress(workspaceId, companyAddress);

    return res.json({
      success: true,
      workspace: updatedWorkspace,
      message: "Company address updated successfully"
    });
  } catch (error) {
    console.error("Error updating company address:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * GET /api/workspaces/:workspaceId/settings
 * Retrieves settings object and brand specifications.
 */
export async function getWorkspaceSettings(req, res) {
  try {
    const { workspaceId } = req.params;

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId
      },
      include: {
        workspace: {
          include: {
            owner: {
              select: { id: true, name: true, email: true, image: true }
            }
          }
        }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const workspace = membership.workspace;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, image: true }
    });

    const brandProfile = await prisma.brandProfile.findUnique({
      where: { workspaceId }
    });

    const workspaceSettings = typeof workspace.settings === 'string'
      ? JSON.parse(workspace.settings)
      : workspace.settings || {};

    let fbWebhookVerifyToken = workspaceSettings.webhookVerifyToken;
    if (!fbWebhookVerifyToken) {
      const fbCredential = await prisma.socialCredential.findFirst({
        where: {
          workspaceId,
          platform: "FACEBOOK"
        }
      });

      if (fbCredential && fbCredential.clientSecret) {
        try {
          const decrypted = decrypt(fbCredential.clientSecret);
          fbWebhookVerifyToken = crypto
            .createHmac("sha256", decrypted)
            .update(workspaceId)
            .digest("hex")
            .substring(0, 32);
        } catch (err) {
          console.error("Failed to decrypt clientSecret for FB webhook verify token:", err);
        }
      }

      if (!fbWebhookVerifyToken) {
        fbWebhookVerifyToken = `postly_vt_${crypto.randomBytes(16).toString("hex")}`;
      }

      workspaceSettings.webhookVerifyToken = fbWebhookVerifyToken;
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { settings: workspaceSettings }
      });
    }

    const formattedContacts = typeof workspaceSettings.contacts === 'object' && workspaceSettings.contacts
      ? [
          ...(workspaceSettings.contacts.emails || []),
          ...(workspaceSettings.contacts.phones || [])
        ].filter(Boolean).join(', ')
      : (workspaceSettings.contacts || "");

    const formattedAddress = typeof workspaceSettings.companyAddress === 'object' && workspaceSettings.companyAddress
      ? [
          workspaceSettings.companyAddress.address,
          workspaceSettings.companyAddress.city,
          workspaceSettings.companyAddress.state,
          workspaceSettings.companyAddress.zipCode
        ].filter(Boolean).join(', ')
      : (workspaceSettings.companyAddress || "");

    const data = {
      user: {
        name: user.name || "",
        email: user.email || "",
        phone: workspaceSettings.userPhone || "+91 98765 43210",
        language: workspaceSettings.language || "English (US)",
        timezone: workspace.timezone || "Asia/Kolkata",
        dateFormat: workspaceSettings.dateFormat || "DD MMM, YYYY",
        timeFormat: workspaceSettings.timeFormat || "12 Hour (AM/PM)",
        currency: workspaceSettings.currency || "USD - US Dollar ($)",
        defaultLandingPage: workspaceSettings.defaultLandingPage || "Dashboard"
      },
      workspace: {
        name: workspace.name || "",
        brandName: workspace.brandName || "",
        slug: workspace.slug || "",
        website: workspace.website || "",
        industry: workspace.industry || "Marketing Agency",
        description: workspace.description || "",
        logoUrl: workspaceSettings.logoUrl || brandProfile?.logoUrl || "",
        tagline: workspaceSettings.tagline || "",
        themeColor: workspaceSettings.themeColor || "#8b5cf6",
        logoColors: workspaceSettings.logoColors || "#8b5cf6",
        targetAudience: workspaceSettings.targetAudience || "",
        brandContext: workspaceSettings.brandContext || "",
        toneSettings: workspaceSettings.toneSettings || ["Friendly", "Creative"],
        companyAddress: formattedAddress,
        contacts: formattedContacts,
        brandEmail: workspaceSettings.brandEmail || ""
      },
      brandProfile: brandProfile ? {
        id: brandProfile.id,
        brandName: brandProfile.brandName || "",
        description: brandProfile.description || "",
        industry: brandProfile.industry || "",
        targetAudience: brandProfile.targetAudience || "",
        brandTone: brandProfile.brandTone || "",
        brandColors: typeof brandProfile.brandColors === 'string'
          ? JSON.parse(brandProfile.brandColors)
          : brandProfile.brandColors || { primary: "", secondary: "", text: "" },
        logoUrl: brandProfile.logoUrl || "",
        banners: Array.isArray(brandProfile.banners) 
          ? brandProfile.banners 
          : (typeof brandProfile.banners === 'string' ? JSON.parse(brandProfile.banners) : brandProfile.banners || []),
        marketingPitch: brandProfile.marketingPitch || "",
        criticalFixes: Array.isArray(brandProfile.criticalFixes) 
          ? brandProfile.criticalFixes 
          : (typeof brandProfile.criticalFixes === 'string' ? JSON.parse(brandProfile.criticalFixes) : brandProfile.criticalFixes || []),
        contacts: typeof brandProfile.contacts === 'string' 
          ? JSON.parse(brandProfile.contacts) 
          : brandProfile.contacts || { emails: [], phones: [] },
        socials: Array.isArray(brandProfile.socials) 
          ? brandProfile.socials 
          : (typeof brandProfile.socials === 'string' ? JSON.parse(brandProfile.socials) : brandProfile.socials || []),
        rawScrapedText: brandProfile.rawScrapedText || ""
      } : null,
      security: {
        twoFactorEnabled: workspaceSettings.twoFactorEnabled ?? true,
        activeSessionsCount: workspaceSettings.activeSessionsCount ?? 3
      },
      quickSettings: {
        defaultCampaignBudget: workspaceSettings.defaultCampaignBudget || "$100.00",
        defaultCampaignDuration: workspaceSettings.defaultCampaignDuration || "7 Days",
        defaultAttributionWindow: workspaceSettings.defaultAttributionWindow || "7 Days Click",
        defaultCountry: workspaceSettings.defaultCountry || "India",
        facebookAdAccountId: workspaceSettings.facebookAdAccountId || ""
      },
      apiSettings: {
        apiKeys: workspaceSettings.apiKeys || [],
        webhooks: workspaceSettings.webhooks || [],
        fbWebhook: {
          callbackUrl: `${req.protocol}://${req.get('host')}/api/webhooks/social?workspaceId=${workspaceId}`,
          verifyToken: fbWebhookVerifyToken
        }
      }
    };

    return res.json({ success: true, data });

  } catch (error) {
    console.error("💥 Settings API - Error fetching settings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/workspaces/:workspaceId/settings
 * Updates user preference properties and brand configurations.
 */
export async function updateWorkspaceSettings(req, res) {
  try {
    const { workspaceId } = req.params;
    const body = req.body;

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      },
      include: {
        workspace: true
      }
    });

    if (!membership) {
      return res.status(403).json({ error: "Only owners and admins can update settings" });
    }

    const workspace = membership.workspace;
    const workspaceSettings = typeof workspace.settings === 'string'
      ? JSON.parse(workspace.settings)
      : workspace.settings || {};

    if (body.user) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          name: body.user.name,
          email: body.user.email
        }
      });
      workspaceSettings.userPhone = body.user.phone;
      workspaceSettings.language = body.user.language;
      workspaceSettings.dateFormat = body.user.dateFormat;
      workspaceSettings.timeFormat = body.user.timeFormat;
      workspaceSettings.currency = body.user.currency;
      workspaceSettings.defaultLandingPage = body.user.defaultLandingPage;
    }

    let updatedWorkspaceFields = {};
    if (body.workspace) {
      if (body.workspace.slug && body.workspace.slug !== workspace.slug) {
        const slugExists = await prisma.workspace.findUnique({
          where: { slug: body.workspace.slug }
        });
        if (slugExists) {
          return res.status(400).json({ error: "Workspace slug must be unique. This slug is already taken." });
        }
        updatedWorkspaceFields.slug = body.workspace.slug;
      }
      
      updatedWorkspaceFields.name = body.workspace.name;
      updatedWorkspaceFields.brandName = body.workspace.name;
      updatedWorkspaceFields.website = body.workspace.website;
      updatedWorkspaceFields.industry = body.workspace.industry;
      updatedWorkspaceFields.description = body.workspace.description;
      
      if (body.user?.timezone) {
        updatedWorkspaceFields.timezone = body.user.timezone;
      }

      if (body.workspace.logoUrl) {
        workspaceSettings.logoUrl = body.workspace.logoUrl;
      }
      workspaceSettings.tagline = body.workspace.tagline || "";
      workspaceSettings.themeColor = body.workspace.themeColor || "#8b5cf6";
      workspaceSettings.logoColors = body.workspace.logoColors || "#8b5cf6";
      workspaceSettings.companyAddress = body.workspace.companyAddress || "";
      workspaceSettings.contacts = body.workspace.contacts || "";
      workspaceSettings.brandEmail = body.workspace.brandEmail || "";
      
      if (body.workspace.targetAudience !== undefined) {
        workspaceSettings.targetAudience = body.workspace.targetAudience;
      }
      if (body.workspace.brandContext !== undefined) {
        workspaceSettings.brandContext = body.workspace.brandContext;
      }
      if (body.workspace.toneSettings !== undefined) {
        workspaceSettings.toneSettings = body.workspace.toneSettings;
      }
    }

    if (body.quickSettings) {
      workspaceSettings.defaultCampaignBudget = body.quickSettings.defaultCampaignBudget;
      workspaceSettings.defaultCampaignDuration = body.quickSettings.defaultCampaignDuration;
      workspaceSettings.defaultAttributionWindow = body.quickSettings.defaultAttributionWindow;
      workspaceSettings.defaultCountry = body.quickSettings.defaultCountry;
      workspaceSettings.facebookAdAccountId = body.quickSettings.facebookAdAccountId;
    }

    if (body.apiSettings) {
      if (body.apiSettings.apiKeys !== undefined) {
        workspaceSettings.apiKeys = body.apiSettings.apiKeys;
      }
      if (body.apiSettings.webhooks !== undefined) {
        workspaceSettings.webhooks = body.apiSettings.webhooks;
      }
      if (body.apiSettings.webhookVerifyToken !== undefined) {
        workspaceSettings.webhookVerifyToken = body.apiSettings.webhookVerifyToken;
      }
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...updatedWorkspaceFields,
        settings: workspaceSettings
      }
    });

    return res.json({
      success: true,
      message: "Settings saved successfully",
      workspace: updatedWorkspace
    });

  } catch (error) {
    console.error("💥 Settings API - Error updating settings:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * GET /api/workspaces/:workspaceId/status
 * Retrieves status payload for workspace subscriptions.
 */
export async function getWorkspaceStatusDetails(req, res) {
  try {
    const { workspaceId } = req.params;

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const workspaceStatus = await getWorkspaceStatus(workspaceId);

    if (!workspaceStatus) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    return res.json({
      success: true,
      workspace: workspaceStatus
    });

  } catch (error) {
    console.error("Error fetching workspace status:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PATCH /api/workspaces/:workspaceId/billing-details
 * Updates workspace billing configuration settings.
 */
export async function updateBillingDetailsController(req, res) {
  try {
    const { workspaceId } = req.params;
    const { billingDetails } = req.body;

    if (!billingDetails) {
      return res.status(400).json({ error: "Billing details data is required" });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const updatedWorkspace = await updateBillingDetails(workspaceId, billingDetails);

    return res.json({
      success: true,
      workspace: updatedWorkspace,
      message: "Billing details updated successfully"
    });

  } catch (error) {
    console.error("Error updating billing details:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

/**
 * GET /api/workspaces/:workspaceId/permissions
 * Retrieves workspace permissions list of the user.
 */
export async function getWorkspacePermissions(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access Denied" });
    }

    const allPermissions = await prisma.workspacePermission.findMany();
    const authorized = [];

    for (const perm of allPermissions) {
      const allowed = await hasPermission(req.user.id, workspaceId, perm.name);
      if (allowed) {
        authorized.push(perm.name);
      }
    }

    return res.json({ success: true, permissions: authorized });
  } catch (err) {
    console.error("Error retrieving user permissions:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * GET /api/workspaces/limits
 * Gets user's workspace limits.
 */
export async function getLimits(req, res) {
  try {
    const limits = await getUserWorkspaceLimits(req.user.id);
    
    if (!limits) {
      return res.status(500).json({ error: "Failed to get workspace limits" });
    }

    return res.json({ limits });
  } catch (error) {
    console.error("Error getting workspace limits:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/workspaces/scrape
 * Crawls and Scrapes website.
 */
export async function scrapeBrand(req, res) {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Website or brand URL is required" });
    }

    const scrapeData = await scrapeWebsite(url);
    const analysisResult = await analyzeBrandData(scrapeData);

    return res.json({
      success: true,
      url: scrapeData.url,
      scraped: {
        title: scrapeData.title,
        description: scrapeData.description,
        logoUrl: scrapeData.logoUrl,
        banners: scrapeData.banners,
        contacts: scrapeData.contacts,
        socials: scrapeData.socials
      },
      brand: analysisResult.analysis,
      performanceMetrics: scrapeData.performanceMetrics
    });

  } catch (error) {
    console.error("💥 Website scrape endpoint error:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze website details" });
  }
}

/**
 * POST /api/workspaces/onboarding
 * Handles workspace creation + subscription initiation onboarding transaction.
 */
export async function onboarding(req, res) {
  try {
    const { planId, workspaceData, billingDetails, companyAddress } = req.body;

    if (!planId) {
      return res.status(400).json({ error: "Plan ID is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId }
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    if (plan.price > 0) {
      const credentialsCheck = await checkRazorpayCredentials();
      if (!credentialsCheck.valid) {
        return res.status(503).json({ error: "Payment system is currently unavailable. Please try again later." });
      }
    }

    let order = null;
    if (plan.price > 0) {
      order = await createRazorpayOrder(planId, req.user.id);
    }

    const result = await createWorkspaceWithSubscription({
      userId: req.user.id,
      userEmail: req.user.email,
      userName: req.user.name,
      userType: user.userType,
      planId,
      workspaceData,
      billingDetails,
      companyAddress,
      paymentData: order ? { razorpayOrderId: order.id } : null
    });

    return res.json({
      workspace: result.workspace,
      subscription: result.subscription,
      workspaceLimits: result.workspaceCheck,
      order,
      billingDetails: result.workspace.billingDetails,
      companyAddress: result.workspace.companyAddress
    });

  } catch (error) {
    console.error("Error creating workspace onboarding:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
