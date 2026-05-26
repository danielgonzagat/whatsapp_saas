# Wave 19 — Decompose billing-settings-section.tsx

> Authored by PI atomic subagent `w19-decompose-billing-settings` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Lines extracted + new LOC

| Metric | Value |
|--------|-------|
| Original `billing-settings-section.tsx` | 559 LOC |
| New `billing-settings-section.tsx` | 479 LOC |
| New `billing-settings-section.payment-methods.tsx` | 125 LOC |
| Lines removed from main file | 80 |

## 2. Files created

- `frontend/src/components/kloel/settings/billing-settings-section.payment-methods.tsx` — 125 LOC

### What was extracted

The **"Cartoes para assinatura" (Payment Methods) card** — a `SettingsCard` containing:
- Empty state with add-card CTA
- Card list with brand, last4, expiry display
- Set-default / remove actions per card
- `showCardsFirst` notice for trial-activation flow

Extracted as a presentational `PaymentMethodsCard` component receiving five props:
- `cards: PaymentMethod[]`
- `showCardsFirst: boolean`
- `onAddCard: () => void`
- `onSetDefault: (id: string) => void`
- `onRemove: (id: string) => void`

### Changes to main file

- Added `import { PaymentMethodsCard } from './billing-settings-section.payment-methods'`
- Removed `CreditCard`, `Trash2` from lucide-react imports (now only in the sub-component)
- Removed `SettingsHeader` from contract imports (no longer used in main file)
- Replaced inline `SettingsCard` JSX (lines 411–495) with `<PaymentMethodsCard … />` call

## 3. Frontend tsc result

```
> frontend@0.1.0 typecheck
> tsc --noEmit

(exit 0)
```

**PASS** — zero type errors.
