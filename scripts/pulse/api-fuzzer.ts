/**
 * PULSE API Contract & Fuzz Probe Engine
 *
 * Discovers all NestJS API endpoints, classifies risk, and generates
 * comprehensive test catalogs for auth, schema validation, idempotency,
 * rate limiting, and security vulnerabilities.
 *
 * This module does NOT execute HTTP requests — it produces the test plan
 * consumed by the execution harness.
 *
 * Barrel file — implementation split into __parts__/.
 */

export { discoverAPIEndpoints } from './api-fuzzer/__parts__/discovery';

export {
  generateAuthTests,
  generateSchemaTests,
  generateIdempotencyTests,
  generateRateLimitTests,
} from './api-fuzzer/__parts__/test-generators';

export {
  generateSecurityPayloads,
  generateSecurityTests,
  classifyEndpointRisk,
} from './api-fuzzer/__parts__/security-generator';

export { buildAPIFuzzCatalog } from './api-fuzzer/__parts__/fuzzer';
