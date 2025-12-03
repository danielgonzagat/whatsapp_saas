import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';

@ApiTags('Team')
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List team members and invites' })
  async list(@Request() req) {
    return this.teamService.listMembers(req.user.workspaceId);
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a new member' })
  async invite(@Request() req, @Body() body: { email: string; role: string }) {
    return this.teamService.inviteMember(
      req.user.workspaceId,
      body.email,
      body.role,
    );
  }

  @Delete('invite/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an invitation' })
  async revokeInvite(@Request() req, @Param('id') id: string) {
    return this.teamService.revokeInvite(req.user.workspaceId, id);
  }

  @Delete('member/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a team member' })
  async removeMember(@Request() req, @Param('id') id: string) {
    return this.teamService.removeMember(req.user.workspaceId, id);
  }

  @Public()
  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept an invitation' })
  async acceptInvite(
    @Body() body: { token: string; name: string; password: string },
  ) {
    return this.teamService.acceptInvite(body.token, body.name, body.password);
  }
}
