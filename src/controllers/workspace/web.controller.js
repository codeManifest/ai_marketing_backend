import { prisma } from '../../config/db.js';
import { scrapeWebsite, crawlRealBacklinks } from '../../services/scraper-service.js';
import { generateAIContent } from '../../services/ai-generator-helper.js';
import { generateRawAIContent } from '../../services/ai-generator-helper.js';
import crypto from 'crypto';

// Helper to clean domain inputs
function cleanDomain(input) {
  if (!input) return "";
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  domain = domain.split('/')[0];
  return domain;
}

// Helper to generate clean url slug from text
function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") 
    .replace(/[\s_-]+/g, "-") 
    .replace(/^-+|-+$/g, "");
}

// Helper to check meta tags in HTML string
function checkMetaTag(html, token) {
  const metaRegex = /<meta\s+[^>]*>/gi;
  let match;
  while ((match = metaRegex.exec(html)) !== null) {
    const tag = match[0];
    const hasName = /name=["']postly-verification["']/i.test(tag);
    const hasContent = new RegExp(`content=["']${token}["']`, 'i').test(tag);
    if (hasName && hasContent) {
      return true;
    }
  }
  return false;
}

// ==========================================
// 1. VERIFIED DOMAINS
// ==========================================

export async function listDomains(req, res) {
  const { workspaceId } = req.params;
  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domains = await prisma.verifiedDomain.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ success: true, domains });
  } catch (error) {
    console.error("Error listing domains:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function addDomain(req, res) {
  const { workspaceId } = req.params;
  const rawDomain = req.body.domain;

  if (!rawDomain) {
    return res.status(400).json({ error: "Domain name is required" });
  }

  const domain = cleanDomain(rawDomain);
  if (!domain) {
    return res.status(400).json({ error: "Invalid domain format" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const existing = await prisma.verifiedDomain.findFirst({
      where: { workspaceId, domain }
    });
    if (existing) {
      return res.status(400).json({ error: "Domain already registered in this workspace" });
    }

    const verificationToken = `postly-verify-${crypto.randomBytes(16).toString("hex")}`;
    const newDomain = await prisma.verifiedDomain.create({
      data: {
        workspaceId,
        domain,
        verificationToken,
        isVerified: false
      }
    });

    return res.json({
      success: true,
      domain: newDomain,
      message: "Domain registered. Ownership verification required."
    });
  } catch (error) {
    console.error("Error adding domain:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function verifyDomain(req, res) {
  const { workspaceId } = req.params;
  const { domainId } = req.body;

  if (!domainId) {
    return res.status(400).json({ error: "Domain ID is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findUnique({
      where: { id: domainId }
    });
    if (!domainRecord || domainRecord.workspaceId !== workspaceId) {
      return res.status(404).json({ error: "Domain not found" });
    }

    if (domainRecord.isVerified) {
      return res.json({ success: true, verified: true, message: "Domain is already verified" });
    }

    const domain = domainRecord.domain;
    const token = domainRecord.verificationToken;
    let verified = false;
    let verificationMethod = null;
    let errorDetails = [];

    const isLocalDomain = 
      domain.includes("localhost") || 
      domain.includes("127.0.0.1") || 
      domain.endsWith(".local") || 
      domain.endsWith(".test") || 
      domain.endsWith(".localhost") || 
      domain.includes(":");

    if (isLocalDomain) {
      verified = true;
      verificationMethod = "LOCAL_BYPASS";
    }

    if (!verified) {
      const fileUrls = [
        `https://${domain}/postly-verification.html`,
        `http://${domain}/postly-verification.html`
      ];

      for (const url of fileUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "PostlyVerificationBot/1.0" }
          });
          clearTimeout(timeoutId);

          if (response.status === 200) {
            const text = await response.text();
            if (text.trim().includes(token)) {
              verified = true;
              verificationMethod = "HTML_FILE";
              break;
            } else {
              errorDetails.push(`File found at ${url} but token did not match.`);
            }
          } else {
            errorDetails.push(`Checked ${url}, returned status: ${response.status}`);
          }
        } catch (err) {
          errorDetails.push(`Failed to fetch ${url}: ${err.message}`);
        }
      }
    }

    if (!verified) {
      const rootUrls = [
        `https://${domain}/`,
        `http://${domain}/`
      ];

      for (const url of rootUrls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "PostlyVerificationBot/1.0" }
          });
          clearTimeout(timeoutId);

          if (response.status === 200) {
            const html = await response.text();
            if (checkMetaTag(html, token)) {
              verified = true;
              verificationMethod = "META_TAG";
              break;
            } else {
              errorDetails.push(`Root page ${url} fetched, but verification meta tag not found.`);
            }
          } else {
            errorDetails.push(`Checked root ${url}, returned status: ${response.status}`);
          }
        } catch (err) {
          errorDetails.push(`Failed to fetch root ${url}: ${err.message}`);
        }
      }
    }

    if (verified) {
      const updatedDomain = await prisma.verifiedDomain.update({
        where: { id: domainId },
        data: { isVerified: true, verifiedAt: new Date() }
      });

      return res.json({
        success: true,
        verified: true,
        method: verificationMethod,
        domain: updatedDomain,
        message: verificationMethod === "LOCAL_BYPASS"
          ? "Local development domain verified automatically!"
          : `Domain verified successfully using ${verificationMethod === "HTML_FILE" ? "HTML File" : "Meta Tag"}!`
      });
    } else {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Verification failed. We couldn't find the verification file or meta tag on your website.",
        details: errorDetails
      });
    }
  } catch (error) {
    console.error("Error verifying domain:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteDomain(req, res) {
  const { workspaceId, domainId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });

    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not found in this workspace" });
    }

    await prisma.verifiedDomain.delete({ where: { id: domainId } });

    return res.json({
      success: true,
      message: "Domain and all associated blogs, forms, and analytics deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting domain:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================
// 2. BLOG POSTS
// ==========================================

export async function listBlogs(req, res) {
  const { workspaceId, domainId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });
    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not found in this workspace" });
    }

    const posts = await prisma.blogPost.findMany({
      where: { domainId },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ success: true, posts });
  } catch (error) {
    console.error("Error fetching blog posts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function createBlog(req, res) {
  const { workspaceId, domainId } = req.params;
  const { title, content, summary, featuredImage, author, status } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required fields" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });
    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not found in this workspace" });
    }

    let slug = generateSlug(title);
    if (!slug) slug = `post-${Date.now()}`;

    const existingSlug = await prisma.blogPost.findFirst({
      where: { domainId, slug }
    });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
    }

    const post = await prisma.blogPost.create({
      data: {
        domainId,
        title,
        slug,
        content,
        summary: summary || null,
        featuredImage: featuredImage || null,
        author: author || req.user.name || "Admin",
        status: status || "DRAFT",
        publishedAt: status === "PUBLISHED" ? new Date() : null
      }
    });

    return res.json({ success: true, post, message: "Blog post created successfully" });
  } catch (error) {
    console.error("Error creating blog post:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function updateBlog(req, res) {
  const { workspaceId, domainId, blogId } = req.params;
  const { title, content, summary, featuredImage, author, status } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });
    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not found in this workspace" });
    }

    const existingPost = await prisma.blogPost.findUnique({
      where: { id: blogId }
    });
    if (!existingPost || existingPost.domainId !== domainId) {
      return res.status(404).json({ error: "Blog post not found" });
    }

    const updateData = {};
    if (title !== undefined) {
      updateData.title = title;
      if (title !== existingPost.title) {
        let newSlug = generateSlug(title);
        const duplicateSlug = await prisma.blogPost.findFirst({
          where: { domainId, slug: newSlug, id: { not: blogId } }
        });
        if (duplicateSlug) {
          newSlug = `${newSlug}-${Math.floor(Math.random() * 1000)}`;
        }
        updateData.slug = newSlug;
      }
    }
    if (content !== undefined) updateData.content = content;
    if (summary !== undefined) updateData.summary = summary;
    if (featuredImage !== undefined) updateData.featuredImage = featuredImage;
    if (author !== undefined) updateData.author = author;
    
    if (status !== undefined) {
      updateData.status = status;
      if (status === "PUBLISHED" && existingPost.status !== "PUBLISHED") {
        updateData.publishedAt = new Date();
      } else if (status === "DRAFT") {
        updateData.publishedAt = null;
      }
    }

    const updatedPost = await prisma.blogPost.update({
      where: { id: blogId },
      data: updateData
    });

    return res.json({ success: true, post: updatedPost, message: "Blog post updated successfully" });
  } catch (error) {
    console.error("Error updating blog post:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function deleteBlog(req, res) {
  const { workspaceId, domainId, blogId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const blogPost = await prisma.blogPost.findUnique({
      where: { id: blogId }
    });
    if (!blogPost || blogPost.domainId !== domainId) {
      return res.status(404).json({ error: "Blog post not found" });
    }

    await prisma.blogPost.delete({ where: { id: blogId } });

    return res.json({ success: true, message: "Blog post deleted successfully" });
  } catch (error) {
    console.error("Error deleting blog post:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function generateBlog(req, res) {
  const { workspaceId, domainId } = req.params;
  const { topic, keywords } = req.body;

  if (!topic) {
    return res.status(400).json({ error: "Topic/Brief description is required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId },
      select: { id: true }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });
    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not registered or invalid ID" });
    }

    const prompt = `
      Write a comprehensive, professional, SEO-optimized blog article based on the following instructions:
      
      Topic/Description: ${topic}
      Target Keywords: ${keywords || "None specified"}
      
      CRITICAL INSTRUCTIONS FOR HUMAN-LIKE WRITING STYLE (Strictly enforce):
      - DO NOT use any emojis.
      - DO NOT use excessive bullet points or template-like formatting. Use paragraphs, natural transitions, and authentic narrative style.
      - DO NOT use repetitive phrases, excessive bolding, or AI signature words (like "tapestry", "moreover", "testament", "delve", "furthermore", "beacon").
      - DO NOT use long dashes (—) or similar formatting conventions common in AI writing.
      - The writing style must feel like an expert human journalist or writer. It must flow naturally, be engaging, and carry authentic depth.
      - Use standard subheadings to divide sections, but keep them professional.
      
      SEO & FORMATTING RULES:
      - Integrate the keywords naturally. Do not stuff keywords.
      - Content must be structured in valid semantic HTML tags (such as <h2>, <h3>, <p>, <strong>, <ul>, <li>). Do not include <html>, <head>, or <body> tags. Just the raw inner HTML content.
      - Optimize the title and meta description (summary) for SEO clickability.
      
      Return a JSON object matching this schema:
      {
        "title": "string (Compelling, SEO-optimized title)",
        "slug": "string (URL-friendly slug based on the title)",
        "summary": "string (A compelling 1-2 sentence meta description summarizing the post)",
        "content": "string (The complete blog article content structured inside valid semantic HTML tags)"
      }
    `;

    const result = await generateAIContent(workspaceId, req.user.id, {
      topic,
      keywords,
      prompt,
      action: "WEBSITE_POST_GENERATION"
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to generate blog article." });
    }

    return res.json({
      success: true,
      article: result.article,
      creditsUsed: result.creditsUsed
    });
  } catch (error) {
    console.error("AI blog generation failed:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// ==========================================
// 3. WIDGET AND ANALYTICS
// ==========================================

export async function updateWidgetConfig(req, res) {
  const { workspaceId, domainId } = req.params;
  const { widgetActive, widgetWhatsApp, widgetPhone, widgetMessage, widgetPosition, widgetColor } = req.body;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });
    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not registered or invalid ID" });
    }

    const updatedDomain = await prisma.verifiedDomain.update({
      where: { id: domainId },
      data: {
        widgetActive: !!widgetActive,
        widgetWhatsApp: widgetWhatsApp || null,
        widgetPhone: widgetPhone || null,
        widgetMessage: widgetMessage || null,
        widgetPosition: widgetPosition || "bottom-right",
        widgetColor: widgetColor || "#7c3aed"
      }
    });

    return res.json({
      success: true,
      message: "Widget configuration updated successfully!",
      domain: updatedDomain
    });
  } catch (error) {
    console.error("Error updating widget configuration:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function getWebAnalytics(req, res) {
  const { workspaceId, domainId } = req.params;

  try {
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, workspaceId }
    });
    if (!membership) {
      return res.status(404).json({ error: "Workspace not found or access denied" });
    }

    const domainRecord = await prisma.verifiedDomain.findFirst({
      where: { id: domainId, workspaceId }
    });
    if (!domainRecord) {
      return res.status(404).json({ error: "Domain not found in this workspace" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const events = await prisma.webAnalyticsEvent.findMany({
      where: {
        domainId,
        createdAt: { gte: thirtyDaysAgo }
      },
      orderBy: { createdAt: "asc" }
    });

    const pageViews = events.filter(e => e.eventType === "PAGE_VIEW");
    const totalPageViews = pageViews.length;
    const uniqueSessions = new Set(events.map(e => e.sessionId)).size;

    const engagementEvents = events.filter(e => e.eventType === "ENGAGEMENT");
    const totalTimeSpent = engagementEvents.reduce((acc, e) => {
      const data = e.eventData;
      return acc + (data?.timeSpentSeconds || 0);
    }, 0);
    const avgTimeSpentSeconds = engagementEvents.length > 0 
      ? Math.round(totalTimeSpent / engagementEvents.length) 
      : 0;

    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dailyMap[dateStr] = 0;
    }

    pageViews.forEach(e => {
      const dateStr = new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (dailyMap[dateStr] !== undefined) {
        dailyMap[dateStr]++;
      }
    });
    const pageviewsChart = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    const devices = { desktop: 0, mobile: 0, tablet: 0 };
    pageViews.forEach(e => {
      const type = e.deviceType || "desktop";
      if (devices[type] !== undefined) {
        devices[type]++;
      } else {
        devices.desktop++;
      }
    });

    const browsers = {};
    pageViews.forEach(e => {
      const browserName = e.browser || "Other";
      browsers[browserName] = (browsers[browserName] || 0) + 1;
    });

    const pagesMap = {};
    pageViews.forEach(e => {
      pagesMap[e.url] = (pagesMap[e.url] || 0) + 1;
    });
    const topPages = Object.entries(pagesMap)
      .map(([url, count]) => ({ url, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const clicksMap = {};
    const clickEvents = events.filter(e => e.eventType === "CLICK");
    clickEvents.forEach(e => {
      const data = e.eventData;
      const text = data?.elementText || data?.elementId || "Unnamed Element";
      const key = `${data?.tag || "click"}:${text}`;
      if (!clicksMap[key]) {
        clicksMap[key] = {
          tag: data?.tag || "click",
          text: text,
          id: data?.elementId || "",
          count: 0
        };
      }
      clicksMap[key].count++;
    });
    const topClicks = Object.values(clicksMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const referrersMap = {};
    pageViews.forEach(e => {
      let ref = e.referrer || "Direct";
      if (ref !== "Direct") {
        try {
          ref = new URL(ref).hostname;
        } catch (_) {}
      }
      referrersMap[ref] = (referrersMap[ref] || 0) + 1;
    });
    const topReferrers = Object.entries(referrersMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const countriesMap = {};
    pageViews.forEach(e => {
      const country = e.country || "Local";
      countriesMap[country] = (countriesMap[country] || 0) + 1;
    });
    const topCountries = Object.entries(countriesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const campaignsMap = {};
    const sourcesMap = {};
    pageViews.forEach(e => {
      if (e.utmCampaign) campaignsMap[e.utmCampaign] = (campaignsMap[e.utmCampaign] || 0) + 1;
      if (e.utmSource) sourcesMap[e.utmSource] = (sourcesMap[e.utmSource] || 0) + 1;
    });
    const topCampaigns = Object.entries(campaignsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topSources = Object.entries(sourcesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const rageClicksMap = {};
    const rageClickEvents = events.filter(e => e.eventType === "RAGE_CLICK");
    const totalRageClicks = rageClickEvents.length;
    rageClickEvents.forEach(e => {
      const data = e.eventData;
      const text = data?.elementText || data?.elementId || "Unnamed Element";
      const key = `${data?.tag || "click"}:${text}`;
      if (!rageClicksMap[key]) {
        rageClicksMap[key] = {
          tag: data?.tag || "click",
          text: text,
          id: data?.elementId || "",
          count: 0
        };
      }
      rageClicksMap[key].count++;
    });
    const topRageClicks = Object.values(rageClicksMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const scrollEvents = events.filter(e => e.eventType === "SCROLL");
    const urlSessionScroll = {};
    scrollEvents.forEach(e => {
      const cleanUrl = e.url.split('?')[0];
      const data = e.eventData;
      const pct = data?.percentage || 0;
      if (!urlSessionScroll[cleanUrl]) urlSessionScroll[cleanUrl] = {};
      if (!urlSessionScroll[cleanUrl][e.sessionId] || pct > urlSessionScroll[cleanUrl][e.sessionId]) {
        urlSessionScroll[cleanUrl][e.sessionId] = pct;
      }
    });

    const scrollDepthMap = Object.entries(urlSessionScroll).map(([url, sessions]) => {
      const percents = Object.values(sessions);
      const sum = percents.reduce((acc, p) => acc + p, 0);
      const avg = percents.length > 0 ? Math.round(sum / percents.length) : 0;
      return { url, avgPercentage: avg, visitorCount: percents.length };
    }).sort((a, b) => b.visitorCount - a.visitorCount);

    return res.json({
      success: true,
      analytics: {
        totalPageViews,
        uniqueSessions,
        avgTimeSpentSeconds,
        pageviewsChart,
        devices,
        browsers,
        topPages,
        topClicks,
        topReferrers,
        topCountries,
        topCampaigns,
        topSources,
        totalRageClicks,
        topRageClicks,
        scrollDepthMap
      }
    });
  } catch (error) {
    console.error("Error loading analytics data:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ==========================================
// 4. SEO AUDIT AND KEYWORDS
// ==========================================

export async function querySEO(req, res) {
  const { workspaceId } = req.params;
  const { action, query, targetUrl } = req.body;

  if (!action) {
    return res.status(400).json({ error: "Action is required" });
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { brandProfile: true }
  });

  if (!workspace) {
    return res.status(404).json({ error: "Workspace not found" });
  }

  try {
    if (action === "overview-stats") {
      const websiteUrl = targetUrl || workspace.website;
      if (!websiteUrl) {
        return res.status(400).json({ error: "Please configure your website URL first." });
      }

      let scrapeData = { title: "", description: "" };
      let crawledLinks = [];
      try {
        scrapeData = await scrapeWebsite(websiteUrl);
        crawledLinks = await crawlRealBacklinks(websiteUrl);
      } catch (err) {
        console.warn("Could not crawl site for overview, continuing with domain estimation:", err.message);
      }

      const prompt = `
        You are an expert SEO metrics estimator. Analyze this crawled website:
        URL: ${websiteUrl}
        Title: ${scrapeData.title || "NOT FOUND"}
        Description: ${scrapeData.description || "NOT FOUND"}
        Heading Tags structure: H1 count: ${scrapeData.seoMetrics?.h1Count || 0}, H2 count: ${scrapeData.seoMetrics?.h2Count || 0}, H3 count: ${scrapeData.seoMetrics?.h3Count || 0}
        Images missing alt description tags: ${scrapeData.seoMetrics?.imagesMissingAlt || 0}
        Total anchor links: ${scrapeData.seoMetrics?.totalLinks || 0}
        HTTPS active: ${websiteUrl.toLowerCase().startsWith('https://') ? 'Yes' : 'No'}
        
        Real Crawled Referring Mentions/Backlinks:
        ${JSON.stringify(crawledLinks, null, 2)}
        
        Generate realistic, domain-specific SEO performance metrics and traffic trends.
        Evaluate the "technicalSeo" rating objects based on these real crawl metrics. If HTTPS is No, set https rating to Poor. If images are missing alt tags or H1 is missing, deduct points from Indexability.
        Use the real crawled backlinks to populate the backlinksProfile links list. If no backlinks are found, set them to empty or low values.
        
        Return a JSON object matching this schema:
        {
          "organicSessions": "string",
          "totalKeywords": "string",
          "avgPosition": "string",
          "ctr": "string",
          "backlinks": "string",
          "da": "string",
          "chartData": { "30days": [], "7days": [] },
          "topKeywords": [],
          "backlinksProfile": { "domain": "string", "dr": number, "totalBacklinks": "string", "referringDomains": number, "links": [] },
          "competitorAnalysis": { "domain": "string", "da": number, "organicTraffic": "string", "overlapPct": number, "keywords": [] },
          "technicalSeo": { "crawlability": "string", "siteSpeed": "string", "mobileFriendliness": "string", "https": "string", "indexability": "string" },
          "competitorComparison": []
        }
      `;

      const rawResult = await generateRawAIContent(prompt, { temperature: 0.2, responseMimeType: "application/json" });
      const parsedData = JSON.parse(rawResult.text);
      
      const currentSettings = typeof workspace.settings === 'object' && workspace.settings ? workspace.settings : {};
      parsedData.seoSettings = currentSettings.seoSettings || null;
      parsedData.trackedKeywords = currentSettings.trackedKeywords || null;
      
      return res.json({ success: true, data: parsedData });
    }

    if (action === "site-audit") {
      const websiteUrl = targetUrl || workspace.website;
      if (!websiteUrl) {
        return res.status(400).json({ error: "Please configure your website URL first." });
      }

      const startTime = Date.now();
      const scrapeData = await scrapeWebsite(websiteUrl);
      const endTime = Date.now();
      const loadTimeMs = Math.min(9999, endTime - startTime);

      const prompt = `
        You are Gemini Lighthouse, an advanced AI technical SEO auditor. 
        Perform a strict technical SEO audit on the following crawled webpage data:
        
        WEBSITE CRAWLED DATA:
        URL: ${scrapeData.url}
        Page Title: ${scrapeData.title || "NOT FOUND"}
        Meta Description: ${scrapeData.description || "NOT FOUND"}
        HTML Heading Distribution: H1 Count: ${scrapeData.seoMetrics?.h1Count || 0}, H2 Count: ${scrapeData.seoMetrics?.h2Count || 0}, H3 Count: ${scrapeData.seoMetrics?.h3Count || 0}
        Images count missing 'alt' attributes: ${scrapeData.seoMetrics?.imagesMissingAlt || 0}
        Total Anchor Links Count: ${scrapeData.seoMetrics?.totalLinks || 0}
        Page Response Time: ${loadTimeMs}ms
        Raw HTML excerpt: ${scrapeData.rawText?.substring(0, 1500) || ""}
        
        YOUR TASK:
        Analyze the details above. Identify all real issues, calculate the overall SEO health score (1-100), and compile specific recommendations.
        
        Return a JSON object matching this schema:
        {
          "score": number,
          "title": "string",
          "metaDescription": "string",
          "loadTimeMs": number,
          "metrics": { "critical": number, "warnings": number, "notices": number, "passed": number },
          "issues": [],
          "technicalSeo": { "crawlability": "string", "siteSpeed": "string", "mobileFriendliness": "string", "https": "string", "indexability": "string" }
        }
      `;

      const rawResult = await generateRawAIContent(prompt, { temperature: 0.2, responseMimeType: "application/json" });
      const auditResult = JSON.parse(rawResult.text);

      if (workspace.brandProfile) {
        const fixesList = auditResult.issues.map(iss => `${iss.title}: ${iss.desc}`);
        await prisma.brandProfile.update({
          where: { id: workspace.brandProfile.id },
          data: { criticalFixes: fixesList }
        });
      }

      return res.json({ success: true, data: auditResult });
    }

    if (action === "keyword-research") {
      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      const prompt = `
        You are an expert SEO specialist. Generate realistic, data-backed keyword search volume, difficulty, CPC, intent, and alternative variations for the query: "${query}".
        
        Return a JSON object matching this schema:
        {
          "keyword": "string",
          "volume": "string",
          "difficulty": number,
          "difficultyLabel": "string",
          "difficultyColor": "string",
          "cpc": "string",
          "intent": "string",
          "intentDesc": "string",
          "suggestions": []
        }
      `;

      const rawResult = await generateRawAIContent(prompt, { temperature: 0.3, responseMimeType: "application/json" });
      return res.json({ success: true, data: JSON.parse(rawResult.text) });
    }

    if (action === "backlink-check") {
      if (!query) {
        return res.status(400).json({ error: "Target domain query is required" });
      }

      const crawledLinks = await crawlRealBacklinks(query);

      const prompt = `
        You are an expert SEO backlinks auditor. Analyze this crawled backlinks data for target domain: "${query}".
        
        Crawled Mentions/Backlinks:
        ${JSON.stringify(crawledLinks, null, 2)}
        
        Return a JSON object matching this schema:
        {
          "domain": "${query}",
          "dr": number,
          "totalBacklinks": "string",
          "referringDomains": number,
          "dofollowPct": number,
          "nofollowPct": number,
          "ugcPct": number,
          "sponsoredPct": number,
          "links": []
        }
      `;

      const rawResult = await generateRawAIContent(prompt, { temperature: 0.2, responseMimeType: "application/json" });
      return res.json({ success: true, data: JSON.parse(rawResult.text) });
    }

    if (action === "competitor-analysis") {
      if (!query) {
        return res.status(400).json({ error: "Competitor domain is required" });
      }

      const myUrl = workspace.website || "Growthly.com";
      const prompt = `
        You are an expert competitive intelligence analyst. Compare the website "${myUrl}" (my site) with the competitor website "${query}".
        
        Return a JSON object matching this schema:
        {
          "domain": "string",
          "da": number,
          "organicTraffic": "string",
          "overlapPct": number,
          "sharedKeywordsCount": number,
          "competitorUniqueKeywords": number,
          "yourUniqueKeywords": number,
          "keywords": []
        }
      `;

      const rawResult = await generateRawAIContent(prompt, { temperature: 0.3, responseMimeType: "application/json" });
      return res.json({ success: true, data: JSON.parse(rawResult.text) });
    }

    if (action === "save-settings") {
      const { seoSettings } = req.body;
      const currentSettings = typeof workspace.settings === 'object' && workspace.settings ? workspace.settings : {};
      
      const updatedWorkspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          settings: { ...currentSettings, seoSettings }
        }
      });
      
      return res.json({ success: true, data: updatedWorkspace.settings });
    }

    if (action === "save-tracked-keywords") {
      const { trackedKeywords } = req.body;
      const currentSettings = typeof workspace.settings === 'object' && workspace.settings ? workspace.settings : {};
      
      const updatedWorkspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          settings: { ...currentSettings, trackedKeywords }
        }
      });
      
      return res.json({ success: true, data: updatedWorkspace.settings });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch (error) {
    console.error("💥 SEO AI tool query error:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze SEO parameters" });
  }
}
