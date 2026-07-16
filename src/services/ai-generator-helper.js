import { GoogleGenAI } from "@google/genai";
import { prisma } from "../config/db.js";

/**
 * Core credit-free AI generation helper that loads active configs from DB
 * and implements fallback routing to OpenRouter.
 * 
 * @param {string} prompt Prompt to execute
 * @param {object} options Options like temperature and responseMimeType
 * @returns {Promise<{text: string, provider: string, model: string}>}
 */
export async function generateRawAIContent(prompt, options = {}) {
  const temperature = options.temperature !== undefined ? options.temperature : 0.7;
  const responseMimeType = options.responseMimeType;

  // 1. Load active AIConfig for GEMINI
  const aiConfig = await prisma.aIConfig.findFirst({
    where: {
      provider: 'GEMINI',
      isActive: true
    }
  });

  if (!aiConfig || !aiConfig.apiKey) {
    throw new Error("Active Gemini AI configuration not found in database.");
  }

  const apiKey = aiConfig.apiKey;
  const modelName = aiConfig.defaultModel || "gemini-2.5-flash";

  let resultText = '';
  let providerName = "GEMINI";
  let activeModel = modelName;

  try {
    const ai = new GoogleGenAI({ apiKey });
    console.log(`🤖 Reusable AI Helper: Generating content using model: ${modelName} via DB config key`);
    
    const genConfig = { temperature };
    if (responseMimeType) {
      genConfig.responseMimeType = responseMimeType;
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: genConfig
    });

    if (!response || !response.text) {
      throw new Error("Empty response returned from AI model.");
    }
    
    resultText = response.text;

  } catch (geminiError) {
    console.warn("⚠️ Gemini generation failed, attempting fallback to OpenRouter...", geminiError.message);
    
    // Load OpenRouter configuration from database
    const openRouterConfig = await prisma.aIConfig.findFirst({
      where: {
        provider: 'OPENROUTER',
        isActive: true
      }
    });

    if (!openRouterConfig || !openRouterConfig.apiKey || openRouterConfig.apiKey.includes('placeholder')) {
      throw new Error(`${geminiError.message}. OpenRouter fallback is not configured in settings.`);
    }

    const orApiKey = openRouterConfig.apiKey;
    const orBaseUrl = openRouterConfig.baseUrl || 'https://openrouter.ai/api/v1';
    let orModel = openRouterConfig.defaultModel || 'openrouter/free';

    // Candidates list for OpenRouter
    const modelCandidates = [
      orModel,
      'openrouter/free',
      'google/gemini-2.0-flash:free',
      'google/gemini-1.5-flash:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free'
    ];

    let success = false;
    let orText = '';
    let orData = null;

    for (const candidate of modelCandidates) {
      if (!candidate) continue;
      if (candidate === 'free') continue;

      try {
        console.log(`🤖 Fallback AI: Attempting OpenRouter model: ${candidate}`);
        const response = await fetch(`${orBaseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${orApiKey}`,
            'HTTP-Referer': 'https://postly.ai',
            'X-Title': 'Growthly'
          },
          body: JSON.stringify({
            model: candidate,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ],
            response_format: candidate.includes('gemini') ? { type: "json_object" } : undefined,
            temperature
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          if (resJson.error) {
            console.warn(`⚠️ OpenRouter candidate ${candidate} error response:`, JSON.stringify(resJson.error));
            continue;
          }
          const contentText = resJson.choices?.[0]?.message?.content || resJson.choices?.[0]?.text;
          if (contentText && contentText.trim()) {
            orData = resJson;
            orText = contentText;
            success = true;
            activeModel = candidate;
            break;
          }
        } else {
          const errText = await response.text();
          console.warn(`⚠️ OpenRouter candidate ${candidate} failed: ${errText}`);
        }
      } catch (err) {
        console.warn(`⚠️ Error attempting candidate ${candidate}:`, err.message);
      }
    }

    if (!success || !orText) {
      throw new Error(`OpenRouter fallback failed for all model candidates. Last Response: ${JSON.stringify(orData)}`);
    }

    resultText = orText;
    providerName = "OPENROUTER";
  }

  return {
    text: resultText,
    provider: providerName,
    model: activeModel
  };
}

