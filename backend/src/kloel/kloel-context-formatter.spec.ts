import { KloelContextFormatter, type KloelContextFormatterLimits } from './kloel-context-formatter';

const TEST_LIMITS: KloelContextFormatterLimits = {
  workspaceProductPlanLimit: 3,
  workspaceProductUrlLimit: 3,
  workspaceProductReviewLimit: 3,
  workspaceProductCheckoutLimit: 3,
  workspaceProductCouponLimit: 3,
  workspaceProductCampaignLimit: 3,
  workspaceProductCommissionLimit: 3,
  workspaceAffiliateContextLimit: 3,
  workspaceInvoiceContextLimit: 3,
  workspaceExternalLinkContextLimit: 3,
  workspaceIntegrationContextLimit: 3,
  workspaceCustomerSubscriptionContextLimit: 3,
  workspacePhysicalOrderContextLimit: 3,
  workspacePaymentContextLimit: 3,
  workspaceAffiliatePartnerContextLimit: 3,
};

describe('KloelContextFormatter', () => {
  const formatter = new KloelContextFormatter(TEST_LIMITS);

  it('sanitizes the assistant user name to the first valid token', () => {
    expect(formatter.sanitizeUserNameForAssistant('  Daniel   Gonzaga  ')).toBe('Daniel');
    expect(formatter.sanitizeUserNameForAssistant('')).toBe('Usuário');
  });

  it('builds a compact workspace product context with nested commercial sections', () => {
    const context = formatter.buildWorkspaceProductContext(
      {
        name: 'Coreamy PDRN',
        active: true,
        status: 'ACTIVE',
        featured: true,
        price: 423.6,
        currency: 'BRL',
        format: 'PHYSICAL',
        category: 'Saúde',
        description: 'Tratamento premium com envio imediato.',
        sku: 'PDRN-001',
        tags: ['antiaging', 'coreamy'],
        paymentLink: 'https://pay.kloel.com/CMNGNDIM',
        salesPageUrl: 'https://coreamy.example/sales',
        supportEmail: 'suporte@coreamy.example',
        warrantyDays: 30,
        shippingType: 'EXPRESS',
        shippingValue: 19.9,
        affiliateEnabled: true,
        commissionPercent: 40,
        commissionType: 'PERCENTAGE',
        commissionCookieDays: 30,
        plans: [{ name: '1 Frasco', price: 423.6, currency: 'BRL', salesCount: 12 }],
        checkouts: [{ name: 'Checkout Blanc', conversionRate: 3.4, totalVisits: 80 }],
        coupons: [{ code: 'PRIMEIRA', discountType: 'PERCENTAGE', discountValue: 10 }],
        campaigns: [{ name: 'Abril', salesCount: 7, paidCount: 5 }],
        commissions: [{ role: 'closer', percentage: 15, agentName: 'Daniel Gonzaga' }],
        urls: [{ description: 'Sales page', url: 'https://coreamy.example/sales' }],
        reviews: [{ authorName: 'Maria', rating: 5, comment: 'Gostei muito', verified: true }],
        aiConfig: {
          targetAudience: 'Mulheres 40+',
          technicalInfo: { anvisa: true },
        },
        merchandContent: 'Criativos e VSL prontos.',
        affiliateTerms: 'Sem spam.',
        afterPayChargeValue: 9.9,
        afterPayShippingProvider: 'Correios',
      },
      0,
    );

    expect(context).toContain('PRODUTO 1: Coreamy PDRN');
    expect(context).toContain('Oferta principal');
    expect(context).toContain('Planos ativos');
    expect(context).toContain('Checkout principal');
    expect(context).toContain('Cupons ativos');
    expect(context).toContain('Campanhas');
    expect(context).toContain('Comissionamentos configurados');
    expect(context).toContain('Materiais para afiliados');
    expect(context).toContain('Regras pós-pagamento');
  });

  it('builds billing and affiliate summaries with real operational markers', () => {
    const billing = formatter.buildWorkspaceBillingContext({
      subscription: {
        plan: 'PRO',
        status: 'ACTIVE',
        currentPeriodEnd: new Date('2026-04-30T03:00:00.000Z'),
      },
      invoices: [{ status: 'PAID', amount: 9900, createdAt: new Date('2026-04-01T03:00:00.000Z') }],
      providerSettings: null,
      stripeCustomerId: 'cus_123',
    });
    const affiliate = formatter.buildWorkspaceAffiliateContext([
      {
        productName: 'Produto Afiliado',
        status: 'APPROVED',
        commissionPct: 40,
        cookieDays: 30,
        approvalMode: 'MANUAL',
        price: 199,
        currency: 'BRL',
        category: 'Saúde',
        description: 'Oferta muito forte.',
        linkClicks: 120,
        linkSales: 8,
        linkRevenue: 1592,
        linkCommissionEarned: 636.8,
        affiliateCode: 'AFF-CODE-COREAMY',
        promoMaterials: { vsl: true, copies: 3 },
      },
    ]);

    expect(billing).toContain('Assinatura');
    expect(billing).toContain('plano PRO');
    expect(billing).toContain('Faturas recentes');
    expect(affiliate).toContain('Produto Afiliado');
    expect(affiliate).toContain('Performance');
    expect(affiliate).toContain('Código/link afiliado');
    expect(affiliate).toContain('Materiais promocionais');
  });
});
