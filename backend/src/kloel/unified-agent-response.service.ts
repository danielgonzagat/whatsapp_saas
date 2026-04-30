import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { extractFallbackTopic as extractFallbackTopicValue } from '../whatsapp/whatsapp-normalization.util';
import { chatCompletionWithFallback } from './openai-wrapper';
import type { ActionEntry } from './unified-agent.service';
import {
  AGENDAR_AGENDA_REUNI_A_RE,
  CANCEL_CANCELAR_REEMBOL_RE,
  JSON_RE,
  OL__A__BOM_DIA_BOA_TARD_RE,
  P_EXTENDED_PICTOGRAPHIC_G_RE,
  P_EXTENDED_PICTOGRAPHIC_RE,
  PATTERN_RE_2,
  PATTERN_RE_3,
  PRE_C__O_QUANTO_VALOR_C_RE,
  S_______S_RE,
  WHITESPACE_G_RE,
  WHITESPACE_RE,
} from './unified-agent-response.regex';
