import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { AttachPaymentMethodDto } from './dto/attach-payment-method.dto';
import { PaymentMethodService } from './payment-method.service';

/** Payment method controller. */
@ApiTags('Billing - Payment Methods')
@ApiBearerAuth()
@Controller('billing/payment-methods')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get()
  @ApiOperation({ summary: 'List all payment methods for workspace' })
  @Roles('ADMIN', 'OWNER')
  async listPaymentMethods(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.listPaymentMethods(workspaceId);
  }

  @Post('setup-intent')
  @ApiOperation({ summary: 'Create a Stripe Setup Intent for adding a card' })
  @Roles('ADMIN', 'OWNER')
  async createSetupIntent(@Req() req: AuthenticatedRequest, @Body() body?: { returnUrl?: string }) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.createSetupIntent(workspaceId, body?.returnUrl);
  }

  @Post('attach')
  @ApiOperation({ summary: 'Attach a payment method to the workspace' })
  @Roles('ADMIN', 'OWNER')
  async attachPaymentMethod(
    @Req() req: AuthenticatedRequest,
    @Body() body: AttachPaymentMethodDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.attachPaymentMethod(workspaceId, body.paymentMethodId);
  }

  @Post(':paymentMethodId/default')
  @ApiOperation({ summary: 'Set a payment method as default' })
  @Roles('ADMIN', 'OWNER')
  async setDefault(
    @Req() req: AuthenticatedRequest,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.setDefaultPaymentMethod(workspaceId, paymentMethodId);
  }

  @Delete(':paymentMethodId')
  @ApiOperation({ summary: 'Remove a payment method' })
  @Roles('ADMIN', 'OWNER')
  async detachPaymentMethod(
    @Req() req: AuthenticatedRequest,
    @Param('paymentMethodId') paymentMethodId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.paymentMethodService.detachPaymentMethod(workspaceId, paymentMethodId);
  }
}
