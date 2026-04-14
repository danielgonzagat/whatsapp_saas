import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ApiKeysService } from './api-keys.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings/api-keys')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API Keys' })
  async list(@Request() req) {
    return this.apiKeysService.list(req.user.workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new API Key' })
  async create(@Request() req, @Body() body: { name: string; idempotencyKey?: string }) {
    return this.apiKeysService.create(req.user.workspaceId, body.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API Key' })
  async delete(@Request() req, @Param('id') id: string) {
    return this.apiKeysService.delete(req.user.workspaceId, id);
  }
}
