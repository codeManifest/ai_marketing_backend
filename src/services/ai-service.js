import { GeminiService } from './ai-providers/gemini-service.js';
import { OpenAIService } from './ai-providers/openai-service.js';
import { ClaudeService } from './ai-providers/claude-service.js';
import { GrokService } from './ai-providers/grok-service.js';
import { DeepSeekService } from './ai-providers/deepseek-service.js';
import { OpenRouterService } from './ai-providers/openrouter-service.js';

export class AIService {
  static #currentProvider = null;

  // Initialize with preferred provider
  static init(provider = 'gemini') {
    const providers = {
      'gemini': GeminiService,
      'openai': OpenAIService,
      'claude': ClaudeService,
      'grok': GrokService,
      'deepseek': DeepSeekService,
      'openrouter': OpenRouterService
    };

    const ProviderClass = providers[provider.toLowerCase()];
    if (!ProviderClass) {
      throw new Error(`Unsupported AI provider: ${provider}. Available: ${Object.keys(providers).join(', ')}`);
    }

    this.#currentProvider = new ProviderClass();
    console.log(`🤖 AI Service initialized with provider: ${provider}`);
    return this;
  }

  // Get current provider
  static getProvider() {
    if (!this.#currentProvider) {
      this.init(); // Auto-initialize with default provider
    }
    return this.#currentProvider;
  }

  // Switch provider at runtime
  static switchProvider(provider) {
    console.log(`🔄 Switching AI provider to: ${provider}`);
    this.init(provider);
  }

