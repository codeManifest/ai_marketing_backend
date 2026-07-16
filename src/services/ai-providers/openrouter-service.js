// app/lib/ai-providers/openrouter-service.js
import { BaseAIProvider } from "./base-provider.js";

export class OpenRouterService extends BaseAIProvider {
  async generateContent(prompt, options = {}) {
    try {
      console.log('🔑 Using OpenRouter...');

      // 1. Fetch config from database
      const dbConfig = await this.getDbConfig('openrouter');

      // 2. Resolve parameters (DB first, fallback to env / defaults)
      const apiKey = dbConfig?.apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
      const baseUrl = dbConfig?.baseUrl || 'https://openrouter.ai/api/v1';
      const defaultModelName = dbConfig?.defaultModel || 'google/gemini-2.5-flash';

      if (!apiKey || apiKey.includes('placeholder-')) {
        throw new Error('OpenRouter API key not configured. Please set it in Admin AI Operations configs.');
      }

      const cleanPrompt = this.cleanUserPrompt(prompt);
      const systemPrompt = this.buildAIPrompt("", options);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000);

      // Parse custom settings if present
      let customHeaders = {};
      if (dbConfig?.settings) {
        try {
          const settings = typeof dbConfig.settings === 'string' 
            ? JSON.parse(dbConfig.settings) 
            : dbConfig.settings;
          if (settings.headers) {
            customHeaders = settings.headers;
          }
        } catch (e) {
          console.warn("[OpenRouterService] Failed to parse custom settings JSON:", e);
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://postly.ai',
        'X-Title': 'Growthly',
        ...customHeaders
      };

      const requestBody = {
        model: options.model || defaultModelName,
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
        max_tokens: Math.max(options.maxTokens || 500, 2000),
        temperature: options.temperature || 0.7
      };

      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
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
            throw new Error('OpenRouter API key is invalid or expired.');
          } else if (response.status === 429) {
            throw new Error('OpenRouter rate limit exceeded. Please try again later.');
          }
          throw new Error(`OpenRouter API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        console.log('🔍 OpenRouter Raw Response Data:', JSON.stringify(data, null, 2));
        if (data.error) {
          throw new Error(`OpenRouter API error: ${data.error.message || JSON.stringify(data.error)}`);
        }
        let generatedText = data.choices?.[0]?.message?.content;
        if (!generatedText && data.choices?.[0]?.message?.reasoning) {
          console.warn('⚠️ OpenRouter content was null but reasoning was found. Using reasoning as fallback...');
          generatedText = data.choices[0].message.reasoning;
        }
        if (!generatedText) {
          throw new Error('OpenRouter API returned an empty completion response.');
        }

        return this.cleanGeneratedContent(generatedText);

      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          throw new Error('OpenRouter API request timed out. Please try again.');
        }
        throw fetchError;
      }

    } catch (error) {
      console.error('💥 OpenRouter error:', error);
      throw new Error(`OpenRouter Error: ${error.message}`);
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
      console.error('OpenRouter social media post generation error:', error);
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
      console.error('OpenRouter hashtag generation error:', error);
      return this.getFallbackHashtags(platform, brandContext);
    }
  }

  async optimizePost(content, platform, brandContext = '') {
    const cleanContent = this.cleanUserPrompt(content);
    const prompt = `Optimize this content for ${platform} to improve readability and engagement. Return only the optimized content text. Content: "${cleanContent}"`;

    try {
      return await this.generateContent(prompt, { maxTokens: 400 });
    } catch (error) {
      console.error('OpenRouter post optimization error:', error);
      return content;
    }
  }

  async generatePostIdea(topic, platform, tone = 'professional', brandContext = '') {
    const prompt = `Generate 3 creative social media post ideas for ${platform} about: "${topic}". Tone should be ${tone}. Return the ideas list.`;
    try {
      return await this.generateContent(prompt, { maxTokens: 400 });
    } catch (error) {
      console.error('OpenRouter post idea generation error:', error);
      return `Create a post sharing insights on ${topic}`;
    }
  }

  async analyzeEngagement(content, platform, brandContext = '') {
    const prompt = `Analyze this ${platform} post content for engagement and suggest improvements: "${content}"`;
    try {
      return await this.generateContent(prompt, { maxTokens: 300 });
    } catch (error) {
      console.error('OpenRouter engagement analysis error:', error);
      return "Looks good! Keep posting consistently.";
    }
  }

  async generateCompletePost(topic, platform, options = {}) {
    const prompt = `Write a complete, highly engaging social media post for ${platform} about: "${topic}". Include appropriate emojis and spacing.`;
    try {
      return await this.generateSocialMediaPost(prompt, platform, options);
    } catch (error) {
      console.error('OpenRouter complete post generation error:', error);
      return this.generateFallbackSocialPost(topic, platform, options.brandContext);
    }
  }

  async generateContentVariations(content, platform, variations = 3, brandContext = '') {
    const prompt = `Create ${variations} different text variations of this ${platform} post: "${content}"`;
    try {
      const result = await this.generateContent(prompt, { maxTokens: 500 });
      return result.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error('OpenRouter content variations generation error:', error);
      return [content];
    }
  }
}
