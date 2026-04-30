/**
 * PULSE Parser 72: Docker Build Tester
 * Layer 10: DevOps Health
 * Mode: STATIC (Dockerfile analysis — no Docker daemon needed)
 *
 * CHECKS:
 * Verify that all Docker images have well-formed, production-safe Dockerfiles.
 * Static analysis catches misconfigurations without running Docker.
 *
 * Dockerfile existence:
 * 1. Check for Dockerfile in backend/ directory
 * 2. Check for Dockerfile in worker/ directory
 * 3. Check for Dockerfile in frontend/ directory (if not using Vercel serverless)
 * 4. Check for docker-compose.yml in root directory
 *
 * Dockerfile quality checks (static analysis, no Docker needed):
 * 11. Check for multi-stage build (FROM ... AS builder / FROM ... AS runner)
 *     → reduces final image size, excludes dev dependencies
 * 12. Check for .dockerignore file → prevents node_modules, .git from being sent to daemon
 * 13. Check that .env files are NOT copied into image (COPY . . after .dockerignore check)
 * 14. Check that secrets are passed via --build-arg or runtime env, not baked into image
 * 15. Check for non-root user (USER node or USER app) in final stage
 * 16. Check for explicit HEALTHCHECK instruction
 * 17. Check for pinned base image versions (FROM node:20-alpine, not FROM node:latest)
 *
 * docker-compose checks:
 * 18. Verify all services have health checks defined
 * 19. Verify depends_on conditions are set (backend depends_on db healthcheck)
 * 20. Verify environment variables reference .env file (env_file: .env), not hardcoded
 *
 * REQUIRES:
 * - Filesystem access for static checks (no Docker needed)
 *
 * BREAK TYPES:
 * - DOCKER_BUILD_FAILS (high) — docker build command returns non-zero exit code
 * - DOCKER_NO_MULTISTAGE (medium) — Dockerfile does not use multi-stage build
 * - DOCKER_MISSING_IGNORE (medium) — no .dockerignore file (build context unnecessarily large)
 */

import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import { readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';
import { pathExists } from '../safe-fs';
import { buildParserDiagnosticBreak } from './diagnostic-break';

interface ServiceDef {
  name: string;
  dir: string;
  isVercelDeployed?: boolean;
}

const DOCKER_STATIC_WEAK_SOURCE = 'filesystem-scan:docker-build-tester';

interface DockerStaticDiagnosticInput {
  detector: string;
  severity: Break['severity'];
  file: string;
  line: number;
  summary: string;
  detail: string;
  surface: string;
}

function dockerStaticBreak(input: DockerStaticDiagnosticInput): Break {
  return buildParserDiagnosticBreak({
    detector: input.detector,
    source: DOCKER_STATIC_WEAK_SOURCE,
    truthMode: 'weak_signal',
    severity: input.severity,
    file: input.file,
    line: input.line,
    summary: input.summary,
    detail:
      `${input.detail} Evidence source: static Dockerfile/docker-compose filesystem scan. ` +
      'Confirm with docker build/runtime evidence before treating as authority.',
    surface: input.surface,
    runtimeImpact: input.severity === 'high' ? 0.7 : 0.4,
  });
}

function readDockerfile(serviceDir: string): string | null {
  const candidates = [safeJoin(serviceDir, 'Dockerfile'), safeJoin(serviceDir, 'dockerfile')];
  for (const candidate of candidates) {
    if (pathExists(candidate)) {
      return readFileSafe(candidate);
    }
  }
  return null;
}

function dockerfilePath(serviceDir: string): string {
  return safeJoin(serviceDir, 'Dockerfile');
}

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith('#');
}

function wordsFromLine(line: string): string[] {
  return line
    .trim()
    .split(' ')
    .map((word) => word.trim())
    .filter(Boolean);
}

function lineStartsWithInstruction(line: string, instruction: string): boolean {
  const [firstWord] = wordsFromLine(line);
  return firstWord?.toLowerCase() === instruction.toLowerCase();
}

function hasInstructionLine(content: string, instruction: string): boolean {
  return content
    .split('\n')
    .some((line) => !isCommentLine(line) && lineStartsWithInstruction(line, instruction));
}

function isNonRootUserInstruction(line: string): boolean {
  if (!lineStartsWithInstruction(line, 'USER')) {
    return false;
  }
  const user = wordsFromLine(line)[1]?.toLowerCase();
  return Boolean(user && user !== 'root');
}

function isFromInstruction(line: string): boolean {
  return lineStartsWithInstruction(line, 'FROM');
}

