# Kloel Canonical Vocabulary

> **PI Task K24** — Authoritative term dictionary. Every row maps a canonical name to forbidden/deprecated aliases.
> Current steady-state: **560 soft warnings** audited as domain-correct (see [VOCABULARY_FLOOR_REACHED.md](./VOCABULARY_FLOOR_REACHED.md)).

---

## Entity Terms

| Canonical | Aliases to avoid | Permitted exceptions | Notes |
|---|---|---|---|
| `Contact` | `Lead` (as entity), `Client` (as entity), `Customer` (as entity), `Prospect`, `User` (in messaging context) | `Lead`/`Customer` as funnel-stage labels; `Client` as agency-client-of-clients; `User` as auth identity | General messaging-side party; distinct from auth `User` |
| `User` | — | NOT to be used as `Contact` in messaging context | Authentication identity only (JWT/Google/Apple login) |
| `Lead` | `Prospect`, `PotentialClient` | Funnel-stage label only (`Lead.created`, `Lead.converted`, pipeline stages) | CRM pipeline entity — NOT a contact replacement |
| `Customer` | — | Funnel-stage label; Stripe SDK `Customer` type (external) | Post-conversion entity with purchase history |
| `Client` | — (in messaging/entity context) | Agency module tracking ("client of a marketing agency"); WebSocket `client` handle | NOT a Contact alias |
| `ChannelSession` | `whatsappSession`, `waSession`, `connection` (session), `instance` (session), `botSession` | `connection` as TCP/socket; `instance` as class singleton | Authoritative session entity across all messaging channels |
| `Workspace` | `Tenant`, `Org`, `Account` (in scope/multi-tenant context) | `Account` as external provider entity (Stripe Connect, Meta Ad Account, bank account) | Multi-tenant isolation unit |

---

## Service & Architecture Terms

| Canonical | Aliases to avoid | Notes |
|---|---|---|
| `MessageDispatchService` | `WahaService.sendMessage`, `WhatsappApiService.sendText`, `MessageWorker.process` | Single channel-agnostic send pipeline |
| `ChannelTransportRegistry` | `ProviderRegistry`, `ChannelAdapter` | Maps channel keys to transport implementations |
| `Webhook` | `Hook`, `Callback`, `Notification`, `IncomingEvent` | External provider → internal event boundary |
| `Spine` (Event Spine) | `EventBus`, `MessageBus`, `EventEmitter` | Cognitive event backbone (`SpineEmitterService`) |
| `Mind` (Cognitive) | `Brain`, `AI`, `ML`, `Intelligence` | Prefix for all cognitive-loop services (ADR-0013) |
| `Capability` | `Skill`, `Action`, `Tool` (in executor context) | Atomic business operation registered in capability registry |
| `Outbox` | `EventLog`, `AuditTrail` | Durable event store for downstream consumption |
| `DomainService` | — | Canonical suffix for domain-owned business logic (vs `Service` for generic) |

---

## Data/State Terms

| Canonical | Aliases to avoid | Notes |
|---|---|---|
| `Belief` | `Probability`, `Confidence`, `Score` (in cognitive context) | Bayesian posterior in `MindBeliefService` |
| `Prediction` | `Forecast`, `Projection` (in cognitive context) | Expected outcome in `MindPredictionService` |
| `Percept` | `Observation`, `Signal`, `Event` (raw) | Cognitive input event from `MindPerceptionService` |
| `Valence` | `Sentiment`, `Tone`, `Polarity` | Positive/negative/neutral tag on spine events |
| `BanditArm` | `Variant`, `Option`, `Strategy` | A/B exploration arm in `MindBanditService` |

---

## Lifecycle & Flow Terms

| Canonical | Aliases to avoid | Notes |
|---|---|---|
| `Checkout` | `Cart`, `Order` (as process), `Purchase` (as process) | The payment-flow experience (not the order entity) |
| `Order` | `Purchase`, `Transaction` (as entity) | Committed purchase record |
| `Cart` | `Basket`, `PendingOrder` | Pre-checkout product selection |
| `Plan` | `Subscription`, `Membership`, `Product` (in pricing context) | Recurring or one-time pricing entity |
| `Product` | `Item`, `SKU`, `Goods` | Sellable unit (physical, digital, service) |

---

## How to Add an Entry

1. Find duplication: see [DUPLICATION_REGISTER.md](./DUPLICATION_REGISTER.md) or [CAPABILITY_MAP.md](./CAPABILITY_MAP.md)
2. Pick the canonical name (domain-clear, no abbreviation, follow existing conventions)
3. List all aliases found via `search` or `ast_grep`
4. Add row above
5. Gate check: `npm run check:canonical-vocabulary` must stay at ≤560 soft warnings

## Gate Status (Wave 54)

- **560 soft warnings** — all audited as domain-correct (see [VOCABULARY_FLOOR_REACHED.md](./VOCABULARY_FLOOR_REACHED.md))
- **0 hard violations**
- **0 strict-mode blocking**
- Breakdown: `Contact` aliases 247, `ChannelSession` aliases 242, `Workspace` aliases 62, `Webhook` aliases 9