/**
 * Reusable AI generation helper that loads active credentials from the database,
 * checks and deducts workspace AI credits, and registers the usage log.
 * 
 * @param {string} workspaceId The workspace ID
 * @param {string} userId The user ID (from session)
 * @param {object} options Options for generation
 * @param {string} options.topic Article/Content topic
 * @param {string} options.keywords Comma-separated keywords
 * @param {string} options.prompt The customized prompt to execute
 * @param {string} options.action The CreditAction enum name (default: WEBSITE_POST_GENERATION)
 * @returns {Promise<{success: boolean, article?: any, error?: string, creditsUsed?: number}>}
 */
export async function generateAIContent(workspaceId, userId, options = {}) {
  const {
    topic,
    keywords = "",
    prompt,
    action = "WEBSITE_POST_GENERATION"
  } = options;

  try {
    // 1. Load the credit cost for this action
    const creditCostConfig = await prisma.aICreditCost.findUnique({
      where: { action }
    });
    const cost = creditCostConfig ? creditCostConfig.cost : 20;

    // 2. Load user subscription & check credit balance
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
      throw new Error("No active subscription found. Please subscribe to use AI generation.");
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

    const totalUsed = usedCredits._sum.creditsUsed || 0;
    const availableCredits = userSubscription.plan.monthlyAiCredits;

    if (totalUsed + cost > availableCredits) {
      throw new Error(`Insufficient AI credits. Required: ${cost}, Remaining: ${availableCredits - totalUsed}`);
    }

    // 3. Call core raw AI generation helper
    const rawContent = await generateRawAIContent(prompt, {
      temperature: 0.7,
      responseMimeType: "application/json"
    });

    const result = JSON.parse(rawContent.text);
    const inputTokens = Math.round(prompt.length / 4);
    const outputTokens = Math.round(rawContent.text.length / 4);

    // 4. DB Updates in a transaction: Log usage and increment subscription
    await prisma.$transaction([
      prisma.aIUsage.create({
        data: {
          userId,
          workspaceId,
          subscriptionId: userSubscription.id,
          feature: action.toLowerCase(),
          provider: rawContent.provider,
          model: rawContent.model,
          creditsUsed: cost,
          inputTokens,
          outputTokens,
          metadata: { topic, keywords, isFallback: rawContent.provider === "OPENROUTER" },
          details: { modelUsed: rawContent.model, action }
        }
      }),
      prisma.subscription.update({
        where: { id: userSubscription.id },
        data: {
          usedAiCredits: {
            increment: cost
          }
        }
      }),
      prisma.notification.create({
        data: {
          workspaceId,
          title: `AI Article Generated (${rawContent.provider})`,
          message: `Generated a new AI blog article using ${rawContent.provider} (${cost} credits used).`,
          type: "success"
        }
      })
    ]);

    return {
      success: true,
      article: result,
      creditsUsed: cost,
      providerUsed: rawContent.provider
    };

  } catch (error) {
    console.error("❌ Error generating AI content helper:", error);
    
    let readableError = error.message || "Failed to generate AI blog article. Please try again.";
    
    // Parse nested Google Generative AI JSON error message if present
    if (error.message && error.message.includes("{") && error.message.includes("}")) {
      try {
        const jsonStartIndex = error.message.indexOf("{");
        const parsed = JSON.parse(error.message.substring(jsonStartIndex));
        if (parsed.error && parsed.error.message) {
          readableError = parsed.error.message;
        }
      } catch (e) {
        // Fallback to error.message if parsing fails
      }
    }

    // Map typical quota, validation, and key errors to clean human messages
    if (readableError.includes("Quota exceeded") || readableError.includes("RESOURCE_EXHAUSTED") || readableError.includes("rate-limits")) {
      readableError = "Gemini API Free Tier rate limit exceeded. Please wait a few seconds and try again.";
    } else if (readableError.includes("API key") || readableError.includes("UNAUTHENTICATED") || readableError.includes("authentication credentials")) {
      readableError = "Invalid Gemini API key. Please check your AI settings configuration in the Admin dashboard.";
    } else if (readableError.includes("credits") || readableError.includes("creditsUsed") || readableError.includes("Insufficient")) {
      readableError = "Insufficient AI credits remaining in your workspace plan to generate this article.";
    }

    return {
      success: false,
      error: readableError
    };
  }
}
