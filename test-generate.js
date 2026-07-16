import { generateContent } from './src/controllers/ai.controller.js';
import { prisma } from './src/config/db.js';

// Mock Express response object
const mockRes = {
  status(code) {
    console.log(`[Mock Res] Status set to: ${code}`);
    return this;
  },
  json(data) {
    console.log('[Mock Res] JSON Data returned:');
    console.log(JSON.stringify(data, null, 2));
    return this;
  }
};

async function runTest() {
  console.log('🚀 Querying a valid member of workspace cmrmb6ngx0006nmzmayurtwuv...');
  const membership = await prisma.membership.findFirst({
    where: { workspaceId: 'cmrmb6ngx0006nmzmayurtwuv' }
  });

  if (!membership) {
    console.error('❌ No membership found for workspace!');
    return;
  }

  console.log(`🔑 Using user ID: ${membership.userId}`);

  // Mock Express request object
  const mockReq = {
    user: {
      id: membership.userId
    },
    body: {
      prompt: 'Write a friendly post about Kaziranga Assam tourist spot.',
      platform: 'all',
      workspaceId: 'cmrmb6ngx0006nmzmayurtwuv',
      type: 'post',
      options: {}
    }
  };

  console.log('🚀 Running generation test...');
  try {
    await generateContent(mockReq, mockRes);
    console.log('✅ Generation test completed!');
  } catch (error) {
    console.error('💥 Test error:', error);
  }
}

runTest()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
