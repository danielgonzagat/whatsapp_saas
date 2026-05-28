import { Test, TestingModule } from '@nestjs/testing';
import { ContactIdentityResolverService } from './contact-identity-resolver.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPartialPrismaMock, FlexMock } from '../../test/helpers/prisma.mock';

function makeContactStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    phone: 'whatsapp:5511999999999',
    name: 'Test Contact',
    email: null,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

function makeIdentifierStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ci-1',
    channel: 'WHATSAPP',
    value: '5511999999999',
    contactId: 'contact-1',
    workspaceId: 'ws-1',
    isPrimary: true,
    verifiedAt: null,
    ...overrides,
  };
}

describe('ContactIdentityResolverService', () => {
  let service: ContactIdentityResolverService;
  let prismaMock: ReturnType<typeof createPartialPrismaMock>;

  beforeEach(async () => {
    prismaMock = createPartialPrismaMock({
      channelIdentifier: ['findUnique', 'findFirst', 'create'],
      contact: ['create'],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactIdentityResolverService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<ContactIdentityResolverService>(ContactIdentityResolverService);
  });

  describe('resolve', () => {
    it('returns existing contact on exact ChannelIdentifier match', async () => {
      const contactStub = makeContactStub();
      const identifierStub = makeIdentifierStub({ contact: contactStub, verifiedAt: new Date() });

      prismaMock.channelIdentifier.findUnique.mockResolvedValue(identifierStub);

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'WHATSAPP',
        externalId: '5511999999999',
      });

      expect(result.contactId).toBe('contact-1');
      expect(result.wasCreated).toBe(false);
      expect(result.wasResolved).toBe(false);
      expect(result.channelIdentifierId).toBe('ci-1');
    });

    it('creates a new contact when no match exists', async () => {
      prismaMock.channelIdentifier.findUnique.mockResolvedValue(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValue(null);
      prismaMock.contact.create.mockResolvedValue(makeContactStub());
      prismaMock.channelIdentifier.create.mockResolvedValue(
        makeIdentifierStub({ verifiedAt: new Date() }),
      );

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'WHATSAPP',
        externalId: '5511999999999',
      });

      expect(result.wasCreated).toBe(true);
      expect(result.wasResolved).toBe(false);
      expect(result.contactId).toBeDefined();
    });

    it('cross-channel resolves by phone when a verified WHATSAPP identifier matches', async () => {
      const existingContact = makeContactStub({ id: 'contact-exist' });
      const verifiedWaId = makeIdentifierStub({
        id: 'ci-wa',
        channel: 'WHATSAPP',
        value: '5511999999999',
        contactId: 'contact-exist',
        verifiedAt: new Date(),
      });

      prismaMock.channelIdentifier.findUnique.mockResolvedValue(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValue({
        ...verifiedWaId,
        contact: existingContact,
      });
      prismaMock.channelIdentifier.create.mockResolvedValue(
        makeIdentifierStub({ contactId: 'contact-exist', isPrimary: false }),
      );

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'INSTAGRAM',
        externalId: 'ig-12345',
        phone: '5511999999999',
      });

      expect(result.wasResolved).toBe(true);
      expect(result.contactId).toBe('contact-exist');
      expect(result.resolveReason).toBe('phone_match');
    });

    it('cross-channel resolves by email when a verified EMAIL identifier matches', async () => {
      const existingContact = makeContactStub({ id: 'contact-eml' });
      const verifiedEmailId = makeIdentifierStub({
        id: 'ci-em',
        channel: 'EMAIL',
        value: 'test@example.com',
        contactId: 'contact-eml',
        verifiedAt: new Date(),
      });

      prismaMock.channelIdentifier.findUnique.mockResolvedValue(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValueOnce(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValueOnce({
        ...verifiedEmailId,
        contact: existingContact,
      });
      prismaMock.channelIdentifier.create.mockResolvedValue(
        makeIdentifierStub({ contactId: 'contact-eml', isPrimary: false }),
      );

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'WHATSAPP',
        externalId: '5511888888888',
        phone: '5511888888888',
        email: 'test@example.com',
      });

      expect(result.wasResolved).toBe(true);
      expect(result.contactId).toBe('contact-eml');
      expect(result.resolveReason).toBe('email_match');
    });

    it('does not cross-channel match when channelIdentifier is not verified', async () => {
      prismaMock.channelIdentifier.findUnique.mockResolvedValue(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValue(null);
      prismaMock.contact.create.mockResolvedValue(makeContactStub({ id: 'contact-new' }));
      prismaMock.channelIdentifier.create.mockResolvedValue(
        makeIdentifierStub({ id: 'ci-new', contactId: 'contact-new' }),
      );

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'INSTAGRAM',
        externalId: 'ig-99999',
        phone: '5511999999999',
      });

      expect(result.wasResolved).toBe(false);
      expect(result.wasCreated).toBe(true);
      expect(result.contactId).toBe('contact-new');
    });

    it('cross-channel resolves by social handle when a verified INSTAGRAM identifier matches', async () => {
      const existingContact = makeContactStub({ id: 'contact-ig' });
      const verifiedIgId = makeIdentifierStub({
        id: 'ci-ig',
        channel: 'INSTAGRAM',
        value: 'ig-handle-123',
        contactId: 'contact-ig',
        verifiedAt: new Date(),
      });

      prismaMock.channelIdentifier.findUnique.mockResolvedValue(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValue({
        ...verifiedIgId,
        contact: existingContact,
      });
      prismaMock.channelIdentifier.create.mockResolvedValue(
        makeIdentifierStub({ contactId: 'contact-ig', isPrimary: false }),
      );

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'WHATSAPP',
        externalId: '5511777777777',
        socialHandle: 'ig-handle-123',
      });

      expect(result.wasResolved).toBe(true);
      expect(result.contactId).toBe('contact-ig');
      expect(result.resolveReason).toBe('social_handle_match');
    });

    it('phone match takes priority over email match', async () => {
      const waContact = makeContactStub({ id: 'contact-wa' });
      const waId = makeIdentifierStub({
        id: 'ci-wa-match',
        channel: 'WHATSAPP',
        value: '5511999999999',
        contactId: 'contact-wa',
        verifiedAt: new Date(),
      });

      prismaMock.channelIdentifier.findUnique.mockResolvedValue(null);
      prismaMock.channelIdentifier.findFirst.mockResolvedValue({
        ...waId,
        contact: waContact,
      });
      prismaMock.channelIdentifier.create.mockResolvedValue(
        makeIdentifierStub({ contactId: 'contact-wa', isPrimary: false }),
      );

      const result = await service.resolve({
        workspaceId: 'ws-1',
        channel: 'MESSENGER',
        externalId: 'fb-12345',
        phone: '5511999999999',
        email: 'test@example.com',
      });

      expect(result.wasResolved).toBe(true);
      expect(result.contactId).toBe('contact-wa');
      expect(result.resolveReason).toBe('phone_match');
    });
  });
});
