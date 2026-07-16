import { prisma } from '../../config/db.js';
import { redisConnection } from '../../config/redis.js';

// ==========================================
// 1. COMMENTS
// ==========================================

export async function listComments(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const comments = await prisma.comment.findMany({
      where: {
        post: { workspaceId }
      },
      include: { post: true },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ success: true, data: comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function replyComment(req, res) {
  const { workspaceId } = req.params;
  const { commentId, replied } = req.body;

  if (!commentId) {
    return res.status(400).json({ error: "Comment ID is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { replied: replied !== undefined ? replied : true }
    });

    return res.json({ success: true, comment: updated });
  } catch (error) {
    console.error("Error replying to comment:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================
// 2. NOTIFICATIONS
// ==========================================

export async function listNotifications(req, res) {
  const { workspaceId } = req.params;
  const cacheKey = `notifications:${workspaceId}`;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    // Try reading from Redis cache first
    if (redisConnection && redisConnection.status === 'ready') {
      try {
        const cached = await redisConnection.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch (err) {
        console.warn("⚠️ Redis get notifications failed:", err.message);
      }
    }

    let notifications = await prisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    if (notifications.length === 0) {
      const mockNotifications = [
        {
          workspaceId,
          title: "Welcome to Growthly! 🎉",
          message: "Connect your social profiles in settings to start scheduling content automated by Gemini and Flux models.",
          type: "success",
          read: false
        },
        {
          workspaceId,
          title: "SaaS Billing trial active ⚡",
          message: "You are on a 14-day free trial limit. Manage subscriptions under Billing.",
          type: "info",
          read: false
        },
        {
          workspaceId,
          title: "Facebook Ads Sync 📈",
          message: "Meta Ads campaign accounts are connected and ready to sync settings inside Ad Manager.",
          type: "info",
          read: false
        }
      ];

      await prisma.notification.createMany({ data: mockNotifications });
      notifications = await prisma.notification.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" }
      });
    }

    // Save to Redis cache for 5 minutes (300 seconds)
    if (redisConnection && redisConnection.status === 'ready' && notifications) {
      try {
        await redisConnection.setex(cacheKey, 300, JSON.stringify(notifications));
      } catch (err) {
        console.warn("⚠️ Redis set notifications failed:", err.message);
      }
    }

    return res.json(notifications);
  } catch (error) {
    console.error("Notifications GET error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateNotifications(req, res) {
  const { workspaceId } = req.params;
  const { clearAll, markAllRead, notificationId, read } = req.body;
  const cacheKey = `notifications:${workspaceId}`;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    // Invalidate Redis cache on changes
    if (redisConnection && redisConnection.status === 'ready') {
      try {
        await redisConnection.del(cacheKey);
      } catch (err) {
        console.warn("⚠️ Redis del notifications failed:", err.message);
      }
    }

    if (clearAll) {
      await prisma.notification.deleteMany({ where: { workspaceId } });
      return res.json({ success: true, message: "All notifications cleared" });
    }

    if (markAllRead) {
      await prisma.notification.updateMany({
        where: { workspaceId, read: false },
        data: { read: true }
      });
      return res.json({ success: true, message: "All notifications marked as read" });
    }

    if (notificationId) {
      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { read: read !== undefined ? read : true }
      });
      return res.json(updated);
    }

    return res.status(400).json({ error: "Invalid action parameters" });
  } catch (error) {
    console.error("Notifications PUT error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createNotification(req, res) {
  const { workspaceId } = req.params;
  const { title, message, type, link } = req.body;
  const cacheKey = `notifications:${workspaceId}`;

  try {
    const created = await prisma.notification.create({
      data: {
        workspaceId,
        title,
        message,
        type: type || "info",
        read: false,
        link: link || null
      }
    });

    // Invalidate Redis cache on new notification
    if (redisConnection && redisConnection.status === 'ready') {
      try {
        await redisConnection.del(cacheKey);
      } catch (err) {
        console.warn("⚠️ Redis del notifications failed:", err.message);
      }
    }

    return res.json(created);
  } catch (error) {
    console.error("Notifications POST error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================
// 3. GLOBAL TEMPLATES
// ==========================================

export async function listGlobalTemplates(req, res) {
  try {
    const templates = await prisma.globalTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    });
    return res.json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching global templates:', error);
    return res.status(500).json({ error: 'Failed to fetch global templates' });
  }
}
