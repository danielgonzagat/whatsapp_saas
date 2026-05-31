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
  orderBumpConfigJson,
  paymentMethodsJson,
  shippingConfigJson,
  type AffiliateConfig,
  type CreatePlanDto,
  type OrderBumpConfig,
  type PaymentMethodsConfig,
  type ShippingConfig,
  type UpdatePlanDto,
} from './plan.service.helpers';
import { emitCommerceAlias } from '../kloel/event-taxonomy.canonical-aliases';

export type {
  AffiliateConfig,
  CreatePlanDto,
  OrderBumpConfig,
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

    emitCommerceAlias((name, payload) => this.eventEmitter.emit(name, payload), 'plan.updated', {
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

    emitCommerceAlias((name, payload) => this.eventEmitter.emit(name, payload), 'plan.deleted', {
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

  async setOrderBump(
    workspaceId: string,
    planId: string,
    config: OrderBumpConfig,
    actor?: { id: string },
  ) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const orderBump = orderBumpConfigJson(config);
    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: {
        checkoutImages: checkoutImagesWith(plan.checkoutImages, { orderBump }),
      },
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setOrderBump',
        resource: 'ProductPlan',
        resourceId: planId,
        details: orderBump,
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }

  async setImage(workspaceId: string, planId: string, imageUrl: string, actor?: { id: string }) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, product: { workspaceId } },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const updated = await this.prisma.productPlan.update({
      where: { id: planId },
      data: {
        checkoutImages: checkoutImagesWith(plan.checkoutImages, { imageUrl }),
      },
    });

    if (actor) {
      await this.audit.log({
        workspaceId,
        agentId: actor.id,
        action: 'plan.setImage',
        resource: 'ProductPlan',
        resourceId: planId,
        details: { imageUrl },
      });
    }
    return {
      success: true,
      plan: updated,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Kloel capability resolver adapters.
  //
  // `KloelDomainServiceResolver.tryExecute` calls every domainService method
  // with exactly `(workspaceId, args)`. The fine-grained setters above use
  // positional `(workspaceId, planId, config, actor)` signatures, so each
  // capability points at one of the thin `*FromArgs` adapters below which
  // unpack the resolver `args` object and delegate. Delegate-only — no new
  // mutation logic, no Prisma access.
  // ──────────────────────────────────────────────────────────────────────────

  private requirePlanId(args?: { planId?: string }, op = 'PlanService'): string {
    const planId = typeof args?.planId === 'string' ? args.planId : '';
    if (!planId) {
      throw new NotFoundException(`${op}: args.planId is required`);
    }
    return planId;
  }

  async setPaymentMethodsFromArgs(
    workspaceId: string,
    args?: { planId?: string } & PaymentMethodsConfig,
  ) {
    const planId = this.requirePlanId(args, 'PlanService.setPaymentMethodsFromArgs');
    const { planId: _omit, ...methods } = args ?? {};
    return this.setPaymentMethods(workspaceId, planId, methods);
  }

  async setInstallmentsFromArgs(
    workspaceId: string,
    args?: { planId?: string; maxInstallments?: number },
  ) {
    const planId = this.requirePlanId(args, 'PlanService.setInstallmentsFromArgs');
    const maxInstallments = Number(args?.maxInstallments);
    if (!Number.isFinite(maxInstallments) || maxInstallments < 1) {
      throw new NotFoundException(
        'PlanService.setInstallmentsFromArgs: args.maxInstallments must be >= 1',
      );
    }
    return this.setInstallments(workspaceId, planId, maxInstallments);
  }

  async setCouponsFromArgs(
    workspaceId: string,
    args?: { planId?: string; acceptCoupons?: boolean },
  ) {
    const planId = this.requirePlanId(args, 'PlanService.setCouponsFromArgs');
    return this.setCoupons(workspaceId, planId, Boolean(args?.acceptCoupons));
  }

  async setShippingFromArgs(workspaceId: string, args?: { planId?: string } & ShippingConfig) {
    const planId = this.requirePlanId(args, 'PlanService.setShippingFromArgs');
    const { planId: _omit, ...config } = args ?? {};
    return this.setShipping(workspaceId, planId, config);
  }

  async setVisibilityForAffiliatesFromArgs(
    workspaceId: string,
    args?: { planId?: string; visibleToAffiliates?: boolean },
  ) {
    const planId = this.requirePlanId(args, 'PlanService.setVisibilityForAffiliatesFromArgs');
    return this.setAffiliateConfig(workspaceId, planId, {
      visibleToAffiliates: Boolean(args?.visibleToAffiliates),
    });
  }

  async setCustomCommissionFromArgs(
    workspaceId: string,
    args?: { planId?: string; customCommission?: number },
  ) {
    const planId = this.requirePlanId(args, 'PlanService.setCustomCommissionFromArgs');
    const customCommission = Number(args?.customCommission);
    if (!Number.isFinite(customCommission) || customCommission < 0) {
      throw new NotFoundException(
        'PlanService.setCustomCommissionFromArgs: args.customCommission must be >= 0',
      );
    }
    return this.setAffiliateConfig(workspaceId, planId, { customCommission });
  }

  async setOrderBumpFromArgs(workspaceId: string, args?: { planId?: string } & OrderBumpConfig) {
    const planId = this.requirePlanId(args, 'PlanService.setOrderBumpFromArgs');
    const { planId: _omit, ...config } = args ?? {};
    return this.setOrderBump(workspaceId, planId, config);
  }

  async setImageFromArgs(workspaceId: string, args?: { planId?: string; imageUrl?: string }) {
    const planId = this.requirePlanId(args, 'PlanService.setImageFromArgs');
    const imageUrl = typeof args?.imageUrl === 'string' ? args.imageUrl : '';
    if (!imageUrl) {
      throw new NotFoundException('PlanService.setImageFromArgs: args.imageUrl is required');
    }
    return this.setImage(workspaceId, planId, imageUrl);
  }
}
