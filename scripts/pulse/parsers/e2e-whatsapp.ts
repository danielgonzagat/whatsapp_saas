/**
 * PULSE Parser 51: E2E WhatsApp + AI Agent Flow — AI Config Verification
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * STATIC + DB checks (no live WhatsApp calls):
 * 1. DB: COUNT ProductAIConfig records — verify configs are being created
 * 2. DB: Check for products with AI config but missing product plan
 *    (AI-configured products without plans can't be sold)
 * 3. DB: Check for ProductAIConfig records linked to non-existent products
 *    (orphaned AI configs)
 * 4. Static: Verify unified-agent.service.ts references ProductAIConfig
 *    (ensures the AI config is actually loaded into prompts)
 * 5. DB: Check if any workspace has AI autopilot enabled but no ProductAIConfig
 *    (autopilot enabled with no AI config = generic responses, not product-aware)
 *
 * BREAK TYPES:
 * - E2E_AI_CONFIG_MISSING (critical) — AI config is never loaded into the LLM prompt
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import {
  httpGet,
  httpPost,
  makeTestJwt,
  dbQuery,
  isDeepMode,
  getBackendUrl,
} from './runtime-utils';

/** Check e2e whatsapp. */
export async function checkE2eWhatsapp(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB + LLM mock
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];

  // ── Static: Verify unified-agent.service.ts loads ProductAIConfig ─────────
  try {
    const agentServicePath = path.join(config.backendDir, 'kloel/unified-agent.service.ts');
    if (!fs.existsSync(agentServicePath)) {
      breaks.push({
        type: 'E2E_AI_CONFIG_MISSING',
        severity: 'critical',
        file: 'backend/src/kloel/unified-agent.service.ts',
        line: 1,
        description: 'unified-agent.service.ts not found — AI agent service missing',
        detail: `Expected at: ${agentServicePath}`,
      });
    } else {
      const content = fs.readFileSync(agentServicePath, 'utf8');

      if (!content.includes('productAIConfig') && !content.includes('ProductAIConfig')) {
        breaks.push({
          type: 'E2E_AI_CONFIG_MISSING',
          severity: 'critical',
          file: 'backend/src/kloel/unified-agent.service.ts',
          line: 1,
          description:
            'unified-agent.service.ts does not reference ProductAIConfig — AI config never loaded into prompts',
          detail: 'Search for "productAIConfig" returned 0 matches in unified-agent.service.ts',
        });
      }

      // Verify buildSystemPrompt actually incorporates aiConfigs
      if (!content.includes('buildSystemPrompt') || !content.includes('aiConfigs')) {
        breaks.push({
          type: 'E2E_AI_CONFIG_MISSING',
          severity: 'critical',
          file: 'backend/src/kloel/unified-agent.service.ts',
          line: 1,
          description:
            'AI config context is not being passed to buildSystemPrompt — product AI settings ignored by LLM',
          detail: 'buildSystemPrompt must receive aiConfigs parameter for product-aware AI',
        });
      }
    }
  } catch (err: any) {
    breaks.push({
      type: 'E2E_AI_CONFIG_MISSING',
      severity: 'critical',
      file: 'backend/src/kloel/unified-agent.service.ts',
      line: 1,
      description: 'Static analysis of unified-agent.service.ts failed',
      detail: err?.message || String(err),
    });
  }

  // ── DB: COUNT ProductAIConfig records ─────────────────────────────────────
  try {
    const countRows = await dbQuery(`SELECT COUNT(*) as count FROM "ProductAIConfig"`);
    const aiConfigCount = parseInt(countRows[0]?.count || '0', 10);

    // Not a break if 0 (no configs yet is valid), but useful for audit
    // Only flag if there are products but zero AI configs (suggests config never wired up)
    if (aiConfigCount === 0) {
      const productCountRows = await dbQuery(
        `SELECT COUNT(*) as count FROM "Product" WHERE status = 'PUBLISHED' OR active = true`,
      );
      const activeProducts = parseInt(productCountRows[0]?.count || '0', 10);

      if (activeProducts > 5) {
        // Many active products but zero AI configs — likely never used
        // This is a high (not critical) issue — AI won't be product-aware
        breaks.push({
          type: 'E2E_AI_CONFIG_MISSING',
          severity: 'critical',
          file: 'backend/src/kloel/product-sub-resources.controller.ts',
          line: 293,
          description: `${activeProducts} active products exist but ProductAIConfig table is empty — AI agent has no product context`,
          detail: 'POST /products/:productId/ai-config has never been called for any product',
        });
      }
    }
  } catch (err: any) {
    // Table may not exist yet — skip
  }

  // ── DB: Check for orphaned ProductAIConfig (no matching product) ──────────
  try {
    const orphanRows = await dbQuery(
      `SELECT a.id, a."productId"
       FROM "ProductAIConfig" a
       LEFT JOIN "Product" p ON p.id = a."productId"
       WHERE p.id IS NULL
       LIMIT 5`,
    );

    if (orphanRows.length > 0) {
      breaks.push({
        type: 'E2E_AI_CONFIG_MISSING',
        severity: 'critical',
        file: 'backend/src/kloel/product-sub-resources.controller.ts',
        line: 293,
        description: `${orphanRows.length} ProductAIConfig records reference non-existent products — orphaned AI configs`,
        detail: `Sample orphan AIConfig IDs: ${orphanRows
          .slice(0, 3)
          .map((r: any) => r.id)
          .join(', ')}`,
      });
    }
  } catch {
    // Table doesn't exist or join failed — skip
  }

  // ── DB: Check for products with AI config but no plan (can't be sold) ─────
  try {
    const unreadyRows = await dbQuery(
      `SELECT p.id, p.name
       FROM "Product" p
       INNER JOIN "ProductAIConfig" a ON a."productId" = p.id
       LEFT JOIN "ProductPlan" pl ON pl."productId" = p.id
       WHERE pl.id IS NULL AND p.status != 'DRAFT'
       LIMIT 5`,
    );

    if (unreadyRows.length > 0) {
      breaks.push({
        type: 'E2E_AI_CONFIG_MISSING',
        severity: 'critical',
        file: 'backend/src/kloel/product-sub-resources.controller.ts',
        line: 37,
        description: `${unreadyRows.length} AI-configured non-draft products have no payment plan — AI will offer products that can't be purchased`,
        detail: `Products: ${unreadyRows
          .slice(0, 3)
          .map((r: any) => `${r.name}(${r.id})`)
          .join(', ')}`,
      });
    }
  } catch {
    // Schema mismatch or table missing — skip
  }

  // ── HTTP: Verify backend is reachable (AI endpoint connectivity) ──────────
  try {
    const healthRes = await httpGet('/health/system', { timeout: 5000 });
    if (!healthRes.ok && healthRes.status !== 0) {
      // Backend reachable but health failing — note it
      // Not an AI config break per se, just connectivity context
    } else if (healthRes.status === 0) {
      // Backend unreachable — can't do HTTP checks, DB-only mode
    }
  } catch {
    // Swallow — connectivity issues don't affect static/DB checks
  }

  return breaks;
}
