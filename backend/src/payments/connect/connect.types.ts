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

/** Shared address shape for Connect onboarding. */
export interface ConnectAddressInput {
  /** First line of address. */
  line1?: string;
  /** Second line of address. */
  line2?: string;
  /** City. */
  city?: string;
  /** State or province. */
  state?: string;
  /** Postal code. */
  postalCode?: string;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
}

/** Date of birth shape. */
export interface ConnectDateOfBirthInput {
  /** Day of month. */
  day?: number;
  /** Month of year. */
  month?: number;
  /** Four-digit year. */
  year?: number;
}

/** Individual profile shape. */
export interface ConnectIndividualInput {
  /** First name. */
  firstName?: string;
  /** Last name. */
  lastName?: string;
  /** Email. */
  email?: string;
  /** Phone number. */
  phone?: string;
  /** Date of birth. */
  dateOfBirth?: ConnectDateOfBirthInput;
  /** CPF / personal tax id. */
  idNumber?: string;
  /** Individual address. */
  address?: ConnectAddressInput;
}

/** Company profile shape. */
export interface ConnectCompanyInput {
  /** Legal name. */
  name?: string;
  /** CNPJ / business tax id. */
  taxId?: string;
  /** Phone number. */
  phone?: string;
  /** Company address. */
  address?: ConnectAddressInput;
}

/** Business profile shape. */
export interface ConnectBusinessProfileInput {
  /** Public business name. */
  name?: string;
  /** Public site URL. */
  url?: string;
  /** Merchant category code. */
  mcc?: string;
  /** Product / service description. */
  productDescription?: string;
  /** Support email. */
  supportEmail?: string;
  /** Support phone. */
  supportPhone?: string;
  /** Support site URL. */
  supportUrl?: string;
}

/** Bank account payload accepted by Kloel's onboarding UI. */
export interface ConnectExternalBankAccountInput {
  /** Optional bank account token if one was created upstream. */
  token?: string;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
  /** ISO 4217 currency code. */
  currency?: string;
  /** Account holder name. */
  accountHolderName?: string;
  /** Account holder type. */
  accountHolderType?: 'individual' | 'company';
  /** Bank routing / branch information. */
  routingNumber?: string;
  /** Bank account number. */
  accountNumber?: string;
}

/** Terms acceptance captured by Kloel's own UI. */
export interface ConnectTosAcceptanceInput {
  /** Acceptance timestamp in ISO 8601. */
  acceptedAt?: string;
  /** IP address captured by Kloel. */
  ipAddress?: string;
  /** User agent captured by Kloel. */
  userAgent?: string;
}

/** Kloel-hosted onboarding submission shape. */
export interface SubmitOnboardingProfileInput {
  /** Stripe account id property. */
  stripeAccountId: string;
  /** Optional top-level account email. */
  email?: string;
  /** Optional top-level account country. */
  country?: string;
  /** Business type. */
  businessType?: 'individual' | 'company';
  /** Public business profile. */
  businessProfile?: ConnectBusinessProfileInput;
  /** Individual representative details. */
  individual?: ConnectIndividualInput;
  /** Company details. */
  company?: ConnectCompanyInput;
  /** Bank account details. */
  externalAccount?: ConnectExternalBankAccountInput;
  /** Terms acceptance. */
  tosAcceptance?: ConnectTosAcceptanceInput;
  /** Free-form metadata persisted on the Stripe account. */
  metadata?: Record<string, string>;
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
