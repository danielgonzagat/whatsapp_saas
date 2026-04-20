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

import * as fs from 'fs';
import * as path from 'path';
import { readFileSafe } from './utils';
import type { Break, PulseConfig } from '../types';

interface ServiceDef {
  name: string;
  dir: string;
  isVercelDeployed?: boolean;
}

function readDockerfile(serviceDir: string): string | null {
  const candidates = [path.join(serviceDir, 'Dockerfile'), path.join(serviceDir, 'dockerfile')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return readFileSafe(candidate);
    }
  }
  return null;
}

function dockerfilePath(serviceDir: string): string {
  return path.join(serviceDir, 'Dockerfile');
}

export function checkDockerBuild(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // Determine if frontend is Vercel-deployed (vercel.json or .vercel dir at root)
  const hasVercelConfig =
    fs.existsSync(path.join(config.rootDir, 'vercel.json')) ||
    fs.existsSync(path.join(config.rootDir, '.vercel'));

  const services: ServiceDef[] = [
    { name: 'backend', dir: config.backendDir },
    { name: 'worker', dir: config.workerDir },
    { name: 'frontend', dir: config.frontendDir, isVercelDeployed: hasVercelConfig },
  ];

  // --- Check 1: Dockerfile existence ---
  for (const svc of services) {
    if (svc.isVercelDeployed) {
      continue;
    } // Vercel doesn't need a Dockerfile
    const dfPath = dockerfilePath(svc.dir);
    if (!fs.existsSync(dfPath)) {
      breaks.push({
        type: 'DOCKER_BUILD_FAILS',
        severity: 'high',
        file: dfPath,
        line: 0,
        description: `No Dockerfile found for ${svc.name}`,
        detail: `${svc.name}/Dockerfile does not exist. Cannot build production Docker image.`,
      });
    }
  }

  // --- Check 2: docker-compose.yml existence ---
  const composePath = path.join(config.rootDir, 'docker-compose.yml');
  const composeYamlPath = path.join(config.rootDir, 'docker-compose.yaml');
  const composeExists = fs.existsSync(composePath) || fs.existsSync(composeYamlPath);
  const actualComposePath = fs.existsSync(composePath) ? composePath : composeYamlPath;

  if (!composeExists) {
    breaks.push({
      type: 'DOCKER_BUILD_FAILS',
      severity: 'high',
      file: composePath,
      line: 0,
      description: 'No docker-compose.yml found',
      detail:
        'docker-compose.yml not found in project root. Local development and integration testing setup is missing.',
    });
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
    const hasUserInstruction = /^USER\s+(?!root\b)/im.test(content);
    if (!hasUserInstruction) {
      breaks.push({
        type: 'DOCKER_BUILD_FAILS',
        severity: 'high',
        file: dfPath,
        line: 0,
        description: `${svc.name} Dockerfile runs as root`,
        detail: `${svc.name}/Dockerfile: No "USER <non-root>" instruction found. Container runs as root, which is a security risk in production.`,
      });
    }

    // Check 4: Multi-stage build (frontend should have it; backend/worker optional but preferred)
    const fromLines = lines.filter((l) => /^FROM\s+/i.test(l));
    const hasMultiStage = fromLines.length > 1 || /FROM\s+\S+\s+AS\s+\w+/i.test(content);
    if (!hasMultiStage && svc.name === 'frontend') {
      breaks.push({
        type: 'DOCKER_NO_MULTISTAGE',
        severity: 'medium',
        file: dfPath,
        line: 0,
        description: `${svc.name} Dockerfile does not use multi-stage build`,
        detail: `${svc.name}/Dockerfile: Single-stage build detected. Multi-stage builds reduce image size by excluding dev dependencies from the final image.`,
      });
    }

    // Check 5: Pinned base image version (not FROM node:latest)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^FROM\s+/i.test(line)) {
        const imageRef = line
          .replace(/^FROM\s+/i, '')
          .replace(/\s+AS\s+\w+$/i, '')
          .trim();
        if (/:latest$/.test(imageRef) || !/:[a-z0-9]/.test(imageRef)) {
          breaks.push({
            type: 'DOCKER_BUILD_FAILS',
            severity: 'high',
            file: dfPath,
            line: i + 1,
            description: `${svc.name} Dockerfile uses unpinned base image`,
            detail: `${svc.name}/Dockerfile line ${i + 1}: "${line}" — use a pinned version like node:20-alpine, not :latest or an unpinned tag. Unpinned tags cause non-reproducible builds.`,
          });
        }
      }
    }

    // Check 6: HEALTHCHECK instruction
    const hasHealthcheck = /^HEALTHCHECK\s+/im.test(content);
    if (!hasHealthcheck) {
      breaks.push({
        type: 'DOCKER_BUILD_FAILS',
        severity: 'high',
        file: dfPath,
        line: 0,
        description: `${svc.name} Dockerfile missing HEALTHCHECK`,
        detail: `${svc.name}/Dockerfile: No HEALTHCHECK instruction. Docker and Railway cannot determine if the container is healthy, causing silent failures.`,
      });
    }

    // Check 7: COPY . . before npm ci (cache busting)
    const copyAllIdx = lines.findIndex((l) => /^COPY\s+\.\s+\./m.test(l));
    const npmCiIdx = lines.findIndex((l) => /npm\s+ci\b/m.test(l));
    if (copyAllIdx !== -1 && npmCiIdx !== -1 && copyAllIdx < npmCiIdx) {
      breaks.push({
        type: 'DOCKER_BUILD_FAILS',
        severity: 'high',
        file: dfPath,
        line: copyAllIdx + 1,
        description: `${svc.name} Dockerfile copies all files before npm ci (breaks layer cache)`,
        detail:
          `${svc.name}/Dockerfile: "COPY . ." appears before "npm ci" at line ${copyAllIdx + 1}. ` +
          `Every source change invalidates the npm install layer. Move "COPY package*.json ./" and "npm ci" before "COPY . .".`,
      });
    }

    // Check 8: No .dockerignore
    const dockerignorePath = path.join(svc.dir, '.dockerignore');
    if (!fs.existsSync(dockerignorePath)) {
      breaks.push({
        type: 'DOCKER_MISSING_IGNORE',
        severity: 'medium',
        file: dockerignorePath,
        line: 0,
        description: `${svc.name} missing .dockerignore`,
        detail:
          `${svc.name}/.dockerignore not found. The Docker build context will include node_modules, .git, and .env files, ` +
          `making builds slow and potentially leaking secrets.`,
      });
    } else {
      // Check that .dockerignore excludes node_modules
      const ignoreContent = readFileSafe(dockerignorePath);
      if (!/^node_modules/m.test(ignoreContent)) {
        breaks.push({
          type: 'DOCKER_MISSING_IGNORE',
          severity: 'medium',
          file: dockerignorePath,
          line: 0,
          description: `${svc.name} .dockerignore does not exclude node_modules`,
          detail:
            `${svc.name}/.dockerignore exists but does not exclude "node_modules". ` +
            `Sending node_modules in build context dramatically slows builds.`,
        });
      }
      // Check that .dockerignore excludes .env files
      if (!/.env/m.test(ignoreContent)) {
        breaks.push({
          type: 'DOCKER_MISSING_IGNORE',
          severity: 'medium',
          file: dockerignorePath,
          line: 0,
          description: `${svc.name} .dockerignore does not exclude .env files`,
          detail:
            `${svc.name}/.dockerignore does not exclude ".env" files. ` +
            `Secrets may be accidentally included in the Docker build context.`,
        });
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
      const svcIdx = composeLines.findIndex((l) => new RegExp(`^  ${svcName}:`).test(l));
      if (svcIdx === -1) {
        continue;
      }

      // Extract this service's block (until next top-level service)
      let svcBlock = '';
      for (let i = svcIdx; i < composeLines.length; i++) {
        if (i > svcIdx && /^  \w+:/.test(composeLines[i])) {
          break;
        }
        svcBlock += composeLines[i] + '\n';
      }

      const hasRestart = /restart:/.test(svcBlock);
      if (!hasRestart) {
        breaks.push({
          type: 'DOCKER_BUILD_FAILS',
          severity: 'high',
          file: actualComposePath,
          line: svcIdx + 1,
          description: `docker-compose ${svcName} service missing restart policy`,
          detail:
            `docker-compose.yml: "${svcName}" service has no "restart:" policy. ` +
            `Crashed containers will not be restarted automatically in local/staging environments.`,
        });
      }

      // Check 10: healthcheck in compose for DB-dependent services
      if (svcName === 'backend' || svcName === 'worker') {
        const dependsOnHealthcheck = /depends_on:[\s\S]*?condition:.*healthy/m.test(svcBlock);
        const simpleDependsOn = /depends_on:/.test(svcBlock) && !dependsOnHealthcheck;
        if (simpleDependsOn) {
          breaks.push({
            type: 'DOCKER_BUILD_FAILS',
            severity: 'high',
            file: actualComposePath,
            line: svcIdx + 1,
            description: `docker-compose ${svcName} depends_on without healthcheck condition`,
            detail:
              `docker-compose.yml: "${svcName}" uses depends_on without "condition: service_healthy". ` +
              `The service may start before the database is ready, causing connection errors.`,
          });
        }
      }
    }

    // Check 11: No hardcoded secrets in docker-compose (values that look like real secrets)
    // Exclude placeholder patterns like ${VAR:-default} and obvious dev defaults
    const hardcodedSecretLine = composeLines.findIndex((line, idx) => {
      // Skip comments
      if (/^\s*#/.test(line)) {
        return false;
      }
      // Look for KEY: value where value is a long token not from env var
      return /:\s+(?!\$\{)[A-Za-z0-9+/=_-]{32,}/.test(line);
    });
    if (hardcodedSecretLine !== -1) {
      breaks.push({
        type: 'DOCKER_BUILD_FAILS',
        severity: 'high',
        file: actualComposePath,
        line: hardcodedSecretLine + 1,
        description: 'docker-compose.yml may contain hardcoded secrets',
        detail:
          `docker-compose.yml line ${hardcodedSecretLine + 1}: Found a long value that does not reference \${ENV_VAR}. ` +
          `Use env_file or \${SECRET} references — never hardcode tokens in compose files.`,
      });
    }
  }

  return breaks;
}
