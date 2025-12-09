import { Controller, Post, Get, Body, Param, Query, HttpCode, Logger } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('kloel/payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook')
  @HttpCode(200)
  async paymentWebhook(@Body() body: { event: string; payment: any }) {
    await this.paymentService.processPaymentWebhook(body.event, body.payment);
    return { received: true };
  }

  @Post('create/:workspaceId')
  async createPayment(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { leadId: string; customerName: string; customerPhone: string; amount: number; description?: string; productName?: string },
  ) {
    const payment = await this.paymentService.createPayment({
      workspaceId,
      ...body,
      description: body.description || body.productName || 'Pagamento KLOEL',
    });

    return {
      success: true,
      paymentLink: payment.paymentLink || payment.invoiceUrl || payment.pixCopyPaste,
      payment,
    };
  }

  @Get('report/:workspaceId')
  async salesReport(@Param('workspaceId') workspaceId: string, @Query('period') period: string = 'week') {
    return this.paymentService.getSalesReport(workspaceId, period);
  }

  @Get('status')
  getStatus() {
    return { status: 'online', service: 'KLOEL Payment Service' };
  }
}
