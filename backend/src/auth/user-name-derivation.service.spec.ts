import { UserNameDerivationService } from './user-name-derivation.service';

describe('UserNameDerivationService', () => {
  describe('deriveNameFromEmail', () => {
    it('derives "John doe" from john.doe@example.com', () => {
      const name = UserNameDerivationService.deriveNameFromEmail('john.doe@example.com');
      expect(name).toBe('John doe');
    });

    it('derives "Jane smith" from jane_smith@example.com', () => {
      const name = UserNameDerivationService.deriveNameFromEmail('jane_smith@example.com');
      expect(name).toBe('Jane smith');
    });

    it('capitalizes first letter for strings without @ sign', () => {
      const name = UserNameDerivationService.deriveNameFromEmail('noatsign');
      expect(name).toBe('Noatsign');
    });

    it('returns "User" for an empty string', () => {
      const name = UserNameDerivationService.deriveNameFromEmail('');
      expect(name).toBe('User');
    });

    it('replaces underscores with spaces', () => {
      const name = UserNameDerivationService.deriveNameFromEmail('john_doe@example.com');
      expect(name).toBe('John doe');
    });

    it('collapses multiple separators into a single space', () => {
      const name = UserNameDerivationService.deriveNameFromEmail('john..doe__test@example.com');
      expect(name).toBe('John doe test');
    });
  });
});
