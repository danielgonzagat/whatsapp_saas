# Kloel CIA Session Handoff

Updated: 2026-05-12T13:01:27-03:00

## Onde parou exatamente

Wave 0 discovery artifacts are active and W1-W9 have focused code-side slices delivered with evidence, but completion remains blocked by external provider smokes, open dependency-register items, and current merge-repair work in backend/worker owned by another active agent. W1 persists the official channel four-step wizard spine through `Workspace.providerSettings.marketingChannelSetup`; Playwright proves four steps at desktop/mobile widths, product persistence, and Meta disconnect double-confirmation. W2 hardens code-side Meta OAuth URL generation with channel-specific Config IDs/scopes, adds the `facebook` status alias, and rejects unsigned Meta webhook POSTs when `META_APP_SECRET` is configured. W3 hardens TikTok webhook signature handling and adds backend disconnect. W4 delivers code-side Gmail/Microsoft/IMAP mailbox foundations through EMAIL-10, including encrypted token storage, Gmail sync/send, Microsoft OAuth base, IMAP+SMTP validation, suppression checks, and mailbox metrics, while live mailbox smokes remain external. W5/W6 route TikTok/Omnichannel perception toward the same `UnifiedAgentService` and prove owner strategic policy persistence into CIA prompt context. W7/W8 add checkout-paid wallet/chat context and high-risk `ApprovalRequest` gates. On 2026-05-12, after the merge from `origin/main`, this orchestrator recovered the frontend TypeScript gate, restored the official Marketing channel helper module, rewired typed Facebook/TikTok social auth buttons without rendering dead providers, and validated `npm --prefix frontend run typecheck -- --pretty false` plus `npm --prefix frontend test -- kloel-auth-screen.social-buttons.test.tsx`.

## Branch atual e ultimo commit

- Branch: `chore/purga-total-debt`
- HEAD: `8d1175ef7 Merge origin/main into chore/purga-total-debt (PR #276)`
- Note: prior handoff referenced `feat/kloel-cia-convergence`, but the live checkout is currently `chore/purga-total-debt`; do not infer branch state from older docs.

## Gates passados na sessao

