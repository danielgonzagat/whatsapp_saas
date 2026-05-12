import type { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { AccountDeps } from './account-agent.gap-detector';
import type { AccountInputSessionPayload } from './account-agent.types';
import {
  buildProductDescription,
  buildProductFaq,
  extractMaxInstallments,
  extractMoneyValues,
  extractPercentages,
  extractUrls,
  parseOfferLines,
  slugifyCatalogKey,
} from './account-agent.util';

function toJson(value: unknown): Prisma.InputJsonValue {
  return toPrismaJsonValue(value);
}

export async function materializeProductExt(
  deps: AccountDeps,
  workspaceId: string,
  session: AccountInputSessionPayload,
) {
  const da = String(session.answers.description || '').trim();
  const oa = String(session.answers.offers || '').trim();
  const ca = String(session.answers.company || '').trim();
  const offers = parseOfferLines(oa);
  const urls = extractUrls(oa);
  const prices = extractMoneyValues(oa);
  const maxDiscount = extractPercentages(oa);
  const maxInstallments = extractMaxInstallments(oa);
  const faq = buildProductFaq({
    productName: session.productName,
    descriptionAnswer: da,
    offersAnswer: oa,
    companyAnswer: ca,
  });
  const description = buildProductDescription({
    productName: session.productName,
    descriptionAnswer: da,
    offers,
    companyAnswer: ca,
  });
  const existingProducts = await deps.prisma.product.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    take: 200,
  });
  const existing = existingProducts.find(
    (p) => slugifyCatalogKey(p.name) === session.normalizedProductName,
  );
  const meta = toJson({
    createdBy: 'account_agent',
    faq,
    offers,
    companyProfile: { raw: ca },
    operatorInputs: { description: da, offers: oa, company: ca },
    negotiation: {
      maxDiscountPercent: maxDiscount.length > 0 ? Math.max(...maxDiscount) : null,
      maxInstallments,
    },
  });
  const product = existing
    ? await (async () => {
        await deps.prisma.product.updateMany({
          where: { id: existing.id, workspaceId },
          data: {
            description,
            price: prices[0] || 0,
            paymentLink: urls[0] || null,
            active: true,
            metadata: meta,
          },
        });
        return deps.prisma.product.findFirstOrThrow({ where: { id: existing.id, workspaceId } });
      })()
    : await deps.prisma.product.create({
        data: {
          workspaceId,
          name: session.productName,
          description,
          price: prices[0] || 0,
          paymentLink: urls[0] || null,
          active: true,
          metadata: meta,
        },
      });
  await deps.prisma.kloelMemory.upsert({
    where: { workspaceId_key: { workspaceId, key: 'company_info:primary' } },
    create: {
      workspaceId,
      key: 'company_info:primary',
      value: toJson({
        source: 'account_agent',
        productName: session.productName,
        raw: ca,
        updatedAt: new Date().toISOString(),
      }),
      category: 'business',
      type: 'company_info',
      content: ca.slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
    update: {
      value: toJson({
        source: 'account_agent',
        productName: session.productName,
        raw: ca,
        updatedAt: new Date().toISOString(),
      }),
      category: 'business',
      type: 'company_info',
      content: ca.slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
  });
  await deps.prisma.kloelMemory.upsert({
    where: {
      workspaceId_key: { workspaceId, key: `faq:product:${session.normalizedProductName}` },
    },
    create: {
      workspaceId,
      key: `faq:product:${session.normalizedProductName}`,
      value: toJson({
        productId: product.id,
        productName: session.productName,
        items: faq,
        updatedAt: new Date().toISOString(),
      }),
      category: 'catalog_asset',
      type: 'faq',
      content: faq
        .map((q) => q.question)
        .join(' | ')
        .slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
    update: {
      value: toJson({
        productId: product.id,
        productName: session.productName,
        items: faq,
        updatedAt: new Date().toISOString(),
      }),
      category: 'catalog_asset',
      type: 'faq',
      content: faq
        .map((q) => q.question)
        .join(' | ')
        .slice(0, 1000),
      metadata: toJson({ productId: product.id }),
    },
  });
  const existingLinks = await deps.prisma.externalPaymentLink.findMany({
    where: { workspaceId, productName: session.productName },
    select: { paymentUrl: true },
    take: 100,
  });
  const eUrls = new Set(existingLinks.map((l) => l.paymentUrl));
  await forEachSequential(
    offers.filter((o) => o.url && !eUrls.has(String(o.url))),
    async (offer) => {
      await deps.prisma.externalPaymentLink.create({
        data: {
          workspaceId,
          platform: 'other',
          productName: session.productName,
          price: offer.price || prices[0] || 0,
          paymentUrl: offer.url || '',
          checkoutUrl: offer.url || '',
          isActive: true,
        },
      });
    },
  );
  return { productId: product.id };
}
