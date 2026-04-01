import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Put,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DealStatus } from '@prisma/client';
import { CrmService } from './crm.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
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
      page: Number(page),
      limit: Number(limit),
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
  async createPipeline(
    @Req() req: any,
    @Body() body: { workspaceId: string; name: string },
  ) {
    const { workspaceId, name } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.createPipeline(effectiveWorkspaceId, name);
  }

  @Get('pipelines')
  async listPipelines(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.listPipelines(effectiveWorkspaceId);
  }

  @Post('deals')
  async createDeal(
    @Req() req: any,
    @Body()
    body: { contactId: string; stageId: string; title: string; value: number },
  ) {
    const { contactId, stageId, title, value } = body;
    const workspaceId = (body as Record<string, any>).workspaceId as
      | string
      | undefined;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.createDeal(
      effectiveWorkspaceId,
      contactId,
      stageId,
      title,
      value,
    );
  }

  @Put('deals/:id/move')
  async moveDeal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { stageId: string; workspaceId?: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body?.workspaceId);
    return this.crmService.moveDeal(effectiveWorkspaceId, id, body.stageId);
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
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.crmService.listDeals(effectiveWorkspaceId, campaignId);
  }
}