- `git fetch origin main --prune`: passed.
- `npm run backend:typecheck`: passed after adding `override` to `ProductionBootstrapLogger.log` in `backend/src/main.ts`.
- `npm run backend:typecheck`: passed again after W1 `marketing/connect/channel-setup` endpoints.
- `npm --prefix frontend run typecheck -- --pretty false 2>&1 | rg "OfficialMarketingChannelPage|marketing/connect.controller" || true`: no matching errors for the W1 changed frontend file.
- `npm --prefix backend test -- marketing-connect.controller.spec.ts --runInBand`: passed.
- `E2E_MARKETING_URL=http://localhost:3000 npm --prefix e2e run test -- specs/marketing-official-channel-wizard.spec.ts --project=chromium`: passed, 4/4 after adding the disconnect confirmation coverage.
- `npm --prefix backend test -- meta-whatsapp.service.spec.ts meta-auth.controller.spec.ts --runInBand`: passed, 13/13.
- `npm --prefix backend test -- meta-webhook.controller.spec.ts meta-whatsapp.service.spec.ts meta-auth.controller.spec.ts --runInBand`: passed, 4 suites / 24 tests.
- `npm run backend:typecheck`: passed after W2 webhook/type narrowing fixes.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/kloel-cia-w2-discovery-manifest.json`: completed run `kloel-cia-w2-discovery-2026-05-11`, 5/5 tasks ok.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/kloel-cia-w3-w6-fleet-manifest.json`: completed run `kloel-cia-w3-w6-2026-05-11`, 6/6 tasks ok.
- `npm --prefix backend test -- tiktok-webhook.controller.spec.ts --runInBand`: passed, 13/13.
- `npm --prefix backend test -- mailbox-token-crypto.spec.ts --runInBand`: passed, 15/15.
- `npm --prefix backend test -- omnichannel.service.spec.ts --runInBand`: passed, 3/3.
- `npm --prefix backend test -- omnichannel.service.spec.ts tiktok-webhook.controller.spec.ts --runInBand`: passed, 19/19.
- `npm --prefix frontend run typecheck -- --pretty false 2>&1 | rg "InboxConversationFilters|inbox-workspace-utils" || true`: no matching errors.
- `npm --prefix backend test -- tiktok-webhook.controller.spec.ts mailbox-token-crypto.spec.ts --runInBand`: passed, 28/28.
- `npx prisma format --schema prisma/schema.prisma && npm run prisma:validate` from `backend/`: passed.
- `npm run backend:typecheck`: passed after W3/W4/W6 changes.
- `npm --prefix backend run prisma:generate`: passed after EMAIL-2.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts marketing-connect.controller.spec.ts --runInBand`: passed, 9/9.
- `npx prettier --check backend/src/marketing/mailbox-gmail-oauth.service.ts backend/src/marketing/mailbox-gmail-oauth.service.spec.ts backend/src/marketing/mailbox-gmail-oauth-callback.controller.ts backend/src/marketing/marketing-connect.controller.ts backend/src/marketing/marketing-connect.controller.spec.ts backend/src/marketing/marketing.module.ts`: passed after formatting.
- `cd backend && npm run prisma:validate`: passed.
- `npm run backend:typecheck`: passed after EMAIL-2.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts marketing-connect.controller.spec.ts --runInBand`: passed after EMAIL-3, 11/11.
- `npm run backend:typecheck`: passed after EMAIL-3.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts marketing-connect.controller.spec.ts --runInBand`: passed after EMAIL-4, 13/13.
- `npx prettier --check backend/src/marketing/mailbox-gmail-oauth.service.ts backend/src/marketing/mailbox-gmail-oauth.service.spec.ts backend/src/marketing/marketing-connect.controller.ts backend/src/marketing/marketing-connect.controller.spec.ts backend/src/marketing/marketing.module.ts`: passed.
- `npm run backend:typecheck`: passed after EMAIL-4.
- `npm --prefix backend test -- unified-agent-actions-messaging.service.spec.ts omnichannel.service.spec.ts mailbox-gmail-oauth.service.spec.ts --runInBand`: passed after EMAIL-5/6, 13/13.
- `npx prettier --check backend/src/kloel/unified-agent.types.ts backend/src/kloel/unified-agent-actions-messaging.service.ts backend/src/kloel/unified-agent-actions-messaging.service.spec.ts backend/src/inbox/omnichannel.service.ts`: passed.
- `npm run backend:typecheck`: passed after EMAIL-5/6.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/kloel-cia-w7-wallet-fleet-manifest.json`: completed run `kloel-cia-w7-wallet-2026-05-11`, 3/3 tasks ok.
- `npm --prefix backend test -- checkout-paid-effects/wallet.spec.ts prisma.service.spec.ts --runInBand`: passed after W7 wallet bridge, 14/14.
- `npm run backend:typecheck`: passed after W7 wallet bridge.
- `npm --prefix backend test -- kloel-chat-tools.service.spec.ts --runInBand`: passed after W7 chat summary context, 19/19.
- `npx prettier --check backend/src/kloel/kloel-chat-tools.service.ts backend/src/kloel/kloel-tool-executor-crm.service.ts backend/src/kloel/kloel-chat-tools.definition.ts backend/src/kloel/kloel-chat-tools.service.spec.ts`: passed.
- `npm run backend:typecheck`: passed after W7 chat summary context.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/kloel-cia-w4-email7-microsoft-manifest.json`: completed 2/3 ok; one read-only task was terminated after hanging post-read and is recorded as rejected/partial evidence only.
- `npm --prefix backend test -- mailbox-microsoft-oauth.service.spec.ts mailbox-gmail-oauth.service.spec.ts marketing-connect.controller.spec.ts marketing.controller.spec.ts --runInBand`: passed after EMAIL-7 Microsoft OAuth base, 21/21.
- `npx prettier --check backend/src/marketing/mailbox-microsoft-oauth.service.ts backend/src/marketing/mailbox-microsoft-oauth.service.spec.ts backend/src/marketing/mailbox-microsoft-oauth-callback.controller.ts backend/src/marketing/marketing-connect.controller.ts backend/src/marketing/marketing-connect.controller.spec.ts backend/src/marketing/marketing.controller.spec.ts backend/src/marketing/marketing.module.ts`: passed.
- `npm run backend:typecheck`: passed after EMAIL-7 Microsoft OAuth base.
- `npm --prefix backend test -- mailbox-imap-smtp.service.spec.ts mailbox-microsoft-oauth.service.spec.ts marketing-connect.controller.spec.ts marketing.controller.spec.ts --runInBand`: passed after EMAIL-8 IMAP+SMTP connection base, 20/20.
- `npx prettier --check backend/src/marketing/mailbox-imap-smtp.service.ts backend/src/marketing/mailbox-imap-smtp.service.spec.ts backend/src/marketing/marketing-connect.controller.ts backend/src/marketing/marketing-connect.controller.spec.ts backend/src/marketing/marketing.controller.spec.ts backend/src/marketing/marketing.module.ts`: passed.
- `npm run backend:typecheck`: passed after EMAIL-8 IMAP+SMTP connection base.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts mailbox-imap-smtp.service.spec.ts marketing-connect.controller.spec.ts marketing.controller.spec.ts --runInBand`: passed after EMAIL-9 proactive Gmail suppression, 23/23.
- `npx prettier --check backend/src/marketing/mailbox-gmail-oauth.service.ts backend/src/marketing/mailbox-gmail-oauth.service.spec.ts backend/src/marketing/mailbox-imap-smtp.service.ts backend/src/marketing/mailbox-imap-smtp.service.spec.ts backend/src/marketing/marketing-connect.controller.ts`: passed.
- `npm run backend:typecheck`: passed after EMAIL-9 proactive Gmail suppression.
- `npm --prefix backend test -- kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 high-risk campaign approval guard, 2/2.
- `npx prettier --check backend/src/kloel/kloel-tool-dispatcher.service.ts backend/src/kloel/kloel-tool-dispatcher.service.spec.ts`: passed.
- `npm run backend:typecheck`: passed after W8 high-risk campaign approval guard.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts mailbox-microsoft-oauth.service.spec.ts mailbox-imap-smtp.service.spec.ts marketing-connect.controller.spec.ts marketing.controller.spec.ts unified-agent-actions-messaging.service.spec.ts omnichannel.service.spec.ts checkout-paid-effects/wallet.spec.ts prisma.service.spec.ts kloel-chat-tools.service.spec.ts kloel-tool-dispatcher.service.spec.ts --runInBand`: passed focused accumulated regression, 11 suites / 69 tests.
- `npm --prefix backend test -- kloel.controller.spec.ts kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 pending approval listing API, 2 suites / 6 tests.
- `npm run backend:typecheck`: passed after W8 pending approval listing API.
- `npx prettier --write backend/src/kloel/kloel.controller.ts backend/src/kloel/kloel.controller.spec.ts`: formatted W8 owner approval decision API changes.
- `npm --prefix backend test -- kloel.controller.spec.ts kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 owner approval decision API, 2 suites / 9 tests.
- `npm run backend:typecheck`: passed after W8 owner approval decision API.
- `npx prettier --check frontend/src/lib/api/kloel.ts frontend/src/components/kloel/dashboard/KloelDashboard.tsx frontend/src/components/kloel/dashboard/KloelDashboard/KloelDashboardView.tsx`: passed after W8 owner chat pending approvals surface.
- `npm --prefix frontend run typecheck -- --pretty false 2>&1 | rg "KloelDashboard|kloel.ts|KloelDashboardView" || true`: no matching errors after W8 owner chat pending approvals surface.
- `npm --prefix backend test -- kloel.controller.spec.ts kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 owner chat pending approvals surface, 2 suites / 9 tests.
- `npx prettier --check backend/src/kloel/kloel.controller.ts backend/src/kloel/kloel.controller.spec.ts backend/src/kloel/kloel-tool-dispatcher.service.ts backend/src/kloel/kloel-tool-dispatcher.service.spec.ts`: passed after W8 approved campaign execution.
- `npm --prefix backend test -- kloel.controller.spec.ts kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 approved campaign execution, 2 suites / 11 tests.
- `npm run backend:typecheck`: passed after W8 approved campaign execution.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts mailbox-microsoft-oauth.service.spec.ts mailbox-imap-smtp.service.spec.ts marketing-connect.controller.spec.ts marketing.controller.spec.ts unified-agent-actions-messaging.service.spec.ts omnichannel.service.spec.ts checkout-paid-effects/wallet.spec.ts prisma.service.spec.ts kloel-chat-tools.service.spec.ts kloel-tool-dispatcher.service.spec.ts kloel.controller.spec.ts --runInBand`: passed accumulated focused backend regression after W8 approval flow, 12 suites / 78 tests.
- `npm run backend:typecheck`: passed after accumulated focused backend regression.
- `npm --prefix frontend run typecheck -- --pretty false 2>&1 | rg "KloelDashboard|kloel.ts|KloelDashboardView" || true`: no matching errors after accumulated focused frontend check.
- `npx prettier --check backend/src/observability/metrics.ts backend/src/marketing/mailbox-gmail-oauth.service.ts backend/src/marketing/mailbox-gmail-oauth.service.spec.ts`: passed after EMAIL-10 Gmail mailbox metrics base.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts metrics.spec.ts --runInBand`: passed after EMAIL-10 Gmail mailbox metrics base, 2 suites / 27 tests.
- `npm run backend:typecheck`: passed after EMAIL-10 Gmail mailbox metrics base.
- `npx prettier --check backend/src/marketing/mailbox-microsoft-oauth.service.ts backend/src/marketing/mailbox-microsoft-oauth.service.spec.ts backend/src/marketing/mailbox-imap-smtp.service.ts backend/src/marketing/mailbox-imap-smtp.service.spec.ts`: passed after EMAIL-10 Microsoft/IMAP connection metrics.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts mailbox-microsoft-oauth.service.spec.ts mailbox-imap-smtp.service.spec.ts metrics.spec.ts --runInBand`: passed after EMAIL-10 Microsoft/IMAP connection metrics, 4 suites / 35 tests.
- `npm run backend:typecheck`: passed after EMAIL-10 Microsoft/IMAP connection metrics.
- `npm --prefix backend test -- mailbox-gmail-oauth.service.spec.ts mailbox-microsoft-oauth.service.spec.ts mailbox-imap-smtp.service.spec.ts marketing-connect.controller.spec.ts marketing.controller.spec.ts unified-agent-actions-messaging.service.spec.ts omnichannel.service.spec.ts checkout-paid-effects/wallet.spec.ts prisma.service.spec.ts kloel-chat-tools.service.spec.ts kloel-tool-dispatcher.service.spec.ts kloel.controller.spec.ts metrics.spec.ts --runInBand`: passed accumulated focused backend regression after EMAIL-10, 13 suites / 98 tests.
- `npm run backend:typecheck`: passed after accumulated focused EMAIL-10 regression.
- `npx prettier --check frontend/src/components/kloel/dashboard/KloelDashboardView.test.tsx frontend/src/components/kloel/dashboard/KloelDashboard.tsx frontend/src/components/kloel/dashboard/KloelDashboard/KloelDashboardView.tsx frontend/src/lib/api/kloel.ts`: passed after W8 owner approval strip frontend test.
- `npm --prefix frontend test -- KloelDashboardView.test.tsx`: passed after W8 owner approval strip frontend test, 1 test.
- `npm --prefix frontend run typecheck -- --pretty false 2>&1 | rg "KloelDashboardView|KloelDashboard|kloel.ts" || true`: no matching errors after W8 owner approval strip frontend test.
- `npm --prefix backend test -- kloel-chat-tools.service.spec.ts kloel-tool-dispatcher.service.spec.ts unified-agent-context.service.spec.ts --runInBand`: passed after W6 strategic policy mutation proof, 3 suites / 25 tests.
- `npm run backend:typecheck`: passed after W6 strategic policy mutation proof and minimal typecheck repairs in admin marketing, NeuroCRM, and flows.
- `npm --prefix backend test -- kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 `change_plan` approval guard, 1 suite / 6 tests.
- `npm run backend:typecheck`: passed after W8 `change_plan` approval guard.
- `npm --prefix frontend run typecheck -- --pretty false`: passed after exact-optional-property and auth syntax fixes.
- `npm --prefix frontend run typecheck -- --pretty false`: passed on 2026-05-12 after frontend merge-drift recovery.
- `npm --prefix frontend test -- kloel-auth-screen.social-buttons.test.tsx`: passed on 2026-05-12, 1 file / 4 tests.
- `npm --prefix frontend run build`: passed on 2026-05-12; Next.js compiled and generated 92 static pages.
- `npm exec eslint -- <changed frontend files>` from `frontend/`: passed on 2026-05-12.
- `npx eslint` on the touched frontend auth/checkout/search/media/history files: passed after local hook-rule fixes.
- `npm run backend:typecheck`: passed after aligning `backend/src/integrations/ads-sync.processor.ts` with the current branch state.
- `npm run typecheck`: passed after backend/frontend/worker typecheck all completed successfully.
- `npm run worker:typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `npm --prefix worker run build`: passed.
- `npm --prefix frontend run build`: passed; Next.js compiled and generated 91 static pages.
- `npm run prisma:validate`: passed.
- `npm run guard:db-push`: passed.
- `npx prettier --write backend/src/kloel/kloel-tool-dispatcher.service.ts backend/src/kloel/kloel-tool-dispatcher.service.spec.ts`: passed after W8 approval prompt correction.
- `npm --prefix backend test -- kloel-tool-dispatcher.service.spec.ts --runInBand`: passed after W8 approval prompt correction, 1 suite / 37 tests.
- `npm run backend:typecheck`: passed after W8 approval prompt correction.
- `npx prettier --write backend/src/payments/connect/connect.controller.ts backend/src/payments/connect/connect.controller.spec.ts backend/src/payments/connect/connect.controller.mocks.ts`: passed after W8 Connect payout approval gate.
- `npm --prefix backend test -- connect.controller.spec.ts connect-payout-approval.service.spec.ts connect-payout.create-payout.spec.ts --runInBand`: passed after W8 Connect payout approval gate, 4 suites / 48 tests.
- `npx prettier --write backend/src/checkout/checkout-payment.service.ts`: passed after restoring checkout charge input type import.
- `npm run backend:typecheck`: passed after W8 Connect payout approval gate and checkout type import restoration.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/batch-10-manifest.json`: completed run `kloel-cia-w8-high-risk-audit-2026-05-11`, 3/3 tasks ok.
- `npx prettier --write backend/src/marketing/email-marketing.controller.ts backend/src/marketing/email-marketing.controller.spec.ts`: passed after W8 email campaign send approval gate.
- `npm --prefix backend test -- email-marketing.controller.spec.ts email-marketing.service.spec.ts --runInBand`: passed after W8 email campaign send approval gate, 2 suites / 20 tests.
- `npx prettier --write backend/src/whatsapp/cia-remote-backlog.helpers.ts backend/src/whatsapp/account-agent.work-item-upsert.ts backend/src/whatsapp/account-agent.work-items.ts backend/src/whatsapp/inbound-processor.inline-autopilot.ts`: passed after typecheck drift fixes.
- `npm run backend:typecheck`: passed after W8 email campaign send approval gate and WhatsApp helper type/syntax repairs.
- `npx prettier --write backend/src/marketing/marketing.controller.ts backend/src/marketing/marketing.controller.email-send.spec.ts`: passed after W8 direct email send approval gate.
- `npm --prefix backend test -- marketing.controller.email-send.spec.ts email-marketing.controller.spec.ts --runInBand`: passed after W8 direct email send approval gate, 2 suites / 6 tests.
- `npm run backend:typecheck`: passed after W8 direct email send approval gate.
- `npx prettier --write backend/src/meta/ads/meta-ads.controller.ts backend/src/meta/ads/meta-ads.controller.spec.ts`: passed after W8 Meta Ads status approval gate.
- `npm --prefix backend test -- meta-ads.controller.spec.ts meta-ads.service.spec.ts --runInBand`: passed after W8 Meta Ads status approval gate, 2 suites / 13 tests.
- `npm run backend:typecheck`: passed after W8 Meta Ads status approval gate.
- `npx prettier --write backend/src/kloel/wallet.controller.ts backend/src/kloel/wallet.controller.spec.ts`: passed after W8 legacy wallet withdrawal approval gate.
- `npm --prefix backend test -- wallet.controller.spec.ts wallet.service.spec.ts --runInBand`: passed after W8 legacy wallet withdrawal approval gate, 4 suites / 46 tests.
- `npm run backend:typecheck`: passed after W8 legacy wallet withdrawal approval gate.
- `npm --prefix backend test -- kloel-tool-dispatcher.service.spec.ts kloel.controller.spec.ts connect.controller.spec.ts connect-payout-approval.service.spec.ts wallet.controller.spec.ts email-marketing.controller.spec.ts marketing.controller.email-send.spec.ts meta-ads.controller.spec.ts --runInBand`: passed accumulated W8 approval-gates focused regression, 10 suites / 100 tests.
- `npm run backend:typecheck`: passed after accumulated W8 approval-gates focused regression.
- `npm run typecheck`: initially failed in `backend/src/common/observability/correlation-id.middleware.ts` and `backend/src/admin/operations/dlq.controller.ts`; both were fixed with minimal typed changes, then aggregate backend/frontend/worker typecheck passed.
- `npm --prefix backend test -- mass-send.controller.spec.ts mass-send.service.spec.ts --runInBand`: passed after W8 WhatsApp mass campaign approval gate, 2 suites / 6 tests.
- `npm run backend:typecheck`: passed after W8 WhatsApp mass campaign approval gate.
- `npm --prefix backend test -- sales.controller.spec.ts --runInBand`: passed after W8 owner sale refund approval gate, 1 suite / 5 tests.
- `npm --prefix backend test -- kloel-tool-dispatcher.service.spec.ts kloel.controller.spec.ts connect.controller.spec.ts connect-payout-approval.service.spec.ts wallet.controller.spec.ts email-marketing.controller.spec.ts marketing.controller.email-send.spec.ts meta-ads.controller.spec.ts mass-send.controller.spec.ts mass-send.service.spec.ts sales.controller.spec.ts admin-transactions.service.spec.ts --runInBand`: passed expanded W8 approval/refund regression, 14 suites / 114 tests.
- `npm run backend:typecheck`: passed after W8 owner sale refund approval gate.
- `npm run typecheck`: passed after W8 owner sale refund approval gate, including backend/frontend/worker typecheck.
- `npm --prefix backend test -- email-marketing.service.spec.ts email-marketing.controller.spec.ts --runInBand`: passed after W8 email campaign worker approval defense, 2 suites / 21 tests.
- `npm run backend:typecheck`: passed after removing unused logger fields found by the worker-defense slice.
- `npm run typecheck`: passed after W8 email campaign worker approval defense, including backend/frontend/worker typecheck.
- `npm --prefix frontend test -- KloelDashboardView.test.tsx`: passed W8 owner approval strip frontend validation, 1 test.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/batch-11-manifest.json`: completed run `kloel-cia-w8-w9-next-gap-audit-2026-05-11`, 1/3 ok; accepted `admin-compliance-audit`, rejected timeout/SIGKILL outputs for webhook and golden-path audits as partial evidence only.
- `npm --prefix backend test -- data-delete.controller.spec.ts data-export.controller.spec.ts gdpr.controller.spec.ts gdpr.service.spec.ts --runInBand`: passed after GDPR compatibility route delegation, 4 suites / 39 tests.
- `npm run backend:typecheck`: passed after GDPR compatibility route delegation.
- `npx prettier --write backend/src/admin/users/admin-users.service.ts backend/src/admin/users/admin-users.service.spec.ts`: passed after admin session revocation on IAM changes.
- `npm --prefix backend test -- admin-users.service.spec.ts admin-sessions.service.spec.ts --runInBand`: passed after admin session revocation on IAM changes, 2 suites / 24 tests.
- `npm run backend:typecheck`: passed after admin session revocation on IAM changes.
- `npx prettier --write backend/src/gdpr/gdpr.controller.spec.ts backend/src/gdpr/gdpr.service.ts backend/src/gdpr/gdpr.service.spec.ts`: passed after GDPR owner chat export/anonymization.
- `npm --prefix backend test -- gdpr.service.spec.ts gdpr.controller.spec.ts data-delete.controller.spec.ts data-export.controller.spec.ts --runInBand`: passed after GDPR owner chat export/anonymization, 4 suites / 40 tests.
- `npm run backend:typecheck`: passed after GDPR owner chat export/anonymization.
- `npx prettier --write backend/src/gdpr/gdpr.controller.spec.ts backend/src/gdpr/gdpr.service.ts backend/src/gdpr/gdpr.service.spec.ts`: passed after GDPR conversation/message user unlink.
- `npm --prefix backend test -- gdpr.service.spec.ts gdpr.controller.spec.ts data-delete.controller.spec.ts data-export.controller.spec.ts --runInBand`: passed after GDPR conversation/message user unlink, 4 suites / 41 tests.
- `npm run backend:typecheck`: passed after GDPR conversation/message user unlink.
- `npm run typecheck`: passed after W8 admin/GDPR hardening, including backend/frontend/worker.
- `npm --prefix frontend-admin run typecheck`: passed for admin frontend local proof.
- `npm --prefix frontend-admin test -- --run`: passed for admin frontend local proof, 2 files / 13 tests.
- `NEXT_PUBLIC_ADMIN_API_URL=http://localhost:3001 npm --prefix frontend-admin run build`: passed for admin frontend local proof, generated 21 app routes; non-failing warning about Next.js `middleware` convention deprecation.
- `npm --prefix frontend-admin run typecheck`: passed after admin frontend Next 16 proxy migration.
- `npm --prefix frontend-admin test -- --run`: passed after admin frontend Next 16 proxy migration, 2 files / 13 tests.
- `NEXT_PUBLIC_ADMIN_API_URL=http://localhost:3001 npm --prefix frontend-admin run build`: passed after admin frontend Next 16 proxy migration, generated 21 app routes and no longer emitted the deprecated `middleware` convention warning.
- `npx prettier --write backend/src/marketing/email-marketing-webhook.controller.ts backend/src/marketing/email-marketing-webhook.controller.spec.ts`: passed after email marketing webhook secret enforcement.
- `npm --prefix backend test -- email-marketing-webhook.controller.spec.ts email-marketing.service.spec.ts --runInBand`: passed after email marketing webhook secret enforcement, 2 suites / 23 tests.
- `npm run backend:typecheck`: passed after email marketing webhook secret enforcement.
- `node scripts/orchestration/opencode-fleet.mjs .opencode-prompts/batch-12-manifest.json`: completed run `kloel-cia-w9-readiness-audit-2026-05-11`, 2/2 tasks ok; outputs reviewed and accepted for W9 readiness triage.
- `npx prettier --write backend/src/config/production-startup-guard.ts backend/src/config/production-startup-guard.spec.ts backend/src/main.ts`: passed after production webhook secret startup gate.
- `npm --prefix backend test -- production-startup-guard.spec.ts email-marketing-webhook.controller.spec.ts meta-webhook.controller.spec.ts tiktok-webhook.controller.spec.ts mercado-pago-webhook.controller.spec.ts --runInBand`: passed after production webhook secret startup gate, 6 suites / 40 tests.
- `npm run backend:typecheck`: passed after production webhook secret startup gate.
- `npm run typecheck`: passed after production webhook secret startup gate, including backend/frontend/worker.
- `npx prettier --write backend/src/prisma/prisma.service.spec.ts`: passed after W9 checkout paid effects integration proof.
- `npm --prefix backend test -- prisma.service.spec.ts wallet.spec.ts --runInBand`: passed after W9 checkout paid effects integration proof, 3 suites / 23 tests.
- `npm run backend:typecheck`: passed after W9 checkout paid effects integration proof.
- `npx prettier --write backend/src/webhooks/webhooks.service.ts backend/src/webhooks/webhooks.service.spec.ts backend/src/webhooks/webhook-dispatcher.service.ts backend/src/webhooks/webhook-dispatcher.service.spec.ts`: passed after W9 webhook queue correlation propagation.
- `npm --prefix backend test -- webhooks.service.spec.ts webhook-dispatcher.service.spec.ts --runInBand`: passed after W9 webhook queue correlation propagation, 2 suites / 7 tests.
- `npx prettier --write backend/src/pipeline/pipeline.service.ts backend/src/pipeline/pipeline.service.spec.ts`: passed after fixing required `Deal.contactId` drift.
- `npm --prefix backend test -- webhooks.service.spec.ts webhook-dispatcher.service.spec.ts pipeline.service.spec.ts --runInBand`: passed after W9 webhook queue correlation propagation and pipeline drift fix, 3 suites / 21 tests.
- `npx prettier --write backend/src/affiliate/affiliate.controller.ts backend/src/notifications/welcome-onboarding-email.service.ts`: passed after affiliate/onboarding type drift fixes.
- `npm --prefix backend test -- welcome-onboarding-email.service.spec.ts pipeline.service.spec.ts webhooks.service.spec.ts webhook-dispatcher.service.spec.ts --runInBand`: passed after W9 webhook queue correlation propagation and drift fixes, 4 suites / 25 tests.
- `npm run backend:typecheck`: initially failed on affiliate/onboarding/pipeline drift, then passed after fixes.
- `npx prettier --write worker/processor-base.ts worker/test/dlq-routing.spec.ts`: passed after W9 worker correlation preservation.
- `npm --prefix worker test -- dlq-routing.spec.ts`: passed after W9 worker correlation preservation, 1 file / 15 tests.
- `npm run worker:typecheck`: passed after W9 worker correlation preservation.
- `npx prettier --write backend/src/marketplace/marketplace.service.ts backend/src/marketplace/marketplace.service.spec.ts`: passed after marketplace Prisma checked-create drift fix.
- `npm --prefix backend test -- marketplace.service.spec.ts --runInBand`: passed after marketplace drift fix, 1 suite / 6 tests.
- `npm run backend:typecheck`: passed after marketplace drift fix.
- `npm run typecheck`: passed after W9 worker correlation preservation and typecheck recovery, including backend/frontend/worker.
- `npx prettier --write backend/src/kloel/unified-agent.service.spec.ts`: passed after W9 CIA inbound-to-outbound local trace.
- `npm --prefix backend test -- unified-agent.service.spec.ts omnichannel.service.spec.ts --runInBand`: passed after W9 CIA inbound-to-outbound local trace, 2 suites / 13 tests.
- `npm run backend:typecheck`: passed after W9 CIA inbound-to-outbound local trace.
- `npm run typecheck`: passed after W9 CIA inbound-to-outbound local trace, including backend/frontend/worker.
- OpenCode installed: `1.14.48`.

