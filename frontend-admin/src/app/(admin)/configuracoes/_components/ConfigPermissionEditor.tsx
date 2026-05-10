'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  adminIamApi,
  type AdminUserPermission,
  type AdminUserRecord,
  type PermissionSetEntry,
} from '@/lib/api/admin-iam-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import {
  ALL_ACTIONS,
  ALL_MODULES,
  CONFIG_PAGE_COPY,
  describePermissionEditorUser,
} from './config-constants';

export type PermissionEditorProps = {
  user: AdminUserRecord | null;
  permissions: AdminUserPermission[] | null;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

export function PermissionEditor(props: PermissionEditorProps) {
  const { user, permissions, onSaved, onCancel } = props;
  const initialMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissions ?? []) {
      map.set(`${p.module}.${p.action}`, p.allowed);
    }
    return map;
  }, [permissions]);

  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map(initialMap));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOverrides(new Map(initialMap));
  }, [initialMap]);

  function toggle(moduleName: string, action: string) {
    const key = `${moduleName}.${action}`;
    setOverrides((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        if (next.get(key) === true) {
          next.set(key, false);
        } else {
          next.delete(key);
        }
      } else {
        next.set(key, true);
      }
      return next;
    });
  }

  async function save() {
    if (!user) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const entries: PermissionSetEntry[] = Array.from(overrides.entries()).map(
        ([key, allowed]) => {
          const [module, action] = key.split('.');
          return { module, action, allowed };
        },
      );
      await adminIamApi.setPermissions(user.id, entries);
      await onSaved();
    } catch (err) {
      setError(
        err instanceof AdminApiClientError ? err.message : CONFIG_PAGE_COPY.permissionSaveError,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{user.name}</CardTitle>
        <CardDescription>{describePermissionEditorUser(user)}</CardDescription>
      </CardHeader>
      <CardContent className="flex max-h-[480px] flex-col gap-2 overflow-y-auto">
        {user.role === 'OWNER' ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {CONFIG_PAGE_COPY.permissionOwnerBypass}
          </p>
        ) : (
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2 pr-2">{CONFIG_PAGE_COPY.headers.module}</th>
                {ALL_ACTIONS.map((a) => (
                  <th key={a} className="px-1 py-2 text-center">
                    {a.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ALL_MODULES.map((m) => (
                <tr key={m}>
                  <td className="py-2 pr-2 font-medium">{m}</td>
                  {ALL_ACTIONS.map((a) => {
                    const key = `${m}.${a}`;
                    const active = overrides.get(key);
                    return (
                      <td key={a} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(m, a)}
                          className={
                            'h-5 w-5 rounded-sm border text-[9px] ' +
                            (active === true
                              ? 'border-primary bg-primary/20 text-primary'
                              : active === false
                                ? 'border-red-400 bg-red-400/10 text-red-400'
                                : 'border-border text-muted-foreground')
                          }
                          title={`${m}.${a}`}
                        >
                          {active === true ? '✓' : active === false ? '×' : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <CardContent className="flex items-center justify-end gap-2">
        {error ? <p className="mr-auto text-xs text-red-400">{error}</p> : null}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {CONFIG_PAGE_COPY.close}
        </Button>
        {user.role !== 'OWNER' ? (
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? CONFIG_PAGE_COPY.savingOverrides : CONFIG_PAGE_COPY.saveOverrides}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
