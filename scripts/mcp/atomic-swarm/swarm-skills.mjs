/**
 * swarm_skill_* — hash-verified skill registry.
 *
 * Parity target: the TUI Skill loader — except registration computes a sha256
 * per file plus a merkle root over the whole skill tree, and every load
 * RE-VERIFIES the bytes on disk against the manifest before serving content.
 * Drift (any byte change, missing file, file appearing inside the registered
 * tree) is a refusal with the exact per-file delta, not a warning: a skill
 * that does not hash-match its registration is treated as poisoned. The TUI
 * loads ~/.claude/skills with no verification at all.
 *
 * Manifests live under <repo>/.atomic/skills/<name>.manifest.json and every
 * register/load lands in .atomic/swarm-skills-ledger.jsonl.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, appendLedger, refusal, sha256Hex } from './swarm-core.mjs';

const MAX_SKILL_FILE_BYTES = 4 * 1024 * 1024;
const MAX_SKILL_FILES = 512;

function manifestDir() {
  return path.join(REPO_ROOT, '.atomic', 'skills');
}

function manifestPath(name) {
  return path.join(manifestDir(), `${name}.manifest.json`);
}

export function safeSkillName(name) {
  const value = String(name ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw refusal(`swarm_skill refused: invalid skill name: ${value}`);
  }
  return value;
}

function walkFiles(root) {
  const out = [];
  const walk = (dir) => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) out.push(abs);
      if (out.length > MAX_SKILL_FILES) {
        throw refusal(`swarm_skill refused: skill tree exceeds ${MAX_SKILL_FILES} files`);
      }
    }
  };
  walk(root);
  return out;
}

export function merkleRoot(hashes) {
  if (hashes.length === 0) return sha256Hex('');
  let level = [...hashes].sort();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256Hex(level[i] + (level[i + 1] ?? level[i])));
    }
    level = next;
  }
  return level[0];
}

function hashTree(root) {
  const files = [];
  for (const abs of walkFiles(root)) {
    const stat = fs.statSync(abs);
    if (stat.size > MAX_SKILL_FILE_BYTES) {
      throw refusal(`swarm_skill refused: ${path.relative(root, abs)} exceeds ${MAX_SKILL_FILE_BYTES} bytes`);
    }
    const bytes = fs.readFileSync(abs);
    files.push({
      path: path.relative(root, abs).split(path.sep).join('/'),
      sha256: sha256Hex(bytes),
      bytes: bytes.byteLength,
    });
  }
  return { files, merkleRoot: merkleRoot(files.map((file) => file.sha256)) };
}

export function skillRegister({ name, dir } = {}) {
  const skillName = safeSkillName(name);
  const root = path.resolve(String(dir ?? ''));
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw refusal(`swarm_skill_register refused: dir is not a directory: ${root}`);
  }
  const { files, merkleRoot: rootHash } = hashTree(root);
  if (files.length === 0) throw refusal('swarm_skill_register refused: skill tree is empty');
  const manifest = {
    name: skillName,
    root,
    files,
    merkleRoot: rootHash,
    registeredAt: new Date().toISOString(),
  };
  fs.mkdirSync(manifestDir(), { recursive: true });
  const serialized = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(manifestPath(skillName), serialized);
  const receipt = {
    tool: 'swarm_skill_register',
    name: skillName,
    root,
    fileCount: files.length,
    merkleRoot: rootHash,
    manifestSha256: sha256Hex(serialized),
  };
  appendLedger('swarm-skills-ledger.jsonl', receipt);
  return { ok: true, receipt, manifest };
}

function readManifest(name) {
  const skillName = safeSkillName(name);
  const file = manifestPath(skillName);
  if (!fs.existsSync(file)) {
    throw refusal(`swarm_skill refused: no manifest registered for ${skillName}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function skillVerify(name) {
  const manifest = readManifest(name);
  const drift = { changed: [], missing: [], added: [] };
  let current;
  try {
    current = hashTree(manifest.root);
  } catch (error) {
    return { ok: false, manifest, drift, error: String(error?.message ?? error) };
  }
  const registered = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  const onDisk = new Map(current.files.map((file) => [file.path, file.sha256]));
  for (const [rel, sha] of registered) {
    if (!onDisk.has(rel)) drift.missing.push(rel);
    else if (onDisk.get(rel) !== sha) drift.changed.push(rel);
  }
  for (const rel of onDisk.keys()) {
    if (!registered.has(rel)) drift.added.push(rel);
  }
  const ok = drift.changed.length === 0 && drift.missing.length === 0 && drift.added.length === 0;
  return { ok, manifest, drift, merkleRootOnDisk: current.merkleRoot };
}

export function skillLoad({ name, file } = {}) {
  const verification = skillVerify(name);
  if (!verification.ok) {
    throw refusal(
      `swarm_skill_load refused: skill ${String(name)} drifted from its registered hashes (treated as poisoned)`,
      { drift: verification.drift, error: verification.error },
    );
  }
  const manifest = verification.manifest;
  const rel = String(file ?? 'SKILL.md');
  const entry = manifest.files.find((candidate) => candidate.path === rel);
  if (!entry) {
    throw refusal(`swarm_skill_load refused: ${rel} is not part of skill ${manifest.name}`);
  }
  const content = fs.readFileSync(path.join(manifest.root, rel), 'utf8');
  const receipt = {
    tool: 'swarm_skill_load',
    name: manifest.name,
    file: rel,
    sha256: entry.sha256,
    merkleRoot: manifest.merkleRoot,
    verifiedFiles: manifest.files.length,
  };
  appendLedger('swarm-skills-ledger.jsonl', receipt);
  return { ok: true, receipt, content };
}

export function skillList() {
  const dir = manifestDir();
  if (!fs.existsSync(dir)) return { ok: true, skills: [] };
  const skills = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    if (!entry.endsWith('.manifest.json')) continue;
    const name = entry.slice(0, -'.manifest.json'.length);
    try {
      const verification = skillVerify(name);
      skills.push({
        name,
        ok: verification.ok,
        fileCount: verification.manifest.files.length,
        merkleRoot: verification.manifest.merkleRoot,
        drift: verification.ok ? undefined : verification.drift,
      });
    } catch (error) {
      skills.push({ name, ok: false, error: String(error?.message ?? error) });
    }
  }
  return { ok: true, skills };
}
