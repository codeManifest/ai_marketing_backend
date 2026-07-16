import { prisma } from '../../config/db.js';

/**
 * GET /api/workspaces/:workspaceId/forms
 * List custom forms.
 */
export async function listForms(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const forms = await prisma.customForm.findMany({
      where: { workspaceId },
      include: {
        domain: { select: { domain: true } },
        _count: { select: { submissions: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, forms });
  } catch (error) {
    console.error("Error listing custom forms:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/workspaces/:workspaceId/forms
 * Create custom form.
 */
export async function createForm(req, res) {
  const { workspaceId } = req.params;
  const { name, fields, submitButtonText, successMessage, domainId } = req.body;

  if (!name || !fields || !Array.isArray(fields)) {
    return res.status(400).json({ error: "Form name and fields array are required fields" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const form = await prisma.customForm.create({
      data: {
        workspaceId,
        domainId: domainId || null,
        name,
        fields,
        submitButtonText: submitButtonText || "Submit",
        successMessage: successMessage || "Thank you for your submission!"
      }
    });

    return res.json({
      success: true,
      form,
      message: "Custom form created successfully"
    });
  } catch (error) {
    console.error("Error creating custom form:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/workspaces/:workspaceId/forms/:formId
 * Update custom form configuration.
 */
export async function updateForm(req, res) {
  const { workspaceId, formId } = req.params;
  const { name, fields, submitButtonText, successMessage, domainId } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const existingForm = await prisma.customForm.findUnique({
      where: { id: formId }
    });

    if (!existingForm || existingForm.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Form not found" });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (fields !== undefined) updateData.fields = fields;
    if (submitButtonText !== undefined) updateData.submitButtonText = submitButtonText;
    if (successMessage !== undefined) updateData.successMessage = successMessage;
    if (domainId !== undefined) updateData.domainId = domainId || null;

    const updatedForm = await prisma.customForm.update({
      where: { id: formId },
      data: updateData
    });

    return res.json({
      success: true,
      form: updatedForm,
      message: "Custom form updated successfully"
    });

  } catch (error) {
    console.error("Error updating custom form:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /api/workspaces/:workspaceId/forms/:formId
 * Remove custom form.
 */
export async function deleteForm(req, res) {
  const { workspaceId, formId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const existingForm = await prisma.customForm.findUnique({
      where: { id: formId }
    });

    if (!existingForm || existingForm.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Form not found" });
    }

    await prisma.customForm.delete({
      where: { id: formId }
    });

    return res.json({
      success: true,
      message: "Custom form and all submissions deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting custom form:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/workspaces/:workspaceId/forms/:formId/submissions
 * Fetch user submissions for custom form.
 */
export async function listSubmissions(req, res) {
  const { workspaceId, formId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const formRecord = await prisma.customForm.findUnique({
      where: { id: formId }
    });

    if (!formRecord || formRecord.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Form not found" });
    }

    const submissions = await prisma.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, submissions });
  } catch (error) {
    console.error("Error loading submissions:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/workspaces/:workspaceId/funnels
 * List conversion funnels.
 */
export async function listFunnels(req, res) {
  const { workspaceId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const funnels = await prisma.conversionFunnel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, funnels });
  } catch (error) {
    console.error("Error listing conversion funnels:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/workspaces/:workspaceId/funnels
 * Create conversion funnel.
 */
export async function createFunnel(req, res) {
  const { workspaceId } = req.params;
  const { name, steps } = req.body;

  if (!name || !steps || !Array.isArray(steps) || steps.length < 2) {
    return res.status(400).json({ error: "Funnel name and at least 2 steps are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const funnel = await prisma.conversionFunnel.create({
      data: {
        workspaceId,
        name,
        steps: steps.map(s => s.trim())
      }
    });

    return res.json({
      success: true,
      funnel,
      message: "Conversion funnel created successfully"
    });
  } catch (error) {
    console.error("Error creating conversion funnel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/workspaces/:workspaceId/funnels/:funnelId
 * Computes sequential conversion rates from tracking events.
 */
export async function getFunnelStats(req, res) {
  const { workspaceId, funnelId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const funnel = await prisma.conversionFunnel.findUnique({
      where: { id: funnelId }
    });

    if (!funnel || funnel.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Funnel not found" });
    }

    const domains = await prisma.verifiedDomain.findMany({
      where: { workspaceId },
      select: { id: true }
    });
    
    const domainIds = domains.map(d => d.id);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await prisma.webAnalyticsEvent.findMany({
      where: {
        domainId: { in: domainIds },
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: "asc" }
    });

    const sessionEvents = {};
    events.forEach(e => {
      if (!sessionEvents[e.sessionId]) {
        sessionEvents[e.sessionId] = [];
      }
      sessionEvents[e.sessionId].push(e);
    });

    const funnelSteps = funnel.steps || [];
    const stepCounts = new Array(funnelSteps.length).fill(0);

    Object.values(sessionEvents).forEach(userEvents => {
      let currentStepIdx = 0;
      userEvents.forEach(evt => {
        const cleanUrl = evt.url.split('?')[0];
        if (currentStepIdx < funnelSteps.length && cleanUrl === funnelSteps[currentStepIdx]) {
          stepCounts[currentStepIdx]++;
          currentStepIdx++;
        }
      });
    });

    const funnelStats = funnelSteps.map((path, idx) => {
      const count = stepCounts[idx] || 0;
      const baselineCount = stepCounts[0] || 0;
      
      const overallConversion = baselineCount > 0 
        ? Math.round((count / baselineCount) * 100) 
        : (idx === 0 && count > 0 ? 100 : 0);
        
      const previousCount = idx === 0 ? count : stepCounts[idx - 1] || 0;
      const stepConversion = previousCount > 0
        ? Math.round((count / previousCount) * 100)
        : (idx === 0 && count > 0 ? 100 : 0);
        
      const dropOff = idx === 0 
        ? 0 
        : Math.round(((previousCount - count) / (previousCount || 1)) * 100);

      return {
        stepIndex: idx + 1,
        path,
        count,
        overallConversion,
        stepConversion,
        dropOff
      };
    });

    return res.json({
      success: true,
      funnel,
      stats: funnelStats,
      totalInitiated: stepCounts[0] || 0,
      totalCompleted: stepCounts[funnelSteps.length - 1] || 0
    });

  } catch (error) {
    console.error("Error loading funnel stats:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/workspaces/:workspaceId/funnels/:funnelId
 * Update conversion funnel config.
 */
export async function updateFunnel(req, res) {
  const { workspaceId, funnelId } = req.params;
  const { name, steps } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const existingFunnel = await prisma.conversionFunnel.findUnique({
      where: { id: funnelId }
    });

    if (!existingFunnel || existingFunnel.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Funnel not found" });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (steps !== undefined) {
      if (!Array.isArray(steps) || steps.length < 2) {
        return res.status(400).json({ error: "At least 2 steps are required" });
      }
      updateData.steps = steps.map(s => s.trim());
    }

    const updatedFunnel = await prisma.conversionFunnel.update({
      where: { id: funnelId },
      data: updateData
    });

    return res.json({
      success: true,
      funnel: updatedFunnel,
      message: "Conversion funnel updated successfully"
    });

  } catch (error) {
    console.error("Error updating funnel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /api/workspaces/:workspaceId/funnels/:funnelId
 * Delete conversion funnel.
 */
export async function deleteFunnel(req, res) {
  const { workspaceId, funnelId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });

    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const existingFunnel = await prisma.conversionFunnel.findUnique({
      where: { id: funnelId }
    });

    if (!existingFunnel || existingFunnel.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Funnel not found" });
    }

    await prisma.conversionFunnel.delete({
      where: { id: funnelId }
    });

    return res.json({
      success: true,
      message: "Conversion funnel deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting funnel:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
