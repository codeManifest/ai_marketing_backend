import { GoogleGenAI } from "@google/genai";

export async function analyzeBrandData(scrapeData) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ Google AI API Key not configured. Using fallback brand generator.");
    return {
      success: false,
      error: "API Key missing",
      analysis: getFallbackAnalysis(scrapeData)
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    You are an expert marketing brand analyst. Analyze the following scraped website data to extract brand identity assets.
    
    WEBSITE DETAILS:
    Url: ${scrapeData.url}
    Title: ${scrapeData.title}
    Meta Description: ${scrapeData.description}
    Detected CSS Colors: ${JSON.stringify(scrapeData.colors)}
    Computed Heading Color: ${scrapeData.headingColor}
    Computed Text Color: ${scrapeData.textColor}
    Computed Background Color: ${scrapeData.backgroundColor}
    Emails/Phones: ${JSON.stringify(scrapeData.contacts)}
    Social Media Links: ${JSON.stringify(scrapeData.socials)}
    
    RAW BODY TEXT EXCERPT:
    ${scrapeData.rawText}
    
    YOUR TASK:
    Return a structured JSON object representing the brand's identity and setup suggestions.
    
    Use the following JSON schema:
    {
      "brandName": "String (Extract clean legal or operating brand name)",
      "description": "String (Provide a comprehensive, detailed description of the brand in around 400-500 words. Describe their core services/products, brand values, target audience, unique selling points (USPs), tone settings, and what makes them stand out. This text will serve as primary reference context for the AI when generating social posts, image templates, and video assets later)",
      "industry": "String (One of: Technology, Healthcare, E-commerce, Retail, Education, Finance, Agency, Other)",
      "targetAudience": "String (Short description of who they sell to/write for)",
      "brandTone": "String (One of: professional, friendly, educational, bold, funny, empathetic)",
      "colors": {
        "primary": "String (Valid Hex code representing primary brand color. Use Computed Heading Color if available, otherwise pick the dominant color from Detected CSS Colors)",
        "secondary": "String (Valid Hex code representing secondary brand color. Use second dominant color from Detected CSS Colors)",
        "text": "String (Valid Hex code for main body text. Use Computed Text Color if available, default: #1f2937)"
      },
      "criticalFixes": [
        "String (An actionable website/SEO improvement, e.g. 'Optimize image sizes for mobile LCP')",
        "String (Another issue)",
        "String (Another issue)"
      ],
      "marketingPitch": "String (A compelling 2-sentence value proposition pitch that can be used for cold outreach or promotional copies)"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const parsedData = JSON.parse(response.text);
    return {
      success: true,
      analysis: parsedData
    };
  } catch (error) {
    console.warn("💥 Brand AI analysis with gemini-2.5-flash failed, trying fallback model gemini-1.5-flash:", error.message || error);
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const parsedData = JSON.parse(response.text);
      return {
        success: true,
        analysis: parsedData
      };
    } catch (fallbackError) {
      console.error("💥 Both Gemini models failed, falling back to local scraper analysis:", fallbackError.message || fallbackError);
      return {
        success: false,
        error: fallbackError.message,
        analysis: getFallbackAnalysis(scrapeData)
      };
    }
  }
}

function getFallbackAnalysis(scrapeData) {
  // Extract a clean brand name from Title
  let brandName = "";
  if (scrapeData.title) {
    const titleParts = scrapeData.title.split(/[|\-–]/);
    brandName = titleParts[0].trim();
  } else if (scrapeData.url) {
    try {
      const hostname = new URL(scrapeData.url).hostname;
      brandName = hostname.replace('www.', '').split('.')[0];
      brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
    } catch {}
  }

  // Fallback brand colors - strictly use parsed elements or empty strings
  const primary = scrapeData.headingColor || scrapeData.colors?.[0] || "";
  const secondary = scrapeData.colors?.[1] || "";
  const text = scrapeData.textColor || "";

  return {
    brandName,
    description: scrapeData.description || "",
    industry: "",
    targetAudience: "",
    brandTone: "",
    colors: {
      primary,
      secondary,
      text
    },
    criticalFixes: [],
    marketingPitch: ""
  };
}
