import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ConnectAccountType } from '@prisma/client';

import type {
  ConnectAddressInput,
  ConnectBusinessProfileInput,
  ConnectCompanyInput,
  ConnectExternalBankAccountInput,
  ConnectIndividualInput,
  ConnectTosAcceptanceInput,
  SubmitOnboardingProfileInput,
} from '../connect.types';

/**
 * Body DTO for creating a Connect account.
 * Validated by the global ValidationPipe at the HTTP boundary.
 */
export class CreateConnectAccountDto {
  /** ConnectAccountType (SELLER, AFFILIATE, MANAGER, ...). */
  @IsEnum(ConnectAccountType)
  accountType!: ConnectAccountType;

  /** Account email. */
  @IsString()
  @MaxLength(320)
  email!: string;

  /** ISO 3166-1 alpha-2 country code. Defaults downstream to 'BR'. */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  /** Optional human-readable name attached to the Stripe account metadata. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;
}

/** Address nested DTO for Connect onboarding. */
export class ConnectAddressDto implements ConnectAddressInput {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

/** Date of birth nested DTO. */
export class ConnectDateOfBirthDto {
  @IsOptional()
  @IsInt()
  day?: number;

  @IsOptional()
  @IsInt()
  month?: number;

  @IsOptional()
  @IsInt()
  year?: number;
}

/** Individual representative nested DTO. */
export class ConnectIndividualDto implements ConnectIndividualInput {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectDateOfBirthDto)
  dateOfBirth?: ConnectDateOfBirthDto;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  idNumber?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectAddressDto)
  address?: ConnectAddressDto;
}

/** Company nested DTO. */
export class ConnectCompanyDto implements ConnectCompanyInput {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectAddressDto)
  address?: ConnectAddressDto;
}

/** Public business profile nested DTO. */
export class ConnectBusinessProfileDto implements ConnectBusinessProfileInput {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  mcc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  productDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  supportUrl?: string;
}

/** External bank account nested DTO. */
export class ConnectExternalBankAccountDto implements ConnectExternalBankAccountInput {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountHolderName?: string;

  @IsOptional()
  @IsIn(['individual', 'company'])
  accountHolderType?: 'individual' | 'company';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  routingNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountNumber?: string;
}

/** Terms-of-service acceptance nested DTO. */
export class ConnectTosAcceptanceDto implements ConnectTosAcceptanceInput {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  acceptedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}

/**
 * Body DTO for submitting Connect onboarding data from Kloel's UI.
 * Mirrors SubmitOnboardingProfileInput minus the server-derived stripeAccountId.
 */
export class SubmitOnboardingProfileDto implements Omit<
  SubmitOnboardingProfileInput,
  'stripeAccountId'
> {
  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @IsIn(['individual', 'company'])
  businessType?: 'individual' | 'company';

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectBusinessProfileDto)
  businessProfile?: ConnectBusinessProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectIndividualDto)
  individual?: ConnectIndividualDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectCompanyDto)
  company?: ConnectCompanyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectExternalBankAccountDto)
  externalAccount?: ConnectExternalBankAccountDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ConnectTosAcceptanceDto)
  tosAcceptance?: ConnectTosAcceptanceDto;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}

/**
 * Body DTO for creating a Connect payout (and payout-request) for a workspace.
 *
 * `amountCents` is money expressed in integer cents — validated as a positive
 * integer here, then converted to bigint cents downstream. Never a float.
 */
export class CreatePayoutDto {
  /** Connect account balance id to pay out from. */
  @IsString()
  @MaxLength(255)
  accountBalanceId!: string;

  /** Payout amount in integer cents (positive). Converted to bigint downstream. */
  @IsInt()
  @IsPositive()
  amountCents!: number;

  /** Optional ISO 4217 currency code. */
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  /** Optional idempotency request id for the legacy payout route. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  requestId?: string;
}
