import { prisma } from '../config/db.js';

/**
 * GET /api/public/blogs
 * Retrieves published blogs for a verified domain.
 */
export async function getPublicBlogs(req, res) {
  try {
    const rawDomain = req.query.domain;
    const slug = req.query.slug;

    if (!rawDomain) {
      return res.status(400).json({ error: "Domain parameter is required" });
    }

    // Clean domain format
    let domain = rawDomain.trim().toLowerCase();
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
    domain = domain.split('/')[0];

    // Find the verified domain in DB
    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: {
        domain: domain,
        isVerified: true
      }
    });

    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not registered or not verified in Postly" });
    }

    if (slug) {
      // Fetch a single blog post
      const post = await prisma.blogPost.findFirst({
        where: {
          domainId: domainRecord.id,
          slug: slug,
          status: "PUBLISHED"
        }
      });

      if (!post) {
        return res.status(404).json({ error: "Blog post not found or is in draft" });
      }

      return res.json({ success: true, post });
    }

    // Fetch all published blog posts for this domain
    const posts = await prisma.blogPost.findMany({
      where: {
        domainId: domainRecord.id,
        status: "PUBLISHED"
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, posts });

  } catch (error) {
    console.error("Public API blogs load error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/public/pixel
 * Retrieve floating widget settings.
 */
export async function getPublicWidget(req, res) {
  try {
    const domainId = req.query.domainId;

    if (!domainId) {
      return res.status(400).json({ error: "domainId parameter is required" });
    }

    const domainRecord = await prisma.verifiedDomain.findUnique({
      where: { id: domainId },
      select: {
        isVerified: true,
        widgetActive: true,
        widgetWhatsApp: true,
        widgetPhone: true,
        widgetMessage: true,
        widgetPosition: true,
        widgetColor: true
      }
    });

    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not registered or invalid ID" });
    }

    return res.json({ success: true, widget: domainRecord });
  } catch (error) {
    console.error("Error loading widget public config:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/public/pixel
 * Logs a tracking event from the public pixel js.
 */
export async function saveTrackingEvent(req, res) {
  try {
    const body = req.body;
    const { 
      domainId, 
      sessionId, 
      anonId,
      eventType, 
      url, 
      referrer, 
      eventData, 
      deviceType, 
      browser,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent
    } = body;

    // Validation
    if (!domainId || !sessionId || !eventType || !url) {
      return res.status(400).json({ error: "Missing required tracking parameters" });
    }

    // Verify domain exists
    const domainRecord = await prisma.verifiedDomain.findUnique({
      where: { id: domainId }
    });

    if (!domainRecord) {
      return res.status(400).json({ error: "Domain not registered or invalid ID" });
    }

    // Extract country from headers if available
    const country = req.headers["x-vercel-ip-country"] || 
                    req.headers["cf-ipcountry"] || 
                    "Local";

    // Stitch ID check: find if this anonId is already matched to a Lead
    let leadId = null;
    if (anonId) {
      const stitchedEvent = await prisma.webAnalyticsEvent.findFirst({
        where: { anonId, leadId: { not: null } },
        select: { leadId: true }
      });
      if (stitchedEvent) {
        leadId = stitchedEvent.leadId;
      }
    }

    // Save event to DB
    const event = await prisma.webAnalyticsEvent.create({
      data: {
        domainId,
        sessionId,
        anonId: anonId || null,
        leadId: leadId || null,
        eventType,
        url,
        referrer: referrer || null,
        eventData: eventData || null,
        deviceType: deviceType || "desktop",
        browser: browser || "unknown",
        country,
        utmSource: utmSource || null,
        utmMedium: utmMedium || null,
        utmCampaign: utmCampaign || null,
        utmTerm: utmTerm || null,
        utmContent: utmContent || null
      }
    });

    return res.json({ success: true, eventId: event.id });

  } catch (error) {
    console.error("Error logging pixel event:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/public/forms/:formId/submit
 * Retrieves public form layout config.
 */
export async function getPublicForm(req, res) {
  try {
    const { formId } = req.params;

    const form = await prisma.customForm.findUnique({
      where: { id: formId },
      select: {
        id: true,
        name: true,
        fields: true,
        submitButtonText: true,
        successMessage: true
      }
    });

    if (!form) {
      return res.status(404).json({ error: "Form not found" });
    }

    return res.json({ success: true, form });
  } catch (error) {
    console.error("Error loading public form config:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/public/forms/:formId/submit
 * Submits custom form data from public widget.
 */
export async function submitPublicForm(req, res) {
  try {
    const { formId } = req.params;
    const { data, anonId } = req.body;

    if (!data) {
      return res.status(400).json({ error: "Submission data payload is required" });
    }

    // Retrieve form config schema
    const formRecord = await prisma.customForm.findUnique({
      where: { id: formId }
    });

    if (!formRecord) {
      return res.status(404).json({ error: "Form not found" });
    }

    // Validate fields according to configuration schema
    const formFields = formRecord.fields || [];
    for (const field of formFields) {
      const value = data[field.id];
      if (field.required && (!value || String(value).trim() === "")) {
        return res.status(400).json({ error: `Field '${field.label}' is required` });
      }
    }

    // Extract metadata
    const userAgent = req.headers["user-agent"] || null;
    const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0] || null;
    const referrer = req.headers["referer"] || null;

    // Create form submission record in DB
    const submission = await prisma.formSubmission.create({
      data: {
        formId,
        data,
        userAgent,
        ipAddress,
        referrer
      }
    });

    // CRM Leads Sync Automation
    try {
      const emailField = formFields.find(f => f.type === "email");
      const email = emailField ? data[emailField.id] : null;

      let name = "Anonymous Visitor";
      const nameField = formFields.find(f => {
        const idLower = (f.id || "").toLowerCase();
        const labelLower = (f.label || "").toLowerCase();
        return idLower.includes("name") || labelLower.includes("name");
      });

      if (nameField && data[nameField.id]) {
        name = data[nameField.id].trim();
      }

      if (email && email.trim() !== "") {
        const cleanEmail = email.trim().toLowerCase();
        
        // Check if lead already exists in this workspace
        const existingLead = await prisma.lead.findFirst({
          where: {
            workspaceId: formRecord.workspaceId,
            email: cleanEmail
          }
        });

        let activeLeadId = null;
        if (!existingLead) {
          const createdLead = await prisma.lead.create({
            data: {
              workspaceId: formRecord.workspaceId,
              name: name,
              email: cleanEmail,
              source: `Web Form: ${formRecord.name}`,
              status: "New",
              score: 60,
              tags: "Web Form Submissions"
            }
          });
          activeLeadId = createdLead.id;
        } else {
          activeLeadId = existingLead.id;
        }

        // Stitch identity
        if (activeLeadId && anonId) {
          await prisma.webAnalyticsEvent.updateMany({
            where: { anonId: anonId },
            data: { leadId: activeLeadId }
          });
        }
      }
    } catch (crmErr) {
      console.error("CRM Leads automatic synchronization error:", crmErr);
    }

    return res.json({ 
      success: true, 
      message: formRecord.successMessage || "Form submitted successfully!",
      submissionId: submission.id 
    });

  } catch (error) {
    console.error("Error submitting form response:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
