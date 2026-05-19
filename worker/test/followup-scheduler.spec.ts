import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockPrisma, mockLogAutopilotAction } = vi.hoisted(() => ({
  mockPrisma: {
    workspace: { findUnique: vi.fn() },
    channelConfig: { findUnique: vi.fn() },
    conversation: { findFirst: vi.fn() },
  },
  mockLogAutopilotAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db', () => ({
  prisma: mockPrisma,
}));

vi.mock('../queue', () => ({
  autopilotQueue: { add: vi.fn() },
}));

vi.mock('../processors/autopilot/shared', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  notifyBillingSuspended: vi.fn(),
  isAutonomousEnabled: vi.fn().mockReturnValue(true),
  isExplicitProactiveOutreachAllowed: vi.fn().mockReturnValue(true),
  WINDOW_START: 8,
  WINDOW_END: 20,
}));

vi.mock('../processors/autopilot/execution', () => ({
  executeAction: vi.fn().mockResolvedValue({ status: 'executed' }),
  sendDirectAutopilotText: vi.fn().mockResolvedValue({ status: 'executed' }),
}));

vi.mock('../processors/autopilot/safeguard', () => ({
  logAutopilotAction: mockLogAutopilotAction,
}));

vi.mock('../providers/timezone', () => ({
  getDelayUntilWorkspaceWindowOpens: vi.fn().mockReturnValue(3600000),
  getWorkspaceLocalHour: vi.fn().mockReturnValue(12),
  isWithinWorkspaceWindow: vi.fn().mockReturnValue(true),
}));

import { runFollowupContact } from '../processors/autopilot/followup';

describe('followup-scheduler — channel followUpEnabled enforcement', () => {
  const wsId = 'ws-1';
  const phone = '5511999999999';
  const contactId = 'contact-1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {},
    });
    mockPrisma.channelConfig.findUnique.mockResolvedValue({ followupEnabled: true });
    mockPrisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      status: 'OPEN',
      mode: 'AI',
      contact: { id: contactId, phone },
      messages: [
        {
          id: 'msg-1',
          content: 'Tenho interesse',
          direction: 'OUTBOUND',
          createdAt: new Date(Date.now() - 3600000),
        },
      ],
    });
  });

  it('returns null when followUpEnabled is false', async () => {
    mockPrisma.channelConfig.findUnique.mockResolvedValue({ followupEnabled: false });

    const result = await runFollowupContact({
      workspaceId: wsId,
      phone,
      contactId,
      scheduledAt: new Date().toISOString(),
      channel: 'whatsapp',
    });

    expect(result).toBeNull();
  });

  it('proceeds with followup when followUpEnabled is true', async () => {
    mockPrisma.channelConfig.findUnique.mockResolvedValue({ followupEnabled: true });

    const result = await runFollowupContact({
      workspaceId: wsId,
      phone,
      contactId,
      scheduledAt: new Date().toISOString(),
      channel: 'whatsapp',
    });

    expect(result).not.toBeNull();
  });

  it('queries channelConfig with correct workspaceId and channel', async () => {
    mockPrisma.channelConfig.findUnique.mockResolvedValue({ followupEnabled: true });

    await runFollowupContact({
      workspaceId: wsId,
      phone,
      contactId,
      scheduledAt: new Date().toISOString(),
      channel: 'instagram',
    });

    expect(mockPrisma.channelConfig.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_channel: expect.objectContaining({
            workspaceId: wsId,
            channel: 'instagram',
          }),
        }),
      }),
    );
  });

  it('defaults channel to whatsapp when not provided', async () => {
    mockPrisma.channelConfig.findUnique.mockResolvedValue({ followupEnabled: true });

    await runFollowupContact({
      workspaceId: wsId,
      phone,
      contactId,
      scheduledAt: new Date().toISOString(),
    });

    expect(mockPrisma.channelConfig.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId_channel: expect.objectContaining({
            channel: 'whatsapp',
          }),
        }),
      }),
    );
  });

  it('continues execution when channelConfig lookup fails', async () => {
    mockPrisma.channelConfig.findUnique.mockRejectedValue(new Error('db error'));

    const result = await runFollowupContact({
      workspaceId: wsId,
      phone,
      contactId,
      scheduledAt: new Date().toISOString(),
    });

    expect(result).not.toBeNull();
  });
});
