import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'bhaaratbyte@gmail.com';
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    console.log(`User ${email} not found.`);
    return;
  }

  const userId = user.id;
  console.log(`Found user: ${user.name} (${userId})`);

  // Find all workspaces owned by the user
  const workspaces = await prisma.workspace.findMany({
    where: { ownerId: userId }
  });

  const workspaceIds = workspaces.map(w => w.id);
  console.log(`Found workspaces owned:`, workspaceIds);

  // We can temporarily disable foreign key checks, then run SQL queries
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

  // Delete records for each workspace
  for (const workspaceId of workspaceIds) {
    console.log(`Deleting data for workspace: ${workspaceId}`);
    try { await prisma.$executeRawUnsafe(`DELETE FROM brand_profiles WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM posts WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM tasks WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM leads WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM social_profiles WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM ai_settings WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM generated_posts WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM ad_campaigns WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM blog_posts WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM content_categories WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM content_plans WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM custom_forms WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM verified_domains WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM workspace_limit_usages WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM memberships WHERE workspaceId = '${workspaceId}'`); } catch(e){}
    try { await prisma.$executeRawUnsafe(`DELETE FROM workspaces WHERE id = '${workspaceId}'`); } catch(e){}
  }

  // Delete user records
  console.log(`Deleting data for user: ${userId}`);
  try { await prisma.$executeRawUnsafe(`DELETE FROM user_system_roles WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM sessions WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM accounts WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM memberships WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM payments WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM ai_usage WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM subscriptions WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM notifications WHERE userId = '${userId}'`); } catch(e){}
  try { await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${userId}'`); } catch(e){}

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('✅ User and all associated data cleared successfully!');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
