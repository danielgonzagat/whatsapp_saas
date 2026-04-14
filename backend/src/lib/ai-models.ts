import { ConfigService } from '@nestjs/config';

type ConfigLike = Pick<ConfigService, 'get'> | undefined;

type KloelCapabilityModelRole =
  | 'search_web'
  | 'create_image'
  | 'create_site'
  | 'generate_site_openai'
  | 'generate_site_anthropic';

const DEFAULT_KLOEL_MODELS: Record<KloelCapabilityModelRole, string> = {
  search_web: 'gpt-5.4-2026-03-05',
  create_image: 'gpt-image-1.5-2025-12-16',
  create_site: 'claude-opus-4-6',
  generate_site_openai: 'gpt-4o-mini',
  generate_site_anthropic: 'claude-3-5-haiku-20241022',
};

function readConfig(key: string, config?: ConfigLike): string | undefined {
  const fromConfig = config?.get<string>(key);
  const value = typeof fromConfig === 'string' && fromConfig.trim() ? fromConfig : process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function resolveKloelCapabilityModel(
  role: KloelCapabilityModelRole,
  config?: ConfigLike,
): string {
  switch (role) {
    case 'search_web':
      return readConfig('OPENAI_SEARCH_MODEL', config) || DEFAULT_KLOEL_MODELS.search_web;
    case 'create_image':
      return readConfig('OPENAI_IMAGE_MODEL', config) || DEFAULT_KLOEL_MODELS.create_image;
    case 'create_site':
      return readConfig('ANTHROPIC_SITE_MODEL', config) || DEFAULT_KLOEL_MODELS.create_site;
    case 'generate_site_openai':
      return (
        readConfig('OPENAI_SITE_GENERATION_MODEL', config) ||
        DEFAULT_KLOEL_MODELS.generate_site_openai
      );
    case 'generate_site_anthropic':
      return (
        readConfig('ANTHROPIC_SITE_GENERATION_MODEL', config) ||
        DEFAULT_KLOEL_MODELS.generate_site_anthropic
      );
  }
}
