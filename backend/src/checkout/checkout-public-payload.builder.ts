import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_PLATFORM_FEE_PERCENT = 9.9;
const DEFAULT_INSTALLMENT_INTEREST_MONTHLY_PERCENT = 3.99;

export class CheckoutPublicPayloadBuilder {
  constructor(private readonly prisma: PrismaService) {}

  private sanitizePixelsForPublic(value: unknown) {
    if (!Array.isArray(value)) return undefined;

    return value
      .filter((entry) => Boolean(entry) && typeof entry === 'object')
      .map((entry) => {
        const { accessToken: _accessToken, ...rest } = entry as Record<string, unknown>;
        return rest;
      });
  }

  async build(
    plan: Record<string, unknown> & {
      product: { workspaceId: string; name?: string; [k: string]: unknown };
      checkoutConfig?: Record<string, unknown> | null;
      slug?: string;
      referenceCode?: string;
    },
    options?: {
      affiliateLink?: Record<string, unknown> | null;
      checkoutLink?: Record<string, unknown> | null;
      checkoutConfigOverride?: Record<string, unknown> | null;
    },
  ) {
    const affiliateLink = options?.affiliateLink || null;
    const checkoutLink = options?.checkoutLink || null;
    const checkoutConfig = options?.checkoutConfigOverride || plan.checkoutConfig;
    const workspaceId = plan.product.workspaceId;

    const [workspace, sellerStripeAccount] = await Promise.all([
      this.prisma.workspace.findUnique({
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
      }),
      this.prisma.connectAccountBalance.findFirst({
        where: {
          workspaceId,
          accountType: 'SELLER',
        },
        select: {
          id: true,
          stripeAccountId: true,
        },
      }),
    ]);

    const publishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim() || null;
    const branding =
      workspace?.branding && typeof workspace.branding === 'object'
        ? (workspace.branding as Record<string, unknown>)
        : null;
    const fiscal = workspace?.fiscalData;
    const addressLine = [
      [fiscal?.street, fiscal?.number].filter(Boolean).join(', '),
      fiscal?.neighborhood,
      [fiscal?.city, fiscal?.state].filter(Boolean).join(' - '),
      fiscal?.cep ? `CEP ${fiscal.cep}` : null,
    ]
      .filter(Boolean)
      .join(' • ');

    return {
      ...plan,
      slug: checkoutLink?.slug || plan.slug,
      referenceCode: checkoutLink?.referenceCode || plan.referenceCode,
      checkoutCode: affiliateLink?.code || checkoutLink?.referenceCode || plan.referenceCode,
      checkoutLinkId: checkoutLink?.id || null,
      checkoutTemplateId: checkoutLink?.checkoutId || null,
      checkoutTemplateName:
        (checkoutLink?.checkout as Record<string, unknown> | undefined)?.name || null,
      checkoutConfig: checkoutConfig
        ? {
            ...checkoutConfig,
            pixels: this.sanitizePixelsForPublic((checkoutConfig as Record<string, unknown>).pixels),
          }
        : checkoutConfig,
      paymentProvider: {
        provider: 'stripe',
        connected: Boolean(sellerStripeAccount?.stripeAccountId),
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
      },
      merchant: {
        workspaceId: workspace?.id || workspaceId,
        workspaceName:
          workspace?.name || checkoutConfig?.brandName || plan.product?.name || 'Kloel',
        companyName:
          fiscal?.nomeFantasia ||
          fiscal?.razaoSocial ||
          workspace?.name ||
          checkoutConfig?.brandName ||
          plan.product?.name ||
          'Kloel',
        brandLogo:
          typeof branding?.logoUrl === 'string' && branding.logoUrl.trim()
            ? branding.logoUrl
            : checkoutConfig?.brandLogo || null,
        customDomain: workspace?.customDomain || null,
        cnpj: fiscal?.cnpj || null,
        addressLine: addressLine || null,
      },
      affiliateContext: affiliateLink
        ? {
            affiliateLinkId: affiliateLink.id,
            affiliateWorkspaceId: affiliateLink.affiliateWorkspaceId,
            affiliateProductId: affiliateLink.affiliateProductId,
            affiliateCode: affiliateLink.code,
            commissionPct: Number(
              (affiliateLink.affiliateProduct as Record<string, unknown> | undefined)
                ?.commissionPct || 0,
            ),
          }
        : null,
    };
  }
}
