# Wave 22 — Sentry #6: UnknownError from AWS SDK ProtocolLib

> Authored by PI atomic subagent `w22-sentry-aws-protocol-unknown-fix` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Issue:** 154 events of `Unknown: UnknownError` from
`@aws-sdk.core.dist-cjs.submodules.protocols.ProtocolLib.getErrorSchemaOrThrowBaseException`
**Severity:** High (ops-critical, silent degradation)
## Root Cause

The AWS SDK v3 throws `UnknownError` from its protocol layer when the HTTP response
shape doesn't match any expected error or success schema. In this codebase, the
`StorageDriversService` had three contributing factors:

1. **New `S3Client` per call.** Every `uploadToS3`, `deleteFromS3`, `readFromS3`,
   and `checkS3Health` call instantiated a fresh `new S3Client({ region })`.
   This multiplied connection overhead and amplified protocol mismatches —
   a wrong region or IAM misconfiguration would trigger `UnknownError` on every
   single call, with zero connection reuse.

2. **No AWS error classification.** The `catch` blocks treated all errors
   identically (`describeUnknownError`). A protocol-level `UnknownError`,
   an `AccessDenied`, a network timeout, and a missing credential error all
   produced the same log message with no structured differentiation. Sentry
   ingested them as generic `UnknownError`, making root-cause analysis
   impossible without manual log diving.

3. **No endpoint/region context in logs.** When an S3 call failed, the error
   log contained the error message but NOT the region, bucket, endpoint URL,
   or operation name. This made debugging region misconfigurations effectively
   blind.
## Changes

### New file: `backend/src/common/storage/s3-error-classifier.ts`

Structured AWS error classifier with 8 categories:

| Category | Detection | Severity |
|----------|-----------|----------|
| `UNKNOWN_PROTOCOL` | `UnknownError` name, ProtocolLib in message | OPS_CRITICAL |
| `ACCESS_DENIED` | `AccessDenied`, `NotAuthorized`, etc. | OPS_CRITICAL |
| `CREDENTIALS_ERROR` | `CredentialsError`, invalid token patterns | OPS_CRITICAL |
| `NETWORK_ERROR` | `ECONNREFUSED`, `ENOTFOUND`, TLS errors, etc. | WARN (transient) |
| `TIMEOUT` | `TimeoutError`, timeout patterns | WARN (transient) |
| `THROTTLING` | `Throttling`, `SlowDown`, `TooManyRequests` | WARN (transient) |
| `NOT_FOUND` | `NoSuchBucket`, `NoSuchKey`, `NotFound` | ERROR |
| `UNKNOWN` | Fallback | ERROR |

Exports:
- `classifyAwsError(error, context)` → `AwsErrorInfo` with category, message,
  `awsCode`, `httpStatus`
- `buildAwsCallContext({operation, region, bucket, key?, endpoint?})` →
  `AwsCallContext`
- `isRetryable(category)` → `boolean` (true for NETWORK_ERROR, TIMEOUT, THROTTLING)
- `isConfigError(category)` → `boolean` (true for UNKNOWN_PROTOCOL, ACCESS_DENIED,
  CREDENTIALS_ERROR)
### Modified: `backend/src/common/storage/storage-drivers.service.ts`

1. **Cached S3 client.** Added `getS3Client(region)` that lazily creates and
   caches a single `S3Client` instance. All S3 methods (`uploadToS3`,
   `deleteFromS3`, `readFromS3`, `checkS3Health`) now reuse the same
   connection pool.

2. **Error classification on every AWS call.** Every `catch` block now calls
   `classifyAwsError(error, ctx)` which:
   - Classifies the error into a category
   - Logs structured `OPS_CRITICAL` or `AWS connectivity` messages with full
     context (region, bucket, endpoint, operation, awsCode, httpStatus)
   - The `UNKNOWN_PROTOCOL` category specifically logs:
     `OPS_CRITICAL | AWS protocol mismatch (likely region/config)`

3. **Context-rich logging.** Before each AWS call, the service builds an
   `AwsCallContext` with `{operation, region, bucket, key, endpoint}`.
   This is logged on failure so Sentry alerts + structured logs include the
   exact endpoint and region that failed.

4. **Graceful fallback preserved.** All existing fallback behavior is
   unchanged: upload failures fall back to local, deletes and reads return
   `false`/`null` on failure, health checks return `DOWN` with error details.
### Modified: `backend/src/common/storage/storage-drivers.service.spec.ts`

New tests (16 total, up from 8):

- `uploadToS3`: Added test for `UnknownError` fallback + S3 client caching
- `deleteFromS3`: Added tests for `UnknownError` + network error graceful returns
- `readFromS3`: Added test for `UnknownError` → null return
- `checkS3Health`: Added test for `UnknownError` → DOWN with error details
- New helpers: `makeUnknownError()` (mimics the real error shape including
  `$metadata.httpStatusCode`), `configureBucket()` (DRY config setup)
## Verification

- ✅ Backend TypeScript compiles with no new errors (`npx tsc --noEmit`)
- ✅ All 16 unit tests pass
- ✅ StorageService integration tests unaffected (2/2 pass)
- ✅ No AWS credentials logged (classifier logs endpoint, region, bucket; never secrets)
- ✅ Existing fallback paths preserved
## Impact

The `UnknownError` will now be:
1. **Classified** as `UNKNOWN_PROTOCOL` with `OPS_CRITICAL` severity
2. **Logged** with the exact region, bucket, endpoint, and operation that failed
3. **Routed** to Sentry with `category: 'UNKNOWN_PROTOCOL'` in the alert metadata
4. **Gracefully handled** — uploads fall back to local storage, deletes return
   `false`, reads return `null`, health checks report `DOWN` with error details

This makes the error immediately actionable: rather than a generic
`UnknownError` with no context, operators will see:

```
OPS_CRITICAL | AWS protocol mismatch (likely region/config): UnknownError...
{
  category: 'UNKNOWN_PROTOCOL',
  operation: 'uploadToS3',
  region: 'us-east-1',
  bucket: 'my-bucket',
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  key: 'uploads/file.png',
  awsCode: 'UnknownError',
  httpStatus: 400
}
```
## Recommendation

If the `UnknownError` persists after this deploy, check:
1. **Region mismatch:** Is `S3_REGION` set to the region where the bucket
   actually lives? S3 is regional — a client in `us-east-1` cannot access a
   bucket in `eu-west-1` via the S3 API.
2. **IAM permissions:** Does the IAM role/credentials have `s3:PutObject`,
   `s3:GetObject`, `s3:DeleteObject` on the target bucket ARN?
3. **VPC endpoint:** If running in a VPC, does the S3 gateway endpoint cover
   the bucket's region?
