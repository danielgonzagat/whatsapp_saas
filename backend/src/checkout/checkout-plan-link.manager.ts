import { PrismaService } from '../prisma/prisma.service';
import { forEachSequential } from '../common/async-sequence';
import {
  DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
  generateUniquePublicCheckoutCode,
  isValidPublicCheckoutCode,
  normalizePublicCheckoutCode,
} from './checkout-code.util';

const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z0_9_RE = /[^a-z0-9]+/g;
const PATTERN_RE = /^-|-$/g;

type PublicIdentifierIgnore = {
  planId?: string | null;
  linkId?: string | null;
};

/** Checkout plan link manager. */
export class CheckoutPlanLinkManager {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCheckoutSlug(value: string, fallback = 'checkout') {
    const normalized = String(value || fallback)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(U0300__U036F_RE, '')
      .replace(A_Z0_9_RE, '-')
      .replace(PATTERN_RE, '')
      .slice(0, 56);

    return normalized || fallback;
  }

  async isPublicSlugTaken(slug: string, ignore?: PublicIdentifierIgnore) {
    const normalizedSlug = this.normalizeCheckoutSlug(slug);
    if (!normalizedSlug) {
      return true;
    }

    const [plan, link] = await Promise.all([
      this.prisma.checkoutProductPlan.findFirst({
        where: {
          slug: normalizedSlug,
          ...(ignore?.planId ? { id: { not: ignore.planId } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.checkoutPlanLink.findFirst({
        where: {
          slug: normalizedSlug,
          ...(ignore?.linkId ? { id: { not: ignore.linkId } } : {}),
        },
        select: { id: true },
      }),
    ]);

    return Boolean(plan || link);
  }

  async generateCheckoutSlug(base: string, ignore?: PublicIdentifierIgnore) {
    const normalizedBase = this.normalizeCheckoutSlug(base);

    if (!(await this.isPublicSlugTaken(normalizedBase, ignore))) {
      return normalizedBase;
    }

    const tryCandidate = async (attempt: number): Promise<string> => {
      if (attempt >= 25) {
        return this.normalizeCheckoutSlug(
          `${normalizedBase}-${Math.random().toString(36).slice(2, 8)}`,
        );
      }

      const suffix = `${Date.now().toString(36)}${attempt.toString(36)}`.slice(-6);
      const candidate = this.normalizeCheckoutSlug(`${normalizedBase}-${suffix}`);
      if (!(await this.isPublicSlugTaken(candidate, ignore))) {
        return candidate;
      }
      return tryCandidate(attempt + 1);
    };

    return tryCandidate(0);
  }

  async isPublicCodeTaken(code: string, ignore?: PublicIdentifierIgnore) {
    const normalizedCode = normalizePublicCheckoutCode(code);
    if (!normalizedCode) {
      return true;
    }

    const [plan, link, affiliateLink] = await Promise.all([
      this.prisma.checkoutProductPlan.findFirst({
        where: {
          referenceCode: normalizedCode,
          ...(ignore?.planId ? { id: { not: ignore.planId } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.checkoutPlanLink.findFirst({
        where: {
          referenceCode: normalizedCode,
          ...(ignore?.linkId ? { id: { not: ignore.linkId } } : {}),
        },
        select: { id: true },
      }),
      this.prisma.affiliateLink.findFirst({
        where: { code: normalizedCode },
        select: { id: true },
      }),
    ]);

    return Boolean(plan || link || affiliateLink);
  }

  async generatePublicCheckoutCode(ignore?: PublicIdentifierIgnore) {
    return generateUniquePublicCheckoutCode((code) => this.isPublicCodeTaken(code, ignore));
  }

  async ensurePlanReferenceCode<T extends { id: string; referenceCode?: string | null }>(
    plan: T,
  ): Promise<T> {
    const normalizedReferenceCode = normalizePublicCheckoutCode(plan.referenceCode);

    if (isValidPublicCheckoutCode(normalizedReferenceCode)) {
      if (normalizedReferenceCode === plan.referenceCode) {
        return plan;
      }

      await this.prisma.checkoutProductPlan.update({
        where: { id: plan.id },
        data: { referenceCode: normalizedReferenceCode },
      });

      return { ...plan, referenceCode: normalizedReferenceCode };
    }

    const prefixCandidate = normalizedReferenceCode.slice(0, DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH);
    if (
      prefixCandidate.length === DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH &&
      !(await this.isPublicCodeTaken(prefixCandidate, { planId: plan.id }))
    ) {
      await this.prisma.checkoutProductPlan.update({
        where: { id: plan.id },
        data: { referenceCode: prefixCandidate },
      });

      return { ...plan, referenceCode: prefixCandidate };
    }

    const nextReferenceCode = await this.generatePublicCheckoutCode({ planId: plan.id });
    await this.prisma.checkoutProductPlan.update({
      where: { id: plan.id },
      data: { referenceCode: nextReferenceCode },
    });

    return { ...plan, referenceCode: nextReferenceCode };
  }

  async ensurePlansReferenceCodes<T extends { id: string; referenceCode?: string | null }>(
    plans: T[] | null | undefined,
  ) {
    if (!Array.isArray(plans) || plans.length === 0) {
      return Array.isArray(plans) ? plans : [];
    }

    return Promise.all(plans.map((plan) => this.ensurePlanReferenceCode(plan)));
  }

  async syncCheckoutLinks(checkoutId: string, planIds: string[]) {
    const checkout = await this.prisma.checkoutProductPlan.findUnique({
      where: { id: checkoutId },
      include: {
        product: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!checkout || checkout.kind !== 'CHECKOUT') {
      throw new Error('CHECKOUT_NOT_FOUND');
    }

    const desiredPlanIds = Array.from(
      new Set((planIds || []).map((value) => String(value || '').trim()).filter(Boolean)),
    );

    const plans = desiredPlanIds.length
      ? await this.prisma.checkoutProductPlan.findMany({
          where: {
            id: { in: desiredPlanIds },
            productId: checkout.productId,
            kind: 'PLAN',
          },
          select: {
            id: true,
            slug: true,
            isActive: true,
          },
        })
      : [];

    if (plans.length !== desiredPlanIds.length) {
      throw new Error('INVALID_PLAN_SELECTION');
    }

    await this.prisma.$transaction(async (tx) => {
      const existingLinks = await tx.checkoutPlanLink.findMany({
        where: { checkoutId },
        select: { id: true, planId: true },
      });

      const existingPlanIds = new Set(existingLinks.map((link) => link.planId));
      const desiredPlanSet = new Set(desiredPlanIds);

      const linksToDelete = existingLinks
        .filter((link) => !desiredPlanSet.has(link.planId))
        .map((link) => link.id);

      if (linksToDelete.length) {
        await tx.checkoutPlanLink.deleteMany({
          where: { id: { in: linksToDelete } },
        });
      }

      await forEachSequential(plans, async (plan) => {
        if (existingPlanIds.has(plan.id)) {
          return;
        }

        const existingPlanLinkCount = await tx.checkoutPlanLink.count({
          where: { planId: plan.id },
        });

        await tx.checkoutPlanLink.create({
          data: {
            checkoutId,
            planId: plan.id,
            slug: existingPlanLinkCount === 0 ? plan.slug : null,
            referenceCode: await this.generatePublicCheckoutCode(),
            isPrimary: existingPlanLinkCount === 0,
            isActive: plan.isActive,
          },
        });
      });

      const affectedPlanIds = Array.from(
        new Set([...desiredPlanIds, ...existingLinks.map((link) => link.planId)]),
      );

      await forEachSequential(affectedPlanIds, async (planId) => {
        const remainingLinks = await tx.checkoutPlanLink.findMany({
          where: { planId },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: { id: true, slug: true, isPrimary: true },
        });

        if (!remainingLinks.length) {
          return;
        }

        const currentPrimary = remainingLinks.find((link) => link.isPrimary);
        if (currentPrimary) {
          return;
        }

        const planRecord = await tx.checkoutProductPlan.findUnique({
          where: { id: planId },
          select: { slug: true },
        });

        await tx.checkoutPlanLink.update({
          where: { id: remainingLinks[0].id },
          data: {
            isPrimary: true,
            slug: remainingLinks[0].slug || planRecord?.slug || null,
          },
        });
      });
    });

    return this.prisma.checkoutPlanLink.findMany({
      where: { checkoutId },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            referenceCode: true,
            isActive: true,
            priceInCents: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }
}
