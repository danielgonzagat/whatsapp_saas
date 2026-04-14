import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DealStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { CrmService } from './crm.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpsertContactDto } from './dto/upsert-contact.dto';

@ApiTags('CRM')
@ApiBearerAuth()
@Controller('crm')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post('contacts')
  async createContact(@Req() req: any, @Body() body: CreateContactDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.createContact(effectiveWorkspaceId, data);
  }

  @Post('contacts/upsert')
  async upsertContact(@Req() req: any, @Body() body: UpsertContactDto) {
    const { workspaceId, phone, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.upsertContact(effectiveWorkspaceId, phone, data);
  }

  @Get('contacts')
  async listContacts(@Req() req: any, @Query() query: any) {
    const { workspaceId, page, limit, search } = query;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.listContacts(effectiveWorkspaceId, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
    });
  }

  @Get('contacts/:phone')
  async getContact(
    @Req() req: any,
    @Param('phone') phone: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.getContact(effectiveWorkspaceId, phone);
  }

  @Post('contacts/:phone/tags')
  async addTag(
    @Req() req: any,
    @Param('phone') phone: string,
    @Body() body: { workspaceId: string; tag: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.crmService.addTag(effectiveWorkspaceId, phone, body.tag);
  }

  @Delete('contacts/:phone/tags/:tag')
  async removeTag(
    @Req() req: any,
    @Param('phone') phone: string,
    @Param('tag') tag: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.removeTag(effectiveWorkspaceId, phone, tag);
  }

  // ============================================================
  // PIPELINES / DEALS
  // ============================================================

  @Post('pipelines')
  async createPipeline(@Req() req: any, @Body() body: { workspaceId: string; name: string }) {
    const { workspaceId, name } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.createPipeline(effectiveWorkspaceId, name);
  }

  @Get('pipelines')
  async listPipelines(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.listPipelines(effectiveWorkspaceId);
  }

  @Post('deals')
  async createDeal(
    @Req() req: any,
    @Body()
    body: {
      contactId?: string;
      contact?: string;
      contactPhone?: string;
      contactName?: string;
      stageId?: string;
      stage?: string;
      title: string;
      value: number;
      workspaceId?: string;
    },
  ) {
    const workspaceId = body.workspaceId;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.createDeal(effectiveWorkspaceId, {
      contactId: body.contactId,
      contactPhone: body.contactPhone || body.contact,
      contactName: body.contactName,
      stageId: body.stageId || body.stage,
      title: body.title,
      value: body.value,
    });
  }

  @Put('deals/:id/move')
  async moveDeal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { stageId?: string; stage?: string; workspaceId?: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body?.workspaceId);
    return this.crmService.moveDeal(effectiveWorkspaceId, id, body.stageId || body.stage || '');
  }

  @Put('deals/:id')
  async updateDeal(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      value?: number;
      status?: DealStatus;
      workspaceId?: string;
    },
  ) {
    const { workspaceId, ...data } = body || {};
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.updateDeal(effectiveWorkspaceId, id, data);
  }

  @Delete('deals/:id')
  async deleteDeal(
    @Req() req: any,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.deleteDeal(effectiveWorkspaceId, id);
  }

  @Get('deals')
  async listDeals(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
    @Query('campaignId') campaignId?: string,
    @Query('pipeline') pipelineId?: string,
    @Query('stage') stageId?: string,
    @Query('search') search?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.listDeals(effectiveWorkspaceId, {
      campaignId,
      pipelineId,
      stageId,
      search,
    });
  }
}
