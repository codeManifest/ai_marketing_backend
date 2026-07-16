// app/lib/ai-providers/openai-service.js
import { BaseAIProvider } from "./base-provider.js";

export class OpenAIService extends BaseAIProvider {
  async generateContent(prompt, options = {}) {
    try {
      console.log('🔑 Using OpenAI...');
      
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const cleanPrompt = this.cleanUserPrompt(prompt);
      const systemPrompt = this.buildAIPrompt("", options); // Build system prompt from base method

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: options.model || 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: cleanPrompt
              }
            ],
            max_tokens: options.maxTokens || 500,
            temperature: options.temperature || 0.7
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            const textError = await response.text();
            errorData = { error: { message: textError } };
          }
          
          if (response.status === 401) {
            throw new Error('OpenAI API key is invalid or expired.');
          } else if (response.status === 429) {
            throw new Error('OpenAI rate limit exceeded. Please try again later.');
          }
          throw new Error(`OpenAI API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        return this.cleanGeneratedContent(data.choices[0].message.content);
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          throw new Error('OpenAI API request timeout. Please try again.');
        }
        throw fetchError;
      }

    } catch (error) {
      console.error('💥 OpenAI error:', error);
      throw new Error(`OpenAI Error: ${error.message}`);
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
      console.error('OpenAI social media post generation error:', error);
      return this.generateFallbackSocialPost(prompt, platform, options.brandContext);
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
      console.error('OpenAI hashtag generation error:', error);
      return this.getFallbackHashtags(platform, brandContext);
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
      console.error('OpenAI post optimization error:', error);
      return content;
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
      console.error('OpenAI post idea generation error:', error);
      throw new Error('Failed to generate post idea');
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
      console.error('OpenAI engagement analysis error:', error);
      throw new Error('Failed to analyze engagement');
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
      console.error('OpenAI complete post generation error:', error);
      const cleanTopic = this.cleanUserPrompt(topic);
      return {
        content: `Check out our latest update about ${cleanTopic}! Perfect for ${platform}.`,
        imageUrl: null,
        hashtags: this.getFallbackHashtags(platform, options.brandContext),
        platform,
        aiGenerated: true,
        brandContextUsed: false
      };
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
      console.error('OpenAI content variation generation error:', error);
      return [content];
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
      console.error('OpenAI multiple posts generation error:', error);
      throw new Error('Failed to generate multiple posts');
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
    console.log('🖼️ OpenAI DALL-E image generation called for:', prompt);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('OpenAI API key not configured, returning placeholder image');
      const size = this.getPlatformImageSize(platform);
      return `https://via.placeholder.com/${size.width}x${size.height}/10B981/ffffff?text=${encodeURIComponent(prompt.substring(0, 30))}`;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: options.model === 'dall-e-2' ? 'dall-e-2' : 'dall-e-3',
          prompt: `Create a professional social media graphic for platform ${platform}. Topic: ${prompt}. The style should be modern, clean, and commercial, suitable for business marketing. Avoid text overlays or write minimal clean typography if necessary.${
            options.brandName ? ` Brand Name: ${options.brandName}.` : ''
          }${
            options.logoUrl ? ` Incorporate or overlay the brand logo asset (URL/reference: ${options.logoUrl}) cleanly and professionally in the visual layout.` : ''
          }${
            options.themeColor || options.logoColors ? ` Style the graphics using a cohesive color palette inspired by ${options.themeColor || ''}${options.logoColors ? ` and gradient colors: ${options.logoColors}` : ''}.` : ''
          }${
            options.companyAddress || options.contacts || options.brandEmail ? ` Cleanly embed the following contact information in a neat footer or visual overlay: ${[options.companyAddress, options.contacts, options.brandEmail].filter(Boolean).join(', ')}.` : ''
          }`,
          n: 1,
          size: '1024x1024',
          response_format: 'url'
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DALL-E API Error: ${errText}`);
      }

      const resData = await response.json();
      return resData.data[0].url;
    } catch (error) {
      console.error('Failed to generate image via DALL-E:', error);
      const size = this.getPlatformImageSize(platform);
      return `https://via.placeholder.com/${size.width}x${size.height}/10B981/ffffff?text=${encodeURIComponent(prompt.substring(0, 30))}`;
    }
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
      console.error('OpenAI batch image generation error:', error);
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