import { prisma } from '../config/db.js';
import { AIService } from '../services/ai-service.js';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Cache for credit checks (5 minutes)
const creditCache = new Map();

// Rate limiter configuration
const rateLimiter = new RateLimiterMemory({
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
});

// Helper functions for AI generation

async function generatePostContent(prompt, platform, options) {
  try {
    const content = await AIService.generateSocialMediaPost(prompt, platform, {
      temperature: options.temperature || 0.8,
      maxTokens: options.maxTokens || 300,
      tone: options.tone || 'professional',
      model: options.model
    });

    return { 
      content,
      prompt
    };
  } catch (error) {
    console.error('Post content generation error:', error);
    throw new Error(`Failed to generate post content: ${error.message}`);
  }
}

async function generateCompletePost(prompt, platform, options) {
  try {
    const completePost = await AIService.generateCompletePost(prompt, platform, {
      tone: options.tone || 'professional',
      generateImage: options.generateImage !== false,
      imageOptions: options.imageOptions || {},
      model: options.model
    });

    return {
      content: completePost.content,
      imageUrl: completePost.imageUrl,
      hashtags: completePost.hashtags,
      suggestedPlatform: platform,
      prompt
    };
  } catch (error) {
    console.error('Complete post generation error:', error);
    throw new Error(`Failed to generate complete post: ${error.message}`);
  }
}

async function generateImage(prompt, platform, options) {
  try {
    const imageUrl = await AIService.generateImage(prompt, platform, {
      model: options.model,
      size: options.size,
      quality: options.quality,
      style: options.style,
      ...options.imageOptions
    });

    return { 
      imageUrl,
      prompt,
      platform,
      dimensions: AIService.getPlatformImageSize(platform)
    };
  } catch (error) {
    console.error('Image generation error:', error);
    throw new Error(`Failed to generate image: ${error.message}`);
  }
}

async function generateHashtags(content, platform) {
  try {
    const hashtags = await AIService.generateHashtags(content, platform);
    
    return {
      hashtags: Array.isArray(hashtags) ? hashtags : hashtags.split(',').map(tag => tag.trim()),
      count: Array.isArray(hashtags) ? hashtags.length : hashtags.split(',').length,
      content
    };
  } catch (error) {
    console.error('Hashtag generation error:', error);
    throw new Error(`Failed to generate hashtags: ${error.message}`);
  }
}

async function optimizeContent(content, platform) {
  try {
    const optimizedContent = await AIService.optimizePost(content, platform);
    
    return {
      original: content,
      optimized: optimizedContent,
      improvements: await analyzeImprovements(content, optimizedContent)
    };
  } catch (error) {
    console.error('Content optimization error:', error);
    throw new Error(`Failed to optimize content: ${error.message}`);
  }
}

async function analyzeEngagement(content, platform) {
  try {
    const analysis = await AIService.analyzeEngagement(content, platform);
    
    return {
      analysis,
      platform,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...'
    };
  } catch (error) {
    console.error('Engagement analysis error:', error);
    throw new Error(`Failed to analyze engagement: ${error.message}`);
  }
}

async function generateVariations(content, platform, variations = 3) {
  try {
    const variationsList = await AIService.generateContentVariations(content, platform, variations);
    
    return {
      original: content,
      variations: variationsList,
      count: variationsList.length
    };
  } catch (error) {
    console.error('Variations generation error:', error);
    throw new Error(`Failed to generate content variations: ${error.message}`);
  }
}

async function generateMultiplePosts(topic, platform, count = 3) {
  try {
    const posts = await AIService.generateMultiplePosts(topic, [platform], count);
    
    return {
      topic,
      posts: posts.map((post, index) => ({
        id: index + 1,
        content: post.content,
        platform: post.platform
      })),
      count: posts.length
    };
  } catch (error) {
    console.error('Multiple posts generation error:', error);
    throw new Error(`Failed to generate multiple posts: ${error.message}`);
  }
}

async function generateBatchImages(prompt, platforms = ['instagram', 'twitter', 'facebook', 'linkedin']) {
  try {
    const images = await AIService.generateImagesForAllPlatforms(prompt, {
      quality: 'standard',
      style: 'vivid'
    });

    return {
      prompt,
      images: Object.entries(images).map(([platform, url]) => ({
        platform,
        url,
        dimensions: AIService.getPlatformImageSize(platform)
      })),
      count: Object.keys(images).length
    };
  } catch (error) {
    console.error('Batch images generation error:', error);
    throw new Error(`Failed to generate batch images: ${error.message}`);
  }
}

