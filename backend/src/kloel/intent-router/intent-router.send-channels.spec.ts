import { IntentRouterService } from './intent-router.service';
import { CapabilityRegistryV2Service } from '../capability-registry-v2/capability-registry-v2.service';

/**
 * PI Task K13-A — Send-channel patterns + refund disambiguation spec.
 *
 * Covers the 4 new deterministic patterns (whatsapp.send, instagram.send_dm,
 * email.send, sales.fill_buyer_data) and the refund misroute fix
 * (verb-based "estornar/reembolsar" → sales.refund, noun-based "estornos"
 * stays list_refunds).
 */

function createTestFixture() {
  const registry = new CapabilityRegistryV2Service();
  const router = new IntentRouterService(registry);
  return { registry, router };
}

describe('IntentRouter — send-channel patterns (K13-A)', () => {
  const { router } = createTestFixture();

  // ── whatsapp.send ────────────────────────────────────────────
  describe('whatsapp.send', () => {
    const cases = [
      'manda zap pra João',
      'envia mensagem no whatsapp',
      'dispara msg via zap',
      'enviar uma mensagem no whats',
    ];

    for (const msg of cases) {
      it(`routes "${msg}" → whatsapp.send`, () => {
        const r = router.classify(msg, 'dashboard-chat', ['*']);
        expect(r.isChat).toBe(false);
        expect(r.classification?.capabilityId).toBe('whatsapp.send_message');
      });
    }
  });

  // ── instagram.send_dm ────────────────────────────────────────
  describe('instagram.send_dm', () => {
    const cases = [
      'dm no insta pro cliente',
      'manda direct via instagram',
      'mensagem no insta',
      'dm do instagram',
    ];

    for (const msg of cases) {
      it(`routes "${msg}" → instagram.send_dm`, () => {
        const r = router.classify(msg, 'dashboard-chat', ['*']);
        expect(r.isChat).toBe(false);
        expect(r.classification?.capabilityId).toBe('instagram.send_dm');
      });
    }
  });

  // ── email.send ───────────────────────────────────────────────
  describe('email.send', () => {
    const cases = ['manda email pra João', 'envia um e-mail agora', 'dispara e mail'];

    for (const msg of cases) {
      it(`routes "${msg}" → email.send`, () => {
        const r = router.classify(msg, 'dashboard-chat', ['*']);
        expect(r.isChat).toBe(false);
        expect(r.classification?.capabilityId).toBe('email.send');
      });
    }
  });

  // ── sales.fill_buyer_data ────────────────────────────────────
  describe('sales.fill_buyer_data', () => {
    const cases = [
      'pega os dados do comprador',
      'preenche os dados do cliente',
      'coleta dados de comprador',
      'preenche dados do cliente',
    ];

    for (const msg of cases) {
      it(`routes "${msg}" → sales.fill_buyer_data`, () => {
        const r = router.classify(msg, 'dashboard-chat', ['*']);
        expect(r.isChat).toBe(false);
        expect(r.classification?.capabilityId).toBe('sales.fill_buyer_data');
      });
    }
  });

  // ── sales.refund (verb-based mutation) ───────────────────────
  describe('sales.refund — verb-based mutation intent', () => {
    const cases = ['estornar venda', 'reembolsar pedido', 'cancelar venda', 'estorna essa venda'];

    for (const msg of cases) {
      it(`routes "${msg}" → sales.refund (NOT list_refunds)`, () => {
        const r = router.classify(msg, 'dashboard-chat', ['*']);
        expect(r.isChat).toBe(false);
        expect(r.classification?.capabilityId).toBe('sales.refund');
      });
    }
  });

  // ── list_refunds (noun-based read-only query) ────────────────
  describe('list_refunds — noun-based query preserved', () => {
    const cases = ['estornos', 'reembolsos', 'chargebacks', 'devolução'];

    for (const msg of cases) {
      it(`routes "${msg}" → list_refunds`, () => {
        const r = router.classify(msg, 'dashboard-chat', ['*']);
        expect(r.isChat).toBe(false);
        expect(r.classification?.capabilityId).toBe('list_refunds');
      });
    }
  });

  // ── Edge: email.send does NOT catch whatsapp phrases ─────────
  it('does not misroute whatsapp zap to email', () => {
    const r = router.classify('manda zap pra ele', 'dashboard-chat', ['*']);
    expect(r.isChat).toBe(false);
    expect(r.classification?.capabilityId).toBe('whatsapp.send_message');
  });

  // ── Edge: whatsapp.send does NOT catch "conectar whatsapp" ───
  it('does not misroute "conectar whatsapp" to send', () => {
    const r = router.classify('conectar whatsapp', 'dashboard-chat', ['*']);
    expect(r.isChat).toBe(false);
    expect(r.classification?.capabilityId).toBe('connect_whatsapp');
  });
});