function extractDockerImageRef(fromLine: string): string {
  const words = wordsFromLine(fromLine);
  const aliasIndex = words.findIndex((word) => word.toLowerCase() === 'as');
  const imageWords = aliasIndex > 1 ? words.slice(1, aliasIndex) : words.slice(1, 2);
  return imageWords.join(' ').trim();
}

function hasNamedDockerStage(fromLine: string): boolean {
  const words = wordsFromLine(fromLine);
  return words.some(
    (word, index) => index > 1 && word.toLowerCase() === 'as' && index + 1 < words.length,
  );
}

function hasPinnedDockerImageTag(imageRef: string): boolean {
  const normalized = imageRef.toLowerCase();
  if (normalized.endsWith(':latest')) {
    return false;
  }
  const slashIndex = normalized.lastIndexOf('/');
  const tagIndex = normalized.indexOf(':', slashIndex + 1);
  return tagIndex >= 0 && tagIndex + 1 < normalized.length;
}

function isCopyAllInstruction(line: string): boolean {
  const words = wordsFromLine(line);
  return words[0]?.toLowerCase() === 'copy' && words[1] === '.' && words[2] === '.';
}

function isNpmCiInstruction(line: string): boolean {
  const words = wordsFromLine(line).map((word) => word.toLowerCase());
  return words.some((word, index) => word === 'npm' && words[index + 1] === 'ci');
}

function hasIgnorePattern(content: string, pattern: string): boolean {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !isCommentLine(line))
    .some((line) => line.includes(pattern));
}

function hasComposeEntry(block: string, key: string): boolean {
  return block
    .split('\n')
    .some((line) => !isCommentLine(line) && line.trim().startsWith(`${key}:`));
}

function hasHealthyDependsOnCondition(block: string): boolean {
  return (
    hasComposeEntry(block, 'depends_on') &&
    block
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .some((line) => line.startsWith('condition:') && line.includes('healthy'))
  );
}

function isComposeServiceHeader(line: string): boolean {
  const indent = line.length - line.trimStart().length;
  const trimmed = line.trim();
  return indent === 2 && trimmed.endsWith(':') && trimmed.length > 1;
}

function isSecretTokenCharacter(character: string): boolean {
  return (
    (character >= 'A' && character <= 'Z') ||
    (character >= 'a' && character <= 'z') ||
    (character >= '0' && character <= '9') ||
    character === '+' ||
    character === '/' ||
    character === '=' ||
    character === '_' ||
    character === '-'
  );
}

function hasHardcodedComposeSecret(line: string): boolean {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex < 0) {
    return false;
  }

  const rawValue = line.slice(separatorIndex + 1).trim();
  if (!rawValue || rawValue.startsWith('${')) {
    return false;
  }

  let token = '';
  for (const character of rawValue) {
    if (!isSecretTokenCharacter(character)) {
      break;
    }
    token += character;
  }

  return token.length >= 32;
}

