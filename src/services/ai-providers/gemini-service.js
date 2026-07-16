// app/lib/ai-providers/gemini-service.js
import { GoogleGenAI } from "@google/genai";
import { BaseAIProvider } from "./base-provider.js";

export class GeminiService extends BaseAIProvider {
  #genAI = null;

  constructor() {
    super();
    this.#initGenAI();
  }

  #initGenAI() {
    if (!this.#genAI) {
      const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error('Google AI API key not configured. Please check your environment variables.');
      }

      if (apiKey === 'your_actual_gemini_api_key_here' || apiKey.includes('your_')) {
        throw new Error('Please replace the placeholder API key with your actual Gemini API key.');
      }

      this.#genAI = new GoogleGenAI({ apiKey });
    }
    return this.#genAI;
  }

  async generateContent(prompt, options = {}) {
    try {
      console.log('🔑 Using Gemini AI...');
      
      const genAI = this.#initGenAI();

      const finalPrompt = this.buildAIPrompt(prompt, options);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await genAI.models.generateContent({
          model: "gemini-2.0-flash",
          contents: finalPrompt,
          config: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens || 500,
            topP: 0.8,
            topK: 40
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        });

        clearTimeout(timeoutId);

        const generatedText = response.text;
        return this.cleanGeneratedContent(generatedText, prompt);

      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Gemini API request timeout. Please try again.');
        }
        throw fetchError;
      }

    } catch (error) {
      console.error('💥 Gemini AI error:', error);
      throw new Error(`Gemini AI Error: ${error.message}`);
    }
  }

  async generateSocialMediaPost(prompt, platform = 'Facebook', options = {}) {
    const enhancedOptions = {
      ...options,
      platform: platform,
      temperature: options.temperature || 0.8,
      maxTokens: options.maxTokens || 300
    };

    try {
      const content = await this.generateContent(prompt, enhancedOptions);
      const finalContent = this.ensureNoPromptLeakage(content, prompt);
      return finalContent;
    } catch (error) {
      console.error('Gemini social media post generation error:', error);
      throw error;
    }
  }

  async generateHashtags(content, platform, brandContext = '') {
    const cleanContent = this.cleanUserPrompt(content);
    
    let prompt = `Generate 5-10 relevant hashtags for this ${platform} content. Return only hashtags as comma separated values without any additional text. Content: "${cleanContent.substring(0, 200)}"`;
    
    if (brandContext) {
      const brandMatch = brandContext.match(/Company: ([^\.]+)/);
      if (brandMatch) {
        prompt += `\n\nBrand: ${brandMatch[1]}`;
      }
      if (brandContext.includes('Industry:')) {
        const industryMatch = brandContext.match(/Industry: ([^\.]+)/);
        if (industryMatch) {
          prompt += `\nIndustry: ${industryMatch[1]}`;
        }
      }
    }
    
    try {
      const hashtags = await this.generateContent(prompt, { 
        maxTokens: 100,
        temperature: 0.3
      });
      
      const cleanedResponse = hashtags
        .replace(/[#]/g, '')
        .replace(/hashtags?:?\s*/gi, '')
        .replace(/here('s| are)?\s*/gi, '')
        .trim();

      const hashtagArray = cleanedResponse.split(',')
        .map(tag => `#${tag.trim()}`)
        .filter(tag => tag.length > 1 && tag !== '#' && !tag.includes('hashtag'));
      
      return hashtagArray.length > 0 ? hashtagArray : this.getFallbackHashtags(platform, brandContext);
    } catch (error) {
      console.error('Gemini hashtag generation error:', error);
      throw error;
    }
  }

  async optimizePost(content, platform, brandContext = '') {
    const cleanContent = this.cleanUserPrompt(content);
    
    let prompt = `Optimize this social media post for ${platform}. Make it more engaging, platform-appropriate, and improve its effectiveness. Consider the platform's best practices and character limits.\n\nOriginal content: "${cleanContent}"`;
    
    if (brandContext) {
      prompt += `\n\nBrand Context: ${brandContext}\n\nEnsure the optimized version aligns with the brand's voice and values.`;
    }
    
    prompt += `\n\nProvide only the optimized version without any additional explanations or introductory phrases.`;
    
    try {
      const optimized = await this.generateContent(prompt, {
        temperature: 0.8,
        maxTokens: 300
      });
      
      return this.ensureNoPromptLeakage(optimized, content);
    } catch (error) {
      console.error('Gemini post optimization error:', error);
      throw error;
    }
  }

  async generatePostIdea(topic, platform, tone = 'professional', brandContext = '') {
    const cleanTopic = this.cleanUserPrompt(topic);
    
    let prompt = `Generate a creative social media post idea about "${cleanTopic}" for ${platform} in a ${tone} tone.`;
    
    if (brandContext) {
      prompt += `\n\nBrand Context: ${brandContext}\n\nCreate content that aligns with this brand's identity.`;
    }
    
    prompt += `\n\nProvide the complete post content ready to publish without any explanations.`;
    
    try {
      const content = await this.generateContent(prompt, {
        temperature: 0.9,
        maxTokens: 400
      });
      
      return this.ensureNoPromptLeakage(content, topic);
    } catch (error) {
      console.error('Gemini post idea generation error:', error);
      throw error;
    }
  }

  async analyzeEngagement(content, platform, brandContext = '') {
    const cleanContent = this.cleanUserPrompt(content);
    
    let prompt = `Analyze this ${platform} post for potential engagement and suggest improvements:\n\n"${cleanContent}"`;
    
    if (brandContext) {
      prompt += `\n\nBrand Context: ${brandContext}\n\nConsider if the content aligns with the brand's voice and target audience.`;
    }
    
    prompt += `\n\nProvide a brief analysis and 2-3 specific suggestions to improve engagement.`;
    
    try {
      return await this.generateContent(prompt, {
        temperature: 0.5,
        maxTokens: 300
      });
    } catch (error) {
      console.error('Gemini engagement analysis error:', error);
      throw error;
    }
  }

  async generateCompletePost(topic, platform, options = {}) {
    try {
      const [content, imageUrl] = await Promise.all([
        this.generatePostIdea(topic, platform, options.tone, options.brandContext),
        options.generateImage ? this.generateImage(topic, platform, options.imageOptions) : null
      ]);

      const hashtags = await this.generateHashtags(content, platform, options.brandContext);

      return {
        content: this.ensureNoPromptLeakage(content, topic),
        imageUrl,
        hashtags: Array.isArray(hashtags) ? hashtags : hashtags.split(',').map(tag => tag.trim()),
        platform,
        aiGenerated: true,
        brandContextUsed: !!options.brandContext
      };
    } catch (error) {
      console.error('Gemini complete post generation error:', error);
      throw error;
    }
  }

  async generateContentVariations(content, platform, variations = 3, brandContext = '') {
    const cleanContent = this.cleanUserPrompt(content);
    
    let prompt = `Generate ${variations} different variations of this social media post for ${platform}. Keep the core message but change the style, tone, or approach. Original: "${cleanContent}"`;
    
    if (brandContext) {
      prompt += `\n\nBrand Context: ${brandContext}\n\nEnsure all variations align with the brand's voice and values.`;
    }
    
    prompt += `\n\nReturn only the variations without any explanations.`;
    
    try {
      const variationsText = await this.generateContent(prompt, {
        maxTokens: 800,
        temperature: 0.8
      });

      const variationLines = variationsText.split(/\d+\.\s*|-|\n\s*\n/).filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && !trimmed.toLowerCase().includes('variation');
      });
      
      const finalVariations = variationLines.slice(0, variations).map(variation => 
        this.ensureNoPromptLeakage(variation.trim(), content)
      );
      
      return finalVariations.length > 0 ? finalVariations : [content];
    } catch (error) {
      console.error('Gemini content variation generation error:', error);
      throw error;
    }
  }

  async generateMultiplePosts(topic, platforms, count = 3, brandContext = '') {
    const cleanTopic = this.cleanUserPrompt(topic);
    const prompt = `Generate ${count} different social media posts about "${cleanTopic}" for the following platforms: ${platforms.join(', ')}. Make each post unique and platform-appropriate. Format the response as a JSON array with platform and content. Do not include any explanatory text.`;
    
    try {
      const response = await this.generateContent(prompt, {
        maxTokens: 800,
        temperature: 0.8
      });

      try {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) {
          return parsed.map(post => ({
            ...post,
            content: this.ensureNoPromptLeakage(post.content, topic)
          }));
        }
      } catch {
        return this.processTextResponse(response, platforms, count, topic);
      }
    } catch (error) {
      console.error('Gemini multiple posts generation error:', error);
      throw error;
    }
  }

  processTextResponse(response, platforms, count, originalTopic) {
    const posts = [];
    const lines = response.split('\n').filter(line => line.trim());
    
    let currentPlatform = platforms[0];
    let currentContent = '';

    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      const platformMatch = platforms.find(p => 
        trimmedLine.toLowerCase().includes(p.toLowerCase()) ||
        trimmedLine.toLowerCase().includes('platform:')
      );
      
      if (platformMatch) {
        if (currentContent) {
          posts.push({
            platform: currentPlatform,
            content: this.ensureNoPromptLeakage(currentContent.trim(), originalTopic)
          });
          currentContent = '';
        }
        currentPlatform = platformMatch;
      } else if (trimmedLine && !trimmedLine.match(/^(platform|post|content):?$/i)) {
        currentContent += trimmedLine + '\n';
      }
    });

    if (currentContent) {
      posts.push({
        platform: currentPlatform,
        content: this.ensureNoPromptLeakage(currentContent.trim(), originalTopic)
      });
    }

    return posts.slice(0, count);
  }

  async generateImage(prompt, platform, options = {}) {
    // Gemini-specific image generation implementation
    // This would use Google's image generation APIs
    console.log('🖼️ Gemini image generation called for:', prompt);
    
    // Placeholder implementation
    const size = this.getPlatformImageSize(platform);
    return `https://via.placeholder.com/${size.width}x${size.height}/3B82F6/ffffff?text=${encodeURIComponent(prompt.substring(0, 30))}`;
  }

  async generateImagesForAllPlatforms(prompt, options = {}) {
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    const imagePromises = platforms.map(platform => 
      this.generateImage(prompt, platform, options)
    );

    try {
      const imageUrls = await Promise.all(imagePromises);
      return platforms.reduce((acc, platform, index) => {
        acc[platform] = imageUrls[index];
        return acc;
      }, {});
    } catch (error) {
      console.error('Gemini batch image generation error:', error);
      throw new Error('Failed to generate images for all platforms');
    }
  }

  getPlatformImageSize(platform) {
    const sizes = {
      'instagram': { width: 1080, height: 1080, size: '1024x1024' },
      'twitter': { width: 1200, height: 675, size: '1024x1024' },
      'facebook': { width: 1200, height: 630, size: '1024x1024' },
      'linkedin': { width: 1200, height: 627, size: '1024x1024' },
      'tiktok': { width: 1080, height: 1920, size: '1024x1024' },
      'pinterest': { width: 1000, height: 1500, size: '1024x1024' },
      'all': { width: 1200, height: 630, size: '1024x1024' }
    };

    return sizes[platform.toLowerCase()] || { width: 1024, height: 1024, size: '1024x1024' };
  }
}