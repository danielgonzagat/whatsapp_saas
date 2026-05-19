export type RuntimeAuthorityMode =
  | 'advisory-only'
  | 'autonomous-execution'
  | 'certified-autonomous';
export type RuntimeMachineReadinessStatus = 'blocked' | 'certified' | 'ready' | 'unknown';
export type RuntimeReadinessVerdict = 'NAO' | 'SIM' | 'UNKNOWN';
