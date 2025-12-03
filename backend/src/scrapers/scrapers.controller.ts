import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ScrapersService } from './scrapers.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';

class CreateJobDto {
  @IsString()
  workspaceId: string;

  @IsString()
  @IsIn(['MAPS', 'INSTAGRAM', 'GROUP'])
  type: string;

  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  flowId?: string;
}

@Controller('scrapers')
@UseGuards(JwtAuthGuard)
export class ScrapersController {
  constructor(private readonly scrapersService: ScrapersService) {}

  @Post('jobs')
  @Roles('ADMIN')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Req() req: any, @Body() body: CreateJobDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.scrapersService.createJob(effectiveWorkspaceId, data);
  }

  @Get('jobs')
  findAll(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.scrapersService.findAll(effectiveWorkspaceId);
  }

  @Get('jobs/:id')
  findOne(
    @Req() req: any,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.scrapersService.findOne(effectiveWorkspaceId, id);
  }

  @Post('jobs/:id/import')
  @Roles('ADMIN')
  importLeads(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.scrapersService.importLeads(effectiveWorkspaceId, id);
  }
}
