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
});