async function generateMultiPlatformPost(prompt, options = {}) {
  try {
    const content = await AIService.createMultiPlatformPost(prompt, {
      temperature: options.temperature || 0.8,
      maxTokens: options.maxTokens || 300,
      tone: options.tone || 'professional'
    });

    return {
      content,
      prompt,
      platforms: ['facebook', 'instagram', 'twitter', 'linkedin'],
      isMultiPlatform: true
    };
  } catch (error) {
    console.error('Multi-platform post generation error:', error);
    throw new Error(`Failed to generate multi-platform post: ${error.message}`);
  }
}

async function generateTrendingPost(topic, platform, brandContext = '') {
  try {
    const content = await AIService.generateTrendingPost(topic, platform, brandContext);
    
    return {
      content,
      prompt: topic,
      platform,
      isTrending: true,
      brandContext: brandContext || undefined
    };
  } catch (error) {
    console.error('Trending post generation error:', error);
    throw new Error(`Failed to generate trending post: ${error.message}`);
  }
}

async function generateBlogPost(topic, wordCount = 800, brandContext = '') {
  try {
    const content = await AIService.generateAIBlogPost(topic, wordCount, brandContext);
    
    return {
      content,
      prompt: topic,
      wordCount: content.length,
      type: 'blog_post',
      brandContext: brandContext || undefined
    };
  } catch (error) {
    console.error('Blog post generation error:', error);
    throw new Error(`Failed to generate blog post: ${error.message}`);
  }
}

async function generateEmailNewsletter(topic, brandContext = '') {
  try {
    const content = await AIService.generateEmailNewsletter(topic, brandContext);
    
    return {
      content,
      prompt: topic,
      type: 'email_newsletter',
      brandContext: brandContext || undefined
    };
  } catch (error) {
    console.error('Email newsletter generation error:', error);
    throw new Error(`Failed to generate email newsletter: ${error.message}`);
  }
}

async function generateWebSearchContent(prompt, options = {}) {
  try {
    const content = await AIService.generateContentWithWebSearch(prompt, {
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 500,
      model: options.model
    });

    return {
      content,
      prompt,
      hasWebSearch: true,
      type: 'web_search_content'
    };
  } catch (error) {
    console.error('Web search content generation error:', error);
    throw new Error(`Failed to generate web search content: ${error.message}`);
  }
}

async function analyzeImprovements(original, optimized) {
  try {
    const prompt = `Compare these two social media posts and list 2-3 key improvements in the optimized version. Be concise.\n\nOriginal: "${original}"\n\nOptimized: "${optimized}"`;
    
    const analysis = await AIService.generateContent(prompt, {
      maxTokens: 150,
      temperature: 0.3
    });

    return analysis;
  } catch (error) {
    console.error('Improvements analysis error:', error);
    return "Unable to analyze improvements at this time.";
  }
}

// Controller Handlers

/**
 * POST /api/ai/generate-content
 * Handles social media posts, complete posts, images, variations, optimize, trending and blog generation.
 */
