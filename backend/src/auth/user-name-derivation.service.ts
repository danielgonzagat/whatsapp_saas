export class UserNameDerivationService {
  /**
   * Derive user display name from email local part.
   * Replaces separators with spaces, capitalizes first letter.
   * Examples: "john.doe@example.com" → "John doe", "jane_smith@..." → "Jane smith"
   */
  static deriveNameFromEmail(email: string): string {
    const local = email.split('@')[0] || 'User';
    const W_RE = /[\W_]+/g;
    const cleaned = local.replace(W_RE, ' ').trim();
    const candidate = cleaned || 'User';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
}
