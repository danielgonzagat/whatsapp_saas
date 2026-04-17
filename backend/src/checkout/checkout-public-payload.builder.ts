import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { PrismaService } from '../prisma/prisma.service';
import { applyMercadoPagoPublicCheckoutRestrictions } from './mercado-pago-checkout-policy.util';

export class CheckoutPublicPayloadBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

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
    const [publicCheckoutConfig, workspace] = await Promise.all([
      this.mercadoPago.getPublicCheckoutConfig(plan.product.workspaceId),
      this.prisma.workspace.findUnique({
        where: { id: plan.product.workspaceId },
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
    ]);
    const paymentProvider = applyMercadoPagoPublicCheckoutRestrictions(publicCheckoutConfig, {
      hasAffiliateContext: Boolean(affiliateLink),
    });
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
      checkoutConfig,
      paymentProvider,
      merchant: {
        workspaceId: workspace?.id || plan.product.workspaceId,
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
