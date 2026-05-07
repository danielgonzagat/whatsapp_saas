import { Test, TestingModule } from '@nestjs/testing';
import { ChannelIdentifierService } from './channel-identifier.service';
import { PrismaService } from '../prisma/prisma.service';

type FlexMock<T extends (...args: never[]) => unknown> = jest.Mock<ReturnType<T>, Parameters<T>> & {
  mockResolvedValue: (v: Awaited<ReturnType<T>>) => FlexMock<T>;
  mockResolvedValueOnce: (v: Awaited<ReturnType<T>>) => FlexMock<T>;
  mockRejectedValue: (e: unknown) => FlexMock<T>;
};

interface MockPrisma {
  channelIdentifier: {
    findUnique: FlexMock<(args: unknown) => unknown>;
    findFirst: FlexMock<(args: unknown) => unknown>;
    findMany: FlexMock<(args: unknown) => unknown>;
    create: FlexMock<(args: unknown) => unknown>;
    updateMany: FlexMock<(args: unknown) => unknown>;
    update: FlexMock<(args: unknown) => unknown>;
  };
  contact: {
    create: FlexMock<(args: unknown) => unknown>;
  };
  $transaction: FlexMock<(ops: unknown[]) => unknown>;
}

function makeContactStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    phone: 'whatsapp:5511999999999',
    name: 'João Silva',
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
    metadata: null,
    ...overrides,
  };
}

describe('ChannelIdentifierService', () => {
  let service: ChannelIdentifierService;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = {
      channelIdentifier: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      contact: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChannelIdentifierService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ChannelIdentifierService>(ChannelIdentifierService);
  });

  describe('resolve', () => {
    it('returns existing contact when ChannelIdentifier already exists', async () => {
      const contactStub = makeContactStub();
      const identifierStub = makeIdentifierStub({ contact: contactStub });

      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(identifierStub);

      const result = await service.resolve('WHATSAPP', '5511999999999', 'ws-1');

      expect(result.id).toBe('contact-1');
      expect(result.phone).toBe('whatsapp:5511999999999');
      expect(result.name).toBe('João Silva');
      expect(result.wasCreated).toBe(false);
      expect(result.channelIdentifierId).toBe('ci-1');
      expect(mockPrisma.channelIdentifier.findUnique).toHaveBeenCalledWith({
        where: {
          workspaceId_channel_value: {
            workspaceId: 'ws-1',
            channel: 'WHATSAPP',
            value: '5511999999999',
          },
        },
        include: { contact: true },
      });
    });

    it('creates new contact and identifier when none exists', async () => {
      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(null);

      const createdContact = makeContactStub({ phone: 'instagram:17841405822304611' });
      mockPrisma.contact.create.mockResolvedValue(createdContact);

      const createdIdentifier = makeIdentifierStub({
        channel: 'INSTAGRAM',
        value: '17841405822304611',
        contactId: 'contact-1',
      });
      mockPrisma.channelIdentifier.create.mockResolvedValue(createdIdentifier);

      const result = await service.resolve('INSTAGRAM', '17841405822304611', 'ws-1', {
        name: 'Maria',
      });

      expect(result.id).toBe('contact-1');
      expect(result.wasCreated).toBe(true);
      expect(mockPrisma.contact.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          phone: 'instagram:17841405822304611',
          name: 'Maria',
        },
      });
    });
  });

  describe('linkIdentifier', () => {
    it('links a new channel identifier to an existing contact', async () => {
      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(null);
      const createdIdentifier = makeIdentifierStub({
        channel: 'INSTAGRAM',
        value: '17841405822304611',
        isPrimary: false,
      });
      mockPrisma.channelIdentifier.create.mockResolvedValue(createdIdentifier);

      const result = await service.linkIdentifier(
        'INSTAGRAM',
        '17841405822304611',
        'contact-1',
        'ws-1',
      );

      expect(result.channel).toBe('INSTAGRAM');
      expect(result.value).toBe('17841405822304611');
      expect(result.contactId).toBe('contact-1');
      expect(result.isPrimary).toBe(false);
    });

    it('returns existing identifier if already linked to the same contact', async () => {
      const existingIdentifier = makeIdentifierStub({
        channel: 'INSTAGRAM',
        value: '17841405822304611',
        contactId: 'contact-1',
      });
      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(existingIdentifier);

      const result = await service.linkIdentifier(
        'INSTAGRAM',
        '17841405822304611',
        'contact-1',
        'ws-1',
      );

      expect(result.contactId).toBe('contact-1');
      expect(mockPrisma.channelIdentifier.create).not.toHaveBeenCalled();
    });

    it('throws when identifier is already linked to a different contact', async () => {
      const existingIdentifier = makeIdentifierStub({
        channel: 'INSTAGRAM',
        value: '17841405822304611',
        contactId: 'contact-other',
      });
      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(existingIdentifier);

      await expect(
        service.linkIdentifier('INSTAGRAM', '17841405822304611', 'contact-1', 'ws-1'),
      ).rejects.toThrow('already linked to contact');
    });
  });

  describe('findContactByChannel', () => {
    it('returns null when no identifier exists', async () => {
      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(null);

      const result = await service.findContactByChannel('WHATSAPP', '5511999999999', 'ws-1');

      expect(result).toBeNull();
    });

    it('returns resolved contact when identifier exists', async () => {
      const contactStub = makeContactStub();
      mockPrisma.channelIdentifier.findUnique.mockResolvedValue(
        makeIdentifierStub({ contact: contactStub }),
      );

      const result = await service.findContactByChannel('WHATSAPP', '5511999999999', 'ws-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('contact-1');
      expect(result!.wasCreated).toBe(false);
    });
  });

  describe('findByContact', () => {
    it('returns all identifiers for a contact ordered by primary desc', async () => {
      const identifiers = [
        makeIdentifierStub({ channel: 'WHATSAPP', isPrimary: true }),
        makeIdentifierStub({ id: 'ci-2', channel: 'INSTAGRAM', isPrimary: false }),
      ];
      mockPrisma.channelIdentifier.findMany.mockResolvedValue(identifiers);

      const result = await service.findByContact('ws-1', 'contact-1');

      expect(result).toHaveLength(2);
      expect(result[0].channel).toBe('WHATSAPP');
      expect(result[1].channel).toBe('INSTAGRAM');
      expect(mockPrisma.channelIdentifier.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', contactId: 'contact-1' },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('setPrimary', () => {
    it('sets the specified identifier as primary and clears others', async () => {
      mockPrisma.channelIdentifier.findFirst.mockResolvedValue(
        makeIdentifierStub({ contactId: 'contact-1' }),
      );
      mockPrisma.$transaction.mockResolvedValue(undefined);

      await service.setPrimary('ws-1', 'ci-2');

      expect(mockPrisma.channelIdentifier.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', contactId: 'contact-1' },
        data: { isPrimary: false },
      });
      expect(mockPrisma.channelIdentifier.updateMany).toHaveBeenCalledWith({
        where: { id: 'ci-2', workspaceId: 'ws-1' },
        data: { isPrimary: true },
      });
    });

    it('throws when identifier is not found', async () => {
      mockPrisma.channelIdentifier.findFirst.mockResolvedValue(null);

      await expect(service.setPrimary('ws-1', 'nonexistent')).rejects.toThrow('not found');
    });
  });
});
