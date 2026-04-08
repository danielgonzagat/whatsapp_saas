/**
 * Frontend API contract test — schema-level validation.
 *
 * Mirrors backend/src/contracts/api-contract.spec.ts with the same
 * fixtures and the same expectations. Uses Vitest (frontend) instead
 * of Jest (backend) but otherwise identical in semantics.
 *
 * Why mirror it? Because invariant "frontend freeze by contract"
 * requires the SAME schema to validate the SAME shapes on BOTH sides.
 * If the backend updates a schema without updating the frontend, the
 * contract-sync CI script catches the schema file divergence. If the
 * backend updates both schema files but a fixture diverges, the
 * frontend fixtures here catch the drift in the test code itself.
 *
 * The fixtures are intentionally repeated rather than imported from
 * the backend, because the frontend should not depend on backend
 * source files at runtime or test time — that would couple the
 * frontend's test runner to the backend's directory layout.
 */

import { describe, it, expect } from 'vitest';
import {
  AuthLoginResponseSchema,
  AuthRegisterResponseSchema,
  AuthGoogleResponseSchema,
  AuthCheckEmailResponseSchema,
  AuthRefreshResponseSchema,
  BillingSubscriptionResponseSchema,
  BillingCheckoutResponseSchema,
  WorkspaceMeResponseSchema,
  WhatsAppStatusResponseSchema,
  WhatsAppStartSessionResponseSchema,
  WhatsAppQrResponseSchema,
  HealthLivenessResponseSchema,
  HealthReadinessResponseSchema,
  WebhookDuplicateResponseSchema,
} from './schemas';

const authTokenFixture = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
  refresh_token: 'a3f4a3b2c1d0-e9f8a7b6c5d4-1122334455667788',
  user: {
    id: 'agent-1',
    email: 'daniel@kloel.com',
    name: 'Daniel',
    workspaceId: 'ws-1',
    role: 'OWNER',
  },
  workspace: { id: 'ws-1', name: "Daniel's Workspace" },
  workspaces: [{ id: 'ws-1', name: "Daniel's Workspace" }],
  isNewUser: false,
};

