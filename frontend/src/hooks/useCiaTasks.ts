'use client';

import {
  type CiaAccountApproval,
  type CiaHumanTask,
  type CiaInputSession,
  ciaApi,
} from '@/lib/api';
import { useState } from 'react';

interface UseCiaTasksReturn {
  taskDrafts: Record<string, string>;
  taskPendingId: string | null;
  sessionAnswers: Record<string, string>;
  sessionPendingId: string | null;
  approvalPendingId: string | null;
  setTaskDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSessionAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleApproveTask: (task: CiaHumanTask) => Promise<void>;
  handleRejectTask: (task: CiaHumanTask) => Promise<void>;
  handleResumeTask: (task: CiaHumanTask) => Promise<void>;
  handleApproveApproval: (approval: CiaAccountApproval) => Promise<void>;
  handleRejectApproval: (approval: CiaAccountApproval) => Promise<void>;
  handleRespondToSession: (session: CiaInputSession) => Promise<void>;
}

export function useCiaTasks(
  workspaceId: string,
  loadSurface: () => Promise<void>,
  loadAdvancedData: () => Promise<void>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
): UseCiaTasksReturn {
  const [taskPendingId, setTaskPendingId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, string>>({});
  const [approvalPendingId, setApprovalPendingId] = useState<string | null>(null);
  const [sessionPendingId, setSessionPendingId] = useState<string | null>(null);
  const [sessionAnswers, setSessionAnswers] = useState<Record<string, string>>({});

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

  return {
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
  };
}
