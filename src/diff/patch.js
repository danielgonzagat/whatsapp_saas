"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPatch = createPatch;
exports.applyPatch = applyPatch;
exports.applyPatchReverse = applyPatchReverse;
const myers_1 = require("./myers");
function createPatch(a, b, sourceFile = 'a', targetFile = 'b') {
    const segments = (0, myers_1.myersDiff)(a, b);
    const hunks = [];
    let ctx = 0;
    let hunk = null;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.op === 'equal') {
            for (let j = 0; j < seg.lines.length; j++) {
                if (hunk) {
                    hunk.content.push(` ${seg.lines[j]}`);
                    ctx++;
                    if (ctx >= 3) {
                        hunks.push(hunk);
                        hunk = null;
                        ctx = 0;
                    }
                }
            }
            if (!hunk)
                ctx = 0;
        }
        else {
            if (!hunk) {
                hunk = makeHunk(segments, i);
                ctx = 0;
            }
            if (seg.op === 'delete') {
                for (const line of seg.lines) {
                    hunk.content.push(`-${line}`);
                }
                hunk.countA += seg.lines.length;
            }
            else {
                for (const line of seg.lines) {
                    hunk.content.push(`+${line}`);
                }
                hunk.countB += seg.lines.length;
            }
        }
    }
    if (hunk)
        hunks.push(hunk);
    return { sourceFile, targetFile, hunks };
}
function makeHunk(segments, idx) {
    const hunk = {
        startA: 0,
        countA: 0,
        startB: 0,
        countB: 0,
        content: [],
    };
    let lineA = 0;
    let lineB = 0;
    for (let i = 0; i < idx; i++) {
        const s = segments[i];
        if (s.op === 'equal' || s.op === 'delete')
            lineA += s.lines.length;
        if (s.op === 'equal' || s.op === 'insert')
            lineB += s.lines.length;
    }
    let ctxLines = 0;
    for (let i = idx - 1; i >= 0 && ctxLines < 3; i--) {
        const s = segments[i];
        if (s.op !== 'equal')
            break;
        for (let j = s.lines.length - 1; j >= 0 && ctxLines < 3; j--) {
            hunk.content.unshift(` ${s.lines[j]}`);
            ctxLines++;
            lineA--;
            lineB--;
        }
    }
    hunk.startA = lineA;
    hunk.startB = lineB;
    return hunk;
}
function applyPatch(lines, patch) {
    return applyPatchInternal(lines, patch, false);
}
function applyPatchReverse(lines, patch) {
    return applyPatchInternal(lines, patch, true);
}
function applyPatchInternal(lines, patch, reverse) {
    const result = [...lines];
    for (const hunk of patch.hunks) {
        const start = reverse ? hunk.startB : hunk.startA;
        let pos = start;
        for (const line of hunk.content) {
            const kind = line[0];
            const text = line.slice(1);
            const action = reverse ? reverseOpChar(kind) : kind;
            switch (action) {
                case ' ': {
                    if (pos >= result.length || result[pos] !== text) {
                        return { success: false, error: `context mismatch at line ${pos}: expected "${text}", got "${result[pos]}"` };
                    }
                    pos++;
                    break;
                }
                case '-': {
                    if (pos >= result.length || result[pos] !== text) {
                        return { success: false, error: `delete mismatch at line ${pos}: expected "${text}", got "${result[pos]}"` };
                    }
                    result.splice(pos, 1);
                    break;
                }
                case '+': {
                    result.splice(pos, 0, text);
                    pos++;
                    break;
                }
            }
        }
    }
    return { success: true, result };
}
function reverseOpChar(op) {
    if (op === '+')
        return '-';
    if (op === '-')
        return '+';
    return ' ';
}
//# sourceMappingURL=patch.js.map