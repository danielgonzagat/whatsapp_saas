import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CreateVoiceProfileDto } from './dto/create-voice-profile.dto';
import { GenerateAudioDto } from './dto/generate-audio.dto';
import { VoiceService } from './voice.service';

/** Voice controller. */
@ApiTags('Voice AI')
@ApiBearerAuth()
@Controller('voice')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('profiles')
  @ApiOperation({ summary: 'Create a voice profile' })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @Roles('ADMIN')
  async createProfile(@Req() req: AuthenticatedRequest, @Body() body: CreateVoiceProfileDto) {
    const effectiveWorkspaceId = resolveWorkspaceId(req);
    return this.voiceService.createVoiceProfile(effectiveWorkspaceId, body);
  }

  @Get('profiles')
  @ApiOperation({ summary: 'List voice profiles' })
  @Roles('ADMIN', 'AGENT')
  async getProfiles(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.voiceService.getProfiles(effectiveWorkspaceId);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate audio from text' })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @Roles('ADMIN', 'AGENT')
  async generate(@Req() req: AuthenticatedRequest, @Body() body: GenerateAudioDto) {
    const effectiveWorkspaceId = resolveWorkspaceId(req);
    return this.voiceService.generateAudio(effectiveWorkspaceId, body);
  }
}
