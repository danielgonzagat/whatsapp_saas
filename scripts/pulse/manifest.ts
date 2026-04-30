import { safeJoin, safeResolve } from './safe-path';
import * as path from 'path';
import * as ts from 'typescript';
import type { PulseConfig, PulseManifest, PulseManifestLoadResult, Break } from './types';
import type { CoreParserData } from './functional-map-types';
import { pathExists, readTextFile } from './safe-fs';

/** Pulse_manifest_filename. */
export const PULSE_MANIFEST_FILENAME = 'pulse.manifest.json';

/** Supported_stacks. */
export const SUPPORTED_STACKS = new Set<string>();

const REQUIRED_FIELDS: Array<keyof PulseManifest> = requiredManifestFieldsFromTypeContract();

function sourceFileFromPulseTypeContract(fileName: string): ts.SourceFile {
  const filePath = safeJoin(__dirname, fileName);
  if (!pathExists(filePath)) {
    throw new Error(`PULSE type contract not found: ${fileName}`);
  }
  return ts.createSourceFile(
    fileName,
    readTextFile(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

function requiredManifestFieldsFromTypeContract(): Array<keyof PulseManifest> {
  const sourceFile = sourceFileFromPulseTypeContract('types.manifest.ts');
  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== 'PulseManifest') {
      continue;
    }
    return statement.members
      .filter(ts.isPropertySignature)
      .filter((member) => !member.questionToken)
      .map((member) => member.name)
      .filter(ts.isIdentifier)
      .map((name) => name.text as keyof PulseManifest);
  }
  throw new Error('PULSE manifest contract does not declare PulseManifest');
}

function stringUnionValuesFromTypeContract(fileName: string, typeName: string): Set<string> {
  const sourceFile = sourceFileFromPulseTypeContract(fileName);
  for (const statement of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(statement) || statement.name.text !== typeName) {
      continue;
    }
    if (!ts.isUnionTypeNode(statement.type)) {
      throw new Error(`PULSE type contract ${typeName} is not a string union`);
    }
    return new Set(
      statement.type.types.map((node) => {
        if (!ts.isLiteralTypeNode(node) || !ts.isStringLiteral(node.literal)) {
          throw new Error(`PULSE type contract ${typeName} contains non-string union member`);
        }
        return node.literal.text;
      }),
    );
  }
  throw new Error(`PULSE type contract does not declare ${typeName}`);
}

function manifestBreak(
  type: 'MANIFEST_MISSING' | 'MANIFEST_INVALID' | 'UNKNOWN_SURFACE',
  description: string,
  detail: string,
  file: string,
  line: number = 1,
): Break {
  return {
    type,
    severity: 'high',
    file,
    line,
    description,
    detail,
    source: 'manifest',
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every((item) => typeof item === 'string')
  );
}

function isManifestModuleArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return (
        typeof record.name === 'string' &&
        typeof record.state === 'string' &&
        typeof record.notes === 'string'
      );
    })
  );
}

function isEnvironmentArray(value: unknown): boolean {
  const environments = stringUnionValuesFromTypeContract('types.health.ts', 'PulseEnvironment');
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && environments.has(item))
  );
}

function isTimeWindowModeArray(value: unknown): boolean {
  const modes = stringUnionValuesFromTypeContract('types.health.ts', 'PulseTimeWindowMode');
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && modes.has(item))
  );
}

function isActorKind(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScenarioKind(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isProviderMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScenarioRunner(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScenarioExecutionMode(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isGateNameArray(value: unknown): boolean {
  return isStringArray(value);
}
import "./__companions__/manifest.companion";
