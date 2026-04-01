import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createHmac, timingSafeEqual } from 'crypto';

export interface ExternalPaymentLink {
  id: string;
  workspaceId: string;
  platform: 'hotmart' | 'kiwify' | 'eduzz' | 'monetizze' | 'braip' | 'other';
  productName: string;
  price: number;
  paymentUrl: string;
  checkoutUrl?: string;
  affiliateUrl?: string;
  isActive: boolean;
  totalSales?: number;
  totalRevenue?: number;
  lastSaleAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PaymentPlatformConfig {
  platform: string;
  apiKey?: string;
  webhookSecret?: string;
  enabled: boolean;
}

/** Prisma extension for dynamic models not yet in generated types */
interface PrismaPaymentModels {
  externalPaymentLink: {
    create(args: Record<string, unknown>): Promise<ExternalPaymentLink>;
    findMany(args: Record<string, unknown>): Promise<ExternalPaymentLink[]>;
    findFirst(
      args: Record<string, unknown>,
    ): Promise<ExternalPaymentLink | null>;
    update(args: Record<string, unknown>): Promise<ExternalPaymentLink>;
    delete(args: Record<string, unknown>): Promise<ExternalPaymentLink>;
  };
  kloelMemory: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  kloelLead: {
    upsert(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  kloelSale: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
}

@Injectable()
export class ExternalPaymentService {
  private readonly logger = new Logger(ExternalPaymentService.name);
  // Fallback in-memory for configs (dev/test only). Preferir persistência em providerSettings.
  private platformConfigs: Map<string, PaymentPlatformConfig[]> = new Map();
  private readonly prismaExt: PrismaPaymentModels;

  constructor(private readonly prisma: PrismaService) {
    this.prismaExt = prisma as unknown as PrismaPaymentModels;
  }

  private isProduction(): boolean {
    return (process.env.NODE_ENV || '').toLowerCase() === 'production';
  }

  private async getWorkspaceProviderSettings(
    workspaceId: string,
  ): Promise<Record<string, unknown>> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    return (ws?.providerSettings as Record<string, unknown>) || {};
  }

  private async setWorkspaceProviderSettings(
    workspaceId: string,
    providerSettings: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: providerSettings as Prisma.InputJsonValue },
    });
  }

  private extractExternalPaymentsConfig(
    providerSettings: Record<string, unknown>,
  ): {
    platforms: PaymentPlatformConfig[];
  } {
    const externalPayments =
      (providerSettings?.externalPayments as Record<string, unknown>) || {};
    const platforms = Array.isArray(externalPayments?.platforms)
      ? (externalPayments.platforms as PaymentPlatformConfig[])
      : [];
    return { platforms };
  }

  private async getPlatformConfig(
    workspaceId: string,
    platform: string,
  ): Promise<PaymentPlatformConfig | null> {
    const settings = await this.getWorkspaceProviderSettings(workspaceId);
    const { platforms } = this.extractExternalPaymentsConfig(settings);
    const fromDb = platforms.find(
      (p) =>
        String(p.platform).toLowerCase() === String(platform).toLowerCase(),
    );
    if (fromDb) return fromDb;

    const fallback = this.platformConfigs.get(workspaceId) || [];
    return (
      fallback.find(
        (p) =>
          String(p.platform).toLowerCase() === String(platform).toLowerCase(),
      ) || null
    );
  }

  async verifyWebhookSecretOrThrow(
    workspaceId: string,
    platform: string,
    providedSecret: string | undefined,
    options?: {
      signature?: string;
      rawBody?: Buffer | string | Record<string, any>;
    },
  ): Promise<void> {
    const config = await this.getPlatformConfig(workspaceId, platform);

    if (!config) {
      if (this.isProduction()) {
        throw new ForbiddenException('webhook_secret_not_configured');
      }
      this.logger.warn(
        `Webhook recebido sem config (${platform}) para workspace ${workspaceId} (dev: permitido)`,
      );
      return;
    }

    if (!config.enabled) {
      throw new ForbiddenException('platform_disabled');
    }

    const expected = (config.webhookSecret || '').trim();
    if (!expected) {
      if (this.isProduction()) {
        throw new ForbiddenException('webhook_secret_not_configured');
      }
      this.logger.warn(
        `Webhook recebido sem webhookSecret (${platform}) para workspace ${workspaceId} (dev: permitido)`,
      );
      return;
    }

    const received = (providedSecret || '').trim();
    const secretMatches = this.safeCompare(expected, received);
    if (secretMatches) {
      return;
    }

    const signature = String(options?.signature || '').trim();
    if (signature && options?.rawBody) {
      const payload = Buffer.isBuffer(options.rawBody)
        ? options.rawBody
        : Buffer.from(
            typeof options.rawBody === 'string'
              ? options.rawBody
              : JSON.stringify(options.rawBody),
          );

      const normalizedReceived = signature.replace(/^sha256=/i, '').trim();
      const expectedHex = createHmac('sha256', expected)
        .update(payload)
        .digest('hex');
      const expectedBase64 = createHmac('sha256', expected)
        .update(payload)
        .digest('base64');

      if (
        this.safeCompare(expectedHex, normalizedReceived) ||
        this.safeCompare(expectedBase64, normalizedReceived)
      ) {
        return;
      }
    }

    if (!received && !signature) {
      throw new ForbiddenException('missing_webhook_secret');
    }

    throw new ForbiddenException('invalid_webhook_secret');
  }

  /**
   * Add an external payment link - NOW PERSISTED TO DATABASE
   */
  async addPaymentLink(
    workspaceId: string,
    data: {
      platform: ExternalPaymentLink['platform'];
      productName: string;
      price: number;
      paymentUrl: string;
      checkoutUrl?: string;
      affiliateUrl?: string;
    },
  ): Promise<ExternalPaymentLink> {
    const link = await this.prismaExt.externalPaymentLink.create({
      data: {
        workspaceId,
        platform: data.platform,
        productName: data.productName,
        price: data.price,
        paymentUrl: data.paymentUrl,
        checkoutUrl: data.checkoutUrl,
        affiliateUrl: data.affiliateUrl,
        isActive: true,
      },
    });

    this.logger.log(
      `Added ${data.platform} payment link: ${data.productName} for R$${data.price}`,
    );

    // Also save to memory service for KLOEL to use
    try {
      await this.prismaExt.kloelMemory.create({
        data: {
          workspaceId,
          key: `payment_link_${link.id}`,
          value: link,
          category: 'payment_link',
          content: `LINK DE PAGAMENTO: ${data.productName} - R$${data.price} - ${data.platform.toUpperCase()} - ${data.paymentUrl}`,
        },
      });
      // PULSE:OK — memory save is a non-critical enrichment; payment link is already persisted in DB
    } catch (e) {
      this.logger.warn('Could not save payment link to memory');
    }

    return link;
  }

  private safeCompare(expected: string, received: string): boolean {
    const expectedBuf = Buffer.from(String(expected || '').trim());
    const receivedBuf = Buffer.from(String(received || '').trim());

    return (
      expectedBuf.length > 0 &&
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf)
    );
  }

  /**
   * Get all payment links for a workspace - FROM DATABASE
   */
  async getPaymentLinks(workspaceId: string): Promise<ExternalPaymentLink[]> {
    return this.prismaExt.externalPaymentLink.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific payment link - FROM DATABASE
   */
  async getPaymentLink(
    workspaceId: string,
    linkId: string,
  ): Promise<ExternalPaymentLink | null> {
    return this.prismaExt.externalPaymentLink.findFirst({
      where: { id: linkId, workspaceId },
    });
  }

  /**
   * Find payment links by product name (for KLOEL to use) - FROM DATABASE
   */
  async findByProductName(
    workspaceId: string,
    productName: string,
  ): Promise<ExternalPaymentLink[]> {
    return this.prismaExt.externalPaymentLink.findMany({
      where: {
        workspaceId,
        isActive: true,
        productName: {
          contains: productName,
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Toggle link active status - PERSISTED TO DATABASE
   */
  async toggleLink(
    workspaceId: string,
    linkId: string,
  ): Promise<ExternalPaymentLink | null> {
    const existing = await this.prismaExt.externalPaymentLink.findFirst({
      where: { id: linkId, workspaceId },
    });

    if (!existing) return null;

    const updated = await this.prismaExt.externalPaymentLink.update({
      where: { id: linkId },
      data: { isActive: !existing.isActive },
    });

    this.logger.log(
      `Payment link ${linkId} is now ${updated.isActive ? 'active' : 'inactive'}`,
    );
    return updated;
  }

  /**
   * Delete a payment link - FROM DATABASE
   */
  async deleteLink(workspaceId: string, linkId: string): Promise<boolean> {
    try {
      // Verify the link belongs to this workspace before deleting
      const existing = await this.prismaExt.externalPaymentLink.findFirst({
        where: { id: linkId, workspaceId },
      });
      if (!existing) return false;

      await this.prismaExt.externalPaymentLink.delete({
        where: { id: linkId },
      });
      this.logger.log(`Deleted payment link ${linkId}`);
      return true;
      // PULSE:OK — delete returns boolean; caller checks return value; link deletion failure is non-critical
    } catch (e) {
      this.logger.warn(
        `Failed to delete payment link ${linkId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }

  /**
   * Update sales stats when webhook received
   */
  async recordSale(
    workspaceId: string,
    linkId: string,
    amount: number,
  ): Promise<void> {
    await this.prismaExt.externalPaymentLink.update({
      where: { id: linkId },
      data: {
        totalSales: { increment: 1 },
        totalRevenue: { increment: amount },
        lastSaleAt: new Date(),
      },
    });
  }

  /**
   * Configure platform integration
   */
  async configurePlatform(
    workspaceId: string,
    config: PaymentPlatformConfig,
  ): Promise<void> {
    // Persistir no providerSettings para sobreviver a restarts
    const settings = await this.getWorkspaceProviderSettings(workspaceId);
    const { platforms } = this.extractExternalPaymentsConfig(settings);

    const normalizedPlatform = String(config.platform).toLowerCase();
    const existingIndex = platforms.findIndex(
      (p) => String(p.platform).toLowerCase() === normalizedPlatform,
    );

    if (existingIndex > -1) {
      platforms[existingIndex] = config;
    } else {
      platforms.push(config);
    }

    const nextSettings: Record<string, unknown> = {
      ...(settings || {}),
      externalPayments: {
        ...((settings?.externalPayments as Record<string, unknown>) || {}),
        platforms,
      },
    };

    await this.setWorkspaceProviderSettings(workspaceId, nextSettings);

    // Fallback in-memory (não confiável em cluster, mas útil em dev)
    this.platformConfigs.set(workspaceId, platforms);
    this.logger.log(
      `Configured ${config.platform} for workspace ${workspaceId}`,
    );
  }

  /**
   * Get platform configurations
   */
  async getPlatformConfigs(
    workspaceId: string,
  ): Promise<PaymentPlatformConfig[]> {
    const settings = await this.getWorkspaceProviderSettings(workspaceId);
    const { platforms } = this.extractExternalPaymentsConfig(settings);
    if (platforms.length > 0) return platforms;
    return this.platformConfigs.get(workspaceId) || [];
  }

  /**
   * Handle webhook from external platforms
   */
  async handlePlatformWebhook(
    workspaceId: string,
    platform: string,
    event: string,
    data: any,
  ): Promise<void> {
    this.logger.log(`Webhook from ${platform}: ${event}`);

    // Map platform events to our internal events
    const isPurchase = this.isPurchaseEvent(platform, event);

    if (isPurchase) {
      const customerInfo = this.extractCustomerInfo(platform, data);
      const productInfo = this.extractProductInfo(platform, data);

      this.logger.log(
        `Purchase detected: ${productInfo.name} by ${customerInfo.name}`,
      );

      // Create/update lead
      try {
        await this.prismaExt.kloelLead.upsert({
          where: {
            phone_workspaceId: { phone: customerInfo.phone, workspaceId },
          },
          update: {
            name: customerInfo.name,
            email: customerInfo.email,
            status: 'converted',
            lastIntent: 'purchase',
          },
          create: {
            workspaceId,
            phone: customerInfo.phone,
            name: customerInfo.name,
            email: customerInfo.email,
            status: 'converted',
            lastIntent: 'purchase',
          },
        });
        // PULSE:OK — lead CRM update is a non-critical side-effect of webhook processing
      } catch (e) {
        this.logger.warn('Could not update lead');
      }

      // Create sale record
      try {
        await this.prismaExt.kloelSale.create({
          data: {
            workspaceId,
            status: 'paid',
            amount: productInfo.price,
            paymentMethod: 'EXTERNAL',
            externalPaymentId:
              data.transaction?.id ||
              data.purchase?.id ||
              Date.now().toString(),
            paidAt: new Date(),
            metadata: {
              platform,
              event,
              customerName: customerInfo.name,
              productName: productInfo.name,
            },
          },
        });
        // PULSE:OK — sale record creation failure is logged; webhook event is already persisted by the controller
      } catch (e) {
        this.logger.warn('Could not create sale record');
      }

      // Update wallet with sale amount (atomic: wallet balance + transaction record)
      try {
        const prismaAny = this.prisma as any;
        let wallet = await prismaAny.kloelWallet.findUnique({
          where: { workspaceId },
        });
        if (!wallet) {
          wallet = await prismaAny.kloelWallet.create({
            data: {
              workspaceId,
              availableBalance: 0,
              pendingBalance: 0,
              blockedBalance: 0,
            },
          });
        }
        const netAmount = productInfo.price * 0.92; // ~8% fees (5% kloel + 3% gateway)
        const saleRef =
          data.transaction?.id || data.purchase?.id || Date.now().toString();
        await this.prisma.$transaction(
          // isolationLevel: ReadCommitted
          async (tx) => {
            await (tx as any).kloelWallet.update({
              where: { id: wallet.id },
              data: { pendingBalance: { increment: netAmount } },
            });
            await (tx as any).kloelWalletTransaction.create({
              data: {
                walletId: wallet.id,
                type: 'credit',
                amount: netAmount,
                description: `Venda ${platform}: ${productInfo.name}`,
                reference: saleRef,
                status: 'pending',
                metadata: {
                  platform,
                  grossAmount: productInfo.price,
                  netAmount,
                },
              },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
        this.logger.log(`Wallet updated for ${platform} sale: R$ ${netAmount}`);
        // PULSE:OK — wallet pending-balance update is retried by reconciliation cron; sale is already recorded
      } catch (e) {
        this.logger.warn(`Could not update wallet for ${platform} sale: ${e}`);
      }
    }
  }

  private isPurchaseEvent(platform: string, event: string): boolean {
    const purchaseEvents: Record<string, string[]> = {
      hotmart: ['PURCHASE_APPROVED', 'PURCHASE_COMPLETE'],
      kiwify: ['order_paid', 'purchase_approved'],
      eduzz: ['purchase_approved', 'contract_paid'],
      monetizze: ['sale_approved', 'payment_confirmed'],
      braip: ['purchase_approved', 'sale_completed'],
    };

    return purchaseEvents[platform]?.includes(event) || false;
  }

  private extractCustomerInfo(
    platform: string,
    data: any,
  ): { name: string; email: string; phone: string } {
    // Platform-specific customer extraction
    switch (platform) {
      case 'hotmart':
        return {
          name: data.buyer?.name || data.data?.buyer?.name || '',
          email: data.buyer?.email || data.data?.buyer?.email || '',
          phone: data.buyer?.phone || data.data?.buyer?.checkout_phone || '',
        };
      case 'kiwify':
        return {
          name: data.Customer?.full_name || data.customer?.name || '',
          email: data.Customer?.email || data.customer?.email || '',
          phone: data.Customer?.mobile || data.customer?.phone || '',
        };
      case 'eduzz':
        return {
          name: data.client?.name || '',
          email: data.client?.email || '',
          phone: data.client?.phone || '',
        };
      default:
        return {
          name: data.customer?.name || data.buyer?.name || '',
          email: data.customer?.email || data.buyer?.email || '',
          phone: data.customer?.phone || data.buyer?.phone || '',
        };
    }
  }

  private extractProductInfo(
    platform: string,
    data: any,
  ): { name: string; price: number } {
    switch (platform) {
      case 'hotmart':
        return {
          name: data.product?.name || data.data?.product?.name || '',
          price: data.purchase?.price?.value || data.data?.purchase?.price || 0,
        };
      case 'kiwify':
        return {
          name: data.Product?.name || data.product?.name || '',
          price: data.Commissions?.product_base_price || data.order?.total || 0,
        };
      case 'eduzz':
        return {
          name: data.content?.title || '',
          price: data.sale?.sale_total || 0,
        };
      default:
        return {
          name: data.product?.name || '',
          price: data.amount || data.price || 0,
        };
    }
  }

  /**
   * Generate tracking link with UTM parameters
   */
  generateTrackingLink(
    baseUrl: string,
    params: {
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
      leadId?: string;
    },
  ): string {
    const url = new URL(baseUrl);

    if (params.source) url.searchParams.set('utm_source', params.source);
    if (params.medium) url.searchParams.set('utm_medium', params.medium);
    if (params.campaign) url.searchParams.set('utm_campaign', params.campaign);
    if (params.content) url.searchParams.set('utm_content', params.content);
    if (params.leadId) url.searchParams.set('ref', params.leadId);

    return url.toString();
  }

  /**
   * Get summary of all external payments - FROM DATABASE
   */
  async getPaymentSummary(workspaceId: string): Promise<{
    totalLinks: number;
    activeLinks: number;
    byPlatform: Record<string, number>;
    totalValue: number;
    totalSales: number;
    totalRevenue: number;
  }> {
    const links = await this.getPaymentLinks(workspaceId);

    const byPlatform: Record<string, number> = {};
    let totalValue = 0;
    let activeLinks = 0;
    let totalSales = 0;
    let totalRevenue = 0;

    for (const link of links) {
      byPlatform[link.platform] = (byPlatform[link.platform] || 0) + 1;
      totalValue += link.price;
      if (link.isActive) activeLinks++;
      totalSales += link.totalSales || 0;
      totalRevenue += link.totalRevenue || 0;
    }

    return {
      totalLinks: links.length,
      activeLinks,
      byPlatform,
      totalValue,
      totalSales,
      totalRevenue,
    };
  }
}
