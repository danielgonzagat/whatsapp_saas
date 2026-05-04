import type { DoDGate, DoDRiskLevel } from '../../types.dod-engine';
import { dodGateKernelGrammar, deriveGateStrictness } from './gates-and-risk';
import { nodePrefixesForKind, hasNodeKind } from './helpers';
import { scanFilesForPattern, testFilesExist } from './file-scanners';
import type { CapabilityInput, LoadedArtifacts } from './artifacts';

export function assessCriterion(
  criterionName: string,
  capability: CapabilityInput,
  rootDir: string,
  artifacts: LoadedArtifacts,
  riskLevel: DoDRiskLevel,
): DoDGate {
  const gateName = criterionName;
  const def = dodGateKernelGrammar().find((g) => g.name === gateName);
  if (!def) {
    return {
      name: gateName,
      description: 'Unknown gate',
      status: 'not_tested',
      evidence: [],
      required: false,
      blocking: false,
    };
  }

  const riskTuning = deriveGateStrictness(def, riskLevel);

  try {
    switch (criterionName) {
      case 'ui_exists': {
        const uiNodes = nodePrefixesForKind(capability.nodeIds, 'ui');
        if (hasNodeKind(capability.nodeIds, 'ui')) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: uiNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'api_exists': {
        const apiNodes = [
          ...nodePrefixesForKind(capability.nodeIds, 'api'),
          ...nodePrefixesForKind(capability.nodeIds, 'route'),
        ];
        if (apiNodes.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: apiNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'service_exists': {
        const svcNodes = nodePrefixesForKind(capability.nodeIds, 'service');
        if (svcNodes.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: svcNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'persistence_exists': {
        const persistNodes = nodePrefixesForKind(capability.nodeIds, 'persistence');
        const prismaFileKernelGrammar = /\.prisma\b/i;
        const prismaFiles = capability.filePaths.filter((fp) => prismaFileKernelGrammar.test(fp));
        if (persistNodes.length > 0 || prismaFiles.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...persistNodes.slice(0, 5), ...prismaFiles.slice(0, 5)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'side_effects_exist': {
        const sideNodes = nodePrefixesForKind(capability.nodeIds, 'side-effect');
        const externalCallKernelGrammar =
          /\b(fetch\b|axios|\.post\(|\.get\(|webhook|publish|sendMessage|enqueue|emit\b)/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          externalCallKernelGrammar,
        );
        if (sideNodes.length > 0 || scanResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...sideNodes.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'unit_tests_pass': {
        const testResult = testFilesExist(capability.filePaths, rootDir);
        if (testResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: testResult.files.slice(0, 8),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'integration_tests_pass': {
        if (artifacts.scenarioCoverage) {
          const capId = capability.id;
          const scenarios = artifacts.scenarioCoverage as Record<string, unknown>;
          const scenarioEntries = Object.entries(scenarios)
            .filter(([, v]) => {
              if (typeof v === 'object' && v !== null) {
                const obj = v as Record<string, unknown>;
                const relatedCaps = obj.relatedCapabilities || obj.capabilityIds || [];
                return Array.isArray(relatedCaps) && relatedCaps.includes(capId);
              }
              return false;
            })
            .map(([k]) => k);
          if (scenarioEntries.length > 0) {
            return {
              name: gateName,
              description: def.description,
              status: 'pass',
              evidence: scenarioEntries.slice(0, 6),
              required: riskTuning.required,
              blocking: riskTuning.blocking,
            };
          }
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'runtime_observed': {
        if (artifacts.runtimeEvidence) {
          const runtime = artifacts.runtimeEvidence as Record<string, unknown>;
          const probes = runtime.probes || runtime.checks || [];
          const evidence =
            Array.isArray(probes) && probes.length > 0 ? ['Runtime probe(s) recorded'] : [];
          return {
            name: gateName,
            description: def.description,
            status: evidence.length > 0 ? 'pass' : 'not_tested',
            evidence,
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'observability_attached': {
        const logEvidenceKernelGrammar =
          /\b(logger|log|console\.(log|error|warn|info)|tracing|metric|counter|histogram|span)\b/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          logEvidenceKernelGrammar,
        );
        const obsFileNames = capability.filePaths.filter((fp) =>
          /\b(log|logging|logger|metrics|tracing|telemetry)\b/i.test(fp),
        );
        if (scanResult.found || obsFileNames.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...obsFileNames.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'security_gates_pass': {
        const authEvidenceKernelGrammar =
          /\b(auth|authorize|authorise|authenticate|guard|canActivate|hasRole|hasPermission|requireAuth|isAuthenticated|validate|class-validator|@IsString|@IsNumber|@Length|@Min|@Max|rate.?limit|throttle)\b/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          authEvidenceKernelGrammar,
        );
        const securityFiles = capability.filePaths.filter((fp) =>
          /\b(auth|guard|security|validate|permission|role)\b/i.test(fp),
        );
        if (scanResult.found || securityFiles.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...securityFiles.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'recovery_path_exists': {
        const recoveryEvidenceKernelGrammar =
          /\b(try\s*\{|catch\s*\(|\.catch\(|retry|circuit.?breaker|fallback|onError|errorHandler|resilience|dead.letter|nack|requeue|reject)\b/i;
        const scanResult = scanFilesForPattern(
          capability.filePaths,
          rootDir,
          recoveryEvidenceKernelGrammar,
        );
        if (scanResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: scanResult.matches.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      default:
        return {
          name: gateName,
          description: def.description,
          status: 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
    }
  } catch (err) {
    return {
      name: gateName,
      description: def.description,
      status: 'not_tested',
      evidence: [`Error evaluating gate: ${err instanceof Error ? err.message : String(err)}`],
      required: riskTuning.required,
      blocking: riskTuning.blocking,
    };
  }
}
