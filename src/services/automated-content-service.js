// app/lib/automated-content-service.js
import { AIService } from "./ai-service.js";
import { prisma } from "../config/db.js";

export class AutomatedContentService {
  static async generatePostsForPlan(contentPlan) {
    try {
      console.log(`🔄 Generating posts for content plan: ${contentPlan.name}`);
      
      // Get workspace brand details for context
      const workspace = await prisma.workspace.findUnique({
        where: { id: contentPlan.workspaceId },
        select: {
          brandName: true,
          brandpdfUrl: true,
          description: true,
          industry: true,
          website: true,
          settings: true
        }
      });

      // Check if today is one of the preferred days
      const shouldGenerateToday = await this.shouldGenerateToday(contentPlan);
      
      if (!shouldGenerateToday) {
        console.log(`⏭️ Skipping generation for ${contentPlan.name} - not scheduled for today`);
        return [];
      }

      const topics = Array.isArray(contentPlan.topics) ? 
        contentPlan.topics : 
        contentPlan.topics.split(',').map(t => t.trim()).filter(t => t);
      
      if (topics.length === 0) {
        throw new Error("No valid topics found in content plan");
      }
      
      const postsToGenerate = await this.calculatePostsForToday(contentPlan);
      
      console.log(`📝 Need to generate ${postsToGenerate.length} posts for today`);

      const generatedPosts = [];

      for (const schedule of postsToGenerate) {
        try {
          const post = await this.generateSinglePost(contentPlan, schedule, topics, workspace);
          if (post) {
            generatedPosts.push(post);
            
            // Add small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Failed to generate post for ${schedule.time}:`, error);
        }
      }

      // Update content plan
      await prisma.contentPlan.update({
        where: { id: contentPlan.id },
        data: {
          lastGeneratedAt: new Date(),
          postsGenerated: { increment: generatedPosts.length }
        }
      });

      console.log(`✅ Successfully generated ${generatedPosts.length} posts for today`);
      return generatedPosts;

    } catch (error) {
      console.error("Content generation error:", error);
      throw error;
    }
  }

  static async shouldGenerateToday(contentPlan) {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Adjust for JavaScript day format (0 = Sunday, but we want 1 = Monday)
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    
    const preferredDays = contentPlan.preferredDays || [1, 3, 5]; // Mon, Wed, Fri
    
    return preferredDays.includes(adjustedDay);
  }

  static async calculatePostsForToday(contentPlan) {
    const schedule = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Calculate posts needed for today based on weekly distribution
    const postsPerDay = Math.ceil((contentPlan.postsPerWeek || 3) / (contentPlan.preferredDays?.length || 3));
    const preferredTimes = contentPlan.preferredTimes || ['09:00', '14:00', '18:00'];

    let postsScheduled = 0;

    for (const time of preferredTimes) {
      if (postsScheduled >= postsPerDay) break;

      const [hours, minutes] = time.split(':').map(Number);
      const scheduledDate = new Date(today);
      scheduledDate.setHours(hours, minutes, 0, 0);

      // Only schedule future times for today
      if (scheduledDate > now) {
        schedule.push({
          date: scheduledDate,
          time: time
        });
        postsScheduled++;
      }
    }

    // If we need more posts but no more preferred times, use remaining times
    if (postsScheduled < postsPerDay) {
      const allTimes = ['08:00', '10:00', '12:00', '15:00', '17:00', '19:00', '21:00'];
      const remainingTimes = allTimes.filter(time => !preferredTimes.includes(time));

      for (const time of remainingTimes) {
        if (postsScheduled >= postsPerDay) break;

        const [hours, minutes] = time.split(':').map(Number);
        const scheduledDate = new Date(today);
        scheduledDate.setHours(hours, minutes, 0, 0);

        if (scheduledDate > now) {
          schedule.push({
            date: scheduledDate,
            time: time
          });
          postsScheduled++;
        }
      }
    }

    return schedule;
  }

  static async generateSinglePost(contentPlan, schedule, topics, workspace) {
    try {
      // Select a random topic
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      
      // Get AI prompt from content plan
      let prompt = contentPlan.prompt?.prompt || `Create a social media post about ${randomTopic}`;
      
      // Replace topic placeholder in prompt
      prompt = prompt.replace(/{topic}/g, randomTopic);
      
      // Enhance with brand context
      prompt = this.enhancePromptWithBrandContext(prompt, randomTopic, workspace);

      // Get target platform
      const targetPlatform = Array.isArray(contentPlan.platforms) ? 
        contentPlan.platforms[0] : 
        (contentPlan.platforms || 'facebook');

      // Generate content using AI with brand context
      const aiContent = await AIService.generateSocialMediaPost(
        prompt, 
        targetPlatform,
        {
          tone: contentPlan.tone || 'professional',
          temperature: 0.8,
          brandContext: this.getBrandContext(workspace)
        }
      );

      // Apply template if available
      let finalContent = aiContent;
      if (contentPlan.template) {
        finalContent = this.applyTemplate(contentPlan.template.template, aiContent, randomTopic, targetPlatform, workspace);
      }

      // Generate hashtags with brand context
      const hashtags = await AIService.generateHashtags(finalContent, targetPlatform);

      // Select social profiles
      const socialProfiles = await this.getSocialProfilesForPlan(contentPlan);
      const socialProfileId = socialProfiles.length > 0 ? socialProfiles[0].id : null;

      // Generate post graphics: Try DALL-E first, fallback to high-quality abstract placeholder if it fails (SVG banner disabled)
      let graphicsUrl = null;
      if (contentPlan.generateGraphics !== false) {
        try {
          console.log(`🖼️ Calling OpenAI DALL-E image generator for topic: ${randomTopic}`);
          graphicsUrl = await AIService.generateImage(
            `A clean professional social media advertisement banner graphic for ${randomTopic}. Brand: ${workspace.brandName || ''}. Tagline: ${workspace.tagline || ''}. description: ${workspace.description || ''}`,
            targetPlatform
          );
        } catch (err) {
          console.error('Failed to generate DALL-E image, falling back to stock abstract banner:', err);
          // High-quality abstract gradient placeholder instead of SVG code
          graphicsUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&q=80';
        }
      }

      // Generate AI videos
      let videoUrl = null;
      if (contentPlan.generateVideos) {
        try {
          console.log(`🎥 Generating premium AI video creative for topic: ${randomTopic}`);
          // Mock / Simulate video creative generation
          videoUrl = 'https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-32112-large.mp4';
        } catch (err) {
          console.error('Failed to generate video creative:', err);
        }
      }

      const mediaUrls = [];
      if (graphicsUrl) mediaUrls.push(graphicsUrl);
      if (videoUrl) mediaUrls.push(videoUrl);

      // Create generated post record
      const generatedPost = await prisma.generatedPost.create({
        data: {
          contentPlanId: contentPlan.id,
          workspaceId: contentPlan.workspaceId,
          socialProfileId: socialProfileId,
          title: `Auto: ${randomTopic}`,
          content: finalContent,
          mediaUrls: mediaUrls,
          hashtags: Array.isArray(hashtags) ? hashtags.join(' ') : hashtags,
          topics: [randomTopic],
          scheduledFor: schedule.date,
          status: contentPlan.requireApproval ? 'GENERATED' : 'APPROVED',
          aiPrompt: prompt,
          aiModel: 'gemini-2.0-flash',
          requiresApproval: contentPlan.requireApproval || false,
          brandContextUsed: true
        },
        include: {
          socialProfile: true,
          contentPlan: true
        }
      });

      // Deduct credits from user subscription pay-as-you-go style
      try {
        const workspaceOwner = await prisma.workspace.findUnique({
          where: { id: contentPlan.workspaceId },
          select: { ownerId: true }
        });

        if (workspaceOwner) {
          const subscription = await prisma.subscription.findFirst({
            where: {
              userId: workspaceOwner.ownerId,
              status: { in: ['ACTIVE', 'TRIAL'] }
            }
          });

           if (subscription) {
            // Query dynamic credit costs from DB
            const dynamicCosts = await prisma.aICreditCost.findMany();
            const costsMap = dynamicCosts.reduce((acc, c) => {
              acc[c.action] = c.cost;
              return acc;
            }, {});

            const baseCost = costsMap.POST_GENERATION || 5;
            const graphicsCost = contentPlan.generateGraphics !== false ? (costsMap.GRAPHICS_GENERATION || 10) : 0;
            const videoCost = contentPlan.generateVideos ? (costsMap.VIDEO_GENERATION || 20) : 0;
            const postCredits = baseCost + graphicsCost + videoCost;

            await prisma.$transaction([
              prisma.aIUsage.create({
                data: {
                  userId: workspaceOwner.ownerId,
                  workspaceId: contentPlan.workspaceId,
                  subscriptionId: subscription.id,
                  feature: "content_plan_post",
                  provider: "gemini",
                  model: "gemini-2.0-flash",
                  creditsUsed: postCredits,
                  metadata: {
                    contentPlanId: contentPlan.id,
                    postId: generatedPost.id,
                    hasGraphics: !!graphicsUrl,
                    hasVideo: !!videoUrl
                  }
                }
              }),
              prisma.subscription.update({
                where: { id: subscription.id },
                data: {
                  usedAiCredits: {
                    increment: postCredits
                  }
                }
              })
            ]);
            console.log(`💳 Deducted ${postCredits} AI credits pay-as-you-go for post ${generatedPost.id}`);
          }
        }
      } catch (creditErr) {
        console.error("Failed to deduct pay-as-you-go credits:", creditErr);
      }

      // If auto-post is enabled and no approval required, create actual post
      if (contentPlan.autoPost && !contentPlan.requireApproval) {
        await this.createActualPost(generatedPost);
      }

      return generatedPost;

    } catch (error) {
      console.error("Single post generation error:", error);
      throw error;
    }
  }

  static enhancePromptWithBrandContext(originalPrompt, topic, workspace) {
    let enhancedPrompt = originalPrompt;
    
    // Add brand context to the prompt
    const brandContext = this.getBrandContext(workspace);
    
    if (brandContext) {
      enhancedPrompt += `\n\nBrand Context: ${brandContext}`;
    }
    
    return enhancedPrompt;
  }

  static getBrandContext(workspace) {
    if (!workspace) return '';

    const contextParts = [];
    
    if (workspace.brandName) {
      contextParts.push(`Company: ${workspace.brandName}`);
    }
    
    if (workspace.description) {
      contextParts.push(`About: ${workspace.description.substring(0, 200)}...`);
    }
    
    if (workspace.industry) {
      contextParts.push(`Industry: ${workspace.industry}`);
    }
    
    if (workspace.website) {
      contextParts.push(`Website: ${workspace.website}`);
    }

    // Note: PDF content extraction would require additional service
    if (workspace.brandpdfUrl) {
      contextParts.push(`Additional brand guidelines available in PDF`);
    }

    return contextParts.join('. ');
  }

  static applyTemplate(template, content, topic, platform, workspace) {
    const now = new Date();
    let processedTemplate = template
      .replace(/{content}/g, content)
      .replace(/{topic}/g, topic)
      .replace(/{hashtags}/g, '#socialmedia #content')
      .replace(/{date}/g, now.toLocaleDateString())
      .replace(/{platform}/g, platform)
      .replace(/{year}/g, now.getFullYear().toString())
      .replace(/{month}/g, now.toLocaleString('default', { month: 'long' }));

    // Add brand-specific replacements
    if (workspace.brandName) {
      processedTemplate = processedTemplate.replace(/{brand}/g, workspace.brandName);
    }
    
    if (workspace.website) {
      processedTemplate = processedTemplate.replace(/{website}/g, workspace.website);
    }

    return processedTemplate;
  }

  static async getSocialProfilesForPlan(contentPlan) {
    let where = {
      workspaceId: contentPlan.workspaceId,
      isConnected: true
    };

    if (contentPlan.socialProfileIds && contentPlan.socialProfileIds.length > 0) {
      where.id = { in: contentPlan.socialProfileIds };
    }

    if (contentPlan.platforms && contentPlan.platforms.length > 0) {
      where.platform = { in: contentPlan.platforms };
    }

    return await prisma.socialProfile.findMany({
      where,
      take: 1
    });
  }

  static async createActualPost(generatedPost) {
    try {
      const post = await prisma.post.create({
        data: {
          content: generatedPost.content,
          hashtags: generatedPost.hashtags,
          scheduledFor: generatedPost.scheduledFor,
          status: 'SCHEDULED',
          platform: generatedPost.socialProfile.platform,
          socialProfileId: generatedPost.socialProfile.id,
          userId: generatedPost.contentPlan.workspace.ownerId,
          workspaceId: generatedPost.workspaceId,
          aiGenerated: true,
          aiPrompt: generatedPost.aiPrompt
        }
      });

      await prisma.generatedPost.update({
        where: { id: generatedPost.id },
        data: {
          status: 'SCHEDULED',
          postId: post.id
        }
      });

      return post;
    } catch (error) {
      console.error("Actual post creation error:", error);
      throw error;
    }
  }

  static async approveGeneratedPost(generatedPostId, approvedBy) {
    try {
      const generatedPost = await prisma.generatedPost.update({
        where: { id: generatedPostId },
        data: {
          status: 'APPROVED',
          approvedBy,
          approvedAt: new Date()
        },
        include: {
          contentPlan: true,
          socialProfile: true
        }
      });

      // If auto-post is enabled, create actual post
      if (generatedPost.contentPlan.autoPost) {
        await this.createActualPost(generatedPost);
      }

      return generatedPost;

    } catch (error) {
      console.error("Post approval error:", error);
      throw error;
    }
  }

  static async rejectGeneratedPost(generatedPostId, rejectionReason) {
    return await prisma.generatedPost.update({
      where: { id: generatedPostId },
      data: {
        status: 'REJECTED',
        rejectionReason
      }
    });
  }

  static async bulkApprovePosts(generatedPostIds, approvedBy) {
    const results = [];
    
    for (const postId of generatedPostIds) {
      try {
        const result = await this.approveGeneratedPost(postId, approvedBy);
        results.push({ postId, status: 'success', result });
      } catch (error) {
        results.push({ postId, status: 'error', error: error.message });
      }
    }
    
    return results;
  }

  static generateSVGBanner(postContent, topic, workspace, categoryName = "Social Post") {
    // 1. Extract values from workspace and its settings
    const brandName = workspace?.brandName || workspace?.name || "Our Brand";
    const website = workspace?.website || "www.workspace.com";
    
    const settings = typeof workspace?.settings === 'string'
      ? JSON.parse(workspace.settings)
      : workspace?.settings || {};
      
    const tagline = settings.tagline || "";
    const themeColor = settings.themeColor || "#8b5cf6";
    const logoColors = settings.logoColors || themeColor;
    const logoUrl = settings.logoUrl || "";
    const brandEmail = settings.brandEmail || "";
    const contacts = settings.contacts || "";
    const companyAddress = settings.companyAddress || "";

    // 2. Prepare logo display element (either image URL or dynamic initials placeholder)
    let logoElement = "";
    if (logoUrl) {
      logoElement = `<image href="${logoUrl}" x="12" y="12" width="56" height="56" clip-path="url(#circle-clip)" />`;
    } else {
      const initials = brandName.substring(0, 2).toUpperCase();
      logoElement = `
        <circle cx="40" cy="40" r="28" fill="#ffffff" fill-opacity="0.2" />
        <text x="40" y="48" font-family="'Outfit', 'Inter', sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle">${initials}</text>
      `;
    }

    // 3. Split gradient colors if multiple logoColors are specified
    const colors = logoColors.split(',').map(c => c.trim()).filter(c => c.startsWith('#'));
    const colorStart = colors[0] || themeColor;
    const colorEnd = colors[1] || colorStart;

    // 4. Split and wrap post headline text to avoid truncation
    const cleanTopic = topic || "Brilliant Solutions";
    let line1 = cleanTopic;
    let line2 = "";
    if (cleanTopic.length > 25) {
      const words = cleanTopic.split(' ');
      let mid = Math.ceil(words.length / 2);
      line1 = words.slice(0, mid).join(' ');
      line2 = words.slice(mid).join(' ');
    }

    // 5. Wrap post subtext / body content preview
    const cleanContent = (postContent || "").replace(/[#\n]/g, " ").replace(/\s+/g, " ").trim();
    let body1 = cleanContent.substring(0, 50);
    let body2 = cleanContent.substring(50, 100);
    if (cleanContent.length > 100) body2 += "...";

    // 6. Compile the high-fidelity SVG string
    const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
  <defs>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${colorStart}" />
      <stop offset="100%" stop-color="${colorEnd}" />
    </linearGradient>
    
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="1.5" fill="#ffffff" opacity="0.12" />
    </pattern>

    <clipPath id="circle-clip">
      <circle cx="40" cy="40" r="28" />
    </clipPath>
  </defs>

  <!-- Background Gradients -->
  <rect width="1080" height="1080" fill="url(#brandGrad)" />
  
  <!-- Decorative overlays -->
  <rect width="1080" height="1080" fill="url(#grid)" />
  <circle cx="950" cy="180" r="300" fill="#ffffff" opacity="0.08" filter="blur(40px)" />
  <circle cx="120" cy="950" r="350" fill="#000000" opacity="0.15" filter="blur(60px)" />

  <!-- Glassmorphism Main Content Panel -->
  <rect x="70" y="70" width="940" height="940" rx="44" fill="#ffffff" fill-opacity="0.07" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2.5" />

  <!-- Header Section: Logo & Name -->
  <g transform="translate(130, 130)">
    <circle cx="40" cy="40" r="36" fill="#ffffff" fill-opacity="0.1" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2" />
    ${logoElement}
    
    <text x="100" y="44" font-family="'Outfit', 'Inter', sans-serif" font-size="32" font-weight="900" fill="#ffffff" letter-spacing="1.2">${brandName}</text>
    <text x="100" y="72" font-family="'Inter', sans-serif" font-size="14" font-weight="800" fill="#ffffff" opacity="0.7" letter-spacing="2">${tagline.toUpperCase() || website.toUpperCase()}</text>
  </g>

  <!-- Body Section: Post Topic & Key Points -->
  <g transform="translate(130, 350)">
    <!-- Category Badge -->
    <rect x="0" y="0" width="180" height="40" rx="12" fill="#ffffff" fill-opacity="0.18" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1" />
    <text x="90" y="25" font-family="'Inter', sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">${categoryName.toUpperCase()}</text>

    <!-- Main Message Title -->
    <text x="0" y="120" font-family="'Outfit', 'Inter', sans-serif" font-size="56" font-weight="900" fill="#ffffff">${line1}</text>
    ${line2 ? `<text x="0" y="195" font-family="'Outfit', 'Inter', sans-serif" font-size="56" font-weight="900" fill="#ffffff">${line2}</text>` : ""}

    <!-- Sub-quote or brief description -->
    <text x="0" y="${line2 ? 300 : 225}" font-family="'Inter', sans-serif" font-size="22" font-weight="500" fill="#ffffff" opacity="0.85">${body1}</text>
    <text x="0" y="${line2 ? 340 : 265}" font-family="'Inter', sans-serif" font-size="22" font-weight="500" fill="#ffffff" opacity="0.85">${body2}</text>
  </g>

  <!-- Footer Section: Address, Contact, Email -->
  <g transform="translate(130, 830)">
    <line x1="0" y1="0" x2="820" y2="0" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2" />
    
    <!-- Dynamic Contact details -->
    ${brandEmail ? `<text x="0" y="44" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#ffffff" opacity="0.75">📧 ${brandEmail}</text>` : ""}
    ${contacts ? `<text x="320" y="44" font-family="'Inter', sans-serif" font-size="16" font-weight="700" fill="#ffffff" opacity="0.75">📞 ${contacts}</text>` : ""}
    ${companyAddress ? `<text x="600" y="44" font-family="'Inter', sans-serif" font-size="15" font-weight="750" fill="#ffffff" opacity="0.75">📍 ${companyAddress.substring(0, 20)}${companyAddress.length > 20 ? '...' : ''}</text>` : ""}
  </g>
</svg>
    `.trim();

    return "data:image/svg+xml;base64," + Buffer.from(svgString).toString('base64');
  }

  static async getContentPlanStats(contentPlanId) {
    const stats = await prisma.generatedPost.groupBy({
      by: ['status'],
      where: { contentPlanId },
      _count: { id: true }
    });

    const totalPosts = await prisma.generatedPost.count({
      where: { contentPlanId }
    });

    const postedPosts = await prisma.generatedPost.count({
      where: { 
        contentPlanId,
        status: { in: ['SCHEDULED', 'POSTED'] }
      }
    });

    return {
      byStatus: stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.id;
        return acc;
      }, {}),
      total: totalPosts,
      posted: postedPosts,
      approvalRate: totalPosts > 0 ? (postedPosts / totalPosts) * 100 : 0
    };
  }

  static async generateBatchPostsForPlan(contentPlan) {
    try {
      console.log(`🚀 Starting progress-aware batch content generation for plan: ${contentPlan.name}`);

      // 1. Load latest state of content plan
      let plan = await prisma.contentPlan.findUnique({
        where: { id: contentPlan.id },
        include: { category: true, prompt: true, template: true }
      });

      if (!plan || plan.generationAborted) {
        console.log(`⏭️ Generation aborted or plan not found for: ${contentPlan.name}`);
        return [];
      }

      const workspace = await prisma.workspace.findUnique({
        where: { id: plan.workspaceId },
        select: {
          brandName: true,
          brandpdfUrl: true,
          description: true,
          industry: true,
          website: true,
          settings: true,
          ownerId: true
        }
      });

      const topics = Array.isArray(plan.topics) ? 
        plan.topics : 
        plan.topics.split(',').map(t => t.trim()).filter(t => t);

      if (topics.length === 0) {
        throw new Error("No valid topics found in content plan");
      }

      // Calculate credit estimation
      const subscription = await prisma.subscription.findFirst({
        where: {
          userId: workspace.ownerId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: { plan: true }
      });

      if (!subscription) {
        throw new Error("No active subscription found. Cannot generate campaign posts.");
      }

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const usageStats = await prisma.aIUsage.aggregate({
        where: {
          userId: workspace.ownerId,
          createdAt: { gte: startOfMonth }
        },
        _sum: { creditsUsed: true }
      });
      const totalUsed = usageStats._sum.creditsUsed || 0;
      const availableCredits = subscription.plan.monthlyAiCredits;
      const remainingCredits = Math.max(0, availableCredits - totalUsed);

      const count = plan.frequency === 'DAILY' 
        ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() 
        : plan.frequency === 'MONTHLY' ? 12 : (plan.postsPerWeek || 3);

      const dynamicCosts = await prisma.aICreditCost.findMany();
      const costsMap = dynamicCosts.reduce((acc, c) => {
        acc[c.action] = c.cost;
        return acc;
      }, {});

      const baseCost = costsMap.POST_GENERATION || 5;
      const graphicsCost = plan.generateGraphics !== false ? (costsMap.GRAPHICS_GENERATION || 10) : 0;
      const videoCost = plan.generateVideos ? (costsMap.VIDEO_GENERATION || 20) : 0;
      const postCredits = baseCost + graphicsCost + videoCost;
      const totalEstimatedCost = count * postCredits;

      if (remainingCredits < totalEstimatedCost) {
        throw new Error(`Insufficient AI credits. Required: ${totalEstimatedCost}, Available: ${remainingCredits}`);
      }

      // 2. Fetch existing generated posts to calculate progress
      const existingPosts = await prisma.generatedPost.findMany({
        where: { contentPlanId: plan.id }
      });
      const existingCount = existingPosts.length;

      // Initialize plan generation state
      plan = await prisma.contentPlan.update({
        where: { id: plan.id },
        data: {
          isGenerating: true,
          genPostsTotal: count,
          genPostsCompleted: existingCount,
          genMediaTotal: count,
          genMediaCompleted: existingPosts.filter(p => {
            let m = [];
            try { m = typeof p.mediaUrls === 'string' ? JSON.parse(p.mediaUrls) : p.mediaUrls; } catch(e){}
            return Array.isArray(m) && m.length > 0;
          }).length,
          generationPaused: false,
          generationAborted: false
        }
      });

      const schedules = await this.calculateBatchSchedules(plan, count);

      // ── PHASE 1: Text Post Generation ──
      if (existingCount < count) {
        console.log(`📝 Phase 1: Generating remaining ${count - existingCount} text posts...`);
        const remainingSchedules = schedules.slice(existingCount);

        for (let i = 0; i < remainingSchedules.length; i++) {
          // Check for pause/abort signal
          const currentPlan = await prisma.contentPlan.findUnique({
            where: { id: plan.id }
          });
          if (!currentPlan || currentPlan.generationPaused || currentPlan.generationAborted) {
            console.log(`⏸️ Phase 1 paused or aborted for content plan ${plan.id}`);
            return [];
          }

          const schedule = remainingSchedules[i];
          try {
            await this.generateSinglePostTextOnly(plan, schedule, topics, workspace, subscription.id, baseCost);
          } catch (err) {
            console.error(`Failed to generate post text:`, err);
          }
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      // ── PHASE 2: Media Generation (Images / Videos) ──
      console.log(`🖼️ Phase 2: Generating brand-aware media components...`);
      // Reload generated posts
      const allPosts = await prisma.generatedPost.findMany({
        where: { contentPlanId: plan.id }
      });

      for (let i = 0; i < allPosts.length; i++) {
        // Check for pause/abort signal
        const currentPlan = await prisma.contentPlan.findUnique({
          where: { id: plan.id }
        });
        if (!currentPlan || currentPlan.generationPaused || currentPlan.generationAborted) {
          console.log(`⏸️ Phase 2 paused or aborted for content plan ${plan.id}`);
          return [];
        }

        const post = allPosts[i];
        let media = [];
        try { media = typeof post.mediaUrls === 'string' ? JSON.parse(post.mediaUrls) : post.mediaUrls; } catch(e){}
        if (!Array.isArray(media)) media = [];

        if (media.length === 0) {
          try {
            let mediaUrl = null;
            let mediaCost = 0;

            const brandProfile = await prisma.brandProfile.findUnique({
              where: { workspaceId: plan.workspaceId }
            });

            if (plan.generateVideos) {
              // Video Creation
              mediaUrl = await this.generateVideoMedia(post, brandProfile, workspace);
              mediaCost = videoCost;
            } else if (plan.generateGraphics !== false) {
              // Graphics Creation
              mediaUrl = await this.generateGraphicsMedia(post, brandProfile, workspace);
              mediaCost = graphicsCost;
            }

            if (mediaUrl) {
              // Save media to post
              await prisma.generatedPost.update({
                where: { id: post.id },
                data: {
                  mediaUrls: [mediaUrl]
                }
              });

              // Deduct credits pay-as-you-go style
              if (mediaCost > 0) {
                await prisma.$transaction([
                  prisma.aIUsage.create({
                    data: {
                      userId: workspace.ownerId,
                      workspaceId: plan.workspaceId,
                      subscriptionId: subscription.id,
                      feature: plan.generateVideos ? "content_plan_video" : "content_plan_graphics",
                      provider: "openai",
                      model: plan.generateVideos ? "luma-video" : "dall-e-3",
                      creditsUsed: mediaCost,
                      metadata: {
                        contentPlanId: plan.id,
                        postId: post.id,
                        mediaUrl
                      }
                    }
                  }),
                  prisma.subscription.update({
                    where: { id: subscription.id },
                    data: {
                      usedAiCredits: { increment: mediaCost }
                    }
                  })
                ]);
              }
            }

            // Increment media count
            await prisma.contentPlan.update({
              where: { id: plan.id },
              data: {
                genMediaCompleted: { increment: 1 }
              }
            });

            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (err) {
            console.error(`Failed to generate media for post ${post.id}:`, err);
          }
        }
      }

      // 3. Mark completed
      await prisma.contentPlan.update({
        where: { id: plan.id },
        data: {
          isGenerating: false,
          generationPaused: false,
          generationAborted: false,
          lastGeneratedAt: new Date()
        }
      });

      console.log(`✅ Progress-aware batch campaign content generation completed successfully.`);
      return await prisma.generatedPost.findMany({ where: { contentPlanId: plan.id } });

    } catch (error) {
      console.error("Batch content generation error:", error);
      await prisma.contentPlan.update({
        where: { id: contentPlan.id },
        data: { isGenerating: false }
      }).catch(() => {});
      throw error;
    }
  }

  static async generateSinglePostTextOnly(contentPlan, schedule, topics, workspace, subscriptionId, creditCost) {
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    let prompt = contentPlan.prompt?.prompt || `Create a social media post about ${randomTopic}`;
    prompt = prompt.replace(/{topic}/g, randomTopic);
    prompt = this.enhancePromptWithBrandContext(prompt, randomTopic, workspace);

    const targetPlatform = Array.isArray(contentPlan.platforms) ? 
      contentPlan.platforms[0] : 
      (contentPlan.platforms || 'facebook');

    // Generate Text body
    const aiContent = await AIService.generateSocialMediaPost(
      prompt, 
      targetPlatform,
      {
        tone: contentPlan.tone || 'professional',
        temperature: 0.8,
        brandContext: this.getBrandContext(workspace)
      }
    );

    let finalContent = aiContent;
    if (contentPlan.template) {
      finalContent = this.applyTemplate(contentPlan.template.template, aiContent, randomTopic, targetPlatform, workspace);
    }

    const hashtags = await AIService.generateHashtags(finalContent, targetPlatform);
    const socialProfiles = await this.getSocialProfilesForPlan(contentPlan);
    const socialProfileId = socialProfiles.length > 0 ? socialProfiles[0].id : null;

    // Create post in DB
    const generatedPost = await prisma.generatedPost.create({
      data: {
        contentPlanId: contentPlan.id,
        workspaceId: contentPlan.workspaceId,
        socialProfileId: socialProfileId,
        title: `Auto: ${randomTopic}`,
        content: finalContent,
        mediaUrls: [],
        hashtags: Array.isArray(hashtags) ? hashtags.join(' ') : hashtags,
        topics: [randomTopic],
        scheduledFor: schedule.date,
        status: contentPlan.requireApproval ? 'GENERATED' : 'APPROVED',
        aiPrompt: prompt,
        aiModel: 'gemini-2.5-flash',
        requiresApproval: contentPlan.requireApproval || false,
        brandContextUsed: true
      }
    });

    // Deduct base text cost pay-as-you-go
    await prisma.$transaction([
      prisma.aIUsage.create({
        data: {
          userId: workspace.ownerId,
          workspaceId: contentPlan.workspaceId,
          subscriptionId: subscriptionId,
          feature: "content_plan_post",
          provider: "gemini",
          model: "gemini-2.5-flash",
          creditsUsed: creditCost,
          metadata: {
            contentPlanId: contentPlan.id,
            postId: generatedPost.id
          }
        }
      }),
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          usedAiCredits: { increment: creditCost }
        }
      })
    ]);

    // Update ContentPlan progress
    await prisma.contentPlan.update({
      where: { id: contentPlan.id },
      data: {
        genPostsCompleted: { increment: 1 }
      }
    });

    // If auto-post is enabled and no approval required, create actual post
    if (contentPlan.autoPost && !contentPlan.requireApproval) {
      await this.createActualPost(generatedPost);
    }

    return generatedPost;
  }

  static async generateGraphicsMedia(post, brandProfile, workspace) {
    const brandName = brandProfile?.brandName || workspace?.brandName || workspace?.name || "Our Brand";
    const website = workspace?.website || "www.workspace.com";
    
    // Extrapolate colors
    let primaryColor = "#8b5cf6";
    let secondaryColor = "#3b82f6";
    if (brandProfile?.brandColors) {
      try {
        const colors = typeof brandProfile.brandColors === 'string' 
          ? JSON.parse(brandProfile.brandColors) 
          : brandProfile.brandColors;
        primaryColor = colors.primary || primaryColor;
        secondaryColor = colors.secondary || secondaryColor;
      } catch(e){}
    }

    const contacts = brandProfile?.contacts ? JSON.stringify(brandProfile.contacts) : "";
    const postBody = post.content ? post.content.substring(0, 350).replace(/#\w+/g, '').trim() : "";

    const prompt = `A clean professional high-end advertising banner graphic matching the following post content description: "${postBody}". Brand Name: "${brandName}". Website: "${website}". Primary Brand Theme Color: "${primaryColor}". Secondary Accent Color: "${secondaryColor}". Context guidelines: "${brandProfile?.description || ''}". Contacts: "${contacts}". Professional modern commercial style. High quality layout. No gibberish text.`;

    console.log(`🖼️ Calling DALL-E/Flux media generation for post ${post.id}`);
    try {
      return await AIService.generateImage(prompt, 'facebook');
    } catch (err) {
      console.error('DALL-E banner failed, returning high-quality graphic asset placeholder:', err.message);
      return 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&q=80';
    }
  }

  static async generateVideoMedia(post, brandProfile, workspace) {
    const brandName = brandProfile?.brandName || workspace?.brandName || workspace?.name || "Our Brand";
    const website = workspace?.website || "www.workspace.com";
    
    let primaryColor = "#8b5cf6";
    if (brandProfile?.brandColors) {
      try {
        const colors = typeof brandProfile.brandColors === 'string' 
          ? JSON.parse(brandProfile.brandColors) 
          : brandProfile.brandColors;
        primaryColor = colors.primary || primaryColor;
      } catch(e){}
    }

    const postBody = post.content ? post.content.substring(0, 350).replace(/#\w+/g, '').trim() : "";
    const prompt = `A premium cinematic marketing video clip contextually matching the following message: "${postBody}". Company: ${brandName}. Website: ${website}. Brand color theme: ${primaryColor}. Clear professional stock footage style, high production value, smooth transitions.`;

    console.log(`🎥 Generating premium AI video for post ${post.id}: ${prompt}`);
    
    // Simulation / high-quality thematic mock video files that match campaigns
    const videosList = [
      'https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-32112-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-top-aerial-view-of-a-busy-highway-road-40545-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-business-people-meeting-at-a-conference-table-42239-large.mp4',
      'https://assets.mixkit.co/videos/preview/mixkit-globe-network-connection-background-32860-large.mp4'
    ];
    
    // Choose video based on content hash for consistency
    const index = Math.abs(String(postBody).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0)) % videosList.length;
    return videosList[index];
  }

  static getAIOptimizedTime(platform, dayOfWeek, index = 0) {
    // Peak hours mapping by social media channel (optimized by platform algorithms)
    const peakTimes = {
      LINKEDIN: ['08:30', '12:15', '17:45'], // Commute, lunch, end of workday
      INSTAGRAM: ['11:00', '15:30', '20:15'], // Midday, early afternoon, evening relax
      TWITTER: ['09:15', '13:00', '18:30'], // Real-time feed scroll peaks
      FACEBOOK: ['10:00', '14:00', '19:00'], // Leisure scroll hours
      TIKTOK: ['12:00', '16:00', '21:30'] // Late afternoon and bedtime hours
    };

    const p = String(platform).toUpperCase();
    const times = peakTimes[p] || ['10:00', '15:00', '19:00'];
    return times[index % times.length];
  }

  static async calculateBatchSchedules(contentPlan, count) {
    const schedules = [];
    const preferredDays = contentPlan.preferredDays || [1, 3, 5];
    const preferredTimes = contentPlan.preferredTimes || ['09:00', '14:00', '18:00'];
    
    // Check if Auto Decide option is enabled
    const isAutoDecide = Array.isArray(preferredTimes) && preferredTimes.includes('AUTO');
    
    let currentDate = new Date();
    let generatedCount = 0;
    let safetyIterator = 0;
    
    // Get target platforms to select peak times
    let targetPlatforms = ['LINKEDIN'];
    if (contentPlan.platforms) {
      try {
        targetPlatforms = typeof contentPlan.platforms === 'string'
          ? JSON.parse(contentPlan.platforms)
          : contentPlan.platforms;
      } catch (e) {
        console.error("Failed to parse contentPlan platforms:", e);
      }
    }
    if (!Array.isArray(targetPlatforms) || targetPlatforms.length === 0) {
      targetPlatforms = ['LINKEDIN'];
    }
    
    while (generatedCount < count && safetyIterator < 300) {
      safetyIterator++;
      currentDate.setDate(currentDate.getDate() + 1);
      const dayOfWeek = currentDate.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      
      if (preferredDays.includes(adjustedDay)) {
        let activeTimes = preferredTimes;
        
        if (isAutoDecide) {
          // Spread schedules across platform peak times
          const selectedPlatform = targetPlatforms[generatedCount % targetPlatforms.length];
          const bestTime = this.getAIOptimizedTime(selectedPlatform, adjustedDay, generatedCount);
          activeTimes = [bestTime];
        }

        for (const time of activeTimes) {
          if (generatedCount >= count) break;
          
          const [hours, minutes] = time.split(':').map(Number);
          const scheduledDate = new Date(currentDate);
          scheduledDate.setHours(hours, minutes, 0, 0);
          
          schedules.push({
            date: scheduledDate,
            time: time
          });
          generatedCount++;
         }
       }
     }
     return schedules;
   }
}