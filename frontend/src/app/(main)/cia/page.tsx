'use client';

import { kloelT } from '@/lib/i18n/t';
/** Dynamic. */
export const dynamic = 'force-dynamic';

import { CenterStage, Section } from '@/components/kloel';
import { useWorkspace } from '@/hooks/useWorkspaceId';
import {
  type CiaAccountApproval,
  type CiaAccountRuntime,
  type CiaCapabilityRegistry,
  type CiaConversationActionRegistry,
  type CiaHumanTask,
  type CiaInputSession,
  type CiaProof,
  type CiaSurfaceResponse,
  type CiaWorkItem,
  autostartCia,
  ciaApi,
  getWhatsAppStatus,
  tokenStorage,
} from '@/lib/api';
import { appendRecentEvent, formatPhaseLabel, isCiaActiveMode } from './page.helpers';
import {
  AccountRuntimePanel,
  AccountApprovalsPanel,
  InputSessionsPanel,
  WorkItemsPanel,
} from './page.panels';
import { ProofPanels } from './page.proof-panels';
import { RegistriesSection } from './page.registries-section';
import { CiaHeader, CiaStats, CiaNow, CiaMoneyEvents, CiaInsights } from './page.sections';
import { CiaActivityCognitiveHuman } from './page.cognitive-section';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type StreamEvent = {
  type: string;
  message: string;
  phase?: string | null;
  ts?: string;
  meta?: Record<string, unknown>;
};

