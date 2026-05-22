'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import {
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
} from '@/components/admin/admin-monitor-ui';
import { adminIamApi, type AdminUserRecord } from '@/lib/api/admin-iam-api';
import { adminConfigApi, type AdminConfigWorkspaceRow } from '@/lib/api/admin-config-api';
import { useAdminSession } from '@/lib/auth/admin-session-context';
import { UserAccessSection } from './_components/ConfigUserAccessSection';
import { GovernanceNotesSection } from './_components/ConfigGovernanceNotesSection';
import { WorkspaceConfigSection } from './_components/ConfigWorkspaceConfigSection';
import { CreateUserDialog } from './_components/ConfigCreateUserDialog';
import { CONFIG_PAGE_COPY, CONFIG_METRIC_COPY } from './_components/config-constants';

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { admin } = useAdminSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [configSearch, setConfigSearch] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<AdminConfigWorkspaceRow | null>(null);

  useEffect(() => {
    if (admin && admin.role !== 'OWNER') {
      router.replace('/');
    }
  }, [admin, router]);

  const {
    data: users,
    error,
    isLoading,
    mutate: refetchUsers,
  } = useSWR<AdminUserRecord[]>(admin?.role === 'OWNER' ? 'admin/users' : null, () =>
    adminIamApi.listUsers(),
  );

  const { data: permissions, mutate: refetchPermissions } = useSWR(
    selected ? ['admin/users/permissions', selected] : null,
    () => adminIamApi.getUserPermissions(selected as string),
  );
  const { data: configOverview, mutate: refetchConfigOverview } = useSWR(
    ['admin/config/overview', configSearch],
    () => adminConfigApi.overview(configSearch || undefined),
  );

  if (!admin || admin.role !== 'OWNER') {
    return null;
  }
  const userList = users ?? [];
  const handleUserCreated = async () => {
    setShowCreate(false);
    await refetchUsers();
  };
  const handleWorkspaceSaved = async (updated: AdminConfigWorkspaceRow) => {
    setSelectedWorkspace(updated);
    await refetchConfigOverview();
  };

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="IAM"
        title={CONFIG_PAGE_COPY.pageTitle}
        description={CONFIG_PAGE_COPY.pageDescription}
        actions={<Button onClick={() => setShowCreate(true)}>{CONFIG_PAGE_COPY.newAdmin}</Button>}
      />

      <AdminMetricGrid
        items={[
          {
            label: CONFIG_METRIC_COPY.admins.label,
            value: userList.length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.admins.detail,
          },
          {
            label: CONFIG_METRIC_COPY.owners.label,
            value: userList.filter((user) => user.role === 'OWNER').length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.owners.detail,
          },
          {
            label: CONFIG_METRIC_COPY.mfaEnabled.label,
            value: userList.filter((user) => user.mfaEnabled).length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.mfaEnabled.detail,
          },
          {
            label: CONFIG_METRIC_COPY.pendingSetup.label,
            value: userList.filter((user) => user.mfaPendingSetup).length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.pendingSetup.detail,
          },
        ]}
      />

      <UserAccessSection
        error={error}
        isLoading={isLoading}
        permissions={permissions ?? null}
        selectedUserId={selected}
        users={userList}
        onPermissionsSaved={async () => {
          await refetchPermissions();
        }}
        onSelectUser={setSelected}
      />

      <GovernanceNotesSection />

      <WorkspaceConfigSection
        configOverview={configOverview}
        configSearch={configSearch}
        selectedWorkspace={selectedWorkspace}
        onConfigSearchChange={setConfigSearch}
        onSelectWorkspace={setSelectedWorkspace}
        onWorkspaceSaved={handleWorkspaceSaved}
      />

      {showCreate ? (
        <CreateUserDialog onClose={() => setShowCreate(false)} onCreated={handleUserCreated} />
      ) : null}
    </AdminPage>
  );
}
