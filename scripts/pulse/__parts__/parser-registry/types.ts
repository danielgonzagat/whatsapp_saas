import type { PulseParserContract, PulseParserDefinition } from '../../types';

export type ParserDiscoveryAuthority =
  | 'declared_metadata'
  | 'declared_export'
  | 'plugin_registry'
  | 'plugin_sensor'
  | 'legacy_weak_check_export'
  | 'helper';

export interface ParserOperationalMetadata {
  confidence: number | null;
  declaredExport: string | null;
  dependencies: string[];
  discoveryAuthority: ParserDiscoveryAuthority;
  evidenceKind: string | null;
  inputs: string[];
  legacyCompatibility: boolean;
  outputs: string[];
  pluginId: string | null;
  schema: unknown | null;
  sourceKind: 'filesystem_module' | 'plugin_parser' | 'plugin_sensor';
}

export type ParserContractWithOperationalMetadata = PulseParserContract & ParserOperationalMetadata;
export type ParserDefinitionWithOperationalMetadata = PulseParserDefinition &
  ParserOperationalMetadata;

export interface PluginParserProvider {
  parsers?: () => unknown;
  sensors?: () => unknown;
}

export type PluginParserSurface = 'parsers' | 'sensors';

export type PluginParserDefinitionInput = Omit<PulseParserDefinition, 'file'> & {
  confidence?: unknown;
  dependencies?: unknown;
  evidenceKind?: unknown;
  file?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  schema?: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function isPluginParserDefinition(value: unknown): value is PluginParserDefinitionInput {
  return isRecord(value) && typeof value.name === 'string' && typeof value.fn === 'function';
}

export function toPluginParserDefinitions(value: unknown): PluginParserDefinitionInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const definitions: PluginParserDefinitionInput[] = [];
  for (const item of value) {
    if (!isPluginParserDefinition(item)) {
      return null;
    }
    definitions.push(item);
  }

  return definitions;
}

export interface DeclaredParserExport {
  authority: Exclude<ParserDiscoveryAuthority, 'helper' | 'legacy_weak_check_export'>;
  exportName: string;
  metadata: Omit<ParserOperationalMetadata, 'discoveryAuthority' | 'legacyCompatibility'>;
}
