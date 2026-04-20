'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { adminAuthApi } from '@/lib/api/admin-auth-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { adminSessionStorage, type RefreshResult, type StoredAdmin } from './admin-session-storage';
import type { AuthenticatedSession } from './admin-session-types';

interface AdminSessionContextValue {
  admin: StoredAdmin | null;
  isBooting: boolean;
  persistSession: (session: AuthenticatedSession) => void;
  logout: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

/** Admin session provider. */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [admin, setAdminState] = useState<StoredAdmin | null>(null);
  const [isBooting, setIsBooting] = useState(true);

  const persistSession = useCallback((session: AuthenticatedSession) => {
    adminSessionStorage.setAccessToken(session.accessToken);
    adminSessionStorage.setRefreshToken(session.refreshToken);
    adminSessionStorage.setAdmin(session.admin);
    setAdminState(session.admin);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminAuthApi.logout();
    } catch {
      // Swallow: we log out locally regardless of backend success.
    }
    adminSessionStorage.clear();
    setAdminState(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    adminSessionStorage.registerRefreshFn(async (rawRefresh) => {
      try {
        const session = await adminAuthApi.refresh(rawRefresh);
        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          admin: session.admin,
        } satisfies RefreshResult;
      } catch (err) {
        if (err instanceof AdminApiClientError && err.status === 401) {
          return null;
        }
        throw err;
      }
    });

    const storedAdmin = adminSessionStorage.getAdmin();

    async function hydrate() {
      if (!storedAdmin) {
        if (!cancelled) {
          setAdminState(null);
          setIsBooting(false);
        }
        return;
      }

      try {
        const token = await adminSessionStorage.getAccessToken();
        if (!token) {
          adminSessionStorage.clear();
        }
      } catch {
        adminSessionStorage.clear();
      }

      if (cancelled) {
        return;
      }

      setAdminState(adminSessionStorage.getAdmin());
      setIsBooting(false);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AdminSessionContextValue>(
    () => ({ admin, isBooting, persistSession, logout }),
    [admin, isBooting, persistSession, logout],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

/** Use admin session. */
export function useAdminSession(): AdminSessionContextValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error('useAdminSession must be used inside <AdminSessionProvider>');
  }
  return ctx;
}
