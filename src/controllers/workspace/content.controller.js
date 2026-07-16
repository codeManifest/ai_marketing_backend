import { prisma } from '../../config/db.js';
import { enqueueContentGeneration } from '../../services/queue/content-queue.js';
import { getWorkspaceLimitUsage, incrementWorkspaceLimit, decrementWorkspaceLimit } from '../../services/workspace-limit-service.js';

// ==========================================
// 1. CONTENT CATEGORIES
// ==========================================

export async function listCategories(req, res) {
  const { workspaceId } = req.params;
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const categories = await prisma.contentCategory.findMany({
      where: { workspaceId, isActive: true },
      include: {
        _count: {
          select: { contentPlans: true, aiPrompts: true, postTemplates: true }
        }
      },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, categories });
  } catch (error) {
    console.error("Categories fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch categories" });
  }
}

export async function createCategory(req, res) {
  const { workspaceId } = req.params;
  const { name, description, color } = req.body;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        memberships: { where: { userId: req.user.id } },
        subscription: { include: { plan: true } }
      }
    });

    if (!workspace || workspace.memberships.length === 0) {
      return res.status(403).json({ error: "Access denied or workspace not found" });
    }

    let plan = workspace.subscription?.plan;
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { name: { in: ['FREE', 'Free'] } }
      });
    }

    if (plan && plan.maxCategories !== -1) {
      const usage = await getWorkspaceLimitUsage(workspaceId);
      const currentCount = usage?.categoriesCount || 0;
      if (currentCount >= plan.maxCategories) {
        return res.status(403).json({
          error: `Plan Capacity Reached: Your current subscription allows up to ${plan.maxCategories} Content Categories. Please upgrade your plan to unlock more.`
        });
      }
    }

    const category = await prisma.contentCategory.create({
      data: { workspaceId, name, description, color }
    });

    await incrementWorkspaceLimit(workspaceId, 'categoriesCount');

    return res.json({ success: true, message: 'Content category created successfully', category });
  } catch (error) {
    console.error("Category creation error:", error);
    return res.status(500).json({ error: "Failed to create category" });
  }
}

export async function deleteCategory(req, res) {
  const { workspaceId } = req.params;
  const { categoryId } = req.query;

  if (!categoryId) {
    return res.status(400).json({ error: "Category ID is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const category = await prisma.contentCategory.findFirst({
      where: { id: categoryId, workspaceId, isActive: true }
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    await prisma.contentCategory.update({
      where: { id: categoryId },
      data: { isActive: false }
    });

    await decrementWorkspaceLimit(workspaceId, 'categoriesCount');

    return res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error("Category deletion error:", error);
    return res.status(500).json({ error: "Failed to delete category" });
  }
}

// ==========================================
// 2. AI PROMPTS
// ==========================================

export async function listPrompts(req, res) {
  const { workspaceId } = req.params;
  const { categoryId } = req.query;
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = { workspaceId, isActive: true };
    if (categoryId) where.categoryId = categoryId;

    const prompts = await prisma.aIPrompt.findMany({
      where,
      include: {
        category: { select: { name: true, color: true } },
        _count: { select: { contentPlans: true } }
      },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, prompts });
  } catch (error) {
    console.error("Prompts fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch prompts" });
  }
}

export async function createPrompt(req, res) {
  const { workspaceId } = req.params;
  const { categoryId, name, prompt, description, exampleOutput, temperature, maxTokens } = req.body;

  if (!name || !prompt || !categoryId) {
    return res.status(400).json({ error: "Name, prompt, and category are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const category = await prisma.contentCategory.findFirst({
      where: { id: categoryId, workspaceId }
    });
    if (!category) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        subscription: { include: { plan: true } }
      }
    });

    let plan = workspace?.subscription?.plan;
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { name: { in: ['FREE', 'Free'] } }
      });
    }

    if (plan && plan.maxAiPrompts !== -1) {
      const usage = await getWorkspaceLimitUsage(workspaceId);
      const currentCount = usage?.promptsCount || 0;
      if (currentCount >= plan.maxAiPrompts) {
        return res.status(403).json({
          error: `Plan Capacity Reached: Your current subscription allows up to ${plan.maxAiPrompts} AI Prompt Sets. Please upgrade your plan to unlock more.`
        });
      }
    }

    const aiPrompt = await prisma.aIPrompt.create({
      data: {
        workspaceId,
        categoryId,
        name,
        prompt,
        description,
        exampleOutput,
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 1000
      },
      include: { category: true }
    });

    await incrementWorkspaceLimit(workspaceId, 'promptsCount');

    return res.json({ success: true, message: 'AI Prompt created successfully', prompt: aiPrompt });
  } catch (error) {
    console.error("Prompt creation error:", error);
    return res.status(500).json({ error: "Failed to create prompt" });
  }
}

