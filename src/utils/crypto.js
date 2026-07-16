import crypto from 'crypto';

// AES-256-CBC requires a 32-byte key
const getEncryptionKey = () => {
  const baseKey = process.env.NEXTAUTH_SECRET || 'fallback-system-aes-key-for-credentials-safety-32-chars';
  // Hash the baseKey to guarantee a uniform 32-byte key
  return crypto.createHash('sha256').update(baseKey).digest();
};

const IV_LENGTH = 16; // AES block size is 16 bytes

export function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return iv and encrypted text joined by colon
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt secret');
  }
}

export function decrypt(text) {
  if (!text) return null;
  try {
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid encrypted format');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt secret');
  }
}
