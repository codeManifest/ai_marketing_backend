import { prisma } from '../config/db.js';

/**
 * Retrieves the usage tracking record for a workspace.
 * If the tracker doesn't exist, it counts current database tables (self-healing init) and saves the initial values.
 */
export async function getWorkspaceLimitUsage(workspaceId) {
  if (!workspaceId) return null;

  try {
    let usage = await prisma.workspaceLimitUsage.findUnique({
      where: { workspaceId }
    });

    if (!usage) {
      // Lazy initialization: Count existing resources once
      const [categoriesCount, templatesCount, postsCount, promptsCount] = await Promise.all([
        prisma.contentCategory.count({ where: { workspaceId, isActive: true } }),
        prisma.postTemplate.count({ where: { workspaceId } }),
        prisma.post.count({ where: { workspaceId, aiGenerated: true } }),
        prisma.aIPrompt.count({ where: { workspaceId, isActive: true } })
      ]);

      usage = await prisma.workspaceLimitUsage.create({
        data: {
          workspaceId,
          categoriesCount,
          templatesCount,
          postsCount,
          promptsCount
        }
      });
    }

    return usage;
  } catch (error) {
    console.error(`Failed to get workspace limit usage for ${workspaceId}:`, error);
    // Fallback to live count object to prevent crashing
    return {
      categoriesCount: await prisma.contentCategory.count({ where: { workspaceId, isActive: true } }),
      templatesCount: await prisma.postTemplate.count({ where: { workspaceId } }),
      postsCount: await prisma.post.count({ where: { workspaceId, aiGenerated: true } }),
      promptsCount: await prisma.aIPrompt.count({ where: { workspaceId, isActive: true } })
    };
  }
}

/**
 * Increments a specific counter in the tracker.
 */
export async function incrementWorkspaceLimit(workspaceId, field, amount = 1) {
  if (!workspaceId || !field) return;
  try {
    // Ensure the record is initialized
    await getWorkspaceLimitUsage(workspaceId);

    await prisma.workspaceLimitUsage.update({
      where: { workspaceId },
      data: {
        [field]: { increment: amount }
      }
    });
  } catch (error) {
    console.error(`Failed to increment workspace counter ${field}:`, error);
  }
}

/**
 * Decrements a specific counter in the tracker.
 */
export async function decrementWorkspaceLimit(workspaceId, field, amount = 1) {
  if (!workspaceId || !field) return;
  try {
    // Ensure the record is initialized
    await getWorkspaceLimitUsage(workspaceId);

    await prisma.workspaceLimitUsage.update({
      where: { workspaceId },
      data: {
        [field]: { decrement: amount }
      }
    });
  } catch (error) {
    console.error(`Failed to decrement workspace counter ${field}:`, error);
  }
}
