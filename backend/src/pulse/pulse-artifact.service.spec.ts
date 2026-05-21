import { ConfigService } from '@nestjs/config';
import { PulseArtifactService } from './pulse-artifact.service';

jest.mock('node:fs', () => {
  const actualFs = jest.requireActual('node:fs');
  return {
    ...actualFs,
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(),
  };
});

import * as fs from 'node:fs';

function createConfig(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as ConfigService;
}

function freshDirectiveData() {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    authorityMode: 'autonomous-execution',
    advisoryOnly: false,
    automationEligible: true,
    autonomyVerdict: 'SIM',
    autonomousNextStepVerdict: 'SIM',
    productionAutonomyVerdict: 'SIM',
    zeroPromptProductionGuidanceVerdict: 'SIM',
    canWorkUntilProductionReady: true,
    autonomyReadiness: {
      verdict: 'SIM',
      canWorkNow: true,
      canDeclareComplete: true,
      warnings: [],
    },
    autonomyProof: {
      authorityMode: 'autonomous-execution',
      verdicts: {
        canDeclareComplete: true,
        nextStepAutonomy: 'SIM',
        productionAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
      },
      blockersBeforeProductionSim: [],
    },
  };
}

function freshCertificateData() {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    status: 'CERTIFIED',
    score: 100,
    humanReplacementStatus: 'READY',
  };
}

describe('PulseArtifactService', () => {
  let service: PulseArtifactService;

  beforeEach(() => {
    (fs.existsSync as jest.Mock).mockReset();
    (fs.readFileSync as jest.Mock).mockReset();

    const config = createConfig({
      PULSE_ARTIFACT_ROOT: '/fake/repo',
      PULSE_ARTIFACT_MAX_AGE_MS: '60000',
    });

    (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
      String(p).includes('.json'),
    );
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');

    service = new PulseArtifactService(config);
  });

  describe('readArtifactJson', () => {
    it('returns missing freshness when file does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = service.readArtifactJson('PULSE_CLI_DIRECTIVE.json');
      expect(result.freshness).toBe('missing');
      expect(result.data).toBeNull();
    });

    it('returns fresh data when artifact is within max age', () => {
      const data = freshDirectiveData();
      (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(data));

      const result = service.readArtifactJson('PULSE_CLI_DIRECTIVE.json');
      expect(result.freshness).toBe('fresh');
      expect(result.data).toEqual(data);
    });

    it('returns stale freshness when artifact is older than max age', () => {
      const oldDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ generatedAt: oldDate }),
      );

      const result = service.readArtifactJson('PULSE_CLI_DIRECTIVE.json');
      expect(result.freshness).toBe('stale');
    });

    it('returns missing freshness on JSON parse error', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid json {');

      const result = service.readArtifactJson('PULSE_CLI_DIRECTIVE.json');
      expect(result.freshness).toBe('missing');
      expect(result.error).toBeDefined();
    });
  });

  describe('getMachineReadiness', () => {
    it('returns certified status when directive + certificate are fresh', () => {
      const directiveData = freshDirectiveData();
      const certData = freshCertificateData();
      (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
        const sp = String(p);
        if (sp.includes('PULSE_CLI_DIRECTIVE')) return JSON.stringify(directiveData);
        if (sp.includes('PULSE_CERTIFICATE')) return JSON.stringify(certData);
        if (sp.includes('PULSE_EXECUTION_MATRIX'))
          return JSON.stringify({ generatedAt: new Date().toISOString() });
        return '{}';
      });

      const result = service.getMachineReadiness();
      expect(result.status).toBe('certified');
    });

    it('returns blocked status when directive is missing', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('{}');
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = service.getMachineReadiness();
      expect(['unknown', 'blocked'].includes(result.status)).toBe(true);
    });
  });

  describe('getProductionSnapshot', () => {
    it('returns ready status when all artifacts are fresh', () => {
      (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
        const sp = String(p);
        if (sp.includes('PULSE_CLI_DIRECTIVE')) return JSON.stringify(freshDirectiveData());
        if (sp.includes('PULSE_CERTIFICATE')) return JSON.stringify(freshCertificateData());
        return JSON.stringify({ generatedAt: new Date().toISOString() });
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = service.getProductionSnapshot();
      expect(result.status).toBe('ready');
    });
  });
});
