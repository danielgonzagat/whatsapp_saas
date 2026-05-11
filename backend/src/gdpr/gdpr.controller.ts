import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { DeleteRequestDto } from './dto/delete-request.dto';
import { ExportRequestDto } from './dto/export-request.dto';
import { VerifyIdentityDto } from './dto/verify-identity.dto';
import { VerifyIdentityQueryDto } from './dto/verify-identity-query.dto';
import { GdprService } from './gdpr.service';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Gdpr controller. */
@Controller('gdpr')
@RouteClass('mutate')
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  /** Request data export. */
  @Post('export-request')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  async exportRequest(@Req() req: AuthenticatedRequest, @Body() _body: ExportRequestDto) {
    const userId = req.user.sub;
    const workspaceId = req.user.workspaceId;
    return this.gdprService.requestExport(userId, workspaceId);
  }

  /** Request data deletion. */
  @Post('delete-request')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  async deleteRequest(@Req() req: AuthenticatedRequest, @Body() _body: DeleteRequestDto) {
    const userId = req.user.sub;
    const workspaceId = req.user.workspaceId;
    return this.gdprService.requestDeletion(userId, workspaceId);
  }

  /** Verify identity and proceed with processing. */
  @Post('verify/:code')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  async verifyIdentity(@Param('code') code: string, @Query() query: VerifyIdentityQueryDto) {
    return this.gdprService.verifyIdentity(code, query.token);
  }

  /** Verify identity via POST body. */
  @Post('verify')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  async verifyIdentityPost(@Body() body: VerifyIdentityDto, @Query('code') code: string) {
    return this.gdprService.verifyIdentity(code || '', body.token);
  }

  /** Get status by code — public endpoint. */
  @Public()
  @Get('status/:code')
  async getStatus(@Param('code') code: string) {
    return this.gdprService.getStatus(code);
  }

  /** Facebook data deletion callback — public endpoint. */
  @Public()
  @HttpCode(200)
  @Post('facebook-callback')
  async facebookCallback(@Body('signed_request') signedRequest?: string) {
    return this.gdprService.handleFacebookCallback(String(signedRequest || ''));
  }
}
