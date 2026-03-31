# PULSE REPORT — 2026-03-31T21:19:46.510Z

## Health Score: 85/100
`█████████████████░░░` 85%

## Summary

| Metric | Total | Issues |
|--------|-------|--------|
| UI Elements | 809 | 0 dead handlers |
| API Calls | 427 | 0 no backend |
| Backend Routes | 630 | 0 empty |
| Prisma Models | 107 | 36 orphaned |
| Facades | 0 | 0 critical, 0 warning |
| Proxy Routes | 36 | 0 no upstream |

## Breaks (285 total)

### Orphaned Prisma Models (36)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| WARNING | backend/prisma/schema.prisma:295 | Model ContactInsight has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:337 | Model Variable has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:583 | Model Vector has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:596 | Model Integration has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:611 | Model MonitoredGroup has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:631 | Model GroupMember has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:643 | Model BannedKeyword has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:685 | Model ExternalPaymentLink has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1028 | Model AutonomyRun has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1042 | Model AutonomyExecution has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1066 | Model AgentWorkItem has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1097 | Model ApprovalRequest has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1118 | Model InputCollectionSession has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1137 | Model AccountProofSnapshot has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1165 | Model ConversationProofSnapshot has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1206 | Model WebhookEvent has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1234 | Model Persona has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1417 | Model KloelConversation has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1436 | Model ChatThread has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1447 | Model ChatMessage has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1620 | Model ProductCheckout has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1676 | Model ProductCommission has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1720 | Model ProductCampaign has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1772 | Model MemberArea has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1807 | Model MemberEnrollment has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1826 | Model MemberModule has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1843 | Model MemberLesson has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1868 | Model AffiliateProduct has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1893 | Model AffiliateRequest has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1907 | Model AffiliateLink has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1926 | Model KloelSite has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:1945 | Model KloelDesign has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:2059 | Model Payment has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:2164 | Model WalletAnticipation has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:2614 | Model Webinar has no service or controller accessing it |
| WARNING | backend/prisma/schema.prisma:2629 | Model MetaConnection has no service or controller accessing it |

### Backend Routes Not Called by Frontend (249)

