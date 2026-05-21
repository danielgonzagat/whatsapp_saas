import { BadRequestException } from '@nestjs/common';
import net from 'node:net';
import tls from 'node:tls';

const SOCKET_TIMEOUT_MS = 15000;

export interface MailboxSocketConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

function withMailboxSocket(
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

function readUntil(
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

function writeLine(socket: net.Socket | tls.TLSSocket, line: string): Promise<void> {
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

function quoteImap(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function validateImapSocket(config: MailboxSocketConfig): Promise<void> {
  await withMailboxSocket(config, async (socket) => {
    await readUntil(socket, (line) => line.includes('* OK'));
    await writeLine(socket, `A1 LOGIN ${quoteImap(config.username)} ${quoteImap(config.password)}`);
    await readUntil(socket, (line) => line.includes('A1 OK'));
    await writeLine(socket, 'A2 LIST "" "*"');
    await readUntil(socket, (line) => line.includes('A2 OK'));
    await writeLine(socket, 'A3 LOGOUT');
  }).catch(() => {
    throw new BadRequestException('imap_validation_failed');
  });
}

export async function validateSmtpSocket(config: MailboxSocketConfig): Promise<void> {
  await withMailboxSocket(config, async (socket) => {
    await readUntil(socket, (line) => line.startsWith('220'));
    await writeLine(socket, 'EHLO kloel.local');
    await readUntil(socket, (line) => line.startsWith('250'));
    await writeLine(socket, 'AUTH LOGIN');
    await readUntil(socket, (line) => line.startsWith('334'));
    await writeLine(socket, Buffer.from(config.username, 'utf8').toString('base64'));
    await readUntil(socket, (line) => line.startsWith('334'));
    await writeLine(socket, Buffer.from(config.password, 'utf8').toString('base64'));
    await readUntil(socket, (line) => line.startsWith('235'));
    await writeLine(socket, 'QUIT');
  }).catch(() => {
    throw new BadRequestException('smtp_validation_failed');
  });
}
