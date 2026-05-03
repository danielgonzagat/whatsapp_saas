import type {
  CrawlerRole,
  UICrawlerEvidence,
  UICrawlerStatus,
  UIElementKind,
} from '../../types.ui-crawler';
import {
  deriveStringUnionMembersFromTypeContract,
  deriveZeroValue,
} from '../../dynamic-reality-kernel';
import { ensureDir, pathExists, readDir, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { FRONTEND_SRC, APP_DIR } from './constants';
import {
  discoverPages,
  mapElementToHandler,
  parseElementsFromFile,
  resolveComponentFiles,
  classifyHandlerStatus,
} from './elements';

/**
 * Build the full UI Crawler catalog for a repository.
 *
 * Discovers all pages in the Next.js App Router, parses their interactive
 * elements, maps each element's handler to an API endpoint (by tracing
 * imports and function definitions), detects dead/fake handlers, and
 * classifies every page by role.
 *
 * The result is written to `.pulse/current/PULSE_CRAWLER_EVIDENCE.json`.
 *
 * @param rootDir - Repository root directory.
 * @returns The full {@link UICrawlerEvidence} artifact.
 */
export function buildUICrawlerCatalog(rootDir: string): UICrawlerEvidence {
  const pages = discoverPages(rootDir);

  const byRole = Object.fromEntries(
    [
      ...deriveStringUnionMembersFromTypeContract(
        'scripts/pulse/types.ui-crawler.ts',
        'CrawlerRole',
      ),
    ].map((role) => [role, { pages: deriveZeroValue(), elements: deriveZeroValue() }]),
  ) as Record<CrawlerRole, { pages: number; elements: number }>;

  const deadHandlers: UICrawlerEvidence['deadHandlers'] = [];
  const formSubmissions: UICrawlerEvidence['formSubmissions'] = [];
  let totalElements = deriveZeroValue();
  let actionableElements = deriveZeroValue();
  let workingElements = deriveZeroValue();
  let brokenElements = deriveZeroValue();
  let fakeElements = deriveZeroValue();

  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const appDir = safeJoin(frontendDir, APP_DIR);

  for (const page of pages) {
    byRole[page.role].pages += 1;

    const pageFilePath =
      page.url === '/' ? safeJoin(appDir, '(public)', 'page.tsx') : findPageFile(appDir, page.url);

    if (pageFilePath && pathExists(pageFilePath)) {
      const componentFiles = resolveComponentFiles(pageFilePath, rootDir);
      const allElementFiles = [pageFilePath, ...componentFiles];
      const allElements: UICrawlerEvidence['pages'][number]['elements'] = [];

      for (const filePath of allElementFiles) {
        const fileElements = parseElementsFromFile(filePath, page.url, page.authRequired);
        allElements.push(...fileElements);
      }

      for (const element of allElements) {
        const elementFile = element.linkedFilePath || pageFilePath;
        const { handlerFile, apiEndpoint } = mapElementToHandler(element, elementFile, rootDir);

        element.linkedEndpoint = apiEndpoint || element.linkedEndpoint;
        element.linkedFilePath = handlerFile;

        const classification = classifyHandlerStatus(element, apiEndpoint);
        element.status = classification.status;
        if (classification.reason) element.errorMessage = classification.reason;
      }

      page.elements = allElements;

      byRole[page.role].elements += allElements.length;
      totalElements += allElements.length;

      for (const element of allElements) {
        if (element.actionable) actionableElements++;
        const brokenStatuses = deriveBrokenStatuses();
        if (element.status === ('works' as UICrawlerStatus)) workingElements++;
        if (brokenStatuses.has(element.status)) brokenElements++;
        const deadStatuses = deriveDeadHandlerStatuses();
        const criticalRoles = deriveCriticalRoles();
        if (element.status === ('fake' as UICrawlerStatus)) fakeElements++;

        if (deadStatuses.has(element.status) && element.handlerAttached) {
          deadHandlers.push({
            selector: element.selector,
            page: page.url,
            role: page.role,
            reason: element.errorMessage || 'Handler with no valid API endpoint',
            critical: criticalRoles.has(page.role),
          });
        }

        if (element.kind === ('form' as UIElementKind) && element.handlerAttached) {
          formSubmissions.push({
            formSelector: element.selector,
            page: page.url,
            role: page.role,
            status: element.status,
            apiCalls: element.linkedEndpoint
              ? [
                  {
                    url: element.linkedEndpoint,
                    method: deriveHttpMethodPost(),
                    statusCode: null,
                    durationMs: deriveZeroValue(),
                    failed: element.status !== ('works' as UICrawlerStatus),
                    errorMessage: element.errorMessage,
                  },
                ]
              : [],
          });
        }
      }
    }
  }

  const evidence: UICrawlerEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: pages.length,
      reachablePages: pages.filter((p) => p.reachable).length,
      totalElements,
      actionableElements,
      workingElements,
      brokenElements,
      fakeElements,
      byRole,
    },
    pages,
    deadHandlers,
    formSubmissions,
  };

  const outputDir = safeJoin(rootDir, '.pulse', 'current');
  ensureDir(outputDir, { recursive: true });
  writeTextFile(
    safeJoin(outputDir, 'PULSE_CRAWLER_EVIDENCE.json'),
    JSON.stringify(evidence, null, 2),
  );

  return evidence;
}

/** Find the page.tsx file for a given route in the App Router. */
function findPageFile(appDir: string, url: string): string | null {
  const normalizedUrl = url === '/' ? '' : url.startsWith('/') ? url.slice(1) : url;
  const segments = normalizedUrl ? normalizedUrl.split('/') : [];

  const routeGroups = discoverRouteGroups(appDir);
  const candidates: string[] = [];

  candidates.push(safeJoin(appDir, ...segments, 'page.tsx'));
  for (const group of routeGroups) {
    const candidate = safeJoin(appDir, group, ...segments, 'page.tsx');
    candidates.push(candidate);
  }

  if (segments.length === 0) {
    candidates.push(safeJoin(appDir, 'page.tsx'));
    for (const group of routeGroups) {
      candidates.push(safeJoin(appDir, group, 'page.tsx'));
    }
  }

  for (const candidate of candidates) {
    if (pathExists(candidate)) return candidate;
  }

  return null;
}

function discoverRouteGroups(appDir: string): string[] {
  if (!pathExists(appDir)) {
    return [];
  }

  try {
    return (readDir(appDir, { withFileTypes: true }) as { name: string; isDirectory(): boolean }[])
      .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}
