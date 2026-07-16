const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEFAULT_CONFIGS = [
  {
    provider: "GEMINI",
    apiKey: process.env.GEMINI_API_KEY || "placeholder-gemini-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-1.5-flash",
    isActive: true
  },
  {
    provider: "OPENAI",
    apiKey: process.env.OPENAI_API_KEY || "placeholder-openai-key",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    isActive: true
  },
  {
    provider: "REPLICATE",
    apiKey: process.env.REPLICATE_API_KEY || "placeholder-replicate-key",
    baseUrl: "https://api.replicate.com/v1",
    defaultModel: "stability-ai/sdxl",
    isActive: true
  },
  {
    provider: "OPENROUTER",
    apiKey: process.env.OPENROUTER_API_KEY || "placeholder-openrouter-key",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "google/gemini-2.5-flash",
    isActive: true
  }
];

async function seedAIConfigs() {
  console.log('⏳ Seeding default AI configurations...');
  for (const config of DEFAULT_CONFIGS) {
    await prisma.aIConfig.upsert({
      where: { provider: config.provider },
      update: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        defaultModel: config.defaultModel,
        isActive: config.isActive
      },
      create: config
    });
  }
  console.log('✅ AI configurations seeded successfully!');
}

async function main() {
  console.log('🏁 Starting AI configs seeding...');
  try {
    await seedAIConfigs();
    console.log('🎉 AI configs seeding completed!');
  } catch (error) {
    console.error('❌ AI configs seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
