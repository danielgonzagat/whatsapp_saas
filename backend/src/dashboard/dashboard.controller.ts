import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import { HomeQueryDto } from './dto/home-query.dto';
import { RouteClass } from '../common/throttler/route-class.decorator';

const POST_PAYMENT_AUDIT_ACTIONS = [
  'payment_approved',
  'member_access_granted',
  'purchase_confirmation_email_sent',
  'whatsapp_purchase_notification_enqueued',
  'whatsapp_purchase_notification_skipped',
  'facebook_capi_purchase_sent',
  'checkout_social_lead_converted',
  'affiliate_commission_created',
];

/** Dashboard controller. */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('read')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  /** Get stats. */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.dashboardService.getStats(effectiveWorkspaceId);
  }

  /** Get home. */
  @Get('home')
  async getHome(@Req() req: AuthenticatedRequest, @Query() query: HomeQueryDto) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, query.workspaceId);
    const snapshot = await this.dashboardService.getHomeSnapshot(effectiveWorkspaceId, {
      period: query.period,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return {
      ...snapshot,
      products: snapshot.products.map((product) => ({
        ...product,
        imageUrl: normalizeStorageUrlForRequest(product.imageUrl, req) || null,
      })),
    };
  }

  /** Get post-payment effects snapshot. */
  @Get('post-payment')
  async getPostPayment(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const [
      approvedPayments,
      failedPayments,
      paidOrders,
      processingOrders,
      memberEnrollments,
      memberAccessEvents,
      emailEvents,
      whatsappEnqueuedEvents,
      whatsappSkippedEvents,
      facebookCapiEvents,
      convertedSocialLeads,
      affiliateCommissionEvents,
      recentEvents,
    ] = await Promise.all([
      this.prisma.checkoutPayment.count({
        where: { order: { workspaceId: effectiveWorkspaceId }, status: 'APPROVED' },
      }),
      this.prisma.checkoutPayment.count({
        where: {
          order: { workspaceId: effectiveWorkspaceId },
          status: { in: ['DECLINED', 'CANCELED'] },
        },
      }),
      this.prisma.checkoutOrder.count({
        where: { workspaceId: effectiveWorkspaceId, status: 'PAID' },
      }),
      this.prisma.checkoutOrder.count({
        where: { workspaceId: effectiveWorkspaceId, status: 'PROCESSING' },
      }),
      this.prisma.memberEnrollment.count({
        where: { workspaceId: effectiveWorkspaceId, status: 'active' },
      }),
      this.countAudit(effectiveWorkspaceId, 'member_access_granted'),
      this.countAudit(effectiveWorkspaceId, 'purchase_confirmation_email_sent'),
      this.countAudit(effectiveWorkspaceId, 'whatsapp_purchase_notification_enqueued'),
      this.countAudit(effectiveWorkspaceId, 'whatsapp_purchase_notification_skipped'),
      this.countAudit(effectiveWorkspaceId, 'facebook_capi_purchase_sent'),
      this.prisma.checkoutSocialLead.count({
        where: { workspaceId: effectiveWorkspaceId, status: 'CONVERTED' },
      }),
      this.prisma.auditLog.findMany({
        where: { workspaceId: effectiveWorkspaceId, action: 'affiliate_commission_created' },
        select: { details: true },
      }),
      this.prisma.auditLog.findMany({
        where: { workspaceId: effectiveWorkspaceId, action: { in: POST_PAYMENT_AUDIT_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: {
          id: true,
          action: true,
          resource: true,
          resourceId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      payments: { approved: approvedPayments, failed: failedPayments },
      orders: { paid: paidOrders, processing: processingOrders },
      memberAccess: { activeEnrollments: memberEnrollments, grants: memberAccessEvents },
      notifications: {
        purchaseEmailsSent: emailEvents,
        whatsappEnqueued: whatsappEnqueuedEvents,
        whatsappSkipped: whatsappSkippedEvents,
      },
      tracking: {
        facebookCapiPurchases: facebookCapiEvents,
        convertedSocialLeads,
      },
      affiliateCommissions: {
        created: affiliateCommissionEvents.length,
        totalInCents: affiliateCommissionEvents.reduce(
          (total, event) => total + extractCommissionInCents(event.details),
          0,
        ),
      },
      recentEvents: recentEvents.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private countAudit(workspaceId: string, action: string) {
    return this.prisma.auditLog.count({ where: { workspaceId, action } });
  }
}

function extractCommissionInCents(details: unknown) {
  if (!details || typeof details !== 'object') {
    return 0;
  }
  const candidate = details as Record<string, unknown>;
  const cents = Number(candidate.commissionInCents ?? candidate.commissionAmountInCents);
  if (Number.isFinite(cents)) {
    return Math.max(0, Math.round(cents));
  }
  const amount = Number(candidate.commissionAmount ?? candidate.commission);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}
