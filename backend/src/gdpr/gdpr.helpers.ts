import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';

export function writeJson(dir: string, filename: string, data: unknown) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf8');
}

export async function createZip(sourceDir: string, outputPath: string): Promise<void> {
  const archiver = await import('archiver');
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver.default('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export function parseFacebookSignedRequest(signedRequest: string): Record<string, unknown> {
  const parts = String(signedRequest || '').split('.');
  if (parts.length !== 2) {
    throw new BadRequestException('signed_request inválido.');
  }

  const encodedPayload = parts[1];
  if (!encodedPayload) {
    throw new BadRequestException('signed_request sem payload.');
  }

  try {
    const raw = Buffer.from(
      encodedPayload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    ).toString('utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new BadRequestException('signed_request com payload inválido.');
  }
}

export function generateCode(): string {
  return randomBytes(8).toString('hex').slice(0, 16);
}
