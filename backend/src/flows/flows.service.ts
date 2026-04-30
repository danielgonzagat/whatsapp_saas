import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';

const D_RE = /\D/g;

// ---------------------------------------------------------------------------
// Types for WaitForReply node handling
// ---------------------------------------------------------------------------

/** Shape of data stored in a waitForReply node */
interface WaitForReplyNodeData {
  timeout?: number;
  timeoutUnit?: 'seconds' | 'minutes' | 'hours' | 'days';
  fallbackMessage?: string;
}

/** Extra fields persisted inside FlowExecution.state while waiting */
interface WaitState {
  user?: string;
  waitNodeId: string;
  waitingForContact: string;
  waitExpiresAt: string; // ISO-8601 absolute timestamp
  fallbackMessage?: string;
  [key: string]: unknown;
}

/** Return value of resumeFromWait so the caller (worker) knows what to do */
interface ResumeResult {
  /** Whether a waiting execution was found and resumed */
  resumed: boolean;
  executionId?: string;
  flowId?: string;
  workspaceId?: string;
  /** The edge label the worker should follow: 'Respondeu' or 'Timeout' */
  resumeEdge?: 'Respondeu' | 'Timeout';
  /** The nodeId to resume from (the waitForReply node) */
  waitNodeId?: string;
  /** Fallback message to send when resuming via Timeout edge */
  fallbackMessage?: string;
  /** Full execution state so the worker can continue */
  state?: Record<string, unknown>;
}
