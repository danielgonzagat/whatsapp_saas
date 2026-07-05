import { Injectable, Logger } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface AuditLogEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  workspaceId?: string;
  agentId?: string;
  error?: string;
}

const LOGS_DIR = join(process.cwd(), 'storage', 'logs');

function ensureLogDir(): void {
  mkdirSync(LOGS_DIR, { recursive: true });
}

function rotateFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return join(LOGS_DIR, `audit-http-${y}-${m}-${d}.jsonl`);
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  writeEntry(entry: AuditLogEntry): void {
    try {
      ensureLogDir();
      appendFileSync(rotateFileName(), JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err: unknown) {
      this.logger.error(
        `Failed to write audit log entry: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
