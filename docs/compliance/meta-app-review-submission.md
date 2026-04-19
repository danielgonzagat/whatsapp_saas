# Meta App Review Submission

Last updated: 2026-04-18

## Product summary
Kloel is a multi-tenant SaaS platform that lets businesses connect official Meta channels, authenticate users, manage inbound conversations, and automate commercial workflows. The product uses official Meta APIs and webhooks for Facebook Login, WhatsApp Cloud API, Instagram, Messenger, and account lifecycle callbacks.

Public compliance URLs:

- Privacy Policy: `https://kloel.com/privacy`
- Terms of Service: `https://kloel.com/terms`
- Data deletion instructions: `https://kloel.com/data-deletion`
- Facebook data deletion callback: `https://app.kloel.com/api/auth/facebook/data-deletion`
- Facebook deauthorize callback: `https://app.kloel.com/api/auth/facebook/deauthorize`
- Meta webhook verification endpoint: `https://app.kloel.com/api/webhooks/meta`

## Permission-to-feature mapping

### `email`
Used to identify and authenticate the Kloel user when they choose Facebook Login. The email is used for account linking, transactional communication, and account recovery.

### `public_profile`
Used to retrieve the authenticated user's name and profile image so Kloel can personalize the logged-in workspace experience.

### `business_management`
Used to discover and manage the business assets that the customer explicitly authorizes Kloel to operate, including Meta business ownership context required for onboarding.

### `whatsapp_business_management`
Used to connect WhatsApp Business Accounts, inspect phone number metadata, quality rating, and related WABA configuration surfaces needed to operate official WhatsApp channels.

### `whatsapp_business_messaging`
Used to send and receive WhatsApp Cloud API messages, templates, delivery updates, and conversation activity for the customer's connected business account.

### `pages_messaging`
Used to receive Messenger messages from connected Pages and route them into Kloel's unified inbox.

### `pages_manage_metadata`
Used so Meta can deliver webhook events for Pages and Messenger surfaces that the customer connects to Kloel.

### `instagram_manage_messages`
Used to receive and reply to Instagram Direct messages for connected professional Instagram accounts.

## Reviewer demo script

1. Open `https://kloel.com` and go to the authentication surface on `auth.kloel.com`.
2. Click `Continuar com Facebook`.
3. If the email already exists in Kloel, show the confirmation email arriving and click the one-time account-link magic link.
4. Complete Facebook Login and show the Kloel app session opening successfully.
5. Show that the same user can be matched to an existing Kloel account by email without creating a duplicate user.
6. Navigate to the integrations or marketing/connect surface in the Kloel app.
7. Start the Meta connection flow and explain that Kloel uses the official Meta onboarding / webhook architecture.
8. Navigate to `Settings > Conta` and show the self-service privacy zone with account deletion controls.
9. Show the live compliance links:
   - privacy policy
   - terms
   - data deletion
10. Explain the data deletion callback and deauthorize callback URLs.
11. Show the webhook verification endpoint and note that signature verification is enabled through the Meta app secret.

## Screenshots to capture before submission

- Login screen with the Facebook action visible.
- Successful Facebook-authenticated Kloel session.
- Meta channel connection surface in the app.
- Settings privacy zone with self-service deletion controls.
- Privacy Policy section `Uso de informações da Meta`.
- Data deletion page with Facebook deletion instructions.

## Test account guidance

- Create a dedicated Kloel workspace for review.
- Prepare one test user with a valid email inbox and a populated dashboard.
- If possible, attach a Meta sandbox asset or test business asset to demonstrate the connection flow safely.
- Keep the account free of billing blockers and ensure the app is reachable from the public internet during review.

## Pre-submission checklist

- Meta app dashboard URLs exactly match the live production URLs.
- `META_APP_SECRET`, `META_APP_ID`, and webhook verification token are configured in production.
- JavaScript SDK domains in Meta match `kloel.com`, `www.kloel.com`, `app.kloel.com`, and `auth.kloel.com`.
- Facebook Login valid OAuth redirect URIs match the routes implemented in production.
- Data deletion callback and deauthorize callback return successful responses.
- Privacy policy explicitly names Meta permissions and their purposes.