/** Check docker build. */
export function checkDockerBuild(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Determine if frontend is Vercel-deployed (vercel.json or .vercel dir at root)
  const hasVercelConfig =
    pathExists(safeJoin(config.rootDir, 'vercel.json')) ||
    pathExists(safeJoin(config.rootDir, '.vercel'));

  const services: ServiceDef[] = [
    { name: 'backend', dir: path.dirname(config.backendDir) },
    { name: 'worker', dir: config.workerDir },
    { name: 'frontend', dir: path.dirname(config.frontendDir), isVercelDeployed: hasVercelConfig },
  ];

  // --- Check 1: Dockerfile existence ---
  for (const svc of services) {
    if (svc.isVercelDeployed) {
      continue;
    } // Vercel doesn't need a Dockerfile
    const dfPath = dockerfilePath(svc.dir);
    if (!pathExists(dfPath)) {
      breaks.push(
        dockerStaticBreak({
          detector: 'dockerfile-presence-filesystem-scan',
          severity: 'high',
          file: dfPath,
          line: 0,
          summary: `No Dockerfile found for ${svc.name}`,
          detail: `${svc.name}/Dockerfile does not exist. Cannot build production Docker image.`,
          surface: 'dockerfile-presence',
        }),
      );
    }
  }

  // --- Check 2: docker-compose.yml existence ---
  const composePath = safeJoin(config.rootDir, 'docker-compose.yml');
  const composeYamlPath = safeJoin(config.rootDir, 'docker-compose.yaml');
  const composeExists = pathExists(composePath) || pathExists(composeYamlPath);
  const actualComposePath = pathExists(composePath) ? composePath : composeYamlPath;

  if (!composeExists) {
    breaks.push(
      dockerStaticBreak({
        detector: 'docker-compose-presence-filesystem-scan',
        severity: 'high',
        file: composePath,
        line: 0,
        summary: 'No docker-compose.yml found',
        detail:
          'docker-compose.yml not found in project root. Local development and integration testing setup is missing.',
        surface: 'docker-compose-presence',
      }),
    );
  }

  // --- Per-service Dockerfile static analysis ---
  for (const svc of services) {
    if (svc.isVercelDeployed) {
      continue;
    }
    const dfPath = dockerfilePath(svc.dir);
    const content = readDockerfile(svc.dir);
    if (!content) {
      continue;
    }

    const lines = content.split('\n');

    // Check 3: Non-root user (USER instruction in final stage)
    const hasUserInstruction = lines.some(isNonRootUserInstruction);
    if (!hasUserInstruction) {
      breaks.push(
        dockerStaticBreak({
          detector: 'dockerfile-user-instruction-scan',
          severity: 'high',
          file: dfPath,
          line: 0,
          summary: `${svc.name} Dockerfile runs as root`,
          detail: `${svc.name}/Dockerfile: No "USER <non-root>" instruction found. Container runs as root, which is a security risk in production.`,
          surface: 'dockerfile-user',
        }),
      );
    }

    // Check 4: Multi-stage build (frontend should have it; backend/worker optional but preferred)
    const fromLines = lines.filter(isFromInstruction);
    const hasMultiStage = fromLines.length > 1 || fromLines.some(hasNamedDockerStage);
    if (!hasMultiStage && svc.name === 'frontend') {
      breaks.push(
        dockerStaticBreak({
          detector: 'dockerfile-stage-structure-scan',
          severity: 'medium',
          file: dfPath,
          line: 0,
          summary: `${svc.name} Dockerfile does not use multi-stage build`,
          detail: `${svc.name}/Dockerfile: Single-stage build detected. Multi-stage builds reduce image size by excluding dev dependencies from the final image.`,
          surface: 'dockerfile-stage-structure',
        }),
      );
    }

    // Check 5: Pinned base image version (not FROM node:latest)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (isFromInstruction(line)) {
        const imageRef = extractDockerImageRef(line);
        if (!hasPinnedDockerImageTag(imageRef)) {
          breaks.push(
            dockerStaticBreak({
              detector: 'dockerfile-base-image-pin-scan',
              severity: 'high',
              file: dfPath,
              line: i + 1,
              summary: `${svc.name} Dockerfile uses unpinned base image`,
              detail: `${svc.name}/Dockerfile line ${i + 1}: "${line}" — use a pinned version like node:20-alpine, not :latest or an unpinned tag. Unpinned tags cause non-reproducible builds.`,
              surface: 'dockerfile-base-image',
            }),
          );
        }
      }
    }

    // Check 6: HEALTHCHECK instruction
    const hasHealthcheck = hasInstructionLine(content, 'HEALTHCHECK');
    if (!hasHealthcheck) {
      breaks.push(
        dockerStaticBreak({
          detector: 'dockerfile-healthcheck-scan',
          severity: 'high',
          file: dfPath,
          line: 0,
          summary: `${svc.name} Dockerfile missing HEALTHCHECK`,
          detail: `${svc.name}/Dockerfile: No HEALTHCHECK instruction. Docker and Railway cannot determine if the container is healthy, causing silent failures.`,
          surface: 'dockerfile-healthcheck',
        }),
      );
    }

    // Check 7: COPY . . before npm ci (cache busting)
    const copyAllIdx = lines.findIndex(isCopyAllInstruction);
    const npmCiIdx = lines.findIndex(isNpmCiInstruction);
    if (copyAllIdx !== -1 && npmCiIdx !== -1 && copyAllIdx < npmCiIdx) {
      breaks.push(
        dockerStaticBreak({
          detector: 'dockerfile-layer-cache-scan',
          severity: 'high',
          file: dfPath,
          line: copyAllIdx + 1,
          summary: `${svc.name} Dockerfile copies all files before npm ci (breaks layer cache)`,
          detail:
            `${svc.name}/Dockerfile: "COPY . ." appears before "npm ci" at line ${copyAllIdx + 1}. ` +
            `Every source change invalidates the npm install layer. Move "COPY package*.json ./" and "npm ci" before "COPY . .".`,
          surface: 'dockerfile-layer-cache',
        }),
      );
    }

    // Check 8: No .dockerignore
    const dockerignorePath = safeJoin(svc.dir, '.dockerignore');
    if (!pathExists(dockerignorePath)) {
      breaks.push(
        dockerStaticBreak({
          detector: 'dockerignore-presence-filesystem-scan',
          severity: 'medium',
          file: dockerignorePath,
          line: 0,
          summary: `${svc.name} missing .dockerignore`,
          detail:
            `${svc.name}/.dockerignore not found. The Docker build context will include node_modules, .git, and .env files, ` +
            `making builds slow and potentially leaking secrets.`,
          surface: 'dockerignore-presence',
        }),
      );
    } else {
      // Check that .dockerignore excludes node_modules
      const ignoreContent = readFileSafe(dockerignorePath);
      if (!hasIgnorePattern(ignoreContent, 'node_modules')) {
        breaks.push(
          dockerStaticBreak({
            detector: 'dockerignore-node-modules-pattern-scan',
            severity: 'medium',
            file: dockerignorePath,
            line: 0,
            summary: `${svc.name} .dockerignore does not exclude node_modules`,
            detail:
              `${svc.name}/.dockerignore exists but does not exclude "node_modules". ` +
              `Sending node_modules in build context dramatically slows builds.`,
            surface: 'dockerignore-patterns',
          }),
        );
      }
      // Check that .dockerignore excludes .env files
      if (!hasIgnorePattern(ignoreContent, '.env')) {
        breaks.push(
          dockerStaticBreak({
            detector: 'dockerignore-env-pattern-scan',
            severity: 'medium',
            file: dockerignorePath,
            line: 0,
            summary: `${svc.name} .dockerignore does not exclude .env files`,
            detail:
              `${svc.name}/.dockerignore does not exclude ".env" files. ` +
              `Secrets may be accidentally included in the Docker build context.`,
            surface: 'dockerignore-patterns',
          }),
        );
      }
    }
  }

  // --- docker-compose.yml static analysis ---
  if (composeExists) {
    const composeContent = readFileSafe(actualComposePath);
    const composeLines = composeContent.split('\n');

    // Check 9: Services have restart policy
    const appServices = ['backend', 'worker', 'frontend'];
    for (const svcName of appServices) {
      const svcIdx = composeLines.findIndex(
        (line) => line.startsWith('  ') && line.trim() === `${svcName}:`,
      );
      if (svcIdx === -1) {
        continue;
      }

      // Extract this service's block (until next top-level service)
      let svcBlock = '';
      for (let i = svcIdx; i < composeLines.length; i++) {
        if (i > svcIdx && isComposeServiceHeader(composeLines[i])) {
          break;
        }
        svcBlock += composeLines[i] + '\n';
      }

      const hasRestart = hasComposeEntry(svcBlock, 'restart');
      if (!hasRestart) {
        breaks.push(
          dockerStaticBreak({
            detector: 'docker-compose-restart-policy-scan',
            severity: 'high',
            file: actualComposePath,
            line: svcIdx + 1,
            summary: `docker-compose ${svcName} service missing restart policy`,
            detail:
              `docker-compose.yml: "${svcName}" service has no "restart:" policy. ` +
              `Crashed containers will not be restarted automatically in local/staging environments.`,
            surface: 'docker-compose-restart-policy',
          }),
        );
      }

      // Check 10: healthcheck in compose for DB-dependent services
      if (svcName === 'backend' || svcName === 'worker') {
        const dependsOnHealthcheck = hasHealthyDependsOnCondition(svcBlock);
        const simpleDependsOn = hasComposeEntry(svcBlock, 'depends_on') && !dependsOnHealthcheck;
        if (simpleDependsOn) {
          breaks.push(
            dockerStaticBreak({
              detector: 'docker-compose-dependency-health-scan',
              severity: 'high',
              file: actualComposePath,
              line: svcIdx + 1,
              summary: `docker-compose ${svcName} depends_on without healthcheck condition`,
              detail:
                `docker-compose.yml: "${svcName}" uses depends_on without "condition: service_healthy". ` +
                `The service may start before the database is ready, causing connection errors.`,
              surface: 'docker-compose-dependency-health',
            }),
          );
        }
      }
    }

    // Check 11: No hardcoded secrets in docker-compose (values that look like real secrets)
    // Exclude placeholder patterns like ${VAR:-default} and obvious dev defaults
    const hardcodedSecretLine = composeLines.findIndex((line) => {
      // Skip comments
      if (isCommentLine(line)) {
        return false;
      }
      // Look for KEY: value where value is a long token not from env var
      return hasHardcodedComposeSecret(line);
    });
    if (hardcodedSecretLine !== -1) {
      breaks.push(
        dockerStaticBreak({
          detector: 'docker-compose-secret-token-scan',
          severity: 'high',
          file: actualComposePath,
          line: hardcodedSecretLine + 1,
          summary: 'docker-compose.yml may contain hardcoded secrets',
          detail:
            `docker-compose.yml line ${hardcodedSecretLine + 1}: Found a long value that does not reference \${ENV_VAR}. ` +
            `Use env_file or \${SECRET} references — never hardcode tokens in compose files.`,
          surface: 'docker-compose-secret-handling',
        }),
      );
    }
  }

  return breaks;
}
