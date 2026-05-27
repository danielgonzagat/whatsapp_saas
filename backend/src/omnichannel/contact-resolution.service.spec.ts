import { Test, TestingModule } from '@nestjs/testing';
import { OmnichannelContactResolutionService } from './contact-resolution.service';
import { ChannelIdentifierService, ResolvedContact } from '../contacts/channel-identifier.service';
import { NormalizedMessage } from '../inbox/omnichannel.helpers';
import { type FlexMock } from '../../test/helpers/prisma.mock';

interface MockChannelIdentifierService {
  resolve: FlexMock<
    (
      channel: string,
      value: string,
      workspaceId: string,
      options?: Record<string, unknown>,
    ) => Promise<ResolvedContact>
  >;
  findContactByChannel: FlexMock<
    (channel: string, value: string, workspaceId: string) => Promise<ResolvedContact | null>
  >;
  linkIdentifier: FlexMock<
    (
      channel: string,
      value: string,
      contactId: string,
      workspaceId: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>
  >;
}

function makeResolvedContact(overrides: Partial<ResolvedContact> = {}): ResolvedContact {
  return {
    id: 'contact-1',
    phone: 'whatsapp:5511999999999',
    name: 'João Silva',
    email: null,
    workspaceId: 'ws-1',
    channelIdentifierId: 'ci-1',
    wasCreated: false,
    ...overrides,
  };
}

function makeWhatsAppMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    workspaceId: 'ws-1',
    channel: 'WHATSAPP',
    externalId: 'wamid-123',
    from: '5511999999999',
    fromName: 'João Silva',
    content: 'Olá!',
    ...overrides,
  };
}

function makeInstagramMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    workspaceId: 'ws-1',
    channel: 'INSTAGRAM',
    externalId: '17841405822304611',
    from: '17841405822304611',
    fromName: 'Maria Souza',
    content: 'Oi, quero saber sobre o produto',
    ...overrides,
  };
}

describe('OmnichannelContactResolutionService', () => {
  let service: OmnichannelContactResolutionService;
  let mockChannelIdentifier: MockChannelIdentifierService;

  beforeEach(async () => {
    mockChannelIdentifier = {
      resolve: jest.fn(),
      findContactByChannel: jest.fn(),
      linkIdentifier: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OmnichannelContactResolutionService,
        { provide: ChannelIdentifierService, useValue: mockChannelIdentifier },
      ],
    }).compile();

    service = module.get<OmnichannelContactResolutionService>(OmnichannelContactResolutionService);
  });

  describe('resolveFromMessage', () => {
    it('resolves WhatsApp message by phone number', async () => {
      const msg = makeWhatsAppMessage();
      const contact = makeResolvedContact();
      mockChannelIdentifier.resolve.mockResolvedValue(contact);

      const result = await service.resolveFromMessage(msg);

      expect(result.id).toBe('contact-1');
      expect(mockChannelIdentifier.resolve).toHaveBeenCalledWith(
        'WHATSAPP',
        '5511999999999',
        'ws-1',
        expect.objectContaining({
          name: 'João Silva',
          isPrimary: true,
          metadata: {
            rawFrom: '5511999999999',
            rawExternalId: 'wamid-123',
            channel: 'WHATSAPP',
          },
        }),
      );
    });

    it('resolves Instagram message by externalId', async () => {
      const msg = makeInstagramMessage();
      const contact = makeResolvedContact({ phone: 'instagram:17841405822304611' });
      mockChannelIdentifier.resolve.mockResolvedValue(contact);

      const result = await service.resolveFromMessage(msg);

      expect(result.id).toBe('contact-1');
      expect(mockChannelIdentifier.resolve).toHaveBeenCalledWith(
        'INSTAGRAM',
        '17841405822304611',
        'ws-1',
        expect.objectContaining({
          name: 'Maria Souza',
        }),
      );
    });

    it('creates new contact when identifier is unknown', async () => {
      const msg = makeInstagramMessage();
      const contact = makeResolvedContact({
        wasCreated: true,
        phone: 'instagram:17841405822304611',
      });
      mockChannelIdentifier.resolve.mockResolvedValue(contact);

      const result = await service.resolveFromMessage(msg);

      expect(result.wasCreated).toBe(true);
      expect(result.phone).toBe('instagram:17841405822304611');
    });
  });

  describe('findExisting', () => {
    it('finds existing contact by channel identifier', async () => {
      const contact = makeResolvedContact();
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(contact);

      const result = await service.findExisting('WHATSAPP', '5511999999999', 'wamid-123', 'ws-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('contact-1');
    });

    it('returns null when no contact found', async () => {
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(null);

      const result = await service.findExisting(
        'INSTAGRAM',
        '17841405822304611',
        '17841405822304611',
        'ws-1',
      );

      expect(result).toBeNull();
    });
  });

  describe('linkChannelToContact', () => {
    it('links a new channel to an existing contact', async () => {
      const linked = {
        id: 'ci-2',
        channel: 'INSTAGRAM',
        value: '17841405822304611',
        contactId: 'contact-1',
        workspaceId: 'ws-1',
        isPrimary: false,
        metadata: null,
      };
      mockChannelIdentifier.linkIdentifier.mockResolvedValue(linked);

      const result = await service.linkChannelToContact(
        'INSTAGRAM',
        '17841405822304611',
        '17841405822304611',
        'contact-1',
        'ws-1',
      );

      expect(result.channel).toBe('INSTAGRAM');
      expect(result.contactId).toBe('contact-1');
      expect(mockChannelIdentifier.linkIdentifier).toHaveBeenCalledWith(
        'INSTAGRAM',
        '17841405822304611',
        'contact-1',
        'ws-1',
        { isPrimary: false },
      );
    });
  });

  describe('channel value extraction', () => {
    it('uses from for WHATSAPP channel', async () => {
      const msg = makeWhatsAppMessage({ from: '5511988887777', externalId: 'wamid-456' });
      const contact = makeResolvedContact();
      mockChannelIdentifier.resolve.mockResolvedValue(contact);

      await service.resolveFromMessage(msg);

      expect(mockChannelIdentifier.resolve).toHaveBeenCalledWith(
        'WHATSAPP',
        '5511988887777',
        'ws-1',
        expect.anything(),
      );
    });

    it('uses from for EMAIL channel', async () => {
      const msg = makeWhatsAppMessage({
        channel: 'EMAIL',
        from: 'user@example.com',
        externalId: 'email-id-1',
      });
      const contact = makeResolvedContact();
      mockChannelIdentifier.resolve.mockResolvedValue(contact);

      await service.resolveFromMessage(msg);

      expect(mockChannelIdentifier.resolve).toHaveBeenCalledWith(
        'EMAIL',
        'user@example.com',
        'ws-1',
        expect.anything(),
      );
    });

    it('uses externalId for INSTAGRAM channel', async () => {
      const msg = makeInstagramMessage({ from: 'some-handle', externalId: '17841405822304611' });
      const contact = makeResolvedContact();
      mockChannelIdentifier.resolve.mockResolvedValue(contact);

      await service.resolveFromMessage(msg);

      expect(mockChannelIdentifier.resolve).toHaveBeenCalledWith(
        'INSTAGRAM',
        '17841405822304611',
        'ws-1',
        expect.anything(),
      );
    });
  });
});
