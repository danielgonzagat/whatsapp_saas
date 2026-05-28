import {
  buildGeneratedImageFilename,
  extractImageUrlFromResponse,
  generatedImageStorageFolder,
} from './kloel-composer.service.helpers';

describe('extractImageUrlFromResponse', () => {
  it('prefers a direct URL when present', () => {
    expect(extractImageUrlFromResponse({ data: [{ url: 'https://img.test/a.png' }] })).toBe(
      'https://img.test/a.png',
    );
  });

  it('builds a data URI from b64 when no URL is available', () => {
    expect(extractImageUrlFromResponse({ data: [{ b64_json: 'AAAA' }] })).toBe(
      'data:image/png;base64,AAAA',
    );
  });

  it('returns empty string when neither url nor b64 is present', () => {
    expect(extractImageUrlFromResponse({ data: [{}] })).toBe('');
    expect(extractImageUrlFromResponse(undefined)).toBe('');
    expect(extractImageUrlFromResponse({})).toBe('');
  });
});

describe('buildGeneratedImageFilename', () => {
  it('uses workspaceId when present', () => {
    expect(buildGeneratedImageFilename('ws-1', 100)).toBe('kloel-image-ws-1-100.png');
  });

  it('falls back to "workspace" when workspaceId is missing', () => {
    expect(buildGeneratedImageFilename(undefined, 200)).toBe('kloel-image-workspace-200.png');
  });

  it('defaults to Date.now() when no timestamp is supplied', () => {
    const name = buildGeneratedImageFilename('w');
    expect(name).toMatch(/^kloel-image-w-\d+\.png$/);
  });
});

describe('generatedImageStorageFolder', () => {
  it('namespaces folders per workspace', () => {
    expect(generatedImageStorageFolder('ws-1')).toBe('kloel/ws-1/generated-images');
  });

  it('uses a shared folder when no workspace is given', () => {
    expect(generatedImageStorageFolder(undefined)).toBe('kloel/generated-images');
    expect(generatedImageStorageFolder('')).toBe('kloel/generated-images');
  });
});
