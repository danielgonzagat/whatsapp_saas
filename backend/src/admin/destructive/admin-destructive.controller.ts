import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../../auth/public.decorator';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { DestructiveIntentService } from './destructive-intent.service';
import { CreateDestructiveIntentDto } from './dto/create-destructive-intent.dto';
import { ConfirmDestructiveIntentDto } from './dto/confirm-destructive-intent.dto';
import { UndoDestructiveIntentDto } from './dto/undo-destructive-intent.dto';

function extractClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
}

function extractUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : 'unknown';
}

/**
 * SP-8 destructive operations controller. Creating an intent always
 * requires the AUDIT_LOG:VIEW permission plus one module-specific
 * permission which is enforced inside the service/handlers. Confirm
 * and undo routes require only that the caller is authenticated —
 * the challenge + createdByAdminUserId match is the second factor.
 */
@Public()
@Controller('admin/destructive-intents')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
export class AdminDestructiveController {
  constructor(private readonly intents: DestructiveIntentService) {}

  /** Create. */
  @Post()
  @RequireAdminPermission(AdminModule.AUDIT_LOG, AdminAction.VIEW)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateDestructiveIntentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.intents.create({
      adminUserId: admin.id,
      kind: dto.kind,
      targetType: dto.targetType,
      targetId: dto.targetId,
      reason: dto.reason,
      ip: extractClientIp(req),
      userAgent: extractUserAgent(req),
      ttlSeconds: dto.ttlSeconds,
    });
  }

  /** Get. */
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.intents.get(id);
  }

  /** Confirm. */
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmDestructiveIntentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.intents.confirm({
      intentId: id,
      adminUserId: admin.id,
      challenge: dto.challenge,
      ip: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });
  }

  /** Undo. */
  @Post(':id/undo')
  @HttpCode(HttpStatus.OK)
  async undo(
    @Param('id') id: string,
    @Body() dto: UndoDestructiveIntentDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Req() req: Request,
  ) {
    return this.intents.undo({
      intentId: id,
      adminUserId: admin.id,
      undoToken: dto.undoToken,
      ip: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });
  }
}