export async function updatePrompt(req, res) {
  const { workspaceId } = req.params;
  const { promptId, name, prompt, description, exampleOutput, temperature, maxTokens, isActive } = req.body;

  if (!promptId) {
    return res.status(400).json({ error: "Prompt ID is required" });
  }

  try {
    const existingPrompt = await prisma.aIPrompt.findFirst({
      where: { id: promptId, workspaceId }
    });
    if (!existingPrompt) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updateData = {
      ...(name && { name }),
      ...(prompt && { prompt }),
      ...(description !== undefined && { description }),
      ...(exampleOutput !== undefined && { exampleOutput }),
      ...(temperature !== undefined && { temperature }),
      ...(maxTokens !== undefined && { maxTokens }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date()
    };

    const updatedPrompt = await prisma.aIPrompt.update({
      where: { id: promptId },
      data: updateData,
      include: { category: true }
    });

    return res.json({ success: true, message: 'Prompt updated successfully', prompt: updatedPrompt });
  } catch (error) {
    console.error("Prompt update error:", error);
    return res.status(500).json({ error: "Failed to update prompt" });
  }
}

export async function deletePrompt(req, res) {
  const { workspaceId } = req.params;
  const { promptId } = req.query;

  if (!promptId) {
    return res.status(400).json({ error: "Prompt ID is required" });
  }

  try {
    const existingPrompt = await prisma.aIPrompt.findFirst({
      where: { id: promptId, workspaceId }
    });
    if (!existingPrompt) {
      return res.status(404).json({ error: "Prompt not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const usageCount = await prisma.contentPlan.count({
      where: { promptId }
    });
    if (usageCount > 0) {
      return res.status(400).json({ error: "Cannot delete prompt. It is being used in content plans.", usageCount });
    }

    await prisma.aIPrompt.update({
      where: { id: promptId },
      data: { isActive: false, updatedAt: new Date() }
    });

    await decrementWorkspaceLimit(workspaceId, 'promptsCount');

    return res.json({ success: true, message: 'Prompt deleted successfully' });
  } catch (error) {
    console.error("Prompt deletion error:", error);
    return res.status(500).json({ error: "Failed to delete prompt" });
  }
}

// ==========================================
// 3. POST TEMPLATES
// ==========================================

export async function listTemplates(req, res) {
  const { workspaceId } = req.params;
  const { categoryId } = req.query;
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = { workspaceId, isActive: true };
    if (categoryId) where.categoryId = categoryId;

    const templates = await prisma.postTemplate.findMany({
      where,
      include: {
        category: { select: { name: true, color: true } },
        _count: { select: { contentPlans: true } }
      },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, templates });
  } catch (error) {
    console.error("Templates fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch templates" });
  }
}

