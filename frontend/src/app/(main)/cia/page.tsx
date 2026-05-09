'use client';

/** Dynamic. */
export const dynamic = 'force-dynamic';

import { CenterStage, Grid, Section } from '@/components/kloel';
import { useToast } from '@/components/kloel/ToastProvider';
import { useWorkspace } from '@/hooks/useWorkspaceId';
import { useCiaSurface } from '@/hooks/useCiaSurface';
import { useCiaAdvanced } from '@/hooks/useCiaAdvanced';
import { useCiaTasks } from '@/hooks/useCiaTasks';
import { CiaHeader } from './components/CiaHeader';
import { CiaStats } from './components/CiaStats';
import { CiaNow } from './components/CiaNow';
import { CiaMoneyEvents } from './components/CiaMoneyEvents';
import { CiaActivityFeed } from './components/CiaActivityFeed';
import { CiaCognitiveState } from './components/CiaCognitiveState';
import { CiaHumanTasks } from './components/CiaHumanTasks';
import { CiaMarketSignalCard } from './components/CiaMarketSignal';
import { CiaInsights } from './components/CiaInsights';
import { CiaAgentRuntime } from './components/CiaAgentRuntime';
import { CiaAccountApprovals } from './components/CiaAccountApprovals';
import { CiaInputSessions } from './components/CiaInputSessions';
import { CiaWorkItems } from './components/CiaWorkItems';
import { CiaProofs } from './components/CiaProofs';
import { CiaRegistries } from './components/CiaRegistries';

export default function CiaPage() {
  const { showToast } = useToast();
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const {
    surface,
    loading,
    activating,
    error,
    setError,
    moneyEvents,
    loadSurface,
    handleAutopilotTotal,
  } = useCiaSurface(workspaceId, workspaceLoading);

  const {
    accountRuntime,
    approvals,
    inputSessions,
    workItems,
    accountProof,
    cycleProof,
    capabilityRegistry,
    conversationActionRegistry,
    openApprovals,
    pendingSessions,
    activeWorkItems,
    loadAdvancedData,
  } = useCiaAdvanced(workspaceId);

  const {
    taskDrafts,
    taskPendingId,
    sessionAnswers,
    sessionPendingId,
    approvalPendingId,
    setTaskDrafts,
    setSessionAnswers,
    handleApproveTask,
    handleRejectTask,
    handleResumeTask,
    handleApproveApproval,
    handleRejectApproval,
    handleRespondToSession,
  } = useCiaTasks(workspaceId, loadSurface, loadAdvancedData, setError);

  const onRefresh = () => {
    void loadSurface();
    void loadAdvancedData();
    showToast('Dados atualizados', 'success');
  };

  return (
    <CenterStage size="XL">
      <Section spacing="lg">
        <CiaHeader
          surface={surface}
          accountRuntime={accountRuntime}
          activating={activating}
          workspaceLoading={workspaceLoading}
          hasWorkspace={!!workspaceId}
          onRefresh={onRefresh}
          onAutopilotTotal={() => void handleAutopilotTotal()}
        />

        <CiaStats
          soldAmount={surface?.today?.soldAmount || 0}
          activeConversations={surface?.today?.activeConversations || 0}
          pendingPayments={surface?.today?.pendingPayments || 0}
        />

        <CiaNow
          message={surface?.now?.message || ''}
          phase={surface?.now?.phase}
          loading={loading}
          error={error}
        />

        <CiaMoneyEvents events={moneyEvents} />

        <Grid cols={2} gap={4}>
          <CiaActivityFeed events={surface?.recent || []} />

          <div className="space-y-4">
            <CiaCognitiveState cognition={surface?.cognition || []} />
            <CiaHumanTasks
              tasks={surface?.humanTasks || []}
              taskDrafts={taskDrafts}
              taskPendingId={taskPendingId}
              workspaceLoading={workspaceLoading}
              onSetTaskDrafts={setTaskDrafts}
              onApprove={handleApproveTask}
              onReject={handleRejectTask}
              onResume={handleResumeTask}
            />
            <CiaMarketSignalCard signal={surface?.marketSignals?.[0]} />
          </div>
        </Grid>

        <CiaInsights insights={surface?.insights || []} />

        {accountRuntime && <CiaAgentRuntime runtime={accountRuntime} />}

        <CiaAccountApprovals
          approvals={approvals}
          openApprovals={openApprovals}
          approvalPendingId={approvalPendingId}
          workspaceLoading={workspaceLoading}
          onApprove={handleApproveApproval}
          onReject={handleRejectApproval}
        />

        <CiaInputSessions
          sessions={inputSessions}
          pendingSessions={pendingSessions}
          sessionAnswers={sessionAnswers}
          sessionPendingId={sessionPendingId}
          workspaceLoading={workspaceLoading}
          onSetSessionAnswers={setSessionAnswers}
          onRespond={handleRespondToSession}
        />

        <CiaWorkItems items={workItems} activeWorkItems={activeWorkItems} />

        <CiaProofs cycleProof={cycleProof} accountProof={accountProof} />

        <CiaRegistries
          capabilityRegistry={capabilityRegistry}
          conversationActionRegistry={conversationActionRegistry}
        />
      </Section>
    </CenterStage>
  );
}
