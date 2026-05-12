import { BadRequestException, Injectable } from '@nestjs/common';
import { MailboxProvider, MailboxStatus, Prisma } from '@prisma/client';
import net from 'node:net';
import tls from 'node:tls';
import { Metrics } from '../observability/metrics';
import { PrismaService } from '../prisma/prisma.service';
import { encryptMailboxToken } from './mailbox-token-crypto';

interface ImapSmtpConnectInput {
  email?: unknown;
  imapHost?: unknown;
  imapPort?: unknown;
  imapSecure?: unknown;
  imapUsername?: unknown;
  imapPassword?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpSecure?: unknown;
  smtpUsername?: unknown;
  smtpPassword?: unknown;
}

interface MailboxSocketConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

const SOCKET_TIMEOUT_MS = 15000;
const MAX_HOST_LENGTH = 255;
const MAX_USERNAME_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1000;

function cleanText(value: unknown, maxLength: number): string {
  return String(value || '')
    .trim()
    .slice(0, maxLength);
}

function cleanEmail(value: unknown): string {
  const email = cleanText(value, MAX_USERNAME_LENGTH).toLowerCase();
  if (!email || !email.includes('@')) {
    throw new BadRequestException('mailbox_email_required');
  }
  return email;
}

function cleanHost(value: unknown, field: string): string {
  const host = cleanText(value, MAX_HOST_LENGTH);
  if (!host || host.includes('/') || host.includes('\\')) {
    throw new BadRequestException(`${field}_required`);
  }
  return host;
}

function cleanPort(value: unknown, fallback: number, field: string): number {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException(`${field}_invalid`);
  }
  return port;
}

function cleanCredential(value: unknown, field: string): string {
  const credential = cleanText(
    value,
    field.includes('Password') ? MAX_PASSWORD_LENGTH : MAX_USERNAME_LENGTH,
  );
  if (!credential) {
    throw new BadRequestException(`${field}_required`);
  }
  return credential;
}

@Injectable()
export class MailboxImapSmtpService {
  constructor(private readonly prisma: PrismaService) {}

  async connectMailbox(workspaceId: string, input: ImapSmtpConnectInput) {
    const email = cleanEmail(input.email);
    const imap = this.readImapConfig(input);
    const smtp = this.readSmtpConfig(input);

    await Promise.all([this.validateImapConnection(imap), this.validateSmtpConnection(smtp)]);

    const connection = await this.prisma.mailboxConnection.upsert({
      where: {
        workspaceId_provider_email: {
          workspaceId,
          provider: MailboxProvider.IMAP_SMTP,
          email,
        },
      },
      create: {
        workspaceId,
        provider: MailboxProvider.IMAP_SMTP,
        email,
        status: MailboxStatus.ACTIVE,
        imapHost: imap.host,
        imapPort: imap.port,
        imapSecure: imap.secure,
        imapUsername: imap.username,
        imapPassword: encryptMailboxToken(imap.password) ?? null,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure,
        smtpUsername: smtp.username,
        smtpPassword: encryptMailboxToken(smtp.password) ?? null,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorAt: null,
        lastError: null,
        metadata: this.buildMetadata(),
      },
      update: {
        status: MailboxStatus.ACTIVE,
        imapHost: imap.host,
        imapPort: imap.port,
        imapSecure: imap.secure,
        imapUsername: imap.username,
        imapPassword: encryptMailboxToken(imap.password) ?? null,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure,
        smtpUsername: smtp.username,
        smtpPassword: encryptMailboxToken(smtp.password) ?? null,
        connectedAt: new Date(),
        disconnectedAt: null,
        lastErrorAt: null,
        lastError: null,
        metadata: this.buildMetadata(),
      },
      select: {
        id: true,
        provider: true,
        email: true,
        status: true,
        connectedAt: true,
      },
    });

    Metrics.mailbox.connected('imap_smtp', { workspace_id: workspaceId });

    return {
      connected: true,
      provider: 'imap_smtp',
      status: 'connected',
      email: connection.email,
      connectionId: connection.id,
    };
  }

  async getPrimaryImapSmtpStatus(workspaceId: string) {
    return this.prisma.mailboxConnection.findFirst({
      where: {
        workspaceId,
        provider: MailboxProvider.IMAP_SMTP,
        status: MailboxStatus.ACTIVE,
      },
      orderBy: { connectedAt: 'desc' },
      select: {
        id: true,
        email: true,
        provider: true,
        status: true,
        connectedAt: true,
        lastSyncAt: true,
        lastErrorAt: true,
        lastError: true,
      },
    });
  }

