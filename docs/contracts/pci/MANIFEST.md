# PCI Manifest — Frozen Snapshot

> **Status**: `frozen`
> **Wave**: 0 (Onda 0 — Pacote de Contratos Imutáveis)
> **Compiled by**: Claude Opus 4.7 (1M context) as orchestrator-executor
> **Authorized by**: Daniel Penin (steward) — autonomy mandate 2026-05-13
> **Frozen at**: 2026-05-13
> **Plan reference**: [docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md](../../plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md)

## Documents

| ID | Slug | File | Purpose |
|---|---|---|---|
| PCI.1 | event-taxonomy | [01-event-taxonomy.md](./01-event-taxonomy.md) | Canonical spine event taxonomy (domains, names, universal fields) |
| PCI.2 | abi-schema | [02-abi-schema.md](./02-abi-schema.md) | Cognitive State ABI — single payload to LLM |
| PCI.3 | genesis-lineage | [03-genesis-lineage.md](./03-genesis-lineage.md) | Genesis Event + Lineage Ledger immutability rules |
| PCI.4 | pulse-gates | [04-pulse-gates.md](./04-pulse-gates.md) | Canonical PULSE gate interfaces and modes |
| PCI.5 | universal-conventions | [05-universal-conventions.md](./05-universal-conventions.md) | truthMode, provenance, valence, audience, workspaceId |
| PCI.6 | b17-surfaces | [06-b17-surfaces.md](./06-b17-surfaces.md) | Commercial surface → canonical event mapping |

## Authority

PCI is the **single source of truth** for the cognitive organism mission.
Every UTP in every Onda subsequent to Onda 0 MUST reference PCI documents
when making naming, schema, gate, or convention decisions. Divergence is
detected automatically by `scripts/pci/validate.mjs --strict` and must be
treated as a contract failure.

## Versioning

- Adding a new optional field to an existing schema: minor bump (`1.0.x` →
  `1.1.0`).
- Adding a new event domain or surface: minor bump + ADR.
- Changing semantics of an existing field/event/gate: major bump (`1.x.y` →
  `2.0.0`) + ADR + steward authorization.
- Removing anything: major bump + ADR + grace period documented.

Subagents NEVER bump PCI versions autonomously. Bumping is a steward action.

## Verification commands

```sh
# Verify file checksums match the frozen snapshot
cd docs/contracts/pci && shasum -a 256 -c CHECKSUMS.txt

# Run the PCI validator (no checksums required)
node scripts/pci/validate.mjs

# Run with checksum verification + repo divergence scan
node scripts/pci/validate.mjs --verify-checksums --strict
```

## Onda 0 closure

Onda 0 is closed when:

- [x] PCI.1 — event taxonomy compiled
- [x] PCI.2 — ABI schema compiled
- [x] PCI.3 — Genesis + Lineage Ledger compiled
- [x] PCI.4 — PULSE gate interfaces compiled
- [x] PCI.5 — universal conventions compiled
- [x] PCI.6 — B17 surfaces table compiled
- [x] PCI validator implemented and passing
- [x] CHECKSUMS.txt published
- [x] MANIFEST.md (this file) published

Status: **CLOSED**. Onda 1 may dispatch upon completion of Wave-1 prerequisites
(cognitive-organism-subagent-delegation-rules.md, Onda-1 fleet manifest).

## Restrictions enforced from this point

Per plan Parts D, E, and 7:

1. No subagent may invent an event name outside PCI.1.
2. No subagent may add a field to ABI without bumping `abiVersion`.
3. No subagent may write to a file in the protected list (PCI.4 §3.9).
4. No subagent may touch `frontend/**`, `*.tsx`, `*.vue`, or existing HTTP
   contracts.
5. No subagent may bypass Codacy MAX-RIGOR LOCK (PCI.4 §3.10).
6. No subagent may operate in opaque background mode (D.6).
7. No subagent may emit an event without complete `provenance` (PCI.5 §2).
8. No subagent may mix `truthMode` (PCI.5 §1.2).
9. No subagent may project audience `origin` content into a public commercial
   channel (PCI.5 §4).
10. No subagent may persist multi-tenant data without `workspaceId` filter
    (PCI.5 §5).

Violations are gates failures — automatic rejection, no negotiation.
