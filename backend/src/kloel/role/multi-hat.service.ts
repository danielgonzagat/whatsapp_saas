/**
 * UTP-ROLE-006 — Multi-Hat Service.
 *
 * Supports workspaces where the owner wears multiple economic hats
 * simultaneously (e.g., a producer who is also an affiliate, or
 * an agency who also operates as a closer). Implements B0.3 with
 * multi-role awareness.
 *
 * Injectable service with in-memory profile store.
 * Consumers inject MultiHatService to read/build the multi-role
 * profile for a workspace.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { MultiHatProfile, Role, RoleDetection } from './types';
import { makeProfileUpdateId } from './types';
import { getLeversForRole } from './leverage-map.service';

@Injectable()
export class MultiHatService {
  private readonly logger = new Logger(MultiHatService.name);
  private readonly profiles = new Map<string, MultiHatProfile>();

  /**
   * UTP-ROLE-006: build or update a multi-hat profile from detections.
   *
   * Combines all detected roles into a single profile that exposes
   * the primary role, secondary roles, the combined lever set,
   * and the hat-stack depth (how many roles stacked).
   */
  public buildProfile(input: {
    readonly detections: readonly RoleDetection[];
    readonly workspaceId: string;
    readonly nowMs?: number;
  }): MultiHatProfile {
    const nowMs = input.nowMs ?? Date.now();
    const profileUpdatedAt = new Date(nowMs).toISOString();

    const detections = [...input.detections].sort(
      (a, b) => b.confidence - a.confidence,
    );

    const primaryRole: Role | undefined =
      detections.length > 0 && detections[0]!.confidence >= 0.3
        ? detections[0]!.role
        : undefined;

    const secondaryRoles: Role[] = detections
      .slice(primaryRole ? 1 : 0)
      .filter((d) => d.confidence >= 0.2)
      .map((d) => d.role);

    const combinedLevers = new Set<string>();
    if (primaryRole) {
      for (const lever of getLeversForRole(primaryRole)) {
        combinedLevers.add(lever);
      }
    }
    for (const role of secondaryRoles) {
      for (const lever of getLeversForRole(role)) {
        combinedLevers.add(lever);
      }
    }

    const profile: MultiHatProfile = {
      workspaceId: input.workspaceId,
      detections,
      primaryRole,
      secondaryRoles,
      combinedLevers: [...combinedLevers],
      hatStackDepth: new Set([primaryRole, ...secondaryRoles].filter(Boolean)).size,
      profileUpdatedAt,
    };

    this.profiles.set(input.workspaceId, profile);
    this.logger.debug(
      `multi-hat profile: workspace=${input.workspaceId} primary=${primaryRole ?? 'none'} ` +
        `secondary=${secondaryRoles.join(',') || 'none'} depth=${profile.hatStackDepth}`,
    );

    return profile;
  }

  /**
   * UTP-ROLE-006: get the current multi-hat profile for a workspace.
   * Returns undefined if no profile has been built yet.
   */
  public getProfile(workspaceId: string): MultiHatProfile | undefined {
    return this.profiles.get(workspaceId);
  }

  /**
   * UTP-ROLE-006: check whether a workspace has multiple active hats.
   */
  public hasMultipleHats(workspaceId: string): boolean {
    const profile = this.profiles.get(workspaceId);
    return profile ? profile.hatStackDepth > 1 : false;
  }

  /**
   * UTP-ROLE-006: list all roles (primary + secondary) for a workspace.
   */
  public getActiveRoles(workspaceId: string): readonly Role[] {
    const profile = this.profiles.get(workspaceId);
    if (!profile) return [];
    const roles: Role[] = [];
    if (profile.primaryRole) roles.push(profile.primaryRole);
    for (const r of profile.secondaryRoles) roles.push(r);
    return roles;
  }

  /**
   * UTP-ROLE-006: clear the profile for a workspace (e.g., on reset).
   */
  public clearProfile(workspaceId: string): void {
    this.profiles.delete(workspaceId);
  }

  /**
   * UTP-ROLE-006 helper: count active profiles.
   */
  public profileCount(): number {
    return this.profiles.size;
  }
}
