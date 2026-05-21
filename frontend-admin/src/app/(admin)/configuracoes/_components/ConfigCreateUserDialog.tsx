'use client';

import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminIamApi } from '@/lib/api/admin-iam-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { CONFIG_PAGE_COPY } from './config-constants';

export type CreateUserDialogProps = {
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

export function CreateUserDialog(props: CreateUserDialogProps) {
  const { onClose, onCreated } = props;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [role, setRole] = useState<'OWNER' | 'MANAGER' | 'STAFF'>('STAFF');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const roleId = useId();

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminIamApi.createUser({ name, email, temporaryPassword, role });
      await onCreated();
    } catch (err) {
      setError(
        err instanceof AdminApiClientError ? err.message : CONFIG_PAGE_COPY.createAdminError,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-sm">{CONFIG_PAGE_COPY.newAdmin}</CardTitle>
          <CardDescription>{CONFIG_PAGE_COPY.createAdminDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>{CONFIG_PAGE_COPY.headers.name}</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={emailId}>{CONFIG_PAGE_COPY.email}</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={passwordId}>{CONFIG_PAGE_COPY.temporaryPassword}</Label>
              <Input
                id={passwordId}
                type="password"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.currentTarget.value)}
                minLength={12}
                maxLength={128}
                required
                placeholder={CONFIG_PAGE_COPY.temporaryPasswordPlaceholder}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={roleId}>{CONFIG_PAGE_COPY.headers.role}</Label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.currentTarget.value as 'OWNER' | 'MANAGER' | 'STAFF')}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="STAFF">{CONFIG_PAGE_COPY.roleStaff}</option>
                <option value="MANAGER">{CONFIG_PAGE_COPY.roleManager}</option>
                <option value="OWNER">{CONFIG_PAGE_COPY.roleOwner}</option>
              </select>
            </div>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                {CONFIG_PAGE_COPY.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? CONFIG_PAGE_COPY.creatingAdmin : CONFIG_PAGE_COPY.createAdmin}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
