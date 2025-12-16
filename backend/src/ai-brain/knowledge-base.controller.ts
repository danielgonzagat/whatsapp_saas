import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeBaseService } from './knowledge-base.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Roles } from '../auth/roles.decorator';
import { AgentAssistService } from './agent-assist.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class KnowledgeBaseController {
  constructor(
    private readonly kb: KnowledgeBaseService,
    private readonly prisma: PrismaService,
    private readonly agentAssist: AgentAssistService,
  ) {}

  @Post('assistant/analyze-sentiment')
  analyzeSentiment(@Body() body: { text: string }) {
    return this.agentAssist.analyzeSentiment(body.text);
  }

  @Post('assistant/summarize')
  summarize(@Body() body: { conversationId: string }) {
    return this.agentAssist.summarizeConversation(body.conversationId);
  }

  @Post('assistant/suggest')
  suggestReply(
    @Req() req: any,
    @Body()
    body: { workspaceId: string; conversationId: string; prompt?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.agentAssist.suggestReply(
      workspaceId,
      body.conversationId,
      body.prompt,
    );
  }

  @Post('assistant/pitch')
  generatePitch(
    @Req() req: any,
    @Body() body: { workspaceId: string; conversationId: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.agentAssist.generatePitch(body.conversationId, workspaceId);
  }

  @Post('kb/create')
  @Roles('ADMIN')
  async createKb(
    @Req() req: any,
    @Body() body: { workspaceId?: string; name: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.kb.create(workspaceId, body.name);
  }

  @Get('kb/list')
  async listKb(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.kb.list(effectiveWorkspaceId);
  }

  @Post('kb/source')
  @Roles('ADMIN')
  async addSource(
    @Req() req: any,
    @Body()
    body: {
      workspaceId?: string;
      knowledgeBaseId: string;
      type: 'TEXT' | 'URL' | 'PDF';
      content: string;
    },
  ) {
    resolveWorkspaceId(req, body.workspaceId);
    return this.kb.addSource(body.knowledgeBaseId, body.type, body.content);
  }

  @Post('kb/upload')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSource(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body() body: { kbId: string; workspaceId?: string }, // Corrected param name to kbId
  ) {
    const { kbId, workspaceId } = body;
    resolveWorkspaceId(req, workspaceId);

    if (!file) {
      throw new Error('Arquivo não enviado');
    }

    let content = file.buffer.toString('utf-8');
    let type: 'TEXT' | 'URL' | 'PDF' = 'TEXT';

    try {
      const isPdf =
        (file.mimetype && file.mimetype.includes('pdf')) ||
        (file.originalname || '').toLowerCase().endsWith('.pdf');

      if (isPdf) {
        type = 'PDF';
        const mod: any = await import('pdf-parse');
        const pdfParse = mod?.default ?? mod;
        const parsed = await pdfParse(file.buffer);
        content = parsed.text || content;
      }
    } catch (err) {
      // keep text fallback if PDF parsing fails
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      if (!isTestEnv) {
        console.warn('[KB] Falha ao processar PDF, usando texto bruto', err);
      }
    }

    return this.kb.addSource(kbId, type, content);
  }

  @Get('kb/:id/sources')
  async listSources(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.kb.listSources(id, workspaceId);
  }
}
