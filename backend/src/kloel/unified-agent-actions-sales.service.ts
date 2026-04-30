import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatBrlAmount } from './money-format.util';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import type { ToolArgs } from './unified-agent.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type UnknownRecord = Record<string, unknown>;

function describeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unknown error';
}
