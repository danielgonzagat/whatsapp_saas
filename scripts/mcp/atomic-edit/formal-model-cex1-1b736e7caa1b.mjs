"use strict";
const CAP = 64;
// order-independent 32-bit fingerprint of a string (FNV-1a) — folded over the
// whole visited SET so the OK sentinel encodes the reachable-state SET, not just
// its size. Two runs that reach the SAME size but DIFFERENT states disagree.
function fnv(str){ let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0; } return h >>> 0; }
function keyOf(s){
  const seen = new WeakSet();
  const norm = (v) => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) throw new Error("cyclic state value");
    seen.add(v);
    if (Array.isArray(v)) return v.map(norm);
    const o = {}; for (const k of Object.keys(v).sort()) o[k] = norm(v[k]); return o;
  };
  return JSON.stringify(norm(s));
}
try {
  const INIT = ([0]);
  const NEXT = ((s)=>s<5?[s+1]:[]);
  const INV = ((s)=>s<=4);
  const inits = (typeof INIT === "function") ? INIT() : INIT;
  if (!Array.isArray(inits)) throw new Error("init must evaluate to an array of states");
  if (typeof NEXT !== "function") throw new Error("next must evaluate to a function");
  if (typeof INV !== "function") throw new Error("invariant must evaluate to a function");
  const visited = new Set();
  const queue = [];
  let setFp = 0;
  const noteKey = (k) => { setFp = (setFp ^ fnv(k)) >>> 0; };
  for (const s of inits) { const k = keyOf(s); if (!visited.has(k)) { visited.add(k); noteKey(k); queue.push(s); } }
  let head = 0;
  while (head < queue.length) {
    if (visited.size > CAP) { process.stdout.write("CAP:" + visited.size + "\n"); process.exit(0); }
    const s = queue[head++];
    const ok = INV(s);
    if (!ok) { process.stdout.write("CEX:" + JSON.stringify(s) + "\n"); process.exit(0); }
    const succ = NEXT(s);
    if (!Array.isArray(succ)) throw new Error("next(s) must return an array of successor states");
    for (const ns of succ) {
      const k = keyOf(ns);
      if (!visited.has(k)) {
        if (visited.size > CAP) { process.stdout.write("CAP:" + visited.size + "\n"); process.exit(0); }
        visited.add(k); noteKey(k); queue.push(ns);
      }
    }
  }
  process.stdout.write("OK:" + visited.size + ":" + setFp + "\n");
} catch (e) {
  process.stdout.write("ERR:" + (e && e.message ? e.message : String(e)) + "\n");
}