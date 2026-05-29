import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MindEventSpine } from '../kloel/mind/coordination';
import {
  buildAffiliateConfigPatch,
  buildPlanObservedPayload,
  buildPlanUpdatedPayload,
  buildPlanUpdatePatch,
  checkoutImagesWith,
  paymentMethodsJson,
  shippingConfigJson,
  type AffiliateConfig,
  type CreatePlanDto,
  type PaymentMethodsConfig,
  type ShippingConfig,
  type UpdatePlanDto,
} from './plan.service.helpers';

export type {
  AffiliateConfig,
  CreatePlanDto,
  PaymentMethodsConfig,
  ShippingConfig,
  UpdatePlanDto,
} from './plan.service.helpers';

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly audit: AuditService,
    @Optional() private readonly brainSpine?: MindEventSpine,
  ) {}

  async create(workspaceId: string, dto: CreatePlanDto, actor?: { id: string }) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, workspaceId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const plan = await this.prisma.productPlan.create({
      data: {
        productId: dto.productId,
        name: dto.name,
        price: dto.price,
        itemsPerPlan: dto.itemsPerPlan ?? 1,
        maxInstallments: dto.maxInstallments ?? 1,
        billingType: dto.billingType ?? 'ONE_TIME',
        visibleToAffiliates: dto.visibleToAffiliates ?? false,
        checkoutImages: checkoutImagesWith(null, {
          acceptCoupons: dto.acceptCoupons ?? false,
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        }),
        active: true,
      },
    });

    this.eventEmitter.emit('mind.plan.observed', {
      planId: plan.id,
      productId: dto.productId,
      workspaceId,
      actorId: actor?.id,
      name: plan.name,
      price: plan.price,
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.create',
        resource: 'ProductPlan',
        resourceId: plan.id,
        details: { name: plan.name, price: plan.price },
      });
    }

    // Feed the cognitive spine: plan creation → belief/prediction cycle
    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `plan:${plan.id}`,
      eventType: 'mind.plan.observed',
      occurredAt: new Date(),
      payload: buildPlanObservedPayload(plan, dto.productId),
    });

    this.logger.log(`Plan created: ${plan.id} "${plan.name}"`);
    return {
      success: true,
      plan,
    };
  }

  async findByProduct(workspaceId: string, productId: string) {
    const plans = await this.prisma.productPlan.findMany({
      where: { productId, product: { workspaceId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      success: true,
      plans,
    };
  }

  async listForProduct(workspaceId: string, productId: string) {
    return this.findByProduct(workspaceId, productId);
  }

  async findById(workspaceId: string, planId: string) {
    return this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
  }

  async update(workspaceId: string, planId: string, dto: UpdatePlanDto, actor?: { id: string }) {
    const existing = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }

    const patch = buildPlanUpdatePatch(dto, existing.checkoutImages);
    if (patch === null) {
      return {
        success: true,
        plan: existing,
        message: 'No changes',
      };
    }

    const { updates, changes } = patch;
    const plan = await this.prisma.productPlan.update({ where: { id: planId }, data: updates });

    this.eventEmitter.emit('plan.updated', {
      planId: plan.id,
      workspaceId,
      actorId: actor?.id,
      changes,
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.update',
        resource: 'ProductPlan',
        resourceId: plan.id,
        details: { changes },
      });
    }

    // Feed the cognitive spine: plan update → belief/prediction cycle
    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `plan:${plan.id}`,
      eventType: 'plan.updated',
      occurredAt: new Date(),
      payload: buildPlanUpdatedPayload(plan, existing.productId, changes),
    });

    return {
      success: true,
      plan,
    };
  }

  /**
   * Canonical-name alias of {@link update} for the Kloel capability resolver
   * (`PlanService.configure`). Accepts the (workspaceId, args) signature
   * used by `KloelDomainServiceResolver`. `args.planId` is required and is
   * split out so the rest of `args` is forwarded as the {@link UpdatePlanDto}
   * patch — order-bump fields, payment methods, shipping config, etc. all
   * pass through unchanged. Delegate-only — no new mutation logic.
   */
  async configure(workspaceId: string, args?: { planId?: string } & Partial<UpdatePlanDto>) {
    const planId = typeof args?.planId === 'string' ? args.planId : '';
    if (!planId) {
      throw new NotFoundException('PlanService.configure: args.planId is required');
    }
    const { planId: _omit, ...dto } = args ?? {};
    return this.update(workspaceId, planId, dto);
  }

  async delete(workspaceId: string, planId: string, actor?: { id: string }) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    await this.prisma.productPlan.delete({ where: { id: planId } });

    this.eventEmitter.emit('plan.deleted', {
      planId,
      workspaceId,
      actorId: actor?.id,
      planName: plan.name,
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.delete',
        resource: 'ProductPlan',
        resourceId: planId,
        details: { name: plan.name },
      });
    }

    return {
      success: true,
      message: `Plan "${plan.name}" deleted`,
    };
  }

  async setPaymentMethods(
    workspaceId: string,
    planId: string,
    methods: PaymentMethodsConfig,
    actor?: { id: string },
  ) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const paymentMethods = paymentMethodsJson(methods);
    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: {
        checkoutImages: checkoutImagesWith(plan.checkoutImages, {
          paymentMethods,
        }),
      },
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setPaymentMethods',
        resource: 'ProductPlan',
        resourceId: planId,
        details: paymentMethods,
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }

  async setInstallments(
    workspaceId: string,
    planId: string,
    maxInstallments: number,
    actor?: { id: string },
  ) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: { maxInstallments },
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setInstallments',
        resource: 'ProductPlan',
        resourceId: planId,
        details: { maxInstallments },
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }

  async setCoupons(
    workspaceId: string,
    planId: string,
    acceptCoupons: boolean,
    actor?: { id: string },
  ) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: {
        checkoutImages: checkoutImagesWith(plan.checkoutImages, { acceptCoupons }),
      },
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setCoupons',
        resource: 'ProductPlan',
        resourceId: planId,
        details: { acceptCoupons },
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }

  async setShipping(
    workspaceId: string,
    planId: string,
    config: ShippingConfig,
    actor?: { id: string },
  ) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const shipping = shippingConfigJson(config);
    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: {
        checkoutImages: checkoutImagesWith(plan.checkoutImages, {
          shipping,
        }),
      },
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setShipping',
        resource: 'ProductPlan',
        resourceId: planId,
        details: shipping,
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }

  async setAffiliateConfig(
    workspaceId: string,
    planId: string,
    config: AffiliateConfig,
    actor?: { id: string },
  ) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const { updates, details } = buildAffiliateConfigPatch(config, plan.checkoutImages);

    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: updates,
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setAffiliateConfig',
        resource: 'ProductPlan',
        resourceId: planId,
        details,
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }
}
