import { prisma } from '../../config/db.js';
import cloudinary from '../../config/cloudinary.js';
import { getWorkspaceLimitUsage, incrementWorkspaceLimit, decrementWorkspaceLimit } from '../../services/workspace-limit-service.js';
import { SocialMediaService } from '../../services/social-publisher.js';
import { AutomatedContentService } from '../../services/automated-content-service.js';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// 1. ACTIVE POSTS (CALENDAR / SCHEDULE / HISTORY)
// ==========================================

export async function listPosts(req, res) {
  const { workspaceId } = req.params;
  const { status, platform, postType, timeframe, startDate, endDate, search, includeBulkInfo } = req.query;

  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '100');
  const skip = (page - 1) * limit;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const where = { workspaceId };

    if (status && status !== 'ALL') {
      where.status = status;
    } else {
      where.status = { in: ['DRAFT', 'SCHEDULED', 'POSTED', 'PENDING', 'FAILED'] };
    }

    if (platform && platform !== 'ALL') {
      where.socialProfile = { platform };
    }

    if (postType === 'single') {
      where.bulkId = null;
    } else if (postType === 'bulk') {
      where.bulkId = { not: null };
    }

    if (timeframe === 'custom' && startDate) {
      const parseDate = (dateString) => {
        if (!dateString) return null;
        if (dateString.includes('T')) return new Date(dateString);
        const parts = dateString.split('/');
        if (parts.length === 3) {
          const day = parts[0];
          const month = parts[1];
          const year = parts[2];
          return new Date(year, month - 1, day, 0, 0, 0, 0);
        }
        return new Date(dateString);
      };

      const start = parseDate(startDate);
      const end = parseDate(endDate);

      if (!start || isNaN(start.getTime())) {
        return res.status(400).json({ error: "Invalid start date format. Use DD/MM/YYYY or ISO format" });
      }

      where.OR = [
        {
          scheduledFor: {
            gte: start,
            ...(end && { lte: new Date(end.getTime() + 24 * 60 * 60 * 1000) })
          }
        },
        {
          AND: [
            { scheduledFor: null },
            {
              createdAt: {
                gte: start,
                ...(end && { lte: new Date(end.getTime() + 24 * 60 * 60 * 1000) })
              }
            }
          ]
        }
      ];
    }

    if (search) {
      where.OR = [
        { content: { contains: search, mode: "insensitive" } },
        { bulkTitle: { contains: search, mode: "insensitive" } },
        { socialProfile: { name: { contains: search, mode: "insensitive" } } }
      ];
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          socialProfile: {
            select: { id: true, name: true, platform: true, avatar: true, username: true }
          },
          user: {
            select: { name: true, email: true, image: true }
          },
          analytics: {
            select: { likes: true, comments: true, shares: true, clicks: true, impressions: true }
          },
          _count: {
            select: { comments: true, analytics: true }
          }
        },
        orderBy: { scheduledFor: "asc" },
        skip,
        take: limit
      }),
      prisma.post.count({ where })
    ]);

    let bulkGroups = [];
    if (includeBulkInfo === 'true') {
      const bulkPosts = await prisma.post.findMany({
        where: { workspaceId, bulkId: { not: null } },
        select: { bulkId: true, bulkTitle: true, createdAt: true },
        distinct: ["bulkId"]
      });

      bulkGroups = bulkPosts.map((bulk) => ({
        bulkId: bulk.bulkId,
        title: bulk.bulkTitle,
        createdAt: bulk.createdAt
      }));
    }

    return res.json({
      success: true,
      posts,
      bulkGroups: includeBulkInfo === 'true' ? bulkGroups : undefined,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Posts fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch posts: " + error.message });
  }
}

