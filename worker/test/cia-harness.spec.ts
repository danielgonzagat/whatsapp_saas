import { describe, expect, it } from 'vitest';
import { runCiaMissionHarness } from '../processors/cia/harness';

describe('cia-harness', () => {
  it('resolves a fake backlog end to end without WhatsApp real', () => {
    const result = runCiaMissionHarness({
      workspaceId: 'ws-harness',
      workspaceName: 'Harness Workspace',
      maxCycles: 10,
      contacts: [
        {
          conversationId: 'conv-1',
          contactId: 'c-1',
          contactName: 'Luiz',
          phone: '5511999999999',
          unreadCount: 2,
          lastMessageAt: new Date(),
          lastMessageText: 'quero comprar o produto no pix hoje',
          leadScore: 92,
          saleValue: 397,
        },
        {
          conversationId: 'conv-2',
          contactId: 'c-2',
          contactName: 'Marcos',
          phone: '5511888888888',
          unreadCount: 0,
          lastMessageAt: new Date(),
          lastMessageText: 'o pix ainda está pendente?',
          leadScore: 88,
          pendingPaymentAmount: 197,
        },
        {
          conversationId: 'conv-3',
          contactId: 'c-3',
          contactName: 'Ana',
          phone: '5511777777777',
          unreadCount: 1,
          lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          lastMessageText: 'queria entender melhor o produto',
          leadScore: 60,
        },
      ],
    });

    expect(result.summary.initialBacklog).toBe(3);
    expect(result.summary.finalBacklog).toBeLessThan(result.summary.initialBacklog);
    expect(result.summary.repliedContacts + result.summary.followupsSent).toBeGreaterThanOrEqual(2);
    expect(result.summary.paymentRecoveries).toBe(1);
    expect(result.summary.recoveredRevenue).toBe(197);
    expect(result.guaranteeReports.every((report) => report.guaranteed)).toBe(true);
    expect(result.timeline.some((event) => event.type === 'contact')).toBe(true);
    expect(result.timeline.some((event) => event.type === 'payment')).toBe(true);
  });

  it('continues after failures and absorbs new arrivals during the mission', () => {
    const result = runCiaMissionHarness({
      workspaceId: 'ws-arrivals',
      maxCycles: 12,
      contacts: [
        {
          conversationId: 'conv-a',
          contactId: 'c-a',
          contactName: 'João',
          phone: '5511666666666',
          unreadCount: 1,
          lastMessageAt: new Date(),
          lastMessageText: 'qual o preço?',
          leadScore: 74,
          failuresBeforeSuccess: 1,
        },
        {
          conversationId: 'conv-b',
          contactId: 'c-b',
          contactName: 'Fernanda',
          phone: '5511555555555',
          unreadCount: 0,
          lastMessageAt: new Date(),
          lastMessageText: 'me manda o pix de novo',
          leadScore: 81,
          pendingPaymentAmount: 297,
        },
      ],
      arrivals: [
        {
          cycle: 2,
          contact: {
            conversationId: 'conv-c',
            contactId: 'c-c',
            contactName: 'Maria',
            phone: '5511444444444',
            unreadCount: 1,
            lastMessageAt: new Date(),
            lastMessageText: 'quero fechar agora',
            leadScore: 95,
            saleValue: 697,
          },
        },
      ],
    });

    expect(result.summary.errors).toBe(1);
    expect(result.summary.finalBacklog).toBeLessThan(result.summary.initialBacklog + 1);
    expect(result.summary.repliedContacts).toBeGreaterThanOrEqual(1);
    expect(result.summary.paymentRecoveries).toBe(1);
    expect(
      result.timeline.some(
        (event) => event.type === 'status' && event.message.includes('Chegou uma nova conversa'),
      ),
    ).toBe(true);
    expect(
      result.timeline.some(
        (event) => event.type === 'error' && event.message.includes('missão continuou'),
      ),
    ).toBe(true);
  });
});