  private readImapConfig(input: ImapSmtpConnectInput): MailboxSocketConfig {
    const secure = input.imapSecure !== false;
    return {
      host: cleanHost(input.imapHost, 'imap_host'),
      port: cleanPort(input.imapPort, secure ? 993 : 143, 'imap_port'),
      secure,
      username: cleanCredential(input.imapUsername || input.email, 'imapUsername'),
      password: cleanCredential(input.imapPassword, 'imapPassword'),
    };
  }

  private readSmtpConfig(input: ImapSmtpConnectInput): MailboxSocketConfig {
    const secure = input.smtpSecure !== false;
    return {
      host: cleanHost(input.smtpHost, 'smtp_host'),
      port: cleanPort(input.smtpPort, secure ? 465 : 587, 'smtp_port'),
      secure,
      username: cleanCredential(input.smtpUsername || input.email, 'smtpUsername'),
      password: cleanCredential(input.smtpPassword, 'smtpPassword'),
    };
  }

  private buildMetadata() {
    return {
      provider: 'imap_smtp',
      validatedAt: new Date().toISOString(),
      validation: {
        imap: 'login_list_logout',
        smtp: 'ehlo_auth_quit',
      },
    } satisfies Prisma.InputJsonObject;
  }

  private async validateImapConnection(config: MailboxSocketConfig): Promise<void> {
    await this.withMailboxSocket(config, async (socket) => {
      await this.readUntil(socket, (line) => line.includes('* OK'));
      await this.writeLine(
        socket,
        `A1 LOGIN ${this.quoteImap(config.username)} ${this.quoteImap(config.password)}`,
      );
      await this.readUntil(socket, (line) => line.includes('A1 OK'));
      await this.writeLine(socket, 'A2 LIST "" "*"');
      await this.readUntil(socket, (line) => line.includes('A2 OK'));
      await this.writeLine(socket, 'A3 LOGOUT');
    }).catch(() => {
      throw new BadRequestException('imap_validation_failed');
    });
  }

  private async validateSmtpConnection(config: MailboxSocketConfig): Promise<void> {
    await this.withMailboxSocket(config, async (socket) => {
      await this.readUntil(socket, (line) => line.startsWith('220'));
      await this.writeLine(socket, 'EHLO kloel.local');
      await this.readUntil(socket, (line) => line.startsWith('250'));
      await this.writeLine(socket, 'AUTH LOGIN');
      await this.readUntil(socket, (line) => line.startsWith('334'));
      await this.writeLine(socket, Buffer.from(config.username, 'utf8').toString('base64'));
      await this.readUntil(socket, (line) => line.startsWith('334'));
      await this.writeLine(socket, Buffer.from(config.password, 'utf8').toString('base64'));
      await this.readUntil(socket, (line) => line.startsWith('235'));
      await this.writeLine(socket, 'QUIT');
    }).catch(() => {
      throw new BadRequestException('smtp_validation_failed');
    });
  }

  private withMailboxSocket(
    config: MailboxSocketConfig,
    handler: (socket: net.Socket | tls.TLSSocket) => Promise<void>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = config.secure
        ? tls.connect({
            host: config.host,
            port: config.port,
            servername: config.host,
            timeout: SOCKET_TIMEOUT_MS,
          })
        : net.connect({ host: config.host, port: config.port, timeout: SOCKET_TIMEOUT_MS });
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      socket.once('error', finish);
      socket.once('timeout', () => finish(new Error('mailbox_socket_timeout')));
      socket.once(config.secure ? 'secureConnect' : 'connect', () => {
        handler(socket).then(() => finish(), finish);
      });
    });
  }

  private readUntil(
    socket: net.Socket | tls.TLSSocket,
    predicate: (line: string) => boolean,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('mailbox_protocol_timeout'));
      }, SOCKET_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        const matched = lines.find(predicate);
        if (matched) {
          cleanup();
          resolve(matched);
        }
      };
      socket.on('data', onData);
      socket.once('error', onError);
    });
  }

  private writeLine(socket: net.Socket | tls.TLSSocket, line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(`${line}\r\n`, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private quoteImap(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
}
