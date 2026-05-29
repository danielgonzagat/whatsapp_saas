import { ConfigService } from '@nestjs/config';

import {
  buildAccessTokenPayload,
  decodeTokenPayload,
  encodeTokenPayload,
  getExtensionFromMime,
  getMimeTypeForPath,
  normalizeRelativePath,
  readConfigString,
  resolveAbsolutePath,
} from './storage.service.helpers';

function makeConfig(values: Record<string, unknown>) {
  return {
    get(key: string, defaultValue?: unknown) {
      return key in values ? values[key] : defaultValue;
    },
  } as never as ConfigService;
}

describe('storage.service.helpers', () => {
  describe('readConfigString', () => {
    it('returns the trimmed string when present', () => {
      const config = makeConfig({ KEY: 'value' });
      expect(readConfigString(config, 'KEY')).toBe('value');
    });

    it('returns undefined when value is missing', () => {
      const config = makeConfig({});
      expect(readConfigString(config, 'KEY')).toBeUndefined();
    });

    it('returns undefined when value is an empty string', () => {
      const config = makeConfig({ KEY: '   ' });
      expect(readConfigString(config, 'KEY')).toBeUndefined();
    });

    it('returns undefined when value is not a string', () => {
      const config = makeConfig({ KEY: 42 });
      expect(readConfigString(config, 'KEY')).toBeUndefined();
    });

    it('honours the default value when key is missing', () => {
      const config = makeConfig({});
      expect(readConfigString(config, 'KEY', 'fallback')).toBe('fallback');
    });
  });

  describe('getExtensionFromMime', () => {
    it.each([
      ['audio/mpeg', '.mp3'],
      ['audio/mp3', '.mp3'],
      ['image/jpeg', '.jpg'],
      ['image/png', '.png'],
      ['video/mp4', '.mp4'],
      ['application/pdf', '.pdf'],
      ['application/json', '.json'],
    ])('maps %s to %s', (mime, expected) => {
      expect(getExtensionFromMime(mime)).toBe(expected);
    });

    it('returns empty string for unknown mime types', () => {
      expect(getExtensionFromMime('application/octet-stream')).toBe('');
      expect(getExtensionFromMime('unknown/type')).toBe('');
    });
  });

  describe('getMimeTypeForPath', () => {
    it.each([
      ['foo.mp3', 'audio/mpeg'],
      ['foo.JPG', 'image/jpeg'],
      ['nested/path/foo.png', 'image/png'],
      ['foo.PDF', 'application/pdf'],
      ['foo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ])('resolves %s to %s', (relative, expected) => {
      expect(getMimeTypeForPath(relative)).toBe(expected);
    });

    it('falls back to application/octet-stream for unknown extensions', () => {
      expect(getMimeTypeForPath('foo.unknownext')).toBe('application/octet-stream');
      expect(getMimeTypeForPath('foo')).toBe('application/octet-stream');
    });
  });

  describe('normalizeRelativePath', () => {
    it('normalises backslashes and trims leading slashes', () => {
      expect(normalizeRelativePath('\\folder\\file.png')).toBe('folder/file.png');
      expect(normalizeRelativePath('///a/b.txt')).toBe('a/b.txt');
    });

    it('rejects parent-directory traversal', () => {
      expect(() => normalizeRelativePath('../etc/passwd')).toThrow('invalid_storage_path');
      expect(() => normalizeRelativePath('a/../../etc/passwd')).toThrow('invalid_storage_path');
    });

    it('rejects empty paths', () => {
      expect(() => normalizeRelativePath('')).toThrow('invalid_storage_path');
    });

    it('rejects current-dir-only paths', () => {
      expect(() => normalizeRelativePath('.')).toThrow('invalid_storage_path');
    });
  });

  describe('resolveAbsolutePath', () => {
    const uploadsDir = '/tmp/kloel-storage-test-helpers';

    it('returns absolute path inside the uploads dir', () => {
      const result = resolveAbsolutePath(uploadsDir, 'folder/file.png');
      expect(result.startsWith(`${uploadsDir}/`)).toBe(true);
      expect(result.endsWith('folder/file.png')).toBe(true);
    });

    it('rejects escapes outside the uploads dir', () => {
      expect(() => resolveAbsolutePath(uploadsDir, '../etc/passwd')).toThrow();
    });
  });

  describe('buildAccessTokenPayload / encode / decode', () => {
    it('omits expiry when expiresInSeconds is missing or invalid', () => {
      expect(buildAccessTokenPayload('folder/file.png').exp).toBeUndefined();
      expect(
        buildAccessTokenPayload('folder/file.png', { expiresInSeconds: 0 }).exp,
      ).toBeUndefined();
      expect(
        buildAccessTokenPayload('folder/file.png', { expiresInSeconds: -1 }).exp,
      ).toBeUndefined();
      expect(
        buildAccessTokenPayload('folder/file.png', { expiresInSeconds: Number.NaN }).exp,
      ).toBeUndefined();
    });

    it('encodes expiry as future epoch when positive', () => {
      const before = Date.now();
      const payload = buildAccessTokenPayload('folder/file.png', { expiresInSeconds: 60 });
      expect(payload.exp).toBeDefined();
      expect(payload.exp!).toBeGreaterThanOrEqual(before + 60_000 - 50);
    });

    it('records downloadName only when provided', () => {
      expect(buildAccessTokenPayload('folder/file.png').d).toBeUndefined();
      expect(buildAccessTokenPayload('folder/file.png', { downloadName: 'report.pdf' }).d).toBe(
        'report.pdf',
      );
    });

    it('round-trips through encode/decode', () => {
      const payload = buildAccessTokenPayload('folder/file.png', {
        expiresInSeconds: 30,
        downloadName: 'report.pdf',
      });
      const encoded = encodeTokenPayload(payload);
      const decoded = decodeTokenPayload(encoded);
      expect(decoded).toEqual(payload);
    });

    it('throws canonical error on malformed payload', () => {
      const malformed = Buffer.from('not-json', 'utf8').toString('base64url');
      expect(() => decodeTokenPayload(malformed)).toThrow('invalid_storage_token_payload');
    });
  });
});
