export type DesignTokenSourceKind =
  | 'css-variable'
  | 'tailwind-config'
  | 'token-file'
  | 'theme-file'
  | 'component-primitive-style';

export interface DiscoveredDesignColorEvidence {
  value: string;
  normalizedValue: string;
  sourcePath: string;
  sourceKind: DesignTokenSourceKind;
  line: number;
  tokenName?: string;
}

export interface DesignTokenDiscoveryResult {
  colors: DiscoveredDesignColorEvidence[];
  allowedColors: string[];
  scannedFiles: string[];
}

export interface DesignTokenDiscoveryOptions {
  maxDepth?: number;
}