| Severity | File:Line | Description |
|----------|-----------|-------------|
| INFO | backend/src/affiliate/affiliate.controller.ts:278 | GET /affiliate/my-links is not called by any frontend code |
| INFO | backend/src/affiliate/affiliate.controller.ts:365 | PUT /affiliate/config/:productId is not called by any frontend code |
| INFO | backend/src/affiliate/affiliate.controller.ts:421 | POST /affiliate/ai-search is not called by any frontend code |
| INFO | backend/src/affiliate/affiliate.controller.ts:438 | POST /affiliate/suggest is not called by any frontend code |
| INFO | backend/src/affiliate/affiliate.controller.ts:460 | POST /affiliate/saved/:productId is not called by any frontend code |
| INFO | backend/src/affiliate/affiliate.controller.ts:479 | DELETE /affiliate/saved/:productId is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:34 | POST /ai/assistant/analyze-sentiment is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:39 | POST /ai/assistant/summarize is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:44 | POST /ai/assistant/suggest is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:58 | POST /ai/assistant/pitch is not called by any frontend code |
| INFO | backend/src/ai-brain/knowledge-base.controller.ts:99 | POST /ai/kb/upload is not called by any frontend code |
| INFO | backend/src/analytics/analytics.controller.ts:40 | GET /analytics/smart-time is not called by any frontend code |
| INFO | backend/src/analytics/analytics.controller.ts:49 | GET /analytics/stats is not called by any frontend code |
| INFO | backend/src/analytics/analytics.controller.ts:65 | GET /analytics/flow/:id is not called by any frontend code |
| INFO | backend/src/analytics/analytics.controller.ts:84 | GET /analytics/reports is not called by any frontend code |
| INFO | backend/src/audio/audio.controller.ts:8 | POST /audio/synthesize is not called by any frontend code |
| INFO | backend/src/audit/audit.controller.ts:15 | GET /audit is not called by any frontend code |
| INFO | backend/src/auth/auth.controller.ts:225 | POST /auth/send-verification is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:73 | GET /autopilot/actions is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:248 | POST /autopilot/money-machine is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:275 | POST /autopilot/ask is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:284 | GET /autopilot/runtime-config is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:314 | POST /autopilot/process is not called by any frontend code |
| INFO | backend/src/autopilot/autopilot.controller.ts:341 | POST /autopilot/send is not called by any frontend code |
| INFO | backend/src/autopilot/segmentation.controller.ts:34 | GET /segmentation/:workspaceId/preset/:presetName is not called by any frontend code |
| INFO | backend/src/autopilot/segmentation.controller.ts:59 | POST /segmentation/:workspaceId/query is not called by any frontend code |
| INFO | backend/src/autopilot/segmentation.controller.ts:114 | GET /segmentation/:workspaceId/contact/:contactId/score is not called by any frontend code |
| INFO | backend/src/billing/billing.controller.ts:65 | GET /billing/subscription is not called by any frontend code |
| INFO | backend/src/campaigns/campaigns.controller.ts:32 | GET /campaigns/:id is not called by any frontend code |
| INFO | backend/src/campaigns/campaigns.controller.ts:56 | POST /campaigns/:id/pause is not called by any frontend code |
| INFO | backend/src/campaigns/campaigns.controller.ts:62 | POST /campaigns/:id/darwin/variants is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:51 | GET /checkout/public/r/:code is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:56 | GET /checkout/public/:slug is not called by any frontend code |
| INFO | backend/src/checkout/checkout-public.controller.ts:106 | POST /checkout/public/shipping is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:95 | GET /checkout/products/:id is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:101 | PUT /checkout/products/:id is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:107 | DELETE /checkout/products/:id is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:162 | GET /checkout/plans/:planId/bumps is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:192 | GET /checkout/plans/:planId/upsells is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:246 | POST /checkout/config/:configId/pixels is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:251 | PUT /checkout/pixels/:id is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:256 | DELETE /checkout/pixels/:id is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:263 | GET /checkout/orders is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:279 | GET /checkout/orders/:id is not called by any frontend code |
| INFO | backend/src/checkout/checkout.controller.ts:284 | PATCH /checkout/orders/:id/status is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:13 | GET /cia/surface/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:18 | GET /cia/human-tasks/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:23 | GET /cia/account-runtime/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:28 | GET /cia/capability-registry is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:33 | GET /cia/conversation-action-registry is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:38 | GET /cia/account-approvals/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:43 | GET /cia/account-input-sessions/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:48 | GET /cia/account-work-items/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:53 | GET /cia/account-proof/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:58 | GET /cia/cycle-proof/:workspaceId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:63 | GET /cia/conversation-proof/:workspaceId/:conversationId is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:82 | POST /cia/human-tasks/:workspaceId/:taskId/approve is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:91 | POST /cia/human-tasks/:workspaceId/:taskId/reject is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:99 | POST /cia/account-approvals/:workspaceId/:approvalId/approve is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:107 | POST /cia/account-approvals/:workspaceId/:approvalId/reject is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:115 | POST /cia/account-input-sessions/:workspaceId/:sessionId/respond is not called by any frontend code |
| INFO | backend/src/cia/cia.controller.ts:128 | POST /cia/conversations/:workspaceId/:conversationId/resume is not called by any frontend code |
| INFO | backend/src/copilot/copilot.controller.ts:13 | POST /copilot/suggest is not called by any frontend code |
| INFO | backend/src/copilot/copilot.controller.ts:33 | POST /copilot/suggest-multiple is not called by any frontend code |
| INFO | backend/src/crm/neuro-crm.controller.ts:15 | POST /crm/neuro/analyze/:contactId is not called by any frontend code |
| INFO | backend/src/crm/neuro-crm.controller.ts:21 | GET /crm/neuro/next-best/:contactId is not called by any frontend code |
| INFO | backend/src/crm/neuro-crm.controller.ts:27 | GET /crm/neuro/clusters is not called by any frontend code |
| INFO | backend/src/crm/neuro-crm.controller.ts:33 | POST /crm/neuro/simulate is not called by any frontend code |
| INFO | backend/src/flows/flow-optimizer.controller.ts:14 | POST /flows/ai/optimize/:flowId is not called by any frontend code |
| INFO | backend/src/flows/flow-template.controller.ts:11 | GET /flow-templates/public is not called by any frontend code |
| INFO | backend/src/flows/flow-template.controller.ts:16 | GET /flow-templates is not called by any frontend code |
| INFO | backend/src/flows/flow-template.controller.ts:22 | GET /flow-templates/:id is not called by any frontend code |
| INFO | backend/src/flows/flow-template.controller.ts:27 | POST /flow-templates is not called by any frontend code |
| INFO | backend/src/flows/flow-template.controller.ts:51 | POST /flow-templates/:id/download is not called by any frontend code |
| INFO | backend/src/flows/flow-template.controller.ts:56 | POST /flow-templates/seed/recommended is not called by any frontend code |
| INFO | backend/src/followup/followup.controller.ts:52 | PATCH /followups/:id is not called by any frontend code |
| INFO | backend/src/growth/growth.controller.ts:13 | POST /growth/money-machine/activate is not called by any frontend code |
| INFO | backend/src/growth/growth.controller.ts:19 | POST /growth/qr/whatsapp is not called by any frontend code |
| INFO | backend/src/growth/money-machine.controller.ts:14 | POST /growth/money-machine/activate is not called by any frontend code |
| INFO | backend/src/growth/money-machine.controller.ts:22 | GET /growth/money-machine/report is not called by any frontend code |
| INFO | backend/src/kloel/ad-rules.controller.ts:63 | PUT /ad-rules/:id is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:35 | POST /kloel/audio/:workspaceId/transcribe is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:74 | POST /kloel/audio/:workspaceId/transcribe-url is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:98 | POST /kloel/audio/:workspaceId/transcribe-base64 is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:122 | POST /kloel/audio/:workspaceId/text-to-speech is not called by any frontend code |
| INFO | backend/src/kloel/audio.controller.ts:150 | POST /kloel/audio/:workspaceId/text-to-speech-base64 is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:45 | GET /diag is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:55 | GET /diag/full is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:107 | GET /diag/workspace/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:173 | GET /diag/metrics is not called by any frontend code |
| INFO | backend/src/kloel/diagnostics.controller.ts:225 | GET /diag/errors is not called by any frontend code |
| INFO | backend/src/kloel/external-payment.controller.ts:175 | POST /kloel/external-payments/:workspaceId/tracking is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:132 | POST /kloel/memory/save is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:152 | POST /kloel/pdf/process is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:270 | POST /kloel/onboarding/:workspaceId/start is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:287 | POST /kloel/onboarding/:workspaceId/chat is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:308 | POST /kloel/onboarding/:workspaceId/chat/stream is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:328 | GET /kloel/onboarding/:workspaceId/status is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:342 | GET /kloel/followups is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:352 | GET /kloel/followups/:contactId is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:458 | POST /kloel/data/request-deletion is not called by any frontend code |
| INFO | backend/src/kloel/kloel.controller.ts:495 | GET /kloel/data/export is not called by any frontend code |
| INFO | backend/src/kloel/leads.controller.ts:11 | GET /kloel/leads/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/memory.controller.ts:115 | DELETE /kloel/memory/:workspaceId/:key is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:24 | POST /mercadopago/:workspaceId/connect is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:44 | POST /mercadopago/:workspaceId/disconnect is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:52 | GET /mercadopago/:workspaceId/status is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:59 | POST /mercadopago/:workspaceId/pix is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:75 | POST /mercadopago/:workspaceId/preference is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:100 | GET /mercadopago/:workspaceId/payments is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:116 | GET /mercadopago/:workspaceId/payment/:paymentId is not called by any frontend code |
| INFO | backend/src/kloel/mercadopago.controller.ts:130 | POST /mercadopago/:workspaceId/refund/:paymentId is not called by any frontend code |
| INFO | backend/src/kloel/onboarding.controller.ts:24 | POST /kloel/onboarding-legacy/start/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/onboarding.controller.ts:32 | POST /kloel/onboarding-legacy/respond/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/onboarding.controller.ts:43 | GET /kloel/onboarding-legacy/status/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/payment.controller.ts:97 | GET /kloel/payments/report/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/payment.controller.ts:107 | GET /kloel/payments/status is not called by any frontend code |
| INFO | backend/src/kloel/pdf-processor.controller.ts:109 | POST /kloel/pdf/:workspaceId/text is not called by any frontend code |
| INFO | backend/src/kloel/product-sub-resources.controller.ts:91 | DELETE /products/:productId/plans/:planId is not called by any frontend code |
| INFO | backend/src/kloel/product-sub-resources.controller.ts:126 | PUT /products/:productId/checkouts/:checkoutId is not called by any frontend code |
| INFO | backend/src/kloel/product-sub-resources.controller.ts:174 | POST /products/:productId/coupons/validate is not called by any frontend code |
| INFO | backend/src/kloel/product-sub-resources.controller.ts:231 | PUT /products/:productId/urls/:urlId is not called by any frontend code |
| INFO | backend/src/kloel/product-sub-resources.controller.ts:374 | PUT /products/:productId/commissions/:commissionId is not called by any frontend code |
| INFO | backend/src/kloel/product.controller.ts:333 | POST /products/import is not called by any frontend code |
| INFO | backend/src/kloel/sales.controller.ts:320 | PUT /sales/orders/:id/return is not called by any frontend code |
| INFO | backend/src/kloel/sales.controller.ts:344 | POST /sales/orders/alerts/generate is not called by any frontend code |
| INFO | backend/src/kloel/sales.controller.ts:351 | POST /sales/orders/alerts/:id/resolve is not called by any frontend code |
| INFO | backend/src/kloel/sales.controller.ts:362 | GET /sales/:id is not called by any frontend code |
| INFO | backend/src/kloel/smart-payment.controller.ts:81 | POST /kloel/payment/:workspaceId/create is not called by any frontend code |
| INFO | backend/src/kloel/smart-payment.controller.ts:118 | POST /kloel/payment/:workspaceId/negotiate is not called by any frontend code |
| INFO | backend/src/kloel/smart-payment.controller.ts:150 | GET /kloel/payment/:workspaceId/recovery/:paymentId is not called by any frontend code |
| INFO | backend/src/kloel/unified-agent.controller.ts:20 | POST /kloel/agent/:workspaceId/process is not called by any frontend code |
| INFO | backend/src/kloel/unified-agent.controller.ts:60 | POST /kloel/agent/:workspaceId/simulate is not called by any frontend code |
| INFO | backend/src/kloel/upload.controller.ts:136 | POST /kloel/upload/multiple is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:125 | GET /kloel/wallet/:workspaceId/bank-accounts is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:136 | POST /kloel/wallet/:workspaceId/bank-accounts is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:156 | DELETE /kloel/wallet/:workspaceId/bank-accounts/:id is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:166 | GET /kloel/wallet/:workspaceId/anticipations is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:187 | GET /kloel/wallet/:workspaceId/monthly is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:236 | GET /kloel/wallet/:workspaceId/chart is not called by any frontend code |
| INFO | backend/src/kloel/wallet.controller.ts:265 | GET /kloel/wallet/:workspaceId/withdrawals is not called by any frontend code |
| INFO | backend/src/kloel/webinar.controller.ts:43 | PUT /webinars/:id is not called by any frontend code |
| INFO | backend/src/kloel/webinar.controller.ts:57 | DELETE /webinars/:id is not called by any frontend code |
| INFO | backend/src/kloel/whatsapp-brain.controller.ts:82 | POST /kloel/whatsapp/simulate/:workspaceId is not called by any frontend code |
| INFO | backend/src/kloel/whatsapp-brain.controller.ts:99 | GET /kloel/whatsapp/status is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:24 | PUT /kyc/profile is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:29 | POST /kyc/profile/avatar is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:42 | PUT /kyc/fiscal is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:54 | POST /kyc/documents/upload is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:60 | DELETE /kyc/documents/:id is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:72 | PUT /kyc/bank is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:79 | POST /kyc/security/change-password is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:96 | POST /kyc/submit is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:103 | POST /kyc/auto-check is not called by any frontend code |
| INFO | backend/src/kyc/kyc.controller.ts:108 | POST /kyc/:agentId/approve is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:28 | POST /launch/launcher is not called by any frontend code |
| INFO | backend/src/launch/launch.controller.ts:37 | POST /launch/launcher/:id/groups is not called by any frontend code |
| INFO | backend/src/marketing/marketing.controller.ts:67 | GET /marketing/channels is not called by any frontend code |
| INFO | backend/src/marketplace/marketplace.controller.ts:19 | GET /marketplace/templates is not called by any frontend code |
| INFO | backend/src/mass-send/mass-send.controller.ts:20 | POST /campaign/start is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:46 | POST /media/video is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:54 | GET /media/job/:id is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:106 | GET /media/documents/:idOrName/file is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:127 | GET /media/documents/:idOrName is not called by any frontend code |
| INFO | backend/src/media/media.controller.ts:136 | DELETE /media/documents/:id is not called by any frontend code |
| INFO | backend/src/media/video.controller.ts:8 | GET /media/video/ping is not called by any frontend code |
| INFO | backend/src/member-area/member-area.controller.ts:838 | GET /member-areas/:id/students is not called by any frontend code |
| INFO | backend/src/member-area/member-area.controller.ts:891 | PUT /member-areas/:id/students/:studentId is not called by any frontend code |
| INFO | backend/src/meta/ads/meta-ads.controller.ts:21 | GET /meta/ads/campaigns is not called by any frontend code |
| INFO | backend/src/meta/ads/meta-ads.controller.ts:31 | PATCH /meta/ads/campaigns/:id/status is not called by any frontend code |
| INFO | backend/src/meta/ads/meta-ads.controller.ts:45 | GET /meta/ads/insights/account is not called by any frontend code |
| INFO | backend/src/meta/ads/meta-ads.controller.ts:62 | GET /meta/ads/insights/daily is not called by any frontend code |
| INFO | backend/src/meta/ads/meta-ads.controller.ts:79 | GET /meta/ads/leads is not called by any frontend code |
| INFO | backend/src/meta/ads/meta-ads.controller.ts:89 | GET /meta/ads/leads/:formId is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:31 | GET /meta/instagram/media is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:64 | POST /meta/instagram/publish/photo is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:84 | GET /meta/instagram/media/:id/comments is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:94 | POST /meta/instagram/comments/:id/reply is not called by any frontend code |
| INFO | backend/src/meta/instagram/instagram.controller.ts:108 | POST /meta/instagram/messages/send is not called by any frontend code |
| INFO | backend/src/meta/messenger/messenger.controller.ts:20 | POST /meta/messenger/send is not called by any frontend code |
| INFO | backend/src/meta/messenger/messenger.controller.ts:53 | GET /meta/messenger/conversations is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:31 | GET /ops/queues is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:36 | GET /ops/queues/:name/dlq is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:51 | POST /ops/queues/:name/dlq/retry is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:67 | POST /ops/queues/:name/dlq/purge is not called by any frontend code |
| INFO | backend/src/ops/ops.controller.ts:102 | GET /ops/queues/billing/suspended is not called by any frontend code |
| INFO | backend/src/partnerships/partnerships.controller.ts:79 | GET /partnerships/affiliates/:id/performance is not called by any frontend code |
| INFO | backend/src/partnerships/partnerships.controller.ts:90 | GET /partnerships/chat/:partnerId/messages is not called by any frontend code |
| INFO | backend/src/pipeline/pipeline.controller.ts:23 | GET /pipeline is not called by any frontend code |
| INFO | backend/src/pipeline/pipeline.controller.ts:32 | POST /pipeline/deals is not called by any frontend code |
| INFO | backend/src/pipeline/pipeline.controller.ts:39 | PUT /pipeline/deals/:id/stage is not called by any frontend code |
| INFO | backend/src/public-api/public-api.controller.ts:19 | POST /api/v1/messages is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:21 | GET /reports/vendas is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:26 | GET /reports/vendas/summary is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:31 | GET /reports/vendas/daily is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:36 | GET /reports/afterpay is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:41 | GET /reports/churn is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:46 | GET /reports/abandonos is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:51 | GET /reports/afiliados is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:56 | GET /reports/indicadores is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:61 | GET /reports/assinaturas is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:66 | GET /reports/indicadores-produto is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:71 | GET /reports/recusa is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:76 | GET /reports/origem is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:81 | POST /reports/ad-spend is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:86 | GET /reports/ad-spend is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:91 | GET /reports/metricas is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:96 | GET /reports/estornos is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:101 | GET /reports/chargeback is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:107 | POST /reports/send-email is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:134 | POST /reports/nps is not called by any frontend code |
| INFO | backend/src/reports/reports.controller.ts:148 | GET /reports/nps is not called by any frontend code |
| INFO | backend/src/scrapers/scrapers.controller.ts:41 | POST /scrapers/jobs is not called by any frontend code |
| INFO | backend/src/scrapers/scrapers.controller.ts:56 | GET /scrapers/jobs/:id is not called by any frontend code |
| INFO | backend/src/scrapers/scrapers.controller.ts:66 | POST /scrapers/jobs/:id/import is not called by any frontend code |
| INFO | backend/src/team/team.controller.ts:22 | GET /team is not called by any frontend code |
| INFO | backend/src/team/team.controller.ts:30 | POST /team/invite is not called by any frontend code |
| INFO | backend/src/team/team.controller.ts:43 | DELETE /team/invite/:id is not called by any frontend code |
| INFO | backend/src/team/team.controller.ts:51 | DELETE /team/member/:id is not called by any frontend code |
| INFO | backend/src/video/video.controller.ts:12 | POST /video/create is not called by any frontend code |
| INFO | backend/src/video/video.controller.ts:27 | GET /video/job/:id is not called by any frontend code |
| INFO | backend/src/voice/voice.controller.ts:28 | POST /voice/profiles is not called by any frontend code |
| INFO | backend/src/voice/voice.controller.ts:37 | GET /voice/profiles is not called by any frontend code |
| INFO | backend/src/voice/voice.controller.ts:48 | POST /voice/generate is not called by any frontend code |
| INFO | backend/src/webhooks/webhooks.controller.ts:101 | POST /hooks/finance/:workspaceId/recent is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:295 | GET /whatsapp-api/session/diagnostics is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:300 | POST /whatsapp-api/session/force-check is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:314 | POST /whatsapp-api/session/force-reconnect is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:331 | POST /whatsapp-api/session/repair-config is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:349 | POST /whatsapp-api/session/bootstrap is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:358 | POST /whatsapp-api/session/link is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:410 | POST /whatsapp-api/session/claim is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:536 | POST /whatsapp-api/session/backlog/start is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:548 | POST /whatsapp-api/cia/conversations/:conversationId/resume is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:559 | GET /whatsapp-api/cia/intelligence is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:855 | GET /whatsapp-api/session/proofs is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:989 | GET /whatsapp-api/chats/:chatId/messages is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1010 | POST /whatsapp-api/chats/:chatId/presence is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1023 | GET /whatsapp-api/backlog/report is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1039 | GET /whatsapp-api/catalog/contacts is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1049 | GET /whatsapp-api/catalog/ranking is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1066 | POST /whatsapp-api/catalog/refresh is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1074 | POST /whatsapp-api/catalog/score is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1084 | POST /whatsapp-api/backlog/rebuild is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1092 | POST /whatsapp-api/session/recreate-if-invalid is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1109 | POST /whatsapp-api/send/:phone is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1142 | GET /whatsapp-api/check/:phone is not called by any frontend code |
| INFO | backend/src/whatsapp/controllers/whatsapp-api.controller.ts:1172 | GET /whatsapp-api/provider-status is not called by any frontend code |
| INFO | backend/src/whatsapp/whatsapp.controller.ts:65 | POST /whatsapp/:workspaceId/incoming is not called by any frontend code |

