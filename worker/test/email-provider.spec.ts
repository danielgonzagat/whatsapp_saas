import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}));

const mailEnvKeys = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'];

function setMailEnv(overrides: Record<string, string | undefined>) {
  for (const k of mailEnvKeys) {
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe('email-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMailEnv({
      MAIL_HOST: 'smtp.test.com',
      MAIL_PORT: '587',
      MAIL_USER: 'user',
      MAIL_PASS: 'pass',
      MAIL_FROM: 'from@test.com',
    });
  });

  describe('name', () => {
    it('has name "email"', async () => {
      const { emailProvider } = await import('../providers/email-provider');
      expect(emailProvider.name).toBe('email');
    });
  });

  describe('sendText', () => {
    it('returns error for non-email target', async () => {
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendText({ id: 'ws1' }, '+5511999999999', 'Hello');
      expect(result).toEqual({ error: 'invalid_email_target' });
    });

    it('returns error when email not configured', async () => {
      setMailEnv({ MAIL_HOST: undefined });
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendText({ id: 'ws1' }, 'to@test.com', 'Hello');
      expect(result).toEqual({ error: 'email_not_configured' });
    });

    it('sends email successfully with subject from first line', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<abc@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendText(
        { id: 'ws1' },
        'to@test.com',
        'Subject line\nBody content',
      );
      expect(result).toEqual({ id: '<abc@test.com>', status: 'SENT' });
      const call = mockCreateTransport.mock.calls[0][0];
      expect(call.host).toBe('smtp.test.com');
      expect(call.port).toBe(587);
      expect(call.secure).toBe(false);
      expect(call.auth).toEqual({ user: 'user', pass: 'pass' });
    });

    it('uses first line as subject when short enough', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<def@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      await emailProvider.sendText({ id: 'ws1' }, 'to@test.com', 'Short\nRest');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Short', text: 'Rest' }),
      );
    });

    it('uses full message as body when single line', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<ghi@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      await emailProvider.sendText({ id: 'ws1' }, 'to@test.com', 'Single line');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Single line', text: 'Single line' }),
      );
    });

    it('uses "Nova mensagem" when first line is too long', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<long@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      const longLine = 'x'.repeat(105);
      await emailProvider.sendText({ id: 'ws1' }, 'to@test.com', `${longLine}\nBody`);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Nova mensagem' }),
      );
    });

    it('returns error string on send failure', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP error'));
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendText({ id: 'ws1' }, 'to@test.com', 'Hello');
      expect(result).toEqual({ error: 'SMTP error' });
    });

    it('returns error string for non-Error throws', async () => {
      mockSendMail.mockRejectedValue('bang');
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendText({ id: 'ws1' }, 'to@test.com', 'Hello');
      expect(result).toEqual({ error: 'bang' });
    });
  });

  describe('sendMedia', () => {
    it('returns error for non-email target', async () => {
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendMedia(
        { id: 'ws1' },
        '+5511999999999',
        'image',
        'https://example.com/img.jpg',
      );
      expect(result).toEqual({ error: 'invalid_email_target' });
    });

    it('returns error when email not configured', async () => {
      setMailEnv({ MAIL_HOST: undefined });
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendMedia(
        { id: 'ws1' },
        'to@test.com',
        'image',
        'https://example.com/img.jpg',
      );
      expect(result).toEqual({ error: 'email_not_configured' });
    });

    it('sends media as attachment', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<media@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendMedia(
        { id: 'ws1' },
        'to@test.com',
        'image',
        'https://example.com/img.jpg',
        'Check this',
      );
      expect(result).toEqual({ status: 'SENT' });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Arquivo enviado',
          text: 'Check this',
          attachments: [{ path: 'https://example.com/img.jpg' }],
        }),
      );
    });

    it('uses default caption when none provided', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<media@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      await emailProvider.sendMedia(
        { id: 'ws1' },
        'to@test.com',
        'image',
        'https://example.com/img.jpg',
      );
      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'Segue anexo.' }));
    });

    it('returns error on send failure', async () => {
      mockSendMail.mockRejectedValue(new Error('attach failed'));
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendMedia(
        { id: 'ws1' },
        'to@test.com',
        'image',
        'https://example.com/img.jpg',
      );
      expect(result).toEqual({ error: 'attach failed' });
    });
  });

  describe('sendTemplate', () => {
    it('falls back to sendText with template name', async () => {
      mockSendMail.mockResolvedValue({ messageId: '<tmpl@test.com>' });
      const { emailProvider } = await import('../providers/email-provider');
      const result = await emailProvider.sendTemplate(
        { id: 'ws1' },
        'to@test.com',
        'welcome',
        'pt_BR',
        [],
      );
      expect(result).toEqual({ id: '<tmpl@test.com>', status: 'SENT' });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Template: welcome' }),
      );
    });
  });
});