## Gates falhando ainda

- `npm run lint`: fails during backend lint with 3350 errors, mostly broad `@typescript-eslint/no-unsafe-*` debt in backend specs/tests/admin surfaces.
- `npm --prefix frontend run lint`: fails with 117 errors, mostly broad `react-hooks/set-state-in-effect` debt in unrelated frontend routes/components.
- `npm run check:governance`: failed because the pre-existing worktree has protected governance files modified, including `.codacy.yml`, `.github/workflows/ci-cd.yml`, `.husky/*`, `AGENTS.md`, `package.json`, `ratchet.json`, `ops/**`, `scripts/ops/**`, eslint configs, and model library files.
- Live Railway/Vercel env inventory: blocked because `RAILWAY_TOKEN` and `VERCEL_TOKEN` are not set in this shell.

## Subagents ativos no momento da pausa

An external merge-repair agent is active outside this orchestrator and owns the dirty backend/worker repair surface. It has four OpenCode-related node processes visible and `/tmp/merge-main.log` currently reports that TS2307 import errors were fixed, worker was clean earlier, backend errors were reduced, and the agent is verifying all four projects. Do not edit backend/worker files until that agent exits or hands off.

## Subagents concluidos nao revisados

`kloel-cia-batch-15-frontend-typecheck-2026-05-12` is rejected as a subagent-complete delivery because task `A-frontend-typecheck-recovery` ended with SIGKILL after 600s. Its partial frontend diff was manually reviewed, completed, formatted and validated by this orchestrator. Older accepted/rejected fleet statuses from 2026-05-11 remain as previously recorded.

## Bloqueios externos vigentes

- `EXT-ENV-001`: missing `RAILWAY_TOKEN` and `VERCEL_TOKEN` for live env inventory.
- Meta/TikTok/Google/Microsoft/payment/test-account dependencies are registered in `kloel-cia-external-dependencies.md`.
- Obsidian HUD/mirror is currently stale for prioritization: `00-HUD` notes were generated on 2026-05-06, `node scripts/obsidian-graph-lens.mjs --status` reports active graph lens `custom`, and the mirror daemon log shows `ERR_MODULE_NOT_FOUND` for `scripts/__parts__/obsidian-mirror-daemon-utils.mjs`. Use it as historical context only until the mirror pipeline is repaired/refreshed.

## Proxima acao exata

Keep the backend/worker merge-repair surface reserved for the active external agent until it exits. While it runs, use the Obsidian graph/mirror and docs artifacts to choose disjoint frontend, UX, evidence, and provider-smoke runbook work. After the external agent finishes, verify `git status`, inspect its diff, run the aggregate typecheck, then update the evidence ledger and only then decide whether to continue lint/security/readiness reduction or open a new narrow OpenCode batch.
