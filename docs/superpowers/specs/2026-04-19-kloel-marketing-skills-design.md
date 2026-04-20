# Kloel Marketing Skills Design

## Goal

Incorporate the `coreyhaines31/marketingskills` knowledge base into Kloel at two
levels:

1. Project-local CLI skills for future Codex/Claude sessions working on Kloel.
2. Runtime marketing intelligence inside the seller-facing CIA, grounded in real
   workspace data and adapted to Brazilian info-product and e-commerce contexts.

## Reality Check

As of April 19, 2026, the upstream `marketingskills` README exposes 36 public
skills, not 34. Kloel should treat those 36 skills as the canonical source set
unless Daniel explicitly wants a pinned older subset.

## Constraints

- Governance files remain untouched.
- Preserve the current CIA architecture instead of introducing a second agent
  stack.
- Prefer deterministic routing and local file assets over fragile prompt-only
  magic.
- Any product-facing marketing response must stay honest about missing data and
  missing execution surfaces.

## Architecture

### Layer 1: CLI Skill Surface

- Vendor the upstream skills into project-local `.agents/skills/`.
- Create `.agents/product-marketing-context.md` with real Kloel positioning,
  audience, GTM, objections, proof points, and Brazilian-market language.
- Add one Kloel-specific companion skill that teaches the agent how to combine
  the upstream skills with Brazilian-market adaptation and Kloel realities.
- Document the installation and update path in the repo.

### Layer 2: CIA Marketing Intelligence

- Add a backend marketing skills package under
  `backend/src/kloel/marketing-skills/` .
- The package has four responsibilities:
  - Registry: canonical catalog of the 36 skills and their BR adaptation notes.
  - Loader: load the upstream skill markdown from
    `.agents/skills/<skill>/SKILL.md` .
  - Router: map incoming seller messages to one or more skill domains using
    deterministic PT-BR heuristics.
  - Context builder: assemble a compact marketing snapshot from real workspace
    state.
- `UnifiedAgentService` remains the execution brain. It receives an extra
  "marketing packet" when the seller message is marketing-oriented.

## Marketing Packet

The injected packet should contain:

- Selected skill IDs.
- Short rationale for why each skill applies.
- Curated excerpts from the relevant skill markdown.
- Brazilian adaptation rules:
  - write in native pt-BR
  - prefer info-product / e-commerce BR examples
  - avoid literal US SaaS wording
  - prioritize execution over generic advice
- Live workspace snapshot:
  - products and offers
  - checkout and sales performance
  - campaign state
  - affiliate/split configuration
  - wallet/ledger constraints
  - fraud/safety constraints

## Execution Surfaces

Prioritize real actions already present in the codebase:

- Landing/site generation and draft persistence via Kloel site
  endpoints/services.
- Email campaign drafting/sending via `EmailCampaignService`.
- Campaign creation/scheduling via `CampaignsService`.
- Product and offer updates via existing UnifiedAgent tools.
- Affiliate/split recommendations constrained by SplitEngine, LedgerEngine, and
  FraudEngine context.

## Routing Model

Use deterministic first-pass routing to avoid cost and drift:

- keyword families in PT-BR and BR operator language
- checkout / ROAS / lançamento / afiliado / copy / SEO / email / landing /
  oferta / churn / precificação / ads
- allow multi-skill selection
- fall back to no packet when the message is not marketing-specific

## Output Principles

- Give seller-facing answers as an operator, not as a generic marketing tutor.
- State what is known from real data, what is inferred, and what still requires
  confirmation.
- If execution is possible, say so concretely and use tools.
- If execution is not yet wired, return an honest action plan with the exact
  next platform action.

## Testing

### CLI Level

- Verify all vendored skills exist in `.agents/skills`.
- Verify the Kloel product marketing context file exists and is populated.
- Verify the Kloel companion skill references the upstream skills correctly.

### CIA Level

- Unit-test the router against representative PT-BR prompts.
- Unit-test the context builder against sparse and rich workspace data.
- Unit-test the marketing packet composition.
- Extend `UnifiedAgentService` tests to verify marketing packets are injected
  for marketing asks.

## Success Conditions

- Future project sessions in Kloel have immediate access to the upstream skill
  set and Kloel context.
- CIA can detect marketing asks, load the right frameworks, and answer with
  workspace-grounded strategy.
- CIA can trigger at least the existing real execution surfaces for landing
  pages, campaigns, and email.