export async function generateContent(req, res) {
  const userId = req.user.id;

  // Rate limiting check
  try {
    await rateLimiter.consume(userId);
  } catch (rateLimitError) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  let { 
    prompt, 
    platform, 
    type = 'post', 
    workspaceId,
    options = {},
    provider: requestedProvider
  } = req.body;

  // Input validation
  if (!prompt || !platform || !workspaceId) {
    return res.status(400).json({ error: "Prompt, platform, and workspace ID are required" });
  }

  if (prompt.length > 1000) {
    return res.status(400).json({ error: "Prompt too long. Maximum 1000 characters allowed." });
  }

  const validPlatforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok', 'pinterest', 'all'];
  if (!validPlatforms.includes(platform.toLowerCase())) {
    return res.status(400).json({ 
      error: "Invalid platform. Supported: facebook, instagram, twitter, linkedin, tiktok, pinterest, all" 
    });
  }

  if (requestedProvider && !AIService.getAvailableProviders().includes(requestedProvider.toLowerCase())) {
    return res.status(400).json({ 
      error: `Invalid provider. Supported: ${AIService.getAvailableProviders().join(', ')}` 
    });
  }

  if (type === 'optimize' && prompt.length < 10) {
    return res.status(400).json({ error: "Content to optimize must be at least 10 characters long" });
  }

  console.log('🚀 AI Generation Request:', {
    userId,
    workspaceId,
    type,
    platform,
    provider: requestedProvider || 'auto',
    promptLength: prompt.length,
    options
  });

  try {
    // Validate workspace access
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        workspaceId
      },
      select: { id: true }
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    // Fetch workspace settings to pass brand voice options
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, settings: true }
    });

    const workspaceSettings = workspace?.settings 
      ? (typeof workspace.settings === 'string' ? JSON.parse(workspace.settings) : workspace.settings)
      : {};

    const brandVoiceOptions = {
      brandName: workspace?.name || '',
      logoUrl: workspaceSettings.logoUrl || '',
      themeColor: workspaceSettings.themeColor || '',
      logoColors: workspaceSettings.logoColors || '',
      companyAddress: workspaceSettings.companyAddress || '',
      contacts: workspaceSettings.contacts || '',
      brandEmail: workspaceSettings.brandEmail || ''
    };

    // Inject brand voice settings into options
    options = {
      ...options,
      ...brandVoiceOptions,
      imageOptions: {
        ...(options?.imageOptions || {}),
        ...brandVoiceOptions
      }
    };

    // Check AI credits with caching
    const cacheKey = `${userId}-${new Date().getMonth()}-${new Date().getFullYear()}`;
    let creditInfo = creditCache.get(cacheKey);
    
    if (!creditInfo) {
      const userSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: { 
          plan: {
            select: { monthlyAiCredits: true, name: true }
          } 
        }
      });

      if (!userSubscription) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      // Calculate monthly usage
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const usedCredits = await prisma.aIUsage.aggregate({
        where: {
          userId,
          createdAt: { gte: startOfMonth }
        },
        _sum: { creditsUsed: true }
      });

      creditInfo = {
        totalUsed: usedCredits._sum.creditsUsed || 0,
        availableCredits: userSubscription.plan.monthlyAiCredits,
        subscription: userSubscription
      };

      creditCache.set(cacheKey, creditInfo);
      setTimeout(() => creditCache.delete(cacheKey), 5 * 60 * 1000);
    }

    const { totalUsed, availableCredits, subscription } = creditInfo;

    const estimatedCredits = AIService.estimateCredits(type, { ...options, platform });
    
    if (totalUsed + estimatedCredits > availableCredits) {
      return res.status(402).json({ 
        error: "Insufficient AI credits", 
        details: {
          used: totalUsed,
          available: availableCredits,
          required: estimatedCredits,
          remaining: availableCredits - totalUsed
        }
      });
    }

    // Auto-select or switch provider
    let providerName = requestedProvider;
    if (!providerName) {
      const contentTypeMap = {
        'post': 'social_media',
        'complete_post': 'social_media',
        'image': 'creative_writing',
        'hashtags': 'concise_content',
        'optimize': 'analytical_content',
        'analyze': 'analytical_content',
        'variations': 'creative_writing',
        'multiple_posts': 'social_media',
        'batch_images': 'creative_writing',
        'multi_platform_post': 'social_media',
        'trending_post': 'trending_content',
        'blog_post': 'blog_posts',
        'email_newsletter': 'creative_writing'
      };
      
      const contentType = contentTypeMap[type] || 'social_media';
      providerName = await AIService.autoSelectProvider(contentType, prompt);
    }

    AIService.switchProvider(providerName);
    const currentProvider = AIService.getCurrentProviderName();

    let result = {};
    let creditsUsed = 0;
    let validationResult = null;

    console.log(`🔄 Starting AI generation with ${currentProvider} for type:`, type);

    const generationPromise = (async () => {
      switch (type) {
        case 'post':
          result = await generatePostContent(prompt, platform, options);
          creditsUsed = AIService.estimateCredits('post', { platform });
          
          if (options.generateImage) {
            console.log(`🖼️ Generating image with Flux model`);
            const imagePrompt = `Post Caption: "${result.content}". Visual Prompt: ${options.imagePrompt || prompt}`;
            const imgResult = await generateImage(imagePrompt, platform, {
              ...options,
              model: options.imageModel
            });
            result.imageUrl = imgResult.imageUrl;
            creditsUsed += AIService.estimateCredits('image', { platform });
          }
          break;

        case 'complete_post':
          result = await generateCompletePost(prompt, platform, options);
          creditsUsed = AIService.estimateCredits('complete_post', { platform });
          break;

        case 'image':
          result = await generateImage(prompt, platform, options);
          creditsUsed = AIService.estimateCredits('image', { platform });
          break;

        case 'hashtags':
          result = await generateHashtags(prompt, platform);
          creditsUsed = AIService.estimateCredits('hashtags', { platform });
          break;

        case 'optimize':
          result = await optimizeContent(prompt, platform);
          creditsUsed = AIService.estimateCredits('optimize', { platform });
          break;

        case 'analyze':
          result = await analyzeEngagement(prompt, platform);
          creditsUsed = AIService.estimateCredits('analyze', { platform });
          break;

        case 'variations':
          result = await generateVariations(prompt, platform, options.variations || 3);
          creditsUsed = AIService.estimateCredits('variations', { 
            platform, 
            variations: options.variations || 3 
          });
          break;

        case 'multiple_posts':
          result = await generateMultiplePosts(prompt, platform, options.count || 3);
          creditsUsed = AIService.estimateCredits('multiple_posts', { 
            platform, 
            count: options.count || 3 
          });
          break;

        case 'batch_images':
          result = await generateBatchImages(prompt, options.platforms);
          creditsUsed = AIService.estimateCredits('batch_images', { 
            platforms: options.platforms?.length || 1 
          });
          break;

        case 'multi_platform_post':
          result = await generateMultiPlatformPost(prompt, options);
          creditsUsed = AIService.estimateCredits('post', { platform: 'all' });
          break;

        case 'trending_post':
          result = await generateTrendingPost(prompt, platform, options.brandContext);
          creditsUsed = AIService.estimateCredits('post', { platform });
          break;

        case 'blog_post':
          result = await generateBlogPost(prompt, options.wordCount || 800, options.brandContext);
          creditsUsed = AIService.estimateCredits('blog_post', {});
          break;

        case 'email_newsletter':
          result = await generateEmailNewsletter(prompt, options.brandContext);
          creditsUsed = AIService.estimateCredits('email_newsletter', {});
          break;

        case 'web_search_content':
          result = await generateWebSearchContent(prompt, options);
          creditsUsed = AIService.estimateCredits('post', { platform });
          break;

        default:
          throw new Error("Invalid generation type");
      }

      if (['post', 'complete_post', 'optimize', 'variations', 'trending_post', 'blog_post', 'email_newsletter'].includes(type) && result.content) {
        validationResult = AIService.validateContentSeparation(prompt, result.content);
      }
    })();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Generation timeout')), 45000);
    });

    await Promise.race([generationPromise, timeoutPromise]);

    const modelInfo = await AIService.getModelInfo();

    // Track usage in db (batch non-blocking actions)
    Promise.all([
      prisma.aIUsage.create({
        data: {
          userId,
          workspaceId,
          feature: type,
          creditsUsed: creditsUsed,
          inputTokens: prompt.length,
          outputTokens: result.content?.length || result.analysis?.length || 0,
          provider: currentProvider,
          model: modelInfo.name,
          details: {
            platform,
            options,
            type,
            provider: currentProvider,
            model: modelInfo.name,
            contentSeparationScore: validationResult?.score,
            promptLength: prompt.length,
            outputLength: result.content?.length || result.analysis?.length || 0,
            capabilities: AIService.getProviderCapabilities(providerName)
          }
        }
      }),

      prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          usedAiCredits: {
            increment: creditsUsed
          }
        }
      }),

      prisma.notification.create({
        data: {
          workspaceId,
          title: `AI Content Generated`,
          message: `Generated a new ${type} post using ${currentProvider} model (${creditsUsed} credits used).`,
          type: "success"
        }
      }),

      prisma.auditLog.create({
        data: {
          userId,
          workspaceId,
          action: 'AI_CONTENT_GENERATED',
          resource: 'AI_CONTENT',
          details: {
            type,
            platform,
            provider: currentProvider,
            creditsUsed,
            promptLength: prompt.length,
            features: options,
            contentSeparation: validationResult,
            model: modelInfo.name
          }
        }
      })
    ]).catch(dbErr => console.error("Database tracking failed for AI generation:", dbErr));

    creditCache.delete(cacheKey);

    const responseData = {
      success: true,
      text: result.content,
      ...result,
      creditsUsed,
      remainingCredits: availableCredits - totalUsed - creditsUsed,
      provider: currentProvider,
      metadata: {
        type,
        platform,
        provider: currentProvider,
        model: modelInfo.name,
        timestamp: new Date().toISOString(),
        contentSeparation: validationResult,
        capabilities: AIService.getProviderCapabilities(providerName)
      }
    };

    if (validationResult && !validationResult.isWellSeparated) {
      responseData.warning = "Content separation warning: Some prompt elements may appear in generated content";
      responseData.separationScore = validationResult.score;
    }

    return res.json(responseData);

  } catch (error) {
    console.error("💥 AI content generation error:", error);

    // Track fail log
    prisma.auditLog.create({
      data: {
        userId,
        workspaceId,
        action: 'AI_CONTENT_GENERATION_FAILED',
        resource: 'AI_CONTENT',
        details: {
          error: error.message,
          type,
          platform,
          provider: requestedProvider,
          prompt: prompt.substring(0, 100)
        }
      }
    }).catch(logError => console.error("❌ Failed to log audit:", logError));

    return res.status(500).json({
      error: error.message || "Failed to generate content",
      code: 'GENERATION_FAILED'
    });
  }
}

