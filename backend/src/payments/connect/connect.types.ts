import type { ConnectAccountType } from '@prisma/client';

/** Create custom account input shape. */
export interface CreateCustomAccountInput {
  workspaceId: string;
  accountType: ConnectAccountType;
  email: string;
  /** ISO 3166-1 alpha-2 country code. Defaults to 'BR'. */
  country?: string;
  /** Optional human-readable name attached to the Stripe account metadata. */
  displayName?: string;
}

/** Create custom account result shape. */
export interface CreateCustomAccountResult {
  accountBalanceId: string;
  stripeAccountId: string;
  /** Capabilities the account requested at creation (status reflected after Stripe activates them). */
  requestedCapabilities: string[];
}

/** Onboarding status shape. */
export interface OnboardingStatus {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsDisabledReason: string | null;
  capabilities: Record<string, string>;
}

/** Create onboarding link input shape. */
export interface CreateOnboardingLinkInput {
  stripeAccountId: string;
  refreshUrl: string;
  returnUrl: string;
  type?: 'account_onboarding' | 'account_update';
}

/** Create onboarding link result shape. */
export interface CreateOnboardingLinkResult {
  stripeAccountId: string;
  url: string;
  expiresAt: string | null;
  type: 'account_onboarding' | 'account_update';
}

/** Connect account already exists error. */
export class ConnectAccountAlreadyExistsError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly accountType: ConnectAccountType,
  ) {
    super(
      `ConnectAccountBalance already exists for workspace=${workspaceId} accountType=${accountType}`,
    );
    this.name = 'ConnectAccountAlreadyExistsError';
  }
}
