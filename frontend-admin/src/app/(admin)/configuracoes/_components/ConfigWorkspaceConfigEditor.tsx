'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminConfigApi, type AdminConfigWorkspaceRow } from '@/lib/api/admin-config-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { CONFIG_PAGE_COPY } from './config-constants';

export type WorkspaceConfigEditorProps = {
  workspace: AdminConfigWorkspaceRow | null;
  onSaved: (workspace: AdminConfigWorkspaceRow) => Promise<void> | void;
};

export function WorkspaceConfigEditor(props: WorkspaceConfigEditorProps) {
  const { workspace, onSaved } = props;
  const [customDomain, setCustomDomain] = useState('');
  const [guestMode, setGuestMode] = useState(false);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [authMode, setAuthMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomDomain(workspace?.customDomain ?? '');
    setGuestMode(workspace?.guestMode ?? false);
    setAutopilotEnabled(workspace?.autopilotEnabled ?? false);
    setAuthMode(workspace?.authMode ?? '');
    setError(null);
  }, [workspace]);

  async function handleSaveWorkspace() {
    if (!workspace) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await adminConfigApi.updateWorkspace(workspace.workspaceId, {
        customDomain,
        guestMode,
        autopilotEnabled,
        authMode,
      });
      await onSaved(updated);
    } catch (err) {
      setError(
        err instanceof AdminApiClientError ? err.message : CONFIG_PAGE_COPY.saveWorkspaceError,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{CONFIG_PAGE_COPY.editWorkspaceTitle}</CardTitle>
          <CardDescription>{CONFIG_PAGE_COPY.permissionsSelect}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{workspace.name}</CardTitle>
        <CardDescription>{CONFIG_PAGE_COPY.workspaceControlsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label>{CONFIG_PAGE_COPY.customDomain}</Label>
          <Input
            value={customDomain}
            onChange={(event) => setCustomDomain(event.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{CONFIG_PAGE_COPY.authMode}</Label>
          <Input value={authMode} onChange={(event) => setAuthMode(event.currentTarget.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={guestMode}
            onChange={(event) => setGuestMode(event.currentTarget.checked)}
          />
          {CONFIG_PAGE_COPY.guestModeActive}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autopilotEnabled}
            onChange={(event) => setAutopilotEnabled(event.currentTarget.checked)}
          />
          {CONFIG_PAGE_COPY.autopilotActive}
        </label>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <div className="flex justify-end">
          <Button size="sm" disabled={busy} onClick={handleSaveWorkspace}>
            {busy ? CONFIG_PAGE_COPY.savingWorkspace : CONFIG_PAGE_COPY.saveWorkspace}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
