import { prisma } from './src/config/db.js';
import { createWorkspaceWithSubscription } from './src/services/subscription-service.js';

async function testFlow() {
  const email = 'testonboarding@gmail.com';
  console.log(`🚀 Starting onboarding simulation for ${email}...`);

  // Clean existing test user first if any
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log('🧹 Cleaning previous test user...');
      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');
      await prisma.$executeRawUnsafe(`DELETE FROM brand_profiles WHERE workspaceId IN (SELECT id FROM workspaces WHERE ownerId = '${existing.id}')`);
      await prisma.$executeRawUnsafe(`DELETE FROM workspaces WHERE ownerId = '${existing.id}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM memberships WHERE userId = '${existing.id}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM subscriptions WHERE userId = '${existing.id}'`);
      await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${existing.id}'`);
      await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
    }
  } catch (e) {
    console.error('Clean error:', e);
  }

  // 1. Create User (simulate signup)
  console.log('1. Simulating signup...');
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Test Onboarding User',
      password: 'hashedpassword123',
      emailVerified: new Date(),
    }
  });
  console.log(`✅ User created: ${user.id}`);

  // 2. Select Plan (simulate select-plan onboarding page request)
  const planId = 'cmgwhnoa30000nmr7bmn82xa1'; // FREE plan ID
  console.log(`2. Simulating onboarding plan selection (FREE plan)...`);
  
  const onboardingResult = await createWorkspaceWithSubscription({
    userId: user.id,
    planId,
    workspaceData: {
      name: 'Test Workspace',
      brandName: 'Test Brand',
      industry: 'Technology',
      website: 'https://testbrand.com',
      description: 'Test Brand description'
    }
  });

  console.log(`✅ Onboarding completed:`);
  console.log(`   - Workspace: ${onboardingResult.workspace.id} (${onboardingResult.workspace.name})`);
  console.log(`   - Subscription: ${onboardingResult.subscription.id} (Plan: ${onboardingResult.subscription.planId}, Status: ${onboardingResult.subscription.status})`);

  // 3. Simulate getUserSubscription (what `/api/user/subscription` returns)
  console.log('\n3. Simulating getUserSubscription API endpoint...');
  
  const userSubscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      status: {
        in: ['ACTIVE', 'TRIAL']
      }
    },
    include: {
      plan: true,
      workspaces: {
        select: {
          id: true,
          name: true,
          brandName: true
        }
      }
    }
  });

  if (!userSubscription) {
    console.log('❌ No active/trial subscription found for user!');
  } else {
    const totalWorkspaces = await prisma.membership.count({
      where: { userId: user.id }
    });

    const subscriptionData = {
      id: userSubscription.id,
      status: userSubscription.status,
      isTrial: userSubscription.isTrial,
      plan: userSubscription.plan,
      usedWorkspaces: totalWorkspaces,
      workspaces: userSubscription.workspaces
    };

    console.log('✅ API Response Payload:');
    console.log(JSON.stringify(subscriptionData, null, 2));
  }
}

testFlow()
  .catch(e => console.error('💥 Test failed:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });
