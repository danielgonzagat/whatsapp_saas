import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductService } from './product.service';
import { MindEventSpine } from '../kloel/mind/coordination/mind-event-spine.service';

type ProductCreateArgs = { data: Record<string, unknown> };
type ProductUpdateArgs = { where: { id: string }; data: Record<string, unknown> };

function objectContaining<T extends object>(sample: T): T {
  return expect.objectContaining(sample) as T;
}

function anyArray(): unknown[] {
  return expect.arrayContaining([]) as unknown[];
}

function anyObject(): object {
  return expect.objectContaining({}) as object;
}

describe('ProductService', () => {
  let service: ProductService;
  let prisma: {
    product: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };
  let eventEmitter: { emit: jest.Mock };
  let audit: { log: jest.Mock };
  let brainSpine: { recordCommercial: jest.Mock };

  const ws = 'ws-1';
  const actor = { id: 'agent-1', email: 'a@b.com' };
  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: 'prod-1',
    workspaceId: ws,
    name: 'Test',
    description: 'Desc',
    price: 99.9,
    category: 'cat',
    sku: 'SKU-1',
    format: 'PHYSICAL',
    status: 'DRAFT',
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      product: {
        create: jest.fn().mockImplementation(({ data }: ProductCreateArgs) =>
          Promise.resolve({
            id: 'prod-1',
            workspaceId: ws,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }: ProductUpdateArgs) =>
          Promise.resolve({
            id: where.id,
            workspaceId: ws,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      },
    };
    eventEmitter = { emit: jest.fn() };
    audit = { log: jest.fn() };
    brainSpine = { recordCommercial: jest.fn().mockResolvedValue('event-1') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AuditService, useValue: audit },
        { provide: MindEventSpine, useValue: brainSpine },
      ],
    }).compile();
    service = module.get(ProductService);
  });

  describe('create', () => {
    it('creates a product with DRAFT status and emits event', async () => {
      const dto = { name: 'Widget', price: 49.99, format: 'DIGITAL' as const };
      const result = await service.create(ws, dto, actor);
      expect(result.success).toBe(true);
      expect(result.product?.name).toBe('Widget');
      expect(result.product?.status).toBe('DRAFT');
      expect(result.product?.active).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'mind.product.observed',
        objectContaining({ productId: 'prod-1' }),
      );
      expect(audit.log).toHaveBeenCalledWith(objectContaining({ action: 'product.create' }));
    });

    it('clamps an APPROVED/active create down to the pending-review state', async () => {
      // Approval must flow through publish()/reviewAndPublish(), not a raw create.
      // A caller that supplies status:'APPROVED'/active:true must NOT mint a live
      // product — it is forced into the review queue instead.
      const dto = {
        name: 'Widget publicado',
        price: 49.99,
        format: 'DIGITAL' as const,
        status: 'APPROVED',
        active: true,
      } as never;

      const result = await service.create(ws, dto, actor);

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: objectContaining({ status: 'PENDING', active: false }),
      });
      expect(result.product?.status).toBe('PENDING');
      expect(result.product?.active).toBe(false);
    });

    it('never activates a product on create even when active:true is supplied without APPROVED', async () => {
      const dto = {
        name: 'Widget rascunho ativo',
        price: 19.99,
        status: 'DRAFT',
        active: true,
      } as never;

      const result = await service.create(ws, dto, actor);

      expect(result.product?.status).toBe('DRAFT');
      expect(result.product?.active).toBe(false);
    });

    it('strips physical/marketing wizard-only fields that are not Product columns', async () => {
      await service.create(
        ws,
        {
          name: 'Produto físico',
          price: 99.9,
          format: 'PHYSICAL',
          packageType: 'box',
          width: 10,
          height: 20,
          depth: 5,
          weight: 1.2,
          shippingResponsible: 'producer',
          dispatchTime: 3,
          carriers: ['correios'],
          facebookPixelId: 'fb-123',
          googleTagManagerId: 'gtm-456',
        } as never,
        actor,
      );

      const [createCall] = prisma.product.create.mock.calls as [ProductCreateArgs][];
      const createData = createCall[0].data;
      for (const wizardOnlyKey of [
        'packageType',
        'width',
        'height',
        'depth',
        'weight',
        'shippingResponsible',
        'dispatchTime',
        'carriers',
        'facebookPixelId',
        'googleTagManagerId',
      ]) {
        expect(createData).not.toHaveProperty(wizardOnlyKey);
      }
    });

    it('maps rich affiliate wizard fields before writing the product', async () => {
      await service.create(
        ws,
        {
          name: 'Widget afiliado',
          price: 49.99,
          affiliateApprovalMode: 'manual',
          affiliateCommissionPercent: 35.5,
          affiliatesEnabled: true,
        } as never,
        actor,
      );

      const [createCall] = prisma.product.create.mock.calls as [ProductCreateArgs][];
      const createData = createCall[0].data;
      expect(createData).toMatchObject({
        affiliateAutoApprove: false,
        affiliateEnabled: true,
        commissionPercent: 35.5,
      });
      expect(createData).not.toHaveProperty('affiliateApprovalMode');
      expect(createData).not.toHaveProperty('affiliateCommissionPercent');
      expect(createData).not.toHaveProperty('affiliatesEnabled');
    });

    it('throws ForbiddenException when workspaceId is empty', async () => {
      await expect(service.create('', { name: 'X', price: 10 }, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('updates a product in the same workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      const result = await service.update(ws, 'prod-1', { name: 'Updated' }, actor);
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.updated', anyObject());
    });

    it('records product edits in the commercial spine', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ name: 'Updated' }));

      await service.update(ws, 'prod-1', { name: 'Updated' }, actor);

      expect(brainSpine.recordCommercial).toHaveBeenCalledWith(
        objectContaining({
          workspaceId: ws,
          subject: 'product:prod-1',
          eventType: 'product.updated',
          payload: objectContaining({
            productId: 'prod-1',
            name: 'Updated',
            changes: ['name'],
          }),
        }),
      );
    });

    it('throws NotFoundException when product missing', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.update(ws, 'prod-missing', { name: 'X' }, actor)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException for cross-workspace access', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'ws-other' }));
      await expect(service.update(ws, 'prod-1', { name: 'X' }, actor)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findById', () => {
    it('returns product scoped to workspace', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      const result = await service.findById(ws, 'prod-1');
      expect(result?.id).toBe('prod-1');
      expect(prisma.product.findFirst).toHaveBeenCalledWith(
        objectContaining({ where: { id: 'prod-1', workspaceId: ws } }),
      );
    });

    it('returns null when not found', async () => {
      prisma.product.findFirst.mockResolvedValue(null);
      const result = await service.findById(ws, 'prod-none');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns paginated products with count', async () => {
      prisma.product.findMany.mockResolvedValue([makeProduct(), makeProduct({ id: 'prod-2' })]);
      prisma.product.count.mockResolvedValue(2);
      const result = await service.list(ws, { page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.products).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.page).toBe(1);
    });

    it('applies search filter', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);
      await service.list(ws, { search: 'widget' });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({ OR: anyArray() }),
        }),
      );
    });

    it('applies category and status filters', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);
      await service.list(ws, { category: 'cat', status: 'APPROVED', active: true });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({ category: 'cat', status: 'APPROVED', active: true }),
        }),
      );
    });
  });

  describe('setImage', () => {
    it('updates imageUrl on the product', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(
        makeProduct({ imageUrl: 'https://img.example/pic.png' }),
      );
      const result = await service.setImage(ws, 'prod-1', 'https://img.example/pic.png', {
        id: 'agent-1',
      });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'product.updated',
        objectContaining({ productId: 'prod-1', changes: ['imageUrl'] }),
      );
      expect(audit.log).toHaveBeenCalledWith(objectContaining({ action: 'product.setImage' }));
    });

    it('refuses image updates across workspaces', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'ws-other' }));

      await expect(
        service.setImage(ws, 'prod-1', 'https://img.example/pic.png', { id: 'agent-1' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(brainSpine.recordCommercial).not.toHaveBeenCalled();
    });

    it('records image updates in the commercial spine', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(
        makeProduct({ imageUrl: 'https://img.example/pic.png' }),
      );

      await service.setImage(ws, 'prod-1', 'https://img.example/pic.png', { id: 'agent-1' });

      expect(brainSpine.recordCommercial).toHaveBeenCalledWith(
        objectContaining({
          workspaceId: ws,
          subject: 'product:prod-1',
          eventType: 'product.updated',
          payload: objectContaining({
            productId: 'prod-1',
            imageUrl: 'https://img.example/pic.png',
            changes: ['imageUrl'],
          }),
        }),
      );
    });
  });

  describe('publish', () => {
    it('sets status to APPROVED and active to true', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ status: 'APPROVED', active: true }));
      const result = await service.publish(ws, 'prod-1', { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.published', anyObject());
    });

    it('refuses to publish a product from another workspace', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'ws-other' }));

      await expect(service.publish(ws, 'prod-1', { id: 'agent-1' })).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('product.published', anyObject());
      expect(brainSpine.recordCommercial).not.toHaveBeenCalled();
    });

    it('records published products in the commercial spine', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ status: 'APPROVED', active: true }));

      await service.publish(ws, 'prod-1', { id: 'agent-1' });

      expect(brainSpine.recordCommercial).toHaveBeenCalledWith(
        objectContaining({
          workspaceId: ws,
          subject: 'product:prod-1',
          eventType: 'product.published',
          payload: objectContaining({
            productId: 'prod-1',
            name: 'Test',
            status: 'APPROVED',
            active: true,
          }),
        }),
      );
    });
  });

  describe('toggleAvailability', () => {
    it('activates a product', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ active: true }));
      const result = await service.toggleAvailability(ws, 'prod-1', true, { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.activated', anyObject());
    });

    it('deactivates a product', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ active: false }));
      const result = await service.toggleAvailability(ws, 'prod-1', false, { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.deactivated', anyObject());
    });

    it('refuses availability changes across workspaces', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'ws-other' }));

      await expect(
        service.toggleAvailability(ws, 'prod-1', true, { id: 'agent-1' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(brainSpine.recordCommercial).not.toHaveBeenCalled();
    });

    it('records availability changes in the commercial spine', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ active: true }));

      await service.toggleAvailability(ws, 'prod-1', true, { id: 'agent-1' });

      expect(brainSpine.recordCommercial).toHaveBeenCalledWith(
        objectContaining({
          workspaceId: ws,
          subject: 'product:prod-1',
          eventType: 'product.updated',
          payload: objectContaining({
            productId: 'prod-1',
            active: true,
            changes: ['active'],
          }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('soft-deletes a product (sets status to DELETED)', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ status: 'DELETED', active: false }));
      const result = await service.delete(ws, 'prod-1', { id: 'agent-1' });
      expect(result.success).toBe(true);
      expect(eventEmitter.emit).toHaveBeenCalledWith('product.deleted', anyObject());
    });

    it('refuses deletion across workspaces', async () => {
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'ws-other' }));

      await expect(service.delete(ws, 'prod-1', { id: 'agent-1' })).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.product.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('product.deleted', anyObject());
      expect(brainSpine.recordCommercial).not.toHaveBeenCalled();
    });

    it('records product deletion in the commercial spine', async () => {
      prisma.product.findFirst.mockResolvedValue(makeProduct());
      prisma.product.update.mockResolvedValue(makeProduct({ status: 'DELETED', active: false }));

      await service.delete(ws, 'prod-1', { id: 'agent-1' });

      expect(brainSpine.recordCommercial).toHaveBeenCalledWith(
        objectContaining({
          workspaceId: ws,
          subject: 'product:prod-1',
          eventType: 'product.deleted',
          payload: objectContaining({
            productId: 'prod-1',
            status: 'DELETED',
            active: false,
          }),
        }),
      );
    });
  });
});
