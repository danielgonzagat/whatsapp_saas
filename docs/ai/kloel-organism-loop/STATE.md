# Kloel Organism Loop — State

## Session Start: 2026-05-20

### Git
- Branch: feat/kloel-cognitive-organism
- HEAD: 4126119e1
- Modified: mind-bg.processor.ts, mind-bg.scheduler.ts, mind.module.ts
- New untracked: mind-prediction.service.ts

### PULSE Snapshot
- Certification: NOT_CERTIFIED (55/100)
- Capabilities: 0 real, 437 partial, 17 latent, 1 phantom
- Flows: 0 real, 48 partial
- Execution matrix: 11377 paths, 0 observed pass, 248 observed fail
- Runtime evidence: 0 probes executed
- Principal blocker: github_actions/deploy_failure

### Backend
- Status: RUNNING (localhost:3001)
- INTERNAL_API_KEY: dev-internal-key-2024

### Conversation Surfaces Discovered
1. POST /kloel/think (JWT + streaming)
2. POST /kloel/think/sync (JWT + sync)
3. POST /chat/guest (public)
4. POST /chat/guest/sync (public sync)
5. POST /kloel/agent/:workspaceId/process (INTERNAL_API_KEY)
6. POST /brain/decide (JWT)
