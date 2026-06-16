import { Patch, ApplyResult } from './types';
export declare function createPatch(a: string[], b: string[], sourceFile?: string, targetFile?: string): Patch;
export declare function applyPatch(lines: string[], patch: Patch): ApplyResult;
export declare function applyPatchReverse(lines: string[], patch: Patch): ApplyResult;
//# sourceMappingURL=patch.d.ts.map