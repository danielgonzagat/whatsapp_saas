import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { AuthenticatedRequest, RawBodyRequest } from '../common/interfaces';
import { ComplianceService } from './compliance.service';
import { SignedRequestDto } from './dto/signed-request.dto';

@Controller()
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Public()
  @Post('auth/facebook/data-deletion')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async facebookDataDeletion(@Body() body: SignedRequestDto) {
    return this.compliance.createFacebookDeletionRequest(body.signed_request);
  }

  @Public()
  @Post('auth/facebook/deauthorize')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async facebookDeauthorize(@Body() body: SignedRequestDto) {
    await this.compliance.handleFacebookDeauthorize(body.signed_request);
    return {};
  }

  @Public()
  @Post('auth/google/risc-events')
  @HttpCode(202)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async googleRiscEvents(@Req() req: RawBodyRequest, @Body() body: unknown) {
    const rawJwt = this.extractRawJwt(req, body);
    return this.compliance.handleGoogleRiscEvent(rawJwt);
  }

  @Public()
  @Get('compliance/deletion-status/:code')
  async deletionStatus(@Param('code') code: string) {
    return this.compliance.getDeletionStatus(code);
  }

  @Get('user/data-export')
  async userDataExport(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new BadRequestException('Authenticated agent required.');
    }

    return this.compliance.exportAgentData(agentId, req.user?.workspaceId);
  }

  @Delete('user/data-deletion')
  async userDataDeletion(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new BadRequestException('Authenticated agent required.');
    }

    return this.compliance.requestSelfDeletion(agentId, req.user?.workspaceId);
  }

  private extractRawJwt(req: RawBodyRequest, body: unknown) {
    if (Buffer.isBuffer(req.rawBody) && req.rawBody.length > 0) {
      return req.rawBody.toString('utf8').trim();
    }

    if (typeof body === 'string' && body.trim()) {
      return body.trim();
    }

    throw new BadRequestException('Security Event Token body is required.');
  }
}
