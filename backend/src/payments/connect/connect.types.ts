import type { ConnectAccountType } from '@prisma/client';

/** Create custom account input shape. */
export interface CreateCustomAccountInput {
  /** Workspace id property. */
  workspaceId: string;
  /** Account type property. */
  accountType: ConnectAccountType;
  /** Email property. */
  email: string;
  /** ISO 3166-1 alpha-2 country code. Defaults to 'BR'. */
  country?: string;
  /** Optional human-readable name attached to the Stripe account metadata. */
  displayName?: string;
}

/** Create custom account result shape. */
export interface CreateCustomAccountResult {
  /** Account balance id property. */
  accountBalanceId: string;
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Capabilities the account requested at creation (status reflected after Stripe activates them). */
  requestedCapabilities: string[];
}

/** Onboarding status shape. */
export interface OnboardingStatus {
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Charges enabled property. */
  chargesEnabled: boolean;
  /** Payouts enabled property. */
  payoutsEnabled: boolean;
  /** Details submitted property. */
  detailsSubmitted: boolean;
  /** Requirements currently due property. */
  requirementsCurrentlyDue: string[];
  /** Requirements past due property. */
  requirementsPastDue: string[];
  /** Requirements disabled reason property. */
  requirementsDisabledReason: string | null;
  /** Capabilities property. */
  capabilities: Record<string, string>;
}

/** Create onboarding link input shape. */
export interface CreateOnboardingLinkInput {
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Refresh url property. */
  refreshUrl: string;
  /** Return url property. */
  returnUrl: string;
  /** Type property. */
  type?: 'account_onboarding' | 'account_update';
}

/** Create onboarding link result shape. */
export interface CreateOnboardingLinkResult {
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Url property. */
  url: string;
  /** Expires at property. */
  expiresAt: string | null;
  /** Type property. */
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