describe('Frontend API contract schemas — frontend freeze (P1-2)', () => {
  describe('Auth', () => {
    it('AuthLoginResponseSchema accepts the canonical token payload', () => {
      expect(AuthLoginResponseSchema.safeParse(authTokenFixture).success).toBe(true);
    });

    it('AuthRegisterResponseSchema accepts the same shape', () => {
      expect(AuthRegisterResponseSchema.safeParse(authTokenFixture).success).toBe(true);
    });

    it('AuthGoogleResponseSchema accepts the same shape', () => {
      expect(AuthGoogleResponseSchema.safeParse(authTokenFixture).success).toBe(true);
    });

    it('AuthLoginResponseSchema accepts a payload without isNewUser', () => {
      const { isNewUser, ...withoutIsNewUser } = authTokenFixture;
      void isNewUser;
      expect(AuthLoginResponseSchema.safeParse(withoutIsNewUser).success).toBe(true);
    });

    it('AuthLoginResponseSchema accepts a null workspace', () => {
      expect(
        AuthLoginResponseSchema.safeParse({
          ...authTokenFixture,
          workspace: null,
        }).success,
      ).toBe(true);
    });

    it('AuthLoginResponseSchema rejects a payload missing access_token', () => {
      const { access_token, ...broken } = authTokenFixture;
      void access_token;
      expect(AuthLoginResponseSchema.safeParse(broken).success).toBe(false);
    });

    it('AuthLoginResponseSchema rejects a payload with the wrong token field name', () => {
      const renamed = {
        ...authTokenFixture,
        accessToken: authTokenFixture.access_token,
      } as any;
      delete renamed.access_token;
      expect(AuthLoginResponseSchema.safeParse(renamed).success).toBe(false);
    });

    it('AuthLoginResponseSchema rejects a user object missing workspaceId', () => {
      const broken = {
        ...authTokenFixture,
        user: { ...authTokenFixture.user, workspaceId: undefined },
      };
      expect(AuthLoginResponseSchema.safeParse(broken).success).toBe(false);
    });

    it('AuthCheckEmailResponseSchema accepts both true and false', () => {
      expect(AuthCheckEmailResponseSchema.safeParse({ exists: true }).success).toBe(true);
      expect(AuthCheckEmailResponseSchema.safeParse({ exists: false }).success).toBe(true);
      expect(AuthCheckEmailResponseSchema.safeParse({}).success).toBe(false);
    });

    it('AuthRefreshResponseSchema accepts a token-only response', () => {
      expect(AuthRefreshResponseSchema.safeParse({ access_token: 'new-token' }).success).toBe(true);
    });

    it('AuthRefreshResponseSchema accepts a rotated refresh response', () => {
      expect(
        AuthRefreshResponseSchema.safeParse({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
        }).success,
      ).toBe(true);
    });
  });

  describe('Billing', () => {
    it('BillingSubscriptionResponseSchema accepts the no-subscription shape', () => {
      const fixture = {
        status: 'none',
        plan: 'FREE',
        trialDaysLeft: 0,
        creditsBalance: 0,
        cancelAtPeriodEnd: false,
      };
      expect(BillingSubscriptionResponseSchema.safeParse(fixture).success).toBe(true);
    });

    it('BillingSubscriptionResponseSchema accepts an active trial', () => {
      const fixture = {
        status: 'trial',
        plan: 'STARTER',
        trialDaysLeft: 5,
        creditsBalance: 5,
        currentPeriodEnd: '2026-04-13T00:00:00.000Z',
        cancelAtPeriodEnd: false,
      };
      expect(BillingSubscriptionResponseSchema.safeParse(fixture).success).toBe(true);
    });

    it('BillingSubscriptionResponseSchema rejects an unknown status', () => {
      const fixture = {
        status: 'mystery',
        plan: 'STARTER',
        trialDaysLeft: 0,
        creditsBalance: 0,
        cancelAtPeriodEnd: false,
      };
      expect(BillingSubscriptionResponseSchema.safeParse(fixture).success).toBe(false);
    });

    it('BillingCheckoutResponseSchema accepts a checkout url', () => {
      expect(
        BillingCheckoutResponseSchema.safeParse({
          url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3',
          sessionId: 'cs_test_a1b2c3',
        }).success,
      ).toBe(true);
    });

    it('BillingCheckoutResponseSchema rejects a non-URL string', () => {
      expect(BillingCheckoutResponseSchema.safeParse({ url: 'not-a-url' }).success).toBe(false);
    });
  });

  describe('Workspace', () => {
    it('WorkspaceMeResponseSchema accepts the agent profile', () => {
      const fixture = {
        id: 'agent-1',
        email: 'daniel@kloel.com',
        name: 'Daniel',
        workspaceId: 'ws-1',
        workspace: { id: 'ws-1', name: "Daniel's Workspace" },
        role: 'OWNER',
      };
      expect(WorkspaceMeResponseSchema.safeParse(fixture).success).toBe(true);
    });

    it('WorkspaceMeResponseSchema accepts a null name', () => {
      const fixture = {
        id: 'agent-1',
        email: 'daniel@kloel.com',
        name: null,
        workspaceId: 'ws-1',
        role: 'OWNER',
      };
      expect(WorkspaceMeResponseSchema.safeParse(fixture).success).toBe(true);
    });
  });

  describe('WhatsApp session', () => {
    it('WhatsAppStatusResponseSchema accepts the disconnected default', () => {
      expect(
        WhatsAppStatusResponseSchema.safeParse({
          connected: false,
          status: 'DISCONNECTED',
        }).success,
      ).toBe(true);
    });

    it('WhatsAppStatusResponseSchema accepts a fully populated Meta Cloud session', () => {
      const fixture = {
        connected: true,
        status: 'CONNECTED',
        phone: '+5511999990000',
        pushName: 'Daniel',
        provider: 'meta-cloud',
        phoneNumberId: '1234567890',
        whatsappBusinessId: '9876543210',
        workerAvailable: true,
        workerHealthy: true,
        workerError: null,
        degraded: false,
        proofCount: 12,
        degradedReason: null,
        viewport: { width: 1280, height: 720 },
      };
      expect(WhatsAppStatusResponseSchema.safeParse(fixture).success).toBe(true);
    });

    it('WhatsAppStartSessionResponseSchema accepts a QR-code session start', () => {
      expect(
        WhatsAppStartSessionResponseSchema.safeParse({
          success: true,
          qrCode: 'data:image/png;base64,iVBORw0KGgo...',
        }).success,
      ).toBe(true);
    });

    it('WhatsAppStartSessionResponseSchema accepts an OAuth session start', () => {
      expect(
        WhatsAppStartSessionResponseSchema.safeParse({
          success: true,
          authUrl: 'https://www.facebook.com/v18.0/dialog/oauth?...',
        }).success,
      ).toBe(true);
    });

    it('WhatsAppQrResponseSchema accepts available=false without qr', () => {
      expect(WhatsAppQrResponseSchema.safeParse({ available: false }).success).toBe(true);
    });
  });

  describe('Health probes', () => {
    it('HealthLivenessResponseSchema accepts the trivial UP shape', () => {
      expect(
        HealthLivenessResponseSchema.safeParse({
          status: 'UP',
          timestamp: '2026-04-08T13:00:00.000Z',
        }).success,
      ).toBe(true);
    });

    it('HealthLivenessResponseSchema rejects DOWN as the status', () => {
      expect(
        HealthLivenessResponseSchema.safeParse({
          status: 'DOWN',
          timestamp: '2026-04-08T13:00:00.000Z',
        }).success,
      ).toBe(false);
    });

    it('HealthReadinessResponseSchema accepts UP with healthy details', () => {
      const fixture = {
        status: 'UP',
        details: {
          database: { status: 'UP' },
          redis: { status: 'UP' },
        },
        timestamp: '2026-04-08T13:00:00.000Z',
      };
      expect(HealthReadinessResponseSchema.safeParse(fixture).success).toBe(true);
    });

    it('HealthReadinessResponseSchema accepts DOWN with mixed details', () => {
      const fixture = {
        status: 'DOWN',
        details: {
          database: { status: 'UP' },
          redis: { status: 'DOWN', error: 'connection refused' },
        },
        timestamp: '2026-04-08T13:00:00.000Z',
      };
      expect(HealthReadinessResponseSchema.safeParse(fixture).success).toBe(true);
    });
  });

  describe('Webhook duplicate response (P0-2)', () => {
    it('WebhookDuplicateResponseSchema accepts the canonical 200-on-duplicate body', () => {
      expect(
        WebhookDuplicateResponseSchema.safeParse({
          ok: true,
          received: true,
          duplicate: true,
          reason: 'duplicate_event',
        }).success,
      ).toBe(true);
    });

    it('WebhookDuplicateResponseSchema rejects ok=false', () => {
      expect(
        WebhookDuplicateResponseSchema.safeParse({
          ok: false,
          received: true,
          duplicate: true,
          reason: 'duplicate_event',
        }).success,
      ).toBe(false);
    });
  });
});
