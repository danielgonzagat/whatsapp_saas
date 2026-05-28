# ESLint Canonical-Enforcement Plugin

Anti-regression gate for the Kloel canonicalization mission. Blocks semantic
duplicates of shared primitives that already have a canonical home under
`backend/src/common/`.

## Rules

| Rule | Canonical home | What it flags |
|---|---|---|
| `canonical/no-rogue-unknown-record` | `backend/src/common/types.ts` | `type X = Record<string, unknown>` outside canonical |
| `canonical/no-rogue-phone-normalizer` | `backend/src/common/phone.ts` | `function digitsOnly\|digitsOrNull\|digitsOrUndefined\|whatsappDigits` outside canonical |
| `canonical/no-rogue-clamp` | `backend/src/common/math.ts` | `function clamp\|clampScore` outside canonical |

## How to opt in

The workspace `eslint.config.mjs` files are **protected** (not automatically
modified). The human owner must manually wire this plugin into each workspace.

### Step 1 — add the overlay

In each workspace's `eslint.config.mjs`, add the canonical overlay before
the spread of other configs:

```js
const canonicalOverlay = require('../scripts/ops/eslint-canonical-rules/.eslintrc.canonical-overlay.json');

module.exports = tseslint.config(
  canonicalOverlay,
  // … existing config
);
```

### Step 2 — verify

```sh
cd backend && npx eslint --rule 'canonical/no-rogue-unknown-record: error' src/
```

## Smoke test

```sh
node scripts/ops/eslint-canonical-rules/__tests__/smoke.cjs
```

## Design notes

- The plugin is **standalone** — not a workspace dependency. The overlay uses a
  relative `require()` path to the plugin index.
- Rules are CommonJS (`.cjs`) so they work with both ESM and CJS ESLint configs
  without transpilation.
- The canonical file exemption uses `context.filename` (or `context.getFilename()`)
  to allow the canonical declaration itself to exist.