export async function createPost(req, res) {
  const { workspaceId } = req.params;
  const { 
    content, 
    socialProfileId, 
    hashtags, 
    scheduledFor, 
    platform,
    mediaUrls = [],
    mediaFiles = [], 
    aiGenerated = false,
    aiPrompt = '',
    bulkPost = false,
    selectedProfileIds = [],
    bulkTitle = null
  } = req.body;

  if (!content || (!socialProfileId && !bulkPost)) {
    return res.status(400).json({ error: "Content and social profile are required" });
  }

  if (bulkPost && (!selectedProfileIds || selectedProfileIds.length === 0)) {
    return res.status(400).json({ error: "Selected profile IDs are required for bulk posting" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    if (aiGenerated) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { subscription: { include: { plan: true } } }
      });

      let plan = workspace?.subscription?.plan;
      if (!plan) {
        plan = await prisma.plan.findFirst({
          where: { name: { in: ['FREE', 'Free'] } }
        });
      }

      if (plan && plan.maxPostsGenerated !== -1) {
        const usage = await getWorkspaceLimitUsage(workspaceId);
        const currentCount = usage?.postsCount || 0;
        if (currentCount >= plan.maxPostsGenerated) {
          return res.status(403).json({
            error: `Plan Capacity Reached: Your current subscription allows up to ${plan.maxPostsGenerated} AI Generated Posts. Please upgrade your plan to unlock more.`
          });
        }
      }
    }

    let uploadedMediaUrls = [...mediaUrls];
    
    if (mediaFiles && mediaFiles.length > 0) {
      const uploadPromises = mediaFiles.map(async (fileData, index) => {
        const { base64, filename } = fileData;
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const publicId = `post_${workspaceId}_${timestamp}_${randomString}_${index}`;
        
        let cleanBase64 = base64;
        if (base64.startsWith('data:')) {
          const matches = base64.match(/^data:[^;]+;base64,(.+)$/);
          if (matches && matches[1]) {
            cleanBase64 = matches[1];
          }
        }

        const mimeType = filename ? 
          (filename.toLowerCase().endsWith('.png') ? 'image/png' : 
           filename.toLowerCase().endsWith('.gif') ? 'image/gif' : 
           filename.toLowerCase().endsWith('.mp4') || filename.toLowerCase().endsWith('.mov') ? 'video/mp4' : 
           'image/jpeg') : 'image/jpeg';

        const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

        const result = await cloudinary.uploader.upload(dataUrl, {
          folder: `workspace_${workspaceId}/posts`,
          public_id: publicId,
          resource_type: 'auto',
          overwrite: false
        });

        return {
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          originalFilename: filename
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedMediaUrls = [...uploadedMediaUrls, ...uploadedFiles];
    }

    let posts = [];
    let bulkId = null;
    
    if (bulkPost && selectedProfileIds.length > 0) {
      bulkId = uuidv4();
      
      const validProfiles = await prisma.socialProfile.findMany({
        where: { id: { in: selectedProfileIds }, workspaceId }
      });

      if (validProfiles.length !== selectedProfileIds.length) {
        return res.status(400).json({ error: "Some selected profiles are invalid or don't belong to this workspace" });
      }

      const postCreations = validProfiles.map(profile => 
        prisma.post.create({
          data: {
            content,
            hashtags: hashtags || '',
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            status: scheduledFor ? 'SCHEDULED' : 'DRAFT',
            mediaUrls: uploadedMediaUrls,
            aiGenerated,
            aiPrompt: aiPrompt || '',
            platform: profile.platform,
            socialProfileId: profile.id,
            userId: req.user.id,
            workspaceId,
            bulkId,
            bulkTitle: bulkTitle || `Bulk Post - ${new Date().toLocaleDateString()}`
          },
          include: {
            socialProfile: { select: { name: true, platform: true } }
          }
        })
      );

      posts = await Promise.all(postCreations);
      if (aiGenerated) {
        await incrementWorkspaceLimit(workspaceId, 'postsCount', validProfiles.length);
      }
    } else {
      const socialProfile = await prisma.socialProfile.findFirst({
        where: { id: socialProfileId, workspaceId }
      });

      if (!socialProfile) {
        return res.status(400).json({ error: "Invalid social profile or access denied" });
      }

      const post = await prisma.post.create({
        data: {
          content,
          hashtags: hashtags || '',
          scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
          status: scheduledFor ? 'SCHEDULED' : 'DRAFT',
          mediaUrls: uploadedMediaUrls,
          aiGenerated,
          aiPrompt: aiPrompt || '',
          platform: socialProfile.platform,
          socialProfileId,
          userId: req.user.id,
          workspaceId
        },
        include: {
          socialProfile: { select: { name: true, platform: true } }
        }
      });

      if (aiGenerated) {
        await incrementWorkspaceLimit(workspaceId, 'postsCount', 1);
      }

      posts = [post];
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: bulkPost ? 'BULK_POSTS_CREATED' : 'POST_CREATED',
        resource: 'POST',
        details: {
          postCount: posts.length,
          platforms: posts.map(p => p.socialProfile.platform),
          scheduled: !!scheduledFor,
          aiGenerated,
          bulkPost,
          bulkId,
          bulkTitle,
          mediaCount: uploadedMediaUrls.length
        }
      }
    });

    return res.json({
      success: true,
      message: bulkPost 
        ? `Posts created successfully for ${posts.length} profiles` 
        : 'Post created successfully',
      posts,
      count: posts.length,
      bulkId,
      isBulkPost: bulkPost,
      mediaUrls: uploadedMediaUrls
    });

  } catch (error) {
    console.error("Post creation error:", error);
    return res.status(500).json({ error: "Failed to create post", details: error.message });
  }
}

