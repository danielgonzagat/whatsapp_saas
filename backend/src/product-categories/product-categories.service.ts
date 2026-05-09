import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductCategoriesService {
  constructor(private prisma: PrismaService) {}

  async listByWorkspace(workspaceId: string) {
    return this.prisma.productCategory.findMany({
      where: { workspaceId, active: true },
      orderBy: { sort: 'asc' },
    });
  }
}
