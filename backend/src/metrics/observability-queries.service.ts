import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Observability-boundary query service.
 *
 * Every method in this class is an explicit, intentional cross-workspace
 * aggregate used only by token-protected observability surfaces
 * (MetricsController, DiagnosticsController prometheus endpoint, and
 * SystemHealthService). By centralizing these queries here we:
 *
 *   1. prove at the code level that the boundary is "platform-level
 *      aggregate" and not "tenant data";
 *   2. give the unsafe-queries checker a single structural file to accept
 *      without requiring a per-line allowlist;
 *   3. keep the surface under review — any new global aggregate must be
 *      added here and is easy to audit for PII/financial leakage.
 *
 * Rules for methods on this service:
 *   - return a single scalar (count/sum/avg) or a small, non-identifying
 *     breakdown (e.g. { connected, disconnected });
 *   - NEVER return individual workspace ids, user phones, payment amounts
 *     or any data that could identify a tenant or person;
 *   - MUST be invoked only from a route guarded by METRICS_TOKEN,
 *     DIAG_TOKEN, or an equivalent token/JWT guard.
 */
@Injectable()
export class ObservabilityQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count Meta (Facebook/Instagram/WhatsApp) connections currently in
   * `connected` status across all workspaces. Used by system-health for
   * global infrastructure health aggregates.
   */
  async countConnectedMetaWorkspaces(): Promise<number> {
    return this.prisma.metaConnection.count({
      where: { status: 'connected' },
    });
  }

  /**
   * Count messages created today (from local midnight) across all
   * workspaces. Used by /diag/metrics (Prometheus) to expose
   * `kloel_messages_today` — a platform-wide volume gauge.
   */
  async countAllMessagesSince(since: Date): Promise<number> {
    return this.prisma.message.count({
      where: { createdAt: { gte: since } },
    });
  }

  /**
   * Count autopilot events created in the given window across all
   * workspaces. Used by /diag/metrics (Prometheus) to expose
   * `kloel_autopilot_events_today` — a platform-wide volume gauge.
   */
  async countAllAutopilotEventsSince(since: Date): Promise<number> {
    return this.prisma.autopilotEvent.count({
      where: { createdAt: { gte: since } },
    });
  }
}
