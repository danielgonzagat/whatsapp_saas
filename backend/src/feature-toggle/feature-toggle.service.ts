import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FeatureToggleService {
  private readonly logger = new Logger(FeatureToggleService.name);
  private readonly cache = new Map<string, boolean>();

  isEnabled(feature: string): boolean {
    if (!feature) {
      return false;
    }

    const cached = this.cache.get(feature);
    if (cached !== undefined) {
      return cached;
    }

    const envKey = `FEATURE_${feature.toUpperCase().replace(/-/g, '_')}`;
    const raw = process.env[envKey];
    const enabled = raw === 'true' || raw === '1';

    this.cache.set(feature, enabled);
    this.logger.debug(`Feature "${feature}" → ${enabled ? 'ENABLED' : 'DISABLED'} (${envKey}=${raw ?? '<unset>'})`);

    return enabled;
  }

  all(): Record<string, boolean> {
    const features: Record<string, boolean> = {};

    for (const key of Object.keys(process.env)) {
      if (key.startsWith('FEATURE_')) {
        const name = key
          .replace(/^FEATURE_/, '')
          .toLowerCase()
          .replace(/_/g, '-');
        features[name] = this.isEnabled(name);
      }
    }

    return features;
  }

  invalidate(feature?: string): void {
    if (feature) {
      this.cache.delete(feature);
    } else {
      this.cache.clear();
    }
  }
}