export async function createTemplate(req, res) {
  const { workspaceId } = req.params;
  const { categoryId, name, template, description, variables, example } = req.body;

  if (!name || !template || !categoryId) {
    return res.status(400).json({ error: "Name, template, and category are required" });
  }

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        memberships: { where: { userId: req.user.id } },
        subscription: { include: { plan: true } }
      }
    });

    if (!workspace || workspace.memberships.length === 0) {
      return res.status(403).json({ error: "Access denied or workspace not found" });
    }

    let plan = workspace.subscription?.plan;
    if (!plan) {
      plan = await prisma.plan.findFirst({
        where: { name: { in: ['FREE', 'Free'] } }
      });
    }

    if (plan && plan.maxAiTemplates !== -1) {
      const usage = await getWorkspaceLimitUsage(workspaceId);
      const currentCount = usage?.templatesCount || 0;
      if (currentCount >= plan.maxAiTemplates) {
        return res.status(403).json({
          error: `Plan Capacity Reached: Your current subscription allows up to ${plan.maxAiTemplates} AI Templates. Please upgrade your plan to unlock more.`
        });
      }
    }

    const category = await prisma.contentCategory.findFirst({
      where: { id: categoryId, workspaceId }
    });
    if (!category) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const postTemplate = await prisma.postTemplate.create({
      data: {
        workspaceId,
        categoryId,
        name,
        template,
        description,
        variables: variables || { 
          topic: "Main topic of the post",
          content: "Generated content from AI",
          hashtags: "Relevant hashtags",
          date: "Current date",
          platform: "Social media platform"
        },
        example
      },
      include: { category: true }
    });

    await incrementWorkspaceLimit(workspaceId, 'templatesCount');

    return res.json({ success: true, message: 'Post template created successfully', template: postTemplate });
  } catch (error) {
    console.error("Post template creation error:", error);
    return res.status(500).json({ error: "Failed to create post template" });
  }
}

