import type { ConnectAccountType } from '@prisma/client';

export interface CreateCustomAccountInput {
  workspaceId: string;
  accountType: ConnectAccountType;
  email: string;
  /** ISO 3166-1 alpha-2 country code. Defaults to 'BR'. */
  country?: string;
  /** Optional human-readable name attached to the Stripe account metadata. */
  displayName?: string;
}

export interface CreateCustomAccountResult {
  accountBalanceId: string;
  stripeAccountId: string;
  /** Capabilities the account requested at creation (status reflected after Stripe activates them). */
  requestedCapabilities: string[];
}

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
