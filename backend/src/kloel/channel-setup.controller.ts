import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import {
  ChannelArsenalUploadFile,
  ChannelSetupService,
  isAllowedDeclaredArsenalMime,
  SaveArsenalInput,
  SaveConfigInput,
  SaveProductsInput,
} from './channel-setup.service';

@Controller('channel-setup')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ChannelSetupController {
  constructor(private readonly setup: ChannelSetupService) {}

  @Get(':channel')
  getState(@Request() req: AuthenticatedRequest, @Param('channel') channel: string) {
    return this.setup.getState(req.user.workspaceId, channel);
  }

  @Post(':channel/products')
  saveProducts(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Body() body: SaveProductsInput,
  ) {
    return this.setup.saveProducts(req.user.workspaceId, channel, body);
  }

  @Post(':channel/arsenal')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (isAllowedDeclaredArsenalMime(file.mimetype)) {
          callback(null, true);
          return;
        }
        callback(new BadRequestException('tipo_de_upload_nao_suportado'), false);
      },
    }),
  )
  addArsenal(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Body() body: SaveArsenalInput,
    @UploadedFile() file?: ChannelArsenalUploadFile,
  ) {
    if (file) {
      return this.setup.addArsenalUpload(req.user.workspaceId, channel, body, file);
    }
    return this.setup.addArsenal(req.user.workspaceId, channel, body);
  }

  @Delete(':channel/arsenal/:assetId')
  removeArsenal(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Param('assetId') assetId: string,
  ) {
    return this.setup.removeArsenal(req.user.workspaceId, channel, assetId);
  }

  @Post(':channel/config')
  saveConfig(
    @Request() req: AuthenticatedRequest,
    @Param('channel') channel: string,
    @Body() body: SaveConfigInput,
  ) {
    return this.setup.saveConfig(req.user.workspaceId, channel, body);
  }

  @Post(':channel/complete')
  complete(@Request() req: AuthenticatedRequest, @Param('channel') channel: string) {
    return this.setup.complete(req.user.workspaceId, channel);
  }

  @Post(':channel/reconfigure')
  reconfigure(@Request() req: AuthenticatedRequest, @Param('channel') channel: string) {
    return this.setup.reconfigure(req.user.workspaceId, channel);
  }
}
