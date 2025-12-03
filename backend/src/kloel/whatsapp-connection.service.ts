import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  BaileysEventMap,
  proto,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import pino from 'pino';
import { PrismaService } from '../prisma/prisma.service';
import { KloelService } from './kloel.service';

interface ConnectionSession {
  socket: WASocket | null;
  qrCode: string | null;
  status: 'disconnected' | 'connecting' | 'qr_pending' | 'connected' | 'error';
  phoneNumber: string | null;
  businessName: string | null;
  lastActivity: Date;
  errorMessage: string | null;
}

@Injectable()
export class WhatsAppConnectionService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppConnectionService.name);
  private sessions: Map<string, ConnectionSession> = new Map();
  private readonly authBasePath = path.join(process.cwd(), 'whatsapp-sessions');
  private messageHandlers: Map<string, boolean> = new Map(); // Track if handlers are set

  constructor(
    private readonly prisma: PrismaService,
    private readonly kloel: KloelService,
  ) {
    super();
    this.ensureAuthDirectory();
  }

  private ensureAuthDirectory() {
    if (!fs.existsSync(this.authBasePath)) {
      fs.mkdirSync(this.authBasePath, { recursive: true });
    }
  }

  /**
   * Inicia conexão WhatsApp para um workspace
   * Retorna QR Code para escaneamento
   */
  async initiateConnection(workspaceId: string): Promise<{
    status: string;
    qrCode?: string;
    message: string;
  }> {
    this.logger.log(`Iniciando conexão WhatsApp para workspace: ${workspaceId}`);

    // Verifica se já existe sessão ativa
    const existingSession = this.sessions.get(workspaceId);
    if (existingSession?.status === 'connected') {
      return {
        status: 'already_connected',
        message: `WhatsApp já conectado: ${existingSession.phoneNumber}`,
      };
    }

    // Cria nova sessão
    const session: ConnectionSession = {
      socket: null,
      qrCode: null,
      status: 'connecting',
      phoneNumber: null,
      businessName: null,
      lastActivity: new Date(),
      errorMessage: null,
    };
    this.sessions.set(workspaceId, session);

    try {
      const authPath = path.join(this.authBasePath, workspaceId);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      const { version } = await fetchLatestBaileysVersion();

      const logger = pino({ level: 'silent' }); // Silencia logs do Baileys

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: ['KLOEL SaaS', 'Chrome', '120.0.0'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
      });

      session.socket = socket;

      // Handler de QR Code
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          session.qrCode = qr;
          session.status = 'qr_pending';
          this.logger.log(`QR Code gerado para workspace: ${workspaceId}`);
          this.emit('qr', { workspaceId, qr });
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect) {
            session.status = 'connecting';
            this.logger.warn(`Reconectando workspace ${workspaceId}...`);
            // Retry após 5 segundos
            setTimeout(() => this.initiateConnection(workspaceId), 5000);
          } else {
            session.status = 'disconnected';
            session.socket = null;
            this.logger.log(`Workspace ${workspaceId} deslogado`);
            this.emit('disconnected', { workspaceId });
            
            // Limpa auth para forçar novo QR
            this.clearAuth(workspaceId);
          }
        }

        if (connection === 'open') {
          session.status = 'connected';
          session.qrCode = null;
          session.phoneNumber = socket.user?.id?.split(':')[0] || null;
          session.businessName = socket.user?.name || null;
          session.lastActivity = new Date();
          
          this.logger.log(`✅ WhatsApp conectado - Workspace: ${workspaceId}, Número: ${session.phoneNumber}`);
          this.emit('connected', { 
            workspaceId, 
            phoneNumber: session.phoneNumber,
            businessName: session.businessName 
          });

          // Registra no banco
          await this.saveConnectionStatus(workspaceId, session);
        }
      });

      // Salva credenciais
      socket.ev.on('creds.update', saveCreds);

      // Handler de mensagens recebidas - KLOEL assume
      if (!this.messageHandlers.has(workspaceId)) {
        socket.ev.on('messages.upsert', async (m) => {
          await this.handleIncomingMessages(workspaceId, m);
        });
        this.messageHandlers.set(workspaceId, true);
      }

      // Aguarda QR Code ou conexão
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (session.qrCode) {
            resolve({
              status: 'qr_ready',
              qrCode: session.qrCode,
              message: 'Escaneie o QR Code com seu WhatsApp',
            });
          } else if (session.status === 'connected') {
            resolve({
              status: 'connected',
              message: `Conectado: ${session.phoneNumber}`,
            });
          } else {
            resolve({
              status: 'connecting',
              message: 'Aguardando conexão...',
            });
          }
        }, 5000);

        // Se conectar antes do timeout
        this.once('connected', () => {
          clearTimeout(timeout);
          resolve({
            status: 'connected',
            message: `Conectado: ${session.phoneNumber}`,
          });
        });

        // Se QR chegar antes
        this.once('qr', ({ qr }) => {
          clearTimeout(timeout);
          resolve({
            status: 'qr_ready',
            qrCode: qr,
            message: 'Escaneie o QR Code com seu WhatsApp',
          });
        });
      });

    } catch (error) {
      session.status = 'error';
      session.errorMessage = error.message;
      this.logger.error(`Erro na conexão: ${error.message}`);
      
      return {
        status: 'error',
        message: `Erro: ${error.message}`,
      };
    }
  }

  /**
   * Processa mensagens recebidas e delega para KLOEL
   */
  private async handleIncomingMessages(workspaceId: string, m: BaileysEventMap['messages.upsert']) {
    if (!m.messages?.length) return;
    if (m.type !== 'notify') return;

    for (const message of m.messages) {
      // Ignora mensagens próprias e status broadcasts
      if (message.key.fromMe) continue;
      if (message.key.remoteJid === 'status@broadcast') continue;
      if (!message.message) continue;

      const senderJid = message.key.remoteJid!;
      const senderPhone = senderJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
      
      // Extrai texto da mensagem
      const text = this.extractMessageText(message);
      if (!text) continue;

      this.logger.log(`📥 Mensagem recebida - De: ${senderPhone}, Texto: ${text.substring(0, 50)}...`);

      try {
        // KLOEL processa a mensagem
        const response = await this.kloel.processWhatsAppMessage(workspaceId, senderPhone, text);
        
        // Envia resposta
        if (response) {
          await this.sendMessage(workspaceId, senderPhone, response);
        }
      } catch (error) {
        this.logger.error(`Erro processando mensagem: ${error.message}`);
      }
    }
  }

  /**
   * Extrai texto de diferentes tipos de mensagem
   */
  private extractMessageText(message: proto.IWebMessageInfo): string | null {
    const msg = message.message;
    if (!msg) return null;

    // Mensagem de texto simples
    if (msg.conversation) return msg.conversation;
    
    // Texto estendido
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    
    // Caption de imagem
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    
    // Caption de vídeo
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;
    
    // Caption de documento
    if (msg.documentMessage?.caption) return msg.documentMessage.caption;

    // Botão selecionado
    if (msg.buttonsResponseMessage?.selectedButtonId) {
      return msg.buttonsResponseMessage.selectedDisplayText || msg.buttonsResponseMessage.selectedButtonId;
    }

    // Lista selecionada
    if (msg.listResponseMessage?.title) {
      return msg.listResponseMessage.title;
    }

    return null;
  }

  /**
   * Envia mensagem via WhatsApp conectado
   */
  async sendMessage(workspaceId: string, phoneNumber: string, text: string): Promise<boolean> {
    const session = this.sessions.get(workspaceId);
    if (!session?.socket || session.status !== 'connected') {
      this.logger.error(`Sessão não conectada para workspace: ${workspaceId}`);
      return false;
    }

    try {
      const jid = phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`;
      
      // Simula digitação
      await session.socket.presenceSubscribe(jid);
      await session.socket.sendPresenceUpdate('composing', jid);
      
      // Delay proporcional ao tamanho
      const typingDelay = Math.min(text.length * 50, 5000);
      await new Promise(resolve => setTimeout(resolve, typingDelay));
      
      await session.socket.sendPresenceUpdate('paused', jid);
      
      // Envia mensagem
      await session.socket.sendMessage(jid, { text });
      
      session.lastActivity = new Date();
      this.logger.log(`📤 Mensagem enviada - Para: ${phoneNumber}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Erro enviando mensagem: ${error.message}`);
      return false;
    }
  }

  /**
   * Envia mensagem com botões
   */
  async sendMessageWithButtons(
    workspaceId: string,
    phoneNumber: string,
    text: string,
    buttons: { id: string; text: string }[]
  ): Promise<boolean> {
    const session = this.sessions.get(workspaceId);
    if (!session?.socket || session.status !== 'connected') {
      return false;
    }

    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      
      const buttonMessage = {
        text,
        footer: 'KLOEL - Inteligência Comercial',
        buttons: buttons.map(b => ({
          buttonId: b.id,
          buttonText: { displayText: b.text },
          type: 1,
        })),
        headerType: 1,
      };

      await session.socket.sendMessage(jid, buttonMessage);
      return true;
    } catch (error) {
      this.logger.error(`Erro enviando botões: ${error.message}`);
      return false;
    }
  }

  /**
   * Envia mídia (imagem, documento, áudio)
   */
  async sendMedia(
    workspaceId: string,
    phoneNumber: string,
    type: 'image' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string
  ): Promise<boolean> {
    const session = this.sessions.get(workspaceId);
    if (!session?.socket || session.status !== 'connected') {
      return false;
    }

    try {
      const jid = `${phoneNumber}@s.whatsapp.net`;
      
      const message: any = {};
      
      if (type === 'image') {
        message.image = { url: mediaUrl };
        if (caption) message.caption = caption;
      } else if (type === 'document') {
        message.document = { url: mediaUrl };
        message.mimetype = 'application/pdf';
        message.fileName = caption || 'documento.pdf';
      } else if (type === 'audio') {
        message.audio = { url: mediaUrl };
        message.mimetype = 'audio/mp4';
        message.ptt = true; // Voice note
      }

      await session.socket.sendMessage(jid, message);
      return true;
    } catch (error) {
      this.logger.error(`Erro enviando mídia: ${error.message}`);
      return false;
    }
  }

  /**
   * Retorna status da conexão
   */
  getConnectionStatus(workspaceId: string): ConnectionSession | null {
    return this.sessions.get(workspaceId) || null;
  }

  /**
   * Retorna QR Code atual
   */
  getQrCode(workspaceId: string): string | null {
    return this.sessions.get(workspaceId)?.qrCode || null;
  }

  /**
   * Desconecta WhatsApp
   */
  async disconnect(workspaceId: string): Promise<void> {
    const session = this.sessions.get(workspaceId);
    if (session?.socket) {
      await session.socket.logout();
      session.socket = null;
      session.status = 'disconnected';
      this.clearAuth(workspaceId);
    }
    this.sessions.delete(workspaceId);
  }

  /**
   * Limpa arquivos de autenticação
   */
  private clearAuth(workspaceId: string): void {
    const authPath = path.join(this.authBasePath, workspaceId);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
  }

  /**
   * Salva status no banco
   */
  private async saveConnectionStatus(workspaceId: string, session: ConnectionSession): Promise<void> {
    try {
      const prismaAny = this.prisma as any;
      await prismaAny.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId,
            key: 'whatsapp_connection',
          },
        },
        create: {
          workspaceId,
          key: 'whatsapp_connection',
          value: {
            phoneNumber: session.phoneNumber,
            businessName: session.businessName,
            connectedAt: new Date().toISOString(),
            status: 'connected',
          },
        },
        update: {
          value: {
            phoneNumber: session.phoneNumber,
            businessName: session.businessName,
            connectedAt: new Date().toISOString(),
            status: 'connected',
          },
        },
      });
    } catch (error) {
      this.logger.error(`Erro salvando status: ${error.message}`);
    }
  }

  /**
   * Carrega sessões salvas ao iniciar
   */
  async loadSavedSessions(): Promise<void> {
    try {
      const prismaAny = this.prisma as any;
      const connections = await prismaAny.kloelMemory.findMany({
        where: { key: 'whatsapp_connection' },
      });

      for (const conn of connections) {
        if (conn.value?.status === 'connected') {
          this.logger.log(`Reconectando workspace: ${conn.workspaceId}`);
          await this.initiateConnection(conn.workspaceId);
        }
      }
    } catch (error) {
      this.logger.error(`Erro carregando sessões: ${error.message}`);
    }
  }

  /**
   * Lista todas as sessões ativas
   */
  getActiveSessions(): { workspaceId: string; phoneNumber: string | null; status: string }[] {
    const active: { workspaceId: string; phoneNumber: string | null; status: string }[] = [];
    
    this.sessions.forEach((session, workspaceId) => {
      if (session.status === 'connected') {
        active.push({
          workspaceId,
          phoneNumber: session.phoneNumber,
          status: session.status,
        });
      }
    });
    
    return active;
  }

  async onModuleDestroy() {
    this.logger.log('Fechando todas as conexões WhatsApp...');
    for (const [workspaceId] of this.sessions) {
      await this.disconnect(workspaceId);
    }
  }
}
