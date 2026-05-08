import { Test, TestingModule } from '@nestjs/testing';
import { EmailInboundService, type InboundEmail } from './email-inbound.service';
import { OmnichannelService } from '../inbox/omnichannel.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailInboundService', () => {
  let service: EmailInboundService;
  let omnichannel: jest.Mocked<Partial<OmnichannelService>>;
  let prisma: {
    contact: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    omnichannel = {
      handleIncomingMessage: jest.fn().mockResolvedValue({ id: 'msg-01' }),
    };

    prisma = {
      contact: {
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailInboundService,
        { provide: OmnichannelService, useValue: omnichannel },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EmailInboundService>(EmailInboundService);
    delete process.env.EMAIL_INBOUND_SECRET;
    delete process.env.EMAIL_INBOUND_PROVIDER;
  });

  describe('isConfigured', () => {
    it('returns false when EMAIL_INBOUND_SECRET is not set', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('returns true when EMAIL_INBOUND_SECRET is set', () => {
      process.env.EMAIL_INBOUND_SECRET = 'test-secret-42';
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when EMAIL_INBOUND_SECRET is whitespace only', () => {
      process.env.EMAIL_INBOUND_SECRET = '   ';
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('returns null when EMAIL_INBOUND_PROVIDER is not set', () => {
      expect(service.getProvider()).toBeNull();
    });

    it('returns provider name when set', () => {
      process.env.EMAIL_INBOUND_PROVIDER = 'sendgrid';
      expect(service.getProvider()).toBe('sendgrid');
    });
  });

  describe('processInboundEmail', () => {
    const sampleEmail: InboundEmail = {
      from: 'cliente@example.com',
      fromName: 'Cliente Silva',
      to: 'suporte@kloel.com',
      subject: 'Duvida sobre o plano',
      bodyText: 'Ola, gostaria de saber mais sobre o plano premium.',
      messageId: '<abc123@mail.example.com>',
      timestamp: 1715000000000,
    };

    it('normalizes and routes an email to the omnichannel service', async () => {
      const result = await service.processInboundEmail('ws-1', sampleEmail);

      expect(omnichannel.handleIncomingMessage).toHaveBeenCalledTimes(1);
      const call = (omnichannel.handleIncomingMessage as jest.Mock).mock.calls[0][0];
      expect(call.channel).toBe('EMAIL');
      expect(call.workspaceId).toBe('ws-1');
      expect(call.from).toBe('cliente@example.com');
      expect(call.content).toContain('Assunto: Duvida sobre o plano');
      expect(call.content).toContain('Ola, gostaria de saber mais sobre o plano premium.');
      expect(call.externalId).toBe('<abc123@mail.example.com>');
      expect(call.metadata).toEqual({
        subject: 'Duvida sobre o plano',
        to: 'suporte@kloel.com',
        messageId: '<abc123@mail.example.com>',
        timestamp: 1715000000000,
      });

      expect(result.status).toBe('saved');
      expect(result.messageId).toBe('msg-01');
    });

    it('handles email with HTML body (strips tags and decodes entities)', async () => {
      const htmlEmail: InboundEmail = {
        from: 'cliente@example.com',
        to: 'suporte@kloel.com',
        subject: 'Teste HTML',
        bodyHtml: '<p>Ola <b>mundo</b> &amp; time &lt;3&gt;</p>',
      };

      await service.processInboundEmail('ws-1', htmlEmail);

      const call = (omnichannel.handleIncomingMessage as jest.Mock).mock.calls[0][0];
      expect(call.content).toContain('Ola mundo & time <3>');
    });

    it('handles email with attachments', async () => {
      const emailWithAtt: InboundEmail = {
        from: 'cliente@example.com',
        to: 'suporte@kloel.com',
        subject: 'Documento',
        bodyText: 'Segue anexo.',
        attachments: [
          {
            filename: 'nota.pdf',
            mimeType: 'application/pdf',
            contentBase64: 'cGRmX2RhdGE=',
          },
        ],
      };

      await service.processInboundEmail('ws-1', emailWithAtt);

      const call = (omnichannel.handleIncomingMessage as jest.Mock).mock.calls[0][0];
      expect(call.attachments).toHaveLength(1);
      expect(call.attachments?.[0].name).toBe('nota.pdf');
      expect(call.attachments?.[0].mimeType).toBe('application/pdf');
    });

    it('handles email with no subject', async () => {
      const noSubject: InboundEmail = {
        from: 'cliente@example.com',
        to: 'suporte@kloel.com',
        subject: '',
        bodyText: 'Mensagem sem assunto.',
      };

      await service.processInboundEmail('ws-1', noSubject);

      const call = (omnichannel.handleIncomingMessage as jest.Mock).mock.calls[0][0];
      expect(call.content).toContain('Sem assunto');
      expect(call.content).toContain('Mensagem sem assunto.');
    });

    it('enriches existing contact with email field when missing', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'ct-1',
        email: null,
        name: null,
      });

      await service.processInboundEmail('ws-1', sampleEmail);

      expect(prisma.contact.updateMany).toHaveBeenCalledWith({
        where: { id: 'ct-1', workspaceId: 'ws-1' },
        data: { email: 'cliente@example.com', name: 'Cliente Silva' },
      });
    });

    it('does not overwrite existing contact email field', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'ct-1',
        email: 'old@example.com',
        name: 'Existing Name',
      });

      await service.processInboundEmail('ws-1', sampleEmail);

      expect(prisma.contact.updateMany).not.toHaveBeenCalled();
    });

    it('rethrows when omnichannel processing fails', async () => {
      (omnichannel.handleIncomingMessage as jest.Mock).mockRejectedValueOnce(
        new Error('omnichannel down'),
      );

      await expect(service.processInboundEmail('ws-1', sampleEmail)).rejects.toThrow(
        'omnichannel down',
      );
    });

    it('continues processing when contact enrichment fails', async () => {
      prisma.contact.findUnique.mockRejectedValueOnce(new Error('db timeout'));

      await expect(service.processInboundEmail('ws-1', sampleEmail)).resolves.toEqual({
        status: 'saved',
        messageId: 'msg-01',
      });
      expect(omnichannel.handleIncomingMessage).toHaveBeenCalledTimes(1);
    });
  });
});
