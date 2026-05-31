/**
 * Pure helpers extracted from {@link StorageDriversService}.
 *
 * Keep everything in this module side-effect-free and free of `this` /
 * NestJS DI / I/O so it stays trivially testable. Anything that needs a
 * `ConfigService` lookup, an `S3Client`, the logger, or `OpsAlertService`
 * stays in the service class.
 */

const TRAILING_SLASHES_RE = /\/+$/;

const DEFAULT_OBJECT_CONTENT_TYPE = 'application/octet-stream';

export const STORAGE_DRIVER_DEFAULTS = Object.freeze({
  s3Region: 'us-east-1',
  contentType: DEFAULT_OBJECT_CONTENT_TYPE,
  trailingSlashesRe: TRAILING_SLASHES_RE,
});

export type ByteArrayTransformable = {
  transformToByteArray: () => Promise<Uint8Array>;
};

export type SupportedObjectBody = AsyncIterable<Buffer | Uint8Array | string | ArrayBuffer>;

/** Convert an unknown error value to a human-readable, non-empty string. */
export function describeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unknown error';
}

/** Type guard for AWS SDK response bodies that expose `transformToByteArray`. */
export function hasTransformToByteArray(body: unknown): body is ByteArrayTransformable {
  if (typeof body !== 'object' || body === null || !('transformToByteArray' in body)) {
    return false;
  }
  const maybeTransform = (body as { transformToByteArray?: unknown }).transformToByteArray;
  return typeof maybeTransform === 'function';
}

/** Type guard for an object exposing the async iterator protocol. */
export function isAsyncIterableObject(body: unknown): body is SupportedObjectBody {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const maybeIterator = (body as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator];
  return typeof maybeIterator === 'function';
}

/**
 * Drain any AWS-SDK-shaped object body into a single {@link Buffer}.
 *
 * Accepts: `undefined`/`null`, raw `Buffer`, `Uint8Array`, objects with
 * `transformToByteArray` (modern SDK v3 streams), and any async iterable
 * yielding `Buffer | Uint8Array | string | ArrayBuffer`.
 *
 * Throws when the body is non-empty but matches none of the supported
 * shapes — that's the contract callers depend on for crisp errors.
 */
export async function objectBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (hasTransformToByteArray(body)) {
    return Buffer.from(await body.transformToByteArray());
  }
  if (!isAsyncIterableObject(body)) {
    throw new Error('Unsupported storage object body');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
      continue;
    }
    if (chunk instanceof ArrayBuffer) {
      chunks.push(Buffer.from(new Uint8Array(chunk)));
      continue;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Pick a non-empty MIME type, falling back to `application/octet-stream`. */
export function resolveContentType(mimeType?: string | null): string {
  if (typeof mimeType === 'string' && mimeType.trim()) {
    return mimeType;
  }
  return DEFAULT_OBJECT_CONTENT_TYPE;
}

/** Strip trailing slashes from a base URL — pure (no normalisation otherwise). */
export function stripTrailingSlashes(value: string): string {
  return value.replace(TRAILING_SLASHES_RE, '');
}

/**
 * Build the canonical public URL for an object stored on S3.
 *
 * Preference: explicit `cdnBase` first; otherwise the standard
 * `https://<bucket>.s3.<region>.amazonaws.com/<key>` form.
 */
export function buildS3PublicUrl(args: {
  bucket: string;
  region: string;
  relativePath: string;
  cdnBase?: string | undefined;
}): string {
  const { bucket, region, relativePath, cdnBase } = args;
  if (cdnBase) {
    return `${stripTrailingSlashes(cdnBase)}/${relativePath}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${relativePath}`;
}

/**
 * Resolve the public URL for an R2 object given the optional public/CDN
 * bases. Returns `''` when neither is configured — matches the original
 * service contract (R2 without a public surface yields an empty URL).
 */
export function buildR2PublicUrl(args: {
  relativePath: string;
  r2PublicUrl?: string | undefined;
  cdnBase?: string | undefined;
}): string {
  const { relativePath, r2PublicUrl, cdnBase } = args;
  if (r2PublicUrl) {
    return `${stripTrailingSlashes(r2PublicUrl)}/${relativePath}`;
  }
  if (cdnBase) {
    return `${stripTrailingSlashes(cdnBase)}/${relativePath}`;
  }
  return '';
}

/** Default Cloudflare R2 endpoint for a given account id. */
export function buildR2DefaultEndpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** Inputs passed to `PutObjectCommand` — typed so callers stay honest. */
export type PutObjectInput = {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType: string;
  ACL?: 'public-read';
};

/**
 * Build the input for an AWS SDK `PutObjectCommand`, normalising the
 * content-type and threading an optional canned ACL. Pure: no I/O, no
 * mutation of the supplied buffer.
 */
export function buildPutObjectInput(args: {
  bucket: string;
  key: string;
  body: Buffer;
  mimeType?: string;
  acl?: 'public-read';
}): PutObjectInput {
  const input: PutObjectInput = {
    Bucket: args.bucket,
    Key: args.key,
    Body: args.body,
    ContentType: resolveContentType(args.mimeType),
  };
  if (args.acl) {
    input.ACL = args.acl;
  }
  return input;
}

/**
 * Validate that every R2 credential is present. Returns `null` when any
 * required field is empty, otherwise the credentials shape ready for the
 * S3 SDK.
 */
export function validateR2Credentials(args: {
  bucket?: string;
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}): { bucket: string; accountId: string; accessKeyId: string; secretAccessKey: string } | null {
  const { bucket, accountId, accessKeyId, secretAccessKey } = args;
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return { bucket, accountId, accessKeyId, secretAccessKey };
}
