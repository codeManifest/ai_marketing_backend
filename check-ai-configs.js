import { prisma } from './src/config/db.js';

async function checkConfigs() {
  const configs = await prisma.aIConfig.findMany();
  console.log('📋 Existing AI Configs:');
  console.log(JSON.stringify(configs, null, 2));
}

checkConfigs()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
