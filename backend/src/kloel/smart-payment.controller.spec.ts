import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_METADATA } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ROUTE_CLASS_METADATA_KEY } from '../common/throttler/route-class.decorator';
import { SmartPaymentController, buildCreateSmartPaymentContext } from './smart-payment.controller';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { castMock } from '../../test/helpers/cast-mock';

function handlerOf(method: keyof SmartPaymentController): object {
  return Object.getOwnPropertyDescriptor(SmartPaymentController.prototype, method)?.value as object;
}
function guardsOf(method: keyof SmartPaymentController): unknown[] {
  return Reflect.getMetadata(GUARDS_METADATA, handlerOf(method)) as unknown[];
}
function isPublicHandler(method: keyof SmartPaymentController): boolean | undefined {
  return Reflect.getMetadata(IS_PUBLIC_METADATA, handlerOf(method)) as boolean | undefined;
}

describe('SmartPaymentController', () => {
  const createSmartPayment = jest.fn();
  const negotiatePayment = jest.fn();
  const analyzePaymentRecovery = jest.fn();
  const processPaymentConfirmation = jest.fn();
  const kloelSaleFindFirst = jest.fn();

  let controller: SmartPaymentController;

  const req = castMock<AuthenticatedRequest>({
    user: { sub: 'user-1', workspaceId: 'ws-1' },
    headers: {},
  });

  beforeEach(() => {
    jest.clearAllMocks();
    kloelSaleFindFirst.mockReturnValue({ catch: () => Promise.resolve(null) });

    controller = new SmartPaymentController(
      castMock({
        createSmartPayment,
        negotiatePayment,
        analyzePaymentRecovery,
        processPaymentConfirmation,
      }),
      castMock({ kloelSale: { findFirst: kloelSaleFindFirst } }),
    );
  });

  describe('route + governance wiring', () => {
    it('mounts under kloel/payment and is a mutate route class', () => {
      expect(Reflect.getMetadata('path', SmartPaymentController)).toBe('kloel/payment');
      expect(Reflect.getMetadata(ROUTE_CLASS_METADATA_KEY, SmartPaymentController)).toBe('mutate');
    });

    it('marks the public payment-details lookup as @Public()', () => {
      expect(isPublicHandler('getPaymentDetails')).toBe(true);
    });

    it('guards createSmartPayment with the JWT + workspace guards', () => {
      const guards = guardsOf('createSmartPayment');
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(WorkspaceGuard);
    });

    it('does NOT mark the authenticated createSmartPayment route as public', () => {
      expect(isPublicHandler('createSmartPayment')).toBeUndefined();
    });
  });

  describe('buildCreateSmartPaymentContext (DTO normalization)', () => {
    it('falls back from phone to customerPhone and from productName to description', () => {
      const ctx = buildCreateSmartPaymentContext('ws-1', {
        customerPhone: '5511999998888',
        customerName: 'Maria',
        amount: 100,
        description: 'Consultoria',
      });

      expect(ctx.workspaceId).toBe('ws-1');
      expect(ctx.phone).toBe('5511999998888');
      expect(ctx.productName).toBe('Consultoria');
    });

    it('rejects a non-PIX method that is not connected', () => {
      expect(() =>
        buildCreateSmartPaymentContext('ws-1', {
          customerName: 'Maria',
          amount: 100,
          method: 'BOLETO',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects an unknown payment method', () => {
      expect(() =>
        buildCreateSmartPaymentContext('ws-1', {
          customerName: 'Maria',
          amount: 100,
          method: 'crypto',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('getPaymentDetails (public fallback page)', () => {
    it('returns public-safe details (with PIX) for an unpaid sale', async () => {
      kloelSaleFindFirst.mockReturnValue({
        catch: () =>
          Promise.resolve({
            id: 'sale-1',
            externalPaymentId: 'pay_abc',
            amount: 100,
            productName: 'Plano Pro',
            status: 'PENDING',
            paymentMethod: 'PIX',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            paidAt: null,
            workspace: {
              name: 'Loja X',
              providerSettings: { payment: { pixKey: 'key@x', pixKeyType: 'EMAIL' } },
            },
          }),
      });

      const result = await controller.getPaymentDetails('pay_abc');

      expect(result.id).toBe('pay_abc');
      expect(result.companyName).toBe('Loja X');
      expect(result.pixKey).toBe('key@x');
    });

    it('omits the PIX key once the sale is paid', async () => {
      kloelSaleFindFirst.mockReturnValue({
        catch: () =>
          Promise.resolve({
            id: 'sale-2',
            amount: 100,
            status: 'paid',
            workspace: {
              name: 'Loja X',
              providerSettings: { payment: { pixKey: 'key@x' } },
            },
          }),
      });

      const result = await controller.getPaymentDetails('sale-2');

      expect(result.pixKey).toBeNull();
    });

    it('throws NotFound when the sale does not exist (honest 404)', async () => {
      kloelSaleFindFirst.mockReturnValue({ catch: () => Promise.resolve(null) });

      await expect(controller.getPaymentDetails('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSmartPayment', () => {
    it('delegates the normalized context to the service and returns the real result', async () => {
      createSmartPayment.mockResolvedValue({ paymentLink: 'https://pay/x', message: 'Olá' });

      const result = await controller.createSmartPayment(req, 'ws-1', {
        customerPhone: '5511999998888',
        customerName: 'Maria',
        amount: 100,
      });

      const ctx = castMock<[Record<string, unknown>][]>(createSmartPayment.mock.calls)[0]?.[0];
      expect(ctx.workspaceId).toBe('ws-1');
      expect(ctx.phone).toBe('5511999998888');
      expect(result).toEqual({ success: true, paymentLink: 'https://pay/x', message: 'Olá' });
    });
  });

  describe('negotiatePayment', () => {
    it('forwards the negotiation request and returns the service decision', async () => {
      negotiatePayment.mockResolvedValue({ discountApplied: true, finalAmount: 90 });

      const result = await controller.negotiatePayment(req, 'ws-1', {
        contactId: 'c-1',
        originalAmount: 100,
        contactMessage: 'tem desconto?',
      });

      expect(negotiatePayment).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'c-1',
        originalAmount: 100,
        contactMessage: 'tem desconto?',
      });
      expect(result).toEqual({ success: true, discountApplied: true, finalAmount: 90 });
    });
  });

  describe('processConfirmation', () => {
    it('forwards the gateway confirmation to the service and returns the result', async () => {
      processPaymentConfirmation.mockResolvedValue({ confirmed: true });

      const result = await controller.processConfirmation(req, 'ws-1', {
        paymentId: 'pay-1',
        status: 'CONFIRMED',
        amount: 100,
      });

      expect(processPaymentConfirmation).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        paymentId: 'pay-1',
        status: 'CONFIRMED',
        amount: 100,
      });
      expect(result).toEqual({ success: true, confirmed: true });
    });
  });
});
