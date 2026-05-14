import { Injectable } from '@nestjs/common';
import type { OptEntry } from './wisdom.types';

/**
 * WISDOM-007 — Per-Workspace + Per-Role Opt-In/Out Registry.
 *
 * In-memory map that records which workspace-role pairs have opted in
 * or out of cross-workspace wisdom. Persistence layer to be added later.
 *
 * Default: opted out. Workspaces must explicitly opt in.
 * Opt-in/out is recorded per workspace-role pair (e.g. wks_001 + produtor).
 */

@Injectable()
export class WisdomOptService {
  private readonly registry = new Map<string, OptEntry>();

  private key(workspaceId: string, role: string): string {
    return `${workspaceId}:${role}`;
  }

  /**
   * Record an opt-in for a workspace-role pair.
   */
  public optIn(workspaceId: string, role: string): OptEntry {
    const k = this.key(workspaceId, role);
    const entry: OptEntry = {
      workspaceId,
      role,
      optedIn: true,
      updatedAt: new Date().toISOString(),
    };
    this.registry.set(k, entry);
    return entry;
  }

  /**
   * Record an opt-out for a workspace-role pair.
   */
  public optOut(workspaceId: string, role: string): OptEntry {
    const k = this.key(workspaceId, role);
    const entry: OptEntry = {
      workspaceId,
      role,
      optedIn: false,
      updatedAt: new Date().toISOString(),
    };
    this.registry.set(k, entry);
    return entry;
  }

  /**
   * Check whether a workspace-role pair has opted in.
   * Returns false by default (not opted in).
   */
  public isOptedIn(workspaceId: string, role: string): boolean {
    const k = this.key(workspaceId, role);
    const entry = this.registry.get(k);
    return entry?.optedIn === true;
  }

  /**
   * Check whether a workspace has opted in for ANY role.
   */
  public isWorkspaceOptedIn(workspaceId: string): boolean {
    for (const [, entry] of this.registry) {
      if (entry.workspaceId === workspaceId && entry.optedIn) return true;
    }
    return false;
  }

  /**
   * Get all opted-in workspace-role pairs.
   */
  public optedInEntries(): OptEntry[] {
    return [...this.registry.values()].filter(e => e.optedIn);
  }

  /**
   * Get all opted-in workspace IDs (unique).
   */
  public optedInWorkspaceIds(): string[] {
    const ids = new Set<string>();
    for (const [, entry] of this.registry) {
      if (entry.optedIn) ids.add(entry.workspaceId);
    }
    return [...ids];
  }

  /**
   * Remove a workspace-role pair from the registry.
   */
  public remove(workspaceId: string, role: string): boolean {
    const k = this.key(workspaceId, role);
    return this.registry.delete(k);
  }

  /**
   * Remove all entries for a workspace.
   */
  public removeWorkspace(workspaceId: string): number {
    let removed = 0;
    for (const [k, entry] of this.registry) {
      if (entry.workspaceId === workspaceId) {
        this.registry.delete(k);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Registry size (for diagnostics).
   */
  public size(): number {
    return this.registry.size;
  }
}
