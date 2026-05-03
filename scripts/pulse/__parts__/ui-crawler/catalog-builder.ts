import type { CrawlerRole, UICrawlerEvidence } from '../../types.ui-crawler';
import { ensureDir, pathExists, writeTextFile } from '../../safe-fs';
import { safeJoin } from '../../safe-path';
import { FRONTEND_SRC, APP_DIR } from './constants';
import { discoverPages, findPageFile, resolveComponentFiles } from './page-discovery';
import { parseElementsFromFile } from './element-parser';
import { classifyHandlerStatus, mapElementToHandler } from './handler-mapper';

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

  const byRole: Record<CrawlerRole, { pages: number; elements: number }> = {
    anonymous: { pages: 0, elements: 0 },
    customer: { pages: 0, elements: 0 },
    operator: { pages: 0, elements: 0 },
    admin: { pages: 0, elements: 0 },
    producer: { pages: 0, elements: 0 },
    affiliate: { pages: 0, elements: 0 },
  };

  const deadHandlers: UICrawlerEvidence['deadHandlers'] = [];
  const formSubmissions: UICrawlerEvidence['formSubmissions'] = [];
  let totalElements = 0;
  let actionableElements = 0;
  let workingElements = 0;
  let brokenElements = 0;
  let fakeElements = 0;

  const frontendDir = safeJoin(rootDir, FRONTEND_SRC);
  const appDir = safeJoin(frontendDir, APP_DIR);

  for (const page of pages) {
    byRole[page.role].pages += 1;

    const pageFilePath =
      page.url === '/' ? safeJoin(appDir, '(public)', 'page.tsx') : findPageFile(appDir, page.url);

    if (pageFilePath && pathExists(pageFilePath)) {
      const componentFiles = resolveComponentFiles(pageFilePath, rootDir);
      const allElementFiles = [pageFilePath, ...componentFiles];
      const allElements: UIDiscoveredElement[] = [];

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
        if (element.status === 'works') workingElements++;
        if (
          element.status === 'error' ||
          element.status === 'no_handler' ||
          element.status === 'blocked' ||
          element.status === 'not_reached' ||
          element.status === 'not_executable'
        )
          brokenElements++;
        if (element.status === 'fake') fakeElements++;

        if (
          (element.status === 'no_handler' ||
            element.status === 'fake' ||
            element.status === 'error') &&
          element.handlerAttached
        ) {
          deadHandlers.push({
            selector: element.selector,
            page: page.url,
            role: page.role,
            reason: element.errorMessage || 'Handler with no valid API endpoint',
            critical: page.role === 'admin' || page.role === 'operator',
          });
        }

        if (element.kind === 'form' && element.handlerAttached) {
          formSubmissions.push({
            formSelector: element.selector,
            page: page.url,
            role: page.role,
            status: element.status,
            apiCalls: element.linkedEndpoint
              ? [
                  {
                    url: element.linkedEndpoint,
                    method: 'POST',
                    statusCode: null,
                    durationMs: 0,
                    failed: element.status !== 'works',
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
