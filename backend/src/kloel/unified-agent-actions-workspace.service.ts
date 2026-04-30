import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import type { ToolArgs } from './unified-agent.service';
import { OpsAlertService } from '../observability/ops-alert.service';

type UnknownRecord = Record<string, unknown>;

const WHITESPACE_G_RE = /\s+/g;
import "../../../scripts/pulse/__companions__/unified-agent-actions-workspace.service.companion";
