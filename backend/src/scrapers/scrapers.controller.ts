import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ScrapersService } from './scrapers.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

class CreateJobDto {
  @IsString()
  @MaxLength(2048)
  workspaceId: string;

  @IsString()
  @MaxLength(2048)
  @IsIn(['MAPS', 'INSTAGRAM', 'GROUP'])
  type: string;

  @IsString()
  @MaxLength(2048)
  query: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  flowId?: string;
}

/** Scrapers controller. */
@Controller('scrapers')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class ScrapersController {
  constructor(private readonly scrapersService: ScrapersService) {}

  @Post('jobs')
  @Roles('ADMIN')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateJobDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.scrapersService.createJob(effectiveWorkspaceId, data);
  }

  @Get('jobs')
  findAll(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.scrapersService.findAll(effectiveWorkspaceId);
  }

  @Get('jobs/:id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.scrapersService.findOne(effectiveWorkspaceId, id);
  }

  @Post('jobs/:id/import')
  @Roles('ADMIN')
  importLeads(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.scrapersService.importLeads(effectiveWorkspaceId, id);
  }
}
