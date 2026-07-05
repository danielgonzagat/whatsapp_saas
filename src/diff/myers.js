"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.myersDiff = myersDiff;
function myersDiff(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    const v = {};
    v[1] = 0;
    let x = 0;
    let y = 0;
    const trace = [];
    for (let d = 0; d <= max; d++) {
        trace.push({ ...v });
        for (let k = -d; k <= d; k += 2) {
            const goDown = k === -d || (k !== d && v[k - 1] < v[k + 1]);
            x = goDown ? v[k + 1] : v[k - 1] + 1;
            y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x++;
                y++;
            }
            v[k] = x;
            if (x >= n && y >= m) {
                return backtrack(trace, a, b, d, k);
            }
        }
    }
    return [];
}
function backtrack(trace, a, b, d, k) {
    const segments = [];
    let x = a.length;
    let y = b.length;
    for (let step = d; step >= 0; step--) {
        const v = trace[step];
        const prevK = k === -step || (k !== step && v[k - 1] < v[k + 1]) ? k + 1 : k - 1;
        const prevX = v[prevK] ?? 0;
        const prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
            x--;
            y--;
            prependSegment(segments, 'equal', a[x]);
        }
        if (step > 0) {
            if (prevK === k + 1) {
                y--;
                prependSegment(segments, 'insert', b[y]);
            }
            else {
                x--;
                prependSegment(segments, 'delete', a[x]);
            }
            k = prevK;
        }
    }
    return compactSegments(segments);
}
function prependSegment(segments, op, line) {
    if (segments.length > 0 && segments[0].op === op) {
        segments[0].lines.unshift(line);
    }
    else {
        segments.unshift({ op, lines: [line] });
    }
}
function compactSegments(segments) {
    return segments.filter((s) => s.lines.length > 0);
}
//# sourceMappingURL=myers.js.map