import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { MemoryService } from './memory.service';

@ApiTags('KLOEL Memory')
@ApiBearerAuth()
@Controller('kloel/memory')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Post(':workspaceId/save')
  @ApiOperation({ summary: 'Salva uma memória' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async saveMemory(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: { key: string; value: any; category?: string; content?: string },
  ) {
    const memory = await this.memoryService.saveMemory(
      workspaceId,
      body.key,
      body.value,
      body.category || 'general',
      body.content,
    );
    return { status: 'saved', memory };
  }

  @Post(':workspaceId/search')
  @ApiOperation({ summary: 'Busca memórias' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async searchMemory(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { query: string; limit?: number; category?: string },
  ) {
    const clampedSearchLimit = Math.min(Math.max(Number(body.limit) || 5, 1), 100);
    return this.memoryService.searchMemory(
      workspaceId,
      body.query,
      clampedSearchLimit,
      body.category,
    );
  }

  @Post(':workspaceId/product')
  @ApiOperation({ summary: 'Salva produto' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async saveProduct(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      productId: string;
      name: string;
      description: string;
      price: number;
      benefits?: string[];
    },
  ) {
    const memory = await this.memoryService.saveProduct(workspaceId, body.productId, {
      name: body.name,
      description: body.description,
      price: body.price,
      benefits: body.benefits,
    });
    return { status: 'saved', memory };
  }

  @Get(':workspaceId/list')
  @ApiOperation({ summary: 'Lista memórias' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  @ApiQuery({ name: 'category', required: false })
  async listMemories(
    @Param('workspaceId') workspaceId: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
  ) {
    const clampedPage = Math.max(Number(page) || 1, 1);
    return this.memoryService.listMemories(workspaceId, category, clampedPage);
  }

  @Get(':workspaceId/stats')
  @ApiOperation({ summary: 'Estatísticas de memória' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async getStats(@Param('workspaceId') workspaceId: string) {
    return this.memoryService.getMemoryStats(workspaceId);
  }

  @Delete(':workspaceId/:key')
  @ApiOperation({ summary: 'Remove uma memória' })
  async deleteMemory(@Param('workspaceId') workspaceId: string, @Param('key') key: string) {
    const deleted = await this.memoryService.deleteMemory(workspaceId, key);
    return { status: deleted ? 'deleted' : 'not_found', key };
  }
}
