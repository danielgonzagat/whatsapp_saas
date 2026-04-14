import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { CreateAffiliateDto } from './dto/create-affiliate.dto';
import { PartnershipsService } from './partnerships.service';

@Controller('partnerships')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class PartnershipsController {
  constructor(private readonly service: PartnershipsService) {}

  private getWorkspaceId(req: any): string {
    return req.user?.workspaceId || req.headers['x-workspace-id'];
  }

  // ═══ COLLABORATORS ═══
  @Get('collaborators')
  listCollaborators(@Req() req: any) {
    return this.service.listCollaborators(this.getWorkspaceId(req));
  }

  @Get('collaborators/stats')
  getCollaboratorStats(@Req() req: any) {
    return this.service.getCollaboratorStats(this.getWorkspaceId(req));
  }

  @Post('collaborators/invite')
  inviteCollaborator(@Req() req: any, @Body() body: { email: string; role: string }) {
    return this.service.inviteCollaborator(
      this.getWorkspaceId(req),
      body.email,
      body.role,
      req.user.sub || req.user.id,
    );
  }

  @Delete('collaborators/invite/:id')
  revokeInvite(@Req() req: any, @Param('id') id: string) {
    return this.service.revokeInvite(id, this.getWorkspaceId(req));
  }

  @Put('collaborators/:agentId/role')
  updateRole(@Req() req: any, @Param('agentId') agentId: string, @Body() body: { role: string }) {
    return this.service.updateCollaboratorRole(agentId, this.getWorkspaceId(req), body.role);
  }

  @Delete('collaborators/:agentId')
  removeCollaborator(@Req() req: any, @Param('agentId') agentId: string) {
    return this.service.removeCollaborator(agentId, this.getWorkspaceId(req));
  }

  // ═══ AFFILIATES ═══
  @Get('affiliates')
  listAffiliates(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listAffiliates(this.getWorkspaceId(req), {
      type,
      status,
      search,
    });
  }

  @Get('affiliates/stats')
  getAffiliateStats(@Req() req: any) {
    return this.service.getAffiliateStats(this.getWorkspaceId(req));
  }

  @Get('affiliates/:id')
  getAffiliateDetail(@Req() req: any, @Param('id') id: string) {
    return this.service.getAffiliateDetail(id, this.getWorkspaceId(req));
  }

  @Post('affiliates')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  createAffiliate(@Req() req: any, @Body() body: CreateAffiliateDto) {
    return this.service.createAffiliate(this.getWorkspaceId(req), body);
  }

  @Post('affiliates/:id/approve')
  approveAffiliate(@Req() req: any, @Param('id') id: string) {
    return this.service.approveAffiliate(id, this.getWorkspaceId(req));
  }

  @Post('affiliates/:id/revoke')
  revokeAffiliate(@Req() req: any, @Param('id') id: string) {
    return this.service.revokeAffiliate(id, this.getWorkspaceId(req));
  }

  @Get('affiliates/:id/performance')
  getPerformance(@Req() req: any, @Param('id') id: string) {
    return this.service.getAffiliatePerformance(id, this.getWorkspaceId(req));
  }

  // ═══ CHAT ═══
  @Get('chat/contacts')
  getChatContacts(@Req() req: any) {
    return this.service.getChatContacts(this.getWorkspaceId(req));
  }

  @Get('chat/:partnerId/messages')
  getMessages(@Param('partnerId') partnerId: string, @Query('cursor') cursor?: string) {
    return this.service.getMessages(partnerId, cursor);
  }

  // messageLimit: partner chat is internal DB-only, not WhatsApp; no rate limit applies
  @Post('chat/:partnerId/messages')
  sendMessage(
    @Req() req: any,
    @Param('partnerId') partnerId: string,
    @Body() body: { content: string },
  ) {
    const name = req.user?.name || req.user?.email || 'Você';
    return this.service.sendMessage(partnerId, body.content, req.user.sub || req.user.id, name);
  }

  @Put('chat/:partnerId/read')
  markAsRead(@Param('partnerId') partnerId: string) {
    return this.service.markAsRead(partnerId);
  }
}
