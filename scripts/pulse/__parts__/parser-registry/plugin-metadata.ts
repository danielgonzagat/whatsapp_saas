import type {
  ParserOperationalMetadata,
  PluginParserDefinitionInput,
  PluginParserSurface,
  ParserDiscoveryAuthority,
} from './types';
import { buildOperationalMetadata } from './declared-metadata';

function stringArrayFromUnknown(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function operationalMetadataFromPluginDefinition(
  pluginId: string,
  surface: PluginParserSurface,
  definition: PluginParserDefinitionInput,
): ParserOperationalMetadata {
  const authority: ParserDiscoveryAuthority =
    surface === 'sensors' ? 'plugin_sensor' : 'plugin_registry';
  const definitionRecord = definition as Record<string, unknown>;
  return buildOperationalMetadata({
    confidence: numberFromUnknown(definitionRecord.confidence) ?? 0.8,
    declaredExport: surface,
    dependencies: stringArrayFromUnknown(definitionRecord.dependencies),
    discoveryAuthority: authority,
    evidenceKind:
      stringFromUnknown(definitionRecord.evidenceKind) ??
      (surface === 'sensors' ? 'plugin-sensor' : 'plugin-parser'),
    inputs: stringArrayFromUnknown(definitionRecord.inputs),
    outputs: stringArrayFromUnknown(definitionRecord.outputs),
    pluginId,
    schema: definitionRecord.schema ?? null,
    sourceKind: surface === 'sensors' ? 'plugin_sensor' : 'plugin_parser',
  });
}

export { stringFromUnknown };
