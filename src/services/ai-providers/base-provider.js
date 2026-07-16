// app/lib/ai-providers/base-provider.js
export class BaseAIProvider {
  constructor() {
    if (new.target === BaseAIProvider) {
      throw new Error("BaseAIProvider is abstract and cannot be instantiated directly");
    }
  }

  // Abstract methods that must be implemented by subclasses
  async generateContent(prompt, options = {}) {
    throw new Error("Method 'generateContent()' must be implemented");
  }

  async generateSocialMediaPost(prompt, platform = 'Facebook', options = {}) {
    throw new Error("Method 'generateSocialMediaPost()' must be implemented");
  }

  async generateHashtags(content, platform, brandContext = '') {
    throw new Error("Method 'generateHashtags()' must be implemented");
  }

  // Common utility methods with default implementations
  cleanUserPrompt(prompt) {
    const cleaned = prompt
      .replace(/create a social media post for (\w+) about:/gi, '')
      .replace(/make it engaging, platform-appropriate, and consider the platform's best practices/gi, '')
      .replace(/share your thoughts on social media/gi, '')
      .replace(/discover the latest about/gi, '')
      .replace(/write a post about/gi, '')
      .replace(/generate.*post.*about/gi, '')
      .replace(/create.*content.*about/gi, '')
      .replace(/💫/g, '')
      .replace(/🚀/g, '')
      .replace(/✨/g, '')
      .replace(/\b(?:post|create|write|generate|make)\s+(?:a|an|the)?\s+(?:social media |facebook |instagram |twitter |linkedin )?(?:post|content)\s*(?:about|for|on)?\s*/gi, '')
      .trim();
    
    return cleaned || prompt;
  }

  cleanGeneratedContent(content, originalPrompt = '') {
    if (!content) return '';

    let cleanedContent = content
      .replace(/^(Here('s| is) (a|the) (Facebook|social media|Instagram|Twitter|LinkedIn|platform) post( content)?:?\s*)/i, '')
      .replace(/^(Post|Content|Social Media Post|Generated Post):?\s*/i, '')
      .replace(/^I'?ve created (a|an|the) (post|content|social media post):?\s*/i, '')
      .replace(/^Based on your request, here('s| is):?\s*/i, '')
      .replace(/^Certainly! Here('s| is):?\s*/i, '')
      .replace(/^Of course! Here('s| is):?\s*/i, '')
      .replace(/^Here('s| is) (a|the) (post|content) (I'?ve created|for you):?\s*/i, '')
      .replace(/^As (a|an) (social media expert|content creator), here('s| is):?\s*/i, '')
      .replace(/^For your .* post:?\s*/i, '')
      .replace(new RegExp(originalPrompt.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/["'](.*?)["']/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim();

    if (!cleanedContent || cleanedContent.length < 10) {
      console.warn('⚠️ Content too short after cleaning, using original:', content.substring(0, 100));
      return content.trim();
    }

    cleanedContent = cleanedContent
      .replace(/^(Sure, here('s| is) (a|the) post:?\s*)/i, '')
      .replace(/^(Alright, here('s| is) (a|the) post:?\s*)/i, '')
      .trim();

    return cleanedContent;
  }

  ensureNoPromptLeakage(content, originalPrompt) {
    if (!content || !originalPrompt) return content;
    
    const blacklist = ['write', 'post', 'create', 'generate', 'about', 'friendly', 'social', 'media', 'platform', 'content', 'instruction', 'prompt', 'please', 'matching', 'brand', 'voice', 'rules'];
    const promptWords = originalPrompt.split(/\s+/)
      .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
      .filter(w => w.length > 3 && blacklist.includes(w));
      
    let cleanedContent = content;
    
    promptWords.forEach(word => {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
      if ((content.match(regex) || []).length > 2) {
        cleanedContent = cleanedContent.replace(regex, '');
      }
    });
    
    return cleanedContent.trim() || content;
  }

  buildAIPrompt(userPrompt, options) {
    const platform = options.platform || 'general';
    const brandContext = options.brandContext || '';
    
    // Detect if this is a blog post request
    const isBlog = userPrompt.toLowerCase().includes('blog post') || userPrompt.toLowerCase().includes('blog article');
    
    if (isBlog) {
      let basePrompt = `You are an elite SEO Copywriter, content marketer, and professional blogger. Write a highly engaging, fully SEO-optimized, human-like blog post.
      
CRITICAL INSTRUCTIONS:
- Write in a natural, engaging, and authoritative human-like voice.
- Integrate all target keywords naturally throughout the text (do not force them).
- Structure the post with proper Markdown: a magnetic H1 title, followed by H2 and H3 subheadings for sections.
- Avoid robotic AI formatting (do NOT include artificial TL;DR blocks, bulleted list takeaways at the top, or explicit "Pro Tip:" labels unless specifically requested in the prompt).
- Keep the introduction hook-driven and conversational to address reader pain points immediately.
- Incorporate data, statistics, and logical proof naturally every 200-300 words.
- Provide a strong, natural Call to Action (CTA) at the end.
- Deliver the full article text directly without any meta-commentary, introductory notes, or post-generation explanations.
`;

      if (brandContext) {
        basePrompt += `\nBRAND CONTEXT & BRAND VOICE RULES:\n${brandContext}\nEnsure the writing style matches this voice and industry naturally.\n`;
      }

      basePrompt += `\nUSER GENERATION BRIEF:\n${userPrompt}\n\nBLOG POST CONTENT:`;
      return basePrompt;
    }

    let basePrompt = '';

    if (platform === 'all') {
      basePrompt = `You are a professional social media content creator. Create a versatile social media post that works well across multiple platforms (Facebook, Instagram, Twitter, LinkedIn).

USER REQUEST: ${userPrompt}`;
    } else {
      basePrompt = `You are a professional social media content creator. Create a compelling, ready-to-publish social media post for ${platform}.

USER REQUEST: ${userPrompt}`;
    }

    if (brandContext) {
      basePrompt += `\n\nBRAND CONTEXT: ${brandContext}\n\nIMPORTANT: Create content that aligns with this brand's voice, values, and industry. Make it relevant to their business.`;
    }

    basePrompt += `\n\nCRITICAL INSTRUCTIONS:
- Create ONLY the actual post content that would be published
- Do NOT include any explanations, notes, or meta-commentary
- Do NOT repeat the user request or mention "USER REQUEST" in your response
- Do NOT include phrases like "Here is a post" or "I've created"
- Make it engaging and platform-appropriate${platform === 'all' ? ' for multiple platforms' : ` for ${platform}`}
- Include relevant emojis but don't overuse them
- Create a complete post with proper formatting
- Start directly with the post content
${brandContext ? '- Ensure the content reflects the brand\'s identity and values' : ''}

POST CONTENT:`;

    return basePrompt;
  }

  getFallbackHashtags(platform, brandContext = '') {
    let baseHashtags = [];
    
    if (brandContext) {
      const brandMatch = brandContext.match(/Company: ([^\.]+)/);
      if (brandMatch) {
        const brandName = brandMatch[1].replace(/\s+/g, '');
        baseHashtags.push(`#${brandName}`);
      }
      
      if (brandContext.includes('Industry:')) {
        const industryMatch = brandContext.match(/Industry: ([^\.]+)/);
        if (industryMatch) {
          baseHashtags.push(`#${industryMatch[1].replace(/\s+/g, '')}`);
        }
      }
    }

    const platformHashtags = {
      'instagram': ['#SocialMedia', '#Content', '#Digital', '#Trending', '#Viral'],
      'twitter': ['#Twitter', '#Tweet', '#News', '#Trending', '#Update'],
      'facebook': ['#Facebook', '#Update', '#News', '#Community', '#Share'],
      'linkedin': ['#LinkedIn', '#Professional', '#Career', '#Business', '#Networking'],
      'tiktok': ['#TikTok', '#Viral', '#Trend', '#FYP', '#Content'],
      'all': ['#SocialMedia', '#Update', '#News', '#Content', '#Digital']
    };

    const platformSpecific = platformHashtags[platform.toLowerCase()] || 
           ['#SocialMedia', '#Content', '#Digital', '#Marketing', '#Online'];

    return [...baseHashtags, ...platformSpecific].slice(0, 8);
  }

  generateFallbackSocialPost(prompt, platform, brandContext = '') {
    const cleanPrompt = this.cleanUserPrompt(prompt);
    
    let brandName = '';
    if (brandContext) {
      const brandMatch = brandContext.match(/Company: ([^\.]+)/);
      brandName = brandMatch ? brandMatch[1] : '';
    }
    
    const baseContent = brandName ? 
      `At ${brandName}, we're excited to share: ${cleanPrompt}` : 
      cleanPrompt;

    const platformStyles = {
      'facebook': `🎉 EXCITING UPDATE! 🎉\n\n${baseContent}\n\nDon't miss out on this amazing opportunity! Perfect time to take action. ✨\n\n#Update #News #Opportunity`,
      'instagram': `✨ JUST ANNOUNCED! ✨\n\n${baseContent}\n\n🏃‍♀️ Don't wait - act now! \n💫 Amazing things are happening!\n\n#Announcement #Update #News`,
      'twitter': `🚨 BIG NEWS! 🚨\n\n${baseContent}\n\nCheck this out and share your thoughts! 👀\n\n#News #Update #Twitter`,
      'linkedin': `📢 Professional Update: ${baseContent}\n\nWe're excited to share this development with our professional network. Valuable insights and opportunities ahead.\n\n#Professional #Update #Business`,
      'all': `🎉 IMPORTANT UPDATE! 🎉\n\n${baseContent}\n\nGreat news worth sharing across all platforms! Don't miss this opportunity. ✨\n\n#Update #News #Announcement`
    };

    return platformStyles[platform.toLowerCase()] || 
           `🎉 UPDATE! 🎉\n\n${baseContent}\n\nCheck this out and stay tuned for more! ✨\n\n#Update #News`;
  }

  generateFallbackContent(prompt, options = {}) {
    const platform = options.platform || 'social media';
    
    let brandPrefix = '';
    if (options.brandContext) {
      const brandMatch = options.brandContext.match(/Company: ([^\.]+)/);
      brandPrefix = brandMatch ? `From ${brandMatch[1]}: ` : '';
    }
    
    const cleanPrompt = this.cleanUserPrompt(prompt);
    
    const fallbackResponses = [
      `${brandPrefix}Great news! ${cleanPrompt}. Perfect for sharing on ${platform}! 🚀`,
      `${brandPrefix}Exciting update: ${cleanPrompt}. Your ${platform} audience will love this! ✨`,
      `${brandPrefix}Check this out: ${cleanPrompt}. Amazing content for ${platform}! 💫`,
      `${brandPrefix}New development: ${cleanPrompt}. Don't miss this on ${platform}! 🌟`
    ];
    
    const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    console.log('📝 Generated fallback content:', randomResponse);
    return randomResponse;
  }

  estimateCredits(type, options = {}) {
    const creditEstimates = {
      'post': 1,
      'complete_post': 5,
      'image': 3,
      'hashtags': 1,
      'optimize': 1,
      'analyze': 1,
      'variations': 2,
      'multiple_posts': 2,
      'batch_images': 3
    };

    const baseCredits = creditEstimates[type] || 1;
    
    if (options.platform === 'all') {
      return baseCredits * 1.5;
    }
    
    if (options.complexity === 'high') {
      return baseCredits * 2;
    }
    if (options.complexity === 'low') {
      return Math.max(1, Math.floor(baseCredits / 2));
    }

    return baseCredits;
  }

  validateContentSeparation(originalPrompt, generatedContent) {
    const promptWords = originalPrompt.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const contentWords = generatedContent.toLowerCase().split(/\s+/);
    
    const overlappingWords = promptWords.filter(word => 
      contentWords.includes(word) && word.length > 4
    );
    
    const separationScore = 1 - (overlappingWords.length / Math.max(promptWords.length, 1));
    
    return {
      score: separationScore,
      isWellSeparated: separationScore > 0.7,
      overlappingWords,
      warning: separationScore < 0.5 ? 'High prompt leakage detected' : 'Good separation'
    };
  }

  async testPostGeneration() {
    const testPrompts = [
      "20% off on all women's clothing until October 25",
      "Create a social media post for FACEBOOK about: create a post about 20% off on every woman cloth till 25 oct.",
      "write a post about 20% off on woman cloth till 25 oct",
      "New product launch coming next week"
    ];

    console.log('🧪 Testing post generation with different prompts...\n');

    for (let i = 0; i < testPrompts.length; i++) {
      console.log(`📝 Test ${i + 1}: "${testPrompts[i]}"`);
      try {
        const result = await this.generateSocialMediaPost(testPrompts[i], 'facebook');
        console.log(`✅ Result: ${result}\n`);
      } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
      }
    }
  }

  async getDbConfig(providerName) {
    try {
      const { prisma } = await import('../../config/db.js');
      const config = await prisma.aIConfig.findUnique({
        where: { provider: providerName.toUpperCase() }
      });
      if (config && config.isActive) {
        return config;
      }
    } catch (e) {
      console.warn(`[BaseAIProvider] Failed to fetch config for ${providerName} from database:`, e);
    }
    return null;
  }
}