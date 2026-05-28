import {
  STORAGE_DRIVER_DEFAULTS,
  buildPutObjectInput,
  buildR2DefaultEndpoint,
  buildR2PublicUrl,
  buildS3PublicUrl,
  describeUnknownError,
  hasTransformToByteArray,
  isAsyncIterableObject,
  objectBodyToBuffer,
  resolveContentType,
  stripTrailingSlashes,
  validateR2Credentials,
} from './storage-drivers.service.helpers';

describe('storage-drivers.service.helpers', () => {
  describe('STORAGE_DRIVER_DEFAULTS', () => {
    it('exposes the canonical S3 default region', () => {
      expect(STORAGE_DRIVER_DEFAULTS.s3Region).toBe('us-east-1');
    });

    it('exposes the default object content type', () => {
      expect(STORAGE_DRIVER_DEFAULTS.contentType).toBe('application/octet-stream');
    });

    it('is frozen so consumers cannot mutate it', () => {
      expect(Object.isFrozen(STORAGE_DRIVER_DEFAULTS)).toBe(true);
    });
  });

  describe('describeUnknownError', () => {
    it('returns the trimmed Error message when available', () => {
      expect(describeUnknownError(new Error('  boom  '))).toBe('boom');
    });

    it('returns the trimmed string when given a string', () => {
      expect(describeUnknownError('  oops  ')).toBe('oops');
    });

    it('falls back to a stable label when the Error message is empty', () => {
      expect(describeUnknownError(new Error('   '))).toBe('Unknown error');
    });

    it('falls back to a stable label for unknown shapes', () => {
      expect(describeUnknownError(undefined)).toBe('Unknown error');
      expect(describeUnknownError(null)).toBe('Unknown error');
      expect(describeUnknownError({ what: 'ever' })).toBe('Unknown error');
      expect(describeUnknownError(42)).toBe('Unknown error');
    });
  });

  describe('hasTransformToByteArray', () => {
    it('returns true for objects exposing transformToByteArray', () => {
      const body = { transformToByteArray: () => Promise.resolve(new Uint8Array()) };
      expect(hasTransformToByteArray(body)).toBe(true);
    });

    it('returns false when transformToByteArray is not a function', () => {
      expect(hasTransformToByteArray({ transformToByteArray: 'no' })).toBe(false);
    });

    it('returns false for null/undefined/primitives', () => {
      expect(hasTransformToByteArray(null)).toBe(false);
      expect(hasTransformToByteArray(undefined)).toBe(false);
      expect(hasTransformToByteArray('string')).toBe(false);
    });
  });

  describe('isAsyncIterableObject', () => {
    it('returns true for objects implementing the async iterator protocol', () => {
      const body: AsyncIterable<Buffer> = {
        [Symbol.asyncIterator]() {
          return {
            next: () => Promise.resolve({ done: true, value: Buffer.alloc(0) }),
          };
        },
      };
      expect(isAsyncIterableObject(body)).toBe(true);
    });

    it('returns false for objects without an async iterator', () => {
      expect(isAsyncIterableObject({})).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isAsyncIterableObject(null)).toBe(false);
      expect(isAsyncIterableObject(undefined)).toBe(false);
    });
  });

  describe('objectBodyToBuffer', () => {
    it('returns an empty buffer for nullish bodies', async () => {
      await expect(objectBodyToBuffer(undefined)).resolves.toEqual(Buffer.alloc(0));
      await expect(objectBodyToBuffer(null)).resolves.toEqual(Buffer.alloc(0));
    });

    it('returns the same buffer when the body is already a Buffer', async () => {
      const buf = Buffer.from('hello');
      await expect(objectBodyToBuffer(buf)).resolves.toBe(buf);
    });

    it('wraps a Uint8Array into a Buffer', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const out = await objectBodyToBuffer(bytes);
      expect(Buffer.isBuffer(out)).toBe(true);
      expect(out.equals(Buffer.from([1, 2, 3]))).toBe(true);
    });

    it('delegates to transformToByteArray when present', async () => {
      const body = {
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array([9, 8, 7])),
      };
      const out = await objectBodyToBuffer(body);
      expect(body.transformToByteArray).toHaveBeenCalledTimes(1);
      expect(out.equals(Buffer.from([9, 8, 7]))).toBe(true);
    });

    it('drains async iterables yielding buffers, strings, and ArrayBuffers', async () => {
      async function* gen() {
        yield Buffer.from('AB');
        yield 'CD';
        yield new Uint8Array([0x45, 0x46]);
        const ab = new ArrayBuffer(2);
        new Uint8Array(ab).set([0x47, 0x48]);
        yield ab;
      }
      const out = await objectBodyToBuffer(gen());
      expect(out.toString('utf8')).toBe('ABCDEFGH');
    });

    it('throws when the body is non-empty but unsupported', async () => {
      await expect(objectBodyToBuffer(123)).rejects.toThrow('Unsupported storage object body');
      await expect(objectBodyToBuffer({ shape: 'unknown' })).rejects.toThrow(
        'Unsupported storage object body',
      );
    });
  });

  describe('resolveContentType', () => {
    it('returns the provided MIME when non-empty', () => {
      expect(resolveContentType('image/png')).toBe('image/png');
    });

    it('falls back when the MIME is empty/blank/undefined/null', () => {
      expect(resolveContentType('')).toBe('application/octet-stream');
      expect(resolveContentType('   ')).toBe('application/octet-stream');
      expect(resolveContentType(undefined)).toBe('application/octet-stream');
      expect(resolveContentType(null)).toBe('application/octet-stream');
    });
  });

  describe('stripTrailingSlashes', () => {
    it('removes one or more trailing slashes', () => {
      expect(stripTrailingSlashes('https://cdn.example.com/')).toBe('https://cdn.example.com');
      expect(stripTrailingSlashes('https://cdn.example.com///')).toBe('https://cdn.example.com');
    });

    it('leaves values without trailing slashes unchanged', () => {
      expect(stripTrailingSlashes('https://cdn.example.com')).toBe('https://cdn.example.com');
    });
  });

  describe('buildS3PublicUrl', () => {
    it('prefers the CDN base when provided', () => {
      expect(
        buildS3PublicUrl({
          bucket: 'b',
          region: 'us-east-1',
          relativePath: 'a/b.txt',
          cdnBase: 'https://cdn.example.com/',
        }),
      ).toBe('https://cdn.example.com/a/b.txt');
    });

    it('falls back to the canonical S3 URL when no CDN base is provided', () => {
      expect(
        buildS3PublicUrl({ bucket: 'b', region: 'us-east-1', relativePath: 'a/b.txt' }),
      ).toBe('https://b.s3.us-east-1.amazonaws.com/a/b.txt');
    });

    it('strips trailing slashes from the CDN base', () => {
      expect(
        buildS3PublicUrl({
          bucket: 'b',
          region: 'us-east-1',
          relativePath: 'k',
          cdnBase: 'https://cdn.example.com///',
        }),
      ).toBe('https://cdn.example.com/k');
    });
  });

  describe('buildR2PublicUrl', () => {
    it('prefers R2_PUBLIC_URL when provided', () => {
      expect(
        buildR2PublicUrl({
          relativePath: 'k.txt',
          r2PublicUrl: 'https://r2.example.com/',
          cdnBase: 'https://cdn.example.com',
        }),
      ).toBe('https://r2.example.com/k.txt');
    });

    it('falls back to the CDN base when R2 public is missing', () => {
      expect(
        buildR2PublicUrl({ relativePath: 'k.txt', cdnBase: 'https://cdn.example.com' }),
      ).toBe('https://cdn.example.com/k.txt');
    });

    it('returns empty string when neither URL is configured', () => {
      expect(buildR2PublicUrl({ relativePath: 'k.txt' })).toBe('');
    });
  });

  describe('buildR2DefaultEndpoint', () => {
    it('returns the canonical Cloudflare R2 endpoint for an account id', () => {
      expect(buildR2DefaultEndpoint('abc123')).toBe('https://abc123.r2.cloudflarestorage.com');
    });
  });

  describe('buildPutObjectInput', () => {
    it('forwards bucket, key, body, and a resolved content type', () => {
      const body = Buffer.from('hello');
      const input = buildPutObjectInput({
        bucket: 'b',
        key: 'k',
        body,
        mimeType: 'image/png',
      });
      expect(input).toEqual({
        Bucket: 'b',
        Key: 'k',
        Body: body,
        ContentType: 'image/png',
      });
    });

    it('omits ACL when not provided', () => {
      const input = buildPutObjectInput({ bucket: 'b', key: 'k', body: Buffer.alloc(0) });
      expect(input).not.toHaveProperty('ACL');
    });

    it('threads the ACL when provided', () => {
      const input = buildPutObjectInput({
        bucket: 'b',
        key: 'k',
        body: Buffer.alloc(0),
        acl: 'public-read',
      });
      expect(input.ACL).toBe('public-read');
    });

    it('falls back to application/octet-stream when MIME is missing', () => {
      const input = buildPutObjectInput({ bucket: 'b', key: 'k', body: Buffer.alloc(0) });
      expect(input.ContentType).toBe('application/octet-stream');
    });
  });

  describe('validateR2Credentials', () => {
    it('returns the credentials when every field is non-empty', () => {
      expect(
        validateR2Credentials({
          bucket: 'b',
          accountId: 'a',
          accessKeyId: 'k',
          secretAccessKey: 's',
        }),
      ).toEqual({ bucket: 'b', accountId: 'a', accessKeyId: 'k', secretAccessKey: 's' });
    });

    it('returns null when each required field is missing', () => {
      expect(
        validateR2Credentials({ bucket: 'b', accountId: 'a', accessKeyId: 'k' }),
      ).toBeNull();
      expect(
        validateR2Credentials({ accountId: 'a', accessKeyId: 'k', secretAccessKey: 's' }),
      ).toBeNull();
      expect(validateR2Credentials({})).toBeNull();
    });
  });
});