export async function getPostDetails(req, res) {
  const { workspaceId, postId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId, userId: req.user.id },
      include: {
        socialProfile: { select: { id: true, name: true, platform: true, avatar: true, username: true } },
        _count: { select: { comments: true, analytics: true } }
      }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found or access denied" });
    }

    let bulkGroupPosts = [];
    if (post.bulkId) {
      bulkGroupPosts = await prisma.post.findMany({
        where: {
          bulkId: post.bulkId,
          workspaceId,
          userId: req.user.id,
          id: { not: postId }
        },
        include: {
          socialProfile: { select: { name: true, platform: true } }
        },
        orderBy: { platform: 'asc' }
      });
    }

    return res.json({
      success: true,
      post,
      bulkGroup: post.bulkId ? {
        bulkId: post.bulkId,
        bulkTitle: post.bulkTitle,
        totalPosts: bulkGroupPosts.length + 1,
        otherPosts: bulkGroupPosts
      } : null
    });
  } catch (error) {
    console.error('Get post error:', error);
    return res.status(500).json({ error: "Failed to fetch post", details: error.message });
  }
}

export async function updatePost(req, res) {
  const { workspaceId, postId } = req.params;
  const { content, socialProfileId, hashtags, scheduledFor, platform, mediaUrls = [], mediaFiles = [], aiGenerated = false, aiPrompt = '', bulkTitle = null } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingPost = await prisma.post.findFirst({
      where: { id: postId, workspaceId, userId: req.user.id }
    });

    if (!existingPost) {
      return res.status(404).json({ error: "Post not found or access denied" });
    }

    let uploadedMediaUrls = [];
    if (mediaFiles && mediaFiles.length > 0) {
      const uploadPromises = mediaFiles.map(async (fileData, index) => {
        const { base64, filename } = fileData;
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const publicId = `post_${workspaceId}_${timestamp}_${randomString}_${index}`;
        
        let cleanBase64 = base64;
        if (base64.startsWith('data:')) {
          const matches = base64.match(/^data:[^;]+;base64,(.+)$/);
          if (matches && matches[1]) {
            cleanBase64 = matches[1];
          }
        }

        const mimeType = filename ? 
          (filename.toLowerCase().endsWith('.png') ? 'image/png' : 
           filename.toLowerCase().endsWith('.gif') ? 'image/gif' : 
           filename.toLowerCase().endsWith('.mp4') || filename.toLowerCase().endsWith('.mov') ? 'video/mp4' : 
           'image/jpeg') : 'image/jpeg';

        const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

        const result = await cloudinary.uploader.upload(dataUrl, {
          folder: `workspace_${workspaceId}/posts`,
          public_id: publicId,
          resource_type: 'auto',
          overwrite: false
        });

        return {
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          originalFilename: filename
        };
      });

      uploadedMediaUrls = await Promise.all(uploadPromises);
    }

    const allMediaUrls = [...mediaUrls, ...uploadedMediaUrls];

    const updateData = {
      ...(content !== undefined && { content }),
      ...(socialProfileId && { socialProfileId }),
      ...(hashtags !== undefined && { hashtags }),
      ...(scheduledFor !== undefined && { 
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        status: scheduledFor ? 'SCHEDULED' : 'DRAFT'
      }),
      ...(platform && { platform }),
      ...(mediaUrls !== undefined && { mediaUrls: allMediaUrls }),
      ...(aiGenerated !== undefined && { aiGenerated }),
      ...(aiPrompt !== undefined && { aiPrompt }),
      ...(bulkTitle !== undefined && { bulkTitle }),
      updatedAt: new Date()
    };

    const updatedPost = await prisma.post.update({
      where: { id: postId, workspaceId },
      data: updateData,
      include: {
        socialProfile: { select: { name: true, platform: true, avatar: true } },
        _count: { select: { comments: true, analytics: true } }
      }
    });

    if (bulkTitle !== undefined && existingPost.bulkId) {
      await prisma.post.updateMany({
        where: { bulkId: existingPost.bulkId, workspaceId, userId: req.user.id },
        data: { bulkTitle, updatedAt: new Date() }
      });
    }

    return res.json({ 
      success: true, 
      message: 'Post updated successfully',
      post: updatedPost,
      uploadedFiles: uploadedMediaUrls.length
    });

  } catch (error) {
    console.error('Update post error:', error);
    return res.status(500).json({ error: "Failed to update post", details: error.message });
  }
}

