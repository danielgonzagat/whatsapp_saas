# Admin MFA Temporary Bypass

Use this only for the temporary owner access window. The default state is MFA
enforced.

## Enable

Set the backend runtime variable:

```sh
ADMIN_MFA_BYPASS_ENABLED=true
```

Restart the backend service so the new environment is loaded. Admin users with a
valid email and password receive a full authenticated session directly unless
`passwordChangeRequired` is still true.

## Disable

Unset the variable, or set it to any value other than `true`, `1`, `yes`, or
`on`, then restart the backend service.

With the variable disabled, login returns to the normal MFA state machine:
pending setup users go to `/mfa/setup`, and users with MFA enabled go to
`/mfa/verify`.

## Audit

Every login that uses the bypass writes:

```txt
admin.auth.login.mfa_bypassed
```

Check the admin audit screen or query `admin_audit_logs.action` for that exact
action after the access window.
