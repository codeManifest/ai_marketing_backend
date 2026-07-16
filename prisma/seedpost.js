const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Sample data for social profiles
const SOCIAL_PROFILES = [
  {
    id: 'socprof_001',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    platform: 'FACEBOOK',
    platformId: 'fb_123456789',
    name: 'My Business Page',
    username: 'mybusiness',
    email: 'business@example.com',
    accessToken: 'fb_access_token_123',
    refreshToken: 'fb_refresh_token_123',
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
    isConnected: true,
    profilePicture: 'https://example.com/profile1.jpg',
    followersCount: 1500,
    likesCount: 2300,
    lastSynced: new Date(),
    autoRespond: true,
    autoPost: false
  },
  {
    id: 'socprof_002',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    platform: 'INSTAGRAM',
    platformId: 'ig_987654321',
    name: 'My Instagram',
    username: 'myinsta',
    email: 'instagram@example.com',
    accessToken: 'ig_access_token_456',
    refreshToken: 'ig_refresh_token_456',
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    isConnected: true,
    profilePicture: 'https://example.com/profile2.jpg',
    followersCount: 3200,
    likesCount: 15000,
    lastSynced: new Date(),
    autoRespond: false,
    autoPost: true
  },
  {
    id: 'socprof_003',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    platform: 'TWITTER',
    platformId: 'tw_555666777',
    name: 'My Twitter Handle',
    username: 'mytwitter',
    email: 'twitter@example.com',
    accessToken: 'tw_access_token_789',
    refreshToken: 'tw_refresh_token_789',
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    isConnected: true,
    profilePicture: 'https://example.com/profile3.jpg',
    followersCount: 8500,
    likesCount: 42000,
    lastSynced: new Date(),
    autoRespond: true,
    autoPost: true
  },
  {
    id: 'socprof_004',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    platform: 'LINKEDIN',
    platformId: 'li_111222333',
    name: 'My LinkedIn Company',
    username: 'mycompany',
    email: 'linkedin@example.com',
    accessToken: 'li_access_token_000',
    refreshToken: 'li_refresh_token_000',
    tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    isConnected: true,
    profilePicture: 'https://example.com/profile4.jpg',
    followersCount: 12000,
    likesCount: 0,
    lastSynced: new Date(),
    autoRespond: false,
    autoPost: false
  }
];

// Sample data for posts
const POSTS = [
  {
    id: 'post_001',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    socialProfileId: 'socprof_001', // Facebook
    content: 'Exciting news! We just launched our new product line. Check it out and let us know what you think! 🚀 #NewProduct #Innovation',
    mediaUrls: ['https://example.com/product1.jpg', 'https://example.com/product2.jpg'],
    hashtags: '#NewProduct #Innovation #BusinessGrowth',
    scheduledFor: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    postedAt: null,
    status: 'SCHEDULED',
    platform: 'FACEBOOK',
    postId: null,
    aiGenerated: true,
    aiPrompt: 'Create an engaging post about launching new products',
    engagementRate: 0
  },
  {
    id: 'post_002',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    socialProfileId: 'socprof_002', // Instagram
    content: 'Behind the scenes at our photoshoot! 📸✨ Loving the energy and creativity from our amazing team. #BehindTheScenes #TeamWork',
    mediaUrls: ['https://example.com/behind-scenes1.jpg', 'https://example.com/behind-scenes2.jpg'],
    hashtags: '#BehindTheScenes #TeamWork #Creative',
    scheduledFor: null,
    postedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    status: 'POSTED',
    platform: 'INSTAGRAM',
    postId: 'ig_post_123456',
    aiGenerated: false,
    aiPrompt: null,
    engagementRate: 4.2
  },
  {
    id: 'post_003',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    socialProfileId: 'socprof_003', // Twitter
    content: 'Just hit 10K followers! 🎉 Thank you to everyone for your amazing support. We appreciate each and every one of you! #Milestone #ThankYou',
    mediaUrls: ['https://example.com/milestone.jpg'],
    hashtags: '#Milestone #ThankYou #Grateful',
    scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    postedAt: null,
    status: 'SCHEDULED',
    platform: 'TWITTER',
    postId: null,
    aiGenerated: true,
    aiPrompt: 'Create a celebratory post for reaching 10K followers',
    engagementRate: 0
  },
  {
    id: 'post_004',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    socialProfileId: 'socprof_004', // LinkedIn
    content: 'We are proud to announce our partnership with TechCorp to drive innovation in the industry. Together, we will create amazing solutions for our clients. #Partnership #Innovation #Business',
    mediaUrls: ['https://example.com/partnership.jpg'],
    hashtags: '#Partnership #Innovation #Business',
    scheduledFor: null,
    postedAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6 hours ago
    status: 'POSTED',
    platform: 'LINKEDIN',
    postId: 'li_post_789012',
    aiGenerated: true,
    aiPrompt: 'Professional announcement for a new business partnership',
    engagementRate: 3.8
  },
  {
    id: 'post_005',
    workspaceId: 'cmgwhpi900006nmstnednduu1',
    socialProfileId: 'socprof_001', // Facebook
    content: 'Weekend special! Get 20% off on all our products. Limited time offer. Shop now! 🛍️ #WeekendSale #Discount #Shopping',
    mediaUrls: ['https://example.com/sale-banner.jpg'],
    hashtags: '#WeekendSale #Discount #Shopping',
    scheduledFor: new Date(Date.now() + 72 * 60 * 60 * 1000), // 3 days from now
    postedAt: null,
    status: 'DRAFT',
    platform: 'FACEBOOK',
    postId: null,
    aiGenerated: false,
    aiPrompt: null,
    engagementRate: 0
  }
];

async function clearExistingData() {
  console.log('🧹 Deleting existing posts and social profiles...');
  
  // Delete in correct order to respect foreign key constraints
  await prisma.post.deleteMany({
    where: { workspaceId: 'cmgwhpi900006nmstnednduu1' }
  });
  
  await prisma.socialProfile.deleteMany({
    where: { workspaceId: 'cmgwhpi900006nmstnednduu1' }
  });
  
  console.log('✅ All existing posts and social profiles deleted.');
}

async function seedSocialProfiles() {
  console.log('⏳ Seeding social profiles...');
  for (const profileData of SOCIAL_PROFILES) {
    await prisma.socialProfile.create({ 
      data: {
        ...profileData,
        tokenExpiresAt: profileData.tokenExpiresAt,
        lastSynced: profileData.lastSynced
      }
    });
  }
  console.log('✅ Social profiles seeded successfully!');
}

async function seedPosts() {
  console.log('⏳ Seeding posts...');
  for (const postData of POSTS) {
    await prisma.post.create({ 
      data: {
        ...postData,
        mediaUrls: postData.mediaUrls,
        scheduledFor: postData.scheduledFor,
        postedAt: postData.postedAt
      }
    });
  }
  console.log('✅ Posts seeded successfully!');
}

async function main() {
  console.log('🏁 Starting social profiles and posts seeding...');
  try {
    await clearExistingData();
    await seedSocialProfiles();
    await seedPosts();
    console.log('🎉 Social profiles and posts seeding completed!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();