export async function deletePost(req, res) {
  const { workspaceId, postId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingPost = await prisma.post.findFirst({
      where: { id: postId, workspaceId, userId: req.user.id }
    });

    if (!existingPost) {
      return res.status(404).json({ error: "Post not found or access denied" });
    }

    if (existingPost.mediaUrls && Array.isArray(existingPost.mediaUrls)) {
      const cloudinaryMedia = existingPost.mediaUrls.filter(media => media.publicId);
      if (cloudinaryMedia.length > 0) {
        try {
          const deletePromises = cloudinaryMedia.map(async (media) => {
            if (media.publicId) {
              await cloudinary.uploader.destroy(media.publicId);
            }
          });
          await Promise.all(deletePromises);
        } catch (deleteError) {
          console.error("Cloudinary delete error:", deleteError);
        }
      }
    }

    let remainingBulkPosts = [];
    if (existingPost.bulkId) {
      remainingBulkPosts = await prisma.post.findMany({
        where: {
          bulkId: existingPost.bulkId,
          workspaceId,
          userId: req.user.id,
          id: { not: postId }
        }
      });
    }

    await prisma.post.delete({ where: { id: postId, workspaceId } });

    return res.json({ 
      success: true,
      message: 'Post deleted successfully',
      wasBulkPost: !!existingPost.bulkId,
      remainingInGroup: remainingBulkPosts.length
    });

  } catch (error) {
    console.error('Delete post error:', error);
    return res.status(500).json({ error: "Failed to delete post", details: error.message });
  }
}

export async function deleteBulkGroup(req, res) {
  const { workspaceId, bulkId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const deletedPosts = await prisma.post.deleteMany({
      where: { workspaceId, bulkId, userId: req.user.id }
    });

    return res.json({
      success: true,
      message: `Deleted ${deletedPosts.count} posts from bulk group`,
      deletedCount: deletedPosts.count
    });
  } catch (error) {
    console.error("Bulk post deletion error:", error);
    return res.status(500).json({ error: "Failed to delete bulk posts" });
  }
}

