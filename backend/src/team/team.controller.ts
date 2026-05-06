import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { AcceptInviteDto, InviteMemberDto, UpdateRoleDto } from './dto/invite-member.dto';
import { TeamService } from './team.service';

/** Team controller. */
@ApiTags('Team')
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  /** List. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List team members and invites' })
  async list(@Request() req) {
    return this.teamService.listMembers(req.user.workspaceId);
  }

  /** Invite. */
  @Post('invite')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a new member' })
  async invite(@Request() req, @Body() body: InviteMemberDto) {
    return this.teamService.inviteMember(
      req.user.workspaceId,
      body.email,
      body.role,
      req.user.sub || req.user.id,
    );
  }

  /** Revoke invite. */
  @Delete('invite/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invitation' })
  async revokeInvite(@Request() req, @Param('id') id: string) {
    return this.teamService.revokeInvite(req.user.workspaceId, id);
  }

  /** Remove member. */
  @Delete('member/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a team member' })
  async removeMember(@Request() req, @Param('id') id: string) {
    return this.teamService.removeMember(req.user.workspaceId, id, req.user.sub || req.user.id);
  }

  /** Update member role. */
  @Patch('member/:id/role')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update team member role' })
  async updateRole(@Request() req, @Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.teamService.updateMemberRole(
      req.user.workspaceId,
      id,
      body.role,
      req.user.sub || req.user.id,
    );
  }

  /** Accept invite. */
  @Public()
  @Post('accept-invite')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Accept an invitation' })
  async acceptInvite(@Body() body: AcceptInviteDto) {
    return this.teamService.acceptInvite(body.token, body.name, body.password);
  }
}
