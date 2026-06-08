import { Test, TestingModule } from '@nestjs/testing';
import { OmnichannelContactResolutionService } from './contact-resolution.service';
import { ChannelIdentifierService, ResolvedContact } from '../contacts/channel-identifier.service';
import {
  ContactIdentityResolverService,
  IdentityResolveResult,
} from '../contacts/contact-identity-resolver.service';
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

interface MockContactIdentityResolverService {
  resolve: FlexMock<(params: unknown) => Promise<IdentityResolveResult>>;
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
  let mockIdentityResolver: MockContactIdentityResolverService;

  beforeEach(async () => {
    delete process.env.KLOEL_OMNI_CANONICAL_IDENTITY;
    mockChannelIdentifier = {
      resolve: jest.fn(),
      findContactByChannel: jest.fn(),
      linkIdentifier: jest.fn(),
    };
    mockIdentityResolver = {
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OmnichannelContactResolutionService,
        { provide: ChannelIdentifierService, useValue: mockChannelIdentifier },
        { provide: ContactIdentityResolverService, useValue: mockIdentityResolver },
      ],
    }).compile();

    service = module.get<OmnichannelContactResolutionService>(OmnichannelContactResolutionService);
  });

  afterEach(() => {
    delete process.env.KLOEL_OMNI_CANONICAL_IDENTITY;
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

  describe('canonical identity flag (KLOEL_OMNI_CANONICAL_IDENTITY)', () => {
    function makeIdentityResult(
      overrides: Partial<IdentityResolveResult> = {},
    ): IdentityResolveResult {
      return {
        contactId: 'contact-1',
        channelIdentifierId: 'ci-1',
        wasCreated: false,
        wasResolved: false,
        ...overrides,
      };
    }

    it('flag OFF: keeps the legacy channelIdentifier.resolve path, never touches the canonical resolver', async () => {
      delete process.env.KLOEL_OMNI_CANONICAL_IDENTITY;
      const msg = makeWhatsAppMessage();
      mockChannelIdentifier.resolve.mockResolvedValue(makeResolvedContact());

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
      expect(mockIdentityResolver.resolve).not.toHaveBeenCalled();
    });

    it('flag ON: delegates WhatsApp resolution to the canonical resolver with a phone cross-channel key', async () => {
      process.env.KLOEL_OMNI_CANONICAL_IDENTITY = 'true';
      const msg = makeWhatsAppMessage();
      mockIdentityResolver.resolve.mockResolvedValue(makeIdentityResult({ wasResolved: true }));
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(makeResolvedContact());

      const result = await service.resolveFromMessage(msg);

      expect(result.id).toBe('contact-1');
      expect(mockIdentityResolver.resolve).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        channel: 'WHATSAPP',
        externalId: '5511999999999',
        phone: '5511999999999',
      });
      expect(mockChannelIdentifier.findContactByChannel).toHaveBeenCalledWith(
        'WHATSAPP',
        '5511999999999',
        'ws-1',
      );
      // Canonical find-or-create path is taken, NOT the legacy resolve.
      expect(mockChannelIdentifier.resolve).not.toHaveBeenCalled();
    });

    it('flag ON: uses an email cross-channel key for EMAIL channel', async () => {
      process.env.KLOEL_OMNI_CANONICAL_IDENTITY = 'true';
      const msg = makeWhatsAppMessage({
        channel: 'EMAIL',
        from: 'user@example.com',
        externalId: 'email-id-1',
      });
      mockIdentityResolver.resolve.mockResolvedValue(makeIdentityResult());
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(
        makeResolvedContact({ phone: 'email:user@example.com' }),
      );

      await service.resolveFromMessage(msg);

      expect(mockIdentityResolver.resolve).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        channel: 'EMAIL',
        externalId: 'user@example.com',
        email: 'user@example.com',
      });
    });

    it('flag ON: uses a socialHandle cross-channel key for INSTAGRAM channel', async () => {
      process.env.KLOEL_OMNI_CANONICAL_IDENTITY = 'true';
      const msg = makeInstagramMessage();
      mockIdentityResolver.resolve.mockResolvedValue(makeIdentityResult());
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(
        makeResolvedContact({ phone: 'instagram:17841405822304611' }),
      );

      await service.resolveFromMessage(msg);

      expect(mockIdentityResolver.resolve).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        channel: 'INSTAGRAM',
        externalId: '17841405822304611',
        socialHandle: '17841405822304611',
      });
    });

    it('flag ON: propagates wasCreated from the canonical result onto the materialized contact', async () => {
      process.env.KLOEL_OMNI_CANONICAL_IDENTITY = 'true';
      const msg = makeInstagramMessage();
      mockIdentityResolver.resolve.mockResolvedValue(makeIdentityResult({ wasCreated: true }));
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(
        makeResolvedContact({ wasCreated: false, phone: 'instagram:17841405822304611' }),
      );

      const result = await service.resolveFromMessage(msg);

      expect(result.wasCreated).toBe(true);
      expect(result.phone).toBe('instagram:17841405822304611');
    });

    it('flag ON but resolver materialisation misses: falls back to the legacy resolve path', async () => {
      process.env.KLOEL_OMNI_CANONICAL_IDENTITY = 'true';
      const msg = makeWhatsAppMessage();
      mockIdentityResolver.resolve.mockResolvedValue(makeIdentityResult());
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(null);
      mockChannelIdentifier.resolve.mockResolvedValue(makeResolvedContact());

      const result = await service.resolveFromMessage(msg);

      expect(result.id).toBe('contact-1');
      expect(mockChannelIdentifier.resolve).toHaveBeenCalled();
    });
  });

  describe('findExisting', () => {
    it('finds existing contact by channel identifier', async () => {
      const contact = makeResolvedContact();
      mockChannelIdentifier.findContactByChannel.mockResolvedValue(contact);

      const result = await service.findExisting('WHATSAPP', '5511999999999', 'wamid-123', 'ws-1');

      expect(result).not.toBeNull();
      expect(result.id).toBe('contact-1');
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
