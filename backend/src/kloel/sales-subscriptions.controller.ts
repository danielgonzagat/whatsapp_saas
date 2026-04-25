import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeSubscriptionPlanDto } from './dto/sales-actions.dto';

/** Customer-subscription sub-controller (mounted under /sales). */
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesSubscriptionsController {
  private readonly logger = new Logger(SalesSubscriptionsController.name);

  constructor(private readonly prisma: PrismaService) {}

  private readJsonRecord(value: Prisma.JsonValue | null | undefined) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...value };
    }
    return {} as Prisma.JsonObject;
  }

  private readText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  @Get('subscriptions')
  async listSubscriptions(@Request() req: AuthenticatedRequest, @Query('status') status?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { subscriptions: [], count: 0 };
    }
    const where: Record<string, unknown> = { workspaceId };
    if (status && status !== 'todos') {
      where.status = status;
    }
    const subscriptions = await this.prisma.customerSubscription.findMany({
      where: { ...where, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return { subscriptions, count: subscriptions.length };
  }

  /** Get subscription stats. */
  @Get('subscriptions/stats')
  async getSubscriptionStats(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return {
        mrr: 0,
        arr: 0,
        activeCount: 0,
        totalCount: 0,
        churnRate: 0,
        avgLtv: 0,
        lifecycle: {},
      };
    }
    const subs = await this.prisma.customerSubscription.findMany({
      where: { workspaceId },
    });
    const active = subs.filter((s) => s.status === 'ACTIVE' || s.status === 'TRIALING');
    const mrr = active.reduce((sum, s) => sum + s.amount, 0);
    const totalLtv = subs.reduce((sum, s) => sum + s.totalPaid, 0);
    const cancelled = subs.filter((s) => s.status === 'CANCELLED');
    const churnRate = subs.length > 0 ? (cancelled.length / subs.length) * 100 : 0;

    return {
      mrr,
      arr: mrr * 12,
      activeCount: active.length,
      totalCount: subs.length,
      churnRate: Math.round(churnRate * 10) / 10,
      avgLtv: subs.length > 0 ? Math.round(totalLtv / subs.length) : 0,
      lifecycle: {
        trial: subs.filter((s) => s.status === 'TRIALING').length,
        active: subs.filter((s) => s.status === 'ACTIVE').length,
        past_due: subs.filter((s) => s.status === 'PAST_DUE').length,
        paused: subs.filter((s) => s.status === 'PAUSED').length,
        cancelled: cancelled.length,
      },
    };
  }

  /** Pause subscription. */
  @Post('subscriptions/:id/pause')
  async pauseSubscription(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    // Idempotent: pausing an already-paused subscription is a no-op
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({
      where: { id, workspaceId },
    });
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    await this.prisma.customerSubscription.updateMany({
      where: { id, workspaceId },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'subscription_pause',
          resource: 'subscription',
          resourceId: id,
          agentId: req.user?.sub,
          details: { amount: sub.amount, status: 'completed' },
        },
      });
    } catch (err) {
      this.logger.error(`Failed to create audit log for subscription_pause: ${err}`);
    }

    return { subscription: { ...sub, status: 'PAUSED', pausedAt: new Date() }, success: true };
  }

  /** Resume subscription. */
  @Post('subscriptions/:id/resume')
  async resumeSubscription(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    // Idempotent: resuming an already-active subscription is a no-op
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({
      where: { id, workspaceId },
    });
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    await this.prisma.customerSubscription.updateMany({
      where: { id, workspaceId },
      data: { status: 'ACTIVE', pausedAt: null },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'subscription_resume',
          resource: 'subscription',
          resourceId: id,
          agentId: req.user?.sub,
          details: { amount: sub.amount, status: 'completed' },
        },
      });
    } catch (err) {
      this.logger.error(`Failed to create audit log for subscription_resume: ${err}`);
    }

    return { subscription: { ...sub, status: 'ACTIVE', pausedAt: null }, success: true };
  }

  /** Cancel subscription. */
  @Post('subscriptions/:id/cancel')
  async cancelSubscription(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    // Idempotent: cancelling an already-cancelled subscription is a no-op
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({
      where: { id, workspaceId },
    });
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    await this.prisma.customerSubscription.updateMany({
      where: { id, workspaceId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'subscription_cancel',
          resource: 'subscription',
          resourceId: id,
          agentId: req.user?.sub,
          details: { amount: sub.amount, status: 'completed' },
        },
      });
    } catch (err) {
      this.logger.error(`Failed to create audit log for subscription_cancel: ${err}`);
    }

    return {
      subscription: { ...sub, status: 'CANCELLED', cancelledAt: new Date() },
      success: true,
    };
  }

  /** Change subscription plan. */
  @Put('subscriptions/:id/change-plan')
  async changeSubscriptionPlan(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangeSubscriptionPlanDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    const sub = await this.prisma.customerSubscription.findFirst({
      where: { id, workspaceId },
    });
    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }
    if (sub.status === 'CANCELLED') {
      throw new BadRequestException('Cannot change plan of cancelled subscription');
    }
    const newPlan = await this.prisma.productPlan.findUnique({
      where: { id: dto.newPlanId },
    });
    if (!newPlan) {
      throw new NotFoundException('Plan not found');
    }
    const planChangedAt = new Date();
    const previousPlanId = this.readText(sub.planId);
    const metadata = this.readJsonRecord(sub.metadata);
    await this.prisma.customerSubscription.updateMany({
      where: { id, workspaceId },
      data: {
        planName: newPlan.name,
        amount: newPlan.price,
        planId: dto.newPlanId,
        previousPlanId,
        planChangedAt,
        metadata: {
          ...metadata,
          planId: dto.newPlanId,
          planChangedAt: planChangedAt.toISOString(),
          previousPlanId,
        },
      },
    });
    return {
      subscription: {
        ...sub,
        planName: newPlan.name,
        amount: newPlan.price,
      },
      success: true,
    };
  }
}
