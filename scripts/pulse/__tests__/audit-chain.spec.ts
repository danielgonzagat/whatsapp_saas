import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { appendBlock, buildAuditChain, verifyChain } from '../audit-chain';

function withTempRoot(run: (rootDir: string) => void): void {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-audit-chain-'));
  try {
    run(rootDir);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

function withSigningKey(value: string | null, run: () => void): void {
  const previous = process.env.PULSE_AUDIT_SIGNING_KEY;
  try {
    if (value === null) {
      delete process.env.PULSE_AUDIT_SIGNING_KEY;
    } else {
      process.env.PULSE_AUDIT_SIGNING_KEY = value;
    }
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.PULSE_AUDIT_SIGNING_KEY;
    } else {
      process.env.PULSE_AUDIT_SIGNING_KEY = previous;
    }
  }
}

describe('audit chain signing', () => {
  it('marks blocks unsigned while preserving hash-chain verification when no signing key is configured', () => {
    withSigningKey(null, () => {
      withTempRoot((rootDir) => {
        const chain = buildAuditChain(rootDir);
        const genesis = chain.blocks[0];

        expect(genesis.signature).toBe('');
        expect(genesis.signatureMode).toBe('unsigned');
        expect(genesis.signingKeyStatus).toBe('not_configured');
        expect(chain.verified).toBe(true);
        expect(chain.verificationFailures).toEqual([]);
      });
    });
  });

  it('uses the configured env key for signatures and verifies appended blocks', () => {
    withSigningKey('test-audit-signing-key', () => {
      withTempRoot((rootDir) => {
        const chain = buildAuditChain(rootDir);
        const genesis = chain.blocks[0];

        expect(genesis.signature).toMatch(/^[a-f0-9]{64}$/);
        expect(genesis.signatureMode).toBe('hmac_sha256');
        expect(genesis.signingKeyStatus).toBe('configured');
        expect(chain.verified).toBe(true);

        const nextChain = appendBlock(
          chain,
          {
            iteration: 1,
            unitId: 'audit-chain-signing',
            agent: 'codex',
            scoreBefore: 74,
            scoreAfter: 75,
            filesChanged: ['scripts/pulse/audit-chain.ts'],
          },
          rootDir,
        );

        const verified = verifyChain(nextChain);
        const appended = verified.blocks[1];

        expect(appended.signature).toMatch(/^[a-f0-9]{64}$/);
        expect(appended.signatureMode).toBe('hmac_sha256');
        expect(appended.signingKeyStatus).toBe('configured');
        expect(verified.verified).toBe(true);
        expect(verified.verificationFailures).toEqual([]);
      });
    });
  });

  it('rejects mutable history when block decision metadata no longer matches its digest', () => {
    withSigningKey(null, () => {
      withTempRoot((rootDir) => {
        const chain = buildAuditChain(rootDir);
        const nextChain = appendBlock(
          chain,
          {
            iteration: 1,
            unitId: 'audit-chain-mutation',
            agent: 'codex',
            scoreBefore: 63,
            scoreAfter: 64,
            filesChanged: ['scripts/pulse/audit-chain.ts'],
          },
          rootDir,
        );

        const tampered = {
          ...nextChain,
          blocks: nextChain.blocks.map((block) =>
            block.index === 1
              ? {
                  ...block,
                  metadata: {
                    ...block.metadata,
                    scoreAfter: 99,
                  },
                }
              : block,
          ),
        };

        const verified = verifyChain(tampered);

        expect(verified.verified).toBe(false);
        expect(verified.verificationFailures).toContainEqual({
          blockIndex: 1,
          reason: 'Block 1 decisionHash mismatch',
        });
      });
    });
  });

  it('rejects reordered or missing block indexes in the audit chain', () => {
    withSigningKey(null, () => {
      withTempRoot((rootDir) => {
        const chain = buildAuditChain(rootDir);
        const nextChain = appendBlock(
          chain,
          {
            iteration: 1,
            unitId: 'audit-chain-index',
            agent: 'codex',
            scoreBefore: 63,
            scoreAfter: 64,
            filesChanged: ['scripts/pulse/audit-chain.ts'],
          },
          rootDir,
        );

        const tampered = {
          ...nextChain,
          blocks: nextChain.blocks.map((block) =>
            block.index === 1
              ? {
                  ...block,
                  index: 7,
                }
              : block,
          ),
        };

        const verified = verifyChain(tampered);

        expect(verified.verified).toBe(false);
        expect(verified.verificationFailures[0]?.reason).toBe(
          'Block 1 index mismatch: expected 1, got 7',
        );
      });
    });
  });
});
