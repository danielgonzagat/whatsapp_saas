'use client';

import { Input } from '@/components/ui/input';
import { AdminMetricGrid, AdminSectionHeader, AdminSurface } from '@/components/admin/admin-monitor-ui';
import { type AdminConfigWorkspaceRow } from '@/lib/api/admin-config-api';
import { adminConfigApi } from '@/lib/api/admin-config-api';
import { WorkspaceConfigEditor } from './ConfigWorkspaceConfigEditor';
import { CONFIG_PAGE_COPY, CONFIG_METRIC_COPY, formatWorkspaceInfraSummary } from './config-constants';

export type ConfigOverviewData = Awaited<ReturnType<typeof adminConfigApi.overview>>;

export type WorkspaceConfigSectionProps = {
  configOverview: ConfigOverviewData | undefined;
  configSearch: string;
  selectedWorkspace: AdminConfigWorkspaceRow | null;
  onConfigSearchChange: (value: string) => void;
  onSelectWorkspace: (workspace: AdminConfigWorkspaceRow) => void;
  onWorkspaceSaved: (workspace: AdminConfigWorkspaceRow) => Promise<void> | void;
};

export function WorkspaceConfigSection(props: WorkspaceConfigSectionProps) {
  const {
    configOverview,
    configSearch,
    selectedWorkspace,
    onConfigSearchChange,
    onSelectWorkspace,
    onWorkspaceSaved,
  } = props;

  return (
    <AdminSurface className="px-5 py-5 lg:px-6">
      <AdminSectionHeader
        title={CONFIG_PAGE_COPY.workspaceTitle}
        description={CONFIG_PAGE_COPY.workspaceDescription}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <Input
          value={configSearch}
          onChange={(event) => onConfigSearchChange(event.currentTarget.value)}
          placeholder={CONFIG_PAGE_COPY.workspaceSearchPlaceholder}
          className="max-w-xl"
        />
      </div>
      <AdminMetricGrid
        items={[
          {
            label: CONFIG_METRIC_COPY.workspaces.label,
            value: configOverview?.metrics.totalWorkspaces ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.workspaces.detail,
          },
          {
            label: CONFIG_METRIC_COPY.activeDomains.label,
            value: configOverview?.metrics.customDomainsActive ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.activeDomains.detail,
          },
          {
            label: CONFIG_METRIC_COPY.apiKeys.label,
            value: configOverview?.metrics.apiKeysActive ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.apiKeys.detail,
          },
          {
            label: CONFIG_METRIC_COPY.autopilotOn.label,
            value: configOverview?.metrics.autopilotEnabled ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.autopilotOn.detail,
          },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.workspace}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.domain}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.guest}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.autopilot}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.auth}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.infra}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(configOverview?.workspaces ?? []).map((workspace) => (
                <tr
                  key={workspace.workspaceId}
                  className={
                    'cursor-pointer hover:bg-accent/40 ' +
                    (selectedWorkspace?.workspaceId === workspace.workspaceId
                      ? 'bg-primary/10'
                      : '')
                  }
                  onClick={() => onSelectWorkspace(workspace)}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{workspace.name}</span>
                      <span className="text-xs text-muted-foreground">{workspace.workspaceId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {workspace.customDomain || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {workspace.guestMode
                      ? CONFIG_PAGE_COPY.workspaceGuestOn
                      : CONFIG_PAGE_COPY.workspaceGuestOff}
                  </td>
                  <td className="px-4 py-3">
                    {workspace.autopilotEnabled
                      ? CONFIG_PAGE_COPY.workspaceAutopilotOn
                      : CONFIG_PAGE_COPY.workspaceAutopilotOff}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {workspace.authMode || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatWorkspaceInfraSummary(workspace)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <WorkspaceConfigEditor workspace={selectedWorkspace} onSaved={onWorkspaceSaved} />
      </div>
    </AdminSurface>
  );
}
