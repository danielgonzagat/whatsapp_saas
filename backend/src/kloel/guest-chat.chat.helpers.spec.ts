import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import { IntentRouterService } from './intent-router/intent-router.service';
import { runDeterministicAction } from './guest-chat.chat.helpers';

describe('runDeterministicAction', () => {
  it('returns an honest execution failure for routed operational actions without falling back', async () => {
    const registry = new CapabilityRegistryV2Service();
    const intentRouter = new IntentRouterService(registry);
    const executeTool = jest.fn().mockRejectedValue(new Error('mercado_pago_down'));
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const reply = await runDeterministicAction(
      'Gera um PIX de R$197 para Joao comprar PDRN',
      'session-pix-fail',
      'ws-1',
      { executeTool } as never,
      intentRouter,
      undefined,
      undefined,
      new Map(),
      logger as never,
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith('ws-1', 'sales.create_pix', { amount: 197 });
    expect(reply).toContain('sales.create_pix');
    expect(reply).toContain('mercado_pago_down');
    expect(reply).toContain('não foi concluída');
  });

  it('requires confirmation before executing a sensitive routed action', async () => {
    const paymentArgs = {
      productId: 'prod-1',
      planId: 'plan-1',
      customerName: 'Joao',
      customerEmail: 'joao@test.com',
      customerCpf: '123.456.789-00',
    };
    const executeTool = jest.fn().mockResolvedValue({
      success: true,
      saleId: 'sale-pix-1',
      pixCopiaECola: '000201pix',
      pixQrCode: 'qr-base64',
    });
    const intentRouter = {
      classify: jest
        .fn()
        .mockReturnValueOnce({
          isChat: false,
          classification: {
            capabilityId: 'sales.create_pix',
            entities: paymentArgs,
            missingInputs: [],
            requiresConfirmation: true,
          },
        })
        .mockReturnValueOnce({ isChat: true }),
    };
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    const conversations = new Map();

    const confirmation = await runDeterministicAction(
      'Gera um PIX para Joao comprar PDRN',
      'session-confirm-pix',
      'ws-1',
      { executeTool } as never,
      intentRouter as never,
      undefined,
      undefined,
      conversations,
      logger as never,
    );

    expect(executeTool).not.toHaveBeenCalled();
    expect(confirmation).toContain('sales.create_pix');
    expect(confirmation).toContain('Confirma');

    const reply = await runDeterministicAction(
      'sim, confirma',
      'session-confirm-pix',
      'ws-1',
      { executeTool } as never,
      intentRouter as never,
      undefined,
      undefined,
      conversations,
      logger as never,
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith('ws-1', 'sales.create_pix', paymentArgs);
    expect(reply).toContain('PIX gerado');
    expect(reply).toContain('000201pix');
  });

  it('keeps boleto as an operational action failure without falling back', async () => {
    const registry = new CapabilityRegistryV2Service();
    const intentRouter = new IntentRouterService(registry);
    const executeTool = jest.fn().mockRejectedValue(new Error('mercado_pago_boleto_down'));
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const reply = await runDeterministicAction(
      'Emite boleto de R$197 para Joao comprar PDRN',
      'session-boleto-fail',
      'ws-1',
      { executeTool } as never,
      intentRouter,
      undefined,
      undefined,
      new Map(),
      logger as never,
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith('ws-1', 'sales.create_boleto', { amount: 197 });
    expect(reply).toContain('sales.create_boleto');
    expect(reply).toContain('mercado_pago_boleto_down');
    expect(reply).toContain('não foi concluída');
  });

  it('asks for missing Pix inputs instead of exposing an internal error code', async () => {
    const registry = new CapabilityRegistryV2Service();
    const intentRouter = new IntentRouterService(registry);
    const executeTool = jest.fn().mockResolvedValue({
      success: false,
      error: 'sales_create_pix_inputs_required',
      missingInputs: ['productId', 'planId', 'customerEmail', 'customerCpf'],
      message: 'Dados faltantes para criar PIX real: productId, planId, customerEmail, customerCpf',
    });
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const reply = await runDeterministicAction(
      'Gera um PIX de R$197 para Joao comprar PDRN',
      'session-pix-missing-inputs',
      'ws-1',
      { executeTool } as never,
      intentRouter,
      undefined,
      undefined,
      new Map(),
      logger as never,
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(reply).toContain('Dados faltantes para criar PIX real');
    expect(reply).toContain('productId');
    expect(reply).toContain('customerCpf');
    expect(reply).not.toContain('Erro: sales_create_pix_inputs_required');
  });

  it('asks for missing boleto inputs instead of exposing an internal error code', async () => {
    const registry = new CapabilityRegistryV2Service();
    const intentRouter = new IntentRouterService(registry);
    const executeTool = jest.fn().mockResolvedValue({
      success: false,
      error: 'sales_create_boleto_inputs_required',
      missingInputs: ['customerPhone', 'customerZipCode', 'customerStreet'],
      message: 'Dados faltantes para criar boleto real: customerPhone, customerZipCode, customerStreet',
    });
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    const reply = await runDeterministicAction(
      'Emite boleto de R$197 para Joao comprar PDRN',
      'session-boleto-missing-inputs',
      'ws-1',
      { executeTool } as never,
      intentRouter,
      undefined,
      undefined,
      new Map(),
      logger as never,
    );

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(reply).toContain('Dados faltantes para criar boleto real');
    expect(reply).toContain('customerPhone');
    expect(reply).toContain('customerZipCode');
    expect(reply).not.toContain('Erro: sales_create_boleto_inputs_required');
  });
});
