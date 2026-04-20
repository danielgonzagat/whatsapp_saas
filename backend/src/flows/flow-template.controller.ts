import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { FlowTemplateService } from './flow-template.service';

/** Flow template controller. */
@Controller('flow-templates')
@UseGuards(JwtAuthGuard)
export class FlowTemplateController {
  constructor(private readonly service: FlowTemplateService) {}

  /** List public. */
  @Get('public')
  async listPublic() {
    return this.service.listPublic();
  }

  /** List all. */
  @Get()
  @Roles('ADMIN')
  async listAll() {
    return this.service.listAll();
  }

  /** Get. */
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  /** Create. */
  @Post()
  @Roles('ADMIN')
  async create(
    @Body()
    body: {
      name: string;
      category: string;
      nodes: unknown;
      edges: unknown;
      description?: string;
      isPublic?: boolean;
      idempotencyKey?: string;
    },
  ) {
    const { name, category, nodes, edges, description, isPublic } = body;
    return this.service.create({
      name,
      category,
      nodes,
      edges,
      description,
      isPublic,
    });
  }

  /** Download. */
  @Post(':id/download')
  async download(@Param('id') id: string) {
    return this.service.incrementDownload(id);
  }

  /** Seed recommended. */
  @Post('seed/recommended')
  @Roles('ADMIN')
  async seedRecommended() {
    return this.service.seedRecommended();
  }
}
