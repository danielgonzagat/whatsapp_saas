export interface LoadParserInventoryOptions {
  includeParser?: (name: string) => boolean;
}

export const PARSER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const EXPORTED_FUNCTION_RE =
  /export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
export const EXPORTED_CONST_FUNCTION_RE =
  /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g;
export const DEFAULT_IDENTIFIER_RE = /export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?/;
export const PARSER_EXPORT_RE = /^check[A-Z0-9_]/;
export const DECLARED_METADATA_EXPORTS = new Set([
  'parserMetadata',
  'parserDefinition',
  'pulseParser',
]);
export const DECLARED_PARSER_OBJECT_RE = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{/g;
export const STRING_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*['"]([^'"]+)['"]`);
export const NUMBER_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*(0(?:\\.\\d+)?|1(?:\\.0+)?|\\.\\d+)`);
export const FUNCTION_REFERENCE_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)`);

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

export type ParserContractWithOperationalMetadata =
  import('../types.manifest').PulseParserContract & ParserOperationalMetadata;
export type ParserDefinitionWithOperationalMetadata =
  import('../types.manifest').PulseParserDefinition & ParserOperationalMetadata;

export interface PluginParserProvider {
  parsers?: () => unknown;
  sensors?: () => unknown;
}

export type PluginParserSurface = 'parsers' | 'sensors';

export type PluginParserDefinitionInput = Omit<
  import('../types.manifest').PulseParserDefinition,
  'file'
> & {
  confidence?: unknown;
  dependencies?: unknown;
  evidenceKind?: unknown;
  file?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  schema?: unknown;
};

export interface DeclaredParserExport {
  authority: Exclude<ParserDiscoveryAuthority, 'helper' | 'legacy_weak_check_export'>;
  exportName: string;
  metadata: Omit<ParserOperationalMetadata, 'discoveryAuthority' | 'legacyCompatibility'>;
}
