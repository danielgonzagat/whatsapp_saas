import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CurrentWorkspaceId } from '../common/decorators/current-workspace-id.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Api keys controller. */
@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings/api-keys')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
/**
 * @cluster whatsapp_saas/backend/api-keys
 * L11 multi-agent TaskGraph annotation (Wave 4 loop-runner).
 */
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /** List. */
  @Get()
  @ApiOperation({ summary: 'List API Keys' })
  async list(@CurrentWorkspaceId() workspaceId: string) {
    return this.apiKeysService.list(workspaceId);
  }

  /** Create. */
  @Post()
  @ApiOperation({ summary: 'Create a new API Key' })
  async create(@CurrentWorkspaceId() workspaceId: string, @Body() body: CreateApiKeyDto) {
    return this.apiKeysService.create(workspaceId, body.name);
  }

  /** Rotate. */
  @Patch(':id/rotate')
  @ApiOperation({ summary: 'Rotate (regenerate) an API Key' })
  async rotate(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.apiKeysService.rotate(workspaceId, id);
  }

  /** Delete. */
  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API Key' })
  async delete(@CurrentWorkspaceId() workspaceId: string, @Param('id') id: string) {
    return this.apiKeysService.delete(workspaceId, id);
  }
}
