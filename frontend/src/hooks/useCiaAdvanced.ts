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

function readCiaArrayPayload<T>(value: unknown, label: string): T[] | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value as T[];
  }
  throw new Error(`Invalid CIA ${label} payload`);
}

function getAdvancedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha ao carregar dados avançados da CIA';
}

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
  advancedError: string | null;
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
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const loadAdvancedData = useCallback(async () => {
    if (!workspaceId) {
      return;
    }

    try {
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

      const nextApprovals = readCiaArrayPayload<CiaAccountApproval>(
        approvalsRes.data,
        'approvals',
      );
      const nextInputSessions = readCiaArrayPayload<CiaInputSession>(
        inputSessionsRes.data,
        'input sessions',
      );
      const nextWorkItems = readCiaArrayPayload<CiaWorkItem>(workItemsRes.data, 'work items');

      setAdvancedError(null);
      if (runtimeRes.data) {
        setAccountRuntime(runtimeRes.data);
      }
      if (nextApprovals !== null) {
        setApprovals(nextApprovals);
      }
      if (nextInputSessions !== null) {
        setInputSessions(nextInputSessions);
      }
      if (nextWorkItems !== null) {
        setWorkItems(nextWorkItems);
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
    } catch (error) {
      setAdvancedError(getAdvancedErrorMessage(error));
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
    advancedError,
    loadAdvancedData,
  };
}
