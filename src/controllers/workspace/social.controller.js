import { prisma } from '../../config/db.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { AutopilotService } from '../../services/autopilot-service.js';
import crypto from 'crypto';

// ==========================================
// 1. SOCIAL PROFILES
// ==========================================

export async function listProfiles(req, res) {
  const { workspaceId } = req.params;
  const connected = req.query.connected;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const where = { workspaceId };
    if (connected !== undefined) {
      where.isConnected = connected === 'true';
    }

    const socialProfiles = await prisma.socialProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    const dataWithStats = await Promise.all(
      socialProfiles.map(async (profile) => {
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const prev30Days = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        const currentStats = await prisma.socialAnalytics.aggregate({
          where: {
            socialProfileId: profile.id,
            date: { gte: last30Days }
          },
          _sum: {
            impressions: true,
            engagements: true,
            likes: true,
            comments: true,
            shares: true,
            followers: true,
            reach: true
          }
        });

        const previousStats = await prisma.socialAnalytics.aggregate({
          where: {
            socialProfileId: profile.id,
            date: { gte: prev30Days, lt: last30Days }
          },
          _sum: {
            impressions: true,
            engagements: true,
            followers: true
          }
        });

        const postsCount = await prisma.post.count({
          where: {
            socialProfileId: profile.id,
            status: 'POSTED'
          }
        });

        const curImp = currentStats._sum.impressions || 0;
        const prevImp = previousStats._sum.impressions || 0;
        const curEng = currentStats._sum.engagements || 0;
        const prevEng = previousStats._sum.engagements || 0;
        
        const curFoll = profile.followersCount || currentStats._sum.followers || 0;
        const prevFoll = previousStats._sum.followers || 0;

        const calcTrend = (cur, prev) => {
          if (!prev || prev === 0) return "10.0%";
          const diff = ((cur - prev) / prev) * 100;
          return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
        };

        const impTrend = calcTrend(curImp, prevImp);
        const engTrend = calcTrend(curEng, prevEng);
        const follTrend = calcTrend(curFoll, prevFoll);

        const activeEngRate = curImp > 0 ? (curEng / curImp) * 100 : 5.0;

        return {
          ...profile,
          stats: {
            followers: curFoll,
            followersTrend: follTrend,
            engagementRate: parseFloat(activeEngRate.toFixed(2)),
            engagementTrend: engTrend,
            impressions: curImp,
            impressionsTrend: impTrend,
            reach: currentStats._sum.reach || 0,
            likes: currentStats._sum.likes || 0,
            comments: currentStats._sum.comments || 0,
            shares: currentStats._sum.shares || 0,
            postsCount
          }
        };
      })
    );

    return res.json({ success: true, data: dataWithStats });
  } catch (error) {
    console.error("Error fetching social profiles:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function disconnectProfile(req, res) {
  const { workspaceId } = req.params;
  const { profileId } = req.query;

  if (!profileId) {
    return res.status(400).json({ error: "Profile ID is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    await prisma.socialProfile.delete({
      where: { id: profileId, workspaceId }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'SOCIAL_PROFILE_DELETED',
        resource: 'SOCIAL_PROFILE',
        resourceId: profileId,
        details: { profileId }
      }
    });

    return res.json({ success: true, message: "Social profile disconnected successfully" });
  } catch (error) {
    console.error("Error deleting social profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateProfileSettings(req, res) {
  const { workspaceId, profileId } = req.params;
  const { autoPost, autoRespond } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const updateData = {};
    if (autoPost !== undefined) updateData.autoPost = autoPost;
    if (autoRespond !== undefined) updateData.autoRespond = autoRespond;

    const updated = await prisma.socialProfile.update({
      where: { id: profileId, workspaceId },
      data: updateData
    });

    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating social profile settings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================
// 2. SOCIAL CREDENTIALS (DEVELOPER KEYS)
// ==========================================

export async function listCredentials(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const credentials = await prisma.socialCredential.findMany({
      where: { workspaceId }
    });

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });
    const workspaceSettings = workspace && typeof workspace.settings === 'string'
      ? JSON.parse(workspace.settings)
      : workspace?.settings || {};
    
    const customVerifyToken = workspaceSettings.webhookVerifyToken;

    const safeCredentials = credentials.map(c => {
      let webhookVerifyToken = customVerifyToken;
      if (!webhookVerifyToken && c.platform === "FACEBOOK" && c.clientSecret) {
        try {
          const decrypted = decrypt(c.clientSecret);
          webhookVerifyToken = crypto
            .createHmac("sha256", decrypted)
            .update(workspaceId)
            .digest("hex")
            .substring(0, 32);
        } catch (err) {
          console.error("Failed to decrypt clientSecret to generate verify token:", err);
        }
      }
      return {
        id: c.id,
        platform: c.platform,
        clientId: c.clientId,
        clientSecretMasked: c.clientSecret ? "••••••••••••••••" : "",
        webhookVerifyToken
      };
    });

    return res.json({ success: true, data: safeCredentials });
  } catch (error) {
    console.error("Error fetching credentials:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function saveCredentials(req, res) {
  const { workspaceId } = req.params;
  const { platform, clientId, clientSecret } = req.body;

  if (!platform || !clientId || !clientSecret) {
    return res.status(400).json({ error: "Platform, Client ID, and Client Secret are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: "Only workspace owners or admins can configure developer credentials" });
    }

    const encryptedSecret = encrypt(clientSecret);

    const credential = await prisma.socialCredential.upsert({
      where: {
        workspaceId_platform: { workspaceId, platform }
      },
      update: {
        clientId,
        clientSecret: encryptedSecret
      },
      create: {
        workspaceId,
        platform,
        clientId,
        clientSecret: encryptedSecret
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'SOCIAL_CREDENTIALS_UPDATED',
        resource: 'SOCIAL_CREDENTIAL',
        resourceId: credential.id,
        details: { platform, clientId }
      }
    });

    return res.json({
      success: true,
      message: `${platform} credentials saved successfully`,
      data: {
        id: credential.id,
        platform: credential.platform,
        clientId: credential.clientId,
        clientSecretMasked: "••••••••••••••••"
      }
    });
  } catch (error) {
    console.error("Error saving credentials:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteCredentials(req, res) {
  const { workspaceId } = req.params;
  const { platform } = req.query;

  if (!platform) {
    return res.status(400).json({ error: "Platform parameter is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: "Only workspace owners or admins can remove developer credentials" });
    }

    await prisma.socialCredential.delete({
      where: {
        workspaceId_platform: { workspaceId, platform }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'SOCIAL_CREDENTIALS_DELETED',
        resource: 'SOCIAL_CREDENTIAL',
        details: { platform }
      }
    });

    return res.json({
      success: true,
      message: `${platform} credentials deleted successfully`
    });
  } catch (error) {
    console.error("Error deleting credentials:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================
// 3. SOCIAL AUTOPILOT AGENT RUN
// ==========================================

export async function runAutopilot(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    AutopilotService.logs = []; // Clear log buffer
    const stats = await AutopilotService.runAutopilot(workspaceId);

    return res.json({
      success: true,
      message: "Autopilot run completed successfully",
      stats,
      logs: AutopilotService.logs
    });
  } catch (error) {
    console.error("Autopilot execution error:", error);
    return res.status(500).json({ error: error.message || "Autopilot execution failed" });
  }
}
