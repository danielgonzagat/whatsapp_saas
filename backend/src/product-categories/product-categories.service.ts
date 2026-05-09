import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  private readonly logger = new Logger(ProductCategoriesService.name);

  constructor(private prisma: PrismaService) {}

  async listByWorkspace(workspaceId: string) {
    return this.prisma.productCategory.findMany({
      where: { workspaceId, active: true },
      orderBy: { sort: 'asc' },
    });
  }
}
