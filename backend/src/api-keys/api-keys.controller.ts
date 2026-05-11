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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/** Api keys controller. */
@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings/api-keys')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  /** List. */
  @Get()
  @ApiOperation({ summary: 'List API Keys' })
  async list(@Request() req) {
    return this.apiKeysService.list(req.user.workspaceId);
  }

  /** Create. */
  @Post()
  @ApiOperation({ summary: 'Create a new API Key' })
  async create(@Request() req, @Body() body: CreateApiKeyDto) {
    return this.apiKeysService.create(req.user.workspaceId, body.name);
  }

  /** Rotate. */
  @Patch(':id/rotate')
  @ApiOperation({ summary: 'Rotate (regenerate) an API Key' })
  async rotate(@Request() req, @Param('id') id: string) {
    return this.apiKeysService.rotate(req.user.workspaceId, id);
  }

  /** Delete. */
  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API Key' })
  async delete(@Request() req, @Param('id') id: string) {
    return this.apiKeysService.delete(req.user.workspaceId, id);
  }
}
