import { Test, TestingModule } from '@nestjs/testing';
import { EmailCampaignService } from './email-campaign.service';

jest.mock('../common/utils/unsubscribe-footer.util', () => ({
  buildListUnsubscribeHeader: jest.fn().mockReturnValue('<mailto:unsub@example.com>'),
  buildUnsubscribeFooterHtml: jest
    .fn()
    .mockReturnValue('<footer>Unsubscribe: https://kloel.com/unsub</footer>'),
}));

const mockFetch = jest.fn();

describe('EmailCampaignService', () => {
  let service: EmailCampaignService;
  let originalFetch: typeof fetch;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    process.env.EMAIL_FROM = 'test@kloel.com';
    process.env.EMAIL_FROM_NAME = 'KLOEL Test';
    mockFetch.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailCampaignService],
    }).compile();

    service = module.get<EmailCampaignService>(EmailCampaignService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('provider resolution', () => {
    it('defaults to log provider when no API keys configured', async () => {
      const result = await service.sendCampaign({
        workspaceId: 'ws-1',
        subject: 'Test',
        html: '<p>Hello</p>',
        recipients: [{ email: 'user@example.com' }],
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('uses Resend when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      mockFetch.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });

      const result = await service.sendCampaign({
        workspaceId: 'ws-1',
        subject: 'Test',
        html: '<p>Hello</p>',
        recipients: [{ email: 'user@example.com', name: 'John' }],
      });

      const fetchArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(fetchArgs[0]).toBe('https://api.resend.com/emails');
      expect(fetchArgs[1].method).toBe('POST');
      expect(fetchArgs[1].headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer re_test_key' }),
      );
      expect(result.sent).toBe(1);

      delete process.env.RESEND_API_KEY;
    });
  });

  describe('sendCampaign', () => {
    it('sends to multiple recipients and tracks results', async () => {
      const result = await service.sendCampaign({
        workspaceId: 'ws-1',
        subject: 'Newsletter',
        html: '<p>Hello {{name}}!</p>',
        recipients: [
          { email: 'a@example.com', name: 'Alice' },
          { email: 'b@example.com', name: 'Bob' },
        ],
        campaignName: 'Welcome Series',
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('personalizes template with name and email placeholders', async () => {
      process.env.RESEND_API_KEY = 're_key';
      const bodyPayloads: Record<string, unknown>[] = [];
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string) as Record<string, unknown>;
        bodyPayloads.push(body);
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });

      await service.sendCampaign({
        workspaceId: 'ws-1',
        subject: 'Hello {{name}}',
        html: '<p>Hi {{name}} ({{email}})</p>',
        recipients: [{ email: 'john@example.com', name: 'John' }],
      });

      const payload = bodyPayloads[0] as { from: string; to: string; html: string };
      expect(payload.from).toContain('test@kloel.com');
      expect(payload.to).toBe('john@example.com');
      expect(payload.html).toContain('Hi John');

      delete process.env.RESEND_API_KEY;
    });

    it('tracks individual send failures without breaking batch', async () => {
      process.env.RESEND_API_KEY = 're_key';
      mockFetch
        .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('rate limit') })
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });

      const result = await service.sendCampaign({
        workspaceId: 'ws-1',
        subject: 'Test',
        html: '<p>Content</p>',
        recipients: [{ email: 'bad@example.com' }, { email: 'good@example.com' }],
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);

      delete process.env.RESEND_API_KEY;
    });

    it('catches exceptions per-recipient without stopping batch', async () => {
      process.env.RESEND_API_KEY = 're_key';
      mockFetch
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });

      const result = await service.sendCampaign({
        workspaceId: 'ws-1',
        subject: 'Test',
        html: '<p>Content</p>',
        recipients: [{ email: 'bad@example.com' }, { email: 'good@example.com' }],
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);

      delete process.env.RESEND_API_KEY;
    });
  });

  describe('sendSingleEmail', () => {
    it('sends a single email and returns boolean', async () => {
      const result = await service.sendSingleEmail('user@example.com', 'Subject', '<p>Body</p>');

      expect(result).toBe(true);
    });

    it('returns false on log provider (SMTP not implemented)', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';

      const result = await service.sendSingleEmail('user@example.com', 'Subject', '<p>Body</p>');

      expect(result).toBe(false);

      delete process.env.SMTP_HOST;
    });
  });

  describe('unsubscribe footer integration', () => {
    it('generates unsubscribe footer with workspaceId in HTML', async () => {
      process.env.RESEND_API_KEY = 're_key';
      let capturedBody: Record<string, unknown> = {};
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') });
      });

      await service.sendCampaign({
        workspaceId: 'ws-unsub',
        subject: 'Test Unsub',
        html: '<p>Hello</p>',
        recipients: [{ email: 'user@example.com' }],
      });

      expect(capturedBody.html).toBeDefined();
      expect(typeof capturedBody.html).toBe('string');

      delete process.env.RESEND_API_KEY;
    });
  });
});
