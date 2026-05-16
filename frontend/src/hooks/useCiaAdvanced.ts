'use client';

import {
  type CiaAccountApproval,
  type CiaAccountRuntime,
  type CiaCapabilityRegistry,
  type CiaConversationActionRegistry,
  type CiaInputSession,
  type CiaProof,
  type CiaWorkItem,
  ciaApi,
} from '@/lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface UseCiaAdvancedReturn {
  accountRuntime: CiaAccountRuntime | null;
  approvals: CiaAccountApproval[];
  inputSessions: CiaInputSession[];
  workItems: CiaWorkItem[];
  accountProof: CiaProof | null;
  cycleProof: CiaProof | null;
  capabilityRegistry: CiaCapabilityRegistry | null;
  conversationActionRegistry: CiaConversationActionRegistry | null;
  openApprovals: CiaAccountApproval[];
  pendingSessions: CiaInputSession[];
  activeWorkItems: CiaWorkItem[];
  loadAdvancedData: () => Promise<void>;
}

export function useCiaAdvanced(workspaceId: string): UseCiaAdvancedReturn {
  const [accountRuntime, setAccountRuntime] = useState<CiaAccountRuntime | null>(null);
  const [approvals, setApprovals] = useState<CiaAccountApproval[]>([]);
  const [inputSessions, setInputSessions] = useState<CiaInputSession[]>([]);
  const [workItems, setWorkItems] = useState<CiaWorkItem[]>([]);
  const [accountProof, setAccountProof] = useState<CiaProof | null>(null);
  const [cycleProof, setCycleProof] = useState<CiaProof | null>(null);
  const [capabilityRegistry, setCapabilityRegistry] = useState<CiaCapabilityRegistry | null>(null);
  const [conversationActionRegistry, setConversationActionRegistry] =
    useState<CiaConversationActionRegistry | null>(null);

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
    queueMicrotask(() => {
      void loadAdvancedData();
    });
    const interval = setInterval(() => {
      void loadAdvancedData();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAdvancedData, workspaceId]);

  const openApprovals = useMemo(() => approvals.filter((a) => a.status === 'OPEN'), [approvals]);
  const pendingSessions = useMemo(
    () => inputSessions.filter((s) => s.status !== 'COMPLETED'),
    [inputSessions],
  );
  const activeWorkItems = useMemo(
    () => workItems.filter((w) => w.state !== 'COMPLETED'),
    [workItems],
  );

  return {
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
  };
}
