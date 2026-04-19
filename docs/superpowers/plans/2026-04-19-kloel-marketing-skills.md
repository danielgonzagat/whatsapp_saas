# Kloel Marketing Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor the upstream marketing skills for Kloel development workflows and inject a marketing skill packet into the seller-facing CIA using real workspace context.

**Architecture:** Keep the upstream skills as local project assets under `.agents/skills`, then add a backend marketing-skills package that loads, routes, and injects those assets into `UnifiedAgentService` only when a message is marketing-oriented.

**Tech Stack:** Markdown skill assets, NestJS services, deterministic PT-BR routing, existing OpenAI tool-calling pipeline.

---

### Task 1: Install Project-Local Marketing Skills

**Files:**

- Create: `.agents/skills/*`
- Create: `.agents/product-marketing-context.md`
- Create: `.agents/skills/kloel-marketing-operator/SKILL.md`

- [ ] Copy the upstream skill directories into `.agents/skills/`.
- [ ] Add a real Kloel product marketing context document in `.agents/product-marketing-context.md`.
- [ ] Add a Kloel companion skill that teaches BR adaptation and how to combine the upstream skills for Kloel asks.

### Task 2: Document the Skill Surface

**Files:**

- Create: `docs/marketing/marketing-skills.md`

- [ ] Document the installed skill set, update path, and the current upstream skill count.
- [ ] Explain how the CLI layer differs from the product CIA layer.

### Task 3: Add Backend Marketing Skill Package

**Files:**

- Create: `backend/src/kloel/marketing-skills/marketing-skill.catalog.ts`
- Create: `backend/src/kloel/marketing-skills/marketing-skill.loader.ts`
- Create: `backend/src/kloel/marketing-skills/marketing-skill.router.ts`
- Create: `backend/src/kloel/marketing-skills/marketing-skill.context.ts`
- Create: `backend/src/kloel/marketing-skills/marketing-skill.types.ts`

- [ ] Define the canonical catalog for the 36 upstream skills.
- [ ] Load vendored markdown assets from `.agents/skills`.
- [ ] Route PT-BR marketing asks to one or more skills.
- [ ] Build a compact workspace marketing snapshot.

### Task 4: Inject Marketing Packets into CIA

**Files:**

- Modify: `backend/src/kloel/unified-agent.service.ts`
- Modify: `backend/src/kloel/kloel.module.ts`

- [ ] Inject the new marketing skill services into the Kloel module.
- [ ] Compose a marketing packet before the OpenAI call in `UnifiedAgentService`.
- [ ] Pass selected skill excerpts plus live workspace marketing context into the prompt flow.

### Task 5: Wire Real Execution Surfaces

**Files:**

- Modify: `backend/src/kloel/unified-agent.service.ts`

- [ ] Add or extend tool handlers for marketing actions that already have real platform surfaces.
- [ ] Prefer landing/site generation, email campaign creation, and campaign scheduling first.

### Task 6: Add Tests

**Files:**

- Create: `backend/src/kloel/marketing-skills/marketing-skill.router.spec.ts`
- Create: `backend/src/kloel/marketing-skills/marketing-skill.context.spec.ts`
- Modify: `backend/src/kloel/unified-agent.service.spec.ts`

- [ ] Test routing for checkout, launch, ROAS, landing page, and cart recovery asks.
- [ ] Test packet composition when data is present or absent.
- [ ] Test that `UnifiedAgentService` injects the marketing packet only when appropriate.

### Task 7: Verify

**Files:**

- No code changes.

- [ ] Run targeted backend tests for the new marketing skill package and `UnifiedAgentService`.
- [ ] Run backend typecheck if the touched surface grows beyond isolated units.
