import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { ShipOrderDto } from './dto/sales-actions.dto';
import { OrderAlertsService } from './order-alerts.service';

const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9.-]/g;

/** Physical-order and order-alert sub-controller (mounted under /sales). */
@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderAlertsService: OrderAlertsService,
  ) {}

  @Get('orders')
  async listOrders(@Request() req: AuthenticatedRequest, @Query('status') status?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { orders: [], count: 0 };
    }
    const where: Record<string, unknown> = { workspaceId };
    if (status && status !== 'todos') {
      where.status = status;
    }
    const orders = await this.prisma.physicalOrder.findMany({
      where: { ...where, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return { orders, count: orders.length };
  }

  /** Get order stats. */
  @Get('orders/stats')
  async getOrderStats(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { total: 0, processing: 0, shipped: 0, delivered: 0 };
    }
    const orders = await this.prisma.physicalOrder.findMany({
      where: { workspaceId },
    });
    return {
      total: orders.length,
      processing: orders.filter((o) => o.status === 'PROCESSING').length,
      shipped: orders.filter((o) => o.status === 'SHIPPED').length,
      delivered: orders.filter((o) => o.status === 'DELIVERED').length,
    };
  }

  /** Get order pipeline. */
  @Get('orders/pipeline')
  async getOrderPipeline(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return {
        processing: 0,
        shipped: 0,
        delivered: 0,
        returned: 0,
        cancelled: 0,
      };
    }
    const orders = await this.prisma.physicalOrder.findMany({
      where: { workspaceId },
    });
    return {
      processing: orders.filter((o) => o.status === 'PROCESSING').length,
      shipped: orders.filter((o) => o.status === 'SHIPPED').length,
      delivered: orders.filter((o) => o.status === 'DELIVERED').length,
      returned: orders.filter((o) => o.status === 'RETURNED').length,
      cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
    };
  }

  /** Ship order. */
  @Put('orders/:id/ship')
  async shipOrder(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ShipOrderDto,
  ) {
    const workspaceId = req.user?.workspaceId;
    const order = await this.prisma.physicalOrder.findFirst({
      where: { id, workspaceId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Sanitize tracking code — only alphanumeric, dashes, and dots allowed
    const sanitizedCode = dto.trackingCode.replace(A_Z_A_Z0_9_RE, '');
    if (sanitizedCode !== dto.trackingCode) {
      throw new BadRequestException('Codigo de rastreio contem caracteres invalidos');
    }

    // Support multiple carriers for the tracking URL
    const carrierUrls: Record<string, string> = {
      correios: `https://rastreamento.correios.com.br/app/index.php?objeto=${sanitizedCode}`,
      jadlog: `https://www.jadlog.com.br/jadlog/tracking?cte=${sanitizedCode}`,
      default: '',
    };
    const trackingUrl =
      carrierUrls[dto.shippingMethod?.toLowerCase() || 'default'] || carrierUrls.correios;

    await this.prisma.physicalOrder.updateMany({
      where: { id, workspaceId },
      data: {
        status: 'SHIPPED',
        trackingCode: sanitizedCode,
        shippingMethod: dto.shippingMethod,
        shippedAt: new Date(),
        trackingUrl,
      },
    });
    return {
      order: {
        ...order,
        status: 'SHIPPED',
        trackingCode: sanitizedCode,
        shippingMethod: dto.shippingMethod,
        shippedAt: new Date(),
        trackingUrl,
      },
      success: true,
    };
  }

  /** Deliver order. */
  @Put('orders/:id/deliver')
  async deliverOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const order = await this.prisma.physicalOrder.findFirst({
      where: { id, workspaceId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.prisma.physicalOrder.updateMany({
      where: { id, workspaceId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    return { order: { ...order, status: 'DELIVERED', deliveredAt: new Date() }, success: true };
  }

  /** Return order. */
  @Put('orders/:id/return')
  async returnOrder(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    const order = await this.prisma.physicalOrder.findFirst({
      where: { id, workspaceId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    await this.prisma.physicalOrder.updateMany({
      where: { id, workspaceId },
      data: { status: 'RETURNED' },
    });
    return { order: { ...order, status: 'RETURNED' }, success: true };
  }

  @Get('orders/alerts')
  async getOrderAlerts(@Request() req: AuthenticatedRequest, @Query('resolved') resolved?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { alerts: [], counts: {} };
    }
    const resolvedFilter = resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.orderAlertsService.getAlerts(workspaceId, resolvedFilter);
  }

  /** Generate order alerts. */
  @Post('orders/alerts/generate')
  async generateOrderAlerts(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return { created: 0 };
    }
    return this.orderAlertsService.generateAlerts(workspaceId);
  }

  /** Resolve order alert. */
  @Post('orders/alerts/:id/resolve')
  async resolveOrderAlert(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      throw new NotFoundException('Workspace not found');
    }
    return this.orderAlertsService.resolveAlert(id, workspaceId);
  }
}
