import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KloelService } from './kloel.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeadMindCoordinator } from './mind/coordination/lead-mind-coordinator.service';
import { MindMessageService } from './mind/aliases/mind-message.service';
import { KloelReplyEngineService } from './kloel-reply-engine.service';
import { KloelThreadService } from './kloel-thread.service';
import { KloelThinkerService } from './kloel-thinker.service';
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { KloelWorkspaceContextService } from './kloel-workspace-context.service';

/**
 * Brain → Mind delegation contract for KloelService (Claude-K61 / K70-extract).
 *
 * Verifies that when MindMessageService is injected (production wiring path
 * — KloelModule provides+exports it), KloelService.getHistory delegates to
 * the canonical `mindMessage.getHistory(workspaceId, 50)` surface instead of
 * issuing a bare `prisma.kloelMessage.findMany`. Counterpart fallback path
 * is already covered in kloel.service.spec.ts under describe('getHistory').
 *
 * Kept in its own spec file so the parent kloel.service.spec.ts stays under
 * the `max_touched_file_lines` architecture guardrail.
 */
describe('KloelService — Brain→Mind delegation (Claude-K61)', () => {
  it('delegates getHistory to MindMessageService when injected', async () => {
    const findMany = jest.fn();
    const prisma = { kloelMessage: { findMany } } as unknown as PrismaService;
    const mindRow = {
      id: 'mind-m1',
      role: 'assistant',
      content: 'olá da mind',
      timestamp: new Date('2026-05-29T11:00:00.000Z'),
    };
    const getHistory = jest.fn().mockResolvedValue([mindRow]);
    const mindMessage = { getHistory } as unknown as MindMessageService;

    const noop = (): unknown => undefined;
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        KloelService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: noop } },
        {
          provide: PlanLimitsService,
          useValue: { ensureTokenBudget: noop, trackAiUsage: noop, trackMessageSend: noop },
        },
        { provide: KloelThreadService, useValue: { normalizeThreadMessageMetadataRecord: noop } },
        {
          provide: KloelWorkspaceContextService,
          useValue: {
            getWorkspaceContext: noop,
            buildLinkedProductPromptContext: noop,
            contextFormatter: { sanitizeUserNameForAssistant: noop },
          },
        },
        {
          provide: LeadMindCoordinator,
          useValue: {
            processWhatsAppMessage: noop,
            processWhatsAppMessageWithPayment: noop,
            generatePaymentForLead: noop,
          },
        },
        {
          provide: KloelThinkerService,
          useValue: { think: noop, thinkSync: noop, regenerateThreadAssistantResponse: noop },
        },
        {
          provide: KloelReplyEngineService,
          useValue: { buildAssistantReply: noop, buildMarketingPromptAddendum: noop },
        },
        { provide: KloelToolDispatcherService, useValue: { executeTool: noop } },
        { provide: MindMessageService, useValue: mindMessage },
      ],
    }).compile();

    const service = moduleRef.get(KloelService);
    const result = await service.getHistory('ws-mind');

    expect(getHistory).toHaveBeenCalledWith('ws-mind', 50);
    expect(findMany).not.toHaveBeenCalled();
    expect(result).toEqual([mindRow]);
  });
});
