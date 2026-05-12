import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from './public.decorator';

interface AppleProbeResult {
  result: string;
  status?: number;
  error?: string | null;
  errorDescription?: string | null;
  at?: string;
  missing?: string[];
  configured?: string[];
}

interface AppleDiagnosticResponse {
  configured: boolean;
  lastProbe: { at: string; result: string; error?: string } | null;
  configuredVars: string[];
  missingVars: string[];
}

const ARTIFACTS_DIR = resolve(process.cwd(), '..', 'artifacts', 'apple-validation');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function readLatestProbe(): AppleProbeResult | null {
  try {
    if (!existsSync(ARTIFACTS_DIR)) return null;
    const files = readdirSync(ARTIFACTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) return null;
    const latest = files[0];
    if (!latest) return null;
    const content = readFileSync(resolve(ARTIFACTS_DIR, latest), 'utf8');
    return JSON.parse(content) as AppleProbeResult;
  } catch {
    return null;
  }
}

@Controller('auth')
@Public()
export class AppleLoginDiagnosticController {
  constructor(private readonly config: ConfigService) {}

  @Get('apple/diagnostic')
  diagnostic(): AppleDiagnosticResponse {
    const required = [
      'APPLE_TEAM_ID',
      'APPLE_KEY_ID',
      'APPLE_PRIVATE_KEY_P8',
      'APPLE_SERVICE_ID',
      'APPLE_REDIRECT_URI',
    ];

    const configuredVars = required.filter((key) => {
      const value = this.config.get<string>(key);
      return typeof value === 'string' && value.trim().length > 0;
    });

    const missingVars = required.filter((key) => !configuredVars.includes(key));

    const probe = readLatestProbe();

    let lastProbe: AppleDiagnosticResponse['lastProbe'] = null;
    if (probe && probe.result && probe.at) {
      const age = Date.now() - new Date(probe.at).getTime();
      if (age <= SEVEN_DAYS_MS) {
        lastProbe = {
          at: probe.at,
          result: probe.result,
          ...(probe.error ? { error: probe.error } : {}),
        };
      }
    }

    const configured = missingVars.length === 0;

    return {
      configured,
      lastProbe,
      configuredVars,
      missingVars,
    };
  }
}