  // Helper to execute with OpenRouter fallback on Gemini failure
  static async executeWithFallback(methodName, ...args) {
    try {
      const provider = this.getProvider();
      return await provider[methodName](...args);
    } catch (error) {
      const errorMessage = error.message || '';
      const isQuotaError = 
        errorMessage.includes('quota exceeded') || 
        errorMessage.includes('429') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        error.status === 429;

      if (isQuotaError && !(this.getProvider() instanceof OpenRouterService)) {
        console.warn(`⚠️ Primary AI Provider failed (Quota Exceeded). Falling back to OpenRouter...`);
        try {
          const backupProvider = new OpenRouterService();
          const backupArgs = args.map(arg => {
            if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
              const { model, ...rest } = arg;
              return rest;
            }
            return arg;
          });
          return await backupProvider[methodName](...backupArgs);
        } catch (backupError) {
          console.error('💥 OpenRouter fallback also failed:', backupError);
          throw error;
        }
      }
      throw error;
    }
  }

  // Main content generation method
  static async generateContent(prompt, options = {}) {
    return await this.executeWithFallback('generateContent', prompt, options);
  }

  // Social media post generation
  static async generateSocialMediaPost(prompt, platform = 'Facebook', options = {}) {
    return await this.executeWithFallback('generateSocialMediaPost', prompt, platform, options);
  }

  // Hashtag generation
  static async generateHashtags(content, platform, brandContext = '') {
    return await this.executeWithFallback('generateHashtags', content, platform, brandContext);
  }

  // Post optimization
  static async optimizePost(content, platform, brandContext = '') {
    return await this.executeWithFallback('optimizePost', content, platform, brandContext);
  }

  // Post idea generation
  static async generatePostIdea(topic, platform, tone = 'professional', brandContext = '') {
    return await this.executeWithFallback('generatePostIdea', topic, platform, tone, brandContext);
  }

  // Engagement analysis
  static async analyzeEngagement(content, platform, brandContext = '') {
    return await this.executeWithFallback('analyzeEngagement', content, platform, brandContext);
  }

  // Complete post generation
  static async generateCompletePost(topic, platform, options = {}) {
    return await this.executeWithFallback('generateCompletePost', topic, platform, options);
  }

  // Content variations
  static async generateContentVariations(content, platform, variations = 3, brandContext = '') {
    return await this.executeWithFallback('generateContentVariations', content, platform, variations, brandContext);
  }

  // Multiple posts generation
  static async generateMultiplePosts(topic, platforms, count = 3, brandContext = '') {
    return await this.executeWithFallback('generateMultiplePosts', topic, platforms, count, brandContext);
  }

  // Image generation
  static async generateImage(prompt, platform, options = {}) {
    const model = options.model || 'flux-schnell';
    console.log(`🖼️ AIService Image generation requested. Model: ${model}, Platform: ${platform}`);

    const OpenAIService = require('./ai-providers/openai-service').default;

    if (model === 'dall-e-3' || model === 'dall-e-2') {
      const openaiProvider = new OpenAIService();
      return await openaiProvider.generateImage(prompt, platform, {
        ...options,
        model: model
      });
    }

    if (model === 'stable-diffusion-xl') {
      const apiKey = process.env.STABILITY_AI_API_KEY;
      if (!apiKey) {
        console.warn('Stability AI API key not configured, falling back to DALL-E');
        const openaiProvider = new OpenAIService();
        return await openaiProvider.generateImage(prompt, platform, options);
      }
      
      try {
        const size = this.getPlatformImageSize ? this.getPlatformImageSize(platform) : { width: 1024, height: 1024 };
        const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            text_prompts: [{ text: prompt, weight: 1 }],
            cfg_scale: 7,
            height: size.height || 1024,
            width: size.width || 1024,
            steps: 30,
            samples: 1
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.artifacts && data.artifacts[0]) {
            return `data:image/png;base64,${data.artifacts[0].base64}`;
          }
        }
        throw new Error(`Stability AI API returned status ${response.status}`);
      } catch (err) {
        console.error('Failed to generate image via Stability AI, falling back to DALL-E:', err);
        const openaiProvider = new OpenAIService();
        return await openaiProvider.generateImage(prompt, platform, options);
      }
    }

    // Default: flux-schnell via Hugging Face Inference API
    const hfApiKey = process.env.HUGGING_FACE_API_KEY;
    try {
      const response = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(hfApiKey && { 'Authorization': `Bearer ${hfApiKey}` })
        },
        body: JSON.stringify({ inputs: prompt })
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:image/jpeg;base64,${base64}`;
      }
      throw new Error(`Hugging Face API returned status ${response.status}`);
    } catch (err) {
      console.error('Failed to generate image via Hugging Face FLUX, falling back to DALL-E:', err);
      const openaiProvider = new OpenAIService();
      return await openaiProvider.generateImage(prompt, platform, options);
    }
  }

  // Batch image generation
  static async generateImagesForAllPlatforms(prompt, options = {}) {
    const provider = this.getProvider();
    return await provider.generateImagesForAllPlatforms(prompt, options);
  }

  // DeepSeek-specific methods
  static async generateContentWithWebSearch(prompt, options = {}) {
    const provider = this.getProvider();
    if (provider.generateContentWithWebSearch) {
      return await provider.generateContentWithWebSearch(prompt, options);
    } else {
      console.warn('⚠️ Web search not supported by current provider, using regular generation');
      return await this.generateContent(prompt, options);
    }
  }

  static async generateTrendingPost(topic, platform, brandContext = '') {
    const provider = this.getProvider();
    if (provider.generateTrendingPost) {
      return await provider.generateTrendingPost(topic, platform, brandContext);
    } else {
      console.warn('⚠️ Trending post generation not supported by current provider, using regular post generation');
      return await this.generatePostIdea(topic, platform, 'trendy', brandContext);
    }
  }

  static async generateAIBlogPost(topic, wordCount = 800, brandContext = '') {
    const provider = this.getProvider();
    if (provider.generateAIBlogPost) {
      return await provider.generateAIBlogPost(topic, wordCount, brandContext);
    } else {
      console.warn('⚠️ Blog post generation not supported by current provider');
      throw new Error('Blog post generation not available with current provider');
    }
  }

  static async generateEmailNewsletter(topic, brandContext = '') {
    const provider = this.getProvider();
    if (provider.generateEmailNewsletter) {
      return await provider.generateEmailNewsletter(topic, brandContext);
    } else {
      console.warn('⚠️ Email newsletter generation not supported by current provider');
      throw new Error('Email newsletter generation not available with current provider');
    }
  }

  // Provider-specific status checks
  static async checkAPIStatus() {
    const provider = this.getProvider();
    if (provider.checkAPIStatus) {
      return await provider.checkAPIStatus();
    } else {
      return { status: 'unknown', message: 'API status check not available for this provider' };
    }
  }

  static async getModelInfo() {
    const provider = this.getProvider();
    if (provider.getModelInfo) {
      return await provider.getModelInfo();
    } else {
      return { 
        name: this.getCurrentProviderName(),
        version: 'unknown',
        contextLength: 'unknown',
        supportsWebSearch: false,
        supportsFileUpload: false
      };
    }
  }

  // Credit estimation
  static estimateCredits(type, options = {}) {
    const provider = this.getProvider();
    if (provider.estimateCredits) {
      return provider.estimateCredits(type, options);
    }
    
    // Default credit estimation based on content type
    const creditEstimates = {
      'social_media_post': 1,
      'hashtags': 0.5,
      'optimization': 1,
      'analysis': 1.5,
      'image_generation': 2,
      'blog_post': 3,
      'email_newsletter': 2
    };
    
    return creditEstimates[type] || 1;
  }

  // Platform-specific methods
  static async createFacebookPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'facebook', options);
  }

  static async createInstagramPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'instagram', options);
  }

  static async createTwitterPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'twitter', options);
  }

  static async createLinkedInPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'linkedin', options);
  }

  static async createTikTokPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'tiktok', options);
  }

  static async createPinterestPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'pinterest', options);
  }

  static async createMultiPlatformPost(prompt, options = {}) {
    return await this.generateSocialMediaPost(prompt, 'all', options);
  }

  // Batch operations for multiple platforms
  static async generatePostsForAllPlatforms(topic, options = {}) {
    const platforms = ['facebook', 'instagram', 'twitter', 'linkedin'];
    const posts = [];
    
    for (const platform of platforms) {
      try {
        const post = await this.generateSocialMediaPost(topic, platform, options);
        posts.push({
          platform,
          content: post,
          success: true
        });
      } catch (error) {
        posts.push({
          platform,
          content: `Failed to generate post for ${platform}`,
          success: false,
          error: error.message
        });
      }
    }
    
    return posts;
  }

  // Utility methods
  static cleanUserPrompt(prompt) {
    const provider = this.getProvider();
    return provider.cleanUserPrompt(prompt);
  }

  static cleanGeneratedContent(content, originalPrompt = '') {
    const provider = this.getProvider();
    return provider.cleanGeneratedContent(content, originalPrompt);
  }

  static ensureNoPromptLeakage(content, originalPrompt) {
    const provider = this.getProvider();
    return provider.ensureNoPromptLeakage(content, originalPrompt);
  }

  static validateContentSeparation(originalPrompt, generatedContent) {
    const provider = this.getProvider();
    return provider.validateContentSeparation(originalPrompt, generatedContent);
  }

  // Test method
  static async testPostGeneration() {
    const provider = this.getProvider();
    if (provider.testPostGeneration) {
      return await provider.testPostGeneration();
    }
    
    // Default test implementation
    const testPrompt = "Test social media post about AI technology";
    try {
      const result = await this.generateSocialMediaPost(testPrompt, 'facebook');
      return {
        success: true,
        provider: this.getCurrentProviderName(),
        result: result,
        message: 'Test post generation successful'
      };
    } catch (error) {
      return {
        success: false,
        provider: this.getCurrentProviderName(),
        error: error.message,
        message: 'Test post generation failed'
      };
    }
  }

  // Provider comparison and selection
  static async compareProviders(prompt, platforms = ['facebook']) {
    const originalProvider = this.getCurrentProviderName();
    const providers = this.getAvailableProviders();
    const results = [];
    
    for (const providerName of providers) {
      try {
        this.switchProvider(providerName);
        const startTime = Date.now();
        const content = await this.generateSocialMediaPost(prompt, platforms[0]);
        const endTime = Date.now();
        
        results.push({
          provider: providerName,
          content: content,
          responseTime: endTime - startTime,
          success: true,
          error: null
        });
      } catch (error) {
        results.push({
          provider: providerName,
          content: null,
          responseTime: null,
          success: false,
          error: error.message
        });
      }
    }
    
    // Restore original provider
    this.switchProvider(originalProvider.toLowerCase());
    
    return results;
  }

  // Smart provider selection based on content type
  static async getBestProviderForContentType(contentType, options = {}) {
    const providerCapabilities = {
      'social_media': ['gemini', 'openai', 'claude', 'grok', 'deepseek'],
      'blog_posts': ['claude', 'deepseek', 'openai'],
      'technical_content': ['claude', 'openai'],
      'creative_writing': ['gemini', 'openai'],
      'trending_content': ['deepseek', 'grok'],
      'analytical_content': ['claude', 'openai'],
      'concise_content': ['gemini', 'grok']
    };
    
    const availableProviders = providerCapabilities[contentType] || this.getAvailableProviders();
    
    // Check API status for available providers
    const providerStatus = [];
    for (const providerName of availableProviders) {
      const currentProvider = this.#currentProvider;
      this.switchProvider(providerName);
      try {
        const status = await this.checkAPIStatus();
        providerStatus.push({
          provider: providerName,
          status: status.status,
          message: status.message
        });
      } catch (error) {
        providerStatus.push({
          provider: providerName,
          status: 'error',
          message: error.message
        });
      }
    }
    
    // Find the first available provider
    const available = providerStatus.find(p => p.status === 'ok');
    return available ? available.provider : 'gemini'; // Fallback to default
  }

  // Auto-select best provider based on content type
  static async autoSelectProvider(contentType, prompt = '') {
    const bestProvider = await this.getBestProviderForContentType(contentType);
    this.switchProvider(bestProvider);
    return bestProvider;
  }

  // Get available providers
  static getAvailableProviders() {
    return ['gemini', 'openai', 'claude', 'grok', 'deepseek', 'openrouter'];
  }

  // Get provider capabilities
  static getProviderCapabilities(provider) {
    const capabilities = {
      'gemini': ['social_media', 'creative_writing', 'concise_content', 'image_generation'],
      'openai': ['social_media', 'blog_posts', 'technical_content', 'creative_writing', 'analytical_content'],
      'claude': ['social_media', 'blog_posts', 'technical_content', 'analytical_content', 'long_form'],
      'grok': ['social_media', 'trending_content', 'concise_content', 'humorous_content'],
      'deepseek': ['social_media', 'blog_posts', 'trending_content', 'web_search', 'long_form'],
      'openrouter': ['social_media', 'blog_posts', 'creative_writing', 'technical_content', 'analytical_content', 'long_form']
    };
    
    return capabilities[provider] || [];
  }

  // Get current provider name
  static getCurrentProviderName() {
    return this.#currentProvider?.constructor.name.replace('Service', '') || 'Unknown';
  }

  // Get provider statistics
  static getProviderStats() {
    const stats = {};
    const providers = this.getAvailableProviders();
    
    providers.forEach(provider => {
      stats[provider] = {
        name: provider.charAt(0).toUpperCase() + provider.slice(1),
        capabilities: this.getProviderCapabilities(provider),
        supportsWebSearch: provider === 'deepseek',
        supportsImageGeneration: ['gemini', 'openai', 'openrouter'].includes(provider)
      };
    });
    
    return stats;
  }

  // Health check for all providers
  static async healthCheck() {
    const healthResults = {};
    const originalProvider = this.getCurrentProviderName();
    
    for (const providerName of this.getAvailableProviders()) {
      try {
        this.switchProvider(providerName);
        const status = await this.checkAPIStatus();
        const modelInfo = await this.getModelInfo();
        
        healthResults[providerName] = {
          status: status.status,
          message: status.message,
          model: modelInfo.name,
          contextLength: modelInfo.contextLength,
          supportsWebSearch: modelInfo.supportsWebSearch || false,
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        healthResults[providerName] = {
          status: 'error',
          message: error.message,
          model: 'unknown',
          contextLength: 'unknown',
          supportsWebSearch: false,
          lastChecked: new Date().toISOString()
        };
      }
    }
    
    // Restore original provider
    this.switchProvider(originalProvider.toLowerCase());
    
    return healthResults;
  }
}

// Auto-initialize with default provider
AIService.init();

// Export individual services for direct access if needed
export { GeminiService, OpenAIService, ClaudeService, GrokService, DeepSeekService, OpenRouterService };