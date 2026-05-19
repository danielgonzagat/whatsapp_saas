'use client';

import { kloelT } from '@/lib/i18n/t';
export const dynamic = 'force-dynamic';

import { AutopilotOverview } from './AutopilotOverview';
import { AutopilotRulesPanel } from './AutopilotRulesPanel';
import { AutopilotPlanList } from './AutopilotPlanList';
import { AutopilotHistoryPanel } from './AutopilotHistoryPanel';
import { AutopilotMissionGrid } from './AutopilotMissionGrid';
import { useAutopilotData } from './useAutopilotData';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import type { AutopilotConfigData } from './page.types';
import { colors } from '@/lib/design-tokens';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback } from 'react';
import { KloelMushroomMark } from '@/components/kloel/KloelBrand';

export default function AutopilotPage() {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const pathname = usePathname();

  const {
    isLoading,
    isToggling,
    status,
    stats,
    impact,
    pipeline,
    systemHealth,
    actions,
    moneyReport,
    revenueEvents,
    insights,
    queueStats,
    config,
    isEditingConfig,
    setIsEditingConfig,
    configDraft,
    isSavingConfig,
    statusFilter,
    setStatusFilter,
    error,
    setError,
    smokeResult,
    isTesting,
    testPhone,
    setTestPhone,
    testMessage,
    setTestMessage,
    testLiveSend,
    setTestLiveSend,
    askQuestion,
    setAskQuestion,
    isAsking,
    askResult,
    runtimeConfig,
    missionCards,
    fetchAutopilotData,
    handleToggle,
    handleSmokeTest,
    handleExportActions,
    handleSaveConfig,
    handleAskInsights,
    setConfigDraft,
  } = useAutopilotData(workspaceId);

  const navigate = useCallback(
    (href: string) => {
      if (!href || pathname === href) {
        return;
      }
      startTransition(() => router.push(href));
    },
    [pathname, router],
  );

  if (isLoading && !stats) {
    return (
      <div
        className="min-h-full flex items-center justify-center"
        style={{ backgroundColor: colors.background.obsidian }}
      >
        <div className="flex flex-col items-center gap-4">
          <KloelMushroomMark
            size={32}
            title="Carregando Autopilot"
            traceColor={colors.brand.green}
          />
          <span style={{ color: colors.text.muted }}>{kloelT('Carregando Autopilot...')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-20" style={{ backgroundColor: colors.background.obsidian }}>
      <AutopilotOverview
        status={status}
        stats={stats}
        impact={impact}
        pipeline={pipeline}
        systemHealth={systemHealth}
        missionCards={missionCards}
        isLoading={isLoading}
        error={error}
        isToggling={isToggling}
        handleToggle={handleToggle}
        onDismissError={() => setError(null)}
        onRefresh={fetchAutopilotData}
        onNavigate={navigate}
      />
      <AutopilotRulesPanel
        actions={actions}
        impact={impact}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        isLoading={isLoading}
        isEnabled={status?.enabled ?? false}
        moneyReport={moneyReport}
        onRefresh={fetchAutopilotData}
        onExport={handleExportActions}
      />
      <AutopilotPlanList revenueEvents={revenueEvents} />
      <AutopilotHistoryPanel
        insights={insights}
        askQuestion={askQuestion}
        setAskQuestion={setAskQuestion}
        handleAskInsights={handleAskInsights}
        isAsking={isAsking}
        askResult={askResult}
      />
      <AutopilotMissionGrid
        queueStats={queueStats}
        runtimeConfig={runtimeConfig}
        smokeResult={smokeResult}
        testPhone={testPhone}
        testMessage={testMessage}
        testLiveSend={testLiveSend}
        isTesting={isTesting}
        onTestPhoneChange={setTestPhone}
        onTestMessageChange={setTestMessage}
        onTestLiveSendChange={setTestLiveSend}
        onSmokeTest={handleSmokeTest}
        config={config}
        isEditingConfig={isEditingConfig}
        configDraft={configDraft}
        isSavingConfig={isSavingConfig}
        onConfigDraftChange={(updater) =>
          setConfigDraft((prev) => updater(prev) as AutopilotConfigData)
        }
        onToggleEditingConfig={() => {
          if (isEditingConfig) {
            setConfigDraft(config || {});
          }
          setIsEditingConfig(!isEditingConfig);
        }}
        onSaveConfig={handleSaveConfig}
        onNavigate={navigate}
      />
    </div>
  );
}