export async function updateTemplate(req, res) {
  const { workspaceId } = req.params;
  const { templateId, name, template, description, variables, example, isActive } = req.body;

  if (!templateId) {
    return res.status(400).json({ error: "Template ID is required" });
  }

  try {
    const existingTemplate = await prisma.postTemplate.findFirst({
      where: { id: templateId, workspaceId }
    });
    if (!existingTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updateData = {
      ...(name && { name }),
      ...(template && { template }),
      ...(description !== undefined && { description }),
      ...(variables && { variables }),
      ...(example !== undefined && { example }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date()
    };

    const updatedTemplate = await prisma.postTemplate.update({
      where: { id: templateId },
      data: updateData,
      include: { category: true }
    });

    return res.json({ success: true, message: 'Post template updated successfully', template: updatedTemplate });
  } catch (error) {
    console.error("Post template update error:", error);
    return res.status(500).json({ error: "Failed to update template" });
  }
}

export async function deleteTemplate(req, res) {
  const { workspaceId } = req.params;
  const { templateId } = req.query;

  if (!templateId) {
    return res.status(400).json({ error: "Template ID is required" });
  }

  try {
    const existingTemplate = await prisma.postTemplate.findFirst({
      where: { id: templateId, workspaceId }
    });
    if (!existingTemplate) {
      return res.status(404).json({ error: "Template not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const usageCount = await prisma.contentPlan.count({
      where: { templateId }
    });
    if (usageCount > 0) {
      return res.status(400).json({ error: "Cannot delete template. It is being used in content plans.", usageCount });
    }

    await prisma.postTemplate.update({
      where: { id: templateId },
      data: { isActive: false, updatedAt: new Date() }
    });

    await decrementWorkspaceLimit(workspaceId, 'templatesCount');

    return res.json({ success: true, message: 'Post template deleted successfully' });
  } catch (error) {
    console.error("Post template deletion error:", error);
    return res.status(500).json({ error: "Failed to delete template" });
  }
}

// ==========================================
// 4. CONTENT PLANS (CAMPAIGNS)
// ==========================================

export async function listContentPlans(req, res) {
  const { workspaceId } = req.params;
  const status = req.query.status;
  const categoryId = req.query.categoryId;
  const includeStats = req.query.includeStats === 'true';

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const where = { workspaceId };
    if (status && status !== 'ALL') where.status = status;
    if (categoryId) where.categoryId = categoryId;

    const contentPlans = await prisma.contentPlan.findMany({
      where,
      include: {
        category: true,
        prompt: true,
        template: true,
        generatedPosts: {
          include: { socialProfile: true },
          orderBy: { scheduledFor: 'asc' },
          take: 100
        },
        _count: { select: { generatedPosts: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    let plansWithStats = contentPlans;
    if (includeStats) {
      plansWithStats = await Promise.all(
        contentPlans.map(async (plan) => {
          const stats = await prisma.generatedPost.groupBy({
            by: ['status'],
            where: { contentPlanId: plan.id },
            _count: { id: true }
          });
          const statusCounts = stats.reduce((acc, stat) => {
            acc[stat.status] = stat._count.id;
            return acc;
          }, {});
          return { ...plan, stats: statusCounts };
        })
      );
    }

    return res.json({ success: true, contentPlans: plansWithStats });
  } catch (error) {
    console.error("Content plans fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch content plans" });
  }
}

export async function createContentPlan(req, res) {
  const { workspaceId } = req.params;
  const {
    name,
    categoryId,
    promptId,
    templateId,
    topics,
    tone,
    language,
    frequency,
    postsPerWeek,
    preferredDays,
    preferredTimes,
    platforms,
    socialProfileIds,
    autoGenerate,
    requireApproval,
    autoPost,
    maxPostsPerMonth,
    generateGraphics,
    generateVideos
  } = req.body;

  if (!name || !categoryId || !topics || !frequency || !platforms) {
    return res.status(400).json({ error: "Required fields missing" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const workspaceOwner = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true }
    });
    if (!workspaceOwner) {
      return res.status(400).json({ error: "Workspace owner not found" });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: workspaceOwner.ownerId,
        status: { in: ['ACTIVE', 'TRIAL'] }
      },
      include: { plan: true }
    });
    if (!subscription) {
      return res.status(400).json({ error: "No active subscription found. Cannot generate campaign posts." });
    }

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const usageStats = await prisma.aIUsage.aggregate({
      where: {
        userId: workspaceOwner.ownerId,
        createdAt: { gte: startOfMonth }
      },
      _sum: { creditsUsed: true }
    });
    const totalUsed = usageStats._sum.creditsUsed || 0;
    const availableCredits = subscription.plan.monthlyAiCredits;
    const remainingCredits = Math.max(0, availableCredits - totalUsed);

    const count = frequency === 'DAILY' 
      ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() 
      : frequency === 'MONTHLY' ? 12 : (postsPerWeek || 3);

    const dynamicCosts = await prisma.aICreditCost.findMany();
    const costsMap = dynamicCosts.reduce((acc, c) => {
      acc[c.action] = c.cost;
      return acc;
    }, {});

    const baseCost = costsMap.POST_GENERATION || 5;
    const graphicsCost = generateGraphics !== false ? (costsMap.GRAPHICS_GENERATION || 10) : 0;
    const videoCost = generateVideos ? (costsMap.VIDEO_GENERATION || 20) : 0;
    const postCredits = baseCost + graphicsCost + videoCost;
    const totalEstimatedCost = count * postCredits;

    if (remainingCredits < totalEstimatedCost) {
      return res.status(400).json({ error: `Insufficient AI credits. Required: ${totalEstimatedCost}, Available: ${remainingCredits}` });
    }

    const contentPlan = await prisma.contentPlan.create({
      data: {
        workspaceId,
        categoryId,
        promptId: promptId || null,
        templateId: templateId || null,
        name,
        topics: Array.isArray(topics) ? topics.join(',') : topics,
        tone: tone || 'professional',
        language: language || 'en',
        frequency,
        postsPerWeek: postsPerWeek || 1,
        preferredDays: preferredDays || [1, 3, 5],
        preferredTimes: preferredTimes || ['09:00', '14:00', '18:00'],
        platforms,
        socialProfileIds: socialProfileIds || [],
        autoGenerate: autoGenerate !== false,
        requireApproval: requireApproval || false,
        autoPost: autoPost || false,
        generateGraphics: generateGraphics !== false,
        generateVideos: generateVideos !== false,
        maxPostsPerMonth: maxPostsPerMonth || null,
        status: 'ACTIVE'
      },
      include: { category: true, prompt: true, template: true }
    });

    if (autoGenerate) {
      await enqueueContentGeneration(contentPlan.id);
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'CONTENT_PLAN_CREATED',
        resource: 'CONTENT_PLAN',
        resourceId: contentPlan.id,
        details: { name, frequency, postsPerWeek, platforms }
      }
    });

    return res.json({ success: true, message: 'Content plan created successfully', contentPlan });
  } catch (error) {
    console.error("Content plan creation error:", error);
    return res.status(500).json({ error: "Failed to create content plan" });
  }
}

export async function updateContentPlan(req, res) {
  const { workspaceId } = req.params;
  const {
    contentPlanId,
    name,
    categoryId,
    promptId,
    templateId,
    topics,
    tone,
    frequency,
    postsPerWeek,
    preferredDays,
    preferredTimes,
    platforms,
    socialProfileIds,
    autoGenerate,
    requireApproval,
    autoPost,
    maxPostsPerMonth,
    generateGraphics,
    generateVideos,
    status
  } = req.body;

  if (!contentPlanId) {
    return res.status(400).json({ error: "Content plan ID is required" });
  }

  try {
    const existingPlan = await prisma.contentPlan.findFirst({
      where: { id: contentPlanId, workspaceId }
    });
    if (!existingPlan) {
      return res.status(404).json({ error: "Content plan not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const updateData = {
      ...(name && { name }),
      ...(categoryId && { categoryId }),
      ...(promptId !== undefined && { promptId }),
      ...(templateId !== undefined && { templateId: templateId || null }),
      ...(topics && { topics: Array.isArray(topics) ? topics.join(',') : topics }),
      ...(tone && { tone }),
      ...(frequency && { frequency }),
      ...(postsPerWeek !== undefined && { postsPerWeek }),
      ...(preferredDays && { preferredDays }),
      ...(preferredTimes && { preferredTimes }),
      ...(platforms && { platforms }),
      ...(socialProfileIds && { socialProfileIds }),
      ...(autoGenerate !== undefined && { autoGenerate }),
      ...(requireApproval !== undefined && { requireApproval }),
      ...(autoPost !== undefined && { autoPost }),
      ...(generateGraphics !== undefined && { generateGraphics }),
      ...(generateVideos !== undefined && { generateVideos }),
      ...(maxPostsPerMonth !== undefined && { maxPostsPerMonth }),
      ...(status && { status }),
      updatedAt: new Date()
    };

    const updatedPlan = await prisma.contentPlan.update({
      where: { id: contentPlanId },
      data: updateData,
      include: { category: true, prompt: true, template: true }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'CONTENT_PLAN_UPDATED',
        resource: 'CONTENT_PLAN',
        resourceId: contentPlanId,
        details: { name: updatedPlan.name }
      }
    });

    return res.json({ success: true, message: 'Content plan updated successfully', contentPlan: updatedPlan });
  } catch (error) {
    console.error("Content plan update error:", error);
    return res.status(500).json({ error: "Failed to update content plan" });
  }
}

export async function actionContentPlan(req, res) {
  const { workspaceId } = req.params;
  const { contentPlanId, action } = req.body;

  if (!contentPlanId || !action) {
    return res.status(400).json({ error: "Content plan ID and action are required" });
  }

  try {
    const existingPlan = await prisma.contentPlan.findFirst({
      where: { id: contentPlanId, workspaceId }
    });
    if (!existingPlan) {
      return res.status(404).json({ error: "Content plan not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    let result;
    let message;

    switch (action) {
      case 'generate_posts':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: {
            isGenerating: true,
            genPostsTotal: 0,
            genPostsCompleted: 0,
            genMediaTotal: 0,
            genMediaCompleted: 0,
            generationPaused: false,
            generationAborted: false,
            updatedAt: new Date()
          }
        });
        await enqueueContentGeneration(contentPlanId);
        message = 'Batch post generation enqueued in background';
        break;

      case 'pause_generation':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { generationPaused: true, isGenerating: false, updatedAt: new Date() }
        });
        message = 'Batch post generation paused';
        break;

      case 'resume_generation':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { generationPaused: false, generationAborted: false, isGenerating: true, updatedAt: new Date() }
        });
        await enqueueContentGeneration(contentPlanId);
        message = 'Batch post generation resumed';
        break;

      case 'abort_generation':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { generationAborted: true, isGenerating: false, generationPaused: false, updatedAt: new Date() }
        });
        message = 'Batch post generation aborted';
        break;

      case 'activate':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { status: 'ACTIVE', updatedAt: new Date() }
        });
        message = 'Content plan activated';
        break;

      case 'pause':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { status: 'PAUSED', updatedAt: new Date() }
        });
        message = 'Content plan paused';
        break;

      case 'complete':
        await prisma.contentPlan.update({
          where: { id: contentPlanId },
          data: { status: 'COMPLETED', updatedAt: new Date() }
        });
        message = 'Content plan marked as completed';
        break;

      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: `CONTENT_PLAN_${action.toUpperCase()}`,
        resource: 'CONTENT_PLAN',
        resourceId: contentPlanId,
        details: { action }
      }
    });

    return res.json({ success: true, message, result });
  } catch (error) {
    console.error("Content plan action error:", error);
    return res.status(500).json({ error: "Failed to perform action" });
  }
}

