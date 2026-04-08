/**
 * Security and hardening constants shared across the backend.
 */

/**
 * bcrypt work factor for password hashing. Used by auth, KYC, team,
 * and the production bootstrap script. Matches SECURITY.md's declared
 * salt rounds = 12. Do not lower this without updating SECURITY.md.
 */
export const BCRYPT_ROUNDS = 12;
