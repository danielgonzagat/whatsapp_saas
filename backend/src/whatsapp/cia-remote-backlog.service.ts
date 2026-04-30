import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { findFirstSequential, forEachSequential } from '../common/async-sequence';
import { UnifiedAgentService } from '../kloel/unified-agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentEventsService } from './agent-events.service';
import { CiaChatFilterService } from './cia-chat-filter.service';
import { CiaRuntimeStateService } from './cia-runtime-state.service';
import { CIA_SHARED_REPLY_LOCK_MS, CiaSendHelpersService } from './cia-send-helpers.service';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WahaChatSummary } from './providers/whatsapp-api.provider';
import { extractPhoneFromChatId as normalizePhoneFromChatId } from './whatsapp-normalization.util';
import { WhatsappService } from './whatsapp.service';

type BacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';
const safeStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fb;
import "../../../scripts/pulse/__companions__/cia-remote-backlog.service.companion";
