import {
  encryptString,
  decryptString,
  isEncrypted,
  safeDecrypt,
  generateEncryptionKey,
} from './crypto';

describe('Crypto Library', () => {
  const testKey = generateEncryptionKey();
  const testPlaintext = 'my-secret-api-token-12345';

  describe('encryptString', () => {
    it('should encrypt a string', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toEqual(testPlaintext);
      expect(typeof encrypted).toBe('string');
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const encrypted1 = encryptString(testPlaintext, testKey);
      const encrypted2 = encryptString(testPlaintext, testKey);
      
      expect(encrypted1).not.toEqual(encrypted2);
    });

    it('should throw if no key provided', () => {
      expect(() => encryptString(testPlaintext, '')).toThrow('Encryption key is required');
    });
  });

  describe('decryptString', () => {
    it('should decrypt an encrypted string', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      const decrypted = decryptString(encrypted, testKey);
      
      expect(decrypted).toEqual(testPlaintext);
    });

    it('should handle various plaintext types', () => {
      const testCases = [
        'simple',
        'with spaces and punctuation!',
        '{"json": "data", "number": 123}',
        'unicode: 你好世界 🌍',
        'a', // minimum single char
      ];

      for (const text of testCases) {
        const encrypted = encryptString(text, testKey);
        const decrypted = decryptString(encrypted, testKey);
        expect(decrypted).toEqual(text);
      }
    });

    it('should handle empty string', () => {
      const encrypted = encryptString('', testKey);
      const decrypted = decryptString(encrypted, testKey);
      expect(decrypted).toEqual('');
    });

    it('should fail with wrong key', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      const wrongKey = generateEncryptionKey();
      
      expect(() => decryptString(encrypted, wrongKey)).toThrow();
    });

    it('should fail with tampered ciphertext', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      const tampered = encrypted.substring(0, encrypted.length - 2) + 'XX';
      
      expect(() => decryptString(tampered, testKey)).toThrow();
    });

    it('should throw if data too short', () => {
      expect(() => decryptString('YWJj', testKey)).toThrow('Invalid encrypted data: too short');
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted data', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted('plain-text-token')).toBe(false);
      expect(isEncrypted('not base64!')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isEncrypted(null as any)).toBe(false);
      expect(isEncrypted(undefined as any)).toBe(false);
      expect(isEncrypted('')).toBe(false);
    });

    it('should return false for short base64', () => {
      expect(isEncrypted('YWJj')).toBe(false); // 'abc' in base64
    });
  });

  describe('safeDecrypt', () => {
    it('should decrypt valid encrypted data', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      const result = safeDecrypt(encrypted, testKey);
      
      expect(result).toEqual(testPlaintext);
    });

    it('should return original value for non-encrypted data', () => {
      const plaintext = 'plain-api-token';
      const result = safeDecrypt(plaintext, testKey);
      
      expect(result).toEqual(plaintext);
    });

    it('should return original value for tampered data', () => {
      const encrypted = encryptString(testPlaintext, testKey);
      const tampered = encrypted.substring(0, encrypted.length - 2) + 'XX';
      
      const result = safeDecrypt(tampered, testKey);
      expect(result).toEqual(tampered); // Returns as-is
    });

    it('should handle empty values', () => {
      expect(safeDecrypt('', testKey)).toEqual('');
      expect(safeDecrypt(null as any, testKey)).toEqual(null);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a 64-char hex string (32 bytes)', () => {
      const key = generateEncryptionKey();
      
      expect(key).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(key)).toBe(true);
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      
      expect(key1).not.toEqual(key2);
    });
  });

  describe('key derivation', () => {
    it('should accept hex-encoded 32-byte key', () => {
      const hexKey = 'a'.repeat(64); // 32 bytes as hex
      const encrypted = encryptString(testPlaintext, hexKey);
      const decrypted = decryptString(encrypted, hexKey);
      
      expect(decrypted).toEqual(testPlaintext);
    });

    it('should derive key from arbitrary string', () => {
      const simpleKey = 'my-simple-password';
      const encrypted = encryptString(testPlaintext, simpleKey);
      const decrypted = decryptString(encrypted, simpleKey);
      
      expect(decrypted).toEqual(testPlaintext);
    });
  });
});
