import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PLANS = [
  {
    name: "FREE",
    price: 0,
    currency: "INR",
    maxWorkspaces: 1,
    monthlyAiCredits: 500,
    maxSocialProfiles: 4,
    includeSeoTool: false,
    allowedVideos: false,
    allowedGraphics: false,
    includeAdManager: false,
    includeLeadsCRM: false,
    includeAnalytics: true,
    includeAiContentStudio: false,
    includeAutomation: false,
    includeTextModel: "GEMINI_2_5_FLASH",
    includeGraphicsModel: "NONE",
    includeVideoModel: "NONE",
    maxAiAutoReplies: 50,
    maxPostsGenerated: 100,
    maxAiTemplates: 5,
    maxCategories: 10,
    maxAiPrompts: 10,
    maxInboxReplies: 500,
    annualDiscount: 0,
    features: {
      socialProfiles: 3,
      scheduledPosts: 10,
      autoReplies: 10,
      teamMembers: 1,
      analytics: "basic",
      support: "email"
    }
  },
  {
    name: "STARTER",
    price: 299,
    currency: "INR",
    maxWorkspaces: 3,
    monthlyAiCredits: 1000,
    maxSocialProfiles: 4,
    includeSeoTool: false,
    allowedVideos: false,
    allowedGraphics: true,
    includeAdManager: false,
    includeLeadsCRM: false,
    includeAnalytics: true,
    includeAiContentStudio: true,
    includeAutomation: true,
    includeTextModel: "GEMINI_2_5_FLASH",
    includeGraphicsModel: "IMAGEN_3",
    includeVideoModel: "NONE",
    maxAiAutoReplies: 200,
    maxPostsGenerated: 500,
    maxAiTemplates: 15,
    maxCategories: 30,
    maxAiPrompts: 50,
    maxInboxReplies: 2000,
    annualDiscount: 10,
    features: {
      socialProfiles: 10,
      scheduledPosts: 100,
      autoReplies: 100,
      teamMembers: 3,
      analytics: "advanced",
      support: "priority"
    }
  },
  {
    name: "PROFESSIONAL",
    price: 2499,
    currency: "INR",
    maxWorkspaces: 5,
    monthlyAiCredits: 2000,
    maxSocialProfiles: 10,
    includeSeoTool: true,
    allowedVideos: true,
    allowedGraphics: true,
    includeAdManager: true,
    includeLeadsCRM: true,
    includeAnalytics: true,
    includeAiContentStudio: true,
    includeAutomation: true,
    includeTextModel: "GEMINI_2_5_FLASH",
    includeGraphicsModel: "IMAGEN_3",
    includeVideoModel: "VEO",
    maxAiAutoReplies: 1000,
    maxPostsGenerated: 2500,
    maxAiTemplates: 50,
    maxCategories: 100,
    maxAiPrompts: 250,
    maxInboxReplies: 10000,
    annualDiscount: 20,
    features: {
      socialProfiles: 25,
      scheduledPosts: 500,
      autoReplies: 500,
      teamMembers: 10,
      analytics: "premium",
      support: "dedicated"
    }
  },
  {
    name: "ENTERPRISE",
    price: 4999,
    currency: "INR",
    maxWorkspaces: 10,
    monthlyAiCredits: 4000,
    maxSocialProfiles: 25,
    includeSeoTool: true,
    allowedVideos: true,
    allowedGraphics: true,
    includeAdManager: true,
    includeLeadsCRM: true,
    includeAnalytics: true,
    includeAiContentStudio: true,
    includeAutomation: true,
    includeTextModel: "GEMINI_1_5_PRO",
    includeGraphicsModel: "IMAGEN_3",
    includeVideoModel: "VEO_SORA",
    maxAiAutoReplies: -1,
    maxPostsGenerated: -1,
    maxAiTemplates: -1,
    maxCategories: -1,
    maxAiPrompts: -1,
    maxInboxReplies: -1,
    annualDiscount: 20,
    features: {
      socialProfiles: 100,
      scheduledPosts: 2000,
      autoReplies: 2000,
      teamMembers: 50,
      analytics: "enterprise",
      support: "24/7"
    }
  }
];

async function seedPlans() {
  console.log('⏳ Seeding new plans via upsert...');
  for (const planData of PLANS) {
    const { name, ...rest } = planData;
    await prisma.plan.upsert({
      where: { name },
      update: rest,
      create: planData
    });
  }
  console.log('✅ Plans seeded successfully!');
}

async function main() {
  console.log('🏁 Starting plan seeding...');
  try {
    await seedPlans();
    console.log('🎉 Plan seeding completed!');
  } catch (error) {
    console.error('❌ Plan seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();