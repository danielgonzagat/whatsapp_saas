import {
  encryptMailboxToken,
  decryptMailboxToken,
  isEncryptedMailboxToken,
} from './mailbox-token-crypto';

const MOCK_KEY = 'a'.repeat(64);

function withEnv(key: string, fn: () => void) {
  const prev = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  process.env.EMAIL_TOKEN_ENCRYPTION_KEY = key;
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_TOKEN_ENCRYPTION_KEY = prev;
    }
  }
}

describe('mailbox-token-crypto', () => {
  describe('with EMAIL_TOKEN_ENCRYPTION_KEY', () => {
    describe('encryptMailboxToken', () => {
      it('returns the input for nullish values', () => {
        withEnv(MOCK_KEY, () => {
          expect(encryptMailboxToken(null)).toBeNull();
          expect(encryptMailboxToken(undefined)).toBeUndefined();
          expect(encryptMailboxToken('')).toBe('');
        });
      });

      it('encrypts a token and produces a versioned string', () => {
        withEnv(MOCK_KEY, () => {
          const result = encryptMailboxToken('my-access-token');
          expect(result).toMatch(/^v1\.[A-Za-z0-9+/]+=*$/);
          expect(result).not.toContain('my-access-token');
        });
      });

      it('produces different ciphertexts on each call', () => {
        withEnv(MOCK_KEY, () => {
          const a = encryptMailboxToken('same-token');
          const b = encryptMailboxToken('same-token');
          expect(a).not.toEqual(b);
        });
      });
    });

    describe('decryptMailboxToken', () => {
      it('returns null for nullish values', () => {
        withEnv(MOCK_KEY, () => {
          expect(decryptMailboxToken(null)).toBeNull();
          expect(decryptMailboxToken(undefined)).toBeNull();
        });
      });

      it('round-trips encrypt/decrypt', () => {
        withEnv(MOCK_KEY, () => {
          const original = 'ya29.a0AfH6S...';
          const encrypted = encryptMailboxToken(original);
          expect(decryptMailboxToken(encrypted)).toBe(original);
        });
      });

      it('returns plaintext as-is when not versioned', () => {
        withEnv(MOCK_KEY, () => {
          expect(decryptMailboxToken('plaintext-token')).toBe('plaintext-token');
        });
      });

      it('handles multi-byte tokens', () => {
        withEnv(MOCK_KEY, () => {
          const original = 'token-with-unicode-ç-á-ñ';
          const encrypted = encryptMailboxToken(original);
          expect(decryptMailboxToken(encrypted)).toBe(original);
        });
      });

      it('handles long refresh tokens', () => {
        withEnv(MOCK_KEY, () => {
          const original = '1//' + 'x'.repeat(200);
          const encrypted = encryptMailboxToken(original);
          expect(decryptMailboxToken(encrypted)).toBe(original);
        });
      });

      it('returns tampered ciphertext as-is without throwing', () => {
        withEnv(MOCK_KEY, () => {
          const encrypted = encryptMailboxToken('secret')!;
          const tampered = encrypted.slice(0, -4) + 'AAAA';
          expect(decryptMailboxToken(tampered)).toBe(tampered);
        });
      });

      it('returns garbled input as-is', () => {
        withEnv(MOCK_KEY, () => {
          expect(decryptMailboxToken('not-even-base64!!!')).toBe('not-even-base64!!!');
        });
      });
    });

    describe('isEncryptedMailboxToken', () => {
      it('returns true for versioned tokens', () => {
        withEnv(MOCK_KEY, () => {
          const encrypted = encryptMailboxToken('token')!;
          expect(isEncryptedMailboxToken(encrypted)).toBe(true);
        });
      });

      it('returns false for plaintext', () => {
        expect(isEncryptedMailboxToken('plain-token')).toBe(false);
      });

      it('returns false for empty string', () => {
        expect(isEncryptedMailboxToken('')).toBe(false);
      });
    });
  });

  describe('without EMAIL_TOKEN_ENCRYPTION_KEY', () => {
    it('returns plaintext from encryptMailboxToken', () => {
      const prev = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
      delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
      try {
        expect(encryptMailboxToken('my-token')).toBe('my-token');
      } finally {
        if (prev !== undefined) {
          process.env.EMAIL_TOKEN_ENCRYPTION_KEY = prev;
        }
      }
    });

    it('returns plaintext from decryptMailboxToken', () => {
      const prev = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
      delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
      try {
        expect(decryptMailboxToken('my-token')).toBe('my-token');
      } finally {
        if (prev !== undefined) {
          process.env.EMAIL_TOKEN_ENCRYPTION_KEY = prev;
        }
      }
    });
  });
});
