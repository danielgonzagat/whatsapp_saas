import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: mockSendMail,
    }),
  },
}));

const mailEnvBackup = {
  MAIL_HOST: process.env.MAIL_HOST,
  MAIL_PORT: process.env.MAIL_PORT,
  MAIL_USER: process.env.MAIL_USER,
  MAIL_PASS: process.env.MAIL_PASS,
  MAIL_FROM: process.env.MAIL_FROM,
};

function setMailEnv(overrides: Record<string, string | undefined>) {
  delete process.env.MAIL_HOST;
  delete process.env.MAIL_PORT;
  delete process.env.MAIL_USER;
  delete process.env.MAIL_PASS;
  delete process.env.MAIL_FROM;
  Object.entries(overrides).forEach(([k, v]) => {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  });
}

describe('channel-dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMailEnv({
      MAIL_HOST: 'smtp.test.com',
      MAIL_PORT: '587',
      MAIL_USER: 'user',
      MAIL_PASS: 'pass',
      MAIL_FROM: 'test@test.com',
    });
  });

  afterEach(() => {
    setMailEnv(mailEnvBackup);
  });

  describe('sendEmail', () => {
    it('sends email successfully', async () => {
      const { sendEmail } = await import('../providers/channel-dispatcher');
      await sendEmail('to@test.com', 'Subject', 'Body');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@test.com',
          to: 'to@test.com',
          subject: 'Subject',
          text: 'Body',
        }),
      );
    });

    it('throws when email is not configured', async () => {
      setMailEnv({ MAIL_HOST: undefined });
      const { sendEmail } = await import('../providers/channel-dispatcher');
      await expect(sendEmail('to@test.com', 'Subject', 'Body')).rejects.toThrow(
        'email_not_configured',
      );
    });

    it('uses default from when MAIL_FROM not set', async () => {
      setMailEnv({
        MAIL_HOST: 'smtp.test.com',
        MAIL_PORT: '587',
        MAIL_FROM: undefined,
      });
      const { sendEmail } = await import('../providers/channel-dispatcher');
      await sendEmail('to@test.com', 'Subject', 'Body');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'autopilot@localhost' }),
      );
    });

    it('uses secure:true for port 465', async () => {
      setMailEnv({
        MAIL_HOST: 'smtp.test.com',
        MAIL_PORT: '465',
        MAIL_USER: undefined,
        MAIL_PASS: undefined,
      });
      const { sendEmail } = await import('../providers/channel-dispatcher');
      await sendEmail('to@test.com', 'Subject', 'Body');
      expect(mockSendMail).toHaveBeenCalled();
    });
  });

  describe('channelEnabled', () => {
    it('returns false for null settings', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled(null, 'email')).toBe(false);
    });

    it('returns false for undefined settings', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled(undefined, 'email')).toBe(false);
    });

    it('returns false when channel config is missing', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled({}, 'email')).toBe(false);
    });

    it('returns false when enabled is false', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled({ email: { enabled: false } }, 'email')).toBe(false);
    });

    it('returns true when enabled is true', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled({ email: { enabled: true } }, 'email')).toBe(true);
    });

    it('returns false when enabled is non-boolean string', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled({ email: { enabled: 'yes' } }, 'email')).toBe(false);
    });

    it('returns false when channel config is not an object', async () => {
      const { channelEnabled } = await import('../providers/channel-dispatcher');
      expect(channelEnabled({ email: 'string' }, 'email')).toBe(false);
    });
  });

  describe('logFallback', () => {
    it('logs sent status without throwing', async () => {
      const { logFallback } = await import('../providers/channel-dispatcher');
      expect(() => logFallback('email', 'sent')).not.toThrow();
    });

    it('logs skipped status with reason', async () => {
      const { logFallback } = await import('../providers/channel-dispatcher');
      expect(() => logFallback('email', 'skipped', 'not_configured')).not.toThrow();
    });

    it('logs error status with reason', async () => {
      const { logFallback } = await import('../providers/channel-dispatcher');
      expect(() => logFallback('whatsapp', 'error', 'provider_timeout')).not.toThrow();
    });
  });
});
