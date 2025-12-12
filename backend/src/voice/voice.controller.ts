import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VoiceService } from './voice.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { CreateVoiceProfileDto } from './dto/create-voice-profile.dto';
import { GenerateAudioDto } from './dto/generate-audio.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Roles } from '../auth/roles.decorator';

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
  async createProfile(@Req() req: any, @Body() body: CreateVoiceProfileDto) {
    const effectiveWorkspaceId = resolveWorkspaceId(req);
    return this.voiceService.createVoiceProfile(effectiveWorkspaceId, body);
  }

  @Get('profiles')
  @ApiOperation({ summary: 'List voice profiles' })
  @Roles('ADMIN', 'AGENT')
  async getProfiles(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.voiceService.getProfiles(effectiveWorkspaceId);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate audio from text' })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @Roles('ADMIN', 'AGENT')
  async generate(@Req() req: any, @Body() body: GenerateAudioDto) {
    const effectiveWorkspaceId = resolveWorkspaceId(req);
    return this.voiceService.generateAudio(effectiveWorkspaceId, body);
  }
}
