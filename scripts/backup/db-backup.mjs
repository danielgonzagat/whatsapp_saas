#!/usr/bin/env node
/**
 * Database backup script for Kloel.
 * Dumps PostgreSQL and updates manifest.
 * Usage: DATABASE_URL=postgres://... node scripts/backup/db-backup.mjs
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = join(process.cwd(), '.backups');
const DUMP_FILE = join(BACKUP_DIR, `${TIMESTAMP}.dump`);
const MANIFEST_FILE = join(process.cwd(), '.backup-manifest.json');
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

try {
  mkdirSync(BACKUP_DIR, { recursive: true });

  console.log(`Backing up to ${DUMP_FILE}`);
  execSync(`pg_dump --format=custom --compress=9 --file="${DUMP_FILE}" "${DB_URL}"`, {
    timeout: 300_000,
    stdio: 'inherit',
  });

  const size = statSync(DUMP_FILE).size;
  const mb = (size / 1024 / 1024).toFixed(2);
  console.log(`Done: ${mb} MB`);

  const manifest = existsSync(MANIFEST_FILE)
    ? JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
    : { backups: [] };

  manifest.lastBackup = new Date().toISOString();
  manifest.lastBackupSize = size;
  manifest.lastBackupFile = DUMP_FILE;
  manifest.backups = (manifest.backups || []).slice(-29);
  manifest.backups.push({ timestamp: TIMESTAMP, file: DUMP_FILE, size });

  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  console.log('Manifest updated');
  process.exit(0);
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}
