import { IntentRouterService } from './intent-router.service';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';

/**
 * Integration test: IntentRouter + CapabilityRegistry
 *
 * Tests that the IntentRouter correctly classifies messages into capabilities.
 */function createTestFixture() {
  const registry = new CapabilityRegistryV2Service();
  const router = new IntentRouterService(registry);
  return { registry, router };
}describe('IntentRouter + CapabilityRegistry Integration', () => {
  const { registry, router } = createTestFixture();  it('registers all capabilities on init', () => {
    const caps = registry.list();
    expect(caps.length).toBeGreaterThanOrEqual(80);
    
    // Verify key capabilities exist
    const capIds = caps.map((c) => c.id);
    expect(capIds).toContain('products.create');
    expect(capIds).toContain('sales.create_pix');
    expect(capIds).toContain('self.capabilities');
    expect(capIds).toContain('plans.create');
    expect(capIds).toContain('checkouts.create');
    expect(capIds).toContain('coupons.create');
    expect(capIds).toContain('wallet.balance');
    expect(capIds).toContain('account.update_fiscal');
    expect(capIds).toContain('crm.pipeline');
  });  it('classifies product creation', () => {
    const result = router.classify('Cria um produto chamado PDRN por R$197', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('products.create');
    expect(result.classification?.confidence).toBeGreaterThanOrEqual(0.9);
  });  it('classifies product listing', () => {
    const result = router.classify('Lista meus produtos', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('list_products');
  });  it('classifies PIX generation', () => {
    const result = router.classify('Emite um PIX de R$197 para João comprar PDRN', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('generate_pix');
    expect(result.classification?.requiresConfirmation).toBe(true);
  });  it('classifies plan creation', () => {
    const result = router.classify('Cria um plano mensal para PDRN', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('plans.create');
  });  it('classifies checkout creation', () => {
    const result = router.classify('Cria um checkout para PDRN', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('checkouts.create');
  });  it('classifies coupon creation', () => {
    const result = router.classify('Cria cupom PDRN10 de 10%', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('coupons.create');
  });  it('classifies Boleto generation', () => {
    const result = router.classify('Gera um boleto para João', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('generate_boleto');
  });  it('classifies wallet balance query', () => {
    const result = router.classify('Qual meu saldo?', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('wallet.balance');
  });  it('classifies withdrawal request', () => {
    const result = router.classify('Quero sacar R$500', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('wallet.withdraw');
  });  it('classifies skills/gaps query', () => {
    const result = router.classify('O que voce consegue fazer?', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('self.capabilities');
  });  it('classifies health check', () => {
    const result = router.classify('Qual a saude do sistema?', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('self.health');
  });  it('classifies general chat', () => {
    const result = router.classify('Bom dia, tudo bem?', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(true);
  });  it('classifies report query', () => {
    const result = router.classify('Mostra relatorio de operacoes', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('reports.operations');
  });  it('classifies abandonment report', () => {
    const result = router.classify('Quantos carrinhos abandonados?', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('reports.abandonments');
  });  it('classifies CRM pipeline query', () => {
    const result = router.classify('Mostra meu pipeline CRM', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('list_leads');
  });  it('classifies theme toggle', () => {
    const result = router.classify('Muda para tema escuro', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('ui.theme');
    expect(result.classification?.entities.theme).toBe('dark');
  });  it('classifies account settings query', () => {
    const result = router.classify('Meus dados fiscais', 'dashboard-chat', ['*']);
    expect(result.isChat).toBe(false);
    expect(result.classification?.capabilityId).toBe('account.update_fiscal');
  });});
