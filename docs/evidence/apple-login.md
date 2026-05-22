# Apple Login — Evidence

## How to run

```sh
node scripts/auth/apple-client-secret-probe.mjs
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | Key ID for the private key (from Apple Developer portal) |
| `APPLE_PRIVATE_KEY_P8` | Private key content (.p8), or set `APPLE_PRIVATE_KEY_PATH` to point to the file |
| `APPLE_SERVICE_ID` | Service ID / client_id (e.g. `com.kloel.signin`) |
| `APPLE_REDIRECT_URI` | Redirect URI registered in Apple Developer (e.g. `https://kloel.com/api/auth/callback/apple`) |

## Acceptance

| Result | Meaning |
|---|---|
| `PASS` | Apple replied `invalid_grant` to an intentionally invalid code — the client_secret JWT is well-formed, the key is correct, and Apple accepted the authentication context. The only reason the grant failed is the fake code. |
| `FAIL` | Apple replied `invalid_client` — the client_secret or client_id is invalid. Check key, team ID, service ID, and that the key is enabled for Sign In with Apple in the Developer portal. |
| `MISSING_ENV` | Required environment variables not set — see above for the exact list. |

## Last run

See `artifacts/apple-validation/` for the latest probe result.

If no artifact exists: **never run — env not available locally**.

## Blocker if env missing

If the required env vars are not available locally, Daniel must provide:

1. A `.p8` file placed at a known path (e.g. `~/.apple/AuthKey_XXXXXXXXXX.p8`)
2. The corresponding `APPLE_KEY_ID`, `APPLE_TEAM_ID`, and `APPLE_SERVICE_ID`

The script accepts `APPLE_PRIVATE_KEY_PATH` pointing to the `.p8` file path.

## Frontend Integration TODO

The frontend Apple sign-in button (`frontend/src/components/kloel/auth/kloel-auth-screen.social-buttons.tsx`) should only render when:

- `configured === true`
- `lastProbe.result === 'PASS'`
- `lastProbe.at` is within the last 7 days

The diagnostic endpoint `GET /auth/apple/diagnostic` provides this data.

## Architecture

```
scripts/auth/apple-client-secret-probe.mjs   ← standalone probe (zero deps beyond Node.js)
  ↓ writes artifacts to
artifacts/apple-validation/<iso-timestamp>.json
  ↓ read by
backend/src/auth/apple-login-diagnostic.controller.ts   ← GET /auth/apple/diagnostic
```
