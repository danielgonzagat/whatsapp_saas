import { describe, expect, it } from 'vitest';
import {
  AFTER_PAY_CHARGE_VALUE_ERROR,
  buildAfterPayPayload,
} from './ProductNerveCenterAfterPayTab';

describe('buildAfterPayPayload', () => {
  it.each(['', '0', '-1', 'abc', '12abc'])('rejects invalid affiliate charge value %s', (value) => {
    expect(
      buildAfterPayPayload({
        duplicateAddress: true,
        affiliateCharge: true,
        chargeValue: value,
        shippingProvider: 'correios',
      }),
    ).toEqual({ ok: false, message: AFTER_PAY_CHARGE_VALUE_ERROR });
  });

  it('normalizes a valid affiliate charge and provider', () => {
    expect(
      buildAfterPayPayload({
        duplicateAddress: true,
        affiliateCharge: true,
        chargeValue: ' 12,50 ',
        shippingProvider: ' correios ',
      }),
    ).toEqual({
      ok: true,
      payload: {
        afterPayDuplicateAddress: true,
        afterPayAffiliateCharge: true,
        afterPayChargeValue: 12.5,
        afterPayShippingProvider: 'correios',
      },
    });
  });

  it('keeps charge value null when affiliate charge is disabled', () => {
    expect(
      buildAfterPayPayload({
        duplicateAddress: false,
        affiliateCharge: false,
        chargeValue: '',
        shippingProvider: '',
      }),
    ).toEqual({
      ok: true,
      payload: {
        afterPayDuplicateAddress: false,
        afterPayAffiliateCharge: false,
        afterPayChargeValue: null,
        afterPayShippingProvider: null,
      },
    });
  });
});
