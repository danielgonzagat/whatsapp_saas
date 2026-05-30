import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateConnectAccountDto,
  CreatePayoutDto,
  SubmitOnboardingProfileDto,
} from './connect.dto';

describe('CreateConnectAccountDto', () => {
  it('accepts a valid account-creation payload', async () => {
    const dto = plainToInstance(CreateConnectAccountDto, {
      accountType: 'SELLER',
      email: 'seller@example.com',
      country: 'BR',
      displayName: 'Seller Account',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts a minimal payload (only required fields)', async () => {
    const dto = plainToInstance(CreateConnectAccountDto, {
      accountType: 'AFFILIATE',
      email: 'affiliate@example.com',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid accountType enum value', async () => {
    const dto = plainToInstance(CreateConnectAccountDto, {
      accountType: 'NOT_A_ROLE',
      email: 'seller@example.com',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.find((e) => e.property === 'accountType')).toBeDefined();
  });

  it('rejects a missing email', async () => {
    const dto = plainToInstance(CreateConnectAccountDto, {
      accountType: 'SELLER',
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'email')).toBeDefined();
  });

  it('rejects a non-string email', async () => {
    const dto = plainToInstance(CreateConnectAccountDto, {
      accountType: 'SELLER',
      email: 42,
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'email')).toBeDefined();
  });
});

describe('CreatePayoutDto', () => {
  it('accepts a valid payout payload', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      accountBalanceId: 'cab_seller',
      amountCents: 500,
      currency: 'brl',
      requestId: 'po_req_1',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing accountBalanceId', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      amountCents: 500,
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'accountBalanceId')).toBeDefined();
  });

  it('rejects a zero amountCents (money must be positive)', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      accountBalanceId: 'cab_seller',
      amountCents: 0,
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'amountCents')).toBeDefined();
  });

  it('rejects a negative amountCents', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      accountBalanceId: 'cab_seller',
      amountCents: -100,
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'amountCents')).toBeDefined();
  });

  it('rejects a fractional amountCents (cents are integers, never floats)', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      accountBalanceId: 'cab_seller',
      amountCents: 12.5,
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'amountCents')).toBeDefined();
  });

  it('accepts a payload without optional currency or requestId', async () => {
    const dto = plainToInstance(CreatePayoutDto, {
      accountBalanceId: 'cab_seller',
      amountCents: 1000,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe('SubmitOnboardingProfileDto', () => {
  it('accepts a nested individual onboarding payload', async () => {
    const dto = plainToInstance(SubmitOnboardingProfileDto, {
      businessType: 'individual',
      individual: {
        firstName: 'Ana',
        lastName: 'Silva',
        idNumber: '123.456.789-09',
        address: { line1: 'Rua A', city: 'Sao Paulo', country: 'BR' },
      },
      tosAcceptance: { acceptedAt: '2026-04-22T12:34:56.000Z' },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty payload (presence is enforced by the controller, not the DTO)', async () => {
    const dto = plainToInstance(SubmitOnboardingProfileDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid businessType', async () => {
    const dto = plainToInstance(SubmitOnboardingProfileDto, {
      businessType: 'partnership',
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'businessType')).toBeDefined();
  });

  it('rejects an invalid nested individual field type', async () => {
    const dto = plainToInstance(SubmitOnboardingProfileDto, {
      individual: { firstName: 123 },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'individual')).toBeDefined();
  });

  it('rejects an invalid externalAccount holder type', async () => {
    const dto = plainToInstance(SubmitOnboardingProfileDto, {
      externalAccount: { accountHolderType: 'foundation' },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'externalAccount')).toBeDefined();
  });
});
