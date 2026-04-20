/**
 * API contract schemas — frontend ↔ backend shape contract.
 *
 * This file is the authoritative declaration of the response shapes
 * the backend must produce and the frontend must consume. It exists
 * in TWO locations and they MUST be byte-for-byte identical:
 *
 *   backend/src/contracts/schemas.ts                (PR P1-1)
 *   frontend/src/__tests__/contracts/schemas.ts     (PR P1-2)
 *
 * A CI script (scripts/ops/check-contract-sync.mjs) enforces the
 * two copies are identical. Any divergence is a bug, by definition:
 * the contract has only one valid form. When you change a schema,
 * change BOTH files in the same commit.
 *
 * ## How this enforces invariant "Frontend Freeze by Contract"
 *
 * Phase P1 of the Big Tech hardening plan declares the HTTP contract
 * (request/response shapes) between frontend and backend as frozen
 * for the duration of the rest of the plan. Backend refactors in
 * P2/P3/P4 cannot change these shapes without breaking the contract
 * tests on BOTH sides. The frontend's visual surface, timing, DOM,
 * and side effects are NOT covered by these schemas — they are
 * future work (deferred per the plan's "Frontend Freeze" section).
 *
 * ## Conventions
 *
 *   - Schemas are exhaustive: extra fields beyond the schema fail
 *     validation. This catches "I forgot to remove the test field"
 *     bugs but means schema additions need backend AND frontend
 *     updates in lockstep.
 *
 *   - Optional fields use .optional() — they may be missing entirely.
 *
 *   - Nullable fields use .nullable() — they may be present with
 *     value null.
 *
 *   - Field names follow whatever convention the backend currently
 *     emits (snake_case for legacy auth tokens, camelCase elsewhere).
 *     The schemas document the contract as-is, not as we'd like it
 *     to be.
 *
 * ## Usage
 *
 *   import { AuthLoginResponseSchema } from './schemas';
 *
 *   const result = AuthLoginResponseSchema.safeParse(responseBody);
 *   if (!result.success) {
 *     throw new Error(`Contract violation: ${JSON.stringify(result.error.format())}`);
 *   }
 */

import { z } from 'zod';

// ─── Auth ──────────────────────────────────────────────────────────────────

/**
 * The user object returned alongside auth tokens. Matches what the
 * frontend's `tokenStorage.setWorkspaceId` and CRM/inbox views read.
 */
export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  workspaceId: z.string(),
  role: z.string(),
});

/**
 * Single workspace summary returned in the auth payload. The frontend's
 * `resolveWorkspaceFromAuthPayload` reads from this list.
 */
export const WorkspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * Response to POST /auth/login, /auth/register, /auth/oauth/google,
 * /auth/oauth/apple, and the WhatsApp code-verify flow. The shape
 * is shared because the frontend treats all auth responses the same.
 *
 * Field naming note: tokens use snake_case (`access_token`,
 * `refresh_token`) for historical reasons. The frontend's
 * `apiFetch` accepts BOTH snake_case and camelCase forms but the
 * backend currently emits snake_case. Do not change this without
 * coordinating both sides.
 */
export const AuthTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: AuthUserSchema,
  workspace: WorkspaceSummarySchema.nullable(),
  workspaces: z.array(WorkspaceSummarySchema),
  isNewUser: z.boolean().optional(),
});

/** Auth login response schema. */
export const AuthLoginResponseSchema = AuthTokenResponseSchema;
/** Auth register response schema. */
export const AuthRegisterResponseSchema = AuthTokenResponseSchema;
/** Auth google response schema. */
export const AuthGoogleResponseSchema = AuthTokenResponseSchema;

/**
 * Response to GET /auth/check-email — used by the registration form
 * to nudge users toward sign-in if their email already has an account.
 */
export const AuthCheckEmailResponseSchema = z.object({
  exists: z.boolean(),
});

/**
 * Response to POST /auth/refresh — issues a new access token and
 * (sometimes) a rotated refresh token.
 */
export const AuthRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
});

// ─── Billing ───────────────────────────────────────────────────────────────

/**
 * Response to GET /billing/subscription. Used by the dashboard's
 * trial banner, the billing page, and the upgrade gate.
 *
 * Note that `currentPeriodEnd` is sent as a JSON-serialized Date —
 * the frontend parses it with `new Date()`. Schema accepts string
 * or unset (when there is no subscription yet).
 */
export const BillingSubscriptionResponseSchema = z.object({
  status: z.enum(['none', 'active', 'trial', 'expired', 'suspended']),
  plan: z.string(),
  trialDaysLeft: z.number(),
  creditsBalance: z.number(),
  currentPeriodEnd: z.union([z.string(), z.date()]).optional(),
  cancelAtPeriodEnd: z.boolean(),
});

/**
 * Response to POST /billing/checkout — Stripe Hosted Checkout URL.
 */
export const BillingCheckoutResponseSchema = z.object({
  url: z.string().url(),
  sessionId: z.string().optional(),
});

// ─── Workspace ─────────────────────────────────────────────────────────────

/**
 * Response to GET /workspace/me — returns the current agent's
 * workspace context. The frontend uses this to populate the
 * workspace dropdown and to persist `workspaceId` after login.
 */
