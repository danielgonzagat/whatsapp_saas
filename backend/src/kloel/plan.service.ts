import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);
  
  constructor(private readonly prisma: PrismaService) {}
  
  async create(workspaceId: string, data: {
    productId: string;
    name: string;
    price: number;
    itemsPerPlan?: number;
    maxInstallments?: number;
    billingType?: string;
    visibleToAffiliates?: boolean;
  }) {
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, workspaceId },
    });
    if (!product) return { success: false, error: 'product_not_found' };
    
    const plan = await this.prisma.productPlan.create({
      data: {
        productId: data.productId,
        name: data.name,
        price: data.price,
        itemsPerPlan: data.itemsPerPlan ?? 1,
        maxInstallments: data.maxInstallments ?? 1,
        billingType: data.billingType ?? 'ONE_TIME',
        visibleToAffiliates: data.visibleToAffiliates ?? false,
        active: true,
      },
    });
    
    this.logger.log(`Plan created: ${plan.id} "${plan.name}"`);
    return { success: true, plan: { id: plan.id, name: plan.name, price: plan.price } };
  }
  
  async listForProduct(workspaceId: string, productId: string) {
    const plans = await this.prisma.productPlan.findMany({
      where: { productId, product: { workspaceId } },
      select: { id: true, name: true, price: true, active: true, maxInstallments: true },
    });
    return { success: true, plans };
  }
  
  async update(workspaceId: string, planId: string, data: Record<string, unknown>) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) return { success: false, error: 'plan_not_found' };
    
    const updates: Record<string, unknown> = {};
    if (data.price !== undefined) updates.price = Number(data.price);
    if (data.active !== undefined) updates.active = Boolean(data.active);
    if (data.maxInstallments !== undefined) updates.maxInstallments = Number(data.maxInstallments);
    
    await this.prisma.productPlan.update({ where: { id: planId }, data: updates });
    return { success: true, message: 'Plan updated' };
  }
  
  async delete(workspaceId: string, planId: string) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) return { success: false, error: 'plan_not_found' };
    await this.prisma.productPlan.delete({ where: { id: planId } });
    return { success: true, message: `Plan "${plan.name}" deleted` };
  }
}
