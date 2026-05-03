/**
 * UI Interaction Crawler — catalog builder (discovery, not execution).
 *
 * Scans the frontend source tree to discover pages, interactive elements,
 * their event handlers, and the backend API endpoints they call. The result
 * is a {@link UICrawlerEvidence} artifact that Playwright-based execution
 * uses later to actually click through the app.
 *
 * @module ui-crawler
 */

export { classifyRoleFromRoute } from './__parts__/ui-crawler/role';
export { discoverPages } from './__parts__/ui-crawler/page-discovery';
export { parseElementsFromFile } from './__parts__/ui-crawler/element-parser';
export { mapElementToHandler } from './__parts__/ui-crawler/handler-mapper';
export { buildUICrawlerCatalog } from './__parts__/ui-crawler/catalog-builder';
