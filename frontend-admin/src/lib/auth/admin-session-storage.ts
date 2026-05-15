/**
 * In-memory access-token store backed by an httpOnly refresh cookie.
 *
 * Why this shape:
 *  - Access tokens are short-lived (15 min) and live only in memory. They
 *    never touch storage, so an XSS-stolen storage blob is useless after the
 *    tab closes.
 *  - Refresh tokens are never written to browser storage. The Next admin auth
 *    proxy owns the httpOnly cookie and rotates it on every refresh call.
 *  - SSR-safe: all storage access is guarded with `typeof window !== 'undefined'`
 *    before reading the non-sensitive admin profile cache.
 */

import type { AdminRole } from './admin-session-types';

const ADMIN_PROFILE_SLOT = 'kloel-admin:admin';

/** Stored admin shape. */
export interface StoredAdmin {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Role property. */
  role: AdminRole;
}

class AdminSessionStorage {
  private accessToken: string | null = null;
  private admin: StoredAdmin | null = null;
  private refreshPromise: Promise<string | null> | null = null;
  private refreshFn: (() => Promise<RefreshResult | null>) | null = null;

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  setAdmin(admin: StoredAdmin | null): void {
    this.admin = admin;
    if (typeof window !== 'undefined') {
      if (admin) {
        window.localStorage.setItem(ADMIN_PROFILE_SLOT, JSON.stringify(admin));
      } else {
        window.localStorage.removeItem(ADMIN_PROFILE_SLOT);
      }
    }
  }

  getAdmin(): StoredAdmin | null {
    if (this.admin) {
      return this.admin;
    }
    if (typeof window === 'undefined') {
      return null;
    }
    const raw = window.localStorage.getItem(ADMIN_PROFILE_SLOT);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as StoredAdmin;
      this.admin = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Register the refresh implementation. The session storage layer does not
   * import the API client to avoid a circular dep, so the provider wires
   * the callback at boot.
   */
  registerRefreshFn(fn: () => Promise<RefreshResult | null>): void {
    this.refreshFn = fn;
  }

  async getAccessToken(): Promise<string | null> {
    if (this.accessToken) {
      return this.accessToken;
    }

    if (!this.refreshFn) {
      return null;
    }

    if (!this.refreshPromise) {
      const fn = this.refreshFn;
      this.refreshPromise = fn()
        .then((result) => {
          if (!result) {
            this.clear();
            return null;
          }
          this.setAccessToken(result.accessToken);
          this.setAdmin(result.admin);
          return result.accessToken;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  clear(): void {
    this.accessToken = null;
    this.admin = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_PROFILE_SLOT);
    }
  }
}

/** Refresh result shape. */
export interface RefreshResult {
  /** Access token property. */
  accessToken: string;
  /** Admin property. */
  admin: StoredAdmin;
}

/** Admin session storage. */
export const adminSessionStorage = new AdminSessionStorage();
