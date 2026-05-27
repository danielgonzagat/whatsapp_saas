import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentWorkspaceId } from '../common/decorators/current-workspace-id.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';

import { AttachPaymentMethodDto } from './dto/attach-payment-method.dto';
import { PaymentMethodService } from './payment-method.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Payment method controller. */
@ApiTags('Billing - Payment Methods')
@ApiBearerAuth()
@Controller('billing/payment-methods')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  /** List payment methods. */
  @Get()
  @ApiOperation({ summary: 'List all payment methods for workspace' })
  @Roles('ADMIN', 'OWNER')
  async listPaymentMethods(@CurrentWorkspaceId() workspaceId: string) {
    return this.paymentMethodService.listPaymentMethods(workspaceId);
  }

  /** Create setup intent. */
  @Post('setup-intent')
  @ApiOperation({ summary: 'Create a Stripe Setup Intent for adding a card' })
  @Roles('ADMIN', 'OWNER')
  @Idempotent()
  async createSetupIntent(@CurrentWorkspaceId() workspaceId: string, @Body() body?: { returnUrl?: string }) {
    return this.paymentMethodService.createSetupIntent(workspaceId, body?.returnUrl);
  }

  /** Attach payment method. */
  @Post('attach')
  @ApiOperation({ summary: 'Attach a payment method to the workspace' })
  @Roles('ADMIN', 'OWNER')
  @Idempotent()
  async attachPaymentMethod(
    @CurrentWorkspaceId() workspaceId: string,
    @Body() body: AttachPaymentMethodDto,
  ) {
    return this.paymentMethodService.attachPaymentMethod(workspaceId, body.paymentMethodId);
  }

  /** Set default. */
  @Post(':paymentMethodId/default')
  @ApiOperation({ summary: 'Set a payment method as default' })
  @Roles('ADMIN', 'OWNER')
  @Idempotent()
  async setDefault(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    return this.paymentMethodService.setDefaultPaymentMethod(workspaceId, paymentMethodId);
  }

  /** Detach payment method. */
  @Delete(':paymentMethodId')
  @ApiOperation({ summary: 'Remove a payment method' })
  @Roles('ADMIN', 'OWNER')
  async detachPaymentMethod(
    @CurrentWorkspaceId() workspaceId: string,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    return this.paymentMethodService.detachPaymentMethod(workspaceId, paymentMethodId);
  }
}
