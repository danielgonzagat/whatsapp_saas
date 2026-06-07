import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from './guard.js';
import { atomicWrite } from './server-helpers-io.js';
import { verifyGateRun } from './gate-receipt-mapper.js';

export interface AtomicSealCreateArgs {
  subject?: string;
  receipt?: Record<string, unknown>;
  gateRunId?: string;
  artifactPaths?: readonly string[];
  exportPath?: string;
}

export interface AtomicSealVerification {
  sealValid: boolean;
  hashValid: boolean;
  signatureValid: boolean | null;
  expectedHash: string | null;
  actualHash: string | null;
  signatureAlg: string | null;
  verificationLimit: string;
}

function stableCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((entry) => stableCanonicalJson(entry)).join(',') + ']';
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return '{' + entries.map(([key, entry]) => JSON.stringify(key) + ':' + stableCanonicalJson(entry)).join(',') + '}';
}

function sha256Text(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
function sha256Bytes(value: Buffer): string { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmacSha256(secret: string, value: string): string { return crypto.createHmac('sha256', secret).update(value).digest('hex'); }
function timingSafeHexEqual(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
function sealSigningKey(): string | null {
  const value = process.env.ATOMIC_SEAL_KEY?.trim();
  return value && value.length > 0 ? value : null;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function repoRelativePath(absPath: string): string {
  const rel = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('path escapes repo root: ' + absPath);
  return rel;
}
function artifactHashRecords(artifactPaths: readonly string[] | undefined): { path: string; sha256: string; bytes: number }[] {
  return (artifactPaths ?? []).map((artifactPath) => {
    const absPath = path.resolve(REPO_ROOT, artifactPath);
    const rel = repoRelativePath(absPath);
    if (!fs.existsSync(absPath)) throw new Error('artifact does not exist: ' + rel);
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size <= 0) throw new Error('artifact is not a non-empty file: ' + rel);
    return { path: rel, sha256: sha256Bytes(fs.readFileSync(absPath)), bytes: stat.size };
  });
}
function resolveSealExportPath(exportPath: string | undefined): { absPath: string; rel: string } | null {
  if (!exportPath) return null;
  const absPath = path.resolve(REPO_ROOT, exportPath);
  const rel = repoRelativePath(absPath);
  if (!rel.startsWith('.atomic/seals/')) throw new Error('atomic_seal exportPath must stay under .atomic/seals/');
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  return { absPath, rel };
}

export function verifyAtomicSealEnvelope(seal: unknown): AtomicSealVerification {
  if (!isRecord(seal) || !isRecord(seal.payload) || typeof seal.sealHash !== 'string') {
    return { sealValid: false, hashValid: false, signatureValid: false, expectedHash: null, actualHash: null, signatureAlg: null, verificationLimit: 'seal envelope is malformed' };
  }
  const actualHash = sha256Text(stableCanonicalJson(seal.payload));
  const hashValid = seal.sealHash === actualHash;
  const signatureAlg = typeof seal.signatureAlg === 'string' ? seal.signatureAlg : null;
  let signatureValid: boolean | null = null;
  if (signatureAlg === 'hmac-sha256') {
    const key = sealSigningKey();
    signatureValid = key === null ? null : timingSafeHexEqual(seal.signature, hmacSha256(key, seal.sealHash));
  } else if (signatureAlg !== 'none') {
    signatureValid = false;
  }
  const sealValid = hashValid && (signatureAlg === 'none' || signatureValid === true);
  return {
    sealValid,
    hashValid,
    signatureValid,
    expectedHash: seal.sealHash,
    actualHash,
    signatureAlg,
    verificationLimit: signatureAlg === 'hmac-sha256'
      ? signatureValid === null
        ? 'ATOMIC_SEAL_KEY is not present; hash can be checked but issuer signature cannot be verified.'
        : 'HMAC signature checked with ATOMIC_SEAL_KEY.'
      : 'Unsigned content-addressed seal: tamper-evident hash is verified, issuer identity is not cryptographically proven.',
  };
}

export function createAtomicSeal(args: AtomicSealCreateArgs): { seal: Record<string, unknown>; sealHash: string; exported: { file: string; sha256: string; bytes: number } | null; summaryForHuman: string } {
  if (!args.receipt) throw new Error('atomic_seal create requires a receipt object.');
  const gateRun = args.gateRunId ? verifyGateRun(args.gateRunId) : null;
  if (args.gateRunId && gateRun === null) throw new Error('atomic_seal refused: gateRunId was not minted by a live green atomic_prove run in this process.');
  const artifactHashes = artifactHashRecords(args.artifactPaths);
  const signingKey = sealSigningKey();
  const payload = {
    schema: 'atomic.seal.payload.v1',
    subject: args.subject ?? 'atomic proof-carrying receipt',
    repoRoot: REPO_ROOT,
    mintedAt: new Date().toISOString(),
    receipt: args.receipt,
    gateRunId: args.gateRunId ?? null,
    gateRun: gateRun ? { gateRunId: gateRun.gateRunId, verb: gateRun.verb, green: gateRun.green, ran: gateRun.ran, unjudged: gateRun.unjudged, claim: gateRun.claim, mintedAt: gateRun.mintedAt } : null,
    gateRunVerification: gateRun ? 'verified-live-at-seal-time' : 'not-provided',
    artifactHashes,
    custody: {
      canonical: 'stable-json-sorted-keys',
      hashAlg: 'sha256',
      signatureAlg: signingKey ? 'hmac-sha256' : 'none',
      issuerIdentity: signingKey ? 'verified by ATOMIC_SEAL_KEY HMAC shared secret' : 'not cryptographically signed; hash proves tamper evidence only',
    },
  };
  const sealHash = sha256Text(stableCanonicalJson(payload));
  const seal = { schema: 'atomic.seal.envelope.v1', payload, sealHash, signatureAlg: signingKey ? 'hmac-sha256' : 'none', signature: signingKey ? hmacSha256(signingKey, sealHash) : null };
  const exportTarget = resolveSealExportPath(args.exportPath);
  let exported: { file: string; sha256: string; bytes: number } | null = null;
  if (exportTarget !== null) {
    const serialized = JSON.stringify(seal, null, 2) + String.fromCharCode(10);
    atomicWrite(exportTarget.absPath, serialized);
    exported = { file: exportTarget.rel, sha256: sha256Text(serialized), bytes: Buffer.byteLength(serialized) };
  }
  const summaryForHuman = 'Atomic seal created: ' + sealHash.slice(0, 16) + '... ' + (signingKey ? 'HMAC-signed.' : 'unsigned/content-addressed only.') + (exported ? ' Exported to ' + exported.file + '.' : '');
  return { seal, sealHash, exported, summaryForHuman };
}
