# Google OAuth Verification Submission

Last updated: 2026-04-18

## Product summary
Kloel is a multi-tenant SaaS platform for commercial automation, AI-assisted messaging, checkout optimization, and customer operations. Google Sign-In is used to authenticate Kloel users, personalize the workspace, and, behind a feature flag, optionally prefill checkout fields after explicit incremental consent.

Relevant public URLs:

- Home: `https://kloel.com`
- Privacy Policy: `https://kloel.com/privacy`
- Terms of Service: `https://kloel.com/terms`
- Data deletion: `https://kloel.com/data-deletion`

## OAuth scopes and justifications

### Default login scopes

#### `openid`
Kloel uses the Google account subject identifier to create and maintain a stable authenticated user identity inside the platform. This identifier is used only for authentication, session integrity, and account security.

#### `email`
Kloel uses the Google account email address to create or match the Kloel account, send transactional notifications, and support account recovery. The email is not used for advertising resale or model training.

#### `profile`
Kloel uses the user's name and profile photo to personalize the workspace, dashboard, and identity surfaces after login. Profile data is displayed only inside the authenticated product experience and is retained only as long as needed for account operation.

### Optional incremental-consent scopes

These scopes are implemented in code behind a feature flag and must remain disabled in production until Google approves them:

#### `https://www.googleapis.com/auth/user.phonenumbers.read`
Used only when a logged-in user explicitly opts in to extended profile prefill so Kloel can populate checkout contact fields with the user's Google profile phone number.

#### `https://www.googleapis.com/auth/user.addresses.read`
Used only when a logged-in user explicitly opts in to extended profile prefill so Kloel can populate checkout delivery/billing address fields with the user's Google profile address.

#### `https://www.googleapis.com/auth/user.birthday.read`
Used only when a logged-in user explicitly opts in to extended profile prefill for regulated or age-sensitive checkout flows that require birth date verification.

## Data handling statement

- Google profile data is stored only as needed for authentication, personalization, security, and explicit user-authorized prefills.
- Sensitive incremental-consent data is not requested during the default login flow.
- Kloel does not use Google API data to train AI models.
- Kloel does not sell Google API data.
- Human access to Google API data is restricted to explicit support/security incidents or legal obligations.
- Google-derived data is encrypted at rest and transmitted over TLS.

## Demo video script (under 3 minutes)

1. Open `https://kloel.com`.
2. Navigate to the login entry point on `auth.kloel.com`.
3. Show the available sign-in methods: Google, Facebook, Apple-prepared surface, and magic link.
4. Click `Google`.
5. Show the Google consent screen with `openid`, `email`, and `profile`.
6. If the same email already exists in Kloel, show the confirmation email arriving and click the one-time account-link magic link.
7. Complete authorization and show the user landing in the Kloel app.
8. Point out that the Kloel user is identified by name, email, and profile photo.
9. Open the legal footer or a new tab for `https://kloel.com/privacy` and highlight the Google API Services User Data Policy / Limited Use section.
10. Inside the authenticated app, open `Settings > Conta` and show the privacy zone with `Exportar meus dados` and `Excluir minha conta`.
11. Open `https://kloel.com/data-deletion` and explain the self-service and provider callback deletion flow.
12. If and only if the incremental-consent feature has been approved and enabled, show the separate extended-consent flow and the resulting checkout prefill badge.

## Reviewer notes

- The login flow now includes CSRF-safe state handling for Google OAuth-related authorization flows and no longer triggers the Google project check-up warning for insecure authorization requests.
- Google RISC / Cross-Account Protection support is implemented in the backend and logs events for auditability.
- Existing Kloel accounts are not silently merged with a new social identity. The user must confirm the merge through a one-time magic link sent to the same email address.
- Sensitive People API access is feature-gated and should remain disabled until approval is complete.

## Pre-submission checklist

- `kloel.com` verified in Google Search Console.
- OAuth consent screen links point to the live privacy policy and terms pages.
- Requested scopes in Google Cloud exactly match the scopes documented in the privacy policy.
- `KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL=false` and `NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL=false` in production until approval is granted.
- `GOOGLE_CLIENT_ID` is configured in backend and mirrored to `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in frontend.
- Google project check-up warnings for secure flows and Cross-Account Protection are resolved.
- A preview or production build is live and usable by the reviewer.
