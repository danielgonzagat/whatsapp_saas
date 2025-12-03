import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FlowTemplateService } from './flow-template.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('flow-templates')
@UseGuards(JwtAuthGuard)
export class FlowTemplateController {
  constructor(private readonly service: FlowTemplateService) {}

  @Get('public')
  async listPublic() {
    return this.service.listPublic();
  }

  @Get()
  @Roles('ADMIN')
  async listAll() {
    return this.service.listAll();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @Body()
    body: {
      name: string;
      category: string;
      nodes: any;
      edges: any;
      description?: string;
      isPublic?: boolean;
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

  @Post(':id/download')
  async download(@Param('id') id: string) {
    return this.service.incrementDownload(id);
  }

  @Post('seed/recommended')
  @Roles('ADMIN')
  async seedRecommended() {
    return this.service.seedRecommended();
  }
}
