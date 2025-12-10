import { Controller, Get, Post, Delete, Body, Param, Query, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { MemoryService } from './memory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@ApiTags('KLOEL Memory')
@ApiBearerAuth()
@Controller('kloel/memory')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(private readonly memoryService: MemoryService) {}

  @Post(':workspaceId/save')
  @ApiOperation({ summary: 'Salva uma memória' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async saveMemory(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { key: string; value: any; category?: string; content?: string },
  ) {
    const memory = await this.memoryService.saveMemory(
      workspaceId, body.key, body.value, body.category || 'general', body.content,
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
    return this.memoryService.searchMemory(workspaceId, body.query, body.limit || 5, body.category);
  }

  @Post(':workspaceId/product')
  @ApiOperation({ summary: 'Salva produto' })
  @ApiParam({ name: 'workspaceId', description: 'ID do workspace' })
  async saveProduct(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { productId: string; name: string; description: string; price: number; benefits?: string[] },
  ) {
    const memory = await this.memoryService.saveProduct(workspaceId, body.productId, {
      name: body.name, description: body.description, price: body.price, benefits: body.benefits,
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
    return this.memoryService.listMemories(workspaceId, category, parseInt(page || '1'));
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
