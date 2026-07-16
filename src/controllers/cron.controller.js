import { prisma } from '../config/db.js';
import { AutomatedContentService } from '../services/automated-content-service.js';
import { AutopilotService } from '../services/autopilot-service.js';

/**
 * Helper to validate CRON secret
 */
function validateCronSecret(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/**
 * GET /api/cron/generate-scheduled-content
 */
export async function generateScheduledContent(req, res) {
  if (!validateCronSecret(req, res)) return;

  try {
    console.log('🔄 Starting automated content generation...');

    // Find active content plans that need content generation
    const activeContentPlans = await prisma.contentPlan.findMany({
      where: {
        status: 'ACTIVE',
        autoGenerate: true,
        OR: [
          { lastGeneratedAt: null },
          { 
            lastGeneratedAt: { 
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // More than 24 hours ago
            }
          }
        ]
      },
      include: {
        category: true,
        prompt: true,
        template: true,
        workspace: true
      }
    });

    console.log(`📋 Found ${activeContentPlans.length} content plans to process`);

    const results = [];

    for (const contentPlan of activeContentPlans) {
      try {
        console.log(`🔄 Processing content plan: ${contentPlan.name}`);
        
        const generatedPosts = await AutomatedContentService.generatePostsForPlan(contentPlan);
        
        results.push({
          contentPlanId: contentPlan.id,
          contentPlanName: contentPlan.name,
          generatedPosts: generatedPosts.length,
          status: 'success'
        });

        console.log(`✅ Generated ${generatedPosts.length} posts for ${contentPlan.name}`);

      } catch (error) {
        console.error(`❌ Failed to generate posts for content plan ${contentPlan.id}:`, error);
        results.push({
          contentPlanId: contentPlan.id,
          contentPlanName: contentPlan.name,
          error: error.message,
          status: 'failed'
        });
      }
    }

    return res.json({
      success: true,
      message: `Processed ${activeContentPlans.length} content plans`,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Cron job error:", error);
    return res.status(500).json({ error: "Cron job failed" });
  }
}

/**
 * GET /api/cron/autopilot
 */
export async function runAutopilotCron(req, res) {
  if (!validateCronSecret(req, res)) return;

  try {
    console.log('🔄 Starting social autopilot cron run...');
    AutopilotService.logs = []; // Clear previous execution logs
    
    const workspaces = await prisma.workspace.findMany();
    const results = [];

    for (const workspace of workspaces) {
      try {
        const stats = await AutopilotService.runAutopilot(workspace.id);
        results.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          ...stats,
          status: 'success'
        });
      } catch (wsError) {
        console.error(`Error in autopilot for workspace ${workspace.id}:`, wsError);
        results.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          error: wsError.message,
          status: 'failed'
        });
      }
    }

    return res.json({
      success: true,
      message: `Processed ${workspaces.length} workspaces`,
      results,
      logs: AutopilotService.logs
    });
  } catch (error) {
    console.error("Autopilot cron error:", error);
    return res.status(500).json({ 
      error: "Autopilot cron failed", 
      logs: AutopilotService.logs 
    });
  }
}
