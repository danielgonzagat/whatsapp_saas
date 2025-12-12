import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { SegmentationService, SegmentCriteria, PRESET_SEGMENTS } from './segmentation.service';

@ApiTags('Segmentation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller('segmentation')
export class SegmentationController {
  constructor(private readonly segmentationService: SegmentationService) {}

  @Get('presets')
  @ApiOperation({ summary: 'Lista segmentos pré-definidos disponíveis' })
  getPresets() {
    return {
      presets: this.segmentationService.getAvailablePresets(),
    };
  }

  @Get(':workspaceId/preset/:presetName')
  @ApiOperation({ summary: 'Busca contatos de um segmento pré-definido' })
  async getPresetSegment(
    @Param('workspaceId') workspaceId: string,
    @Param('presetName') presetName: string,
    @Query('limit') limit?: string,
  ) {
    const validPresets = Object.keys(PRESET_SEGMENTS);
    if (!validPresets.includes(presetName)) {
      return {
        error: 'Invalid preset',
        validPresets,
      };
    }

    const overrides: Partial<SegmentCriteria> = {};
    if (limit) overrides.limit = parseInt(limit, 10);

    return this.segmentationService.getPresetSegment(
      workspaceId,
      presetName as keyof typeof PRESET_SEGMENTS,
      overrides,
    );
  }

  @Post(':workspaceId/query')
  @ApiOperation({ summary: 'Busca contatos com critérios personalizados' })
  @ApiBody({
    description: 'Critérios de segmentação',
    schema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags que o contato deve ter' },
        excludeTags: { type: 'array', items: { type: 'string' }, description: 'Tags que o contato NÃO deve ter' },
        lastMessageDays: { type: 'number', description: 'Última mensagem nos últimos X dias' },
        noMessageDays: { type: 'number', description: 'Sem mensagem há X dias' },
        purchaseHistory: { type: 'string', enum: ['any', 'none', 'recent'], description: 'Histórico de compras' },
        purchaseMinValue: { type: 'number', description: 'Valor mínimo de compras' },
        engagement: { type: 'string', enum: ['hot', 'warm', 'cold', 'ghost'], description: 'Nível de engajamento' },
        stageIds: { type: 'array', items: { type: 'string' }, description: 'IDs de estágios do pipeline' },
        limit: { type: 'number', description: 'Limite de resultados' },
      },
    },
  })
  async querySegment(
    @Param('workspaceId') workspaceId: string,
    @Body() criteria: SegmentCriteria,
  ) {
    return this.segmentationService.getAudienceBySegment(workspaceId, criteria);
  }

  @Get(':workspaceId/contact/:contactId/score')
  @ApiOperation({ summary: 'Calcula score de engajamento de um contato' })
  async getContactScore(@Param('contactId') contactId: string) {
    return this.segmentationService.calculateEngagementScore(contactId);
  }

  @Post(':workspaceId/auto-segment')
  @ApiOperation({ summary: 'Segmenta automaticamente todos os contatos do workspace' })
  async autoSegment(@Param('workspaceId') workspaceId: string) {
    return this.segmentationService.autoSegmentWorkspace(workspaceId);
  }

  @Get(':workspaceId/stats')
  @ApiOperation({ summary: 'Estatísticas de segmentação do workspace' })
  async getSegmentStats(@Param('workspaceId') workspaceId: string) {
    const presets = this.segmentationService.getAvailablePresets();
    const stats: Record<string, number> = {};

    for (const preset of presets) {
      const result = await this.segmentationService.getPresetSegment(
        workspaceId,
        preset.name as keyof typeof PRESET_SEGMENTS,
        { limit: 10000 },
      );
      stats[preset.name] = result.total;
    }

    return {
      workspaceId,
      segments: stats,
      total: Object.values(stats).reduce((a, b) => a + b, 0) / presets.length, // Média (contatos podem estar em múltiplos)
    };
  }
}
