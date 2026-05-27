import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BrainEventSpineService } from '../kloel/brain-event-spine.service';

export interface CreatePlanDto {
  productId: string;
  name: string;
  price: number;
  itemsPerPlan?: number;
  maxInstallments?: number;
  billingType?: string;
  visibleToAffiliates?: boolean;
  acceptCoupons?: boolean;
  imageUrl?: string;
}

export interface UpdatePlanDto {
  name?: string;
  price?: number;
  active?: boolean;
  maxInstallments?: number;
  itemsPerPlan?: number;
  billingType?: string;
  visibleToAffiliates?: boolean;
  acceptCoupons?: boolean;
  imageUrl?: string;
}

export interface PaymentMethodsConfig {
  card?: boolean;
  pix?: boolean;
  boleto?: boolean;
}

export interface ShippingConfig {
  type?: 'FIXED' | 'VARIABLE' | 'FREE' | 'NONE';
  fixedValue?: number;
  originCep?: string;
}

export interface AffiliateConfig {
  visibleToAffiliates?: boolean;
  customCommission?: number;
}

function checkoutImagesObject(value: unknown): Prisma.InputJsonObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  return {};
}

function checkoutImagesWith(
  current: unknown,
  patch: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
  return { ...checkoutImagesObject(current), ...patch };
}

function paymentMethodsJson(
  methods: PaymentMethodsConfig,
): Prisma.InputJsonObject & Record<string, unknown> {
  return {
    ...(methods.card !== undefined ? { card: methods.card } : {}),
    ...(methods.pix !== undefined ? { pix: methods.pix } : {}),
    ...(methods.boleto !== undefined ? { boleto: methods.boleto } : {}),
  };
}

function shippingConfigJson(
  config: ShippingConfig,
): Prisma.InputJsonObject & Record<string, unknown> {
  return {
    ...(config.type !== undefined ? { type: config.type } : {}),
    ...(config.fixedValue !== undefined ? { fixedValue: config.fixedValue } : {}),
    ...(config.originCep !== undefined ? { originCep: config.originCep } : {}),
  };
}

@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly audit: AuditService,
    @Optional() private readonly brainSpine?: BrainEventSpineService,
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

    this.eventEmitter.emit('plan.created', {
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
      eventType: 'plan.created',
      occurredAt: new Date(),
      payload: {
        planId: plan.id,
        name: plan.name,
        priceInCents: plan.price !== null ? Math.round(Number(plan.price) * 100) : null,
        productId: dto.productId,
      },
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

    const updates: Record<string, unknown> = {};
    const checkoutImageUpdates: Prisma.InputJsonObject = {
      ...(dto.acceptCoupons !== undefined ? { acceptCoupons: Boolean(dto.acceptCoupons) } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
    };

    if (dto.name !== undefined) {
      updates.name = dto.name;
    }
    if (dto.price !== undefined) {
      updates.price = Number(dto.price);
    }
    if (dto.active !== undefined) {
      updates.active = Boolean(dto.active);
    }
    if (dto.maxInstallments !== undefined) {
      updates.maxInstallments = Number(dto.maxInstallments);
    }
    if (dto.itemsPerPlan !== undefined) {
      updates.itemsPerPlan = Number(dto.itemsPerPlan);
    }
    if (dto.billingType !== undefined) {
      updates.billingType = dto.billingType;
    }
    if (dto.visibleToAffiliates !== undefined) {
      updates.visibleToAffiliates = Boolean(dto.visibleToAffiliates);
    }
    if (Object.keys(checkoutImageUpdates).length > 0) {
      updates.checkoutImages = checkoutImagesWith(existing.checkoutImages, checkoutImageUpdates);
    }

    if (Object.keys(updates).length === 0) {
      return {
        success: true,
        plan: existing,
        message: 'No changes',
      };
    }

    const plan = await this.prisma.productPlan.update({ where: { id: planId }, data: updates });

    this.eventEmitter.emit('plan.updated', {
      planId: plan.id,
      workspaceId,
      actorId: actor?.id,
      changes: Object.keys(updates),
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.update',
        resource: 'ProductPlan',
        resourceId: plan.id,
        details: { changes: Object.keys(updates) },
      });
    }

    // Feed the cognitive spine: plan update → belief/prediction cycle
    await this.brainSpine?.recordCommercial({
      workspaceId,
      subject: `plan:${plan.id}`,
      eventType: 'plan.updated',
      occurredAt: new Date(),
      payload: {
        planId: plan.id,
        name: plan.name,
        priceInCents: plan.price !== null ? Math.round(Number(plan.price) * 100) : null,
        productId: existing.productId,
        changes: Object.keys(updates),
      },
    });

    return {
      success: true,
      plan,
    };
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

    const updates: Record<string, unknown> = {};
    const details: Record<string, unknown> = {};
    if (config.visibleToAffiliates !== undefined) {
      updates.visibleToAffiliates = config.visibleToAffiliates;
      details.visibleToAffiliates = config.visibleToAffiliates;
    }
    if (config.customCommission !== undefined) {
      updates.checkoutImages = checkoutImagesWith(plan.checkoutImages, {
        customCommission: config.customCommission,
      });
      details.customCommission = config.customCommission;
    }

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