export async function deleteContentPlan(req, res) {
  const { workspaceId } = req.params;
  const { planId } = req.query;

  if (!planId) {
    return res.status(400).json({ error: "Content plan ID is required" });
  }

  try {
    const existingPlan = await prisma.contentPlan.findFirst({
      where: { id: planId, workspaceId },
      include: {
        generatedPosts: { where: { status: { in: ['SCHEDULED', 'GENERATED'] } } }
      }
    });

    if (!existingPlan) {
      return res.status(404).json({ error: "Content plan not found" });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (existingPlan.generatedPosts.length > 0) {
      return res.status(400).json({ 
        error: "Cannot delete content plan with scheduled or pending posts. Please cancel or delete the posts first.",
        scheduledPostsCount: existingPlan.generatedPosts.length
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.generatedPost.deleteMany({ where: { contentPlanId: planId } });
      await tx.auditLog.deleteMany({
        where: { resource: 'CONTENT_PLAN', resourceId: planId }
      });
      const deletedPlan = await tx.contentPlan.delete({ where: { id: planId } });
      return deletedPlan;
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'CONTENT_PLAN_DELETED',
        resource: 'CONTENT_PLAN',
        resourceId: planId,
        details: { name: existingPlan.name }
      }
    });

    return res.json({
      success: true,
      message: 'Content plan deleted successfully',
      deletedPlan: { id: result.id, name: result.name }
    });

  } catch (error) {
    console.error("Content plan deletion error:", error);
    return res.status(500).json({ error: "Failed to delete content plan", details: error.message });
  }
}

export async function runContentPlan(req, res) {
  const { workspaceId, planId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const contentPlan = await prisma.contentPlan.findFirst({
      where: { id: planId, workspaceId }
    });
    if (!contentPlan) {
      return res.status(404).json({ error: "Content plan not found" });
    }

    await prisma.contentPlan.update({
      where: { id: planId },
      data: {
        isGenerating: true,
        genPostsTotal: 0,
        genPostsCompleted: 0,
        genMediaTotal: 0,
        genMediaCompleted: 0,
        generationPaused: false,
        generationAborted: false,
        updatedAt: new Date()
      }
    });

    const result = await enqueueContentGeneration(planId);

    return res.json({
      success: true,
      message: result.status === 'queued' 
        ? 'Background content generation task enqueued successfully' 
        : 'Content generation completed inline'
    });
  } catch (error) {
    console.error("Manual enqueuing trigger failed:", error);
    return res.status(400).json({ error: error.message || "Failed to trigger content generation" });
  }
}

export async function getContentPlanStats(req, res) {
  const { workspaceId, planId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const contentPlan = await prisma.contentPlan.findFirst({
      where: { id: planId, workspaceId },
      select: {
        id: true,
        name: true,
        postsPerWeek: true,
        frequency: true,
        lastGeneratedAt: true,
        status: true,
        createdAt: true
      }
    });

    if (!contentPlan) {
      return res.status(404).json({ error: "Content plan not found" });
    }

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const postsThisWeek = await prisma.generatedPost.count({
      where: {
        contentPlanId: planId,
        scheduledFor: { gte: startOfWeek, lte: endOfWeek },
        status: { in: ['SCHEDULED', 'APPROVED', 'POSTED'] }
      }
    });

    const nextScheduledPost = await prisma.generatedPost.findFirst({
      where: {
        contentPlanId: planId,
        status: { in: ['SCHEDULED', 'APPROVED'] },
        scheduledFor: { gt: now }
      },
      orderBy: { scheduledFor: 'asc' },
      select: { scheduledFor: true, content: true, id: true }
    });

    const lastGenerated = await prisma.generatedPost.findFirst({
      where: {
        contentPlanId: planId,
        status: { in: ['GENERATED', 'APPROVED', 'SCHEDULED', 'POSTED'] }
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, id: true }
    });

    let nextGeneration = null;
    if (contentPlan.lastGeneratedAt && contentPlan.status === 'ACTIVE') {
      const lastGen = new Date(contentPlan.lastGeneratedAt);
      switch (contentPlan.frequency) {
        case 'DAILY':
          nextGeneration = new Date(lastGen.setDate(lastGen.getDate() + 1));
          break;
        case 'WEEKLY':
          nextGeneration = new Date(lastGen.setDate(lastGen.getDate() + 7));
          break;
        case 'MONTHLY':
          nextGeneration = new Date(lastGen.setMonth(lastGen.getMonth() + 1));
          break;
        default:
          nextGeneration = new Date(lastGen.setDate(lastGen.getDate() + 1));
      }
    }

    const totalPosts = await prisma.generatedPost.count({
      where: { contentPlanId: planId }
    });

    const postsByStatus = await prisma.generatedPost.groupBy({
      by: ['status'],
      where: { contentPlanId: planId },
      _count: { id: true }
    });

    const statusCounts = postsByStatus.reduce((acc, stat) => {
      acc[stat.status] = stat._count.id;
      return acc;
    }, {});

    const formatRelativeTime = (date) => {
      if (!date) return "No posts scheduled";
      const diffTime = new Date(date) - new Date();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : `In ${diffDays} days`;
    };

    const planStats = {
      postsThisWeek: {
        current: postsThisWeek,
        total: contentPlan.postsPerWeek || 7,
        formatted: `${postsThisWeek}/${contentPlan.postsPerWeek || 7}`
      },
      nextPost: nextScheduledPost ? {
        id: nextScheduledPost.id,
        time: nextScheduledPost.scheduledFor.toISOString(),
        formattedTime: formatRelativeTime(nextScheduledPost.scheduledFor),
        rawTime: nextScheduledPost.scheduledFor,
        content: nextScheduledPost.content?.substring(0, 100),
        planName: contentPlan.name
      } : {
        id: null,
        time: null,
        formattedTime: "No posts scheduled",
        rawTime: null,
        content: null,
        planName: contentPlan.name
      },
      recentActivity: {
        lastGenerated: {
          raw: lastGenerated?.createdAt ? lastGenerated.createdAt.toISOString() : null,
          formatted: lastGenerated?.createdAt ? "Generated" : "Not generated yet"
        },
        nextGeneration: {
          raw: nextGeneration ? nextGeneration.toISOString() : null,
          formatted: nextGeneration ? "Scheduled" : "Not scheduled"
        },
        totalPosts
      },
      planInfo: {
        id: contentPlan.id,
        name: contentPlan.name,
        status: contentPlan.status,
        frequency: contentPlan.frequency,
        createdDate: contentPlan.createdAt.toLocaleDateString()
      },
      postStats: {
        byStatus: statusCounts,
        total: totalPosts,
        scheduled: statusCounts.SCHEDULED || 0,
        posted: statusCounts.POSTED || 0,
        draft: statusCounts.DRAFT || 0
      }
    };

    return res.json({ success: true, planStats });

  } catch (error) {
    console.error("Content plan stats fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch content plan stats" });
  }
}
