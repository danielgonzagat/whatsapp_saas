import * as fs from 'node:fs';
import * as path from 'node:path';

type SyntheticActorFlag = '--customer' | '--operator' | '--admin' | '--shift' | '--soak';

interface ScenarioModeMetadata {
  id: string;
  actorKind?: string;
  timeWindowModes?: string[];
}

function readScenarioModeMetadata(): ScenarioModeMetadata[] {
  const candidates = [
    path.join(process.cwd(), '.pulse', 'current', 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(process.cwd(), 'PULSE_RESOLVED_MANIFEST.json'),
    path.join(process.cwd(), 'pulse.manifest.json'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { scenarioSpecs?: unknown };
      if (!Array.isArray(parsed.scenarioSpecs)) continue;
      return parsed.scenarioSpecs
        .filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
        )
        .flatMap((entry) => {
          if (typeof entry.id !== 'string') return [];
          return [
            {
              id: entry.id,
              actorKind: typeof entry.actorKind === 'string' ? entry.actorKind : undefined,
              timeWindowModes: Array.isArray(entry.timeWindowModes)
                ? entry.timeWindowModes.filter(
                    (value): value is string => typeof value === 'string',
                  )
                : [],
            },
          ];
        });
    } catch {
      continue;
    }
  }
  return [];
}

function flagsFromScenarioMetadata(scenarioIds: string[]): SyntheticActorFlag[] {
  if (scenarioIds.length === 0) return [];
  const scenariosById = new Map(
    readScenarioModeMetadata().map((scenario) => [scenario.id, scenario]),
  );
  const flags = new Set<SyntheticActorFlag>();
  for (const scenarioId of scenarioIds) {
    const scenario = scenariosById.get(scenarioId);
    if (!scenario) continue;
    if (scenario.actorKind === 'customer') flags.add('--customer');
    if (scenario.actorKind === 'operator') flags.add('--operator');
    if (scenario.actorKind === 'admin') flags.add('--admin');
    if (scenario.timeWindowModes?.includes('shift')) flags.add('--shift');
    if (scenario.timeWindowModes?.includes('soak') || scenario.actorKind === 'system')
      flags.add('--soak');
  }
  return [...flags];
}

function flagsFromGateMetadata(
  gateNames: string[],
  validationHints: string[],
): SyntheticActorFlag[] {
  const flags = new Set<SyntheticActorFlag>();
  const hints = [...gateNames, ...validationHints].join(' ');
  if (/\bcustomerPass\b|PULSE_CUSTOMER_EVIDENCE[.]json/.test(hints)) flags.add('--customer');
  if (/\boperatorPass\b|PULSE_OPERATOR_EVIDENCE[.]json/.test(hints)) flags.add('--operator');
  if (/\badminPass\b|PULSE_ADMIN_EVIDENCE[.]json/.test(hints)) flags.add('--admin');
  if (/\bsoakPass\b|PULSE_SOAK_EVIDENCE[.]json/.test(hints)) flags.add('--soak');
  return [...flags];
}

function extractMissingStructuralRoles(summary: string): string[] {
  const match = summary.match(/Missing structural roles:\s*([^.;]+)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export {
  flagsFromScenarioMetadata,
  flagsFromGateMetadata,
  extractMissingStructuralRoles,
  readScenarioModeMetadata,
};
export type { SyntheticActorFlag, ScenarioModeMetadata };
