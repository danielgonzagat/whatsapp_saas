import {  Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { asProviderSettings } from '../../whatsapp/provider-settings.types';
import {
  normalizeWhatsAppSelectedProducts,
  extractSetupConfigField,
} from '../marketing-connect.helpers';

@Injectable()
export class WhatsAppSummaryService {
  private readonly logger = new Logger(WhatsAppSummaryService.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.debug?.(`WhatsAppSummaryService initialized`);}

  async getSummary(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const providerSettings = asProviderSettings(workspace?.providerSettings);
    const setup = providerSettings.whatsappLifecycle ?? {};

    const selectedProducts = normalizeWhatsAppSelectedProducts(setup.selectedProducts);
    const productNames = [
      ...new Set(selectedProducts.map((product) => product.name).filter(Boolean)),
    ];

    const salesByProduct =
      productNames.length > 0
        ? await this.prisma.kloelSale.groupBy({
            by: ['productName'],
            where: {
              workspaceId,
              status: 'paid',
              productName: { in: productNames },
            },
            _count: { id: true },
            _sum: { amount: true },
          })
        : [];
    const salesMap = new Map<string, { salesCount: number; revenue: number }>(
      salesByProduct.map((item) => [
        String(item.productName || ''),
        {
          salesCount: Number(item._count.id) || 0,
          revenue: Number(item._sum.amount) || 0,
        },
      ]),
    );

    return {
      configured: selectedProducts.length > 0,
      sessionName: typeof setup.sessionName === 'string' ? setup.sessionName : workspaceId,
      configuredAt: setup.configuredAt || null,
      activatedAt: setup.activatedAt || null,
      arsenalCount: Array.isArray(setup.arsenal) ? setup.arsenal.length : 0,
      tone: extractSetupConfigField(setup, 'tone', null),
      maxDiscount: Number(extractSetupConfigField(setup, 'maxDiscount', 0)) || 0,
      followUpEnabled: Boolean(extractSetupConfigField(setup, 'followUpEnabled', false)),
      selectedProducts: selectedProducts.map((product) => {
        const performance = salesMap.get(product.name) || { salesCount: 0, revenue: 0 };
        return { ...product, salesCount: performance.salesCount, revenue: performance.revenue };
      }),
    };
  }
}
