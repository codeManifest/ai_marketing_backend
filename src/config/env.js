import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dotenvPath = path.resolve(__dirname, '../../.env');
console.log(`📂 Resolving .env path: ${dotenvPath}`);
const result = dotenv.config({ path: dotenvPath });
if (result.error) {
  console.error("❌ Dotenv Error loading config:", result.error);
} else {
  console.log("✅ Dotenv config loaded successfully!");
}
console.log(`🔍 Raw GOOGLE_REDIRECT_URI from process.env: ${process.env.GOOGLE_REDIRECT_URI}`);

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-access-secret',
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET || 'fallback-refresh-secret',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI
  },
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  encryptionKey: process.env.ENCRYPTION_KEY,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },
  email: {
    service: process.env.EMAIL_SERVICE,
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '465', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM
  }
};
