import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  private readonly logger = new Logger(ProductCategoriesService.name);

  constructor(private prisma: PrismaService) {
    this.logger.log('ProductCategoriesService initialized');
  }

  async listByWorkspace(workspaceId: string) {
    return this.prisma.product.findMany({
      where: { workspaceId, active: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
      select: { category: true },
    });
  }
}
