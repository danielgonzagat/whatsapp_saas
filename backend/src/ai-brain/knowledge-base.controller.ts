import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Logger,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import type { UploadedFileLike } from '../common/file-signature.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AgentAssistService } from './agent-assist.service';
import { KnowledgeBaseService } from './knowledge-base.service';

/**
 * Uploaded file shape consumed by `uploadSource`. Extends the minimal
 * `UploadedFileLike` with the full `buffer` (always present because Multer
 * is configured in memory mode) so we can call `.toString()` / pass it
 * to `pdf-parse`.
 */
interface KnowledgeBaseUploadedFile extends UploadedFileLike {
  buffer: Buffer;
}

const PDF_TXT_CSV_JSON_RE = /\.(pdf|txt|csv|json)$/i;
const APPLICATION__PDF_TEXT_RE = /^(application\/pdf|text\/plain|text\/csv|application\/json)$/;

@Controller('ai')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class KnowledgeBaseController {
  private readonly logger = new Logger(KnowledgeBaseController.name);

  constructor(
    private readonly kb: KnowledgeBaseService,
    private readonly agentAssist: AgentAssistService,
  ) {}

  @Post('assistant/analyze-sentiment')
  analyzeSentiment(
    @Req() req: AuthenticatedRequest,
    @Body() body: { text: string; workspaceId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.agentAssist.analyzeSentiment(body.text, workspaceId);
  }

  @Post('assistant/summarize')
  summarize(
    @Req() req: AuthenticatedRequest,
    @Body() body: { conversationId: string; workspaceId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.agentAssist.summarizeConversation(body.conversationId, workspaceId);
  }

  @Post('assistant/suggest')
  suggestReply(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: { workspaceId: string; conversationId: string; prompt?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.agentAssist.suggestReply(workspaceId, body.conversationId, body.prompt);
  }

  @Post('assistant/pitch')
  generatePitch(
    @Req() req: AuthenticatedRequest,
    @Body() body: { workspaceId: string; conversationId: string; idempotencyKey?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.agentAssist.generatePitch(body.conversationId, workspaceId);
  }

  @Post('kb/create')
  @Roles('ADMIN')
  async createKb(
    @Req() req: AuthenticatedRequest,
    @Body() body: { workspaceId?: string; name: string; idempotencyKey?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.kb.create(workspaceId, body.name);
  }

  @Get('kb/list')
  async listKb(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.kb.list(effectiveWorkspaceId);
  }

  @Post('kb/source')
  @Roles('ADMIN')
  async addSource(
    @Req() req: AuthenticatedRequest,
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = PDF_TXT_CSV_JSON_RE;
        cb(null, allowed.test(file.originalname));
      },
    }),
  )
  async uploadSource(
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }), // 20MB
          new FileTypeValidator({
            fileType: APPLICATION__PDF_TEXT_RE,
          }),
        ],
      }),
    )
    file: KnowledgeBaseUploadedFile,
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
        file.mimetype?.includes('pdf') || (file.originalname || '').toLowerCase().endsWith('.pdf');

      if (isPdf) {
        type = 'PDF';
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: file.buffer });
        try {
          const parsed = await parser.getText();
          content = parsed.text || content;
        } finally {
          await parser.destroy();
        }
      }
    } catch (err: unknown) {
      // keep text fallback if PDF parsing fails
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      if (!isTestEnv) {
        const errInstance =
          err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
        this.logger.warn(`Falha ao processar PDF, usando texto bruto: ${errInstance.message}`);
      }
    }

    return this.kb.addSource(kbId, type, content);
  }

  @Get('kb/:id/sources')
  async listSources(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.kb.listSources(id, workspaceId);
  }
}
