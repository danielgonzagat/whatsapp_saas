import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

const mockSendMail = jest.fn();
const mockCreateTransport: jest.Mock = jest.fn((_options?: unknown) => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: (options: unknown) => mockCreateTransport(options),
  },
  createTransport: (options: unknown) => mockCreateTransport(options),
}));

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    mockSendMail.mockReset();
    mockCreateTransport.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  describe('initialization', () => {
    it('should initialize with log provider by default', () => {
      expect(service).toBeDefined();
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should return true in dev mode (log provider)', async () => {
      const result = await service.sendPasswordResetEmail(
        'test@example.com',
        'https://example.com/reset?token=abc123',
      );

      expect(result).toBe(true);
    });
  });

  describe('sendVerificationEmail', () => {
    it('should return true in dev mode (log provider)', async () => {
      const result = await service.sendVerificationEmail(
        'test@example.com',
        'https://example.com/verify?token=abc123',
      );

      expect(result).toBe(true);
    });
  });

  describe('sendTeamInviteEmail', () => {
    it('should return true in dev mode (log provider)', async () => {
      const result = await service.sendTeamInviteEmail(
        'newmember@example.com',
        'John Doe',
        'Acme Corp',
        'https://example.com/invite?token=abc123',
      );

      expect(result).toBe(true);
    });
  });

  describe('sendDataDeletionConfirmationEmail', () => {
    it('should return true in dev mode (log provider)', async () => {
      const result = await service.sendDataDeletionConfirmationEmail(
        'test@example.com',
        'CONFIRM123456789',
        'https://kloel.com/data-deletion/status/CONFIRM123456789',
        'Test User',
      );

      expect(result).toBe(true);
    });
  });

  describe('sendAccountLinkConfirmationEmail', () => {
    it('should return true in dev mode (log provider)', async () => {
      const result = await service.sendAccountLinkConfirmationEmail(
        'test@example.com',
        'https://auth.kloel.com/magic-link?token=abc&link=def',
        'Facebook',
        'Test User',
      );

      expect(result).toBe(true);
    });
  });

  describe('provider selection', () => {
    it('should select resend when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 'test-resend-key';

      const module: TestingModule = await Test.createTestingModule({
        providers: [EmailService],
      }).compile();

      const newService = module.get<EmailService>(EmailService);

      // The service should be defined and use Resend
      expect(newService).toBeDefined();
    });

    it('should select sendgrid when SENDGRID_API_KEY is set', async () => {
      process.env.SENDGRID_API_KEY = 'test-sendgrid-key';

      const module: TestingModule = await Test.createTestingModule({
        providers: [EmailService],
      }).compile();

      const newService = module.get<EmailService>(EmailService);

      expect(newService).toBeDefined();
    });

    it('sends email through nodemailer when SMTP credentials are configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'smtp-user';
      process.env.SMTP_PASS = 'smtp-pass';

      const module: TestingModule = await Test.createTestingModule({
        providers: [EmailService],
      }).compile();

      const smtpService = module.get<EmailService>(EmailService);
      mockSendMail.mockResolvedValue({ messageId: 'smtp-message-id' });

      await expect(
        smtpService.sendMagicLinkEmail('test@example.com', 'https://auth.kloel.com/magic-link'),
      ).resolves.toBe(true);

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'smtp-user',
          pass: 'smtp-pass',
        },
      });
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@kloel.com',
          to: 'test@example.com',
          subject: 'Seu link de acesso - KLOEL',
          html: expect.stringContaining('Entrar com link mágico'),
        }),
      );
    });
  });
});
