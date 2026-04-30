import { Injectable, Logger, Optional } from '@nestjs/common';
import { KloelLead, Prisma } from '@prisma/client';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentService } from './smart-payment.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_SALES_PROMPT } from './kloel.prompts';
import OpenAI from 'openai';
import { OpsAlertService } from '../observability/ops-alert.service';

const NON_DIGIT_RE = /\D/g;

function safeStr(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
import "../../../scripts/pulse/__companions__/kloel-lead-brain.service.companion";
