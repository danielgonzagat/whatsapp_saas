'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AdminEmptyState,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSubinterfaceTabs,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { adminAccountsApi, type AdminAccountRow } from '@/lib/api/admin-accounts-api';
import {
  adminMindApi,
  type AdminMindLiftResponse,
  type AdminMindStateResponse,
  type AdminMindSurpriseResponse,
} from '@/lib/api/admin-mind-api';
import { LiftTab } from './mind-lift-tab';
import { StateTab } from './mind-state-tab';
import { SurpriseTab } from './mind-surprise-tab';
import { TABS } from './mind-admin.shared';

/** Mente page. */
export default function MentePage() {
  const [activeTab, setActiveTab] = useState('state');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [liftDecisionType, setLiftDecisionType] = useState('cia_aggressiveness');
  const [liftSinceDays, setLiftSinceDays] = useState(14);
  const [surpriseLimit, setSurpriseLimit] = useState(20);

  const { data: accountsData } = useSWR(
    ['admin/accounts-list-for-mind'],
    () => adminAccountsApi.list({ take: 100 }),
    { revalidateOnFocus: false, refreshInterval: 120_000 },
  );

  const workspaces: AdminAccountRow[] = useMemo(() => accountsData?.items ?? [], [accountsData]);

  useEffect(() => {
    if (!selectedWorkspaceId && workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].workspaceId);
    }
  }, [workspaces, selectedWorkspaceId]);

  const workspaceId = selectedWorkspaceId ?? '';

  const { data: stateData } = useSWR<AdminMindStateResponse>(
    workspaceId ? ['admin/mind/state', workspaceId, liftDecisionType] : null,
    () => adminMindApi.state(workspaceId, liftDecisionType),
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );

  const { data: surpriseData } = useSWR<AdminMindSurpriseResponse>(
    workspaceId ? ['admin/mind/surprise', workspaceId, surpriseLimit] : null,
    () => adminMindApi.surprise(workspaceId, surpriseLimit),
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );

  const { data: liftData } = useSWR<AdminMindLiftResponse>(
    workspaceId ? ['admin/mind/lift', workspaceId, liftDecisionType, liftSinceDays] : null,
    () => adminMindApi.lift(workspaceId, liftDecisionType, liftSinceDays),
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );

  const hasSurpriseData = (surpriseData?.items?.length ?? 0) > 0;
  const hasLiftData = (liftData?.n ?? 0) > 0;

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="MIND"
        title="Mente"
        description="Monitor de inferência bayesiana, surpresa estatística e lift das decisões autônomas por workspace."
      />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Workspace"
          description="Selecione o workspace para inspecionar os dados da Mente."
        />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <select
              value={selectedWorkspaceId ?? ''}
              onChange={(event) => setSelectedWorkspaceId(event.target.value || null)}
              className="h-10 w-full max-w-md rounded-md border border-[var(--app-border-input)] bg-[var(--app-bg-input)] px-3 text-[14px] text-[var(--app-text-primary)] outline-none"
            >
              <option value="" disabled>
                Selecione um workspace...
              </option>
              {workspaces.map((ws) => (
                <option key={ws.workspaceId} value={ws.workspaceId}>
                  {ws.name} ({ws.ownerEmail ?? 'sem email'})
                </option>
              ))}
            </select>
          </div>
          {workspaceId && stateData ? (
            <span className="text-[12px] text-[var(--app-text-secondary)]">
              Ativo:{' '}
              <span className="font-semibold text-[var(--app-text-primary)]">
                {stateData.workspaceName}
              </span>
            </span>
          ) : null}
        </div>
      </AdminSurface>

      <AdminSubinterfaceTabs items={TABS} active={activeTab} onChange={setActiveTab} />

      {!workspaceId ? (
        <AdminSurface className="px-5 py-5 lg:px-6">
          <AdminEmptyState
            title="Nenhum workspace selecionado"
            description="Selecione um workspace acima para visualizar os dados da Mente."
          />
        </AdminSurface>
      ) : (
        <>
          {activeTab === 'state' && (
            <StateTab data={stateData} workspaceName={stateData?.workspaceName ?? '—'} />
          )}

          {activeTab === 'surprise' && (
            <SurpriseTab
              data={surpriseData}
              hasData={hasSurpriseData}
              limit={surpriseLimit}
              onLimitChange={setSurpriseLimit}
            />
          )}

          {activeTab === 'lift' && (
            <LiftTab
              data={liftData}
              hasData={hasLiftData}
              decisionType={liftDecisionType}
              sinceDays={liftSinceDays}
              onDecisionTypeChange={setLiftDecisionType}
              onSinceDaysChange={setLiftSinceDays}
            />
          )}
        </>
      )}
    </AdminPage>
  );
}
