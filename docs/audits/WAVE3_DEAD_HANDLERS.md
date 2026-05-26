# Wave 3 — Dead-Handler Audit

> Authored by PI atomic subagent `w3-dead-handler-hunt` (DeepSeek V4 Pro,
> ~15k events). Written by the subagent via atomic_author.
> Run date: 2026-05-26.


## Methodology

Scanned every `<button>`, `<Button>`, `<Link>`, `<a>`, and clickable `role="button"`
element across:

- `frontend/src/app/(main)/**/*.tsx` (all main app route pages)
- `frontend/src/components/kloel/**/*.tsx` (all KLOEL dashboard components)
- `frontend/src/components/**/*.tsx` (canvas, flow, plans, products, webinars, ui)

Skipped `*.spec.ts`, `*.test.ts`, `*.test.tsx`, `frontend-admin/`.

Search strategies applied:

1. **AST-grep** for `onClick={() => {}}`, `onSubmit={() => {}}`, `onClick={undefined}` —
   parse errors on JSX attributes forced fallback to text search.
2. **Text search** for: empty handler bodies (`=> {}`), `TODO` in handler context,
   `throw new Error('Not implemented')`, `console.log`-only handlers,
   `e.preventDefault()`-only handlers, stub return handlers.
3. **Structural readout** of every file with `<button>` matches to inspect for
   missing `onClick` on elements styled with `cursor: pointer`.
4. **Cross-reference** of optional-chaining handlers (`onClick={() => fn?.()}`) to
   verify parent callers supply the callback.

## Summary

- Total `<Button>` / `<button>` / clickable elements scanned: ~600 (across 390+
  unique files with at least one `onClick=` match, plus decorative buttons)
- Dead handlers found: **3 locations (10+ individual button instances)**
- TODO-marked handlers: **0**
- Console-log-only handlers: **0**
- Stub-function handlers (throw/return immediately): **0**

## Dead handlers (ordered by user-visibility)

### `frontend/src/components/kloel/sites/Dominios.tsx:71-72` — Edit / Trash domain buttons (mobile layout)

- Component path: `/sites/dominios` (via `SitesView` tab → `Dominios`)
- Handler signature: **no `onClick` at all**
- Classification: **DECORATION**
- User impact: User sees edit (pencil) and trash (delete) icons styled as
  clickable buttons (`cursor: pointer`) on each domain row. Clicking either
  icon produces zero effect — no modal, no state change, no navigation.
  The component also initializes `domains` as an empty array with no mutation
  path, so these buttons never appear in production, but are dead code
  reachable if domain data is ever wired up.
- Recommendation: **DELETE-BUTTON** or wire up `handleEditDomain` /
  `handleDeleteDomain` callbacks before surfacing domain data.

### `frontend/src/components/kloel/sites/Dominios.tsx:94-95` — Edit / Trash domain buttons (desktop layout)

- Component path: `/sites/dominios` (desktop variant of the same table)
- Handler signature: **no `onClick` at all**
- Classification: **DECORATION**
- User impact: Same as above — identical dead buttons in the desktop grid
  layout. Four dead buttons total (2 mobile + 2 desktop).
- Recommendation: **DELETE-BUTTON** (same as mobile — both layouts share
  the same fix).

### `frontend/src/components/canvas/canvas-editor-sidebar-panels.tsx:78-80` — Template tag pills

- Component path: Canvas editor → sidebar → Templates tab
- Handler signature: **no `onClick` at all**
  ```tsx
  {TEMPLATE_TAGS.map((tag) => (
    <button type="button" key={tag} style={pillStyle}>
      {tag}
    </button>
  ))}
  ```
  `pillStyle` includes `cursor: 'pointer'`.
- Classification: **DECORATION**
- User impact: User opens the canvas editor, switches to the "Modelos"
  (Templates) sidebar tab, and sees 6 pill-shaped tag buttons
  (`Marketing`, `Lancamento`, `Desconto`, `Depoimento`, `Antes/Depois`,
  `Produto`). They look like filter buttons — clickable styling, pill
  shape, distinct from plain text. Clicking any tag does nothing: no
  filtering, no highlight toggle, no template list update. The templates
  below remain unfiltered.
- Recommendation: **ADD-API-CALL** — wire up a `selectedTag` state and
  filter `templates` by tag, or **DELETE-BUTTON** if tag filtering is
  not yet implemented.

### `frontend/src/components/kloel/sites/VisaoGeral.tsx:17` — Site overview cards

- Component path: `/sites` (Visão Geral tab)
- Handler signature: **no `onClick` on Card with `cursor: 'pointer'`**
  ```tsx
  <Card style={{ ..., cursor: 'pointer' }}>
  ```
  The `OverviewSiteCard` component renders site rows with `cursor: pointer`
  but no `onClick` prop. Adjacent tabs (`EditarSiteList`) do wire `onClick`
  to navigate to the site editor, so users may expect the same here.
- Classification: **DECORATION**
- User impact: On the Sites overview page, user sees a list of their sites
  with a pointer cursor on hover, suggesting clickability (next to a
  "Criar Novo Site" button and other actionable cards). Clicking a site
  card does nothing — user must navigate to the "Editar" tab to open a site.
- Recommendation: **ADD-API-CALL** — add `onClick={() =>
  switchTab('editar')}` or navigate to `/sites/editar?id={site.id}`.

## Top 10 high-visibility dead handlers (must fix before next prod deploy)

1. **Dominios.tsx edit/trash buttons** — Domain management UI with fully
   non-functional action buttons; immediate user frustration if domains
   are ever populated.
2. **canvas-editor-sidebar-panels template tags** — Canvas editor is a core
   creative surface; dead filter pills break the mental model of the
   templates panel and waste screen real estate.
3. **VisaoGeral.tsx site cards** — The primary Sites landing tab shows
   clickable-looking cards that go nowhere; the "Editar" tab is the only
   path to open a site, creating unnecessary friction.

---

*Audit completed 2026-05-26. The codebase is notably clean — zero TODO-marked
handlers, zero console-log-only handlers, zero stub-function handlers, and
zero `onClick={() => {}}` patterns in non-test code. All three findings are
missing-handler (DECORATION) issues on components that look interactive but
lack wiring.*mode
