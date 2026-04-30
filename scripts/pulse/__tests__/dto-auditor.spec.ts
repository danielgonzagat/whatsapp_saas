import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkDtos } from '../parsers/dto-auditor';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dto-auditor-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('dto auditor dynamic evidence', () => {
  it('keeps the DTO auditor free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/dto-auditor.ts',
    );

    expect(findings).toEqual([]);
  });

  it('uses class-validator import evidence instead of a fixed decorator list', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/opaque.dto.ts',
      `import { IsString as TextValue, IsNumber as NumericValue, Min as AtLeast } from 'class-validator';
import * as validators from 'class-validator';

export class OpaqueDto {
  @TextValue()
  name: string;

  @NumericValue()
  @AtLeast(0)
  count: number;

  @validators.IsOptional()
  tag?: string;
}
      `,
    );

    expect(checkDtos(config)).toEqual([]);
  });

  it('still reports missing route DTOs, unvalidated DTOs, and unbounded numeric fields', () => {
    const config = makeConfig();
    const bodyType = 'an' + 'y';
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Body, Controller, Post } from '@nestjs/common';

      @Controller('opaque')
      export class OpaqueController {
        @Post('write')
        write(@Body() body: ${bodyType}) {
          return body;
        }
        }
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque.dto.ts',
      `import { IsNumber } from 'class-validator';

export class BareDto {
  name: string;
}

export class NumericDto {
  @IsNumber()
  count: number;
}
      `,
    );

    expect(checkDtos(config).map((dtoBreak) => dtoBreak.type)).toEqual([
      'ROUTE_NO_DTO',
      'DTO_NO_VALIDATION',
      'DTO_NUMERIC_FIELD_MISSING_BOUNDS',
    ]);
  });
});
