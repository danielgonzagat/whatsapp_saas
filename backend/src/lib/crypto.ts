/**
 * Standardized encryption/decryption utilities for sensitive data.
 * Uses AES-256-GCM with random IV for each encryption.
 * 
 * USAGE:
 *   const encrypted = encryptString('my-secret-token', process.env.ENCRYPTION_KEY!);
 *   const decrypted = decryptString(encrypted, process.env.ENCRYPTION_KEY!);
 * 
 * ENCRYPTION_KEY must be 32 bytes (256 bits) hex or base64 encoded.
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derives a 32-byte key from the provided key material.
 * Supports hex-encoded keys or derives from any string using SHA-256.
 */
function deriveKey(keyMaterial: string): Buffer {
  // If it's a 64-char hex string (32 bytes), use directly
  if (/^[a-f0-9]{64}$/i.test(keyMaterial)) {
    return Buffer.from(keyMaterial, 'hex');
  }
  // If it's base64 encoded 32 bytes
  try {
    const decoded = Buffer.from(keyMaterial, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Not valid base64, continue to derive
  }
  // Derive from any string using SHA-256
  return crypto.createHash('sha256').update(keyMaterial).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: IV + ciphertext + authTag
 * 
 * @param plaintext - The string to encrypt
 * @param key - The encryption key (will be derived to 32 bytes)
 * @returns Base64-encoded encrypted data
 */
export function encryptString(plaintext: string, key: string): string {
  if (!key) {
    throw new Error('Encryption key is required');
  }
  
  const derivedKey = deriveKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Format: IV (16 bytes) + ciphertext + authTag (16 bytes)
  const combined = Buffer.concat([iv, encrypted, authTag]);
  
  return combined.toString('base64');
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * 
 * @param encryptedData - Base64-encoded encrypted data (IV + ciphertext + authTag)
 * @param key - The decryption key (same as encryption key)
 * @returns Decrypted plaintext string
 */
export function decryptString(encryptedData: string, key: string): string {
  if (!key) {
    throw new Error('Decryption key is required');
  }
  
  const derivedKey = deriveKey(key);
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Minimum: IV (16) + authTag (16) = 32 bytes (empty plaintext is valid)
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short');
  }
  
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Checks if a string appears to be encrypted (base64 with correct length).
 * This is a heuristic check, not a guarantee.
 */
export function isEncrypted(data: string): boolean {
  if (!data || typeof data !== 'string') return false;
  
  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(data)) return false;
  
  try {
    const decoded = Buffer.from(data, 'base64');
    // Minimum length: IV (16) + authTag (16) = 32 bytes
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Safely decrypts data, returning the original value if decryption fails.
 * Useful for migrating from plaintext to encrypted values.
 */
export function safeDecrypt(data: string, key: string): string {
  if (!data) return data;
  
  if (!isEncrypted(data)) {
    return data; // Return as-is if not encrypted
  }
  
  try {
    return decryptString(data, key);
  } catch {
    return data; // Return as-is if decryption fails
  }
}

/**
 * Generates a secure random encryption key (32 bytes = 256 bits).
 * Returns as hex string.
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
