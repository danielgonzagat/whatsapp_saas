# Kloel Google OAuth Verification Submission

## Production surface

- Marketing site: `https://kloel.com`
- Privacy policy: `https://kloel.com/privacy`
- Terms of service: `https://kloel.com/terms`
- Data deletion: `https://kloel.com/data-deletion`
- Google RISC callback path in code: `/auth/google/risc-events`
- Recommended public URL if `app.kloel.com` proxies `/api/*` to the backend:
  `https://app.kloel.com/api/auth/google/risc-events`

## What is already implemented in code

- Stateful Google sign-in for user authentication.
- Public Google RISC endpoint with JWT SET validation against Google JWKS.
- Session invalidation and token revocation handling for:
  - `sessions-revoked`
  - `tokens-revoked`
  - `account-disabled`
  - `account-purged`
- Audit persistence for RISC events in `RiscEvent`.
- Privacy policy pages in PT-BR and English with explicit Google API
  disclosures.

## OAuth scopes currently requested in production

| Scope     | Why Kloel needs it                                                                            | Data accessed             | Storage / retention                                                                                          |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `openid`  | Identify the authenticated Kloel user and bind the social account to the internal user record | Google subject identifier | Stored as provider user id in the social account relation until the user revokes access or requests deletion |
| `email`   | Create or recover the Kloel user account and send transactional communications                | Primary email address     | Stored in the user profile and social account record; retained while the account is active                   |
| `profile` | Personalize the Kloel interface after login                                                   | Name and profile image    | Stored in the user profile and cached in the social account payload while the account is active              |

## Optional gated scopes for checkout prefill

These scopes are implemented in the checkout flow, but the extra consent prompt
is only attempted when `NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED=true`.

| Scope                                                    | Purpose                                                                  | Data accessed                            | Current rollout status                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------- |
| `https://www.googleapis.com/auth/user.phonenumbers.read` | Prefill lead phone number in checkout after explicit incremental consent | Phone number                             | Disabled by default in production until verification is approved |
| `https://www.googleapis.com/auth/user.addresses.read`    | Prefill postal address in checkout after explicit incremental consent    | Address lines, city, region, postal code | Disabled by default in production until verification is approved |

## English justifications per scope

### `openid`

Kloel uses `openid` to obtain the stable Google account identifier that ties the
Google login to the internal Kloel user account. We use this identifier to
prevent duplicate accounts, process account-security events, and safely revoke
sessions when Google sends Cross-Account Protection events.

### `email`

Kloel uses `email` to create or recover the authenticated user account and to
deliver transactional messages such as sign-in links, security notices, and
account deletion confirmations. The email address is never sold and is only
shared with infrastructure processors needed to operate the service.

### `profile`

Kloel uses `profile` to display the user's name and profile photo after sign-in
and to make the workspace experience recognizable across sessions. This data is
limited to interface personalization and account identity display.

### `https://www.googleapis.com/auth/user.phonenumbers.read`

Kloel uses `user.phonenumbers.read` only in the checkout prefill flow after the
end user explicitly requests faster checkout completion. The phone number is
used to reduce manual typing and improve conversion, and the feature remains
disabled by default until Google approves the sensitive-scope rollout.

### `https://www.googleapis.com/auth/user.addresses.read`

Kloel uses `user.addresses.read` only in the checkout prefill flow after the end
user explicitly requests address autofill. The address is used solely to prefill
shipping and billing fields, and the feature remains disabled by default until
Google approves the sensitive-scope rollout.

## Reviewer notes for privacy/legal consistency

The privacy policy already contains:

- explicit Google scope names
- data categories accessed by each scope
- purpose limitation
- storage and retention language
- third-party processors
- Google API Services User Data Policy statement
- Limited Use statement
- revocation and deletion instructions

Use `https://kloel.com/privacy` during submission and ensure the scopes in the
OAuth consent screen exactly match the scopes listed there.

## Three-minute demo script

1. Open `https://auth.kloel.com/login`.
2. Show the Google sign-in button and start the Google login flow.
3. Complete login and land in the Kloel app.
4. Open the privacy policy and highlight the Google section with scope table and
   Limited Use statement.
5. Show the data deletion page and the self-service deletion route.
6. Show the backend public RISC endpoint URL in the repo docs and explain that
   Google account-security events revoke Kloel sessions automatically.
7. If sensitive checkout prefill scopes are being submitted, show the checkout
   flow and the separate incremental consent step for phone/address prefill.

## Pre-submission checklist

- Domain ownership verified in Google Search Console for `kloel.com`.
- OAuth consent screen home page points to `https://kloel.com`.
- Privacy policy URL points to `https://kloel.com/privacy`.
- Terms of service URL points to `https://kloel.com/terms`.
- Only the scopes listed above are enabled in the OAuth client.
- If sensitive People API scopes are not being submitted yet, keep
  `NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED=false`.
- Register the public RISC URL and request the four supported event types.

## RISC registration payload

```json
{
  "delivery": {
    "delivery_method": "https://schemas.openid.net/secevent/risc/delivery-method/push",
    "url": "https://app.kloel.com/api/auth/google/risc-events"
  },
  "events_requested": [
    "https://schemas.openid.net/secevent/risc/event-type/sessions-revoked",
    "https://schemas.openid.net/secevent/risc/event-type/tokens-revoked",
    "https://schemas.openid.net/secevent/risc/event-type/account-disabled",
    "https://schemas.openid.net/secevent/risc/event-type/account-purged"
  ]
}
```

If your ingress does not expose the backend as `https://app.kloel.com/api`, keep
the controller path `/auth/google/risc-events` and only change the external base
URL.
