import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckoutProductService } from '../checkout-product.service';
import { CheckoutPublicPayloadBuilder } from '../checkout-public-payload.builder';
import {
  DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
  isValidPublicCheckoutCode,
  normalizePublicCheckoutCode,
} from '../checkout-code.util';

interface LookupDeps {
  prisma: PrismaService;
  productService: CheckoutProductService;
  publicPayloadBuilder: CheckoutPublicPayloadBuilder;
  logCheckoutEvent: (event: string, payload: Record<string, unknown>) => void;
}

export async function getCheckoutByCode(
  deps: LookupDeps,
  code: string,
  context?: { correlationId?: string; lookupSource?: string },
) {
  const planLinkManager = deps.productService.getPlanLinkManager();
  const correlationId = context?.correlationId ?? randomUUID();
  const normalizedCode = normalizePublicCheckoutCode(code);
  const normalizedCodePrefix = normalizedCode.slice(0, DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH);
  const legacyCode = String(code ?? '')
    .trim()
    .toLowerCase();

  deps.logCheckoutEvent('checkout_public_lookup_start', {
    correlationId,
    lookupType: 'code',
    lookupValue: code,
    normalizedCode,
    lookupSource: context?.lookupSource ?? 'direct',
  });

  const codeOrConditions = [
    { referenceCode: normalizedCode },
    ...(normalizedCodePrefix &&
    normalizedCodePrefix !== normalizedCode &&
    isValidPublicCheckoutCode(normalizedCodePrefix)
      ? [{ referenceCode: normalizedCodePrefix }]
      : []),
    { referenceCode: code },
  ];

  const checkoutLink = await deps.prisma.checkoutPlanLink.findFirst({
    where: {
      isActive: true,
      checkout: { isActive: true, kind: 'CHECKOUT' },
      plan: { isActive: true, kind: 'PLAN' },
      OR: codeOrConditions,
    },
    include: {
      checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
      plan: {
        include: {
          product: true,
          checkoutConfig: { include: { pixels: true } },
          orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  });

  if (checkoutLink) {
    deps.logCheckoutEvent('checkout_public_lookup_resolved', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
      resolution: 'checkout_link',
      checkoutId: checkoutLink.checkoutId,
      planId: checkoutLink.planId,
    });
    return deps.publicPayloadBuilder.build(checkoutLink.plan, {
      checkoutLink,
      checkoutConfigOverride:
        checkoutLink.checkout.checkoutConfig || checkoutLink.plan.checkoutConfig,
    });
  }

  const planRecord = await deps.prisma.checkoutProductPlan.findFirst({
    where: {
      OR: [...codeOrConditions, { id: { startsWith: legacyCode } }],
    },
    include: {
      product: true,
      checkoutConfig: { include: { pixels: true } },
      orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
  });

  if (planRecord?.isActive && planRecord.kind === 'PLAN' && planRecord.legacyCheckoutEnabled) {
    await deps.productService.ensureLegacyCheckoutForPlan(planRecord.id);
    const migratedLink = await deps.prisma.checkoutPlanLink.findFirst({
      where: {
        isActive: true,
        checkout: { isActive: true, kind: 'CHECKOUT' },
        plan: { isActive: true, kind: 'PLAN' },
        OR: codeOrConditions,
      },
      include: {
        checkout: { include: { checkoutConfig: { include: { pixels: true } } } },
        plan: {
          include: {
            product: true,
            checkoutConfig: { include: { pixels: true } },
            orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (migratedLink) {
      deps.logCheckoutEvent('checkout_public_lookup_resolved', {
        correlationId,
        lookupType: 'code',
        lookupValue: code,
        resolution: 'legacy_checkout_link',
        checkoutId: migratedLink.checkoutId,
        planId: migratedLink.planId,
      });
      return deps.publicPayloadBuilder.build(migratedLink.plan, {
        checkoutLink: migratedLink,
        checkoutConfigOverride:
          migratedLink.checkout.checkoutConfig || migratedLink.plan.checkoutConfig,
      });
    }
  }

  if (planRecord?.isActive && planRecord.kind === 'PLAN') {
    const plan = await planLinkManager.ensurePlanReferenceCode(planRecord);
    deps.logCheckoutEvent('checkout_public_lookup_resolved', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
      resolution: 'plan',
      planId: plan.id,
    });
    return deps.publicPayloadBuilder.build(plan);
  }

  const affiliateCodeConditions = [
    { code: normalizedCode },
    ...(normalizedCodePrefix &&
    normalizedCodePrefix !== normalizedCode &&
    isValidPublicCheckoutCode(normalizedCodePrefix)
      ? [{ code: normalizedCodePrefix }]
      : []),
    { code },
  ];
  const affiliateLink = await deps.prisma.affiliateLink.findFirst({
    where: { active: true, OR: affiliateCodeConditions },
    include: { affiliateProduct: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!affiliateLink?.affiliateProduct?.productId) {
    deps.logCheckoutEvent('checkout_public_lookup_not_found', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
    });
    throw new NotFoundException('Checkout not found');
  }

  const affiliatePlanRecord = await deps.prisma.checkoutProductPlan.findFirst({
    where: { productId: affiliateLink.affiliateProduct.productId, isActive: true, kind: 'PLAN' },
    include: {
      product: true,
      checkoutConfig: { include: { pixels: true } },
      orderBumps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!affiliatePlanRecord) {
    deps.logCheckoutEvent('checkout_public_lookup_not_found', {
      correlationId,
      lookupType: 'code',
      lookupValue: code,
      resolution: 'affiliate_missing_plan',
    });
    throw new NotFoundException('Checkout not found');
  }

  const affiliatePlan = await planLinkManager.ensurePlanReferenceCode(affiliatePlanRecord);
  const affiliateCheckoutLink = await deps.prisma.checkoutPlanLink.findFirst({
    where: {
      planId: affiliatePlan.id,
      isActive: true,
      checkout: { isActive: true, kind: 'CHECKOUT' },
    },
    include: { checkout: { include: { checkoutConfig: { include: { pixels: true } } } } },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  await deps.prisma.affiliateLink.update({
    where: { id: affiliateLink.id },
    data: { clicks: { increment: 1 } },
  });

  deps.logCheckoutEvent('checkout_public_lookup_resolved', {
    correlationId,
    lookupType: 'code',
    lookupValue: code,
    resolution: 'affiliate_link',
    affiliateLinkId: affiliateLink.id,
    planId: affiliatePlan.id,
  });

  return deps.publicPayloadBuilder.build(affiliatePlan, {
    affiliateLink,
    checkoutLink: affiliateCheckoutLink,
    checkoutConfigOverride:
      affiliateCheckoutLink?.checkout?.checkoutConfig || affiliatePlan.checkoutConfig,
  });
}
