#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const mandatoryDomains = [
  'distFreshness',
  'byteFloorWriteAdmission',
  'strictGateAdmission',
  'filesystemEffectProof',
  'knownExternalShellEffects',
  'codexNoBypassStaticPolicy',
  'bypassObserverDenyIntegration',
  'atomicityAudit',
  'selfExpansionValidatorLattice',
  'capabilityMonotonicity',
  'atomicExecReadOnlyUsability',
  'codexAtomicOnlyProtocol',
  'codexEntrypointContract',
  'codexHostWiring',
  'mcpLauncherHostBoundary',
  'universalStructuralEngine',
  'arbitraryInterpreterSandbox',
  'externalRuntimeState',
];

function read(rel) {
  return fs.readFileSync(path.join(sourceDir, rel), 'utf8');
}

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function domain(cert, name) {
  return Array.isArray(cert?.domains) ? cert.domains.find((entry) => entry.domain === name) : undefined;
}

function mandatoryDomainReport(cert) {
  const statuses = Object.fromEntries(mandatoryDomains.map((name) => [name, domain(cert, name)?.status ?? 'MISSING']));
  return {
    ok: mandatoryDomains.every((name) => domain(cert, name)?.status === 'GREEN'),
    statuses,
  };
}

function main() {
  const results = [];
  const certificateSource = read('server-tools-y.ts');
  const compiledProof = read('gates/compiled-mcp-y-certificate.proof.mjs');
  const wholeHostProof = read('gates/whole-host-y-certificate.proof.mjs');

  const staleCertificate = {
    ok: true,
    yComplete: true,
    verdict: 'Y_COMPLETE',
    domains: [
      { domain: 'byteFloorWriteAdmission', status: 'GREEN' },
      { domain: 'strictGateAdmission', status: 'GREEN' },
      { domain: 'filesystemEffectProof', status: 'GREEN' },
      { domain: 'knownExternalShellEffects', status: 'GREEN' },
      { domain: 'bypassLedger', status: 'GREEN' },
      { domain: 'atomicityAudit', status: 'GREEN' },
      { domain: 'codexAtomicOnlyProtocol', status: 'GREEN' },
      { domain: 'codexHostWiring', status: 'GREEN' },
      { domain: 'universalStructuralEngine', status: 'GREEN' },
      { domain: 'arbitraryInterpreterSandbox', status: 'GREEN' },
      { domain: 'externalRuntimeState', status: 'GREEN' },
    ],
    blockers: [],
  };
  const staleReport = mandatoryDomainReport(staleCertificate);
  record(
    results,
    'stale Y_COMPLETE fixture without entrypoint/static-policy/lattice/monotonicity/read-only domains is rejected',
    staleReport.ok === false &&
      staleReport.statuses.codexEntrypointContract === 'MISSING' &&
      staleReport.statuses.distFreshness === 'MISSING' &&
      staleReport.statuses.codexNoBypassStaticPolicy === 'MISSING' &&
      staleReport.statuses.selfExpansionValidatorLattice === 'MISSING' &&
      staleReport.statuses.capabilityMonotonicity === 'MISSING' &&
      staleReport.statuses.atomicExecReadOnlyUsability === 'MISSING',
    staleReport,
  );

  record(
    results,
    'atomic_y_certificate self-enforces mandatory-domain coverage before Y_COMPLETE',
    certificateSource.includes('const MANDATORY_MCP_CONTROLLED_DOMAINS') &&
      certificateSource.includes('function mandatoryDomainCoverage(') &&
      certificateSource.includes("domain: 'certificateMandatoryDomainCoverage'") &&
      certificateSource.includes("'codexEntrypointContract'") &&
      certificateSource.includes("'distFreshness'") &&
      certificateSource.includes("'selfExpansionValidatorLattice'") &&
      certificateSource.includes("'capabilityMonotonicity'") &&
      certificateSource.includes("domain: 'capabilityMonotonicity'") &&
      certificateSource.includes("'atomicExecReadOnlyUsability'") &&
      certificateSource.includes("domain: 'atomicExecReadOnlyUsability'") &&
      certificateSource.includes("gates/self-expansion-validator-lattice.proof.mjs") &&
      certificateSource.includes("gates/security-monotonicity.proof.mjs") &&
      certificateSource.includes("gates/atomic-exec-readonly-usability.proof.mjs") &&
      /const mandatoryCoverage = mandatoryDomainCoverage\(domains, scope\);[\s\S]*const bad = blockers\(domains\);/.test(certificateSource),
    {
      hasMandatoryList: certificateSource.includes('const MANDATORY_MCP_CONTROLLED_DOMAINS'),
      hasCoverageFunction: certificateSource.includes('function mandatoryDomainCoverage('),
      emitsCoverageDomain: certificateSource.includes("domain: 'certificateMandatoryDomainCoverage'"),
      emitsValidatorLatticeDomain: certificateSource.includes("domain: 'selfExpansionValidatorLattice'"),
      emitsCapabilityMonotonicityDomain: certificateSource.includes("domain: 'capabilityMonotonicity'"),
      emitsReadOnlyUsabilityDomain: certificateSource.includes("domain: 'atomicExecReadOnlyUsability'"),
      runsValidatorLatticeProof: certificateSource.includes("gates/self-expansion-validator-lattice.proof.mjs"),
      runsCapabilityMonotonicityProof: certificateSource.includes("gates/security-monotonicity.proof.mjs"),
      runsReadOnlyUsabilityProof: certificateSource.includes("gates/atomic-exec-readonly-usability.proof.mjs"),
      coverageBeforeCompletion: /const mandatoryCoverage = mandatoryDomainCoverage\(domains, scope\);[\s\S]*const bad = blockers\(domains\);/.test(certificateSource),
    },
  );

  record(
    results,
    'distFreshness domain refuses already-running stale MCP process after self-expansion',
    certificateSource.includes('const RUNTIME_BOOT_FINGERPRINT = computeRuntimeFingerprint();') &&
      certificateSource.includes('const currentRuntimeFingerprint = computeRuntimeFingerprint();') &&
      certificateSource.includes('runtimeProcessFresh') &&
      certificateSource.includes('RUNTIME_BOOT_FINGERPRINT.sourceHash === currentRuntimeFingerprint.sourceHash') &&
      certificateSource.includes('RUNTIME_BOOT_FINGERPRINT.distHash === currentRuntimeFingerprint.distHash') &&
      certificateSource.includes('source+dist are fresh on disk, but the running MCP process fingerprint changed after boot') &&
      /const distFreshnessGreen = freshness\.fresh && runtimeProcessFresh;[\s\S]*status: distFreshnessGreen \? 'GREEN' : 'UNJUDGED'/.test(certificateSource),
    {
      capturesBootFingerprint: certificateSource.includes('const RUNTIME_BOOT_FINGERPRINT = computeRuntimeFingerprint();'),
      recomputesCurrentFingerprint: certificateSource.includes('const currentRuntimeFingerprint = computeRuntimeFingerprint();'),
      gatesDistFreshnessOnRuntimeProcess: /const distFreshnessGreen = freshness\.fresh && runtimeProcessFresh;[\s\S]*status: distFreshnessGreen \? 'GREEN' : 'UNJUDGED'/.test(certificateSource),
    },
  );

  record(
    results,
    'compiled MCP proof requires all mandatory certificate domains GREEN',
    compiledProof.includes('const mandatoryDomains = [') &&
      compiledProof.includes("'codexEntrypointContract'") &&
      compiledProof.includes("'distFreshness'") &&
      compiledProof.includes("'selfExpansionValidatorLattice'") &&
      compiledProof.includes("'capabilityMonotonicity'") &&
      compiledProof.includes("'atomicExecReadOnlyUsability'") &&
      compiledProof.includes('mandatoryDomainReport(cert)') &&
      /completeState[\s\S]*mandatory\.ok/.test(compiledProof) &&
      /honestBlockedState[\s\S]*mandatory\.ok/.test(compiledProof),
    {
      hasList: compiledProof.includes('const mandatoryDomains = ['),
      checksEntrypoint: compiledProof.includes("'codexEntrypointContract'"),
      checksDistFreshness: compiledProof.includes("'distFreshness'"),
      checksValidatorLattice: compiledProof.includes("'selfExpansionValidatorLattice'"),
      checksCapabilityMonotonicity: compiledProof.includes("'capabilityMonotonicity'"),
      checksReadOnlyUsability: compiledProof.includes("'atomicExecReadOnlyUsability'"),
    },
  );

  record(
    results,
    'whole-host proof requires all mandatory certificate domains GREEN',
    wholeHostProof.includes('const mandatoryDomains = [') &&
      wholeHostProof.includes("'codexEntrypointContract'") &&
      wholeHostProof.includes("'distFreshness'") &&
      wholeHostProof.includes("'selfExpansionValidatorLattice'") &&
      wholeHostProof.includes("'capabilityMonotonicity'") &&
      wholeHostProof.includes("'atomicExecReadOnlyUsability'") &&
      wholeHostProof.includes('mandatoryDomainReport(payload)') &&
      /completeState[\s\S]*mandatory\.ok/.test(wholeHostProof) &&
      /honestBlockedState[\s\S]*mandatory\.ok/.test(wholeHostProof),
    {
      hasList: wholeHostProof.includes('const mandatoryDomains = ['),
      checksEntrypoint: wholeHostProof.includes("'codexEntrypointContract'"),
      checksDistFreshness: wholeHostProof.includes("'distFreshness'"),
      checksValidatorLattice: wholeHostProof.includes("'selfExpansionValidatorLattice'"),
      checksCapabilityMonotonicity: wholeHostProof.includes("'capabilityMonotonicity'"),
      checksReadOnlyUsability: wholeHostProof.includes("'atomicExecReadOnlyUsability'"),
    },
  );

  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
