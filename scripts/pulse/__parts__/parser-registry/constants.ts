const PARSER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXPORTED_FUNCTION_RE = /export\s+(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
const EXPORTED_CONST_FUNCTION_RE =
  /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)\s*=>/g;
const DEFAULT_IDENTIFIER_RE = /export\s+default\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*;?/;
const PARSER_EXPORT_RE = /^check[A-Z0-9_]/;
const DECLARED_METADATA_EXPORTS = new Set(['parserMetadata', 'parserDefinition', 'pulseParser']);
const DECLARED_PARSER_OBJECT_RE = /export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\{/g;
const STRING_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*['"]([^'"]+)['"]`);
const NUMBER_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*(0(?:\\.\\d+)?|1(?:\\.0+)?|\\.\\d+)`);
const FUNCTION_REFERENCE_PROPERTY_RE = (property: string): RegExp =>
  new RegExp(`${property}\\s*:\\s*([A-Za-z_$][A-Za-z0-9_$]*)`);

export {
  DEFAULT_IDENTIFIER_RE,
  DECLARED_METADATA_EXPORTS,
  DECLARED_PARSER_OBJECT_RE,
  EXPORTED_CONST_FUNCTION_RE,
  EXPORTED_FUNCTION_RE,
  FUNCTION_REFERENCE_PROPERTY_RE,
  NUMBER_PROPERTY_RE,
  PARSER_EXPORT_RE,
  PARSER_NAME_RE,
  STRING_PROPERTY_RE,
};
