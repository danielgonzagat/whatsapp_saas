import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  Req,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { createHmac } from 'crypto';

import { WhatsappService } from './whatsapp.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Public } from '../auth/public.decorator';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly workspaces: WorkspaceService,
    private readonly webhooks: WebhooksService,
  ) {}

  /* ========================================================================
   * 1) INICIAR SESSÃO WPPConnect (APENAS SE workspace usa provedor "wpp")
   * GET /whatsapp/:workspaceId/connect
   * ======================================================================== */
  @Get(':workspaceId/connect')
  async connect(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    this.logger.log(`GET /whatsapp/${effectiveWorkspaceId}/connect`);

    const ws = await this.workspaces.getWorkspace(effectiveWorkspaceId);
    const engineWs = this.workspaces.toEngineWorkspace(ws);

    // Apenas provider WPP suporta sessão via QR
    if (engineWs.whatsappProvider !== 'wpp') {
      return {
        error: true,
        message:
          "Este workspace não está configurado para usar WPPConnect. Altere o provedor para 'wpp' antes de conectar.",
      };
    }

    const qr: any =
      await this.whatsappService.createSession(effectiveWorkspaceId);

    this.logger.log(`QR gerado para workspace=${effectiveWorkspaceId}`);

    if (qr?.error) {
      return { status: 'error', message: qr.message || 'Erro ao gerar QR' };
    }

    if (qr?.code) {
      return {
        status: 'qr_ready',
        qrCode: qr.code,
        qrCodeImage: qr.code,
        message: 'Escaneie o QR Code para conectar',
      };
    }

    return { status: 'already_connected', message: 'Sessão já conectada' };
  }

  /* ========================================================================
   * 2) VISUALIZAR QR CODE VIA HTML (para conexão do WPPConnect)
   * GET /whatsapp/:workspaceId/connect-view
   * ======================================================================== */
  @Get(':workspaceId/connect-view')
  async connectView(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ): Promise<string> {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    this.logger.log(`GET /whatsapp/${effectiveWorkspaceId}/connect-view`);

    const ws = await this.workspaces.getWorkspace(effectiveWorkspaceId);
    const engineWs = this.workspaces.toEngineWorkspace(ws);

    if (engineWs.whatsappProvider !== 'wpp') {
      return `<h1 style="color:red">Este workspace não está configurado para WPPConnect.</h1>`;
    }

    const qr: any =
      await this.whatsappService.createSession(effectiveWorkspaceId);

    if (!qr || qr.error) {
      return `<h1 style="color:red">Erro ao gerar QR Code para este workspace.</h1>`;
    }

    return `
      <html>
        <body style="
            display:flex;
            align-items:center;
            justify-content:center;
            flex-direction:column;
            background:#111;
            color:white;
            font-family:monospace;
            padding:20px;
        ">
          <h1>QR Code para Workspace ${effectiveWorkspaceId}</h1>

          <img src="${qr.code}"
               style="width:300px;border:4px solid white;margin-bottom:20px" />

          <pre style="color:#0f0;font-size:10px">${qr.ascii}</pre>
        </body>
      </html>
    `;
  }

  /* ========================================================================
   * 1.2) STATUS & QR CODE
   * ======================================================================== */
  @Get(':workspaceId/status')
  async status(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const status = await this.whatsappService.getConnectionStatus(effectiveWorkspaceId);
    return {
      connected: status.status === 'connected',
      status: status.status,
      phone: status.phoneNumber,
      phoneNumber: status.phoneNumber,
      qrCode: status.qrCode,
    };
  }

  @Get(':workspaceId/qr')
  async qr(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const qr = await this.whatsappService.getQrCode(effectiveWorkspaceId);
    if (!qr) {
      return { status: 'no_qr', message: 'Nenhum QR disponível' };
    }
    return { status: 'qr_ready', qrCode: qr, qrCodeImage: qr };
  }

  /* ========================================================================
   * 3) ENVIAR MENSAGEM (via Worker → FlowEngine → WhatsAppEngine PRO)
   * POST /whatsapp/:workspaceId/send
   * ======================================================================== */
  @Post(':workspaceId/send')
  async sendMessage(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('to') to: string,
    @Body('message') message: string,
    @Body('mediaUrl') mediaUrl?: string,
    @Body('mediaType') mediaType?: 'image' | 'video' | 'audio' | 'document',
    @Body('caption') caption?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    this.logger.log(
      `POST /whatsapp/${effectiveWorkspaceId}/send → to=${to}, msg="${message}"`,
    );

    return await this.whatsappService.sendMessage(
      effectiveWorkspaceId,
      to,
      message,
      { mediaUrl, mediaType, caption },
    );
  }

  /* ========================================================================
   * 3.1) ENVIAR TEMPLATE OFICIAL (WhatsApp Cloud API)
   * POST /whatsapp/:workspaceId/send-template
   * ======================================================================== */
  @Post(':workspaceId/send-template')
  async sendTemplate(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('to') to: string,
    @Body('templateName') templateName: string,
    @Body('language') language: string,
    @Body('components') components?: any[],
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return await this.whatsappService.sendTemplate(effectiveWorkspaceId, to, {
      name: templateName,
      language,
      components: components || [],
    });
  }

  /* ========================================================================
   * 3.2) LISTAR TEMPLATES (Meta Cloud API)
   * GET /whatsapp/:workspaceId/templates
   * ======================================================================== */
  @Get(':workspaceId/templates')
  async listTemplates(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.listTemplates(effectiveWorkspaceId);
  }

  /* ========================================================================
   * 3.3) OPT-IN / OPT-OUT (marca contato com tag optin_whatsapp)
   * ======================================================================== */
  @Post(':workspaceId/opt-in')
  async optIn(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('phone') phone: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.optInContact(effectiveWorkspaceId, phone);
  }

  @Post(':workspaceId/opt-out')
  async optOut(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('phone') phone: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.optOutContact(effectiveWorkspaceId, phone);
  }

  @Get(':workspaceId/opt-status/:phone')
  async optStatus(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('phone') phone: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.getOptInStatus(effectiveWorkspaceId, phone);
  }

  /* ========================================================================
   * 6) DESCONECTAR SESSÃO WPP
   * ======================================================================== */
  @Delete(':workspaceId/disconnect')
  async disconnect(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    await this.whatsappService.disconnect(effectiveWorkspaceId);
    return { status: 'disconnected' };
  }

  @Post(':workspaceId/opt-in/bulk')
  async optInBulk(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('phones') phones: string[],
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.optInBulk(effectiveWorkspaceId, phones || []);
  }

  @Post(':workspaceId/opt-out/bulk')
  async optOutBulk(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('phones') phones: string[],
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.whatsappService.optOutBulk(effectiveWorkspaceId, phones || []);
  }

  /* ========================================================================
   * 4) ENVIAR MENSAGEM DIRETO VIA WPPConnect (modo teste)
   * POST /whatsapp/:workspaceId/send-direct
   * ======================================================================== */
  @Post(':workspaceId/send-direct')
  async sendDirect(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body('to') to: string,
    @Body('message') message: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    this.logger.log(
      `POST /whatsapp/${effectiveWorkspaceId}/send-direct (modo debug)`,
    );

    return await this.whatsappService.sendDirectWPP(
      effectiveWorkspaceId,
      to,
      message,
    );
  }

  /* ========================================================================
   * 5) INCOMING WEBHOOK — RECEBER MENSAGENS VIA WHATSAPP
   * POST /whatsapp/:workspaceId/incoming
   * ======================================================================== */
  @Public()
  @Post(':workspaceId/incoming')
  async incoming(
    @Param('workspaceId') workspaceId: string,
    @Body('from') from: string,
    @Body('message') message: string,
    @Req() req: any,
  ) {
    if (!from || !message) {
      throw new BadRequestException('Missing from or message');
    }

    const sharedSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production' && !sharedSecret) {
      throw new BadRequestException('WHATSAPP_WEBHOOK_SECRET not configured');
    }
    if (sharedSecret) {
      const sig = req.headers['x-webhook-signature'] as string | undefined;
      if (!sig) {
        throw new BadRequestException('Missing webhook signature');
      }
      const raw = req.rawBody || JSON.stringify(req.body || '');
      const expected = createHmac('sha256', sharedSecret)
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex');
      if (sig !== expected) {
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    this.logger.log(
      `📩 Incoming | workspace=${workspaceId} | from=${from} | msg="${message}"`,
    );

    return await this.whatsappService.handleIncoming(
      workspaceId,
      from,
      message,
    );
  }

  /* ========================================================================
   * 7) META WEBHOOK (Cloud API) — entrada e verificação
   *    POST /whatsapp/meta/webhook
   *    GET  /whatsapp/meta/webhook?hub.mode=&hub.verify_token=&hub.challenge=
   * ======================================================================== */
  @Public()
  @Get('meta/webhook')
  verifyMeta(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expected = process.env.META_VERIFY_TOKEN;
    if (mode === 'subscribe' && token && expected && token === expected) {
      return challenge || 'OK';
    }
    throw new BadRequestException('Invalid verify token');
  }

  @Public()
  @Post('meta/webhook')
  async handleMetaWebhook(@Req() req: any, @Body() body: any) {
    const appSecret = process.env.META_APP_SECRET;
    const signature = req.headers['x-hub-signature-256'] as string | undefined;

    if (process.env.NODE_ENV === 'production' && !appSecret) {
      throw new BadRequestException('META_APP_SECRET not configured');
    }

    if (appSecret) {
      if (!signature) {
        throw new BadRequestException('Missing Meta signature');
      }
      const raw = req.rawBody;
      if (!raw) {
        this.logger.error(
          'Meta webhook without rawBody; reject to avoid spoofing',
        );
        throw new BadRequestException('Invalid payload');
      }
      const expected =
        'sha256=' +
        createHmac('sha256', appSecret)
          .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
          .digest('hex');
      if (signature !== expected) {
        this.logger.warn('Meta signature mismatch');
        throw new BadRequestException('Invalid signature');
      }
    }

    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages || [];
        const statuses = value?.statuses || [];
        const metadata = value?.metadata;
        const metaPhoneId =
          metadata?.phone_number_id || metadata?.display_phone_number_id;
        let workspaceId = metaPhoneId || 'default';

        // Mapeia phoneId Meta -> workspace
        if (metaPhoneId) {
          const ws = await this.workspaces.findByMetaPhoneId(metaPhoneId);
          if (ws) {
            workspaceId = ws.id;
          } else {
            this.logger.warn(
              `Meta webhook recebido para phoneId=${metaPhoneId} sem workspace associado`,
            );
            continue; // evita cair no workspace default
          }
        }

        for (const msg of messages) {
          const from = msg?.from;
          const text =
            msg?.text?.body ||
            msg?.button?.text ||
            msg?.interactive?.title ||
            '';

          if (!from || !text) continue;

          await this.whatsappService.handleIncoming(workspaceId, from, text);
        }

        // Processa status de entrega/leitura/falha
        for (const st of statuses) {
          const id = st?.id;
          const status = String(st?.status || '').toUpperCase(); // delivered, read, failed
          const errorCode = st?.errors?.[0]?.code || st?.errors?.[0]?.title;
          const recipient = st?.recipient_id?.replace(/\D/g, '');

          if (!id || !status) continue;
          await this.webhooks.updateMessageStatus({
            workspaceId,
            externalId: id,
            status,
            errorCode: errorCode || undefined,
            phone: recipient || undefined,
          });
        }
      }
    }
    return { ok: true };
  }

  /* ========================================================================
   * 8) INICIAR FLUXO META EMBEDDED SIGNUP (OAuth)
   *    GET /whatsapp/meta/oauth?workspaceId=<id>
   * ======================================================================== */
  @Public()
  @Get('meta/oauth')
  async metaOAuthStart(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    // We need the workspaceId to store the Meta config later
    // The front-end will send this as a query param when initiating the OAuth flow
    if (!workspaceId) {
      throw new BadRequestException('Missing workspaceId for Meta OAuth');
    }

    // Ensure workspace exists before redirect
    await this.workspaces.getWorkspace(workspaceId).catch(() => {
      throw new BadRequestException('Workspace not found for Meta OAuth');
    });

    // Redirect to Meta's OAuth dialog
    const redirectUrl = await this.whatsappService.getMetaOAuthUrl(workspaceId);
    return { redirect: redirectUrl };
  }

  /* ========================================================================
   * 9) CALLBACK DO META EMBEDDED SIGNUP (OAuth)
   *    GET /whatsapp/meta/oauth/callback?code=<code-from-meta>&state=<state-from-meta>
   * ======================================================================== */
  @Public()
  @Get('meta/oauth/callback')
  async metaOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    if (!code || !state) {
      throw new BadRequestException(
        'Missing code or state from Meta OAuth callback',
      );
    }

    // State should contain the workspaceId (and potentially other data for security)
    let workspaceId: string;
    try {
      workspaceId = this.whatsappService.verifyMetaState(state);
    } catch (err) {
      throw new BadRequestException(
        `Invalid state parameter: ${(err as Error)?.message || 'unverified'}`,
      );
    }

    if (!workspaceId) {
      throw new BadRequestException(
        'Invalid state parameter in Meta OAuth callback',
      );
    }

    await this.workspaces.getWorkspace(workspaceId).catch(() => {
      throw new BadRequestException(
        'Workspace not found for Meta OAuth callback',
      );
    });

    // Exchange code for permanent token and phone number info
    await this.whatsappService.handleMetaOAuthCallback(code, workspaceId);

    // Redirect back to front-end dashboard (e.g., settings page)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return {
      redirect: `${frontendUrl}/dashboard/settings?meta_connected=true`,
    };
  }

  /* ========================================================================
   * 10) STATUS CALLBACKS DE PROVEDORES (WPP / EVOLUTION / ULTRAWA)
   *     Ack/status → DELIVERED/READ/FAILED/SENT
   * ======================================================================== */
  @Public()
  @Post('wpp/status')
  async wppStatus(@Body() body: any) {
    this.assertProviderToken(body);
    const { workspaceId, ack, status, messageId, id, externalId, wid, phone } =
      body || {};
    const normalized = this.normalizeStatus(status, ack);
    return this.webhooks.updateMessageStatus({
      workspaceId,
      externalId: externalId || messageId || id || wid,
      status: normalized.status,
      errorCode: normalized.errorCode,
      phone: this.normalizePhone(phone || body?.to || body?.remoteJid),
    });
  }

  @Public()
  @Post('evolution/status')
  async evolutionStatus(@Body() body: any) {
    this.assertProviderToken(body);
    const { workspaceId, messageId, id, externalId, status, ack, phone, to } =
      body || {};
    const normalized = this.normalizeStatus(status, ack);
    return this.webhooks.updateMessageStatus({
      workspaceId,
      externalId: externalId || messageId || id,
      status: normalized.status,
      errorCode: normalized.errorCode,
      phone: this.normalizePhone(phone || to),
    });
  }

  @Public()
  @Post('ultrawa/status')
  async ultrawaStatus(@Body() body: any) {
    this.assertProviderToken(body);
    const {
      workspaceId,
      messageId,
      id,
      externalId,
      status,
      ack,
      phone,
      to,
    } = body || {};
    const normalized = this.normalizeStatus(status, ack);
    return this.webhooks.updateMessageStatus({
      workspaceId,
      externalId: externalId || messageId || id,
      status: normalized.status,
      errorCode: normalized.errorCode,
      phone: this.normalizePhone(phone || to),
    });
  }

  /**
   * Normaliza status de provedores para DELIVERED/READ/FAILED/SENT.
   * WPP ack: -1=FAILED, 0=PENDING,1=SENT,2=DELIVERED,3=READ,4=PLAYED
   */
  private normalizeStatus(
    rawStatus?: any,
    ack?: any,
  ): {
    status: string;
    errorCode?: string;
  } {
    const upper =
      typeof rawStatus === 'string' ? rawStatus.toUpperCase() : undefined;
    const ackNum =
      typeof ack === 'string' && ack.trim() !== ''
        ? Number(ack)
        : typeof ack === 'number'
          ? ack
          : undefined;
    if (typeof ackNum === 'number' && !Number.isNaN(ackNum)) {
      if (ackNum === -1) return { status: 'FAILED', errorCode: 'ack_-1' };
      if (ackNum === 0) return { status: 'SENT' };
      if (ackNum === 1) return { status: 'SENT' };
      if (ackNum === 2) return { status: 'DELIVERED' };
      if (ackNum === 3 || ackNum === 4) return { status: 'READ' };
    }
    if (upper === 'READ') return { status: 'READ' };
    if (upper === 'DELIVERED' || upper === 'SENT') return { status: upper };
    if (upper === 'FAILED' || upper === 'ERROR') {
      return { status: 'FAILED', errorCode: 'provider_error' };
    }
    return { status: 'SENT' };
  }

  private normalizePhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/\D/g, '');
    return digits.length ? digits : undefined;
  }

  /**
   * Protege callbacks de status com token simples (opcional).
   * Se PROVIDER_STATUS_TOKEN estiver definido, exige header/body token correspondente.
   */
  private assertProviderToken(payload?: any) {
    const expected = process.env.PROVIDER_STATUS_TOKEN;
    if (!expected) {
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException('PROVIDER_STATUS_TOKEN not configured');
      }
      return;
    }
    const provided =
      payload?.token ||
      payload?.statusToken ||
      payload?.providerToken ||
      payload?.signature;
    if (!provided || String(provided) !== expected) {
      throw new BadRequestException('Invalid provider token');
    }
  }
}
