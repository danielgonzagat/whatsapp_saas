import { renderDashboard } from './dashboard';
import { generateArtifacts } from './artifacts';
import { buildFunctionalMap } from './functional-map';
import { generateFunctionalMapReport, renderFunctionalMapSummary } from './functional-map-report';
import { formatSelfTrustReport } from './self-trust';
import { readTextFile } from './safe-fs';
import type { FullScanResult } from './daemon';
import type { PulseCertification, PulseHealth } from './types';
import type { PulseConfig } from './types';
import type { flags as cliFlags } from './index-cli';

type PulseCliFlags = typeof cliFlags;

interface HandlePulseOutputInput {
  flags: PulseCliFlags;
  scanResult: FullScanResult;
  health: PulseHealth;
  certification: PulseCertification;
  config: PulseConfig;
  coreData: FullScanResult['coreData'];
  selfTrustReport: NonNullable<PulseCertification['selfTrustReport']>;
}

export function handlePulseOutput(input: HandlePulseOutputInput): void {
  const { flags, scanResult, health, certification, config, coreData, selfTrustReport } = input;
  if (flags.manifestValidate) {
    if (
      scanResult.manifest &&
      certification.gates.scopeClosed.status === 'pass' &&
      certification.gates.specComplete.status === 'pass'
    ) {
      console.log('  Manifest valid.');
      process.exit(0);
    }

    console.error('  Manifest invalid.');
    console.error(`  ${certification.gates.specComplete.reason}`);
    console.error(`  ${certification.gates.scopeClosed.reason}`);
    process.exit(1);
  }

  // 3. Functional Map (if --fmap)
  if (flags.fmap) {
    console.log('  Building functional map...');
    const fmapStart = Date.now();
    const fmapResult = buildFunctionalMap(config, coreData);
    const fmapElapsed = ((Date.now() - fmapStart) / 1000).toFixed(1);
    console.log(`  Functional map built in ${fmapElapsed}s`);

    // Store in health stats
    health.stats.functionalMap = {
      totalInteractions: fmapResult.summary.totalInteractions,
      byStatus: fmapResult.summary.byStatus,
      functionalScore: fmapResult.summary.functionalScore,
    };

    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            health,
            certification,
            codebaseTruth: scanResult.codebaseTruth,
            resolvedManifest: scanResult.resolvedManifest,
            scopeState: scanResult.scopeState,
            codacyEvidence: scanResult.codacyEvidence,
            structuralGraph: scanResult.structuralGraph,
            capabilityState: scanResult.capabilityState,
            flowProjection: scanResult.flowProjection,
            parityGaps: scanResult.parityGaps,
            externalSignalState: scanResult.externalSignalState,
            productVision: scanResult.productVision,
            functionalMap: fmapResult,
          },
          null,
          2,
        ),
      );
    } else {
      renderDashboard(health, certification, { verbose: flags.verbose });
      renderFunctionalMapSummary(fmapResult);
      const fmapPath = generateFunctionalMapReport(fmapResult, config.rootDir);
      console.log(`  Functional map saved to: ${fmapPath}`);
      const artifactPaths = generateArtifacts(scanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }

    process.exit(0);
  }

  // 4. Output
  if (flags.json) {
    console.log(
      JSON.stringify(
        {
          health,
          certification,
          codebaseTruth: scanResult.codebaseTruth,
          resolvedManifest: scanResult.resolvedManifest,
          scopeState: scanResult.scopeState,
          codacyEvidence: scanResult.codacyEvidence,
          structuralGraph: scanResult.structuralGraph,
          capabilityState: scanResult.capabilityState,
          flowProjection: scanResult.flowProjection,
          parityGaps: scanResult.parityGaps,
          externalSignalState: scanResult.externalSignalState,
          productVision: scanResult.productVision,
        },
        null,
        2,
      ),
    );
  } else if (flags.guidance) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    const directive = JSON.parse(readTextFile(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive, null, 2));
  } else if (flags.prove) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    const directive = JSON.parse(readTextFile(artifactPaths.cliDirectivePath, 'utf8'));
    console.log(JSON.stringify(directive.autonomyProof, null, 2));
  } else if (flags.vision) {
    generateArtifacts(scanResult, config.rootDir);
    console.log(JSON.stringify(scanResult.productVision, null, 2));
  } else if (flags.selfTrust) {
    console.log('\n📋 Self-Trust Verification Report\n');
    console.log(formatSelfTrustReport(selfTrustReport));
  } else if (flags.report) {
    const artifactPaths = generateArtifacts(scanResult, config.rootDir);
    renderDashboard(health, certification, { verbose: flags.verbose });
    console.log(`  Report saved to: ${artifactPaths.reportPath}`);
  } else {
    renderDashboard(health, certification, { verbose: flags.verbose });

    if (!flags.watch) {
      const artifactPaths = generateArtifacts(scanResult, config.rootDir);
      console.log(`  Report saved to: ${artifactPaths.reportPath}`);
    }
  }
}