export async function publishPost(req, res) {
  const { workspaceId, postId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId },
      include: { socialProfile: true }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.status === 'POSTED') {
      return res.status(400).json({ error: "Post already published" });
    }

    await prisma.post.update({
      where: { id: postId },
      data: { status: 'POSTING' }
    });

    try {
      const result = await SocialMediaService.publishPost(post, post.socialProfile);
      
      await prisma.post.update({
        where: { id: postId },
        data: {
          status: 'POSTED',
          postId: result.platformPostId,
          postedAt: new Date()
        }
      });

      const isHighPerform = Math.random() > 0.3; 
      const mockLikes = isHighPerform ? (Math.floor(Math.random() * 45) + 8) : Math.floor(Math.random() * 3); 
      const mockCommentsCount = isHighPerform ? 3 : 0; 
      const mockShares = isHighPerform ? Math.floor(Math.random() * 5) : 0; 
      const mockClicks = isHighPerform ? (Math.floor(Math.random() * 20) + 5) : Math.floor(Math.random() * 2); 
      const mockImpressions = mockLikes * 12 + mockClicks * 3 + (isHighPerform ? 80 : 8);

      await prisma.postAnalytics.create({
        data: {
          postId,
          date: new Date(),
          likes: mockLikes,
          comments: mockCommentsCount,
          shares: mockShares,
          clicks: mockClicks,
          engagements: mockLikes + mockCommentsCount + mockShares + mockClicks,
          impressions: mockImpressions
        }
      });

      if (mockCommentsCount > 0) {
        const mockCommentTemplates = [
          { authorName: "Sarah Jenkins", content: "This is exactly what our marketing team needed! Excellent tips.", replySuggested: "Hi Sarah! Thanks so much for the feedback. Glad you found the tips helpful! 🚀" },
          { authorName: "Arjun Mehta", content: "Is there a free trial for this new automation feature?", replySuggested: "Hi Arjun! Yes, we offer a 14-day free trial on all plans. Check out the onboarding section to start! 📩" },
          { authorName: "Chloe Dupont", content: "Absolutely loving the new user interface updates! Keep it up! 🚀", replySuggested: "Thank you Chloe! We're constantly improving based on user feedback. Stay tuned for more! ❤️" }
        ];

        const dbCommentsPromises = mockCommentTemplates.map(async (tmpl) => {
          return prisma.comment.create({
            data: {
              postId,
              platformId: `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              authorId: `author-${Math.floor(Math.random() * 1000)}`,
              authorName: tmpl.authorName,
              content: tmpl.content,
              replied: false,
              replySuggested: tmpl.replySuggested
            }
          });
        });
        await Promise.all(dbCommentsPromises);
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          workspaceId,
          action: 'POST_PUBLISHED',
          resource: 'POST',
          resourceId: postId,
          details: { platform: post.platform, postId: result.platformPostId }
        }
      });

      return res.json({
        success: true,
        message: "Post published successfully",
        postId: result.platformPostId
      });

    } catch (publishError) {
      await prisma.post.update({
        where: { id: postId },
        data: { status: 'FAILED' }
      });
      throw publishError;
    }

  } catch (error) {
    console.error("Error publishing post:", error);
    return res.status(500).json({ error: error.message || "Failed to publish post" });
  }
}

export async function manageMedia(req, res) {
  const { workspaceId, postId } = req.params;
  const { action, mediaFiles = [], mediaUrlsToRemove = [], publicIdsToRemove = [] } = req.body;

  if (!action || !['add', 'remove', 'replace'].includes(action)) {
    return res.status(400).json({ error: "Valid action (add/remove/replace) is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    let currentMediaUrls = post.mediaUrls || [];
    let updatedMediaUrls = [...currentMediaUrls];

    if ((action === 'remove' || action === 'replace') && publicIdsToRemove.length > 0) {
      try {
        const deletePromises = publicIdsToRemove.map(async (publicId) => {
          await cloudinary.uploader.destroy(publicId);
        });
        await Promise.all(deletePromises);
      } catch (deleteError) {
        console.error("Cloudinary delete error:", deleteError);
      }
    }

    if ((action === 'remove' || action === 'replace') && (mediaUrlsToRemove.length > 0 || publicIdsToRemove.length > 0)) {
      updatedMediaUrls = updatedMediaUrls.filter(media => {
        const urlMatch = mediaUrlsToRemove.includes(media.url);
        const publicIdMatch = publicIdsToRemove.includes(media.publicId);
        return !urlMatch && !publicIdMatch;
      });
    }

    if ((action === 'add' || action === 'replace') && mediaFiles.length > 0) {
      const uploadPromises = mediaFiles.map(async (fileData, index) => {
        const { base64, filename } = fileData;
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const publicId = `post_${workspaceId}_${timestamp}_${randomString}_${index}`;
        
        let cleanBase64 = base64;
        if (base64.startsWith('data:')) {
          const matches = base64.match(/^data:[^;]+;base64,(.+)$/);
          if (matches && matches[1]) {
            cleanBase64 = matches[1];
          }
        }

        const mimeType = filename ? 
          (filename.toLowerCase().endsWith('.png') ? 'image/png' : 
           filename.toLowerCase().endsWith('.gif') ? 'image/gif' : 
           filename.toLowerCase().endsWith('.mp4') || filename.toLowerCase().endsWith('.mov') ? 'video/mp4' : 
           'image/jpeg') : 'image/jpeg';

        const dataUrl = `data:${mimeType};base64,${cleanBase64}`;

        const result = await cloudinary.uploader.upload(dataUrl, {
          folder: `workspace_${workspaceId}/posts`,
          public_id: publicId,
          resource_type: 'auto',
          overwrite: false
        });

        return {
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          originalFilename: filename
        };
      });

      const newMediaUrls = await Promise.all(uploadPromises);
      
      if (action === 'replace') {
        updatedMediaUrls = newMediaUrls;
      } else {
        updatedMediaUrls = [...updatedMediaUrls, ...newMediaUrls];
      }
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { mediaUrls: updatedMediaUrls, updatedAt: new Date() },
      include: { socialProfile: { select: { name: true, platform: true, avatar: true } } }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'POST_MEDIA_UPDATED',
        resource: 'POST',
        resourceId: postId,
        details: {
          action,
          mediaCount: updatedMediaUrls.length,
          addedCount: action === 'add' ? mediaFiles.length : 0,
          removedCount: currentMediaUrls.length - updatedMediaUrls.length
        }
      }
    });

    return res.json({
      success: true,
      message: `Post media ${action}ed successfully`,
      post: updatedPost,
      mediaCount: updatedMediaUrls.length
    });

  } catch (error) {
    console.error("Post media update error:", error);
    return res.status(500).json({ error: "Failed to update post media", details: error.message });
  }
}

// ==========================================
// 2. AI GENERATED POSTS (AI STUDIO DRAFTS)
// ==========================================

export async function listGeneratedPosts(req, res) {
  const { workspaceId } = req.params;
  const { status, contentPlanId } = req.query;
  const page = parseInt(req.query.page || '1');
  const limit = parseInt(req.query.limit || '20');

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = { workspaceId };
    if (status && status !== 'ALL') where.status = status;
    if (contentPlanId) where.contentPlanId = contentPlanId;

    const [generatedPosts, total] = await Promise.all([
      prisma.generatedPost.findMany({
        where,
        include: {
          contentPlan: { select: { name: true, category: true, isGenerating: true, generationPaused: true } },
          socialProfile: { select: { name: true, platform: true, avatar: true } },
          post: { select: { status: true, postedAt: true } }
        },
        orderBy: { scheduledFor: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.generatedPost.count({ where })
    ]);

    return res.json({
      success: true,
      generatedPosts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error("Generated posts fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch generated posts" });
  }
}

export async function approveGenerated(req, res) {
  const { workspaceId } = req.params;
  const { generatedPostId } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await AutomatedContentService.approveGeneratedPost(generatedPostId, req.user.id);
    return res.json({ success: true, message: "Post approved successfully", generatedPost: result });
  } catch (error) {
    console.error("Generated post approval error:", error);
    return res.status(500).json({ error: "Failed to approve post: " + error.message });
  }
}

export async function rejectGenerated(req, res) {
  const { workspaceId } = req.params;
  const { generatedPostId, rejectionReason } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const result = await AutomatedContentService.rejectGeneratedPost(generatedPostId, rejectionReason);
    return res.json({ success: true, message: "Post rejected successfully", generatedPost: result });
  } catch (error) {
    console.error("Generated post rejection error:", error);
    return res.status(500).json({ error: "Failed to reject post: " + error.message });
  }
}

export async function updateGeneratedPost(req, res) {
  const { workspaceId } = req.params;
  const { postId, content, title, hashtags, mediaUrls, scheduledFor } = req.body;

  if (!postId) {
    return res.status(400).json({ error: "postId is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existing = await prisma.generatedPost.findFirst({
      where: { id: postId, workspaceId }
    });
    if (!existing) {
      return res.status(404).json({ error: "Post not found" });
    }

    const updateData = {};
    if (content !== undefined) updateData.content = content;
    if (title !== undefined) updateData.title = title;
    if (hashtags !== undefined) updateData.hashtags = hashtags;
    if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls;
    if (scheduledFor !== undefined) updateData.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;

    const updated = await prisma.generatedPost.update({
      where: { id: postId },
      data: updateData
    });

    return res.json({ success: true, generatedPost: updated });
  } catch (error) {
    console.error("Generated post edit error:", error);
    return res.status(500).json({ error: "Failed to update post" });
  }
}

export async function saveGeneratedPost(req, res) {
  const { workspaceId } = req.params;
  const { title, content, platform, hashtags } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { subscription: { include: { plan: true } } }
    });

    let plan = workspace?.subscription?.plan;
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { name: { in: ['FREE', 'Free'] } }
      });
    }

    if (plan && plan.maxPostsGenerated !== -1) {
      const usage = await getWorkspaceLimitUsage(workspaceId);
      const currentCount = usage?.postsCount || 0;
      if (currentCount >= plan.maxPostsGenerated) {
        return res.status(403).json({
          error: `Plan Capacity Reached: Your current subscription allows up to ${plan.maxPostsGenerated} AI Generated Posts. Please upgrade your plan to unlock more.`
        });
      }
    }

    let category = await prisma.contentCategory.findFirst({ where: { workspaceId } });
    if (!category) {
      category = await prisma.contentCategory.create({
        data: { workspaceId, name: "General", description: "Default category for generated content" }
      });
    }

    let contentPlan = await prisma.contentPlan.findFirst({ where: { workspaceId } });
    if (!contentPlan) {
      contentPlan = await prisma.contentPlan.create({
        data: {
          workspaceId,
          categoryId: category.id,
          name: "Default AI Studio Plan",
          topics: "AI Content Studio",
          frequency: "DAILY",
          platforms: ["FACEBOOK", "INSTAGRAM", "LINKEDIN"]
        }
      });
    }

    const generatedPost = await prisma.generatedPost.create({
      data: {
        workspaceId,
        contentPlanId: contentPlan.id,
        title: title || "Untitled AI Post",
        content,
        hashtags: hashtags || "",
        status: "GENERATED"
      }
    });

    await incrementWorkspaceLimit(workspaceId, 'postsCount');

    return res.json({ success: true, generatedPost });
  } catch (error) {
    console.error("Failed to save generated post:", error);
    return res.status(500).json({ error: "Failed to save generated post" });
  }
}

export async function deleteGeneratedPost(req, res) {
  const { workspaceId } = req.params;
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Post ID is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.generatedPost.delete({ where: { id } });
    await decrementWorkspaceLimit(workspaceId, 'postsCount');

    return res.json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    console.error("Failed to delete generated post:", error);
    return res.status(500).json({ error: "Failed to delete generated post" });
  }
}
