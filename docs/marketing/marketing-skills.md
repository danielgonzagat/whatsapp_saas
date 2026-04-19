# Kloel Marketing Skills

## What this installs

Kloel now vendors the upstream `coreyhaines31/marketingskills` library into
project-local
`.agents/skills/`.

As of **April 19, 2026**, the upstream repository exposes **36** public skills:

- `ab-test-setup`
- `ad-creative`
- `ai-seo`
- `analytics-tracking`
- `aso-audit`
- `churn-prevention`
- `cold-email`
- `community-marketing`
- `competitor-alternatives`
- `content-strategy`
- `copy-editing`
- `copywriting`
- `customer-research`
- `email-sequence`
- `form-cro`
- `free-tool-strategy`
- `launch-strategy`
- `lead-magnets`
- `marketing-ideas`
- `marketing-psychology`
- `onboarding-cro`
- `page-cro`
- `paid-ads`
- `paywall-upgrade-cro`
- `popup-cro`
- `pricing-strategy`
- `product-marketing-context`
- `programmatic-seo`
- `referral-program`
- `revops`
- `sales-enablement`
- `schema-markup`
- `seo-audit`
- `signup-flow-cro`
- `site-architecture`
- `social-content`

## Project-specific additions

Kloel adds:

- `.agents/product-marketing-context.md`
- `.agents/skills/kloel-marketing-operator/SKILL.md`

These two files make the upstream library useful for Kloel-specific work:

- the context document captures Kloel positioning, ICP, objections,
  differentiation, and BR operator
  language
- the companion skill tells future agents to combine the upstream frameworks
  with Brazilian-market
  adaptation and Kloel realities

## Two operating levels

### 1. CLI / development level

Use this when Daniel is working on Kloel itself and asks for:

- homepage or landing copy
- seller acquisition strategy
- launch planning
- pricing
- paid ads
- onboarding and lifecycle messaging
- checkout conversion
- affiliate strategy
- churn reduction

The agent should combine:

- `.agents/product-marketing-context.md`
- the relevant upstream skill(s)
- `kloel-marketing-operator`

### 2. Product / CIA level

The seller-facing CIA should not expose the word "skill" to sellers.

Instead, the backend loads the same marketing domains as internal playbooks and
injects them only
when the seller ask is marketing-related. The CIA must answer in native pt-BR
and ground its answer
in live workspace data.

## Updating from upstream

1. Pull the latest upstream repository.
2. Diff the skill list.
3. Copy new or changed skill directories into `.agents/skills/`.
4. Re-check `.agents/product-marketing-context.md` for drift against Kloel
   positioning.
5. Re-check any backend registry that mirrors the upstream skill list.

## Notes

- Kloel intentionally treats the upstream library as the reference taxonomy, but
  not as a literal
  final output style.
- All seller-facing usage must be adapted to Brazilian info-product and
  e-commerce language,
  examples, and execution realities.
