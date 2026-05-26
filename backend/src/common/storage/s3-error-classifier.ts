import { Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Classified AWS error category. */
export type AwsErrorCategory =
  | 'UNKNOWN_PROTOCOL'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'CREDENTIALS_ERROR'
  | 'TIMEOUT'
  | 'THROTTLING'
  | 'UNKNOWN';

/** Context captured at the point of each AWS call. */
export interface AwsCallContext {
  /** Human-readable operation name, e.g. 'uploadToS3' */
  operation: string;
  /** AWS region used for the call */
  region: string;
  /** S3 bucket targeted */
  bucket: string;
  /** Optional object key */
  key?: string | undefined;
  /** Endpoint URL if using a custom endpoint (R2, MinIO, etc.) */
  endpoint?: string | undefined;
}

/** Structured result of error classification. */
export interface AwsErrorInfo {
  category: AwsErrorCategory;
  message: string;
  /** Original error code from AWS SDK if available (e.g. 'AccessDenied') */
  awsCode?: string | undefined;
  /** HTTP status code if available */
  httpStatus?: number | undefined;
  /** The original error */
  originalError: unknown;
} // ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

const logger = new Logger('S3ErrorClassifier');

/** Patterns that indicate an UnknownError / protocol-level mismatch. */
const UNKNOWN_ERROR_INDICATORS = [
  /UnknownError/i,
  /UnknownErrorFromAwsProtocol/i,
  /getErrorSchemaOrThrow/i,
  /ProtocolLib/i,
  /Deserialization error/i,
  /unrecognized.*error/i,
  /unexpected.*response/i,
];

/** AWS SDK error codes that map to access-denied. */
const ACCESS_DENIED_CODES = new Set([
  'AccessDenied',
  'AccessDeniedException',
  'NotAuthorized',
  'UnauthorizedOperation',
  'Forbidden',
  'AllAccessDisabled',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
]);

/** AWS SDK error codes that map to not-found. */
const NOT_FOUND_CODES = new Set(['NoSuchBucket', 'NoSuchKey', 'NotFound', 'NoSuchUpload']);

/** Network error indicators (connection refused, DNS, etc.). */
const NETWORK_ERROR_INDICATORS = [
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /ENETUNREACH/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /EPIPE/i,
  /socket hang up/i,
  /TLS.*error/i,
  /certificate/i,
  /getaddrinfo/i,
];

/** Throttling / rate-limit indicators. */
const THROTTLING_CODES = new Set([
  'Throttling',
  'ThrottlingException',
  'SlowDown',
  'RequestThrottled',
  'TooManyRequestsException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
  'RequestLimitExceeded',
  'BandwidthLimitExceeded',
]);

/** Credential / auth error indicators. */
const CREDENTIALS_ERROR_INDICATORS = [
  /credentials.*error/i,
  /InvalidClientTokenId/i,
  /ExpiredToken/i,
  /MissingAuthenticationToken/i,
  /security token included.*invalid/i,
  /no credentials/i,
  /could not load credentials/i,
]; // ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the AWS SDK error code from any error shape.
 * AWS SDK v3 errors carry a `name` (or `Code`) property.
 */
function extractAwsCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const e = error as Record<string, unknown>;

  // AWS SDK v3 service exceptions have a `name` property
  if (typeof e.name === 'string' && e.name.trim()) {
    return e.name.trim();
  }

  // Some errors expose a `Code` field (XML-rest errors)
  if (typeof e.Code === 'string' && e.Code.trim()) {
    return e.Code.trim();
  }

  // Generic Node.js errors have a `code`
  if (typeof e.code === 'string' && e.code.trim()) {
    return e.code.trim();
  }

  return undefined;
}

/** Extract HTTP status from the error if available. */
function extractHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const e = error as Record<string, unknown>;

  // AWS SDK v3: $metadata.httpStatusCode
  const metadata = e.$metadata as Record<string, unknown> | undefined;
  if (metadata && typeof metadata.httpStatusCode === 'number') {
    return metadata.httpStatusCode;
  }

  // Generic: statusCode
  if (typeof e.statusCode === 'number') {
    return e.statusCode;
  }

  return undefined;
} // ---------------------------------------------------------------------------
// Core classifier
// ---------------------------------------------------------------------------

