import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PaymentService } from './payment.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('kloel/payments')
@UseGuards(ThrottlerGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // Webhooks precisam de limite alto
  async paymentWebhook(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body()
    body: {
      event: string;
      payment: Record<string, unknown> & { workspaceId?: string };
      workspaceId?: string;
    },
  ) {
    const expected = process.env.PAYMENT_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new ForbiddenException('PAYMENT_WEBHOOK_SECRET not configured');
    }
    if (expected) {
      if (!secret || secret !== expected) {
        throw new ForbiddenException('invalid_webhook_secret');
      }
    }

    const rawWsId =
      body.workspaceId ||
      (body?.payment?.metadata as Record<string, unknown> | undefined)?.workspaceId ||
      body?.payment?.workspaceId;
    const workspaceId = typeof rawWsId === 'string' ? rawWsId : undefined;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }

    await this.paymentService.processPaymentWebhook(workspaceId, body.event, body.payment);
    return { received: true };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('create/:workspaceId')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // Máximo 10 criações de pagamento por minuto
  async createPayment(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      leadId: string;
      customerName: string;
      customerPhone: string;
      amount: number;
      description?: string;
      productName?: string;
    },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const payment = await this.paymentService.createPayment({
      workspaceId: effectiveWorkspaceId,
      ...body,
      description: body.description || body.productName || 'Pagamento KLOEL',
    });

    return {
      success: true,
      paymentLink: payment.paymentLink || payment.invoiceUrl || payment.pixCopyPaste,
      payment,
    };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('report/:workspaceId')
  async salesReport(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Query('period') period: string = 'week',
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.paymentService.getSalesReport(effectiveWorkspaceId, period);
  }

  @Get('status')
  getStatus() {
    return { status: 'online', service: 'KLOEL Payment Service' };
  }

  @Public()
  @Get('public/:paymentId')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getPublicPayment(@Param('paymentId') paymentId: string) {
    const payment = await this.paymentService.getPublicPayment(paymentId);
    if (!payment) {
      throw new NotFoundException('payment_not_found');
    }
    return payment;
  }
}
