# prod-secrets

Wires the 5 production secrets that production-startup-guard requires:
`TIKTOK_CLIENT_SECRET`, `EMAIL_INBOUND_SECRET`,
`GOOGLE_ADS_TOKEN_ENCRYPTION_KEY`, `TIKTOK_TOKEN_ENCRYPTION_KEY`,
`EMAIL_TOKEN_ENCRYPTION_KEY` — plus 3 supporting values
(`TIKTOK_CLIENT_KEY`, `TIKTOK_REDIRECT_URI`, `GOOGLE_ADS_DEVELOPER_TOKEN`).

Without these, the backend throws `assertProductionStartupSecrets` at boot —
currently 101 events/24h in Sentry.

## Usage

```sh
railway login              # one-time OAuth
cd backend                 # or any linked context
bash scripts/ops/prod-secrets/apply.sh backend
```

Apply.sh reads its values from `~/.pi-ab.session-secrets.tmp` (gitignored,
mode 600) plus inline values from the most-recent chat session. Encryption
keys are AES-256 (32 bytes base64). The HMAC secret is 32 bytes hex.

## Rotation

`TIKTOK_CLIENT_SECRET` and `GOOGLE_ADS_DEVELOPER_TOKEN` appeared in chat
logs (2026-05-26). **Rotate both at the respective dashboards** within 24h
of applying; then re-run apply.sh with the new values.

The encryption keys (`*_TOKEN_ENCRYPTION_KEY`) and HMAC
(`EMAIL_INBOUND_SECRET`) were generated cryptographically by the
orchestrator (`openssl rand`) and never appeared in chat — they do not
need rotation.

After successful rotation:

```sh
shred -u ~/.pi-ab.session-secrets.tmp
```
