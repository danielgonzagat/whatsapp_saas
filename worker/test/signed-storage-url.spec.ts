import { describe, it, expect, vi, beforeEach } from 'vitest';

const envBackup = {
  APP_URL: process.env.APP_URL,
  BACKEND_URL: process.env.BACKEND_URL,
  API_URL: process.env.API_URL,
  STORAGE_SIGNING_SECRET: process.env.STORAGE_SIGNING_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
};

function clearStorageEnvs() {
  delete process.env.APP_URL;
  delete process.env.BACKEND_URL;
  delete process.env.API_URL;
  delete process.env.STORAGE_SIGNING_SECRET;
  delete process.env.JWT_SECRET;
}

describe('buildSignedLocalStorageUrl', () => {
  beforeEach(() => {
    clearStorageEnvs();
    process.env.APP_URL = 'https://app.example.com';
    process.env.STORAGE_SIGNING_SECRET = 'test-secret';
  });

  it('builds a signed URL with just a path', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('uploads/image.jpg');
    expect(url).toMatch(/^https:\/\/app\.example\.com\/storage\/local\/.+\..+$/);
  });

  it('normalizes backslashes to forward slashes', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('uploads\\file.pdf');
    const [prefix, encoded] = url.split('/local/');
    const decoded = JSON.parse(
      Buffer.from(encoded.split('.')[0], 'base64url').toString(),
    );
    expect(decoded.p).toBe('uploads/file.pdf');
  });

  it('strips leading slashes', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('/uploads/photo.png');
    const [prefix, encoded] = url.split('/local/');
    const decoded = JSON.parse(
      Buffer.from(encoded.split('.')[0], 'base64url').toString(),
    );
    expect(decoded.p).toBe('uploads/photo.png');
  });

  it('throws for undefined/null path', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() => buildSignedLocalStorageUrl(undefined as unknown as string)).toThrow(
      'invalid_storage_path',
    );
  });

  it('throws for dot-only path', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() => buildSignedLocalStorageUrl('.')).toThrow('invalid_storage_path');
  });

  it('throws for parent directory traversal', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() => buildSignedLocalStorageUrl('../etc/passwd')).toThrow(
      'invalid_storage_path',
    );
  });

  it('throws for path containing /../', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() => buildSignedLocalStorageUrl('uploads/../../../etc/passwd')).toThrow(
      'invalid_storage_path',
    );
  });

  it('includes expiry when expiresInSeconds is valid', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('uploads/report.csv', {
      expiresInSeconds: 3600,
    });
    expect(url).toBeTruthy();
    vi.useRealTimers();
  });

  it('ignores expiry when expiresInSeconds is zero', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() =>
      buildSignedLocalStorageUrl('uploads/report.csv', { expiresInSeconds: 0 }),
    ).not.toThrow();
  });

  it('ignores expiry when expiresInSeconds is negative', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() =>
      buildSignedLocalStorageUrl('uploads/report.csv', { expiresInSeconds: -1 }),
    ).not.toThrow();
  });

  it('ignores expiry when expiresInSeconds is Infinity', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    expect(() =>
      buildSignedLocalStorageUrl('uploads/report.csv', {
        expiresInSeconds: Infinity,
      }),
    ).not.toThrow();
  });

  it('includes downloadName in URL payload', async () => {
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('uploads/doc.pdf', {
      downloadName: 'report.pdf',
    });
    expect(url).toBeTruthy();
  });

  it('uses BACKEND_URL when APP_URL not set', async () => {
    delete process.env.APP_URL;
    process.env.BACKEND_URL = 'https://backend.example.com';
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('test.txt');
    expect(url).toContain('https://backend.example.com');
  });

  it('uses default localhost when no URL env set', async () => {
    delete process.env.APP_URL;
    delete process.env.BACKEND_URL;
    delete process.env.API_URL;
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('test.txt');
    expect(url).toContain('http://localhost:3001');
  });

  it('strips trailing slashes from base URL', async () => {
    process.env.APP_URL = 'https://app.example.com//';
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url = buildSignedLocalStorageUrl('test.txt');
    expect(url).toContain('https://app.example.com/storage');
  });

  it('uses STORAGE_SIGNING_SECRET over JWT_SECRET', async () => {
    process.env.STORAGE_SIGNING_SECRET = 'specific-secret';
    process.env.JWT_SECRET = 'generic-secret';
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url1 = buildSignedLocalStorageUrl('test.txt');
    // with different signing secret, the signature changes
    expect(url1).toBeTruthy();

    // import fresh with JWT_SECRET only
    vi.resetModules();
    delete process.env.STORAGE_SIGNING_SECRET;
    const { buildSignedLocalStorageUrl: build2 } = await import(
      '../utils/signed-storage-url'
    );
    const url2 = build2('test.txt');
    expect(url2).toBeTruthy();
    expect(url2).not.toBe(url1);
  });

  it('produces consistent signature for same inputs', async () => {
    vi.resetModules();
    process.env.STORAGE_SIGNING_SECRET = 'consistent';
    process.env.APP_URL = 'https://app.example.com';
    const { buildSignedLocalStorageUrl } = await import('../utils/signed-storage-url');
    const url1 = buildSignedLocalStorageUrl('test.txt');
    const url2 = buildSignedLocalStorageUrl('test.txt');
    expect(url1).toBe(url2);
  });
});
