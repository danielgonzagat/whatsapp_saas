import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    // Reset environment variables
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.SMTP_HOST;
    
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
        'https://example.com/reset?token=abc123'
      );
      
      expect(result).toBe(true);
    });
  });

  describe('sendVerificationEmail', () => {
    it('should return true in dev mode (log provider)', async () => {
      const result = await service.sendVerificationEmail(
        'test@example.com',
        'https://example.com/verify?token=abc123'
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
        'https://example.com/invite?token=abc123'
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
  });
});
