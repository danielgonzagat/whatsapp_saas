import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PLATFORM_FEE_PERCENT = 9.9;
const DEFAULT_INSTALLMENT_INTEREST_MONTHLY_PERCENT = 3.99;

type PlanLike = Record<string, unknown> & {
  product: { workspaceId: string; name?: string; [k: string]: unknown };
  checkoutConfig?: Record<string, unknown> | null;
  slug?: string;
  referenceCode?: string;
};

type BuildOptions = {
  affiliateLink?: Record<string, unknown> | null;
  checkoutLink?: Record<string, unknown> | null;
  checkoutConfigOverride?: Record<string, unknown> | null;
};

type FiscalSnapshot = {
  cnpj: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
} | null;

type WorkspaceSnapshot = {
  id: string;
  name: string | null;
  customDomain: string | null;
  branding: unknown;
  fiscalData: FiscalSnapshot;
} | null;

export class CheckoutPublicPayloadBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(plan: PlanLike, options?: BuildOptions) {
    const affiliateLink = options?.affiliateLink || null;
    const checkoutLink = options?.checkoutLink || null;
    const checkoutConfig = options?.checkoutConfigOverride || plan.checkoutConfig;
    const workspaceId = plan.product.workspaceId;

    const [workspace, sellerStripeAccount] = await Promise.all([
      this.loadWorkspaceSnapshot(workspaceId),
      this.loadSellerStripeAccount(workspaceId),
    ]);

    return {
      ...plan,
      slug: checkoutLink?.slug || plan.slug,
      referenceCode: checkoutLink?.referenceCode || plan.referenceCode,
      checkoutCode: affiliateLink?.code || checkoutLink?.referenceCode || plan.referenceCode,
      checkoutLinkId: checkoutLink?.id || null,
      checkoutTemplateId: checkoutLink?.checkoutId || null,
      checkoutTemplateName:
        (checkoutLink?.checkout as Record<string, unknown> | undefined)?.name || null,
      checkoutConfig,
      paymentProvider: buildPaymentProvider(sellerStripeAccount?.stripeAccountId),
      merchant: buildMerchant(workspace, workspaceId, plan, checkoutConfig),
      affiliateContext: buildAffiliateContext(affiliateLink),
    };
  }

  private loadWorkspaceSnapshot(workspaceId: string) {
    return this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        customDomain: true,
        branding: true,
        fiscalData: {
          select: {
            cnpj: true,
            razaoSocial: true,
            nomeFantasia: true,
            street: true,
            number: true,
            complement: true,
            neighborhood: true,
            city: true,
            state: true,
            cep: true,
          },
        },
      },
    });
  }

  private loadSellerStripeAccount(workspaceId: string) {
    return this.prisma.connectAccountBalance.findFirst({
      where: {
        workspaceId,
        accountType: 'SELLER',
      },
      select: {
        id: true,
        stripeAccountId: true,
      },
    });
  }
}

function buildPaymentProvider(stripeAccountId: string | null | undefined) {
  const publishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim() || null;
  return {
    provider: 'stripe',
    connected: Boolean(stripeAccountId),
    checkoutEnabled: Boolean(publishableKey),
    publicKey: publishableKey,
    unavailableReason: publishableKey
      ? null
      : 'Stripe não está configurado no ambiente atual do checkout.',
    marketplaceFeePercent: DEFAULT_PLATFORM_FEE_PERCENT,
    installmentInterestMonthlyPercent: DEFAULT_INSTALLMENT_INTEREST_MONTHLY_PERCENT,
    availablePaymentMethodIds: ['card', 'pix'],
    availablePaymentMethodTypes: ['card', 'pix'],
    supportsCreditCard: true,
    supportsPix: true,
    supportsBoleto: false,
  };
}

function normalizeBranding(workspace: WorkspaceSnapshot): Record<string, unknown> | null {
  const branding = workspace?.branding;
  return branding && typeof branding === 'object' ? (branding as Record<string, unknown>) : null;
}

function buildAddressLine(fiscal: FiscalSnapshot): string | null {
  if (!fiscal) return null;
  const line = [
    [fiscal.street, fiscal.number].filter(Boolean).join(', '),
    fiscal.neighborhood,
    [fiscal.city, fiscal.state].filter(Boolean).join(' - '),
    fiscal.cep ? `CEP ${fiscal.cep}` : null,
  ]
    .filter(Boolean)
    .join(' • ');
  return line || null;
}

function buildMerchant(
  workspace: WorkspaceSnapshot,
  workspaceId: string,
  plan: PlanLike,
  checkoutConfig: Record<string, unknown> | null | undefined,
) {
  const branding = normalizeBranding(workspace);
  const fiscal = workspace?.fiscalData ?? null;

  return {
    workspaceId: workspace?.id || workspaceId,
    workspaceName: workspace?.name || checkoutConfig?.brandName || plan.product?.name || 'Kloel',
    companyName:
      fiscal?.nomeFantasia ||
      fiscal?.razaoSocial ||
      workspace?.name ||
      checkoutConfig?.brandName ||
      plan.product?.name ||
      'Kloel',
    brandLogo: resolveBrandLogo(branding, checkoutConfig),
    customDomain: workspace?.customDomain || null,
    cnpj: fiscal?.cnpj || null,
    addressLine: buildAddressLine(fiscal),
  };
}

function resolveBrandLogo(
  branding: Record<string, unknown> | null,
  checkoutConfig: Record<string, unknown> | null | undefined,
): string | null {
  const logoUrl = branding?.logoUrl;
  if (typeof logoUrl === 'string' && logoUrl.trim()) return logoUrl;
  const fallback = checkoutConfig?.brandLogo;
  return typeof fallback === 'string' && fallback ? fallback : null;
}

function buildAffiliateContext(affiliateLink: Record<string, unknown> | null) {
  if (!affiliateLink) return null;
  const affiliateProduct = affiliateLink.affiliateProduct as Record<string, unknown> | undefined;
  return {
    affiliateLinkId: affiliateLink.id,
    affiliateWorkspaceId: affiliateLink.affiliateWorkspaceId,
    affiliateProductId: affiliateLink.affiliateProductId,
    affiliateCode: affiliateLink.code,
    commissionPct: Number(affiliateProduct?.commissionPct || 0),
  };
}
