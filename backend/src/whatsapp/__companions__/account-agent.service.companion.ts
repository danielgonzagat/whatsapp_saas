import { Prisma } from '@prisma/client';
import { forEachSequential } from '../../common/async-sequence';
import { toPrismaJsonValue } from '../../common/prisma/prisma-json.util';
import { slugifyCatalogKey } from '../account-agent.util';
import {
  buildProductDescription,
  buildProductFaq,
  extractMaxInstallments,
  extractMoneyValues,
  extractPercentages,
  extractUrls,
  parseOfferLines,
} from '../account-agent.util';
import type { AccountInputSessionPayload } from '../account-agent.types';

export async function materializeProduct(
  prisma: {
    product: {
      findMany(args: any): Promise<any[]>;
      findFirstOrThrow(args: any): Promise<any>;
      create(args: any): Promise<any>;
      updateMany(args: any): Promise<any>;
    };
    externalPaymentLink: { findMany(args: any): Promise<any[]>; create(args: any): Promise<any> };
    kloelMemory: { upsert(args: any): Promise<any> };
    workspace: { findUnique(args: any): Promise<any> };
  },
  workspaceId: string,
  session: AccountInputSessionPayload,
  upsertMemory: (
    workspaceId: string,
    key: string,
    input: {
      value: object;
      category: string;
      type: string;
      content?: string;
      metadata?: object;
    },
  ) => Promise<any>,
  logger: { log: (msg: string) => void },
) {
  const descriptionAnswer = String(session.answers.description || '').trim();
  const offersAnswer = String(session.answers.offers || '').trim();
  const companyAnswer = String(session.answers.company || '').trim();
  const offers = parseOfferLines(offersAnswer);
  const urls = extractUrls(offersAnswer);
  const prices = extractMoneyValues(offersAnswer);
  const maxDiscount = extractPercentages(offersAnswer);
  const maxInstallments = extractMaxInstallments(offersAnswer);
  const faq = buildProductFaq({
    productName: session.productName,
    descriptionAnswer,
    offersAnswer,
    companyAnswer,
  });
  const description = buildProductDescription({
    productName: session.productName,
    descriptionAnswer,
    offers,
    companyAnswer,
  });

  const existingProducts = await prisma.product.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    take: 200,
  });
  const existing = existingProducts.find(
    (item) => slugifyCatalogKey(item.name) === session.normalizedProductName,
  );

  const toJson = (value: unknown): Prisma.InputJsonValue => toPrismaJsonValue(value);

  const product = existing
    ? await (async () => {
        await prisma.product.updateMany({
          where: { id: existing.id, workspaceId },
          data: {
            description,
            price: prices[0] || 0,
            paymentLink: urls[0] || null,
            active: true,
            metadata: toJson({
              createdBy: 'account_agent',
              faq,
              offers,
              companyProfile: { raw: companyAnswer },
              operatorInputs: {
                description: descriptionAnswer,
                offers: offersAnswer,
                company: companyAnswer,
              },
              negotiation: {
                maxDiscountPercent: maxDiscount.length > 0 ? Math.max(...maxDiscount) : null,
                maxInstallments,
              },
            }),
          },
        });
        return prisma.product.findFirstOrThrow({ where: { id: existing.id, workspaceId } });
      })()
    : await prisma.product.create({
        data: {
          workspaceId,
          name: session.productName,
          description,
          price: prices[0] || 0,
          paymentLink: urls[0] || null,
          active: true,
          metadata: toJson({
            createdBy: 'account_agent',
            faq,
            offers,
            companyProfile: { raw: companyAnswer },
            operatorInputs: {
              description: descriptionAnswer,
              offers: offersAnswer,
              company: companyAnswer,
            },
            negotiation: {
              maxDiscountPercent: maxDiscount.length > 0 ? Math.max(...maxDiscount) : null,
              maxInstallments,
            },
          }),
        },
      });

  await upsertMemory(workspaceId, `company_info:primary`, {
    value: {
      source: 'account_agent',
      productName: session.productName,
      raw: companyAnswer,
      updatedAt: new Date().toISOString(),
    },
    category: 'business',
    type: 'company_info',
    content: companyAnswer.slice(0, 1000),
    metadata: { productId: product.id },
  });

  await upsertMemory(workspaceId, `faq:product:${session.normalizedProductName}`, {
    value: {
      productId: product.id,
      productName: session.productName,
      items: faq,
      updatedAt: new Date().toISOString(),
    },
    category: 'catalog_asset',
    type: 'faq',
    content: faq
      .map((item) => item.question)
      .join(' | ')
      .slice(0, 1000),
    metadata: { productId: product.id },
  });

  const existingLinks = await prisma.externalPaymentLink.findMany({
    where: { workspaceId, productName: session.productName },
    select: { paymentUrl: true },
    take: 100,
  });
  const existingUrls = new Set(existingLinks.map((item) => item.paymentUrl));

  await forEachSequential(
    offers.filter((item) => item.url && !existingUrls.has(String(item.url))),
    async (offer) => {
      await prisma.externalPaymentLink.create({
        data: {
          workspaceId,
          platform: 'other',
          productName: session.productName,
          price: offer.price || prices[0] || 0,
          paymentUrl: offer.url,
          checkoutUrl: offer.url,
          isActive: true,
        },
      });
    },
  );

  logger.log(
    `Account agent materialized product ${session.productName} (${product.id}) for workspace ${workspaceId}`,
  );
  return { productId: product.id };
}
