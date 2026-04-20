import {
  DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
  generateCheckoutOrderNumber,
  generatePublicCheckoutCode,
  generateSecureBase36Suffix,
  normalizePublicCheckoutCode,
} from './checkout-code.util';

describe('checkout-code.util', () => {
  it('normalizes public checkout codes to uppercase alphanumeric values', () => {
    expect(normalizePublicCheckoutCode(' ab-12_cd ')).toBe('AB12CD');
  });

  it('generates public checkout codes with the default secure length', () => {
    const code = generatePublicCheckoutCode();

    expect(code).toMatch(new RegExp(`^[A-Z0-9]{${DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH}}$`));
  });

  it('generates secure base36 suffixes without Math.random', () => {
    expect(generateSecureBase36Suffix(6)).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('generates checkout order numbers with secure uppercase suffixes', () => {
    const orderNumber = generateCheckoutOrderNumber();

    expect(orderNumber).toMatch(/^KL-[A-Z0-9]+[A-Z0-9]{6}$/);
  });
});