---

## CORRECTION PROMPT

Copy and paste the following into Claude Code to fix all critical and warning issues:

```
Fix the following codebase connectivity issues found by PULSE:

## Orphaned Prisma models
These models exist in schema but no service/controller accesses them:
1. **backend/prisma/schema.prisma:295** — Model ContactInsight has no service or controller accessing it
2. **backend/prisma/schema.prisma:337** — Model Variable has no service or controller accessing it
3. **backend/prisma/schema.prisma:583** — Model Vector has no service or controller accessing it
4. **backend/prisma/schema.prisma:596** — Model Integration has no service or controller accessing it
5. **backend/prisma/schema.prisma:611** — Model MonitoredGroup has no service or controller accessing it
6. **backend/prisma/schema.prisma:631** — Model GroupMember has no service or controller accessing it
7. **backend/prisma/schema.prisma:643** — Model BannedKeyword has no service or controller accessing it
8. **backend/prisma/schema.prisma:685** — Model ExternalPaymentLink has no service or controller accessing it
9. **backend/prisma/schema.prisma:1028** — Model AutonomyRun has no service or controller accessing it
10. **backend/prisma/schema.prisma:1042** — Model AutonomyExecution has no service or controller accessing it
11. **backend/prisma/schema.prisma:1066** — Model AgentWorkItem has no service or controller accessing it
12. **backend/prisma/schema.prisma:1097** — Model ApprovalRequest has no service or controller accessing it
13. **backend/prisma/schema.prisma:1118** — Model InputCollectionSession has no service or controller accessing it
14. **backend/prisma/schema.prisma:1137** — Model AccountProofSnapshot has no service or controller accessing it
15. **backend/prisma/schema.prisma:1165** — Model ConversationProofSnapshot has no service or controller accessing it
16. **backend/prisma/schema.prisma:1206** — Model WebhookEvent has no service or controller accessing it
17. **backend/prisma/schema.prisma:1234** — Model Persona has no service or controller accessing it
18. **backend/prisma/schema.prisma:1417** — Model KloelConversation has no service or controller accessing it
19. **backend/prisma/schema.prisma:1436** — Model ChatThread has no service or controller accessing it
20. **backend/prisma/schema.prisma:1447** — Model ChatMessage has no service or controller accessing it
21. **backend/prisma/schema.prisma:1620** — Model ProductCheckout has no service or controller accessing it
22. **backend/prisma/schema.prisma:1676** — Model ProductCommission has no service or controller accessing it
23. **backend/prisma/schema.prisma:1720** — Model ProductCampaign has no service or controller accessing it
24. **backend/prisma/schema.prisma:1772** — Model MemberArea has no service or controller accessing it
25. **backend/prisma/schema.prisma:1807** — Model MemberEnrollment has no service or controller accessing it
26. **backend/prisma/schema.prisma:1826** — Model MemberModule has no service or controller accessing it
27. **backend/prisma/schema.prisma:1843** — Model MemberLesson has no service or controller accessing it
28. **backend/prisma/schema.prisma:1868** — Model AffiliateProduct has no service or controller accessing it
29. **backend/prisma/schema.prisma:1893** — Model AffiliateRequest has no service or controller accessing it
30. **backend/prisma/schema.prisma:1907** — Model AffiliateLink has no service or controller accessing it
31. **backend/prisma/schema.prisma:1926** — Model KloelSite has no service or controller accessing it
32. **backend/prisma/schema.prisma:1945** — Model KloelDesign has no service or controller accessing it
33. **backend/prisma/schema.prisma:2059** — Model Payment has no service or controller accessing it
34. **backend/prisma/schema.prisma:2164** — Model WalletAnticipation has no service or controller accessing it
35. **backend/prisma/schema.prisma:2614** — Model Webinar has no service or controller accessing it
36. **backend/prisma/schema.prisma:2629** — Model MetaConnection has no service or controller accessing it

```