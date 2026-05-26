# Wave 17 — Decompose kloel-auth-screen.tsx Report

> Authored by PI atomic subagent `w17-decompose-auth-screen` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Lines Extracted + New LOC

| Metric | Value |
|--------|-------|
| Original screen LOC | 585 |
| New screen LOC | 515 |
| **Lines extracted from screen** | **70** |
| New header component LOC | 95 |
| Net delta (screen only) | −70 |
## 2. Files Created

- `frontend/src/components/kloel/auth/kloel-auth-screen.header.tsx` (95 LOC)

### Section Extracted: Auth Header

The **header panel** — mode-dependent badge, title, subtitle, and optional affiliate invite banner — was extracted from inline JSX into the `AuthHeader` component.

**Props contract:**
```ts
interface AuthHeaderProps {
  mode: 'login' | 'register';
  affiliateInviteToken?: string;
  affiliateInviteWorkspaceName?: string;
}
```

**What it renders:**
- Badge: `'Acesso seguro'` (login) / `'Nova conta'` (register) — JetBrains Mono, ember primary, uppercase
- Title: `'Entrar'` / `'Criar conta'` — Sora, 700 weight, clamp-responsive
- Subtitle: mode-dependent description text
- Affiliate banner (conditional): shown only when `mode === 'register'` AND `affiliateInviteToken` is truthy

**Usage in screen:**
```tsx
<AuthHeader
  mode={mode}
  affiliateInviteToken={affiliateInviteToken}
  affiliateInviteWorkspaceName={affiliateInviteWorkspaceName}
/>
```

### Cleanup
- Removed now-unused `jetbrains` font constant from `kloel-auth-screen.tsx` (used only by header)
- `sora` constant retained — still used by input styles, divider text, and footer links
## 3. Frontend tsc Result

```
> frontend@0.1.0 typecheck
> tsc --noEmit

✓ PASS (exit code 0, no errors)
```
## 4. Shell Preservation Confirmation

### Visual structure (ASCII)

```
┌──────────────────────────────────────────────────────┐
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │     LEFT — FORM      │  │  RIGHT — THE MACHINE │  │
│  │                      │  │                      │  │
│  │  ┌────────────────┐  │  │    (hidden on        │  │
│  │  │  <AuthHeader>  │  │  │     mobile via        │  │
│  │  │                │  │  │     md:flex)          │  │
│  │  │  [BADGE]       │  │  │                      │  │
│  │  │  [TITLE]       │  │  │                      │  │
│  │  │  [SUBTITLE]    │  │  │                      │  │
│  │  │  [AFFILIATE?]  │  │  │                      │  │
│  │  └────────────────┘  │  │                      │  │
│  │                      │  │                      │  │
│  │  <SocialButtons>     │  │                      │  │
│  │  ─── ou ───          │  │                      │  │
│  │  <AuthFormFields>    │  │                      │  │
│  │                      │  │                      │  │
│  │  ┌────────────────┐  │  │                      │  │
│  │  │ Suporte Termos │  │  │                      │  │
│  │  │ Privacidade    │  │  │                      │  │
│  │  └────────────────┘  │  │                      │  │
│  └──────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────────────────────┘
```
### Preservation audit

| Element | Before | After | Preserved? |
|---------|--------|-------|------------|
| Container: flex minHeight:100vh | Inline `<div>` | Inline `<div>` | ✓ |
| Right panel: `className="hidden md:flex"` | Inline `<div>` | Inline `<div>` | ✓ |
| TheMachine | `<TheMachine />` | `<TheMachine />` | ✓ |
| SocialButtons + all props | `<SocialButtons .../>` | `<SocialButtons .../>` | ✓ |
| Divider (ou) | Inline | Inline | ✓ |
| AuthFormFields + all props | `<AuthFormFields .../>` | `<AuthFormFields .../>` | ✓ |
| Footer links (Suporte/Termos/Privacidade) | Inline | Inline | ✓ |
| **Header JSX** | **71 lines inline** | **`<AuthHeader .../>` (1 line)** | **✓ identical DOM** |

### Design token audit

| Token | Location | Unchanged? |
|-------|----------|------------|
| `colors.ember.primary` | Badge + affiliate banner | ✓ |
| `colors.text.silver` | Title | ✓ |
| `colors.text.muted` | Subtitle | ✓ |
| `colors.border.space` | Divider | ✓ |
| `colors.background.void` | Root | ✓ |
| `fontFamily: sora` | Title, subtitle | ✓ |
| `fontFamily: jetbrains` | Badge, affiliate banner | ✓ |
| `marginBottom: 36` | Header container | ✓ |
| `gap: 12` | Header flex column | ✓ |
### Tests

```
 ✓ src/components/kloel/auth/kloel-auth-screen.social-buttons.test.tsx (5 tests)
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Summary

- **70 lines extracted** from `kloel-auth-screen.tsx` (585 → 515)
- **New file:** `kloel-auth-screen.header.tsx` (95 LOC)
- **Shell:** bit-identical DOM output, every className/design-token/prop preserved
- **tsc:** ✓ green
- **Tests:** 5/5 passing
