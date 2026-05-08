import { EmailChannelTransport, TikTokChannelTransport } from './channel-transport.providers';
import type { ChannelName, ChannelTransportProvider } from './channel-transport.types';

describe('TikTokChannelTransport', () => {
  it('is never configured for outbound', () => {
    const transport = new TikTokChannelTransport();
    expect(transport.isConfigured()).toBe(false);
  });

  it('always reports send as blocked', async () => {
    const transport = new TikTokChannelTransport();
    const cap = await transport.capability('ws-1');
    expect(cap.sendAvailable).toBe(false);
    expect(cap.sendBlockedReason).toContain('nao suporta');
  });

  it('returns blocked result on send attempt', async () => {
    const transport = new TikTokChannelTransport();
    const result = await transport.send('ws-1', {
      workspaceId: 'ws-1',
      channel: 'tiktok',
      recipientId: 'user-1',
      content: 'Oi',
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
  });
});

describe('EmailChannelTransport', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_OUTBOUND_SMTP_HOST;
    delete process.env.EMAIL_OUTBOUND_SMTP_USER;
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  it('is not configured without email provider env vars', () => {
    const transport = new EmailChannelTransport();
    expect(transport.isConfigured()).toBe(false);
  });

  it('is configured when RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test';
    const transport = new EmailChannelTransport();
    expect(transport.isConfigured()).toBe(true);
  });

  it('is configured when SENDGRID_API_KEY is set', () => {
    process.env.SENDGRID_API_KEY = 'sg_test';
    const transport = new EmailChannelTransport();
    expect(transport.isConfigured()).toBe(true);
  });

  it('reports blocked capability when no provider is configured', async () => {
    const transport = new EmailChannelTransport();
    const cap = await transport.capability('ws-1');
    expect(cap.sendAvailable).toBe(false);
    expect(cap.sendBlockedReason).toContain('nao configurado');
  });

  it('reports available capability when RESEND_API_KEY is configured', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const transport = new EmailChannelTransport();
    const cap = await transport.capability('ws-1');
    expect(cap.sendAvailable).toBe(true);
    expect(cap.sendBlockedReason).toBeNull();
  });

  it('reports blocked capability when only SMTP is configured', async () => {
    process.env.EMAIL_OUTBOUND_SMTP_HOST = 'smtp.example.com';
    process.env.EMAIL_OUTBOUND_SMTP_USER = 'user';
    const transport = new EmailChannelTransport();
    const cap = await transport.capability('ws-1');
    expect(cap.sendAvailable).toBe(false);
    expect(cap.sendBlockedReason).toContain('SMTP');
  });

  it('returns blocked result when EmailCampaignService is not injected', async () => {
    const transport = new EmailChannelTransport();
    const result = await transport.send('ws-1', {
      workspaceId: 'ws-1',
      channel: 'email',
      recipientId: 'user@example.com',
      content: 'Oi',
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toContain('EmailCampaignService');
  });

  it('returns blocked result when no provider env var is set', async () => {
    const mockCampaign = { sendSingleEmail: jest.fn() };
    const transport = new EmailChannelTransport(mockCampaign as never);
    const result = await transport.send('ws-1', {
      workspaceId: 'ws-1',
      channel: 'email',
      recipientId: 'user@example.com',
      content: 'Oi',
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.blockedReason).toContain('nao configurado');
    expect(mockCampaign.sendSingleEmail).not.toHaveBeenCalled();
  });

  it('dispatches to EmailCampaignService when RESEND_API_KEY is configured', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const mockCampaign = { sendSingleEmail: jest.fn().mockResolvedValue(true) };
    const transport = new EmailChannelTransport(mockCampaign as never);
    const result = await transport.send('ws-1', {
      workspaceId: 'ws-1',
      channel: 'email',
      recipientId: 'user@example.com',
      content: 'Assunto da mensagem\nCorpo do email.',
    });
    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(mockCampaign.sendSingleEmail).toHaveBeenCalledWith(
      'user@example.com',
      'Assunto da mensagem',
      '<p>Corpo do email.</p>',
    );
  });

  it('propagates EmailCampaignService failure', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const mockCampaign = { sendSingleEmail: jest.fn().mockResolvedValue(false) };
    const transport = new EmailChannelTransport(mockCampaign as never);
    const result = await transport.send('ws-1', {
      workspaceId: 'ws-1',
      channel: 'email',
      recipientId: 'user@example.com',
      content: 'Oi',
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(false);
    expect(result.error).toBe('email_send_failed');
  });
});

describe('ChannelCapability shapes', () => {
  it.each(['tiktok', 'email'] as ChannelName[])(
    'provider for %s returns valid capability shape',
    async (channel) => {
      const provider: ChannelTransportProvider =
        channel === 'tiktok' ? new TikTokChannelTransport() : new EmailChannelTransport();
      const cap = await provider.capability('ws-1');

      expect(typeof cap.channel).toBe('string');
      expect(typeof cap.sendAvailable).toBe('boolean');
      expect(cap.sendBlockedReason === null || typeof cap.sendBlockedReason === 'string').toBe(
        true,
      );
      expect(Array.isArray(cap.requiredSetup)).toBe(true);

      if (!cap.sendAvailable) {
        expect(cap.sendBlockedReason).toBeTruthy();
        expect(cap.sendBlockedReason!.length).toBeGreaterThan(0);
      }
    },
  );
});
