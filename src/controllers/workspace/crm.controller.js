import { prisma } from '../../config/db.js';

// ==========================================
// 1. LEADS CORE
// ==========================================

export async function listLeads(req, res) {
  const { workspaceId } = req.params;
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId },
      select: { id: true }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const leads = await prisma.lead.findMany({
      where: { workspaceId },
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "asc" } },
        deals: { orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" } },
        webAnalyticsEvents: { orderBy: { createdAt: "desc" } }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createLead(req, res) {
  const { workspaceId } = req.params;
  const { name, email, phone, company, title, score, source, location, campaign, tags } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId },
      select: { id: true }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true, image: true }
    });

    const newLead = await prisma.lead.create({
      data: {
        workspaceId,
        name,
        email,
        phone: phone || "",
        company: company || "",
        title: title || "",
        status: "New",
        score: score ? parseInt(score) : 50,
        source: source || "Website",
        ownerName: dbUser?.name || "Nabin Sharma",
        ownerAvatar: dbUser?.image || "",
        location: location || "",
        campaign: campaign || "",
        tags: tags || "",
        activities: {
          create: {
            time: new Date().toLocaleString(),
            title: "Lead Created",
            desc: `Lead profile created manually by ${dbUser?.name || "Workspace Admin"}.`
          }
        }
      },
      include: { notes: true, tasks: true, deals: true, activities: true }
    });

    return res.json(newLead);
  } catch (error) {
    console.error("Error creating lead:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateLead(req, res) {
  const { workspaceId, leadId } = req.params;
  const { status, score, name, email, phone, company, title, tags } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId },
      select: { id: true }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId }
    });
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const dataToUpdate = {};
    if (status !== undefined) dataToUpdate.status = status;
    if (score !== undefined) dataToUpdate.score = parseInt(score);
    if (name !== undefined) dataToUpdate.name = name;
    if (email !== undefined) dataToUpdate.email = email;
    if (phone !== undefined) dataToUpdate.phone = phone;
    if (company !== undefined) dataToUpdate.company = company;
    if (title !== undefined) dataToUpdate.title = title;
    if (tags !== undefined) dataToUpdate.tags = tags;

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: dataToUpdate,
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: { createdAt: "asc" } },
        deals: { orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" } }
      }
    });

    if (status && status !== lead.status) {
      await prisma.leadActivity.create({
        data: {
          leadId,
          time: new Date().toLocaleString(),
          title: "Status Updated",
          desc: `Lead status changed from ${lead.status} to ${status}.`
        }
      });
    }

    return res.json(updatedLead);
  } catch (error) {
    console.error("Error updating lead:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function deleteLead(req, res) {
  const { workspaceId, leadId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId },
      select: { id: true }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, workspaceId }
    });
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }

    await prisma.lead.delete({
      where: { id: leadId }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting lead:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function importLeads(req, res) {
  const { workspaceId } = req.params;
  const { leads } = req.body;

  if (!leads || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: "Invalid data: leads array is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { workspaceId, userId: req.user.id }
    });
    if (!membership) {
      return res.status(403).json({ error: "Forbidden: Not a member of this workspace" });
    }

    const sanitizedLeads = leads.map(lead => {
      let parsedScore = 50;
      if (lead.score !== undefined && lead.score !== null && lead.score !== "") {
        const num = parseInt(lead.score, 10);
        if (!isNaN(num)) {
          parsedScore = Math.max(1, Math.min(100, num));
        }
      }

      return {
        workspaceId,
        name: String(lead.name || "Unnamed Lead").trim(),
        email: String(lead.email || "").trim().toLowerCase(),
        phone: lead.phone ? String(lead.phone).trim() : null,
        company: lead.company ? String(lead.company).trim() : null,
        title: lead.title ? String(lead.title).trim() : null,
        status: String(lead.status || "New").trim(),
        score: parsedScore,
        source: String(lead.source || "CSV Import").trim(),
        ownerName: lead.ownerName ? String(lead.ownerName).trim() : "Nabin Sharma",
        ownerAvatar: lead.ownerAvatar ? String(lead.ownerAvatar).trim() : null,
        location: lead.location ? String(lead.location).trim() : null,
        campaign: lead.campaign ? String(lead.campaign).trim() : "Bulk Import",
        tags: lead.tags ? String(lead.tags).trim() : "",
      };
    }).filter(lead => lead.email && lead.name);

    if (sanitizedLeads.length === 0) {
      return res.status(400).json({ error: "No valid leads with name and email found to import" });
    }

    const createdCount = await prisma.lead.createMany({
      data: sanitizedLeads,
      skipDuplicates: true
    });

    return res.json({ 
      success: true, 
      importedCount: createdCount.count,
      totalSubmitted: leads.length 
    });
  } catch (error) {
    console.error("Error importing leads:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ==========================================
// 2. LEAD TASKS
// ==========================================

export async function createLeadTask(req, res) {
  const { workspaceId, leadId } = req.params;
  const { title, dueDate, status = "Pending" } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Task title is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const task = await prisma.leadTask.create({
      data: {
        leadId,
        title,
        dueDate: dueDate ? new Date(dueDate) : null,
        status
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        time: new Date().toLocaleString(),
        title: "Task Assigned",
        desc: `New task "${title}" has been scheduled.`
      }
    });

    return res.json(task);
  } catch (error) {
    console.error("Error creating lead task:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateLeadTask(req, res) {
  const { workspaceId, taskId } = req.params;
  const { title, dueDate, status } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingTask = await prisma.leadTask.findUnique({
      where: { id: taskId },
      include: { lead: true }
    });
    if (!existingTask || existingTask.lead.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Task not found" });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (status !== undefined) updateData.status = status;

    const updatedTask = await prisma.leadTask.update({
      where: { id: taskId },
      data: updateData
    });

    if (status && status !== existingTask.status) {
      await prisma.leadActivity.create({
        data: {
          leadId: existingTask.leadId,
          time: new Date().toLocaleString(),
          title: "Task Status Updated",
          desc: `Task "${existingTask.title}" status changed to ${status}.`
        }
      });
    }

    return res.json(updatedTask);
  } catch (error) {
    console.error("Error updating lead task:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function deleteLeadTask(req, res) {
  const { workspaceId, taskId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingTask = await prisma.leadTask.findUnique({
      where: { id: taskId },
      include: { lead: true }
    });
    if (!existingTask || existingTask.lead.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Task not found" });
    }

    await prisma.leadTask.delete({
      where: { id: taskId }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: existingTask.leadId,
        time: new Date().toLocaleString(),
        title: "Task Removed",
        desc: `Task "${existingTask.title}" has been deleted.`
      }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting lead task:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ==========================================
// 3. LEAD NOTES
// ==========================================

export async function createLeadNote(req, res) {
  const { workspaceId, leadId } = req.params;
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const note = await prisma.leadNote.create({
      data: {
        leadId,
        content
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        time: new Date().toLocaleString(),
        title: "Note Added",
        desc: "New internal note added to lead profile."
      }
    });

    return res.json(note);
  } catch (error) {
    console.error("Error creating note:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateLeadNote(req, res) {
  const { workspaceId, noteId } = req.params;
  const { content } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingNote = await prisma.leadNote.findUnique({
      where: { id: noteId },
      include: { lead: true }
    });
    if (!existingNote || existingNote.lead.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Note not found" });
    }

    const updatedNote = await prisma.leadNote.update({
      where: { id: noteId },
      data: { content, updatedAt: new Date() }
    });

    return res.json(updatedNote);
  } catch (error) {
    console.error("Error updating note:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function deleteLeadNote(req, res) {
  const { workspaceId, noteId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingNote = await prisma.leadNote.findUnique({
      where: { id: noteId },
      include: { lead: true }
    });
    if (!existingNote || existingNote.lead.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Note not found" });
    }

    await prisma.leadNote.delete({
      where: { id: noteId }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: existingNote.leadId,
        time: new Date().toLocaleString(),
        title: "Note Deleted",
        desc: "Internal note has been removed."
      }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ==========================================
// 4. LEAD DEALS
// ==========================================

export async function createLeadDeal(req, res) {
  const { workspaceId, leadId } = req.params;
  const { value, stage = "Lead" } = req.body;

  if (!value) {
    return res.status(400).json({ error: "Deal value is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const deal = await prisma.leadDeal.create({
      data: {
        leadId,
        value: parseFloat(value),
        stage
      }
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        time: new Date().toLocaleString(),
        title: "Deal Created",
        desc: `New deal worth $${value} initialized at stage: ${stage}.`
      }
    });

    return res.json(deal);
  } catch (error) {
    console.error("Error creating deal:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function updateLeadDeal(req, res) {
  const { workspaceId, dealId } = req.params;
  const { value, stage } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingDeal = await prisma.leadDeal.findUnique({
      where: { id: dealId },
      include: { lead: true }
    });
    if (!existingDeal || existingDeal.lead.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Deal not found" });
    }

    const updateData = {};
    if (value !== undefined) updateData.value = parseFloat(value);
    if (stage !== undefined) updateData.stage = stage;

    const updatedDeal = await prisma.leadDeal.update({
      where: { id: dealId },
      data: updateData
    });

    if (stage && stage !== existingDeal.stage) {
      await prisma.leadActivity.create({
        data: {
          leadId: existingDeal.leadId,
          time: new Date().toLocaleString(),
          title: "Deal Stage Updated",
          desc: `Deal stage changed from ${existingDeal.stage} to ${stage}.`
        }
      });
    }

    return res.json(updatedDeal);
  } catch (error) {
    console.error("Error updating deal:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function deleteLeadDeal(req, res) {
  const { workspaceId, dealId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(403).json({ error: "Access denied" });
    }

    const existingDeal = await prisma.leadDeal.findUnique({
      where: { id: dealId },
      include: { lead: true }
    });
    if (!existingDeal || existingDeal.lead.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Deal not found" });
    }

    await prisma.leadDeal.delete({
      where: { id: dealId }
    });

    await prisma.leadActivity.create({
      data: {
        leadId: existingDeal.leadId,
        time: new Date().toLocaleString(),
        title: "Deal Deleted",
        desc: `Deal worth $${existingDeal.value} has been removed.`
      }
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error deleting deal:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