/**
 * GET /api/ai/generate-content
 * Retrieves aggregated AI credit and usage statistics for a workspace.
 */
export async function getAiCredits(req, res) {
  try {
    const { workspaceId, detailed, includeProviders } = req.query;
    const isDetailed = detailed === 'true';
    const isIncludeProviders = includeProviders === 'true';

    if (!workspaceId) {
      return res.status(400).json({ error: "Workspace ID is required" });
    }

    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId
      },
      select: { id: true }
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    const cacheKey = `credits-${req.user.id}-${workspaceId}-${isDetailed}-${isIncludeProviders}`;
    let creditData = creditCache.get(cacheKey);

    if (!creditData) {
      const userSubscription = await prisma.subscription.findFirst({
        where: {
          userId: req.user.id,
          status: { in: ['ACTIVE', 'TRIAL'] }
        },
        include: { 
          plan: {
            select: { name: true, monthlyAiCredits: true, features: true }
          } 
        }
      });

      if (!userSubscription) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const [usageStats, featureUsage, recentUsage, providerUsage] = await Promise.all([
        prisma.aIUsage.aggregate({
          where: {
            userId: req.user.id,
            createdAt: { gte: startOfMonth }
          },
          _sum: { creditsUsed: true, inputTokens: true, outputTokens: true },
          _count: { id: true }
        }),

        prisma.aIUsage.groupBy({
          by: ['feature'],
          where: {
            userId: req.user.id,
            createdAt: { gte: startOfMonth }
          },
          _sum: { creditsUsed: true, inputTokens: true, outputTokens: true },
          _count: { id: true }
        }),

        prisma.aIUsage.findMany({
          where: {
            userId: req.user.id,
            createdAt: { gte: startOfMonth }
          },
          select: {
            feature: true,
            creditsUsed: true,
            createdAt: true,
            inputTokens: true,
            outputTokens: true,
            provider: true,
            model: true,
            details: true,
            workspace: {
              select: { brandName: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: isDetailed ? 20 : 10
        }),

        prisma.aIUsage.groupBy({
          by: ['provider'],
          where: {
            userId: req.user.id,
            createdAt: { gte: startOfMonth }
          },
          _sum: { creditsUsed: true, inputTokens: true, outputTokens: true },
          _count: { id: true }
        })
      ]);

      const totalUsed = usageStats._sum.creditsUsed || 0;
      const availableCredits = userSubscription.plan.monthlyAiCredits;
      const remainingCredits = Math.max(0, availableCredits - totalUsed);

      const providerBreakdown = {};
      providerUsage.forEach(item => {
        const provider = item.provider || 'unknown';
        providerBreakdown[provider] = {
          creditsUsed: item._sum.creditsUsed || 0,
          usageCount: item._count.id,
          tokens: {
            input: item._sum.inputTokens || 0,
            output: item._sum.outputTokens || 0
          }
        };
      });

      const dynamicCosts = await prisma.aICreditCost.findMany();
      const costsObj = dynamicCosts.reduce((acc, c) => {
        acc[c.action] = c.cost;
        return acc;
      }, {});

      creditData = {
        credits: {
          used: totalUsed,
          available: availableCredits,
          remaining: remainingCredits,
          usagePercentage: availableCredits > 0 ? (totalUsed / availableCredits) * 100 : 0,
          tokens: {
            input: usageStats._sum.inputTokens || 0,
            output: usageStats._sum.outputTokens || 0,
            total: (usageStats._sum.inputTokens || 0) + (usageStats._sum.outputTokens || 0)
          }
        },
        costs: costsObj,
        usageBreakdown: {
          byFeature: featureUsage.map(f => ({
            feature: f.feature,
            creditsUsed: f._sum.creditsUsed,
            usageCount: f._count.id,
            tokens: {
              input: f._sum.inputTokens || 0,
              output: f._sum.outputTokens || 0
            }
          })),
          byProvider: providerBreakdown,
          recentActivity: recentUsage
        },
        subscription: {
          plan: userSubscription.plan.name,
          status: userSubscription.status,
          isTrial: userSubscription.isTrial,
          renewalDate: userSubscription.currentPeriodEnd,
          features: userSubscription.plan.features
        },
        resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
        analytics: {
          totalRequests: usageStats._count.id,
          averageCreditsPerRequest: usageStats._count.id > 0 ? totalUsed / usageStats._count.id : 0,
          mostUsedFeature: featureUsage.reduce((max, f) => 
            f._sum.creditsUsed > max._sum.creditsUsed ? f : max, 
            featureUsage[0] || { feature: 'none', _sum: { creditsUsed: 0 } }
          ).feature,
          mostUsedProvider: providerUsage.reduce((max, p) => 
            p._sum.creditsUsed > max._sum.creditsUsed ? p : max, 
            providerUsage[0] || { provider: 'none', _sum: { creditsUsed: 0 } }
          ).provider
        }
      };

      if (isIncludeProviders) {
        creditData.providers = {
          available: AIService.getAvailableProviders(),
          current: AIService.getCurrentProviderName(),
          capabilities: AIService.getProviderStats(),
          health: await AIService.healthCheck()
        };
      }

      creditCache.set(cacheKey, creditData);
      setTimeout(() => creditCache.delete(cacheKey), isDetailed ? 5 * 60 * 1000 : 2 * 60 * 1000);
    }

    return res.json({ success: true, ...creditData });

  } catch (error) {
    console.error("Error fetching AI credits:", error);
    return res.status(500).json({ error: "Failed to fetch credit information" });
  }
}

/**
 * PUT /api/ai/generate-content
 * Updates workspace AI settings.
 */
export async function updateAiSettings(req, res) {
  const { workspaceId, settings } = req.body;

  if (!workspaceId || !settings) {
    return res.status(400).json({ error: "Workspace ID and settings are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      },
      select: { id: true }
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied or insufficient permissions" });
    }

    if (settings.temperature && (settings.temperature < 0 || settings.temperature > 1)) {
      return res.status(400).json({ error: "Temperature must be between 0 and 1" });
    }

    if (settings.maxTokens && settings.maxTokens > 2000) {
      return res.status(400).json({ error: "Max tokens cannot exceed 2000" });
    }

    if (settings.defaultProvider && !AIService.getAvailableProviders().includes(settings.defaultProvider)) {
      return res.status(400).json({ 
        error: `Invalid provider. Supported: ${AIService.getAvailableProviders().join(', ')}` 
      });
    }

    const aiSettings = await prisma.aISettings.upsert({
      where: { workspaceId },
      update: {
        model: settings.model,
        maxTokens: settings.maxTokens,
        temperature: settings.temperature,
        defaultTone: settings.defaultTone,
        defaultProvider: settings.defaultProvider,
        enableContentSeparation: settings.enableContentSeparation !== false,
        enableAutoProviderSelection: settings.enableAutoProviderSelection !== false,
        updatedAt: new Date()
      },
      create: {
        workspaceId,
        model: settings.model || 'gemini-2.0-flash',
        maxTokens: settings.maxTokens || 500,
        temperature: settings.temperature || 0.7,
        defaultTone: settings.defaultTone || 'professional',
        defaultProvider: settings.defaultProvider || 'gemini',
        enableContentSeparation: settings.enableContentSeparation !== false,
        enableAutoProviderSelection: settings.enableAutoProviderSelection !== false
      }
    });

    if (settings.defaultProvider) {
      AIService.switchProvider(settings.defaultProvider);
    }

    prisma.auditLog.create({
      data: {
        userId: req.user.id,
        workspaceId,
        action: 'AI_SETTINGS_UPDATED',
        resource: 'AI_SETTINGS',
        details: {
          newSettings: settings
        }
      }
    }).catch(error => console.error('Audit log error:', error));

    const userCacheKeys = Array.from(creditCache.keys()).filter(key => 
      key.includes(req.user.id) || key.includes(workspaceId)
    );
    userCacheKeys.forEach(key => creditCache.delete(key));

    return res.json({
      success: true,
      settings: aiSettings,
      currentProvider: AIService.getCurrentProviderName(),
      message: "AI settings updated successfully"
    });

  } catch (error) {
    console.error("Error updating AI settings:", error);
    return res.status(500).json({ error: "Failed to update AI settings" });
  }
}

/**
 * PATCH /api/ai/generate-content
 * Performs provider-specific actions (switching, testing, prompt cleanups).
 */
export async function performAiOperation(req, res) {
  const { workspaceId, operation, data = {} } = req.body;

  if (!workspaceId || !operation) {
    return res.status(400).json({ error: "Workspace ID and operation are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId
      },
      select: { id: true }
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied to workspace" });
    }

    let result = {};

    switch (operation) {
      case 'test_connection':
        try {
          const testResult = await AIService.generateContent("Test connection - respond with 'OK' only", {
            maxTokens: 10,
            temperature: 0.1
          });
          const isValid = testResult.trim().toLowerCase().includes('ok') && testResult.length < 20;
          const modelInfo = await AIService.getModelInfo();
          
          result = {
            connected: true,
            response: testResult,
            isValid,
            timestamp: new Date().toISOString(),
            provider: AIService.getCurrentProviderName(),
            model: modelInfo.name,
            capabilities: AIService.getProviderCapabilities(AIService.getCurrentProviderName().toLowerCase())
          };
        } catch (error) {
          result = {
            connected: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            provider: AIService.getCurrentProviderName()
          };
        }
        break;

      case 'test_all_providers':
        const providerTests = {};
        const originalProvider = AIService.getCurrentProviderName();
        
        for (const providerName of AIService.getAvailableProviders()) {
          try {
            AIService.switchProvider(providerName);
            const testResult = await AIService.generateContent("Test - respond with 'OK'", {
              maxTokens: 10,
              temperature: 0.1
            });
            const modelInfo = await AIService.getModelInfo();
            
            providerTests[providerName] = {
              connected: true,
              response: testResult,
              isValid: testResult.trim().toLowerCase().includes('ok'),
              model: modelInfo.name,
              capabilities: AIService.getProviderCapabilities(providerName)
            };
          } catch (error) {
            providerTests[providerName] = {
              connected: false,
              error: error.message,
              model: 'unknown'
            };
          }
        }
        
        AIService.switchProvider(originalProvider.toLowerCase());
        result = {
          providers: providerTests,
          bestProvider: Object.keys(providerTests).find(p => providerTests[p].connected) || 'none',
          timestamp: new Date().toISOString()
        };
        break;

      case 'compare_providers':
        if (!data.prompt) {
          return res.status(400).json({ error: "Prompt is required for provider comparison" });
        }
        const comparison = await AIService.compareProviders(data.prompt, data.platforms || ['facebook']);
        result = {
          prompt: data.prompt,
          comparison: comparison,
          recommendations: comparison
            .filter(p => p.success)
            .sort((a, b) => a.responseTime - b.responseTime)
            .slice(0, 3)
            .map(p => ({
              provider: p.provider,
              responseTime: p.responseTime,
              contentLength: p.content?.length || 0
            }))
        };
        break;

      case 'switch_provider':
        if (!data.provider) {
          return res.status(400).json({ error: "Provider name is required" });
        }
        if (!AIService.getAvailableProviders().includes(data.provider)) {
          return res.status(400).json({ 
            error: `Invalid provider. Available: ${AIService.getAvailableProviders().join(', ')}` 
          });
        }
        AIService.switchProvider(data.provider);
        const switchedModel = await AIService.getModelInfo();
        result = {
          provider: data.provider,
          previousProvider: AIService.getCurrentProviderName(),
          model: switchedModel.name,
          capabilities: AIService.getProviderCapabilities(data.provider),
          message: `Switched to ${data.provider} provider`
        };
        break;

      case 'get_provider_info':
        const targetProvider = data.provider || AIService.getCurrentProviderName().toLowerCase();
        const caps = AIService.getProviderCapabilities(targetProvider);
        const health = await AIService.healthCheck();
        result = {
          provider: targetProvider,
          current: targetProvider === AIService.getCurrentProviderName().toLowerCase(),
          capabilities: caps,
          status: health[targetProvider] || { status: 'unknown' },
          supportsImageGeneration: caps.includes('image_generation'),
          supportsWebSearch: caps.includes('web_search')
        };
        break;

      case 'validate_prompt':
        const cleaned = AIService.cleanUserPrompt(data.prompt || '');
        const sepCheck = data.content ? AIService.validateContentSeparation(data.prompt, data.content) : null;
        result = {
          original: data.prompt,
          cleaned,
          length: cleaned.length,
          isValid: cleaned.length > 0 && cleaned.length <= 1000,
          separationScore: sepCheck?.score,
          separationWarning: sepCheck?.warning
        };
        break;

      case 'estimate_credits':
        result = {
          type: data.type || 'post',
          estimatedCredits: AIService.estimateCredits(data.type || 'post', data.options || {}),
          details: data.options || {}
        };
        break;

      default:
        return res.status(400).json({ error: "Invalid operation" });
    }

    return res.json({
      success: true,
      operation,
      ...result
    });

  } catch (error) {
    console.error("Error in PATCH operation:", error);
    return res.status(500).json({ error: "Failed to perform operation" });
  }
}

/**
 * DELETE /api/ai/generate-content
 * Resets AI settings, clears credits cache or usage logs.
 */
export async function deleteAiCacheOrSettings(req, res) {
  const { workspaceId, action } = req.query;

  if (!workspaceId || !action) {
    return res.status(400).json({ error: "Workspace ID and action are required" });
  }

  try {
    const membership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        workspaceId,
        role: { in: ['OWNER', 'ADMIN'] }
      },
      select: { id: true, role: true }
    });

    if (!membership) {
      return res.status(403).json({ error: "Access denied or insufficient permissions" });
    }

    let result = {};

    switch (action) {
      case 'clear_cache':
        const userCacheKeys = Array.from(creditCache.keys()).filter(key => 
          key.includes(req.user.id) || key.includes(workspaceId)
        );
        userCacheKeys.forEach(key => creditCache.delete(key));
        result = {
          message: "AI cache cleared successfully",
          clearedEntries: userCacheKeys.length
        };
        break;

      case 'reset_settings':
        const defaultSettings = await prisma.aISettings.upsert({
          where: { workspaceId },
          update: {
            model: 'gemini-2.0-flash',
            maxTokens: 500,
            temperature: 0.7,
            defaultTone: 'professional',
            enableContentSeparation: true,
            updatedAt: new Date()
          },
          create: {
            workspaceId,
            model: 'gemini-2.0-flash',
            maxTokens: 500,
            temperature: 0.7,
            defaultTone: 'professional',
            enableContentSeparation: true
          }
        });
        result = {
          message: "AI settings reset to default",
          settings: defaultSettings
        };
        break;

      case 'clear_usage_data':
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const deletedCount = await prisma.aIUsage.deleteMany({
          where: {
            userId: req.user.id,
            workspaceId,
            createdAt: { lt: thirtyDaysAgo }
          }
        });
        result = {
          message: "Old usage data cleared",
          deletedRecords: deletedCount.count
        };
        break;

      case 'clear_all_usage':
        if (membership.role !== 'OWNER') {
          return res.status(403).json({ error: "Only workspace owners can clear all usage data" });
        }
        const allDeletedCount = await prisma.aIUsage.deleteMany({
          where: {
            userId: req.user.id,
            workspaceId
          }
        });
        result = {
          message: "All usage data cleared",
          deletedRecords: allDeletedCount.count
        };
        break;

      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    return res.json({ success: true, ...result });

  } catch (error) {
    console.error("Error in DELETE operation:", error);
    return res.status(500).json({ error: "Failed to perform operation" });
  }
}
