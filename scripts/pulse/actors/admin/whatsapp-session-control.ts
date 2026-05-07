/**
 * Admin scenario: `admin-whatsapp-session-control`.
 *
 * Verifies — by structural observation only — that the admin-side WhatsApp
 * session control surface is wired end-to-end:
 *   - Frontend admin UI surfaces (workspace inspection + chat) reference
 *     session/connection lifecycle.
 *   - Backend admin sessions controller + service exist and expose the
 *     `admin/sessions` route.
 *   - Worker WhatsApp engine, provider resolver, and unified provider exist
 *     (lifecycle handlers for QR/connection/disconnection).
 *
 * Scan-mode evidence is emitted with `truthMode: 'inferred'` — file existence
 * and content checks only. No HTTP request, DB query, or Playwright execution.
 * Marking as `observed` would be a semantic lie.
 */
import {
  checkAdminPaths,
  allAdminPresent,
  summarizeAdminMissing,
  type AdminStructuralCheck,
  type AdminStructuralCheckSpec,
} from './structural-checks';

const CHECKS: ReadonlyArray<AdminStructuralCheckSpec> = [
  // Frontend admin surfaces touching session/chat lifecycle.
  {
    label: 'frontend-admin-workspace-page',
    relPath: 'frontend-admin/src/app/(admin)/contas/[workspaceId]/page.tsx',
    mustContain: ['session'],
  },
  {
    label: 'frontend-admin-chat-route',
    relPath: 'frontend-admin/src/app/(admin)/chat',
  },

  // Backend admin sessions stack.
  {
    label: 'backend-admin-sessions-controller',
    relPath: 'backend/src/admin/sessions/admin-sessions.controller.ts',
    mustContain: ['admin/sessions'],
  },
  {
    label: 'backend-admin-sessions-service',
    relPath: 'backend/src/admin/sessions/admin-sessions.service.ts',
  },
  {
    label: 'backend-admin-sessions-module',
    relPath: 'backend/src/admin/sessions/admin-sessions.module.ts',
  },

  // Worker WhatsApp lifecycle handlers.
  {
    label: 'worker-whatsapp-engine',
    relPath: 'worker/providers/whatsapp-engine.ts',
  },
  {
    label: 'worker-whatsapp-provider-resolver',
    relPath: 'worker/providers/whatsapp-provider-resolver.ts',
  },
  {
    label: 'worker-unified-whatsapp-provider',
    relPath: 'worker/providers/unified-whatsapp-provider.ts',
  },
];

export interface WhatsappSessionControlObservation {
  passed: boolean;
  summary: string;
  checks: AdminStructuralCheck[];
  truthMode: 'inferred';
}

export function observeWhatsappSessionControl(rootDir: string): WhatsappSessionControlObservation {
  const checks = checkAdminPaths(rootDir, CHECKS);
  const passed = allAdminPresent(checks);
  const summary = passed
    ? `admin-whatsapp-session-control: ${checks.length} structural anchors present (inferred from file paths — no HTTP/DB execution).`
    : `admin-whatsapp-session-control missing structural anchors: ${summarizeAdminMissing(checks)}.`;
  return { passed, summary, checks, truthMode: 'inferred' };
}