export const WorkspaceMeResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  workspaceId: z.string(),
  workspace: WorkspaceSummarySchema.nullable().optional(),
  role: z.string(),
});

// ─── WhatsApp session ──────────────────────────────────────────────────────

/**
 * Response to GET /whatsapp-api/session/status. The frontend's
 * inbox header, autopilot screen, and admin connect flow all read
 * from this. Many fields are optional because the active provider
 * (Meta Cloud vs WAHA) determines which subset is populated.
 */
export const WhatsAppStatusResponseSchema = z.object({
  connected: z.boolean(),
  status: z.string().optional(),
  phone: z.string().optional(),
  pushName: z.string().optional(),
  authUrl: z.string().optional(),
  phoneNumberId: z.string().optional(),
  whatsappBusinessId: z.string().nullable().optional(),
  qrCode: z.string().optional(),
  message: z.string().optional(),
  provider: z.string().optional(),
  workerAvailable: z.boolean().optional(),
  workerHealthy: z.boolean().optional(),
  workerError: z.string().nullable().optional(),
  degraded: z.boolean().optional(),
  qrAvailable: z.boolean().optional(),
  browserSessionStatus: z.string().optional(),
  screencastStatus: z.string().optional(),
  viewerAvailable: z.boolean().optional(),
  takeoverActive: z.boolean().optional(),
  agentPaused: z.boolean().optional(),
  lastObservationAt: z.string().nullable().optional(),
  lastActionAt: z.string().nullable().optional(),
  observationSummary: z.string().nullable().optional(),
  activeProvider: z.string().nullable().optional(),
  proofCount: z.number().optional(),
  degradedReason: z.string().nullable().optional(),
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

/**
 * Response to POST /whatsapp-api/session/start — initiates a new
 * session and returns either a QR code (WAHA) or an OAuth URL
 * (Meta Cloud). This is the primary connect flow.
 */
export const WhatsAppStartSessionResponseSchema = z.object({
  success: z.boolean(),
  qrCode: z.string().optional(),
  message: z.string().optional(),
  authUrl: z.string().optional(),
});

/**
 * Response to GET /whatsapp-api/session/qr.
 */
export const WhatsAppQrResponseSchema = z.object({
  available: z.boolean(),
  qr: z.string().optional(),
});

// ─── Health ────────────────────────────────────────────────────────────────

/**
 * Response to GET /health/live (added in P0-6). Trivial liveness probe.
 */
export const HealthLivenessResponseSchema = z.object({
  status: z.literal('UP'),
  timestamp: z.string(),
});

/**
 * Response to GET /health/ready (added in P0-6). Readiness probe with
 * DB and Redis details.
 */
export const HealthReadinessResponseSchema = z.object({
  status: z.enum(['UP', 'DOWN']),
  details: z.object({
    database: z.object({ status: z.string() }).passthrough(),
    redis: z.object({ status: z.string() }).passthrough(),
  }),
  timestamp: z.string(),
});

// ─── Webhook responses ─────────────────────────────────────────────────────

/**
 * Standard duplicate-webhook response added in PR P0-2. Returned
 * with HTTP 200 from /webhook/payment/* endpoints when an event
 * has already been processed (atomic SET EX NX hit).
 */
export const WebhookDuplicateResponseSchema = z.object({
  ok: z.literal(true),
  received: z.literal(true),
  duplicate: z.literal(true),
  reason: z.string(),
});

// ─── Type exports ──────────────────────────────────────────────────────────

export type AuthUser = z.infer<typeof AuthUserSchema>;
/** Auth token response type. */
export type AuthTokenResponse = z.infer<typeof AuthTokenResponseSchema>;
/** Auth check email response type. */
export type AuthCheckEmailResponse = z.infer<typeof AuthCheckEmailResponseSchema>;
/** Auth refresh response type. */
export type AuthRefreshResponse = z.infer<typeof AuthRefreshResponseSchema>;
/** Billing subscription response type. */
export type BillingSubscriptionResponse = z.infer<typeof BillingSubscriptionResponseSchema>;
/** Billing checkout response type. */
export type BillingCheckoutResponse = z.infer<typeof BillingCheckoutResponseSchema>;
/** Workspace me response type. */
export type WorkspaceMeResponse = z.infer<typeof WorkspaceMeResponseSchema>;
/** Whats app status response type. */
export type WhatsAppStatusResponse = z.infer<typeof WhatsAppStatusResponseSchema>;
/** Whats app start session response type. */
export type WhatsAppStartSessionResponse = z.infer<typeof WhatsAppStartSessionResponseSchema>;
/** Whats app qr response type. */
export type WhatsAppQrResponse = z.infer<typeof WhatsAppQrResponseSchema>;
/** Health liveness response type. */
export type HealthLivenessResponse = z.infer<typeof HealthLivenessResponseSchema>;
/** Health readiness response type. */
export type HealthReadinessResponse = z.infer<typeof HealthReadinessResponseSchema>;
/** Webhook duplicate response type. */
export type WebhookDuplicateResponse = z.infer<typeof WebhookDuplicateResponseSchema>;
