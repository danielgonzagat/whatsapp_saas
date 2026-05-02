import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';

interface BackupManifest {
  lastBackup: string;
  lastVerifiedAt?: string;
  targetRpoMinutes: number;
  frequencyMinutes?: number;
  stores?: Array<{
    name: string;
    type: string;
    rpoMinutes: number;
    configured: boolean;
    tested: boolean;
    lastTestEvidence?: string;
  }>;
}

const BACKUP_MANIFEST_PATH = join(process.cwd(), '.backup-manifest.json');
const DEFAULT_RPO_MINUTES = 60;

@Injectable()
export class DatabaseBackupHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(DatabaseBackupHealthIndicator.name);

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();

    try {
      const manifest = await this.loadManifest();

      if (!manifest) {
        this.logger.warn(
          'Backup manifest missing or unreadable',
          JSON.stringify({
            event: 'backup_health.manifest_missing',
            path: BACKUP_MANIFEST_PATH,
          }),
        );
        throw new HealthCheckError(
          'Backup manifest missing',
          this.getStatus(key, false, {
            message: '.backup-manifest.json not found',
            rpoMinutes: DEFAULT_RPO_MINUTES,
          }),
        );
      }

      const rpoWindow = manifest.targetRpoMinutes || DEFAULT_RPO_MINUTES;
      const lastBackup = new Date(manifest.lastBackup);
      const ageMinutes = Math.max(0, Math.round((Date.now() - lastBackup.getTime()) / 60_000));
      const withinRpo = ageMinutes <= rpoWindow;

      const storeStatuses = (manifest.stores || []).map((store) => {
        const storeRpo = store.rpoMinutes || rpoWindow;
        const storeWithinRpo = ageMinutes <= storeRpo;
        return {
          name: store.name,
          type: store.type,
          configured: store.configured,
          tested: store.tested,
          backupAgeMinutes: ageMinutes,
          rpoMinutes: store.rpoMinutes,
          withinRpo: storeWithinRpo,
          lastTestEvidence: store.lastTestEvidence || null,
        };
      });

      const anyStoreFailed = storeStatuses.some((s) => !s.withinRpo);

      if (!withinRpo || anyStoreFailed) {
        this.logger.warn(
          'Backup health check failed RPO evaluation',
          JSON.stringify({
            event: 'backup_health.rpo_violation',
            ageMinutes,
            manifestRpoMinutes: rpoWindow,
            stores: storeStatuses,
          }),
        );
        throw new HealthCheckError(
          `Backup age ${ageMinutes}min exceeds RPO window ${rpoWindow}min`,
          this.getStatus(key, false, {
            lastBackup: manifest.lastBackup,
            lastVerifiedAt: manifest.lastVerifiedAt || null,
            ageMinutes,
            rpoMinutes: rpoWindow,
            stores: storeStatuses,
          }),
        );
      }

      return this.getStatus(key, true, {
        lastBackup: manifest.lastBackup,
        lastVerifiedAt: manifest.lastVerifiedAt || null,
        ageMinutes,
        rpoMinutes: rpoWindow,
        stores: storeStatuses,
        checkDurationMs: Date.now() - startedAt,
      });
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw error;
      }

      this.logger.error(
        'Backup health check failed',
        JSON.stringify({
          event: 'backup_health.unexpected_error',
          message: error instanceof Error ? error.message : String(error),
          checkDurationMs: Date.now() - startedAt,
        }),
      );

      throw new HealthCheckError(
        'Backup health check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }

  private async loadManifest(): Promise<BackupManifest | null> {
    try {
      await access(BACKUP_MANIFEST_PATH, constants.F_OK);
      const raw = await readFile(BACKUP_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(raw) as BackupManifest;

      if (!manifest.lastBackup || Number.isNaN(new Date(manifest.lastBackup).getTime())) {
        this.logger.warn(
          'Backup manifest has invalid lastBackup',
          JSON.stringify({
            event: 'backup_health.invalid_last_backup',
            path: BACKUP_MANIFEST_PATH,
            manifestLastBackup: manifest.lastBackup,
          }),
        );
        return null;
      }

      return manifest;
    } catch {
      this.logger.warn(
        'Failed to read backup manifest',
        JSON.stringify({
          event: 'backup_health.read_failed',
          path: BACKUP_MANIFEST_PATH,
        }),
      );
      return null;
    }
  }
}