/** Cia page. */
export default function CiaPage() {
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const autoStartRef = useRef(false);
  const [surface, setSurface] = useState<CiaSurfaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [taskPendingId, setTaskPendingId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [accountRuntime, setAccountRuntime] = useState<CiaAccountRuntime | null>(null);
  const [approvals, setApprovals] = useState<CiaAccountApproval[]>([]);
  const [inputSessions, setInputSessions] = useState<CiaInputSession[]>([]);
  const [workItems, setWorkItems] = useState<CiaWorkItem[]>([]);
  const [accountProof, setAccountProof] = useState<CiaProof | null>(null);
  const [cycleProof, setCycleProof] = useState<CiaProof | null>(null);
  const [capabilityRegistry, setCapabilityRegistry] = useState<CiaCapabilityRegistry | null>(null);
  const [conversationActionRegistry, setConversationActionRegistry] =
    useState<CiaConversationActionRegistry | null>(null);
  const [approvalPendingId, setApprovalPendingId] = useState<string | null>(null);
  const [sessionPendingId, setSessionPendingId] = useState<string | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, string>>({});
  const [registriesExpanded, setRegistriesExpanded] = useState(false);

  const loadSurface = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setLoading((current) => (surface ? current : true));
    const res = await ciaApi.getSurface(workspaceId);
    if (res.error) {
      setError(res.error);
    } else if (res.data) {
      setSurface(res.data);
      setError(null);
    }
    setLoading(false);
  }, [surface, workspaceId]);

  const loadAdvancedData = useCallback(async () => {
    if (!workspaceId) {
      return;
    }

    const [
      runtimeRes,
      approvalsRes,
      inputSessionsRes,
      workItemsRes,
      accountProofRes,
      cycleProofRes,
      capabilityRes,
      actionRes,
    ] = await Promise.all([
      ciaApi.getAccountRuntime(workspaceId),
      ciaApi.getAccountApprovals(workspaceId),
      ciaApi.getAccountInputSessions(workspaceId),
      ciaApi.getAccountWorkItems(workspaceId),
      ciaApi.getAccountProof(workspaceId),
      ciaApi.getCycleProof(workspaceId),
      ciaApi.getCapabilityRegistry(),
      ciaApi.getConversationActionRegistry(),
    ]);

    if (runtimeRes.data) {
      setAccountRuntime(runtimeRes.data);
    }
    if (approvalsRes.data) {
      setApprovals(Array.isArray(approvalsRes.data) ? approvalsRes.data : []);
    }
    if (inputSessionsRes.data) {
      setInputSessions(Array.isArray(inputSessionsRes.data) ? inputSessionsRes.data : []);
    }
    if (workItemsRes.data) {
      setWorkItems(Array.isArray(workItemsRes.data) ? workItemsRes.data : []);
    }
    if (accountProofRes.data) {
      setAccountProof(accountProofRes.data);
    }
    if (cycleProofRes.data) {
      setCycleProof(cycleProofRes.data);
    }
    if (capabilityRes.data) {
      setCapabilityRegistry(capabilityRes.data);
    }
    if (actionRes.data) {
      setConversationActionRegistry(actionRes.data);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    void loadSurface();
    void loadAdvancedData();
    const interval = setInterval(() => {
      void loadSurface();
      void loadAdvancedData();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAdvancedData, loadSurface, workspaceId]);

  useEffect(() => {
    if (!workspaceId || workspaceLoading || !surface || autoStartRef.current) {
      return;
    }

    const mode = String(surface.autonomy?.mode || 'OFF');
    const reason = String(surface.autonomy?.reason || '');
    const isActive = isCiaActiveMode(mode);
    if (isActive || reason === 'manual_pause') {
      return;
    }

    autoStartRef.current = true;

    void (async () => {
      try {
        const status = await getWhatsAppStatus(workspaceId);
        const connected = !!status.connected;

        if (!connected) {
          autoStartRef.current = false;
          return;
        }

        await autostartCia(workspaceId);
        await loadSurface();
      } catch {
        autoStartRef.current = false;
      }
    })();
  }, [loadSurface, surface, workspaceId, workspaceLoading]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    const token = tokenStorage.getToken();
    if (!token) {
      return;
    }

    let cancelled = false;

    async function stream() {
      try {
        const response = await fetch('/api/whatsapp-api/agent/stream', {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-workspace-id': workspaceId,
            Accept: 'text/event-stream',
          },
        });

        if (!response.ok || !response.body) {
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const readStream = async (): Promise<void> => {
          if (cancelled) {
            return;
          }
          const { value, done } = await reader.read();
          if (done) {
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() || '';

          for (const chunk of chunks) {
            const payload = chunk
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('');
            if (!payload) {
              continue;
            }

            const event = JSON.parse(payload) as StreamEvent;
            if (event.type === 'heartbeat' && !event.message) {
              continue;
            }

            setSurface((current) => {
              if (!current) {
                return current;
              }
              return appendRecentEvent(current, event);
            });
          }
          await readStream();
        };

        await readStream();
      } catch {
        // mantém polling como fallback
      }
    }

    void stream();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function handleAutopilotTotal() {
    if (!workspaceId) {
      return;
    }
    setActivating(true);
    const res = await ciaApi.activateAutopilotTotal(workspaceId);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setActivating(false);
  }

  async function handleApproveTask(task: CiaHumanTask) {
    if (!workspaceId) {
      return;
    }
    setTaskPendingId(task.id);
    const res = await ciaApi.approveHumanTask(workspaceId, task.id, {
      message: taskDrafts[task.id] || task.suggestedReply,
      resume: true,
    });
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setTaskPendingId(null);
  }

  async function handleRejectTask(task: CiaHumanTask) {
    if (!workspaceId) {
      return;
    }
    setTaskPendingId(task.id);
    const res = await ciaApi.rejectHumanTask(workspaceId, task.id);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setTaskPendingId(null);
  }

  async function handleResumeTask(task: CiaHumanTask) {
    if (!workspaceId || !task.conversationId) {
      return;
    }
    setTaskPendingId(task.id);
    const res = await ciaApi.resumeConversation(workspaceId, task.conversationId);
    if (res.error) {
      setError(res.error);
    } else {
      await loadSurface();
    }
    setTaskPendingId(null);
  }

  async function handleApproveApproval(approval: CiaAccountApproval) {
    if (!workspaceId) {
      return;
    }
    setApprovalPendingId(approval.id);
    const res = await ciaApi.approveAccountApproval(workspaceId, approval.id);
    if (res.error) {
      setError(res.error);
    } else {
      await loadAdvancedData();
    }
    setApprovalPendingId(null);
  }

  async function handleRejectApproval(approval: CiaAccountApproval) {
    if (!workspaceId) {
      return;
    }
    setApprovalPendingId(approval.id);
    const res = await ciaApi.rejectAccountApproval(workspaceId, approval.id);
    if (res.error) {
      setError(res.error);
    } else {
      await loadAdvancedData();
    }
    setApprovalPendingId(null);
  }

  async function handleRespondToSession(session: CiaInputSession) {
    if (!workspaceId) {
      return;
    }
    const answer = sessionAnswers[session.id] || '';
    if (!answer.trim()) {
      return;
    }
    setSessionPendingId(session.id);
    const res = await ciaApi.respondToInputSession(workspaceId, session.id, answer);
    if (res.error) {
      setError(res.error);
    } else {
      setSessionAnswers((prev) => {
        const next = { ...prev };
        delete next[session.id];
        return next;
      });
      await loadAdvancedData();
    }
    setSessionPendingId(null);
  }

  const moneyEvents = useMemo(
    () =>
      (surface?.recent || []).filter((event) => event.type === 'sale' || event.type === 'payment'),
    [surface],
  );

  const openApprovals = approvals.filter((a) => a.status === 'OPEN');
  const pendingSessions = inputSessions.filter((s) => s.status !== 'COMPLETED');
  const activeWorkItems = workItems.filter((w) => w.state !== 'COMPLETED');

  return (
    <CenterStage size="XL">
      <Section spacing="lg">
        {/* Header */}
        <CiaHeader
          surface={surface}
          workspaceLoading={workspaceLoading}
          accountRuntime={accountRuntime}
          onRefresh={() => {
            void loadSurface();
            void loadAdvancedData();
          }}
          onAutopilotTotal={() => void handleAutopilotTotal()}
          activating={activating}
          hasWorkspaceId={!!workspaceId}
        />

        {/* Stats */}
        <CiaStats surface={surface} />

        {/* Now */}
        <CiaNow loading={loading} surface={surface} error={error} />

        {/* Money events */}
        <CiaMoneyEvents events={moneyEvents} />

        {/* Activity + Cognitive + Human tasks */}
        <CiaActivityCognitiveHuman
          surface={surface}
          taskDrafts={taskDrafts}
          setTaskDrafts={setTaskDrafts}
          taskPendingId={taskPendingId}
          workspaceLoading={workspaceLoading}
          onApproveTask={handleApproveTask}
          onResumeTask={handleResumeTask}
          onRejectTask={handleRejectTask}
          formatPhaseLabel={formatPhaseLabel}
        />

        {/* Insights */}
        <CiaInsights surface={surface} />

        {/* Account Runtime */}
        {accountRuntime && <AccountRuntimePanel accountRuntime={accountRuntime} />}

        {/* Account Approvals */}
        <AccountApprovalsPanel
          approvals={approvals}
          openApprovals={openApprovals}
          approvalPendingId={approvalPendingId}
          workspaceLoading={workspaceLoading}
          onApprove={handleApproveApproval}
          onReject={handleRejectApproval}
        />

        {/* Input Sessions */}
        <InputSessionsPanel
          inputSessions={inputSessions}
          pendingSessions={pendingSessions}
          sessionAnswers={sessionAnswers}
          setSessionAnswers={setSessionAnswers}
          sessionPendingId={sessionPendingId}
          workspaceLoading={workspaceLoading}
          onRespond={handleRespondToSession}
        />

        {/* Work Items */}
        <WorkItemsPanel workItems={workItems} activeWorkItems={activeWorkItems} />

        {/* Proof Panels (Cycle + Account) */}
        <ProofPanels cycleProof={cycleProof} accountProof={accountProof} />

        {/* Registries */}
        <RegistriesSection
          capabilityRegistry={capabilityRegistry}
          conversationActionRegistry={conversationActionRegistry}
          expanded={registriesExpanded}
          setExpanded={setRegistriesExpanded}
        />
      </Section>
    </CenterStage>
  );
}
