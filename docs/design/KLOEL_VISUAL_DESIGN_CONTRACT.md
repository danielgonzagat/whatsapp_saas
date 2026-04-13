# Kloel Visual Design Contract

## Status

- Mandatory.
- Extends the existing Terminator contract; it does not replace it.
- Applies to every Kloel product surface, chat surface, operator surface, and AI-generated UI output.

## Precedence

1. Preserve Kloel brand identity already defined in the repo: light-first, dark-second, ember accent, no emojis in product UI, SVG-only icons, restrained chrome.
2. For app/product surfaces, this contract is the product-layer refinement that raises Kloel to the benchmark of Claude, ChatGPT, Linear, and Vercel.
3. If an older local component conflicts with this contract, the component must converge to this contract instead of inventing a third standard.

## Typography

- Product UI and chat surfaces use one premium sans stack consistently:
  - `Inter`, `Geist Sans`, system sans fallbacks.
- Monospace surfaces use:
  - `JetBrains Mono`, `Geist Mono`, system mono fallbacks.
- Brand/display surfaces may still use the existing brand typography where needed, but core product readability wins inside the app.
- Non-negotiable:
  - chat body text is never below `16px`
  - chat body line-height is `1.5` to `1.625`
  - headings use tighter tracking than body text
  - metadata, timestamps, and badges may go to `12px`

## Color and Surfaces

- Light mode is primary. Dark mode is secondary and must remain visually coherent without overriding the light-first contract.
- Background hierarchy must use luminance stepping, not decorative gradients:
  - `--bg-base: #0a0a0a`
  - `--bg-primary: #0f0f0f`
  - `--bg-secondary: #141414`
  - `--bg-tertiary: #1a1a1a`
  - `--bg-elevated: #212121`
  - `--bg-overlay: #262626`
- Text hierarchy must avoid pure white glare:
  - `--text-primary: #f5f5f5`
  - `--text-secondary: rgba(255,255,255,0.70)`
  - `--text-tertiary: rgba(255,255,255,0.50)`
  - `--text-muted: rgba(255,255,255,0.38)`
- Accent is singular and functional. Do not turn the accent into decoration.
- Borders remain subtle:
  - standard border opacity stays in the `0.06` to `0.12` range
  - no thick divider language in app UI

## Layout

- Chat content column targets the industry-standard readable width:
  - `max-width: 48rem` (`768px`)
- Sidebar target width:
  - `260px`
- Use the 4px spacing scale only.
- Default product radius:
  - `8px`
- Large composer/container radius:
  - `12px` to `16px`
- Whitespace is a premium signal. Prefer more breathing room over tighter packing.

## Chat Product Contract

- AI messages are not messenger bubbles with tails.
- AI responses breathe on the page; user messages may have subtle background differentiation.
- Message actions live below the response as understated monochrome icons.
- Regenerated assistant replies must preserve versions and expose navigation.
- The composer is multiline, auto-growing, and never horizontal-scrolls user text.
- Scroll behavior:
  - user scroll intent always wins
  - auto-scroll only when already at bottom
  - scroll-to-bottom affordance appears when auto-scroll is paused

## Thinking, Processing, and Streaming

- Never show a heavy card, debug box, or faux “operational bubble” for generic processing.
- If the model is processing and there is no real human-readable reasoning from the provider/model:
  - show only a subtle branded animation plus an elapsed timer
  - show no invented narrative text
- If a provider later supplies real reasoning content:
  - render it in a lighter, collapsed/expandable treatment above the answer
  - do not restyle technical logs as cognition
- Streaming must feel smooth:
  - no bursty chunk dumps
  - cursor disappears deterministically on done or failure
  - no stuck loading indicator

## Markdown Rendering

- Default answer style is conversational prose.
- Lists, headings, tables, and code blocks are used only when the content needs them.
- Code blocks must support:
  - syntax highlighting
  - copy affordance
  - clear separation from prose
- No emoji-led heading systems.

## Empty State

- The welcome state is minimal, breathable, and brand-anchored.
- Greeting is concise.
- Suggestions are optional and only exist when they are contextually useful and honest.
- No clutter, onboarding walls, or fake capability theater.

## Motion

- Durations:
  - micro interactions: `100–150ms`
  - hover states: `150ms`
  - state transitions: `200–300ms`
  - page-level transitions: `300–400ms`
- Easing is restrained:
  - standard ease-out / ease-in-out
  - Claude-like spring ease may be used sparingly on the composer
- Respect `prefers-reduced-motion`.

## Responsive Contract

- Sidebar collapses into overlay below `1024px`.
- Touch targets are at least `44x44px`.
- Inputs remain `16px+` on mobile to prevent iOS zoom.
- No horizontal overflow on any primary screen.

## Forbidden Visual Patterns

- No emoji-heavy AI answer chrome.
- No decorative gradients unless a deliberate brand decision is documented.
- No thick borders around everything.
- No generic CSS spinners when a branded animation exists.
- No forced auto-scroll after the user scrolls up.
- No dense layouts that trade clarity for compression.
- No faux-3D, glossy, skeuomorphic UI.

## Enforcement

- Every shipped Kloel screen must pass:
  - typography gate
  - color/token gate
  - spacing gate
  - border/shadow restraint gate
  - responsive gate
  - chat UX gate
- Any new component that introduces a competing visual language is a regression.
