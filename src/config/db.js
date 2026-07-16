import { PrismaClient } from '@prisma/client';

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  prisma = global.prisma;
}

// Test connection immediately
prisma.$connect()
  .then(() => console.log('✅ Prisma database connected successfully'))
  .catch((error) => {
    console.error('❌ Prisma connection error:', error);
    process.exit(1);
  });

export { prisma };
