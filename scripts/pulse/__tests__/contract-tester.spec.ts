import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildContractTestEvidence } from '../contract-tester';

describe('contract tester dynamic SDK evidence', () => {
  it('emits minimum contract coverage for observed SDK imports without URL or OpenAPI evidence', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-contract-sdk-'));
    const backendDir = path.join(rootDir, 'backend', 'src');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(
      path.join(backendDir, 'opaque-provider.service.ts'),
      [
        "import { OpaqueProviderClient } from '@opaque/provider-sdk';",
        '',
        'export function sendThroughSdk(client: OpaqueProviderClient) {',
        '  return client.send({ event: "created" });',
        '}',
      ].join('\n'),
      'utf8',
    );

    const evidence = buildContractTestEvidence(rootDir);
    const sdkContract = evidence.contracts.find(
      (contract) => contract.provider === '@opaque/provider-sdk',
    );

    expect(sdkContract).toMatchObject({
      provider: '@opaque/provider-sdk',
      endpoint: '/sdk-client',
      method: 'SDK',
      authType: 'none',
      status: 'generated',
    });
    expect(sdkContract?.expectedRequestSchema).toEqual({
      source: 'observed_package_import',
      packageName: '@opaque/provider-sdk',
    });
    expect(sdkContract?.issues.join('\n')).toContain('provider URL/schema not observed yet');
  });
});
