import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: {
    productPlan: { findFirst: jest.Mock };
    kloelSale: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mpPix: { create: jest.Mock };
  let audit: { logWithTx: jest.Mock; log: jest.Mock };
  let spine: { emit: jest.Mock };

  const ws = 'ws-1';
  const buyer = {
    name: 'João',
    email: 'joao@test.com',
    cpf: '123.456.789-00',
    phone: '+5511999999999',
  };

  beforeEach(async () => {
    prisma = {
      productPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      kloelSale: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };
    mpPix = { create: jest.fn() };
    audit = { logWithTx: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
    spine = { emit: jest.fn().mockResolvedValue(undefined) };
    const m: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        { provide: MercadoPagoPixChargeService, useValue: mpPix },
        { provide: AuditService, useValue: audit },
        { provide: SpineEmitterService, useValue: spine },
      ],
    }).compile();
    service = m.get(SalesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createPixOrder', () => {
    const pid = 'prod-1';
    const plid = 'plan-1';
    const plan = {
      id: plid,
      productId: pid,
      name: 'Plano Pro',
      price: 99.9,
      active: true,
      product: { name: 'Produto X' },
    };
    const pixOk = {
      externalId: 'mp-ext',
      qrCode: 'qr',
      qrCodeBase64: 'b64',
      ticketUrl: 'url',
      status: 'pending',
    };
    const tx = () => ({
      kloelSale: {
        create: jest.fn().mockResolvedValue({
          id: 's1',
          workspaceId: ws,
          productName: 'X',
          amount: 99.9,
          status: 'pending',
          paymentMethod: 'PIX',
          leadPhone: buyer.phone,
          metadata: {},
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    it('creates PIX order returning QR data', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      const r = await service.createPixOrder(ws, pid, plid, buyer);
      expect(r.saleId).toBe('s1');
      expect(r.pixQrCode).toBe('qr');
      expect(r.pixCopyPaste).toBe('qr');
      expect(r.externalPaymentId).toBe('mp-ext');
      expect(r.pixExpiresAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when plan missing', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.createPixOrder(ws, pid, plid, buyer)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for cross-workspace', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(null);
      await expect(service.createPixOrder('ws-other', pid, plid, buyer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ServiceUnavailableException when price ≤ 0', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ ...plan, price: 0 });
      await expect(service.createPixOrder(ws, pid, plid, buyer)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException when price negative', async () => {
      prisma.productPlan.findFirst.mockResolvedValue({ ...plan, price: -5 });
      await expect(service.createPixOrder(ws, pid, plid, buyer)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('scopes sale to workspace', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(t.kloelSale.create.mock.calls[0][0].data.workspaceId).toBe(ws);
    });

    it('strips CPF formatting', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, { ...buyer, cpf: '123.456.789-00' });
      expect(mpPix.create).toHaveBeenCalledWith(
        expect.objectContaining({ payerDocument: '12345678900' }),
      );
    });

    it('omits payerDocument when CPF empty', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, { ...buyer, cpf: '' });
      expect(mpPix.create.mock.calls[0][0]).not.toHaveProperty('payerDocument');
    });

    it('audit-logs sale + payment pending', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(audit.logWithTx).toHaveBeenCalledTimes(2);
      expect(audit.logWithTx).toHaveBeenNthCalledWith(
        1,
        t,
        expect.objectContaining({ action: 'SALE_CREATED' }),
      );
      expect(audit.logWithTx).toHaveBeenNthCalledWith(
        2,
        t,
        expect.objectContaining({ action: 'PAYMENT_PENDING' }),
      );
    });

    it('emits sale.created + payment.pending spine events', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(spine.emit).toHaveBeenCalledTimes(2);
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'sale.created' }),
      );
      expect(spine.emit).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'payment.pending' }),
      );
    });

    it('survives spine failure', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      spine.emit.mockRejectedValue(new Error('down'));
      const r = await service.createPixOrder(ws, pid, plid, buyer);
      expect(r.saleId).toBe('s1');
    });

    it('persists external payment id', async () => {
      prisma.productPlan.findFirst.mockResolvedValue(plan);
      const t = tx();
      prisma.$transaction.mockImplementation(async (cb: any) => cb(t));
      mpPix.create.mockResolvedValue(pixOk);
      await service.createPixOrder(ws, pid, plid, buyer);
      expect(t.kloelSale.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ externalPaymentId: 'mp-ext' }) }),
      );
    });
  });

  describe('findById', () => {
    it('returns workspace-scoped sale', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue({ id: 's1', workspaceId: ws });
      expect((await service.findById(ws, 's1'))?.id).toBe('s1');
    });
    it('returns null for missing', async () => {
      prisma.kloelSale.findFirst.mockResolvedValue(null);
      expect(await service.findById(ws, 'nx')).toBeNull();
    });
  });

  describe('listByWorkspace', () => {
    it('returns desc-sorted sales', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([{ id: 's2' }, { id: 's1' }]);
      expect(await service.listByWorkspace(ws)).toHaveLength(2);
      expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 50 }),
      );
    });
    it('respects limit', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([]);
      await service.listByWorkspace(ws, 5);
      expect(prisma.kloelSale.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
    it('returns [] when empty', async () => {
      prisma.kloelSale.findMany.mockResolvedValue([]);
      expect(await service.listByWorkspace(ws)).toEqual([]);
    });
  });
});
