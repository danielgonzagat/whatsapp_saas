export type DiffOp = 'equal' | 'insert' | 'delete';
export interface DiffSegment {
    op: DiffOp;
    lines: string[];
}
export interface PatchHunk {
    startA: number;
    countA: number;
    startB: number;
    countB: number;
    content: string[];
}
export interface Patch {
    sourceFile: string;
    targetFile: string;
    hunks: PatchHunk[];
}
export interface ApplyResult {
    success: boolean;
    result?: string[];
    error?: string;
}
//# sourceMappingURL=types.d.ts.map