/**
 * Classify an error thrown by an AWS SDK call into a structured category.
 * This MUST be called inside every catch block around S3Client.send().
 */
export function classifyAwsError(error: unknown, context: AwsCallContext): AwsErrorInfo {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const awsCode = extractAwsCode(error);
  const httpStatus = extractHttpStatus(error);

  let category: AwsErrorCategory = 'UNKNOWN';

  // 1. Check for UnknownError / protocol mismatch (the target of this fix)
  if (UNKNOWN_ERROR_INDICATORS.some((re) => re.test(message)) || awsCode === 'UnknownError') {
    category = 'UNKNOWN_PROTOCOL';
  }
  // 2. Check credentials
  else if (
    CREDENTIALS_ERROR_INDICATORS.some((re) => re.test(message)) ||
    awsCode === 'CredentialsError'
  ) {
    category = 'CREDENTIALS_ERROR';
  }
  // 3. Check throttling
  else if (awsCode && THROTTLING_CODES.has(awsCode)) {
    category = 'THROTTLING';
  }
  // 4. Check access denied
  else if (awsCode && ACCESS_DENIED_CODES.has(awsCode)) {
    category = 'ACCESS_DENIED';
  }
  // 5. Check not found
  else if (awsCode && NOT_FOUND_CODES.has(awsCode)) {
    category = 'NOT_FOUND';
  }
  // 6. Check network errors
  else if (NETWORK_ERROR_INDICATORS.some((re) => re.test(message))) {
    category = 'NETWORK_ERROR';
  }
  // 7. Check timeout specifically
  else if (awsCode === 'TimeoutError' || /timeout/i.test(message) || /timed? ?out/i.test(message)) {
    category = 'TIMEOUT';
  }

  logAwsError(category, context, error, awsCode, httpStatus);

  return { category, message, awsCode, httpStatus, originalError: error };
} // ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

/**
 * Log the classified AWS error with full context for debugging.
 */
function logAwsError(
  category: AwsErrorCategory,
  context: AwsCallContext,
  error: unknown,
  awsCode: string | undefined,
  httpStatus: number | undefined,
): void {
  const details: Record<string, unknown> = {
    category,
    operation: context.operation,
    region: context.region,
    bucket: context.bucket,
    endpoint: context.endpoint ?? `https://s3.${context.region}.amazonaws.com`,
    ...(context.key ? { key: context.key } : {}),
    ...(awsCode ? { awsCode } : {}),
    ...(httpStatus ? { httpStatus } : {}),
  };

  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown';

  if (category === 'UNKNOWN_PROTOCOL') {
    logger.error(
      `OPS_CRITICAL | AWS protocol mismatch (likely region/config): ${message}`,
      details,
    );
  } else if (category === 'CREDENTIALS_ERROR' || category === 'ACCESS_DENIED') {
    logger.error(`OPS_CRITICAL | AWS auth/authz failure: ${message}`, details);
  } else if (category === 'NETWORK_ERROR' || category === 'TIMEOUT') {
    logger.warn(`AWS connectivity issue: ${message}`, details);
  } else {
    logger.error(`AWS ${category} error: ${message}`, details);
  }
} // ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Build an AwsCallContext from config-like values. */
export function buildAwsCallContext(params: {
  operation: string;
  region: string;
  bucket: string;
  key?: string;
  endpoint?: string;
}): AwsCallContext {
  return {
    operation: params.operation,
    region: params.region,
    bucket: params.bucket,
    key: params.key,
    endpoint: params.endpoint,
  };
}

/** Returns true if the error is safe to retry (transient). */
export function isRetryable(category: AwsErrorCategory): boolean {
  return category === 'NETWORK_ERROR' || category === 'TIMEOUT' || category === 'THROTTLING';
}

/** Returns true if the error indicates a configuration problem (region, IAM, credentials). */
export function isConfigError(category: AwsErrorCategory): boolean {
  return (
    category === 'UNKNOWN_PROTOCOL' ||
    category === 'ACCESS_DENIED' ||
    category === 'CREDENTIALS_ERROR'
  );
}
