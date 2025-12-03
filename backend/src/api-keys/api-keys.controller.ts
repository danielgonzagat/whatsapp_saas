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
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings/api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'List API Keys' })
  async list(@Request() req) {
    return this.apiKeysService.list(req.user.workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new API Key' })
  async create(@Request() req, @Body() body: { name: string }) {
    return this.apiKeysService.create(req.user.workspaceId, body.name);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API Key' })
  async delete(@Request() req, @Param('id') id: string) {
    return this.apiKeysService.delete(req.user.workspaceId, id);
  }
}
