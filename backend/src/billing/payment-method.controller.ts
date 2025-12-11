import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentMethodService } from './payment-method.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Billing - Payment Methods')
@ApiBearerAuth()
@Controller('billing/payment-methods')
@UseGuards(JwtAuthGuard)
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get()
  @ApiOperation({ summary: 'List all payment methods for workspace' })
  @Roles('ADMIN', 'OWNER')
  async listPaymentMethods(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.listPaymentMethods(workspaceId);
  }

  @Post('setup-intent')
  @ApiOperation({ summary: 'Create a Stripe Setup Intent for adding a card' })
  @Roles('ADMIN', 'OWNER')
  async createSetupIntent(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.createSetupIntent(workspaceId);
  }

  @Post('attach')
  @ApiOperation({ summary: 'Attach a payment method to the workspace' })
  @Roles('ADMIN', 'OWNER')
  async attachPaymentMethod(
    @Req() req: any,
    @Body() body: { paymentMethodId: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.attachPaymentMethod(
      workspaceId,
      body.paymentMethodId,
    );
  }

  @Post(':paymentMethodId/default')
  @ApiOperation({ summary: 'Set a payment method as default' })
  @Roles('ADMIN', 'OWNER')
  async setDefault(
    @Req() req: any,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.setDefaultPaymentMethod(
      workspaceId,
      paymentMethodId,
    );
  }

  @Delete(':paymentMethodId')
  @ApiOperation({ summary: 'Remove a payment method' })
  @Roles('ADMIN', 'OWNER')
  async detachPaymentMethod(
    @Req() req: any,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.detachPaymentMethod(
      workspaceId,
      paymentMethodId,
    );
  }
}
