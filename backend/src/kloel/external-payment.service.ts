import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class ExternalPaymentService {
  private readonly logger = new Logger(ExternalPaymentService.name);
  // Fallback in-memory for configs (can be migrated to DB later)
  private platformConfigs: Map<string, PaymentPlatformConfig[]> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add an external payment link - NOW PERSISTED TO DATABASE
   */
  async addPaymentLink(workspaceId: string, data: {
    platform: ExternalPaymentLink['platform'];
    productName: string;
    price: number;
    paymentUrl: string;
    checkoutUrl?: string;
    affiliateUrl?: string;
  }): Promise<ExternalPaymentLink> {
    const prismaAny = this.prisma as any;
    
    const link = await prismaAny.externalPaymentLink.create({
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

    this.logger.log(`Added ${data.platform} payment link: ${data.productName} for R$${data.price}`);

    // Also save to memory service for KLOEL to use
    try {
      await prismaAny.kloelMemory.create({
        data: {
          workspaceId,
          key: `payment_link_${link.id}`,
          value: link,
          category: 'payment_link',
          content: `LINK DE PAGAMENTO: ${data.productName} - R$${data.price} - ${data.platform.toUpperCase()} - ${data.paymentUrl}`,
        },
      });
    } catch (e) {
      this.logger.warn('Could not save payment link to memory');
    }

    return link;
  }

  /**
   * Get all payment links for a workspace - FROM DATABASE
   */
  async getPaymentLinks(workspaceId: string): Promise<ExternalPaymentLink[]> {
    const prismaAny = this.prisma as any;
    return prismaAny.externalPaymentLink.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a specific payment link - FROM DATABASE
   */
  async getPaymentLink(workspaceId: string, linkId: string): Promise<ExternalPaymentLink | null> {
    const prismaAny = this.prisma as any;
    return prismaAny.externalPaymentLink.findFirst({
      where: { id: linkId, workspaceId },
    });
  }

  /**
   * Find payment links by product name (for KLOEL to use) - FROM DATABASE
   */
  async findByProductName(workspaceId: string, productName: string): Promise<ExternalPaymentLink[]> {
    const prismaAny = this.prisma as any;
    return prismaAny.externalPaymentLink.findMany({
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
  async toggleLink(workspaceId: string, linkId: string): Promise<ExternalPaymentLink | null> {
    const prismaAny = this.prisma as any;
    
    const existing = await prismaAny.externalPaymentLink.findFirst({
      where: { id: linkId, workspaceId },
    });
    
    if (!existing) return null;
    
    const updated = await prismaAny.externalPaymentLink.update({
      where: { id: linkId },
      data: { isActive: !existing.isActive },
    });
    
    this.logger.log(`Payment link ${linkId} is now ${updated.isActive ? 'active' : 'inactive'}`);
    return updated;
  }

  /**
   * Delete a payment link - FROM DATABASE
   */
  async deleteLink(workspaceId: string, linkId: string): Promise<boolean> {
    const prismaAny = this.prisma as any;
    
    try {
      await prismaAny.externalPaymentLink.delete({
        where: { id: linkId },
      });
      this.logger.log(`Deleted payment link ${linkId}`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Update sales stats when webhook received
   */
  async recordSale(workspaceId: string, linkId: string, amount: number): Promise<void> {
    const prismaAny = this.prisma as any;
    
    await prismaAny.externalPaymentLink.update({
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
  async configurePlatform(workspaceId: string, config: PaymentPlatformConfig): Promise<void> {
    const configs = this.platformConfigs.get(workspaceId) || [];
    const existingIndex = configs.findIndex(c => c.platform === config.platform);
    
    if (existingIndex > -1) {
      configs[existingIndex] = config;
    } else {
      configs.push(config);
    }
    
    this.platformConfigs.set(workspaceId, configs);
    this.logger.log(`Configured ${config.platform} for workspace ${workspaceId}`);
  }

  /**
   * Get platform configurations
   */
  async getPlatformConfigs(workspaceId: string): Promise<PaymentPlatformConfig[]> {
    return this.platformConfigs.get(workspaceId) || [];
  }

  /**
   * Handle webhook from external platforms
   */
  async handlePlatformWebhook(
    workspaceId: string,
    platform: string,
    event: string,
    data: any
  ): Promise<void> {
    this.logger.log(`Webhook from ${platform}: ${event}`);

    const prismaAny = this.prisma as any;

    // Map platform events to our internal events
    const isPurchase = this.isPurchaseEvent(platform, event);
    
    if (isPurchase) {
      const customerInfo = this.extractCustomerInfo(platform, data);
      const productInfo = this.extractProductInfo(platform, data);

      this.logger.log(`Purchase detected: ${productInfo.name} by ${customerInfo.name}`);

      // Create/update lead
      try {
        await prismaAny.kloelLead.upsert({
          where: { phone_workspaceId: { phone: customerInfo.phone, workspaceId } },
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
      } catch (e) {
        this.logger.warn('Could not update lead');
      }

      // Create sale record
      try {
        await prismaAny.kloelSale.create({
          data: {
            workspaceId,
            status: 'paid',
            amount: productInfo.price,
            paymentMethod: 'EXTERNAL',
            externalPaymentId: data.transaction?.id || data.purchase?.id || Date.now().toString(),
            paidAt: new Date(),
            metadata: {
              platform,
              event,
              customerName: customerInfo.name,
              productName: productInfo.name,
            },
          },
        });
      } catch (e) {
        this.logger.warn('Could not create sale record');
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

  private extractCustomerInfo(platform: string, data: any): { name: string; email: string; phone: string } {
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

  private extractProductInfo(platform: string, data: any): { name: string; price: number } {
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
  generateTrackingLink(baseUrl: string, params: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    leadId?: string;
  }): string {
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
